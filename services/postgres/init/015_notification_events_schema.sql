-- Migration 015: Notification Events Schema
-- Event-Listener-System für proaktive Telegram-Benachrichtigungen

-- Notification Events Table
-- Speichert alle Events für Benachrichtigungen
CREATE TABLE IF NOT EXISTS notification_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,  -- service_status, workflow_event, system_boot, self_healing
    event_category VARCHAR(50) NOT NULL,  -- status_change, completion, failure, recovery
    source_service VARCHAR(100),  -- Container-Name oder Service-Quelle
    severity VARCHAR(20) DEFAULT 'info',  -- info, warning, error, critical
    title VARCHAR(255) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',  -- Zusätzliche Event-Daten
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ,
    notification_error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Settings Table
-- Benutzer-Konfiguration für Benachrichtigungen
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL DEFAULT 'telegram',  -- telegram, webhook, email (future)
    enabled BOOLEAN DEFAULT TRUE,
    -- Event-Typ-Filter (NULL = alle)
    event_types TEXT[] DEFAULT ARRAY['service_status', 'workflow_event', 'system_boot', 'self_healing'],
    -- Severity-Filter (NULL = alle)
    min_severity VARCHAR(20) DEFAULT 'warning',  -- Nur warning+ senden
    -- Rate-Limiting
    rate_limit_per_minute INTEGER DEFAULT 10,
    rate_limit_per_hour INTEGER DEFAULT 100,
    -- Quiet Hours (keine Benachrichtigungen)
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    -- Telegram-spezifisch
    telegram_chat_id VARCHAR(100),
    telegram_bot_token_override VARCHAR(255),  -- Optional: eigener Bot
    -- Webhook-spezifisch (für zukünftige Erweiterungen)
    webhook_url VARCHAR(500),
    webhook_secret VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, channel)
);

-- Service Status Cache
-- Zwischenspeicher für letzten bekannten Status (zur Änderungserkennung)
CREATE TABLE IF NOT EXISTS service_status_cache (
    service_name VARCHAR(100) PRIMARY KEY,
    container_name VARCHAR(255),
    status VARCHAR(50) NOT NULL,  -- running, stopped, exited, restarting, unhealthy
    health VARCHAR(50),  -- healthy, unhealthy, starting, unknown
    last_status VARCHAR(50),  -- Vorheriger Status
    last_health VARCHAR(50),  -- Vorherige Health
    status_changed_at TIMESTAMPTZ DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- System Boot Events
-- Speichert System-Boot-Informationen
CREATE TABLE IF NOT EXISTS system_boot_events (
    id SERIAL PRIMARY KEY,
    boot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_shutdown_timestamp TIMESTAMPTZ,
    shutdown_reason VARCHAR(100),  -- normal, crash, reboot, power_loss, unknown
    uptime_before_shutdown_seconds INTEGER,
    services_status_at_boot JSONB,
    boot_duration_ms INTEGER,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate Limit Tracking
-- Verhindert Spam bei vielen Events
CREATE TABLE IF NOT EXISTS notification_rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER DEFAULT 1,
    UNIQUE(user_id, channel, event_type, window_start)
);

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_notification_events_type ON notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_created ON notification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_unsent ON notification_events(notification_sent) WHERE notification_sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_notification_events_severity ON notification_events(severity);
CREATE INDEX IF NOT EXISTS idx_service_status_cache_changed ON service_status_cache(status_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_boot_events_timestamp ON system_boot_events(boot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notification_rate_limits_window ON notification_rate_limits(user_id, channel, window_start);

-- Function: Record notification event
CREATE OR REPLACE FUNCTION record_notification_event(
    p_event_type VARCHAR(50),
    p_event_category VARCHAR(50),
    p_source_service VARCHAR(100),
    p_severity VARCHAR(20),
    p_title VARCHAR(255),
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS INTEGER AS $$
DECLARE
    v_event_id INTEGER;
BEGIN
    INSERT INTO notification_events (
        event_type, event_category, source_service, severity, title, message, metadata
    ) VALUES (
        p_event_type, p_event_category, p_source_service, p_severity, p_title, p_message, p_metadata
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update service status cache and detect changes
CREATE OR REPLACE FUNCTION update_service_status_cache(
    p_service_name VARCHAR(100),
    p_container_name VARCHAR(255),
    p_status VARCHAR(50),
    p_health VARCHAR(50),
    p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(status_changed BOOLEAN, health_changed BOOLEAN, old_status VARCHAR(50), old_health VARCHAR(50)) AS $$
DECLARE
    v_old_status VARCHAR(50);
    v_old_health VARCHAR(50);
    v_status_changed BOOLEAN := FALSE;
    v_health_changed BOOLEAN := FALSE;
BEGIN
    -- Get current values
    SELECT status, health INTO v_old_status, v_old_health
    FROM service_status_cache
    WHERE service_name = p_service_name;

    -- Check for changes
    IF v_old_status IS NOT NULL AND v_old_status != p_status THEN
        v_status_changed := TRUE;
    END IF;

    IF v_old_health IS NOT NULL AND v_old_health != p_health THEN
        v_health_changed := TRUE;
    END IF;

    -- Upsert the cache entry
    INSERT INTO service_status_cache (
        service_name, container_name, status, health, last_status, last_health,
        status_changed_at, last_checked_at, metadata
    ) VALUES (
        p_service_name, p_container_name, p_status, p_health, v_old_status, v_old_health,
        CASE WHEN v_status_changed OR v_health_changed THEN NOW() ELSE NOW() END,
        NOW(), p_metadata
    )
    ON CONFLICT (service_name) DO UPDATE SET
        container_name = EXCLUDED.container_name,
        last_status = service_status_cache.status,
        last_health = service_status_cache.health,
        status = EXCLUDED.status,
        health = EXCLUDED.health,
        status_changed_at = CASE
            WHEN service_status_cache.status != EXCLUDED.status OR service_status_cache.health != EXCLUDED.health
            THEN NOW()
            ELSE service_status_cache.status_changed_at
        END,
        last_checked_at = NOW(),
        metadata = EXCLUDED.metadata;

    RETURN QUERY SELECT v_status_changed, v_health_changed, v_old_status, v_old_health;
END;
$$ LANGUAGE plpgsql;

-- Function: Check rate limit
CREATE OR REPLACE FUNCTION check_notification_rate_limit(
    p_user_id INTEGER,
    p_channel VARCHAR(50),
    p_event_type VARCHAR(50),
    p_limit_per_minute INTEGER DEFAULT 10
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_count INTEGER;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Round to current minute
    v_window_start := date_trunc('minute', NOW());

    -- Get or create rate limit entry
    INSERT INTO notification_rate_limits (user_id, channel, event_type, window_start, count)
    VALUES (p_user_id, p_channel, p_event_type, v_window_start, 1)
    ON CONFLICT (user_id, channel, event_type, window_start) DO UPDATE
    SET count = notification_rate_limits.count + 1
    RETURNING count INTO v_current_count;

    -- Check if over limit
    RETURN v_current_count <= p_limit_per_minute;
END;
$$ LANGUAGE plpgsql;

-- Function: Record system boot
CREATE OR REPLACE FUNCTION record_system_boot(
    p_services_status JSONB DEFAULT '{}',
    p_boot_duration_ms INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_boot_id INTEGER;
    v_last_boot RECORD;
BEGIN
    -- Get last boot info
    SELECT boot_timestamp, shutdown_reason
    INTO v_last_boot
    FROM system_boot_events
    ORDER BY boot_timestamp DESC
    LIMIT 1;

    -- Insert new boot event
    INSERT INTO system_boot_events (
        boot_timestamp,
        previous_shutdown_timestamp,
        services_status_at_boot,
        boot_duration_ms
    ) VALUES (
        NOW(),
        v_last_boot.boot_timestamp,
        p_services_status,
        p_boot_duration_ms
    ) RETURNING id INTO v_boot_id;

    RETURN v_boot_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark notification as sent
CREATE OR REPLACE FUNCTION mark_notification_sent(
    p_event_id INTEGER,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE notification_events
    SET
        notification_sent = p_success,
        notification_sent_at = CASE WHEN p_success THEN NOW() ELSE NULL END,
        notification_error = p_error,
        retry_count = CASE WHEN NOT p_success THEN retry_count + 1 ELSE retry_count END
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get pending notifications
CREATE OR REPLACE FUNCTION get_pending_notifications(
    p_limit INTEGER DEFAULT 10
) RETURNS SETOF notification_events AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM notification_events
    WHERE notification_sent = FALSE
    AND retry_count < 3  -- Max 3 retries
    AND created_at > NOW() - INTERVAL '1 hour'  -- Only recent events
    ORDER BY
        CASE severity
            WHEN 'critical' THEN 1
            WHEN 'error' THEN 2
            WHEN 'warning' THEN 3
            ELSE 4
        END,
        created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup old notification events (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_notification_events() RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM notification_events
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also cleanup rate limits older than 1 day
    DELETE FROM notification_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 day';

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Insert default notification settings for admin user
INSERT INTO notification_settings (user_id, channel, enabled, event_types, min_severity)
SELECT id, 'telegram', TRUE,
       ARRAY['service_status', 'workflow_event', 'system_boot', 'self_healing'],
       'warning'
FROM users
WHERE username = 'admin'
ON CONFLICT (user_id, channel) DO NOTHING;

-- Comments
COMMENT ON TABLE notification_events IS 'Stores all events that trigger notifications';
COMMENT ON TABLE notification_settings IS 'User preferences for notification delivery';
COMMENT ON TABLE service_status_cache IS 'Caches last known service status for change detection';
COMMENT ON TABLE system_boot_events IS 'Records system boot events for uptime tracking';
COMMENT ON TABLE notification_rate_limits IS 'Prevents notification spam via rate limiting';
