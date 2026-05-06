-- ============================================================================
-- 091_telegram_bot_health.sql — Phase 4.3 of EXTERNAL_INTEGRATIONS plan.
--
-- Surface bot-level health states (especially silent token-decryption failures)
-- to the dashboard instead of dropping messages on the floor. The ingress
-- service writes these on failure; the dashboard polls them for the bot health
-- banner and the "Test Bot Connection" button.
-- ============================================================================

ALTER TABLE telegram_bots
    ADD COLUMN IF NOT EXISTS health_status TEXT
        CHECK (health_status IN (
            'unknown',                  -- never run
            'healthy',                  -- last run succeeded
            'token_decrypt_failed',     -- JWT_SECRET mismatch / corrupt token blob
            'token_invalid',            -- Telegram returned 401 on getMe
            'unreachable',              -- network error to api.telegram.org
            'webhook_error',            -- Telegram reported a delivery error
            'paused'                    -- operator-paused due to repeated failures
        ))
        DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error_message TEXT,
    ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_telegram_bots_health_status
    ON telegram_bots(health_status)
    WHERE health_status NOT IN ('healthy', 'unknown');

COMMENT ON COLUMN telegram_bots.health_status IS
    'Coarse-grained health classification for the dashboard. Updated by '
    'telegramIngressService.js on every getUpdates / processUpdate cycle.';
