"""
ARASUL PLATFORM - Voice Message Handler
Transcribes voice messages and processes through LLM
"""

import logging
import os
import tempfile
from typing import Optional, Tuple
from pathlib import Path

from telegram import Update, Voice
from telegram.ext import ContextTypes
from telegram.constants import ChatAction

from config import Config
from .llm import get_llm_handler
from .errors import handle_error

logger = logging.getLogger('telegram-bot.handlers.voice')


class VoiceHandler:
    """
    Handles voice message transcription.

    Pipeline:
    1. Download voice message (.ogg)
    2. Convert to WAV if needed
    3. Transcribe with Whisper (local or API)
    4. Route transcription to LLM handler
    """

    def __init__(self):
        self._whisper_model = None
        self._whisper_provider = Config.VOICE_PROVIDER

    async def handle_voice(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        """
        Handle incoming voice message.

        Args:
            update: Telegram update
            context: Bot context
        """
        if not update.message or not update.message.voice:
            return

        voice = update.message.voice
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id

        logger.info(
            f"Voice message from user {user_id}: "
            f"duration={voice.duration}s, size={voice.file_size}"
        )

        # Validate voice message
        if voice.duration > 120:  # 2 minutes max
            await update.message.reply_text(
                "Sprachnachricht zu lang (max. 2 Minuten)."
            )
            return

        # Show typing indicator
        await update.message.chat.send_action(ChatAction.TYPING)

        try:
            # Download voice file
            audio_path = await self._download_voice(voice, context)

            if not audio_path:
                await update.message.reply_text(
                    "Fehler beim Herunterladen der Sprachnachricht."
                )
                return

            try:
                # Transcribe
                await update.message.chat.send_action(ChatAction.TYPING)
                transcription = await self._transcribe(audio_path)

                if not transcription:
                    await update.message.reply_text(
                        "Konnte Sprachnachricht nicht transkribieren."
                    )
                    return

                # Show transcription
                await update.message.reply_text(
                    f"*Transkript:*\n_{transcription}_",
                    parse_mode='Markdown',
                )

                # Create a fake text message update for LLM processing
                # We reuse the same update but replace the text
                original_text = update.message.text
                update.message.text = transcription

                # Process through LLM
                llm_handler = get_llm_handler()
                await llm_handler.handle_message(update, context)

                # Restore original (for safety)
                update.message.text = original_text

            finally:
                # Cleanup temp file
                self._cleanup_file(audio_path)

        except Exception as e:
            logger.exception(f"Voice handling error: {e}")
            await handle_error(update, context, e)

    async def _download_voice(
        self,
        voice: Voice,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> Optional[Path]:
        """
        Download voice message to temp file.

        Args:
            voice: Telegram Voice object
            context: Bot context

        Returns:
            Path to downloaded file or None
        """
        try:
            # Get file info from Telegram
            file = await context.bot.get_file(voice.file_id)

            # Create temp file
            fd, temp_path = tempfile.mkstemp(suffix='.ogg')
            os.close(fd)

            # Download
            await file.download_to_drive(temp_path)

            logger.debug(f"Downloaded voice to: {temp_path}")
            return Path(temp_path)

        except Exception as e:
            logger.error(f"Failed to download voice: {e}")
            return None

    async def _transcribe(self, audio_path: Path) -> Optional[str]:
        """
        Transcribe audio file using configured provider.

        Args:
            audio_path: Path to audio file

        Returns:
            Transcription text or None
        """
        if self._whisper_provider == 'api':
            return await self._transcribe_api(audio_path)
        else:
            return await self._transcribe_local(audio_path)

    async def _transcribe_local(self, audio_path: Path) -> Optional[str]:
        """
        Transcribe using local Whisper model.

        Args:
            audio_path: Path to audio file

        Returns:
            Transcription text or None
        """
        try:
            import whisper

            # Load model on first use
            if self._whisper_model is None:
                logger.info(f"Loading Whisper model: {Config.WHISPER_MODEL}")
                self._whisper_model = whisper.load_model(Config.WHISPER_MODEL)

            # Transcribe
            result = self._whisper_model.transcribe(
                str(audio_path),
                language='de',  # German priority
                task='transcribe',
            )

            transcription = result.get('text', '').strip()
            logger.info(f"Local transcription: {len(transcription)} chars")
            return transcription

        except ImportError:
            logger.error("Whisper not installed. Run: pip install openai-whisper")
            return None
        except Exception as e:
            logger.error(f"Local transcription failed: {e}")
            return None

    async def _transcribe_api(self, audio_path: Path) -> Optional[str]:
        """
        Transcribe using OpenAI Whisper API.

        Args:
            audio_path: Path to audio file

        Returns:
            Transcription text or None
        """
        try:
            from openai import OpenAI

            # Get API key
            api_key = os.getenv('OPENAI_API_KEY')
            if not api_key:
                logger.error("OPENAI_API_KEY not set for Whisper API")
                return None

            client = OpenAI(api_key=api_key)

            with open(audio_path, 'rb') as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="de",
                )

            transcription = transcript.text.strip()
            logger.info(f"API transcription: {len(transcription)} chars")
            return transcription

        except ImportError:
            logger.error("OpenAI SDK not installed. Run: pip install openai")
            return None
        except Exception as e:
            logger.error(f"API transcription failed: {e}")
            return None

    def _cleanup_file(self, path: Path) -> None:
        """
        Delete temporary file.

        Args:
            path: File path to delete
        """
        try:
            if path and path.exists():
                path.unlink()
                logger.debug(f"Cleaned up: {path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup {path}: {e}")


# Global handler instance
_voice_handler: Optional[VoiceHandler] = None


def get_voice_handler() -> VoiceHandler:
    """Get the global voice handler instance."""
    global _voice_handler
    if _voice_handler is None:
        _voice_handler = VoiceHandler()
    return _voice_handler


async def handle_voice_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """
    Convenience function for voice message handling.

    Args:
        update: Telegram update
        context: Bot context
    """
    handler = get_voice_handler()
    await handler.handle_voice(update, context)
