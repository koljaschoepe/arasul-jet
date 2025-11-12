-- ARASUL PLATFORM - Self-Healing Enhancement Schema
-- Version: 1.0.0
-- Description: Additional tables for advanced self-healing capabilities

-- ============================================================================
-- SERVICE FAILURE TRACKING
-- ============================================================================

-- Track service failures with time windows for intelligent recovery
CREATE TABLE IF NOT EXISTS service_failures (
    id BIGSERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failure_type TEXT NOT NULL CHECK (failure_type IN ('unhealthy', 'down', 'timeout', 'error')),
    health_status TEXT,
    recovery_action TEXT,
    recovery_success BOOLEAN,
    window_start TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_failures_service_name ON service_failures(service_name);
CREATE INDEX idx_service_failures_timestamp ON service_failures(timestamp DESC);
CREATE INDEX idx_service_failures_window ON service_failures(window_start DESC);

-- ============================================================================
-- REBOOT STATE TRACKING
-- ============================================================================

-- Store system state before reboot for validation
CREATE TABLE IF NOT EXISTS reboot_events (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL,
    pre_reboot_state JSONB NOT NULL,
    post_reboot_state JSONB,
    reboot_completed BOOLEAN DEFAULT false,
    validation_passed BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reboot_events_timestamp ON reboot_events(timestamp DESC);

-- ============================================================================
-- RECOVERY ACTION HISTORY
-- ============================================================================

-- Track all recovery actions for analytics
CREATE TABLE IF NOT EXISTS recovery_actions (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type TEXT NOT NULL CHECK (action_type IN (
        'llm_cache_clear', 'gpu_session_reset', 'gpu_throttle', 'service_restart',
        'disk_cleanup', 'db_vacuum', 'gpu_reset', 'system_reboot'
    )),
    service_name TEXT,
    reason TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    duration_ms INTEGER,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_actions_timestamp ON recovery_actions(timestamp DESC);
CREATE INDEX idx_recovery_actions_action_type ON recovery_actions(action_type);
CREATE INDEX idx_recovery_actions_service ON recovery_actions(service_name);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get failure count for service in time window
CREATE OR REPLACE FUNCTION get_service_failure_count(
    p_service_name TEXT,
    p_minutes INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM service_failures
    WHERE service_name = p_service_name
      AND timestamp > NOW() - (p_minutes || ' minutes')::INTERVAL;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Check if service is in cooldown period
CREATE OR REPLACE FUNCTION is_service_in_cooldown(
    p_service_name TEXT,
    p_cooldown_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_action TIMESTAMPTZ;
BEGIN
    SELECT MAX(timestamp)
    INTO v_last_action
    FROM recovery_actions
    WHERE service_name = p_service_name
      AND action_type IN ('service_restart', 'gpu_reset');

    IF v_last_action IS NULL THEN
        RETURN false;
    END IF;

    RETURN (NOW() - v_last_action) < (p_cooldown_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Get critical events in time window
CREATE OR REPLACE FUNCTION get_critical_events_count(
    p_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM self_healing_events
    WHERE severity IN ('CRITICAL', 'EMERGENCY')
      AND timestamp > NOW() - (p_minutes || ' minutes')::INTERVAL;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Record service failure with auto-windowing
CREATE OR REPLACE FUNCTION record_service_failure(
    p_service_name TEXT,
    p_failure_type TEXT,
    p_health_status TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Use 10-minute windows
    v_window_start := date_trunc('minute', NOW()) -
                      ((EXTRACT(MINUTE FROM NOW())::INTEGER % 10) || ' minutes')::INTERVAL;

    INSERT INTO service_failures (
        service_name,
        failure_type,
        health_status,
        window_start
    ) VALUES (
        p_service_name,
        p_failure_type,
        p_health_status,
        v_window_start
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Record recovery action
CREATE OR REPLACE FUNCTION record_recovery_action(
    p_action_type TEXT,
    p_service_name TEXT,
    p_reason TEXT,
    p_success BOOLEAN,
    p_duration_ms INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO recovery_actions (
        action_type,
        service_name,
        reason,
        success,
        duration_ms,
        error_message,
        metadata
    ) VALUES (
        p_action_type,
        p_service_name,
        p_reason,
        p_success,
        p_duration_ms,
        p_error_message,
        p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Clear old service failures (cleanup)
CREATE OR REPLACE FUNCTION cleanup_service_failures()
RETURNS void AS $$
BEGIN
    DELETE FROM service_failures WHERE timestamp < NOW() - INTERVAL '1 hour';
    DELETE FROM recovery_actions WHERE timestamp < NOW() - INTERVAL '7 days';
    DELETE FROM reboot_events WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Service failure summary (last hour)
CREATE OR REPLACE VIEW v_service_failure_summary AS
SELECT
    service_name,
    COUNT(*) as failure_count,
    MAX(timestamp) as last_failure,
    string_agg(DISTINCT failure_type, ', ') as failure_types
FROM service_failures
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY service_name
ORDER BY failure_count DESC;

-- Recent recovery actions
CREATE OR REPLACE VIEW v_recent_recovery_actions AS
SELECT
    timestamp,
    action_type,
    service_name,
    reason,
    success,
    duration_ms,
    error_message
FROM recovery_actions
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 50;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO arasul;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO arasul;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arasul;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Log schema upgrade
INSERT INTO self_healing_events (event_type, severity, description, action_taken, success)
VALUES (
    'schema_upgrade',
    'INFO',
    'Self-healing schema upgraded with advanced failure tracking',
    'Created service_failures, reboot_events, and recovery_actions tables',
    true
);

-- Run initial cleanup
SELECT cleanup_service_failures();
