#!/usr/bin/env python3
"""
ARASUL PLATFORM - Telegram Bot Configuration
Environment variable handling with secure token masking
"""

import os
import logging

logger = logging.getLogger('telegram-bot.config')


def get_env(key: str, default: str = None, required: bool = False) -> str:
    """Get environment variable with optional requirement check."""
    value = os.getenv(key, default)
    if required and not value:
        raise ValueError(f"Required environment variable '{key}' is not set")
    return value


def get_env_bool(key: str, default: bool = False) -> bool:
    """Get boolean environment variable."""
    value = os.getenv(key, str(default).lower())
    return value.lower() in ('true', '1', 'yes', 'on')


def get_env_int(key: str, default: int) -> int:
    """Get integer environment variable."""
    value = os.getenv(key, str(default))
    try:
        return int(value)
    except ValueError:
        return default


def mask_token(token: str) -> str:
    """Mask sensitive token for logging (shows first 4 and last 4 chars only)."""
    if not token or len(token) < 12:
        return '***HIDDEN***'
    return f"{token[:4]}...{token[-4:]}"


class Config:
    """Configuration container for Telegram Bot service."""

    # Telegram Configuration
    TELEGRAM_BOT_TOKEN: str = get_env('TELEGRAM_BOT_TOKEN', required=True)
    TELEGRAM_CHAT_ID: str = get_env('TELEGRAM_CHAT_ID', '')  # Optional: default chat for notifications
    TELEGRAM_ALLOWED_USERS: str = get_env('TELEGRAM_ALLOWED_USERS', '')  # Comma-separated user IDs

    # Webhook Configuration (for production)
    TELEGRAM_WEBHOOK_ENABLED: bool = get_env_bool('TELEGRAM_WEBHOOK_ENABLED', False)
    TELEGRAM_WEBHOOK_URL: str = get_env('TELEGRAM_WEBHOOK_URL', '')
    TELEGRAM_WEBHOOK_SECRET: str = get_env('TELEGRAM_WEBHOOK_SECRET', '')

    # Service Configuration
    SERVICE_PORT: int = get_env_int('TELEGRAM_BOT_PORT', 8090)
    LOG_LEVEL: str = get_env('LOG_LEVEL', 'INFO')

    # Backend Integration
    DASHBOARD_BACKEND_URL: str = get_env('DASHBOARD_BACKEND_URL', 'http://dashboard-backend:3001')

    # Feature Flags
    NOTIFY_ON_STARTUP: bool = get_env_bool('TELEGRAM_NOTIFY_STARTUP', True)
    NOTIFY_ON_ERROR: bool = get_env_bool('TELEGRAM_NOTIFY_ERRORS', True)

    # ==========================================================================
    # LLM Configuration (Telegram Bot 2.0)
    # ==========================================================================

    # LLM Feature Toggle
    LLM_ENABLED: bool = get_env_bool('TELEGRAM_LLM_ENABLED', True)

    # Default LLM Provider ('ollama' or 'claude')
    DEFAULT_LLM_PROVIDER: str = get_env('TELEGRAM_DEFAULT_LLM_PROVIDER', 'ollama')

    # Ollama Configuration
    OLLAMA_URL: str = get_env('OLLAMA_URL', get_env('LLM_SERVICE_URL', 'http://llm-service:11434'))
    DEFAULT_OLLAMA_MODEL: str = get_env('TELEGRAM_DEFAULT_OLLAMA_MODEL', '')
    OLLAMA_TIMEOUT: int = get_env_int('OLLAMA_TIMEOUT', 120)

    # Claude Configuration
    DEFAULT_CLAUDE_MODEL: str = get_env('TELEGRAM_DEFAULT_CLAUDE_MODEL', 'claude-3-5-sonnet-20241022')

    # ==========================================================================
    # Voice Configuration
    # ==========================================================================

    VOICE_ENABLED: bool = get_env_bool('TELEGRAM_VOICE_ENABLED', False)
    VOICE_PROVIDER: str = get_env('TELEGRAM_VOICE_PROVIDER', 'local')  # 'local' or 'api'
    WHISPER_MODEL: str = get_env('TELEGRAM_WHISPER_MODEL', 'base')  # tiny, base, small, medium, large

    # ==========================================================================
    # Session Configuration
    # ==========================================================================

    MAX_CONTEXT_TOKENS: int = get_env_int('TELEGRAM_MAX_CONTEXT_TOKENS', 4096)
    SESSION_TIMEOUT_HOURS: int = get_env_int('TELEGRAM_SESSION_TIMEOUT_HOURS', 24)

    # ==========================================================================
    # Database Configuration
    # ==========================================================================

    DATABASE_URL: str = get_env(
        'DATABASE_URL',
        'postgresql://arasul:arasul@postgres-db:5432/arasul_db'
    )

    # ==========================================================================
    # Security Configuration
    # ==========================================================================

    # Encryption key for API keys (falls back to JWT_SECRET)
    ENCRYPTION_KEY: str = get_env('TELEGRAM_ENCRYPTION_KEY', get_env('JWT_SECRET', ''))

    @classmethod
    def get_allowed_user_ids(cls) -> set:
        """Parse allowed user IDs from comma-separated string."""
        if not cls.TELEGRAM_ALLOWED_USERS:
            return set()
        return {int(uid.strip()) for uid in cls.TELEGRAM_ALLOWED_USERS.split(',') if uid.strip().isdigit()}

    @classmethod
    def log_config(cls):
        """Log configuration (with sensitive data masked)."""
        logger.info("Telegram Bot Configuration:")
        logger.info(f"  Bot Token: {mask_token(cls.TELEGRAM_BOT_TOKEN)}")
        logger.info(f"  Default Chat ID: {cls.TELEGRAM_CHAT_ID or '(not set)'}")
        logger.info(f"  Allowed Users: {cls.TELEGRAM_ALLOWED_USERS or '(all)'}")
        logger.info(f"  Webhook Enabled: {cls.TELEGRAM_WEBHOOK_ENABLED}")
        logger.info(f"  Service Port: {cls.SERVICE_PORT}")
        logger.info(f"  Backend URL: {cls.DASHBOARD_BACKEND_URL}")
        logger.info(f"  Notify on Startup: {cls.NOTIFY_ON_STARTUP}")
        logger.info(f"  Notify on Error: {cls.NOTIFY_ON_ERROR}")

        # LLM Configuration
        logger.info("LLM Configuration:")
        logger.info(f"  LLM Enabled: {cls.LLM_ENABLED}")
        logger.info(f"  Default Provider: {cls.DEFAULT_LLM_PROVIDER}")
        logger.info(f"  Ollama URL: {cls.OLLAMA_URL}")
        logger.info(f"  Default Ollama Model: {cls.DEFAULT_OLLAMA_MODEL or '(auto)'}")
        logger.info(f"  Default Claude Model: {cls.DEFAULT_CLAUDE_MODEL}")

        # Voice Configuration
        logger.info("Voice Configuration:")
        logger.info(f"  Voice Enabled: {cls.VOICE_ENABLED}")
        logger.info(f"  Voice Provider: {cls.VOICE_PROVIDER}")
        logger.info(f"  Whisper Model: {cls.WHISPER_MODEL}")

        # Session Configuration
        logger.info("Session Configuration:")
        logger.info(f"  Max Context Tokens: {cls.MAX_CONTEXT_TOKENS}")
        logger.info(f"  Session Timeout: {cls.SESSION_TIMEOUT_HOURS}h")
