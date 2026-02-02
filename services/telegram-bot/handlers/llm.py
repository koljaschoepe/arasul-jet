"""
ARASUL PLATFORM - LLM Message Handler
Processes text messages through LLM providers
"""

import logging
import asyncio
from typing import Optional, List
from datetime import datetime

from telegram import Update, Message
from telegram.ext import ContextTypes
from telegram.constants import ParseMode, ChatAction

from config import Config
from providers import get_provider, ProviderError
from providers.base import Message as LLMMessage, ChatResponse
from session.manager import get_session_manager, Session
from session.memory import StoredMessage
from .errors import handle_error, send_typing_action

logger = logging.getLogger('telegram-bot.handlers.llm')

# System prompt for the assistant
SYSTEM_PROMPT = """Du bist der Arasul-Assistent, ein hilfreicher KI-Assistent für die Arasul Edge AI Platform.

Du hilfst dem Admin bei:
- System-Überwachung und Status-Abfragen
- Troubleshooting und Problemlösung
- Allgemeine Fragen zu KI, Technologie und dem System

Antworte auf Deutsch, es sei denn der Nutzer schreibt auf Englisch.
Halte deine Antworten präzise und hilfreich.
Wenn du dir bei etwas nicht sicher bist, sage es ehrlich.

Verfügbare Befehle für Systemoperationen:
- /status - System-Metriken (CPU, RAM, GPU, Disk)
- /services - Docker-Container Status
- /logs <service> - Service-Logs anzeigen
- /disk - Disk-Nutzung
- /workflows - n8n Workflows
"""


class LLMHandler:
    """
    Handles LLM message processing.

    Features:
    - Message processing with context
    - Streaming responses
    - Typing indicator during processing
    """

    def __init__(self):
        self._session_manager = None
        self._typing_task: Optional[asyncio.Task] = None

    @property
    def session_manager(self):
        """Get session manager (lazy initialization)."""
        if self._session_manager is None:
            self._session_manager = get_session_manager()
        return self._session_manager

    async def handle_message(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        """
        Handle incoming text message.

        Args:
            update: Telegram update
            context: Bot context
        """
        if not update.message or not update.message.text:
            return

        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        user_text = update.message.text.strip()

        if not user_text:
            return

        logger.info(f"LLM message from user {user_id}: {user_text[:50]}...")

        try:
            # Get or create session
            session = await self.session_manager.get_session(chat_id, user_id)

            # Add user message to history
            await self.session_manager.add_message(chat_id, 'user', user_text)

            # Get context messages
            context_messages = await self.session_manager.get_context_messages(
                chat_id,
                SYSTEM_PROMPT,
            )

            # Build messages for LLM
            llm_messages = self._build_llm_messages(context_messages)

            # Get provider
            provider = get_provider(session.provider)

            # Set API key for Claude if available
            if session.provider == 'claude':
                api_key = await self._get_api_key(user_id, 'claude')
                if api_key:
                    provider.set_api_key(api_key)

            # Start typing indicator
            typing_task = asyncio.create_task(
                self._keep_typing(update.message.chat)
            )

            try:
                # Get response (streaming or sync)
                if Config.LLM_ENABLED:
                    response = await self._get_llm_response(
                        provider,
                        llm_messages,
                        session.model,
                        update.message,
                    )
                else:
                    response = "LLM-Chat ist derzeit deaktiviert."

            finally:
                # Stop typing indicator
                typing_task.cancel()
                try:
                    await typing_task
                except asyncio.CancelledError:
                    pass

            # Add assistant response to history
            if response:
                await self.session_manager.add_message(chat_id, 'assistant', response)

        except ProviderError as e:
            await handle_error(update, context, e)
        except Exception as e:
            logger.exception(f"Error processing LLM message: {e}")
            await handle_error(update, context, e)

    def _build_llm_messages(
        self,
        context_messages: List[StoredMessage],
    ) -> List[LLMMessage]:
        """
        Build LLM message list from stored messages.

        Args:
            context_messages: Messages from session history

        Returns:
            List of LLMMessage objects
        """
        messages = [LLMMessage(role='system', content=SYSTEM_PROMPT)]

        for msg in context_messages:
            messages.append(LLMMessage(role=msg.role, content=msg.content))

        return messages

    async def _get_llm_response(
        self,
        provider,
        messages: List[LLMMessage],
        model: Optional[str],
        reply_message: Message,
    ) -> str:
        """
        Get response from LLM provider.

        Uses streaming for long responses with message editing.

        Args:
            provider: LLM provider instance
            messages: Messages to send
            model: Model to use
            reply_message: Message to reply to

        Returns:
            Complete response text
        """
        # For shorter responses, use non-streaming
        response = await provider.chat(messages, model=model)

        # Send response
        await reply_message.reply_text(
            response.content,
            parse_mode=None,  # Plain text for safety
        )

        logger.info(
            f"LLM response: {len(response.content)} chars, "
            f"{response.total_tokens} tokens"
        )

        return response.content

    async def _stream_llm_response(
        self,
        provider,
        messages: List[LLMMessage],
        model: Optional[str],
        reply_message: Message,
    ) -> str:
        """
        Stream response from LLM with message updates.

        Updates the sent message as tokens arrive.

        Args:
            provider: LLM provider instance
            messages: Messages to send
            model: Model to use
            reply_message: Message to reply to

        Returns:
            Complete response text
        """
        # Send initial "thinking" message
        sent_message = await reply_message.reply_text("...")

        full_response = ""
        last_update = datetime.now()
        update_interval = 1.0  # Update every second

        try:
            async for token in provider.stream_chat(messages, model=model):
                full_response += token

                # Update message periodically (not every token)
                now = datetime.now()
                if (now - last_update).total_seconds() >= update_interval:
                    try:
                        await sent_message.edit_text(full_response)
                        last_update = now
                    except Exception:
                        pass  # Ignore edit errors

            # Final update with complete response
            if full_response:
                await sent_message.edit_text(full_response)

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            if full_response:
                await sent_message.edit_text(full_response)
            else:
                await sent_message.edit_text(f"Error: {str(e)}")

        return full_response

    async def _keep_typing(self, chat) -> None:
        """
        Keep sending typing action while processing.

        Args:
            chat: Telegram chat object
        """
        try:
            while True:
                await chat.send_action(ChatAction.TYPING)
                await asyncio.sleep(4)  # Typing indicator lasts ~5 seconds
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"Typing action error: {e}")

    async def _get_api_key(
        self,
        user_id: int,
        provider: str,
    ) -> Optional[str]:
        """
        Get decrypted API key for user/provider.

        Args:
            user_id: Telegram user ID
            provider: Provider name

        Returns:
            Decrypted API key or None
        """
        try:
            from security.crypto import decrypt_api_key
            return await decrypt_api_key(user_id, provider)
        except Exception as e:
            logger.debug(f"No API key found for {provider}: {e}")
            return None


# Global handler instance
_llm_handler: Optional[LLMHandler] = None


def get_llm_handler() -> LLMHandler:
    """Get the global LLM handler instance."""
    global _llm_handler
    if _llm_handler is None:
        _llm_handler = LLMHandler()
    return _llm_handler


async def handle_llm_message(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """
    Convenience function for message handling.

    Args:
        update: Telegram update
        context: Bot context
    """
    handler = get_llm_handler()
    await handler.handle_message(update, context)
