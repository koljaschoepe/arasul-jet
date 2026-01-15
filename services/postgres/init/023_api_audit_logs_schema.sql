-- 023_api_audit_logs_schema.sql
-- API Audit Logging Schema
-- Stores all API request/response data for monitoring, debugging, and compliance

-- API Audit Logs Table
CREATE TABLE IF NOT EXISTS api_audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,  -- NULL for unauthenticated requests
    action_type VARCHAR(10) NOT NULL,                               -- HTTP method: GET, POST, PUT, DELETE, PATCH
    target_endpoint VARCHAR(500) NOT NULL,                          -- Full endpoint path (e.g., /api/documents/upload)
    request_payload JSONB DEFAULT '{}'::jsonb,                      -- Sanitized request body (no passwords/tokens)
    response_status INTEGER NOT NULL,                               -- HTTP status code (200, 401, 500, etc.)
    duration_ms INTEGER NOT NULL DEFAULT 0,                         -- Request processing time in milliseconds
    ip_address INET,                                                -- Client IP address
    user_agent TEXT,                                                -- Client user agent string
    request_id VARCHAR(36),                                         -- Unique request ID for correlation
    error_message TEXT                                              -- Error details if response_status >= 400
);

-- Index for timestamp-based queries (most common - recent logs)
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_timestamp
ON api_audit_logs(timestamp DESC);

-- Index for user activity lookup
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_user_id
ON api_audit_logs(user_id, timestamp DESC)
WHERE user_id IS NOT NULL;

-- Index for action type filtering (GET, POST, etc.)
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_action_type
ON api_audit_logs(action_type, timestamp DESC);

-- Index for response status (especially for error monitoring)
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_response_status
ON api_audit_logs(response_status, timestamp DESC);

-- Composite index for common filter combination: date range + action type
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_timestamp_action
ON api_audit_logs(timestamp DESC, action_type);

-- Index for endpoint pattern searches
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_endpoint
ON api_audit_logs(target_endpoint, timestamp DESC);

-- Index for error logs (4xx and 5xx responses)
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_errors
ON api_audit_logs(timestamp DESC)
WHERE response_status >= 400;

-- Comments for documentation
COMMENT ON TABLE api_audit_logs IS 'Audit log for all API requests - used for monitoring, debugging, and compliance';
COMMENT ON COLUMN api_audit_logs.user_id IS 'FK to admin_users - NULL for unauthenticated requests (login, public endpoints)';
COMMENT ON COLUMN api_audit_logs.action_type IS 'HTTP method: GET, POST, PUT, DELETE, PATCH';
COMMENT ON COLUMN api_audit_logs.target_endpoint IS 'Full API endpoint path including query params';
COMMENT ON COLUMN api_audit_logs.request_payload IS 'Sanitized request body - passwords and tokens are NOT stored';
COMMENT ON COLUMN api_audit_logs.response_status IS 'HTTP response status code';
COMMENT ON COLUMN api_audit_logs.duration_ms IS 'Request processing time in milliseconds';
COMMENT ON COLUMN api_audit_logs.ip_address IS 'Client IP address (may be proxy IP if behind reverse proxy)';
COMMENT ON COLUMN api_audit_logs.user_agent IS 'Client user agent string for browser/device identification';
COMMENT ON COLUMN api_audit_logs.request_id IS 'UUID for request correlation across services';
COMMENT ON COLUMN api_audit_logs.error_message IS 'Error details for failed requests (status >= 400)';

-- View for daily API statistics
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

-- View for endpoint usage statistics
CREATE OR REPLACE VIEW api_audit_endpoint_stats AS
SELECT
    target_endpoint,
    action_type,
    COUNT(*) as request_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count,
    ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
    MAX(timestamp) as last_accessed
FROM api_audit_logs
GROUP BY target_endpoint, action_type
ORDER BY request_count DESC;

COMMENT ON VIEW api_audit_endpoint_stats IS 'Endpoint usage and performance statistics';

-- Function to clean up old API audit logs (retention policy: default 90 days)
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

COMMENT ON FUNCTION cleanup_old_api_audit_logs IS 'Removes API audit logs older than specified days (default: 90). Run periodically via cron or self-healing agent.';

-- Function to sanitize request payload (removes sensitive fields)
CREATE OR REPLACE FUNCTION sanitize_api_payload(payload JSONB)
RETURNS JSONB AS $$
DECLARE
    sensitive_keys TEXT[] := ARRAY['password', 'token', 'secret', 'api_key', 'apikey', 'authorization', 'bearer', 'credential', 'passwd', 'pwd'];
    key_to_remove TEXT;
BEGIN
    IF payload IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    -- Remove top-level sensitive keys
    FOREACH key_to_remove IN ARRAY sensitive_keys
    LOOP
        payload := payload - key_to_remove;
        payload := payload - UPPER(key_to_remove);
        payload := payload - INITCAP(key_to_remove);
    END LOOP;

    RETURN payload;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION sanitize_api_payload IS 'Removes sensitive fields (password, token, etc.) from request payload before logging';

-- Grant permissions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arasul') THEN
        GRANT SELECT, INSERT ON api_audit_logs TO arasul;
        GRANT SELECT ON api_audit_daily_stats TO arasul;
        GRANT SELECT ON api_audit_endpoint_stats TO arasul;
        GRANT USAGE, SELECT ON SEQUENCE api_audit_logs_id_seq TO arasul;
    END IF;
END $$;
