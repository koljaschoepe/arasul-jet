-- 061_security_audit_log.sql
-- High-value security audit trail for compliance-relevant actions.
-- Separate from api_audit_logs (which logs ALL requests) — this table
-- only captures security-critical events that matter for audits.

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    request_id UUID
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
ON audit_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action
ON audit_logs(user_id, action, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action, timestamp DESC);

COMMENT ON TABLE audit_logs IS 'High-value security audit trail — password changes, service restarts, config changes, exports';
COMMENT ON COLUMN audit_logs.action IS 'Semantic action: login, password_change, service_restart, config_change, diagnostics_export, setup_complete, etc.';
COMMENT ON COLUMN audit_logs.details IS 'Action-specific context (secrets redacted)';
COMMENT ON COLUMN audit_logs.request_id IS 'Correlation ID linking to api_audit_logs for the same request';

-- Cleanup function (retain 1 year for compliance)
CREATE OR REPLACE FUNCTION cleanup_old_security_audit_logs(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_security_audit_logs IS 'Removes security audit logs older than specified days (default: 365)';

-- Grant permissions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arasul') THEN
        GRANT SELECT, INSERT ON audit_logs TO arasul;
        GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO arasul;
    END IF;
END $$;
