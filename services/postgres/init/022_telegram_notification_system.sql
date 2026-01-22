-- =====================================================
-- 025_telegram_notification_system.sql
-- Konsolidierte Telegram-Benachrichtigungssystem-Erweiterungen
-- Erweitert existierende telegram_config und fügt Rate-Limiting + Message-Log hinzu
-- =====================================================

-- ============================================================================
-- ERWEITERUNG DER TELEGRAM_CONFIG TABELLE
-- Fügt fehlende Spalten hinzu falls sie nicht existieren
-- ============================================================================

-- Funktion um Spalten sicher hinzuzufügen (ohne Fehler wenn bereits vorhanden)
DO $$
BEGIN
    -- bot_token_encrypted (aus 015_telegram_config_schema.sql)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'bot_token_encrypted'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN bot_token_encrypted TEXT;
    END IF;

    -- bot_token_iv (Initialization Vector für AES-256-GCM)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'bot_token_iv'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN bot_token_iv TEXT;
    END IF;

    -- bot_token_tag (Authentication Tag für AES-256-GCM)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'bot_token_tag'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN bot_token_tag TEXT;
    END IF;

    -- alert_thresholds JSONB für flexible Schwellwerte
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'alert_thresholds'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN alert_thresholds JSONB DEFAULT '{
            "cpu_warning": 80,
            "cpu_critical": 95,
            "ram_warning": 80,
            "ram_critical": 95,
            "disk_warning": 80,
            "disk_critical": 95,
            "gpu_warning": 85,
            "gpu_critical": 95,
            "temperature_warning": 75,
            "temperature_critical": 85,
            "notify_on_warning": false,
            "notify_on_critical": true,
            "notify_on_service_down": true,
            "notify_on_self_healing": true,
            "cooldown_minutes": 15
        }'::jsonb;
    END IF;

    -- notification_preferences JSONB für Benachrichtigungs-Einstellungen
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'notification_preferences'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN notification_preferences JSONB DEFAULT '{
            "system_alerts": true,
            "self_healing_events": true,
            "service_status_changes": true,
            "login_alerts": true,
            "daily_summary": false,
            "quiet_hours_enabled": false,
            "quiet_hours_start": "22:00",
            "quiet_hours_end": "07:00"
        }'::jsonb;
    END IF;

    -- test_message_sent_at Timestamp für letzten Test
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'test_message_sent_at'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN test_message_sent_at TIMESTAMPTZ;
    END IF;

    -- last_error für Fehler-Tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'last_error'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN last_error TEXT;
    END IF;

    -- last_error_at Timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'last_error_at'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN last_error_at TIMESTAMPTZ;
    END IF;

    -- connection_verified Flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'connection_verified'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN connection_verified BOOLEAN DEFAULT FALSE;
    END IF;

    -- connection_verified_at Timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'connection_verified_at'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN connection_verified_at TIMESTAMPTZ;
    END IF;

    -- bot_username (from getMe API call)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_config' AND column_name = 'bot_username'
    ) THEN
        ALTER TABLE telegram_config ADD COLUMN bot_username VARCHAR(100);
    END IF;
END $$;

-- ============================================================================
-- TELEGRAM RATE LIMITS TABELLE
-- Verhindert Überschreitung der Telegram API Limits (30 msg/sec to same chat)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_rate_limits (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(50) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    message_count INTEGER DEFAULT 1,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chat_id, window_start)
);

-- Index für schnelle Lookups und Cleanup
CREATE INDEX IF NOT EXISTS idx_telegram_rate_limits_chat
    ON telegram_rate_limits(chat_id, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_rate_limits_cleanup
    ON telegram_rate_limits(window_start);

-- ============================================================================
-- TELEGRAM MESSAGE LOG TABELLE
-- Audit-Trail für alle gesendeten Telegram-Nachrichten
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_message_log (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) NOT NULL,  -- alert, test, notification, daily_summary
    severity VARCHAR(20),                -- info, warning, error, critical
    title VARCHAR(255),
    message_text TEXT NOT NULL,
    message_id INTEGER,                  -- Telegram message_id (für Edit/Delete)
    metadata JSONB DEFAULT '{}',         -- Zusätzliche Daten (Alert-Details, etc.)
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    source_event_id INTEGER,             -- Referenz auf notification_events.id
    triggered_by VARCHAR(100)            -- system, user:{username}, scheduler
);

-- Indexes für Message Log
CREATE INDEX IF NOT EXISTS idx_telegram_message_log_chat
    ON telegram_message_log(chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_message_log_type
    ON telegram_message_log(message_type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_message_log_severity
    ON telegram_message_log(severity, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_message_log_sent
    ON telegram_message_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_message_log_failed
    ON telegram_message_log(delivered) WHERE delivered = FALSE;

-- ============================================================================
-- TELEGRAM ALERT COOLDOWNS TABELLE
-- Verhindert Alert-Spam durch Cooldown pro Alert-Typ
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_alert_cooldowns (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,   -- cpu_critical, service_down:container_name, etc.
    chat_id VARCHAR(50) NOT NULL,
    last_alert_at TIMESTAMPTZ DEFAULT NOW(),
    alert_count INTEGER DEFAULT 1,
    UNIQUE(alert_type, chat_id)
);

-- Index für Cooldown-Checks
CREATE INDEX IF NOT EXISTS idx_telegram_alert_cooldowns_lookup
    ON telegram_alert_cooldowns(alert_type, chat_id, last_alert_at);

-- ============================================================================
-- FUNKTIONEN
-- ============================================================================

-- Funktion: Rate-Limit prüfen und inkrementieren
-- Gibt TRUE zurück wenn Nachricht gesendet werden darf
CREATE OR REPLACE FUNCTION check_telegram_rate_limit(
    p_chat_id VARCHAR(50),
    p_max_per_second INTEGER DEFAULT 30,
    p_max_per_minute INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
    v_second_window TIMESTAMPTZ;
    v_minute_window TIMESTAMPTZ;
    v_second_count INTEGER;
    v_minute_count INTEGER;
BEGIN
    -- Aktuelle Fenster berechnen
    v_second_window := date_trunc('second', NOW());
    v_minute_window := date_trunc('minute', NOW());

    -- Zähler für aktuelle Sekunde
    SELECT COALESCE(SUM(message_count), 0) INTO v_second_count
    FROM telegram_rate_limits
    WHERE chat_id = p_chat_id
    AND window_start = v_second_window;

    -- Zähler für aktuelle Minute
    SELECT COALESCE(SUM(message_count), 0) INTO v_minute_count
    FROM telegram_rate_limits
    WHERE chat_id = p_chat_id
    AND window_start >= v_minute_window;

    -- Limit prüfen
    IF v_second_count >= p_max_per_second OR v_minute_count >= p_max_per_minute THEN
        RETURN FALSE;
    END IF;

    -- Rate-Limit inkrementieren
    INSERT INTO telegram_rate_limits (chat_id, window_start, message_count, last_message_at)
    VALUES (p_chat_id, v_second_window, 1, NOW())
    ON CONFLICT (chat_id, window_start) DO UPDATE
    SET message_count = telegram_rate_limits.message_count + 1,
        last_message_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Funktion: Alert-Cooldown prüfen
-- Gibt TRUE zurück wenn Alert gesendet werden darf (nicht im Cooldown)
CREATE OR REPLACE FUNCTION check_telegram_alert_cooldown(
    p_alert_type VARCHAR(100),
    p_chat_id VARCHAR(50),
    p_cooldown_minutes INTEGER DEFAULT 15
) RETURNS BOOLEAN AS $$
DECLARE
    v_last_alert TIMESTAMPTZ;
    v_cooldown_until TIMESTAMPTZ;
BEGIN
    -- Letzten Alert dieses Typs finden
    SELECT last_alert_at INTO v_last_alert
    FROM telegram_alert_cooldowns
    WHERE alert_type = p_alert_type AND chat_id = p_chat_id;

    -- Wenn kein vorheriger Alert, erlauben
    IF v_last_alert IS NULL THEN
        INSERT INTO telegram_alert_cooldowns (alert_type, chat_id, last_alert_at, alert_count)
        VALUES (p_alert_type, p_chat_id, NOW(), 1);
        RETURN TRUE;
    END IF;

    -- Cooldown-Ende berechnen
    v_cooldown_until := v_last_alert + (p_cooldown_minutes || ' minutes')::INTERVAL;

    -- Prüfen ob Cooldown abgelaufen
    IF NOW() >= v_cooldown_until THEN
        UPDATE telegram_alert_cooldowns
        SET last_alert_at = NOW(), alert_count = alert_count + 1
        WHERE alert_type = p_alert_type AND chat_id = p_chat_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Funktion: Nachricht loggen
CREATE OR REPLACE FUNCTION log_telegram_message(
    p_chat_id VARCHAR(50),
    p_message_type VARCHAR(50),
    p_message_text TEXT,
    p_severity VARCHAR(20) DEFAULT NULL,
    p_title VARCHAR(255) DEFAULT NULL,
    p_message_id INTEGER DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}',
    p_delivered BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL,
    p_triggered_by VARCHAR(100) DEFAULT 'system'
) RETURNS INTEGER AS $$
DECLARE
    v_log_id INTEGER;
BEGIN
    INSERT INTO telegram_message_log (
        chat_id, message_type, severity, title, message_text,
        message_id, metadata, delivered, error_message, triggered_by
    ) VALUES (
        p_chat_id, p_message_type, p_severity, p_title, p_message_text,
        p_message_id, p_metadata, p_delivered, p_error_message, p_triggered_by
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Funktion: Alte Rate-Limit-Einträge bereinigen (älter als 1 Stunde)
CREATE OR REPLACE FUNCTION cleanup_telegram_rate_limits() RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM telegram_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Funktion: Alte Message-Logs bereinigen (älter als 30 Tage)
CREATE OR REPLACE FUNCTION cleanup_telegram_message_logs(
    p_retention_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM telegram_message_log
    WHERE sent_at < NOW() - (p_retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Telegram-Statistiken der letzten 24 Stunden
CREATE OR REPLACE VIEW v_telegram_stats_24h AS
SELECT
    message_type,
    severity,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE delivered = TRUE) as delivered,
    COUNT(*) FILTER (WHERE delivered = FALSE) as failed,
    MAX(sent_at) as last_message_at
FROM telegram_message_log
WHERE sent_at > NOW() - INTERVAL '24 hours'
GROUP BY message_type, severity
ORDER BY total_messages DESC;

-- View: Aktive Cooldowns
CREATE OR REPLACE VIEW v_telegram_active_cooldowns AS
SELECT
    tac.alert_type,
    tac.chat_id,
    tac.last_alert_at,
    tac.alert_count,
    tc.alert_thresholds->>'cooldown_minutes' as cooldown_minutes,
    tac.last_alert_at +
        ((COALESCE(tc.alert_thresholds->>'cooldown_minutes', '15')::INTEGER) || ' minutes')::INTERVAL
        as cooldown_until,
    CASE
        WHEN NOW() < tac.last_alert_at +
            ((COALESCE(tc.alert_thresholds->>'cooldown_minutes', '15')::INTEGER) || ' minutes')::INTERVAL
        THEN TRUE
        ELSE FALSE
    END as is_active
FROM telegram_alert_cooldowns tac
CROSS JOIN telegram_config tc
WHERE tc.id = 1;

-- View: Letzte 50 Telegram-Nachrichten
CREATE OR REPLACE VIEW v_telegram_recent_messages AS
SELECT
    id,
    chat_id,
    message_type,
    severity,
    title,
    LEFT(message_text, 100) as message_preview,
    delivered,
    error_message,
    sent_at,
    triggered_by
FROM telegram_message_log
ORDER BY sent_at DESC
LIMIT 50;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL PRIVILEGES ON telegram_rate_limits TO arasul;
GRANT ALL PRIVILEGES ON telegram_message_log TO arasul;
GRANT ALL PRIVILEGES ON telegram_alert_cooldowns TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE telegram_rate_limits_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE telegram_message_log_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE telegram_alert_cooldowns_id_seq TO arasul;

GRANT EXECUTE ON FUNCTION check_telegram_rate_limit(VARCHAR, INTEGER, INTEGER) TO arasul;
GRANT EXECUTE ON FUNCTION check_telegram_alert_cooldown(VARCHAR, VARCHAR, INTEGER) TO arasul;
GRANT EXECUTE ON FUNCTION log_telegram_message(VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, INTEGER, JSONB, BOOLEAN, TEXT, VARCHAR) TO arasul;
GRANT EXECUTE ON FUNCTION cleanup_telegram_rate_limits() TO arasul;
GRANT EXECUTE ON FUNCTION cleanup_telegram_message_logs(INTEGER) TO arasul;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE telegram_rate_limits IS 'Rate-Limiting für Telegram API (30 msg/sec pro Chat)';
COMMENT ON TABLE telegram_message_log IS 'Audit-Log für alle gesendeten Telegram-Nachrichten';
COMMENT ON TABLE telegram_alert_cooldowns IS 'Cooldown-Tracking pro Alert-Typ zur Spam-Vermeidung';

COMMENT ON FUNCTION check_telegram_rate_limit IS 'Prüft und aktualisiert Rate-Limit für Telegram-Chat';
COMMENT ON FUNCTION check_telegram_alert_cooldown IS 'Prüft ob Alert-Cooldown abgelaufen ist';
COMMENT ON FUNCTION log_telegram_message IS 'Loggt gesendete Telegram-Nachricht';
COMMENT ON FUNCTION cleanup_telegram_rate_limits IS 'Bereinigt alte Rate-Limit-Einträge (> 1 Stunde)';
COMMENT ON FUNCTION cleanup_telegram_message_logs IS 'Bereinigt alte Message-Logs (Standard: 30 Tage)';

-- ============================================================================
-- INITIALISIERUNG
-- ============================================================================

-- Singleton-Zeile sicherstellen (falls telegram_config existiert aber leer ist)
INSERT INTO telegram_config (id, enabled)
VALUES (1, false)
ON CONFLICT DO NOTHING;
