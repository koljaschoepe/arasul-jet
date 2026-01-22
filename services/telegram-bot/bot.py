#!/usr/bin/env python3
"""
ARASUL PLATFORM - Telegram Bot Service
System notifications and command interface via Telegram
"""

import os
import sys
import asyncio
import logging
import signal
from datetime import datetime
from typing import Optional

from telegram import Update, Bot
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters
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
    """Telegram Bot for Arasul Platform notifications and commands."""

    def __init__(self):
        self.application: Optional[Application] = None
        self.allowed_users = Config.get_allowed_user_ids()
        self._running = False

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

        await update.message.reply_text(
            f"Hello {user.first_name}!\n\n"
            "I'm the Arasul Platform Bot.\n\n"
            "Available commands:\n"
            "/status - System status overview\n"
            "/health - Service health check\n"
            "/metrics - Current system metrics\n"
            "/help - Show this help message\n\n"
            f"Your User ID: `{user.id}`",
            parse_mode=ParseMode.MARKDOWN
        )
        update_health(message_sent=True)

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        help_text = """
*Arasul Platform Bot Commands*

*System Commands:*
/status - System status overview
/fullstatus - Detailed status with progress bars
/health - All services health status
/metrics - Current CPU, RAM, GPU, Disk metrics
/disk - Disk usage for all volumes
/services - List all Docker services
/logs <service> - Show logs for a service

*Information:*
/help - Show this help message
/info - Bot and system information

*Notifications:*
The bot will automatically notify you about:
- System startup/shutdown
- Critical errors
- Resource warnings (high CPU, RAM, Disk)
- Service failures

_Note: Some commands may require backend connectivity._
"""
        await update.message.reply_text(help_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command - basic system status."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)
        logger.info(f"/status command from user {update.effective_user.id}")

        # Get basic status
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        status_text = f"""
*Arasul Platform Status*

Time: `{now}`
Bot Status: Online
Backend: `{Config.DASHBOARD_BACKEND_URL}`

_Use /health for detailed service status_
_Use /metrics for system metrics_
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

                    # Format metrics
                    cpu = data.get('cpu_percent', 0)
                    ram = data.get('ram_percent', 0)
                    gpu = data.get('gpu_percent', 0)
                    disk = data.get('disk_percent', 0)
                    temp = data.get('temperature', 0)

                    # Status indicators
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
*Arasul Telegram Bot*

Version: `1.0.0`
Service Port: `{Config.SERVICE_PORT}`
Webhook Mode: `{Config.TELEGRAM_WEBHOOK_ENABLED}`
Backend: `{Config.DASHBOARD_BACKEND_URL}`

Your User ID: `{update.effective_user.id}`
"""
        await update.message.reply_text(info_text, parse_mode=ParseMode.MARKDOWN)
        update_health(message_sent=True)

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle non-command messages."""
        if not await self._check_permission(update):
            return

        update_health(message_received=True)

        await update.message.reply_text(
            "I only respond to commands. Use /help to see available commands."
        )
        update_health(message_sent=True)

    async def error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle errors."""
        logger.error(f"Update {update} caused error {context.error}")
        update_health(error=True)

    async def post_init(self, application: Application):
        """Post-initialization hook - send startup notification."""
        update_health(bot_running=True)

        if Config.NOTIFY_ON_STARTUP and Config.TELEGRAM_CHAT_ID:
            try:
                await application.bot.send_message(
                    chat_id=Config.TELEGRAM_CHAT_ID,
                    text="Arasul Telegram Bot started successfully.",
                    parse_mode=ParseMode.MARKDOWN
                )
                logger.info("Startup notification sent")
                update_health(message_sent=True)
            except Exception as e:
                logger.warning(f"Failed to send startup notification: {e}")

    def build_application(self) -> Application:
        """Build the telegram application."""
        logger.info("Building Telegram application...")
        Config.log_config()

        # Build application
        builder = Application.builder().token(Config.TELEGRAM_BOT_TOKEN)

        # Add post_init callback
        builder.post_init(self.post_init)

        application = builder.build()

        # Add handlers
        application.add_handler(CommandHandler("start", self.cmd_start))
        application.add_handler(CommandHandler("help", self.cmd_help))
        application.add_handler(CommandHandler("status", self.cmd_status))
        application.add_handler(CommandHandler("health", self.cmd_health))
        application.add_handler(CommandHandler("metrics", self.cmd_metrics))
        application.add_handler(CommandHandler("info", self.cmd_info))

        # Extended commands from commands module
        application.add_handler(CommandHandler("disk", cmd_disk))
        application.add_handler(CommandHandler("services", cmd_services))
        application.add_handler(CommandHandler("logs", cmd_logs))
        application.add_handler(CommandHandler("fullstatus", cmd_status_detailed))

        # Handle non-command messages
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))

        # Error handler
        application.add_error_handler(self.error_handler)

        self.application = application
        return application

    def run(self):
        """Run the bot (polling mode)."""
        logger.info("Starting Arasul Telegram Bot...")

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
    logger.info("ARASUL TELEGRAM BOT SERVICE")
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
