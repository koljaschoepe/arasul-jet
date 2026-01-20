"""
/disk command handler
Shows disk usage for all mounted filesystems
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from .utils import get_disk_usage, progress_bar, escape_markdown

logger = logging.getLogger('telegram-bot.commands.disk')


async def cmd_disk(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /disk command - show disk usage for all volumes.
    """
    logger.info(f"/disk command from user {update.effective_user.id}")

    try:
        disks = await get_disk_usage()

        if not disks:
            await update.message.reply_text(
                "\u26A0\uFE0F No disk information available",
                parse_mode=ParseMode.MARKDOWN_V2
            )
            return

        message = f"\U0001F4BE *Disk Usage*\n\n"

        for disk in disks:
            pct = disk['percent']
            # Status emoji based on usage
            if pct >= 90:
                emoji = "\U0001F534"  # Red circle
            elif pct >= 80:
                emoji = "\U0001F7E1"  # Yellow circle
            else:
                emoji = "\U0001F7E2"  # Green circle

            mount = escape_markdown(disk['mount'])
            size = escape_markdown(disk['size'])
            used = escape_markdown(disk['used'])
            avail = escape_markdown(disk['avail'])

            message += f"{emoji} `{mount}`\n"
            message += f"   `{progress_bar(pct)}` {pct}%\n"
            message += f"   {used} / {size} \\({avail} free\\)\n\n"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/disk failed: {e}")
        await update.message.reply_text(
            f"\u274C Error: {escape_markdown(str(e))}",
            parse_mode=ParseMode.MARKDOWN_V2
        )
