-- ============================================================================
-- 092_telegram_dsgvo.sql — Phase 6 of EXTERNAL_INTEGRATIONS plan: DSGVO
-- compliance for the Telegram bot path.
--
-- Two pieces:
--   1. telegram_user_id_hash column on telegram_user_chats — HMAC-SHA256 of
--      the raw Telegram user id under a server-side pepper. Future code paths
--      should write this and read this; the plaintext column stays for one
--      release cycle so a backfill can be verified before drop.
--   2. telegram_user_consent table — Art. 13 DSGVO consent records bound to
--      (bot_id, user_id_hash). No raw user id is stored here.
--
-- The pepper itself is a Docker secret (telegram_user_id_pepper) loaded by
-- dashboard-backend. Rotation requires re-hashing; that is documented in the
-- runbook (docs/integrations/TELEGRAM_BOT_SETUP.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. user_id pseudonymisation column on telegram_user_chats
-- ----------------------------------------------------------------------------
-- Only add the column if the table exists. On a brand-new appliance,
-- telegram_user_chats is created by an earlier migration; we just augment.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_user_chats') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'telegram_user_chats' AND column_name = 'telegram_user_id_hash'
        ) THEN
            ALTER TABLE telegram_user_chats ADD COLUMN telegram_user_id_hash CHAR(64);
            COMMENT ON COLUMN telegram_user_chats.telegram_user_id_hash IS
                'HMAC-SHA256 of telegram_user_id under per-appliance pepper. Phase 6 DSGVO.';
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. telegram_user_consent — explicit Art. 13 DSGVO opt-in per (bot, user)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_user_consent (
    id                       BIGSERIAL PRIMARY KEY,
    bot_id                   BIGINT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
    -- HMAC-pseudonymised Telegram user id. Constant length so we can index
    -- without leaking row size. NEVER store the raw user id in this table.
    telegram_user_id_hash    CHAR(64) NOT NULL,
    chat_id                  TEXT NOT NULL,
    consent_status           TEXT NOT NULL CHECK (consent_status IN ('granted', 'denied', 'withdrawn')),
    consented_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at             TIMESTAMPTZ,
    notice_version           TEXT NOT NULL DEFAULT 'v1',
    UNIQUE (bot_id, telegram_user_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_telegram_user_consent_bot
    ON telegram_user_consent(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_consent_status
    ON telegram_user_consent(consent_status);

COMMENT ON TABLE telegram_user_consent IS
    'DSGVO Art. 13 consent records. Created by /start, withdrawn by /loeschen. '
    'No PII stored — only the HMAC of telegram_user_id and the chat id.';
