-- Migration 038: System Settings & Setup Wizard
-- Adds a system_settings table for first-run detection and setup state persistence.

BEGIN;

-- ============================================================================
-- 1. System Settings Table (singleton, id=1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    setup_completed_at TIMESTAMPTZ,
    setup_completed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    company_name    VARCHAR(255),
    hostname        VARCHAR(255),
    selected_model  VARCHAR(255),
    setup_step      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default row (setup not completed)
INSERT INTO system_settings (id, setup_completed)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Helper function to check setup status
-- ============================================================================

CREATE OR REPLACE FUNCTION is_setup_completed()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT COALESCE(setup_completed, FALSE) FROM system_settings WHERE id = 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. Trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_settings_updated ON system_settings;
CREATE TRIGGER trg_system_settings_updated
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_timestamp();

COMMIT;
