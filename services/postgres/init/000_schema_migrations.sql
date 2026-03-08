-- ============================================================================
-- Schema Migrations Tracking Table
-- Version: 0.0.0
--
-- MUST be the first migration to run. Tracks all applied migrations
-- so the backend migration runner can detect and apply new ones.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum VARCHAR(64),
    execution_ms INTEGER,
    success BOOLEAN DEFAULT true
);

COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations for idempotent re-runs';

-- Record this migration itself
INSERT INTO schema_migrations (version, filename, checksum, execution_ms, success)
VALUES (0, '000_schema_migrations.sql', 'bootstrap', 0, true)
ON CONFLICT (version) DO NOTHING;
