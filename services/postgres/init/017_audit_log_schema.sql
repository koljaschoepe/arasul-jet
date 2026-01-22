-- 015_audit_log_schema.sql
-- Telegram Bot Audit Logging Schema
-- Stores all bot interactions for monitoring and debugging

-- Bot Audit Log Table
CREATE TABLE IF NOT EXISTS bot_audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id BIGINT,                              -- Telegram user ID
    username VARCHAR(255),                       -- Telegram username (nullable)
    chat_id BIGINT NOT NULL,                     -- Telegram chat ID
    command VARCHAR(100),                        -- Command if any (e.g., '/status', '/help')
    message_text TEXT,                           -- Full message text (limited to 4000 chars)
    response_text TEXT,                          -- Bot response text (limited to 4000 chars)
    response_time_ms INTEGER,                    -- Time to process and respond
    success BOOLEAN DEFAULT true,                -- Whether interaction was successful
    error_message TEXT,                          -- Error details if failed
    interaction_type VARCHAR(50) DEFAULT 'message', -- message, command, callback, inline
    metadata JSONB DEFAULT '{}'::jsonb           -- Additional context (e.g., callback_data)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bot_audit_log_timestamp
ON bot_audit_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_log_user_id
ON bot_audit_log(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_log_chat_id
ON bot_audit_log(chat_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bot_audit_log_command
ON bot_audit_log(command)
WHERE command IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bot_audit_log_success
ON bot_audit_log(success, timestamp DESC)
WHERE success = false;

-- Comment on table
COMMENT ON TABLE bot_audit_log IS 'Audit log for all Telegram bot interactions';
COMMENT ON COLUMN bot_audit_log.user_id IS 'Telegram user ID (nullable for anonymous interactions)';
COMMENT ON COLUMN bot_audit_log.username IS 'Telegram username at time of interaction';
COMMENT ON COLUMN bot_audit_log.chat_id IS 'Telegram chat ID where interaction occurred';
COMMENT ON COLUMN bot_audit_log.command IS 'Bot command if message was a command';
COMMENT ON COLUMN bot_audit_log.message_text IS 'User message (sensitive data should be masked)';
COMMENT ON COLUMN bot_audit_log.response_text IS 'Bot response (sensitive data should be masked)';
COMMENT ON COLUMN bot_audit_log.response_time_ms IS 'Processing time in milliseconds';
COMMENT ON COLUMN bot_audit_log.interaction_type IS 'Type: message, command, callback, inline';
COMMENT ON COLUMN bot_audit_log.metadata IS 'Additional JSON metadata (callback_data, etc.)';

-- View for daily statistics
CREATE OR REPLACE VIEW bot_audit_daily_stats AS
SELECT
    DATE(timestamp) as date,
    COUNT(*) as total_interactions,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE command IS NOT NULL) as command_count,
    COUNT(*) FILTER (WHERE success = false) as error_count,
    ROUND(AVG(response_time_ms)::numeric, 2) as avg_response_time_ms,
    MAX(response_time_ms) as max_response_time_ms
FROM bot_audit_log
GROUP BY DATE(timestamp)
ORDER BY date DESC;

COMMENT ON VIEW bot_audit_daily_stats IS 'Daily aggregated statistics for bot interactions';

-- View for command usage statistics
CREATE OR REPLACE VIEW bot_audit_command_stats AS
SELECT
    command,
    COUNT(*) as usage_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE success = false) as error_count,
    ROUND(AVG(response_time_ms)::numeric, 2) as avg_response_time_ms,
    MAX(timestamp) as last_used
FROM bot_audit_log
WHERE command IS NOT NULL
GROUP BY command
ORDER BY usage_count DESC;

COMMENT ON VIEW bot_audit_command_stats IS 'Command usage statistics';

-- Function to clean up old audit logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM bot_audit_log
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Removes audit logs older than specified days (default: 90)';

-- Function to mask sensitive data before logging
CREATE OR REPLACE FUNCTION mask_sensitive_data(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    IF input_text IS NULL THEN
        RETURN NULL;
    END IF;

    -- Mask potential tokens (anything looking like a token/key)
    input_text := regexp_replace(input_text, '[0-9]{9,}:[A-Za-z0-9_-]{35,}', '[MASKED_TOKEN]', 'g');

    -- Mask potential passwords in common formats
    input_text := regexp_replace(input_text, '(password|passwd|pwd|secret|token|key|api_key|apikey)[\s]*[=:]\s*\S+', '\1=[MASKED]', 'gi');

    -- Mask email addresses (optional - keep for now for traceability)
    -- input_text := regexp_replace(input_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[MASKED_EMAIL]', 'g');

    RETURN input_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION mask_sensitive_data IS 'Masks tokens, passwords, and other sensitive data in text';

-- Grant permissions (if role exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arasul') THEN
        GRANT SELECT, INSERT ON bot_audit_log TO arasul;
        GRANT SELECT ON bot_audit_daily_stats TO arasul;
        GRANT SELECT ON bot_audit_command_stats TO arasul;
        GRANT USAGE, SELECT ON SEQUENCE bot_audit_log_id_seq TO arasul;
    END IF;
END $$;
