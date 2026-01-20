"""
/help command handler
Shows all available commands with descriptions
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

logger = logging.getLogger('telegram-bot.commands.help')

# Command registry with descriptions
COMMANDS = {
    'start': ('Bot aktivieren', None),
    'status': ('System-Ubersicht (CPU, RAM, Disk, GPU, Services)', None),
    'services': ('Liste aller Docker Services mit Status', None),
    'logs': ('Log-Zeilen eines Services anzeigen', '<service> [lines]'),
    'workflows': ('n8n Workflows auflisten', None),
    'disk': ('Speicher-Details aller Volumes', None),
    'help': ('Diese Hilfe anzeigen', None),
}


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /help command - show all available commands.
    """
    logger.info(f"/help command from user {update.effective_user.id}")

    try:
        message = "\U0001F916 *Arasul Bot \\- Help*\n\n"
        message += "*Available Commands:*\n\n"

        for cmd, (desc, usage) in COMMANDS.items():
            usage_str = f" `{usage}`" if usage else ""
            message += f"/{cmd}{usage_str}\n"
            message += f"   {desc}\n\n"

        message += "\u2500" * 20 + "\n"
        message += "_Arasul Platform v1\\.0_"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/help failed: {e}")
        # Fallback to plain text
        await update.message.reply_text(
            "Available commands:\n"
            "/status - System overview\n"
            "/services - Docker service list\n"
            "/logs <service> - Service logs\n"
            "/workflows - n8n workflows\n"
            "/disk - Disk usage\n"
            "/help - This help"
        )
