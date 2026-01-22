-- ============================================================================
-- Telegram Bot App Functions Fix
-- Version: 1.0.0
-- Date: 2026-01-19
--
-- This migration adds missing functions that were not created during
-- the initial 027_telegram_app_schema.sql migration.
-- ============================================================================

-- ============================================================================
-- 1. complete_telegram_setup Function
-- Called when user sends /start to the bot during setup
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_telegram_setup(
    p_setup_token VARCHAR(64),
    p_chat_id BIGINT,
    p_chat_username VARCHAR(100),
    p_chat_first_name VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_session telegram_setup_sessions%ROWTYPE;
BEGIN
    -- Get and lock the session
    SELECT * INTO v_session
    FROM telegram_setup_sessions
    WHERE setup_token = p_setup_token
    AND status = 'waiting_start'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Update session with chat info
    UPDATE telegram_setup_sessions
    SET chat_id = p_chat_id,
        chat_username = p_chat_username,
        chat_first_name = p_chat_first_name,
        status = 'completed',
        completed_at = NOW()
    WHERE id = v_session.id;

    -- Create or update bot config for the user
    INSERT INTO telegram_bot_configs (user_id, bot_token_encrypted, chat_id, bot_username)
    VALUES (v_session.user_id, v_session.bot_token_encrypted, p_chat_id, v_session.bot_username)
    ON CONFLICT (user_id) DO UPDATE
    SET bot_token_encrypted = EXCLUDED.bot_token_encrypted,
        chat_id = EXCLUDED.chat_id,
        bot_username = EXCLUDED.bot_username,
        is_active = TRUE,
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_telegram_setup IS 'Completes setup when user sends /start to bot';

-- ============================================================================
-- 2. should_send_notification Function
-- Checks if a notification should be sent based on cooldown rules
-- ============================================================================

CREATE OR REPLACE FUNCTION should_send_notification(p_rule_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_rule telegram_notification_rules%ROWTYPE;
BEGIN
    SELECT * INTO v_rule
    FROM telegram_notification_rules
    WHERE id = p_rule_id AND is_enabled = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check cooldown period
    IF v_rule.last_triggered_at IS NOT NULL AND
       v_rule.last_triggered_at + (v_rule.cooldown_seconds || ' seconds')::INTERVAL > NOW() THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION should_send_notification IS 'Checks cooldown before sending notification';

-- ============================================================================
-- 3. mark_rule_triggered Function
-- Updates rule statistics after a notification is sent
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_rule_triggered(p_rule_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE telegram_notification_rules
    SET last_triggered_at = NOW(),
        trigger_count = trigger_count + 1
    WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_rule_triggered IS 'Updates rule trigger count and timestamp';

-- ============================================================================
-- 4. Insert Default Notification Rules (if not exists)
-- Uses admin_users table instead of users
-- ============================================================================

-- Get admin user ID dynamically
DO $$
DECLARE
    v_admin_id INTEGER;
BEGIN
    -- Try to get admin user ID
    SELECT id INTO v_admin_id FROM admin_users WHERE username = 'admin' LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
        -- Claude Events
        INSERT INTO telegram_notification_rules
        (name, description, event_source, event_type, severity, message_template, user_id, is_enabled, cooldown_seconds)
        VALUES
            ('Claude Task gestartet',
             'Benachrichtigung wenn Claude einen Task startet',
             'claude', 'task_started', 'info',
             E'\\U0001F680 <b>Claude Task gestartet</b>\n\nTask: {{event.task_name}}\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 60),

            ('Claude Task abgeschlossen',
             'Benachrichtigung wenn Claude einen Task abschliesst',
             'claude', 'task_completed', 'info',
             E'\\u2705 <b>Claude Task abgeschlossen</b>\n\nTask: {{event.task_name}}\nDauer: {{event.duration}}\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 60),

            ('Claude Blocker',
             'Warnung wenn Claude einen Blocker erkennt',
             'claude', 'blocker', 'warning',
             E'\\u26A0\\uFE0F <b>Claude Blocker erkannt</b>\n\n{{event.message}}\n\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 300),

            ('Claude Rate-Limit',
             'Warnung bei Rate-Limit',
             'claude', 'rate_limit', 'warning',
             E'\\u23F3 <b>Rate-Limit erreicht</b>\n\nWarte {{event.wait_seconds}} Sekunden...\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 60),

            -- System Events
            ('Hohe Disk-Auslastung',
             'Warnung bei Disk > 80%',
             'system', 'disk_warning', 'warning',
             E'\\U0001F4BE <b>Hohe Disk-Auslastung</b>\n\nAktuell: {{event.percent}}%\nFrei: {{event.free_gb}} GB\n\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 300),

            ('Hohe RAM-Auslastung',
             'Warnung bei RAM > 90%',
             'system', 'ram_warning', 'warning',
             E'\\U0001F9E0 <b>Hohe RAM-Auslastung</b>\n\nAktuell: {{event.percent}}%\nFrei: {{event.free_gb}} GB\n\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 300),

            ('Service Neustart',
             'Info bei Service-Neustart durch Self-Healing',
             'system', 'service_restart', 'info',
             E'\\U0001F504 <b>Service neu gestartet</b>\n\nService: {{event.service_name}}\nGrund: {{event.reason}}\n\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 60),

            -- n8n Events
            ('Workflow fehlgeschlagen',
             'Fehler wenn n8n Workflow fehlschlaegt',
             'n8n', 'workflow_failed', 'error',
             E'\\u274C <b>Workflow fehlgeschlagen</b>\n\nWorkflow: {{event.workflow_name}}\nFehler: {{event.error}}\n\nZeit: {{timestamp}}',
             v_admin_id, TRUE, 60)
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Default notification rules inserted for admin user %', v_admin_id;
    ELSE
        RAISE NOTICE 'No admin user found, skipping default rules';
    END IF;
END $$;

-- ============================================================================
-- 5. Verification Query (for debugging)
-- ============================================================================

-- Verify functions were created
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_proc
    WHERE proname IN ('complete_telegram_setup', 'should_send_notification', 'mark_rule_triggered');

    IF v_count = 3 THEN
        RAISE NOTICE 'All 3 telegram functions created successfully';
    ELSE
        RAISE WARNING 'Expected 3 functions, found %', v_count;
    END IF;
END $$;
