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
    TELEGRAM_WEBHOOK_ENABLED: bool = get_env('TELEGRAM_WEBHOOK_ENABLED', 'false').lower() == 'true'
    TELEGRAM_WEBHOOK_URL: str = get_env('TELEGRAM_WEBHOOK_URL', '')
    TELEGRAM_WEBHOOK_SECRET: str = get_env('TELEGRAM_WEBHOOK_SECRET', '')

    # Service Configuration
    SERVICE_PORT: int = int(get_env('TELEGRAM_BOT_PORT', '8090'))
    LOG_LEVEL: str = get_env('LOG_LEVEL', 'INFO')

    # Backend Integration
    DASHBOARD_BACKEND_URL: str = get_env('DASHBOARD_BACKEND_URL', 'http://dashboard-backend:3001')

    # Feature Flags
    NOTIFY_ON_STARTUP: bool = get_env('TELEGRAM_NOTIFY_STARTUP', 'true').lower() == 'true'
    NOTIFY_ON_ERROR: bool = get_env('TELEGRAM_NOTIFY_ERRORS', 'true').lower() == 'true'

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
