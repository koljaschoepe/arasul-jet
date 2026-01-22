-- ============================================================================
-- AppStore Schema for Arasul Platform
-- Version: 1.0.0
--
-- This schema provides app store functionality:
-- - App installation tracking
-- - App status management (available, running, stopped, etc.)
-- - System apps protection (n8n, minio)
-- - Event logging for auditing
-- ============================================================================

-- App status enum
DO $$ BEGIN
    CREATE TYPE app_status AS ENUM (
        'available',      -- Available in store, not installed
        'installing',     -- Currently being installed
        'installed',      -- Installed but stopped
        'running',        -- Currently running
        'stopping',       -- Being stopped
        'starting',       -- Being started
        'restarting',     -- Being restarted with new config
        'updating',       -- Being updated
        'error',          -- Error state
        'uninstalling'    -- Being uninstalled
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- App type enum
DO $$ BEGIN
    CREATE TYPE app_type AS ENUM (
        'system',         -- Core system apps (n8n, minio) - cannot be uninstalled
        'official',       -- Official Arasul apps
        'community'       -- Community-contributed apps (future)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main app installations table
CREATE TABLE IF NOT EXISTS app_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- App identification
    app_id VARCHAR(100) NOT NULL UNIQUE,

    -- Installation details
    status app_status DEFAULT 'available',
    app_type app_type DEFAULT 'official',
    version VARCHAR(50),

    -- Docker container info
    container_id VARCHAR(64),
    container_name VARCHAR(100),

    -- Network configuration
    internal_port INTEGER,
    external_port INTEGER,
    traefik_route VARCHAR(255),

    -- Resource usage (cached from last check)
    cpu_usage DECIMAL(5,2),
    memory_usage_mb INTEGER,

    -- Timestamps
    installed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    last_health_check TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT,
    error_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- App configurations (per-app settings)
CREATE TABLE IF NOT EXISTS app_configurations (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(100) NOT NULL,

    -- Configuration key-value
    config_key VARCHAR(255) NOT NULL,
    config_value TEXT,
    is_secret BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(app_id, config_key)
);

-- App dependencies (which services an app requires)
CREATE TABLE IF NOT EXISTS app_dependencies (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(100) NOT NULL,

    depends_on VARCHAR(100) NOT NULL,
    dependency_type VARCHAR(50) DEFAULT 'required',

    UNIQUE(app_id, depends_on)
);

-- App events log (for audit and debugging)
CREATE TABLE IF NOT EXISTS app_events (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(100) NOT NULL,

    event_type VARCHAR(50) NOT NULL,
    event_message TEXT,
    event_details JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_app_installations_status ON app_installations(status);
CREATE INDEX IF NOT EXISTS idx_app_installations_type ON app_installations(app_type);
CREATE INDEX IF NOT EXISTS idx_app_installations_app_id ON app_installations(app_id);
CREATE INDEX IF NOT EXISTS idx_app_configurations_app ON app_configurations(app_id);
CREATE INDEX IF NOT EXISTS idx_app_dependencies_app ON app_dependencies(app_id);
CREATE INDEX IF NOT EXISTS idx_app_events_app ON app_events(app_id);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_type ON app_events(event_type);

-- Trigger for updated_at on app_installations
CREATE OR REPLACE FUNCTION update_app_installations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_app_installations_updated_at ON app_installations;
CREATE TRIGGER trigger_app_installations_updated_at
    BEFORE UPDATE ON app_installations
    FOR EACH ROW
    EXECUTE FUNCTION update_app_installations_updated_at();

-- Trigger for updated_at on app_configurations
DROP TRIGGER IF EXISTS trigger_app_configurations_updated_at ON app_configurations;
CREATE TRIGGER trigger_app_configurations_updated_at
    BEFORE UPDATE ON app_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_app_installations_updated_at();

-- Insert system apps (pre-installed)
INSERT INTO app_installations (
    app_id,
    status,
    app_type,
    version,
    container_name,
    internal_port,
    external_port,
    traefik_route,
    installed_at,
    started_at
)
VALUES
    ('n8n', 'running', 'system', '1.0.0', 'n8n', 5678, 5678, '/n8n', NOW(), NOW()),
    ('minio', 'running', 'system', 'latest', 'minio', 9001, 9001, '/minio', NOW(), NOW())
ON CONFLICT (app_id) DO UPDATE SET
    status = 'running',
    started_at = NOW(),
    updated_at = NOW();

-- Function to get app statistics
CREATE OR REPLACE FUNCTION get_app_statistics()
RETURNS TABLE (
    total_apps BIGINT,
    running_apps BIGINT,
    installed_apps BIGINT,
    available_apps BIGINT,
    system_apps BIGINT,
    error_apps BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'running'),
        COUNT(*) FILTER (WHERE status = 'installed'),
        COUNT(*) FILTER (WHERE status = 'available'),
        COUNT(*) FILTER (WHERE app_type = 'system'),
        COUNT(*) FILTER (WHERE status = 'error')
    FROM app_installations;
END;
$$ LANGUAGE plpgsql;

-- Function to log app events
CREATE OR REPLACE FUNCTION log_app_event(
    p_app_id VARCHAR(100),
    p_event_type VARCHAR(50),
    p_message TEXT,
    p_details JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO app_events (app_id, event_type, event_message, event_details)
    VALUES (p_app_id, p_event_type, p_message, p_details);
END;
$$ LANGUAGE plpgsql;

-- Cleanup old events (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_app_events()
RETURNS void AS $$
BEGIN
    DELETE FROM app_events
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- View for apps with their latest event
CREATE OR REPLACE VIEW apps_with_status AS
SELECT
    ai.*,
    (
        SELECT event_message
        FROM app_events ae
        WHERE ae.app_id = ai.app_id
        ORDER BY created_at DESC
        LIMIT 1
    ) as last_event
FROM app_installations ai;

-- Comments
COMMENT ON TABLE app_installations IS 'Main app installation tracking for AppStore';
COMMENT ON TABLE app_configurations IS 'Per-app configuration key-value storage';
COMMENT ON TABLE app_dependencies IS 'App dependency tracking (e.g., needs postgres-db)';
COMMENT ON TABLE app_events IS 'Audit log for app lifecycle events';
COMMENT ON COLUMN app_installations.app_type IS 'system apps cannot be stopped or uninstalled';
