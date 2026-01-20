-- 016_api_audit_logs_schema.sql
-- API Audit Logging Schema
-- Stores all API interactions for security auditing and debugging

-- API Audit Log Table
CREATE TABLE IF NOT EXISTS api_audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id INTEGER,                              -- User ID from JWT (nullable for unauthenticated requests)
    username VARCHAR(255),                        -- Username at time of request
    action_type VARCHAR(50) NOT NULL,             -- HTTP method: GET, POST, PUT, DELETE, PATCH
    target_endpoint VARCHAR(500) NOT NULL,        -- Full endpoint path (e.g., /api/chats/123)
    request_method VARCHAR(10) NOT NULL,          -- HTTP method (redundant but useful for filtering)
    request_payload JSONB DEFAULT '{}'::jsonb,    -- Request body (sensitive data masked)
    response_status INTEGER NOT NULL,             -- HTTP response status code
    duration_ms INTEGER NOT NULL,                 -- Request processing time in milliseconds
    ip_address VARCHAR(45),                       -- Client IP address (IPv4 or IPv6)
    user_agent TEXT,                              -- User-Agent header
    error_message TEXT                            -- Error message if request failed
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_timestamp
ON api_audit_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_user_id
ON api_audit_logs(user_id, timestamp DESC)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_endpoint
ON api_audit_logs(target_endpoint, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_action_type
ON api_audit_logs(action_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_status
ON api_audit_logs(response_status, timestamp DESC);

-- Composite index for common filtering patterns
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_date_action
ON api_audit_logs(DATE(timestamp), action_type);

-- Index for error filtering
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_errors
ON api_audit_logs(timestamp DESC)
WHERE response_status >= 400;

-- Comments
COMMENT ON TABLE api_audit_logs IS 'Audit log for all API interactions';
COMMENT ON COLUMN api_audit_logs.user_id IS 'User ID from JWT authentication (nullable for unauthenticated requests)';
COMMENT ON COLUMN api_audit_logs.username IS 'Username at time of request for historical reference';
COMMENT ON COLUMN api_audit_logs.action_type IS 'HTTP method: GET, POST, PUT, DELETE, PATCH';
COMMENT ON COLUMN api_audit_logs.target_endpoint IS 'Full API endpoint path including parameters';
COMMENT ON COLUMN api_audit_logs.request_method IS 'HTTP method (same as action_type, for filtering efficiency)';
COMMENT ON COLUMN api_audit_logs.request_payload IS 'Request body as JSON (sensitive data like passwords are masked)';
COMMENT ON COLUMN api_audit_logs.response_status IS 'HTTP response status code';
COMMENT ON COLUMN api_audit_logs.duration_ms IS 'Request processing time in milliseconds';
COMMENT ON COLUMN api_audit_logs.ip_address IS 'Client IP address (supports IPv4 and IPv6)';
COMMENT ON COLUMN api_audit_logs.user_agent IS 'User-Agent header from request';
COMMENT ON COLUMN api_audit_logs.error_message IS 'Error message if request resulted in error status';

-- View for daily statistics
CREATE OR REPLACE VIEW api_audit_daily_stats AS
SELECT
    DATE(timestamp) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 300) as success_count,
    COUNT(*) FILTER (WHERE response_status >= 400 AND response_status < 500) as client_error_count,
    COUNT(*) FILTER (WHERE response_status >= 500) as server_error_count,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms
FROM api_audit_logs
GROUP BY DATE(timestamp)
ORDER BY date DESC;

COMMENT ON VIEW api_audit_daily_stats IS 'Daily aggregated statistics for API requests';

-- View for endpoint statistics
CREATE OR REPLACE VIEW api_audit_endpoint_stats AS
SELECT
    target_endpoint,
    action_type,
    COUNT(*) as request_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    MAX(timestamp) as last_called
FROM api_audit_logs
GROUP BY target_endpoint, action_type
ORDER BY request_count DESC;

COMMENT ON VIEW api_audit_endpoint_stats IS 'Statistics per endpoint and HTTP method';

-- Function to clean up old audit logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_api_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_audit_logs
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_api_audit_logs IS 'Removes API audit logs older than specified days (default: 90)';

-- Grant permissions (if role exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arasul') THEN
        GRANT SELECT, INSERT ON api_audit_logs TO arasul;
        GRANT SELECT ON api_audit_daily_stats TO arasul;
        GRANT SELECT ON api_audit_endpoint_stats TO arasul;
        GRANT USAGE, SELECT ON SEQUENCE api_audit_logs_id_seq TO arasul;
    END IF;
END $$;
