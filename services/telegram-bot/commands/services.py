"""
/services command handler
Lists all Docker services with their status
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from .utils import get_docker_services, get_status_emoji, escape_markdown

logger = logging.getLogger('telegram-bot.commands.services')


async def cmd_services(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /services command - list all Docker services with status.
    """
    logger.info(f"/services command from user {update.effective_user.id}")

    try:
        services = await get_docker_services()

        if not services:
            await update.message.reply_text(
                "\u26A0\uFE0F No Docker services found\\.\n\n"
                "_Is Docker running?_",
                parse_mode=ParseMode.MARKDOWN_V2
            )
            return

        # Sort: running first, then by name
        services.sort(key=lambda s: (s['state'] != 'running', s['name']))

        message = f"\U0001F4E6 *Services* \\({len(services)}\\)\n\n"

        for svc in services:
            emoji = get_status_emoji(svc['state'], svc['health'])
            name = escape_markdown(svc['name'])
            health_info = f" \\({escape_markdown(svc['health'])}\\)" if svc['health'] != 'N/A' else ''
            message += f"{emoji} `{name}`{health_info}\n"

        message += f"\n_Use_ `/logs <service>` _for details_"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/services failed: {e}")
        await update.message.reply_text(
            f"\u274C Error: {escape_markdown(str(e))}",
            parse_mode=ParseMode.MARKDOWN_V2
        )
