-- Migration 055: Telegram Bot Capabilities
-- Adds per-bot capability columns for tools, context limits, and rate limiting.
-- Existing columns (voice_enabled, rag_enabled, etc.) are already present from migration 032/033/047.

BEGIN;

-- Tools toggle (currently hardcoded to true in telegramIntegrationService)
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN DEFAULT true;

-- Per-bot context window configuration (currently global env var defaults)
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS max_context_tokens INTEGER DEFAULT 4096;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS max_response_tokens INTEGER DEFAULT 1024;

-- Per-bot rate limit (currently global default of 10/min)
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 10;

COMMIT;
