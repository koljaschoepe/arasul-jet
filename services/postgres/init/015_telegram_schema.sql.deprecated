-- ARASUL PLATFORM - Telegram Bot Schema
-- Version: 1.0.0
-- Description: Telegram bot configuration and audit logging

-- ============================================================================
-- TELEGRAM CONFIGURATION TABLE (Singleton Pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_config (
    id BIGSERIAL PRIMARY KEY,
    bot_token TEXT,
    chat_id TEXT,
    enabled BOOLEAN DEFAULT false,
    webhook_url TEXT,
    webhook_secret TEXT,
    notification_settings JSONB DEFAULT '{
        "system_alerts": true,
        "self_healing_events": true,
        "update_notifications": true,
        "login_alerts": true,
        "daily_summary": false
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Singleton constraint: only one configuration row allowed
    CONSTRAINT telegram_config_singleton CHECK (id = 1)
);

-- Ensure only one row can exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_config_singleton ON telegram_config ((true));

-- Index for quick enabled check
CREATE INDEX IF NOT EXISTS idx_telegram_config_enabled ON telegram_config(enabled);

-- ============================================================================
-- TELEGRAM AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT,
    payload JSONB,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-based queries (newest first)
CREATE INDEX IF NOT EXISTS idx_telegram_audit_created ON telegram_audit_log(created_at DESC);

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_telegram_audit_event_type ON telegram_audit_log(event_type);

-- Index for filtering by success/failure
CREATE INDEX IF NOT EXISTS idx_telegram_audit_success ON telegram_audit_log(success);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_telegram_audit_type_created ON telegram_audit_log(event_type, created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update telegram_config.updated_at on changes
CREATE OR REPLACE FUNCTION update_telegram_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp update
DROP TRIGGER IF EXISTS trigger_telegram_config_updated ON telegram_config;
CREATE TRIGGER trigger_telegram_config_updated
    BEFORE UPDATE ON telegram_config
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_config_timestamp();

-- Function to log telegram events
CREATE OR REPLACE FUNCTION log_telegram_event(
    p_event_type VARCHAR(50),
    p_event_description TEXT,
    p_payload JSONB DEFAULT NULL,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL,
    p_user_id BIGINT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_log_id BIGINT;
BEGIN
    INSERT INTO telegram_audit_log (
        event_type,
        event_description,
        payload,
        success,
        error_message,
        user_id,
        ip_address
    ) VALUES (
        p_event_type,
        p_event_description,
        p_payload,
        p_success,
        p_error_message,
        p_user_id,
        p_ip_address
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create telegram config (ensures singleton)
CREATE OR REPLACE FUNCTION get_or_create_telegram_config()
RETURNS telegram_config AS $$
DECLARE
    v_config telegram_config;
BEGIN
    SELECT * INTO v_config FROM telegram_config WHERE id = 1;

    IF NOT FOUND THEN
        INSERT INTO telegram_config (id) VALUES (1)
        ON CONFLICT DO NOTHING
        RETURNING * INTO v_config;

        -- Re-select in case of race condition
        IF v_config IS NULL THEN
            SELECT * INTO v_config FROM telegram_config WHERE id = 1;
        END IF;
    END IF;

    RETURN v_config;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for recent telegram activity (last 100 events)
CREATE OR REPLACE VIEW v_telegram_recent_activity AS
SELECT
    tal.id,
    tal.event_type,
    tal.event_description,
    tal.success,
    tal.error_message,
    tal.created_at,
    au.username as triggered_by
FROM telegram_audit_log tal
LEFT JOIN admin_users au ON tal.user_id = au.id
ORDER BY tal.created_at DESC
LIMIT 100;

-- View for telegram event statistics (last 24 hours)
CREATE OR REPLACE VIEW v_telegram_stats_24h AS
SELECT
    event_type,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE success = true) as successful,
    COUNT(*) FILTER (WHERE success = false) as failed,
    MAX(created_at) as last_event
FROM telegram_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY total_events DESC;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL PRIVILEGES ON telegram_config TO arasul;
GRANT ALL PRIVILEGES ON telegram_audit_log TO arasul;

GRANT ALL PRIVILEGES ON SEQUENCE telegram_config_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE telegram_audit_log_id_seq TO arasul;

GRANT EXECUTE ON FUNCTION update_telegram_config_timestamp() TO arasul;
GRANT EXECUTE ON FUNCTION log_telegram_event(VARCHAR, TEXT, JSONB, BOOLEAN, TEXT, BIGINT, INET) TO arasul;
GRANT EXECUTE ON FUNCTION get_or_create_telegram_config() TO arasul;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE telegram_config IS 'Telegram bot configuration (singleton - only one row allowed)';
COMMENT ON TABLE telegram_audit_log IS 'Audit log for all Telegram-related events';

COMMENT ON COLUMN telegram_config.bot_token IS 'Telegram Bot API token (sensitive - mask on API output)';
COMMENT ON COLUMN telegram_config.chat_id IS 'Target Telegram chat/channel ID for notifications';
COMMENT ON COLUMN telegram_config.webhook_url IS 'Webhook URL for receiving Telegram updates';
COMMENT ON COLUMN telegram_config.webhook_secret IS 'Secret token for webhook verification';
COMMENT ON COLUMN telegram_config.notification_settings IS 'JSON configuration for notification types';

COMMENT ON COLUMN telegram_audit_log.event_type IS 'Event type: config_updated, message_sent, webhook_received, connection_test, etc.';
COMMENT ON COLUMN telegram_audit_log.payload IS 'JSON payload with event-specific data';

COMMENT ON FUNCTION log_telegram_event(VARCHAR, TEXT, JSONB, BOOLEAN, TEXT, BIGINT, INET) IS 'Log a Telegram-related event to the audit log';
COMMENT ON FUNCTION get_or_create_telegram_config() IS 'Get the Telegram config row, creating it if it does not exist';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create the singleton config row if it doesn't exist
INSERT INTO telegram_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Log schema creation
SELECT log_telegram_event(
    'schema_created',
    'Telegram schema initialized',
    '{"version": "1.0.0"}'::jsonb,
    true,
    NULL,
    NULL,
    NULL
);
