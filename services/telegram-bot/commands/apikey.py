"""
ARASUL PLATFORM - API Key Command
Secure management of API keys for external services
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from security.crypto import (
    encrypt_api_key,
    delete_api_key,
    list_api_keys,
    mask_key,
)

logger = logging.getLogger('telegram-bot.commands.apikey')

# Valid providers for API keys
VALID_PROVIDERS = ['claude', 'openai']


async def cmd_apikey(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /apikey command - Manage API keys.

    Usage:
        /apikey                  - Show help
        /apikey status           - List configured keys
        /apikey set <provider> <key> - Store a key
        /apikey delete <provider>    - Remove a key

    The message containing the key will be deleted for security.
    """
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    args = context.args or []

    logger.info(f"/apikey command from user {user_id}")

    if not args:
        await _show_help(update)
        return

    subcommand = args[0].lower()

    if subcommand == 'status':
        await _show_status(update, user_id)

    elif subcommand == 'set':
        if len(args) < 3:
            await update.message.reply_text(
                "Verwendung: `/apikey set <provider> <key>`\n"
                f"Provider: {', '.join(VALID_PROVIDERS)}",
                parse_mode=ParseMode.MARKDOWN,
            )
            return

        provider = args[1].lower()
        api_key = args[2]

        await _set_key(update, user_id, provider, api_key)

    elif subcommand == 'delete':
        if len(args) < 2:
            await update.message.reply_text(
                "Verwendung: `/apikey delete <provider>`",
                parse_mode=ParseMode.MARKDOWN,
            )
            return

        provider = args[1].lower()
        await _delete_key(update, user_id, provider)

    else:
        await _show_help(update)


async def _show_help(update: Update) -> None:
    """Show API key help message."""
    help_text = f"""
*API Key Management*

Speichere API-Keys für externe Dienste sicher verschlüsselt.

*Befehle:*
`/apikey status` - Konfigurierte Keys anzeigen
`/apikey set <provider> <key>` - Key speichern
`/apikey delete <provider>` - Key entfernen

*Unterstützte Provider:*
{', '.join(f'`{p}`' for p in VALID_PROVIDERS)}

*Sicherheit:*
• Keys werden mit AES-256-GCM verschlüsselt
• Die Nachricht mit dem Key wird automatisch gelöscht

*Beispiel:*
`/apikey set claude sk-ant-xxx...`
"""
    await update.message.reply_text(help_text, parse_mode=ParseMode.MARKDOWN)


async def _show_status(update: Update, user_id: int) -> None:
    """Show configured API keys status."""
    keys = await list_api_keys(user_id)

    if not keys:
        await update.message.reply_text(
            "*Keine API-Keys konfiguriert*\n\n"
            "Nutze `/apikey set <provider> <key>` um einen Key hinzuzufügen.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    lines = ["*Konfigurierte API-Keys*\n"]

    for key_info in keys:
        provider = key_info['provider']
        updated = key_info['updated_at'].strftime('%Y-%m-%d') if key_info['updated_at'] else 'unbekannt'
        lines.append(f"• `{provider}` (aktualisiert: {updated})")

    lines.append(f"\n_Total: {len(keys)} Keys konfiguriert_")

    await update.message.reply_text('\n'.join(lines), parse_mode=ParseMode.MARKDOWN)


async def _set_key(
    update: Update,
    user_id: int,
    provider: str,
    api_key: str,
) -> None:
    """Store an API key."""
    # Validate provider
    if provider not in VALID_PROVIDERS:
        await update.message.reply_text(
            f"Unbekannter Provider: `{provider}`\n"
            f"Verfügbar: {', '.join(f'`{p}`' for p in VALID_PROVIDERS)}",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    # Validate key format
    if not _validate_key_format(provider, api_key):
        await update.message.reply_text(
            f"Ungültiges Key-Format für `{provider}`.\n"
            "Bitte prüfe den Key und versuche es erneut.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    # Try to delete the message containing the key for security
    try:
        await update.message.delete()
        key_deleted = True
    except Exception as e:
        logger.warning(f"Could not delete message with API key: {e}")
        key_deleted = False

    # Store the key
    success = await encrypt_api_key(user_id, provider, api_key)

    if success:
        response = (
            f"API-Key für `{provider}` gespeichert.\n\n"
            f"Key: `{mask_key(api_key)}`"
        )
        if key_deleted:
            response += "\n\n_Deine Nachricht wurde aus Sicherheitsgründen gelöscht._"
        else:
            response += "\n\n_Bitte lösche die Nachricht mit dem Key manuell._"

        # Send to chat (not as reply, since original was deleted)
        await update.effective_chat.send_message(
            response,
            parse_mode=ParseMode.MARKDOWN,
        )
    else:
        await update.effective_chat.send_message(
            f"Fehler beim Speichern des API-Keys für `{provider}`.",
            parse_mode=ParseMode.MARKDOWN,
        )


async def _delete_key(update: Update, user_id: int, provider: str) -> None:
    """Delete an API key."""
    if provider not in VALID_PROVIDERS:
        await update.message.reply_text(
            f"Unbekannter Provider: `{provider}`",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    success = await delete_api_key(user_id, provider)

    if success:
        await update.message.reply_text(
            f"API-Key für `{provider}` gelöscht.",
            parse_mode=ParseMode.MARKDOWN,
        )
    else:
        await update.message.reply_text(
            f"Kein API-Key für `{provider}` gefunden.",
            parse_mode=ParseMode.MARKDOWN,
        )


def _validate_key_format(provider: str, key: str) -> bool:
    """
    Validate API key format.

    Args:
        provider: Provider name
        key: API key to validate

    Returns:
        True if format looks valid
    """
    if not key or len(key) < 10:
        return False

    if provider == 'claude':
        # Anthropic keys start with sk-ant-
        return key.startswith('sk-ant-')

    elif provider == 'openai':
        # OpenAI keys start with sk-
        return key.startswith('sk-')

    return True
