-- ============================================================================
-- 056: Schema Cleanup
-- - Drop duplicate non-unique content_hash index (superseded by 052)
-- - Add missing FK indexes
-- - Ensure canonical updated_at trigger function
-- - Add telegram session cleanup function
-- ============================================================================

-- 1. Drop old non-unique content_hash index (superseded by idx_documents_unique_content_hash from 052)
DROP INDEX IF EXISTS idx_documents_content_hash;

-- 2. Add missing FK indexes
CREATE INDEX IF NOT EXISTS idx_app_configurations_app_id ON app_configurations(app_id);

-- 3. Ensure canonical updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Add telegram session cleanup function
CREATE OR REPLACE FUNCTION cleanup_telegram_sessions() RETURNS void AS $$
BEGIN
    DELETE FROM telegram_bot_sessions WHERE updated_at < NOW() - INTERVAL '30 days';
    DELETE FROM telegram_setup_sessions WHERE updated_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION cleanup_telegram_sessions() TO arasul;

-- 5. Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO arasul;
