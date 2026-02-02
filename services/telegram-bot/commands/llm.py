"""
ARASUL PLATFORM - LLM Commands
Commands for LLM session management: /new, /model, /context
"""

import logging
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode

from config import Config
from session.manager import get_session_manager
from providers import ProviderRegistry, get_provider
from providers.base import ProviderError

logger = logging.getLogger('telegram-bot.commands.llm')


async def cmd_new(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /new command - Reset conversation session.

    Clears all message history and starts fresh.
    """
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    logger.info(f"/new command from user {user_id}")

    try:
        session_manager = get_session_manager()
        await session_manager.reset_session(chat_id)

        await update.message.reply_text(
            "Neue Konversation gestartet.\n"
            "Der bisherige Kontext wurde gelöscht."
        )

    except Exception as e:
        logger.error(f"/new command failed: {e}")
        await update.message.reply_text(f"Fehler beim Zurücksetzen: {str(e)}")


async def cmd_model(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /model command - View or change LLM provider/model.

    Usage:
        /model              - Show current model and available options
        /model list         - List all available models
        /model ollama       - Switch to Ollama (auto-select model)
        /model ollama <name> - Switch to specific Ollama model
        /model claude       - Switch to Claude
    """
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    args = context.args or []

    logger.info(f"/model command from user {user_id}: {args}")

    try:
        session_manager = get_session_manager()
        session = await session_manager.get_session(chat_id, user_id)

        if not args:
            # Show current model
            await _show_current_model(update, session)
            return

        subcommand = args[0].lower()

        if subcommand == 'list':
            await _list_models(update)

        elif subcommand in ('ollama', 'claude'):
            model_name = args[1] if len(args) > 1 else None
            await _switch_provider(update, session_manager, chat_id, subcommand, model_name)

        else:
            # Assume it's a model name for current provider
            await _switch_model(update, session_manager, chat_id, session.provider, subcommand)

    except Exception as e:
        logger.error(f"/model command failed: {e}")
        await update.message.reply_text(f"Fehler: {str(e)}")


async def _show_current_model(update: Update, session) -> None:
    """Show current model configuration."""
    provider_name = session.provider or Config.DEFAULT_LLM_PROVIDER
    model_name = session.model or "(Standard)"

    # Get provider health
    try:
        provider = get_provider(provider_name)
        is_healthy = await provider.health_check()
        status = "online" if is_healthy else "offline"
    except Exception:
        status = "unknown"

    message = (
        f"*Aktuelles LLM-Setup*\n\n"
        f"Provider: `{provider_name}`\n"
        f"Model: `{model_name}`\n"
        f"Status: {status}\n\n"
        f"_Verfügbare Befehle:_\n"
        f"`/model list` - Alle Modelle anzeigen\n"
        f"`/model ollama <name>` - Zu Ollama wechseln\n"
        f"`/model claude` - Zu Claude wechseln"
    )

    await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN)


async def _list_models(update: Update) -> None:
    """List all available models from all providers."""
    messages = ["*Verfügbare Modelle*\n"]

    for provider_name in ProviderRegistry.list_providers():
        try:
            provider = get_provider(provider_name)
            models = await provider.get_models()

            if models:
                messages.append(f"\n*{provider_name.upper()}*")
                for model in models[:10]:  # Limit to 10 models
                    if model.size:
                        messages.append(f"  • `{model.name}` ({model.size})")
                    else:
                        messages.append(f"  • `{model.name}`")

                if len(models) > 10:
                    messages.append(f"  ... und {len(models) - 10} weitere")
            else:
                messages.append(f"\n*{provider_name.upper()}*: Keine Modelle verfügbar")

        except ProviderError as e:
            messages.append(f"\n*{provider_name.upper()}*: {str(e)}")
        except Exception as e:
            messages.append(f"\n*{provider_name.upper()}*: Fehler beim Laden")
            logger.debug(f"Error listing {provider_name} models: {e}")

    await update.message.reply_text('\n'.join(messages), parse_mode=ParseMode.MARKDOWN)


async def _switch_provider(
    update: Update,
    session_manager,
    chat_id: int,
    provider: str,
    model: str = None,
) -> None:
    """Switch to a different provider."""
    # Validate provider
    if provider not in ProviderRegistry.list_providers():
        await update.message.reply_text(
            f"Unbekannter Provider: {provider}\n"
            f"Verfügbar: {', '.join(ProviderRegistry.list_providers())}"
        )
        return

    # Check if provider is available
    try:
        provider_instance = get_provider(provider)
        is_healthy = await provider_instance.health_check()

        if not is_healthy and provider == 'claude':
            await update.message.reply_text(
                "Claude erfordert einen API-Key.\n"
                "Bitte zuerst konfigurieren: `/apikey set claude <key>`",
                parse_mode=ParseMode.MARKDOWN,
            )
            return

    except Exception as e:
        logger.warning(f"Provider health check failed: {e}")

    # Update session
    await session_manager.update_provider(chat_id, provider, model)

    if model:
        await update.message.reply_text(
            f"Gewechselt zu: `{provider}` / `{model}`",
            parse_mode=ParseMode.MARKDOWN,
        )
    else:
        await update.message.reply_text(
            f"Gewechselt zu: `{provider}` (Standard-Modell)",
            parse_mode=ParseMode.MARKDOWN,
        )


async def _switch_model(
    update: Update,
    session_manager,
    chat_id: int,
    provider: str,
    model: str,
) -> None:
    """Switch to a specific model."""
    # Verify model exists
    try:
        provider_instance = get_provider(provider)
        models = await provider_instance.get_models()
        model_names = [m.name for m in models]

        if model not in model_names:
            # Suggest similar models
            suggestions = [m for m in model_names if model.lower() in m.lower()][:3]
            if suggestions:
                await update.message.reply_text(
                    f"Model `{model}` nicht gefunden.\n"
                    f"Meintest du: {', '.join(f'`{s}`' for s in suggestions)}?",
                    parse_mode=ParseMode.MARKDOWN,
                )
            else:
                await update.message.reply_text(
                    f"Model `{model}` nicht gefunden.\n"
                    f"Nutze `/model list` um verfügbare Modelle anzuzeigen.",
                    parse_mode=ParseMode.MARKDOWN,
                )
            return

    except Exception as e:
        logger.warning(f"Could not verify model: {e}")

    # Update session
    await session_manager.update_provider(chat_id, provider, model)

    await update.message.reply_text(
        f"Model gewechselt zu: `{model}`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_context(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /context command - Show session/memory statistics.

    Displays current context window usage and session info.
    """
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    logger.info(f"/context command from user {user_id}")

    try:
        session_manager = get_session_manager()
        stats = await session_manager.get_session_stats(chat_id)

        if not stats.get('exists'):
            await update.message.reply_text(
                "Keine aktive Session.\n"
                "Sende eine Nachricht um eine neue Session zu starten."
            )
            return

        # Calculate context usage
        max_tokens = stats.get('max_context_tokens', Config.MAX_CONTEXT_TOKENS)
        used_tokens = stats.get('total_tokens', 0)
        usage_percent = (used_tokens / max_tokens * 100) if max_tokens > 0 else 0

        # Progress bar
        bar_length = 20
        filled = int(bar_length * usage_percent / 100)
        bar = '█' * filled + '░' * (bar_length - filled)

        message = (
            f"*Session-Kontext*\n\n"
            f"Provider: `{stats.get('provider', 'unbekannt')}`\n"
            f"Model: `{stats.get('model') or '(Standard)'}`\n"
            f"Nachrichten: {stats.get('message_count', 0)}\n\n"
            f"*Token-Nutzung*\n"
            f"`[{bar}]` {usage_percent:.0f}%\n"
            f"{used_tokens:,} / {max_tokens:,} Tokens\n\n"
            f"_Session gestartet: {stats.get('created_at', 'unbekannt')[:10]}_\n"
            f"_Letzte Nachricht: {stats.get('last_message_at', 'unbekannt')[:10]}_\n\n"
            f"Nutze `/new` um die Session zurückzusetzen."
        )

        await update.message.reply_text(message, parse_mode=ParseMode.MARKDOWN)

    except Exception as e:
        logger.error(f"/context command failed: {e}")
        await update.message.reply_text(f"Fehler: {str(e)}")
