-- ============================================================================
-- Alert Configuration Schema for Arasul Platform
-- Version: 1.0.0
--
-- This schema provides comprehensive alert management:
-- - Configurable thresholds for CPU, RAM, Disk, Temperature
-- - Quiet hours configuration per weekday
-- - Rate limiting / cooldown settings
-- - Alert history tracking
-- ============================================================================

-- Alert type enum
DO $$ BEGIN
    CREATE TYPE alert_metric_type AS ENUM (
        'cpu',
        'ram',
        'disk',
        'temperature'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alert severity enum
DO $$ BEGIN
    CREATE TYPE alert_severity AS ENUM (
        'warning',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alert thresholds configuration
CREATE TABLE IF NOT EXISTS alert_thresholds (
    id SERIAL PRIMARY KEY,
    metric_type alert_metric_type NOT NULL,

    -- Threshold values (percentage for cpu/ram/disk, celsius for temperature)
    warning_threshold DECIMAL(5,2) NOT NULL,
    critical_threshold DECIMAL(5,2) NOT NULL,

    -- Enable/disable this alert type
    enabled BOOLEAN DEFAULT TRUE,

    -- Rate limiting: minimum seconds between alerts of same type
    cooldown_seconds INTEGER DEFAULT 300,  -- 5 minutes default

    -- Description for UI
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    unit VARCHAR(20) DEFAULT '%',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100),

    UNIQUE(metric_type)
);

-- Insert default thresholds (matching .env patterns)
INSERT INTO alert_thresholds (metric_type, warning_threshold, critical_threshold, display_name, description, unit, cooldown_seconds) VALUES
    ('cpu', 80.00, 90.00, 'CPU-Auslastung', 'Prozessorauslastung über alle Kerne', '%', 300),
    ('ram', 80.00, 90.00, 'RAM-Auslastung', 'Arbeitsspeicherauslastung', '%', 300),
    ('disk', 80.00, 95.00, 'Festplatte', 'Speicherplatzbelegung', '%', 600),
    ('temperature', 70.00, 85.00, 'GPU-Temperatur', 'Jetson GPU-Kerntemperatur', '°C', 300)
ON CONFLICT (metric_type) DO NOTHING;

-- Quiet hours configuration (per weekday)
CREATE TABLE IF NOT EXISTS alert_quiet_hours (
    id SERIAL PRIMARY KEY,

    -- Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

    -- Time range (24h format)
    start_time TIME NOT NULL DEFAULT '22:00:00',
    end_time TIME NOT NULL DEFAULT '07:00:00',

    -- Enable/disable for this day
    enabled BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(day_of_week)
);

-- Insert default quiet hours for all days (disabled by default)
INSERT INTO alert_quiet_hours (day_of_week, start_time, end_time, enabled) VALUES
    (0, '22:00:00', '07:00:00', FALSE),  -- Sunday
    (1, '22:00:00', '07:00:00', FALSE),  -- Monday
    (2, '22:00:00', '07:00:00', FALSE),  -- Tuesday
    (3, '22:00:00', '07:00:00', FALSE),  -- Wednesday
    (4, '22:00:00', '07:00:00', FALSE),  -- Thursday
    (5, '22:00:00', '07:00:00', FALSE),  -- Friday
    (6, '22:00:00', '07:00:00', FALSE)   -- Saturday
ON CONFLICT (day_of_week) DO NOTHING;

-- Alert history (tracks fired alerts)
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,

    -- What triggered
    metric_type alert_metric_type NOT NULL,
    severity alert_severity NOT NULL,

    -- Values at time of alert
    current_value DECIMAL(7,2) NOT NULL,
    threshold_value DECIMAL(7,2) NOT NULL,

    -- Message shown to user
    message TEXT NOT NULL,

    -- Notification status
    notified_via VARCHAR(50)[], -- e.g., ['websocket', 'webhook']
    webhook_response_code INTEGER,

    -- Acknowledgment
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(100),

    -- Timestamps
    fired_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    -- Index for efficient queries
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert settings (global configuration)
CREATE TABLE IF NOT EXISTS alert_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton row

    -- Global enable/disable
    alerts_enabled BOOLEAN DEFAULT TRUE,

    -- Webhook configuration
    webhook_url TEXT,
    webhook_enabled BOOLEAN DEFAULT FALSE,
    webhook_secret VARCHAR(255),  -- For HMAC signing

    -- In-app notifications
    in_app_notifications BOOLEAN DEFAULT TRUE,

    -- Audio alert
    audio_enabled BOOLEAN DEFAULT FALSE,

    -- Max alerts to keep in history
    max_history_entries INTEGER DEFAULT 1000,

    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100)
);

-- Insert default settings
INSERT INTO alert_settings (id, alerts_enabled, in_app_notifications)
VALUES (1, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Last alert timestamp per metric (for rate limiting)
CREATE TABLE IF NOT EXISTS alert_last_fired (
    metric_type alert_metric_type PRIMARY KEY,
    severity alert_severity NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_value DECIMAL(7,2)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_alert_history_metric ON alert_history(metric_type);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
CREATE INDEX IF NOT EXISTS idx_alert_history_fired_at ON alert_history(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_acknowledged ON alert_history(acknowledged) WHERE NOT acknowledged;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_alert_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_alert_thresholds_updated ON alert_thresholds;
CREATE TRIGGER trigger_alert_thresholds_updated
    BEFORE UPDATE ON alert_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_updated_at();

DROP TRIGGER IF EXISTS trigger_alert_quiet_hours_updated ON alert_quiet_hours;
CREATE TRIGGER trigger_alert_quiet_hours_updated
    BEFORE UPDATE ON alert_quiet_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_updated_at();

DROP TRIGGER IF EXISTS trigger_alert_settings_updated ON alert_settings;
CREATE TRIGGER trigger_alert_settings_updated
    BEFORE UPDATE ON alert_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_updated_at();

-- Function to check if currently in quiet hours
CREATE OR REPLACE FUNCTION is_in_quiet_hours()
RETURNS BOOLEAN AS $$
DECLARE
    current_dow INTEGER;
    current_time_val TIME;
    quiet_record RECORD;
BEGIN
    -- Get current day of week and time
    current_dow := EXTRACT(DOW FROM NOW());
    current_time_val := NOW()::TIME;

    -- Get quiet hours config for today
    SELECT * INTO quiet_record
    FROM alert_quiet_hours
    WHERE day_of_week = current_dow AND enabled = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if current time is within quiet hours
    -- Handle overnight periods (e.g., 22:00 to 07:00)
    IF quiet_record.start_time > quiet_record.end_time THEN
        -- Overnight: quiet if after start OR before end
        RETURN current_time_val >= quiet_record.start_time
            OR current_time_val <= quiet_record.end_time;
    ELSE
        -- Same day: quiet if between start and end
        RETURN current_time_val >= quiet_record.start_time
           AND current_time_val <= quiet_record.end_time;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limiting for a metric
CREATE OR REPLACE FUNCTION can_fire_alert(p_metric_type alert_metric_type)
RETURNS BOOLEAN AS $$
DECLARE
    last_fired TIMESTAMPTZ;
    cooldown INTEGER;
BEGIN
    -- Get cooldown setting
    SELECT cooldown_seconds INTO cooldown
    FROM alert_thresholds
    WHERE metric_type = p_metric_type AND enabled = TRUE;

    IF NOT FOUND OR cooldown IS NULL THEN
        RETURN FALSE;  -- Alert type not enabled
    END IF;

    -- Get last fired time
    SELECT fired_at INTO last_fired
    FROM alert_last_fired
    WHERE metric_type = p_metric_type;

    IF NOT FOUND THEN
        RETURN TRUE;  -- Never fired before
    END IF;

    -- Check if cooldown has passed
    RETURN NOW() > last_fired + (cooldown || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get alert statistics
CREATE OR REPLACE FUNCTION get_alert_statistics()
RETURNS TABLE (
    total_alerts_24h BIGINT,
    warning_alerts_24h BIGINT,
    critical_alerts_24h BIGINT,
    unacknowledged_count BIGINT,
    alerts_by_type JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE fired_at > NOW() - INTERVAL '24 hours'),
        COUNT(*) FILTER (WHERE fired_at > NOW() - INTERVAL '24 hours' AND severity = 'warning'),
        COUNT(*) FILTER (WHERE fired_at > NOW() - INTERVAL '24 hours' AND severity = 'critical'),
        COUNT(*) FILTER (WHERE NOT acknowledged),
        (
            SELECT jsonb_object_agg(
                metric_type::text,
                cnt
            )
            FROM (
                SELECT metric_type, COUNT(*) as cnt
                FROM alert_history
                WHERE fired_at > NOW() - INTERVAL '24 hours'
                GROUP BY metric_type
            ) sub
        )
    FROM alert_history;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for old history entries
CREATE OR REPLACE FUNCTION cleanup_old_alert_history()
RETURNS INTEGER AS $$
DECLARE
    max_entries INTEGER;
    deleted_count INTEGER;
BEGIN
    -- Get max history setting
    SELECT max_history_entries INTO max_entries
    FROM alert_settings
    WHERE id = 1;

    IF max_entries IS NULL THEN
        max_entries := 1000;
    END IF;

    -- Delete oldest entries exceeding limit
    WITH oldest AS (
        SELECT id FROM alert_history
        ORDER BY fired_at DESC
        OFFSET max_entries
    )
    DELETE FROM alert_history
    WHERE id IN (SELECT id FROM oldest);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE alert_thresholds IS 'Configurable thresholds for system metrics alerts';
COMMENT ON TABLE alert_quiet_hours IS 'Quiet hours configuration to suppress alerts during certain times';
COMMENT ON TABLE alert_history IS 'History of all fired alerts';
COMMENT ON TABLE alert_settings IS 'Global alert system configuration';
COMMENT ON TABLE alert_last_fired IS 'Rate limiting tracker for each metric type';
COMMENT ON FUNCTION is_in_quiet_hours() IS 'Check if current time falls within quiet hours';
COMMENT ON FUNCTION can_fire_alert(alert_metric_type) IS 'Check if an alert can be fired (rate limiting)';
