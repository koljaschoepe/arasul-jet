"""
ARASUL PLATFORM - Error Handling
Centralized error handling for Telegram bot
"""

import logging
from typing import Optional

from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from providers.base import (
    ProviderError,
    ProviderConnectionError,
    ProviderAuthError,
    ProviderRateLimitError,
)

logger = logging.getLogger('telegram-bot.handlers.errors')


def format_error_message(error: Exception) -> str:
    """
    Format error into user-friendly message.

    Args:
        error: Exception to format

    Returns:
        User-friendly error message
    """
    if isinstance(error, ProviderConnectionError):
        return (
            "Cannot connect to the LLM service.\n"
            "The service may be starting up or temporarily unavailable."
        )

    elif isinstance(error, ProviderAuthError):
        return (
            "Authentication failed.\n"
            "Please check your API key with /apikey status."
        )

    elif isinstance(error, ProviderRateLimitError):
        return (
            "Rate limit exceeded.\n"
            "Please wait a moment before sending more messages."
        )

    elif isinstance(error, ProviderError):
        return f"LLM error: {str(error)}"

    elif isinstance(error, ValueError):
        return f"Invalid input: {str(error)}"

    else:
        # Generic error
        logger.error(f"Unexpected error: {type(error).__name__}: {error}")
        return "An unexpected error occurred. Please try again."


def escape_markdown(text: str) -> str:
    """
    Escape special characters for Markdown.

    Args:
        text: Text to escape

    Returns:
        Escaped text safe for Markdown
    """
    # Characters that need escaping in Markdown
    special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text


async def handle_error(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    error: Exception,
    reply: bool = True,
) -> None:
    """
    Handle an error during message processing.

    Args:
        update: Telegram update
        context: Bot context
        error: Exception that occurred
        reply: Whether to reply to user with error
    """
    # Log the error
    user_id = update.effective_user.id if update.effective_user else 'unknown'
    chat_id = update.effective_chat.id if update.effective_chat else 'unknown'

    logger.error(
        f"Error in chat {chat_id} (user {user_id}): "
        f"{type(error).__name__}: {error}"
    )

    if not reply or not update.message:
        return

    # Format and send error message
    error_text = format_error_message(error)

    try:
        await update.message.reply_text(
            f"Error: {error_text}",
            parse_mode=None,  # Plain text for safety
        )
    except Exception as e:
        logger.error(f"Failed to send error message: {e}")


async def send_typing_action(update: Update) -> None:
    """
    Send typing action to show bot is processing.

    Args:
        update: Telegram update
    """
    if update.message and update.message.chat:
        try:
            await update.message.chat.send_action("typing")
        except Exception as e:
            logger.debug(f"Failed to send typing action: {e}")
