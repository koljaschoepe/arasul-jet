"""
/workflows command handler
Lists all n8n workflows with their status
"""

import logging
import os
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from .utils import escape_markdown

logger = logging.getLogger('telegram-bot.commands.workflows')

# n8n API configuration
N8N_API_URL = os.getenv('N8N_API_URL', 'http://n8n:5678')
N8N_API_KEY = os.getenv('N8N_API_KEY', '')


async def fetch_workflows() -> list:
    """Fetch workflows from n8n API."""
    import httpx

    headers = {'Accept': 'application/json'}
    if N8N_API_KEY:
        headers['X-N8N-API-KEY'] = N8N_API_KEY

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f'{N8N_API_URL}/api/v1/workflows', headers=headers)

        if response.status_code == 401:
            raise Exception('n8n API key required - set N8N_API_KEY')
        if response.status_code != 200:
            raise Exception(f'n8n API returned {response.status_code}')

        data = response.json()
        return data.get('data', data) if isinstance(data, dict) else data


async def cmd_workflows(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /workflows command - list all n8n workflows with status.
    """
    logger.info(f"/workflows command from user {update.effective_user.id}")

    try:
        # Send typing indicator
        await update.message.chat.send_action('typing')

        workflows = await fetch_workflows()

        if not workflows:
            message = (
                f"\U0001F4CB *n8n Workflows*\n\n"
                f"_No workflows found_\n\n"
                f"Make sure n8n is running: `/services`"
            )
            await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)
            return

        # Separate active and inactive
        active = [w for w in workflows if w.get('active')]
        inactive = [w for w in workflows if not w.get('active')]

        message = f"\U0001F4CB *n8n Workflows*\n\n"

        if active:
            message += "*Active:*\n"
            for wf in active:
                name = escape_markdown(wf.get('name', 'Unnamed'))
                wf_id = wf.get('id', '?')
                message += f"\u2705 {name} \\(ID: {wf_id}\\)\n"
            message += "\n"

        if inactive:
            message += "*Disabled:*\n"
            for wf in inactive:
                name = escape_markdown(wf.get('name', 'Unnamed'))
                wf_id = wf.get('id', '?')
                message += f"\u23F8 {name} \\(ID: {wf_id}\\)\n"

        message += f"\n_Use_ `/workflow <id> status|run|disable`"

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN_V2)

    except Exception as e:
        logger.error(f"/workflows failed: {e}")

        # Provide helpful error message
        error_msg = str(e)
        if 'ECONNREFUSED' in error_msg or 'connect' in error_msg.lower():
            error_msg = 'n8n service not reachable\\. Check with /services'

        await update.message.reply_text(
            f"\u274C Error: {escape_markdown(error_msg)}",
            parse_mode=ParseMode.MARKDOWN_V2
        )
