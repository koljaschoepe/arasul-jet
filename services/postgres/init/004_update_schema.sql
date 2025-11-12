-- ARASUL Platform - Update System Schema
-- Tracks system updates, rollbacks, and update history

-- Update events table
CREATE TABLE IF NOT EXISTS update_events (
    id SERIAL PRIMARY KEY,
    version_from VARCHAR(50) NOT NULL,
    version_to VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,  -- 'validated', 'in_progress', 'completed', 'failed', 'rolled_back'
    source VARCHAR(50) NOT NULL,  -- 'dashboard', 'usb', 'automatic'
    components_updated JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    requires_reboot BOOLEAN DEFAULT FALSE,
    reboot_completed BOOLEAN DEFAULT FALSE,
    initiated_by VARCHAR(100)  -- username or 'system'
);

-- Update backups table
CREATE TABLE IF NOT EXISTS update_backups (
    id SERIAL PRIMARY KEY,
    backup_path VARCHAR(500) NOT NULL,
    update_event_id INTEGER REFERENCES update_events(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    backup_size_mb INTEGER,
    components JSONB,  -- What was backed up
    restoration_tested BOOLEAN DEFAULT FALSE,
    notes TEXT
);

-- Update file registry (tracks uploaded/USB update files)
CREATE TABLE IF NOT EXISTS update_files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    source VARCHAR(50) NOT NULL,  -- 'dashboard_upload', 'usb_auto', 'usb_manual'
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    signature_verified BOOLEAN DEFAULT FALSE,
    signature_verified_at TIMESTAMPTZ,
    manifest JSONB,  -- Extracted manifest.json
    validation_status VARCHAR(50),  -- 'pending', 'valid', 'invalid'
    validation_error TEXT,
    applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,
    UNIQUE(checksum_sha256)
);

-- Update rollback history
CREATE TABLE IF NOT EXISTS update_rollbacks (
    id SERIAL PRIMARY KEY,
    original_update_event_id INTEGER REFERENCES update_events(id),
    backup_id INTEGER REFERENCES update_backups(id),
    rollback_reason TEXT NOT NULL,
    initiated_by VARCHAR(100),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    success BOOLEAN,
    error_message TEXT,
    services_restored TEXT[],  -- Array of service names
    database_restored BOOLEAN DEFAULT FALSE,
    config_restored BOOLEAN DEFAULT FALSE
);

-- Update state snapshots (for recovery after power loss)
CREATE TABLE IF NOT EXISTS update_state_snapshots (
    id SERIAL PRIMARY KEY,
    update_event_id INTEGER REFERENCES update_events(id),
    current_step VARCHAR(100) NOT NULL,
    step_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE
);

-- Component update history (detailed per-component tracking)
CREATE TABLE IF NOT EXISTS component_updates (
    id SERIAL PRIMARY KEY,
    update_event_id INTEGER REFERENCES update_events(id),
    component_name VARCHAR(200) NOT NULL,  -- 'llm-service', 'dashboard-backend', etc.
    component_type VARCHAR(50) NOT NULL,   -- 'docker_image', 'migration', 'config', 'frontend_bundle'
    version_from VARCHAR(50),
    version_to VARCHAR(50),
    status VARCHAR(50) NOT NULL,  -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_update_events_timestamp ON update_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_events_status ON update_events(status);
CREATE INDEX IF NOT EXISTS idx_update_files_checksum ON update_files(checksum_sha256);
CREATE INDEX IF NOT EXISTS idx_update_files_applied ON update_files(applied, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_backups_event ON update_backups(update_event_id);
CREATE INDEX IF NOT EXISTS idx_component_updates_event ON component_updates(update_event_id);

-- Automatic cleanup: Delete old update files metadata after 90 days
-- (Keep the most recent 10 regardless of age)
CREATE OR REPLACE FUNCTION cleanup_old_update_files()
RETURNS void AS $$
BEGIN
    DELETE FROM update_files
    WHERE id NOT IN (
        SELECT id FROM update_files
        ORDER BY uploaded_at DESC
        LIMIT 10
    )
    AND uploaded_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Automatic cleanup: Delete old update events after 180 days
-- (Keep the most recent 20 regardless of age)
CREATE OR REPLACE FUNCTION cleanup_old_update_events()
RETURNS void AS $$
BEGIN
    DELETE FROM update_events
    WHERE id NOT IN (
        SELECT id FROM update_events
        ORDER BY started_at DESC
        LIMIT 20
    )
    AND started_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql;

-- Views for convenient querying

-- Recent updates view
CREATE OR REPLACE VIEW recent_updates AS
SELECT
    ue.id,
    ue.version_from,
    ue.version_to,
    ue.status,
    ue.source,
    ue.started_at,
    ue.completed_at,
    ue.duration_seconds,
    ue.requires_reboot,
    ue.error_message,
    COUNT(cu.id) as total_components,
    SUM(CASE WHEN cu.status = 'completed' THEN 1 ELSE 0 END) as completed_components,
    SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END) as failed_components
FROM update_events ue
LEFT JOIN component_updates cu ON cu.update_event_id = ue.id
GROUP BY ue.id
ORDER BY ue.started_at DESC
LIMIT 20;

-- Update success rate view
CREATE OR REPLACE VIEW update_statistics AS
SELECT
    COUNT(*) as total_updates,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_updates,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_updates,
    SUM(CASE WHEN status = 'rolled_back' THEN 1 ELSE 0 END) as rolled_back_updates,
    ROUND(AVG(CASE WHEN status = 'completed' THEN duration_seconds END)) as avg_duration_seconds,
    MAX(started_at) as last_update_at
FROM update_events
WHERE started_at > NOW() - INTERVAL '1 year';

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO arasul;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO arasul;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arasul;

-- Insert initial record
INSERT INTO update_events (version_from, version_to, status, source, components_updated)
VALUES ('0.0.0', '1.0.0', 'completed', 'initial_install', '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Update system schema created successfully';
    RAISE NOTICE 'Tables: update_events, update_backups, update_files, update_rollbacks, component_updates, update_state_snapshots';
    RAISE NOTICE 'Views: recent_updates, update_statistics';
END $$;
