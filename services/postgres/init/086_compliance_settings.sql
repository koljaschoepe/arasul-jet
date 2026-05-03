-- Migration 086: Compliance-Settings für Phase 1
-- Adds telegram_enabled (default OFF) und ai_transparency_enabled (default ON, AI-Act Art. 50)
-- Plan-Ref: docs/plans/COMMERCIAL_LAUNCH_MASTER_PLAN.md Phase 1.4 + 1.6

BEGIN;

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS telegram_disclaimer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS telegram_disclaimer_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS telegram_disclaimer_accepted_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ai_transparency_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ai_transparency_disabled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_transparency_disabled_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN system_settings.telegram_enabled IS 'Phase 1.6: Telegram default OFF (Drittland UAE, kein AVV verfügbar). Aktivierung erfordert explizites Opt-In mit Disclaimer-Acceptance.';
COMMENT ON COLUMN system_settings.telegram_disclaimer_accepted IS 'Phase 1.6: Audit-Trail dass Admin den Drittland-Disclaimer aktiv bestätigt hat.';
COMMENT ON COLUMN system_settings.ai_transparency_enabled IS 'Phase 1.4: KI-Transparenz-Label (Art. 50 EU-AI-Act). Default ON, Deaktivierung erfordert Admin-Rolle und ist im Audit-Log.';

COMMIT;
