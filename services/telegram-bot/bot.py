#!/usr/bin/env python3
"""
ARASUL PLATFORM - Telegram Bot Service 2.0
LLM-powered digital assistant with system notifications
"""

import os
import sys
import asyncio
import logging
from datetime import datetime
from typing import Optional

from telegram import Update, Bot
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from telegram.constants import ParseMode

# Local imports
from config import Config, mask_token
from health import start_health_server_thread, update_health

# Command handlers from commands module
from commands.disk import cmd_disk
from commands.services import cmd_services
from commands.logs import cmd_logs
from commands.status import cmd_status as cmd_status_detailed
from commands.llm import cmd_new, cmd_model, cmd_context

# LLM handler
from handlers.llm import handle_llm_message

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('telegram-bot')

# Reduce noise from HTTP libraries
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)


class ArasulTelegramBot:
    """Telegram Bot 2.0 for Arasul Platform - LLM-powered assistant."""

    def __init__(self):
        self.application: Optional[Application] = None
        self.allowed_users = Config.get_allowed_user_ids()
        self._running = False
        self._session_manager = None

    def _is_user_allowed(self, user_id: int) -> bool:
        """Check if user is allowed to use the bot."""
        # If no allowed users configured, allow all
        if not self.allowed_users:
            return True
        return user_id in self.allowed_users

    async def _check_permission(self, update: Update) -> bool:
        """Check user permission and send denial message if not allowed."""
        user_id = update.effective_user.id
        if not self._is_user_allowed(user_id):
            logger.warning(f"Unauthorized access attempt from user {user_id}")
            await update.message.reply_text(
                "Access denied. Your user ID is not in the allowed list."
            )
            return False
        return True

    # --- Command Handlers ---

    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        user = update.effective_user
        logger.info(f"/start command from user {user.id} ({user.username})")

        # Check LLM status
        llm_status = "aktiviert" if Config.LLM_ENABLED else "deaktiviert"
        voice_status = "aktiviert" if Config.VOICE_ENABLED else "deaktiviert"

        await update.message.reply_text(
            f"Hallo {user.first_name}!\n\n"
            "Ich bin der *Arasul-Assistent* - dein KI-gestützter Helfer für die Arasul Edge AI Platform.\n\n"
            "*Chat-Modus:*\n"
            "Du kannst mir einfach Nachrichten schreiben und ich antworte mit Hilfe von KI.\n\n"
            "*System-Befehle:*\n"
            "/status - System-Übersicht\n"
            "/services - Docker-Container\n"
            "/disk - Festplattennutzung\n"
            "/logs <service> - Service-Logs\n\n"
            "*Chat-Befehle:*\n"
            "/new - Neue Konversation starten\n"
            "/model - LLM-Provider/Model wechseln\n"
            "/context - Kontext-Nutzung anzeigen\n"
            "/help - Alle Befehle\n\n"
            f"*Status:*\n"
            f"LLM-Chat: {llm_status}\n"
            f"Sprachnachrichten: {voice_status}\n\n"
            f"_Deine User-ID:_ `{user.id}`",
            parse_mode=ParseMode.MARKDOWN
        )
        update_health(message_sent=True)

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        help_text = """
*Arasul-Assistent - Befehle*

*Chat & KI:*
Sende einfach eine Nachricht, um mit der KI zu chatten.

/new - Konversation zurücksetzen
/model - LLM-Provider/Model anzeigen/wechseln
/model list - Verfügbare Modelle
/model ollama <name> - Zu Ollama wechseln
/model claude - Zu Claude wechseln
/context - Kontext-Nutzung anzeigen
/apikey - API-Keys verwalten

*System:*
/status - System-Übersicht
/fullstatus - Detaillierter Status
/health - Service-Gesundheit
/metrics - Live-Metriken
/disk - Festplatten-Nutzung
/services - Docker-Container
/logs <service> - Service-Logs

*Info:*
/help - Diese Hilfe
/info - Bot-Informationen

*Automatische Benachrichtigungen:*
• System-Starts und -Fehler
• Ressourcen-Warnungen (CPU, RAM, Disk)
• Service-Ausfälle
"""
        await update.message.reply_text(help_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command - basic system status."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        logger.info(f"/status command from user {update.effective_user.id}")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Get LLM provider status
        provider = Config.DEFAULT_LLM_PROVIDER
        try:
            from providers import get_provider
            prov = get_provider(provider)
            llm_healthy = await prov.health_check()
            llm_status = "online" if llm_healthy else "offline"
        except Exception:
            llm_status = "unbekannt"

        status_text = f"""
*Arasul Platform Status*

Zeit: `{now}`
Bot Status: Online
LLM Provider: `{provider}` ({llm_status})
Backend: `{Config.DASHBOARD_BACKEND_URL}`

_Nutze /health für Service-Details_
_Nutze /metrics für System-Metriken_
"""
        await update.message.reply_text(status_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def cmd_health(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /health command - service health overview."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        logger.info(f"/health command from user {update.effective_user.id}")

        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{Config.DASHBOARD_BACKEND_URL}/api/health")
                if response.status_code == 200:
                    data = response.json()
                    health_text = f"""
*Service Health*

Backend: `{data.get('status', 'unknown')}`
Database: `{data.get('database', 'unknown')}`
Uptime: `{data.get('uptime', 'unknown')}`

_Backend responded successfully_
"""
                else:
                    health_text = f"Backend returned status {response.status_code}"
        except Exception as e:
            logger.error(f"Failed to fetch health: {e}")
            health_text = f"Failed to connect to backend: {type(e).__name__}"
            update_health(error=True)

        await update.message.reply_text(health_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def cmd_metrics(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /metrics command - system metrics."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        logger.info(f"/metrics command from user {update.effective_user.id}")

        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{Config.DASHBOARD_BACKEND_URL}/api/metrics/live")
                if response.status_code == 200:
                    data = response.json()

                    cpu = data.get('cpu_percent', 0)
                    ram = data.get('ram_percent', 0)
                    gpu = data.get('gpu_percent', 0)
                    disk = data.get('disk_percent', 0)
                    temp = data.get('temperature', 0)

                    def indicator(val, warn=70, crit=90):
                        if val >= crit:
                            return "🔴"
                        elif val >= warn:
                            return "🟡"
                        return "🟢"

                    metrics_text = f"""
*System Metrics*

{indicator(cpu)} CPU: `{cpu:.1f}%`
{indicator(ram)} RAM: `{ram:.1f}%`
{indicator(gpu, 80, 95)} GPU: `{gpu:.1f}%`
{indicator(disk, 80, 95)} Disk: `{disk:.1f}%`
{indicator(temp, 70, 85)} Temp: `{temp:.1f}°C`

_Updated: {datetime.now().strftime('%H:%M:%S')}_
"""
                else:
                    metrics_text = f"Backend returned status {response.status_code}"
        except Exception as e:
            logger.error(f"Failed to fetch metrics: {e}")
            metrics_text = f"Failed to connect to backend: {type(e).__name__}"
            update_health(error=True)

        await update.message.reply_text(metrics_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def cmd_info(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /info command - bot information."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)

        info_text = f"""
*Arasul Telegram Bot 2.0*

Version: `2.0.0`
Service Port: `{Config.SERVICE_PORT}`
Webhook Mode: `{Config.TELEGRAM_WEBHOOK_ENABLED}`
Backend: `{Config.DASHBOARD_BACKEND_URL}`

*LLM Configuration:*
LLM Enabled: `{Config.LLM_ENABLED}`
Default Provider: `{Config.DEFAULT_LLM_PROVIDER}`
Voice Enabled: `{Config.VOICE_ENABLED}`
Max Context: `{Config.MAX_CONTEXT_TOKENS}` tokens

Your User ID: `{update.effective_user.id}`
"""
        await update.message.reply_text(info_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle non-command text messages - route to LLM."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)

        if Config.LLM_ENABLED:
            # Route to LLM handler
            await handle_llm_message(update, context)
        else:
            await update.message.reply_text(
                "LLM-Chat ist derzeit deaktiviert.\n"
                "Nutze /help um verfügbare Befehle zu sehen."
            )

        update_health(message_sent=True)

    async def handle_voice(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle voice messages."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)

        if Config.VOICE_ENABLED:
            try:
                from handlers.voice import handle_voice_message
                await handle_voice_message(update, context)
            except ImportError:
                await update.message.reply_text(
                    "Sprachnachrichten-Verarbeitung ist noch nicht implementiert."
                )
        else:
            await update.message.reply_text(
                "Sprachnachrichten sind deaktiviert.\n"
                "Bitte sende mir Text-Nachrichten."
            )

        update_health(message_sent=True)

    async def error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle errors."""
        logger.error(f"Update {update} caused error {context.error}")
        update_health(error=True)

    async def post_init(self, application: Application):
        """Post-initialization hook - initialize session manager and send startup notification."""
        update_health(bot_running=True)

        # Initialize session manager
        if Config.LLM_ENABLED:
            try:
                from session.manager import initialize_session_manager
                self._session_manager = await initialize_session_manager()
                logger.info("Session manager initialized")
            except Exception as e:
                logger.error(f"Failed to initialize session manager: {e}")

        # Send startup notification
        if Config.NOTIFY_ON_STARTUP and Config.TELEGRAM_CHAT_ID:
            try:
                await application.bot.send_message(
                    chat_id=Config.TELEGRAM_CHAT_ID,
                    text="*Arasul Bot 2.0 gestartet*\n\nLLM-Chat ist bereit.",
                    parse_mode=ParseMode.MARKDOWN
                )
                logger.info("Startup notification sent")
                update_health(message_sent=True)
            except Exception as e:
                logger.warning(f"Failed to send startup notification: {e}")

    async def post_shutdown(self, application: Application):
        """Cleanup on shutdown."""
        # Close session manager
        if self._session_manager:
            try:
                await self._session_manager.close()
                logger.info("Session manager closed")
            except Exception as e:
                logger.error(f"Error closing session manager: {e}")

        # Close provider connections
        try:
            from providers import ProviderRegistry
            await ProviderRegistry.close_all()
            logger.info("Providers closed")
        except Exception as e:
            logger.error(f"Error closing providers: {e}")

    def build_application(self) -> Application:
        """Build the telegram application."""
        logger.info("Building Telegram application...")
        Config.log_config()

        # Build application
        builder = Application.builder().token(Config.TELEGRAM_BOT_TOKEN)

        # Add callbacks
        builder.post_init(self.post_init)
        builder.post_shutdown(self.post_shutdown)

        application = builder.build()

        # --- Core Commands ---
        application.add_handler(CommandHandler("start", self.cmd_start))
        application.add_handler(CommandHandler("help", self.cmd_help))
        application.add_handler(CommandHandler("status", self.cmd_status))
        application.add_handler(CommandHandler("health", self.cmd_health))
        application.add_handler(CommandHandler("metrics", self.cmd_metrics))
        application.add_handler(CommandHandler("info", self.cmd_info))

        # --- System Commands (from commands module) ---
        application.add_handler(CommandHandler("disk", cmd_disk))
        application.add_handler(CommandHandler("services", cmd_services))
        application.add_handler(CommandHandler("logs", cmd_logs))
        application.add_handler(CommandHandler("fullstatus", cmd_status_detailed))

        # --- LLM Commands ---
        application.add_handler(CommandHandler("new", cmd_new))
        application.add_handler(CommandHandler("model", cmd_model))
        application.add_handler(CommandHandler("context", cmd_context))

        # --- API Key Command (will be added in Phase 5) ---
        try:
            from commands.apikey import cmd_apikey
            application.add_handler(CommandHandler("apikey", cmd_apikey))
        except ImportError:
            logger.debug("API key command not yet available")

        # --- Message Handlers ---
        # Handle text messages (route to LLM)
        application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message)
        )

        # Handle voice messages
        application.add_handler(
            MessageHandler(filters.VOICE, self.handle_voice)
        )

        # Error handler
        application.add_error_handler(self.error_handler)

        self.application = application
        return application

    def run(self):
        """Run the bot (polling mode)."""
        logger.info("Starting Arasul Telegram Bot 2.0...")

        # Start health server in background
        start_health_server_thread(Config.SERVICE_PORT)

        # Build and run application
        application = self.build_application()

        self._running = True
        update_health(bot_running=True)

        logger.info("Bot is now polling for updates...")

        # Run polling (blocking)
        application.run_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=True
        )


def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("ARASUL TELEGRAM BOT SERVICE 2.0")
    logger.info("=" * 60)

    try:
        bot = ArasulTelegramBot()
        bot.run()
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        update_health(error=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
