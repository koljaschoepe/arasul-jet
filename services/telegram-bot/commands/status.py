"""
/status command handler
Shows system overview: CPU, RAM, Disk, GPU, Services count
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from .utils import (
    get_system_metrics,
    get_docker_services,
    get_disk_usage,
    progress_bar,
    escape_markdown
)

logger = logging.getLogger('telegram-bot.commands.status')


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /status command - comprehensive system overview.
    Shows CPU, RAM, Disk, GPU metrics and service count.
    """
    logger.info(f"/status command from user {update.effective_user.id}")

    try:
        # Fetch all data concurrently
        import asyncio
        metrics, services, disks = await asyncio.gather(
            get_system_metrics(),
            get_docker_services(),
            get_disk_usage()
        )

        # Count services
        online_count = sum(1 for s in services if s['state'] == 'running')
        total_count = len(services) if services else 10  # Default expected

        # Main disk (root or first available)
        main_disk = next((d for d in disks if d['mount'] == '/'), disks[0] if disks else {'percent': 0})

        # Build message
        cpu = metrics.get('cpu', 0)
        ram = metrics.get('ram_percent', 0)
        ram_used = metrics.get('ram_used', '?')
        ram_total = metrics.get('ram_total', '?')
        gpu_temp = metrics.get('gpu_temp')
        disk_pct = main_disk.get('percent', 0)

        message = f"\U0001F4CA *System Status*\n\n"
        message += f"CPU:  `{progress_bar(cpu)}` {cpu}%\n"
        message += f"RAM:  `{progress_bar(ram)}` {ram}% \\({escape_markdown(ram_used)}/{escape_markdown(ram_total)}\\)\n"
        message += f"Disk: `{progress_bar(disk_pct)}` {disk_pct}%\n"

        if gpu_temp is not None:
            temp_pct = min(gpu_temp, 100)  # Cap at 100 for bar
            message += f"GPU:  `{progress_bar(temp_pct)}` {gpu_temp}\u00B0C\n"

        message += f"\n"

        if online_count == total_count:
            message += f"Services: {online_count}/{total_count} online \u2705\n"
        else:
            message += f"Services: {online_count}/{total_count} online \u26A0\uFE0F\n"

        message += f"\n_Use /services for details_\n"
        message += f"_Use /disk for storage info_"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/status failed: {e}")
        await update.message.reply_text(
            f"\u274C Error fetching status: {escape_markdown(str(e))}",
            parse_mode=ParseMode.MARKDOWN_V2
        )
