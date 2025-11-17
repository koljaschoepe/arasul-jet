-- ARASUL PLATFORM - Initial Database Schema
-- Version: 1.0.0
-- Description: Creates all tables for telemetry, metrics, and system auditing

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- METRICS TABLES
-- ============================================================================

-- CPU Metrics
CREATE TABLE IF NOT EXISTS metrics_cpu (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    value FLOAT NOT NULL CHECK (value >= 0 AND value <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_cpu_timestamp ON metrics_cpu(timestamp DESC);

-- RAM Metrics
CREATE TABLE IF NOT EXISTS metrics_ram (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    value FLOAT NOT NULL CHECK (value >= 0 AND value <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_ram_timestamp ON metrics_ram(timestamp DESC);

-- GPU Metrics
CREATE TABLE IF NOT EXISTS metrics_gpu (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    value FLOAT NOT NULL CHECK (value >= 0 AND value <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_gpu_timestamp ON metrics_gpu(timestamp DESC);

-- Temperature Metrics
CREATE TABLE IF NOT EXISTS metrics_temperature (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    value FLOAT NOT NULL CHECK (value >= 0 AND value <= 150),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_temperature_timestamp ON metrics_temperature(timestamp DESC);

-- Disk Metrics
CREATE TABLE IF NOT EXISTS metrics_disk (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    used BIGINT NOT NULL CHECK (used >= 0),
    free BIGINT NOT NULL CHECK (free >= 0),
    percent FLOAT NOT NULL CHECK (percent >= 0 AND percent <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_disk_timestamp ON metrics_disk(timestamp DESC);

-- ============================================================================
-- WORKFLOW ACTIVITY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_activity (
    id BIGSERIAL PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'running', 'waiting')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER CHECK (duration_ms >= 0),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_activity_timestamp ON workflow_activity(timestamp DESC);
CREATE INDEX idx_workflow_activity_status ON workflow_activity(status);
CREATE INDEX idx_workflow_activity_workflow_name ON workflow_activity(workflow_name);

-- ============================================================================
-- SELF-HEALING EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS self_healing_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY')),
    description TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_taken TEXT NOT NULL,
    service_name TEXT,
    success BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_self_healing_events_timestamp ON self_healing_events(timestamp DESC);
CREATE INDEX idx_self_healing_events_severity ON self_healing_events(severity);
CREATE INDEX idx_self_healing_events_service ON self_healing_events(service_name);

-- ============================================================================
-- SYSTEM SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_snapshots (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('OK', 'WARNING', 'CRITICAL')),
    cpu FLOAT,
    ram FLOAT,
    gpu FLOAT,
    temperature FLOAT,
    disk_percent FLOAT,
    services JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_snapshots_timestamp ON system_snapshots(timestamp DESC);
CREATE INDEX idx_system_snapshots_status ON system_snapshots(status);

-- ============================================================================
-- NOTE: update_events table is defined in 004_update_schema.sql migration
-- ============================================================================

-- ============================================================================
-- SERVICE RESTART TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_restarts (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    service_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    initiated_by TEXT NOT NULL CHECK (initiated_by IN ('self_healing', 'manual', 'docker', 'system')),
    success BOOLEAN NOT NULL,
    restart_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_restarts_timestamp ON service_restarts(timestamp DESC);
CREATE INDEX idx_service_restarts_service ON service_restarts(service_name);

-- ============================================================================
-- RETENTION POLICY FUNCTIONS
-- ============================================================================

-- Function to clean up old metrics (7-day retention)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    DELETE FROM metrics_cpu WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_ram WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_gpu WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_temperature WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM metrics_disk WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM workflow_activity WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM self_healing_events WHERE timestamp < NOW() - INTERVAL '30 days';
    DELETE FROM system_snapshots WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM service_restarts WHERE timestamp < NOW() - INTERVAL '30 days';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error during cleanup: %', SQLERRM;
        -- Continue execution even if cleanup fails
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- Latest metrics view (last 24 hours)
CREATE OR REPLACE VIEW v_metrics_24h AS
SELECT
    'cpu' as metric_type,
    timestamp,
    value
FROM metrics_cpu
WHERE timestamp > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'ram' as metric_type,
    timestamp,
    value
FROM metrics_ram
WHERE timestamp > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'gpu' as metric_type,
    timestamp,
    value
FROM metrics_gpu
WHERE timestamp > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'temperature' as metric_type,
    timestamp,
    value
FROM metrics_temperature
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Recent self-healing events view
CREATE OR REPLACE VIEW v_recent_healing_events AS
SELECT
    id,
    event_type,
    severity,
    description,
    timestamp,
    action_taken,
    service_name,
    success
FROM self_healing_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Service health summary view
CREATE OR REPLACE VIEW v_service_health_summary AS
SELECT
    service_name,
    COUNT(*) as restart_count,
    MAX(timestamp) as last_restart,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_restarts,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_restarts
FROM service_restarts
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY service_name;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions to the arasul user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO arasul;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO arasul;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arasul;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert initial system snapshot
INSERT INTO system_snapshots (status, cpu, ram, gpu, temperature, disk_percent, services)
VALUES (
    'OK',
    0.0,
    0.0,
    0.0,
    0.0,
    0.0,
    '{"postgres": "healthy", "minio": "healthy", "llm": "starting", "embeddings": "starting", "n8n": "starting", "dashboard": "starting"}'::jsonb
);

-- Log database initialization
INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
VALUES (
    'database_init',
    'INFO',
    'Database schema initialized successfully',
    'Created all tables, indexes, views, and functions',
    'postgres-db',
    true
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE metrics_cpu IS 'CPU utilization metrics (percentage)';
COMMENT ON TABLE metrics_ram IS 'RAM utilization metrics (percentage)';
COMMENT ON TABLE metrics_gpu IS 'GPU utilization metrics (percentage)';
COMMENT ON TABLE metrics_temperature IS 'System temperature metrics (Celsius)';
COMMENT ON TABLE metrics_disk IS 'Disk usage metrics';
COMMENT ON TABLE workflow_activity IS 'n8n workflow execution history';
COMMENT ON TABLE self_healing_events IS 'Self-healing engine action log';
COMMENT ON TABLE system_snapshots IS 'Periodic system state snapshots';
COMMENT ON TABLE service_restarts IS 'Service restart tracking';
-- Note: update_events comment is in 004_update_schema.sql

-- ============================================================================
-- ENABLE AUTO-VACUUM
-- ============================================================================

ALTER TABLE metrics_cpu SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE metrics_ram SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE metrics_gpu SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE metrics_temperature SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE metrics_disk SET (autovacuum_vacuum_scale_factor = 0.1);

-- Note: VACUUM ANALYZE cannot run in transaction, will be executed post-init
