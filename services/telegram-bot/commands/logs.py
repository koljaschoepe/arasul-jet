"""
/logs <service> [lines] command handler
Shows last N log lines for a specific service
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from .utils import get_service_logs, get_service_names, escape_markdown, truncate_text

logger = logging.getLogger('telegram-bot.commands.logs')

DEFAULT_LINES = 50
MAX_LINES = 200


async def cmd_logs(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /logs <service> [lines] command.
    Shows last N log lines for a Docker service.
    """
    logger.info(f"/logs command from user {update.effective_user.id}")

    try:
        args = context.args or []

        if not args:
            # Show available services
            services = await get_service_names()
            if services:
                service_list = '\n'.join(f'`{escape_markdown(s)}`' for s in services)
                message = (
                    f"\u2753 *Usage:* `/logs <service> [lines]`\n\n"
                    f"*Available services:*\n{service_list}"
                )
            else:
                message = (
                    f"\u2753 *Usage:* `/logs <service> [lines]`\n\n"
                    f"_No services found_"
                )
            await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)
            return

        service_name = args[0]
        lines = DEFAULT_LINES

        if len(args) > 1:
            try:
                lines = min(int(args[1]), MAX_LINES)
            except ValueError:
                pass

        # Send typing indicator
        await update.message.chat.send_action('typing')

        # Get logs
        logs = await get_service_logs(service_name, lines)

        # Truncate if too long (Telegram limit ~4096 chars)
        truncated = len(logs) > 3500
        logs = truncate_text(logs, 3500)

        # Build message
        escaped_name = escape_markdown(service_name)
        escaped_logs = escape_markdown(logs)

        message = f"\U0001F4DC *Logs:* `{escaped_name}`\n"
        if truncated:
            message += f"_\\(truncated to last portion\\)_\n"
        message += f"\n```\n{escaped_logs}\n```"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/logs failed: {e}")
        await update.message.reply_text(
            f"\u274C Error: {escape_markdown(str(e))}",
            parse_mode=ParseMode.MARKDOWN_V2
        )
