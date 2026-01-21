-- ============================================================================
-- Telegram Bot App Schema for Arasul Platform
-- Version: 2.0.0
--
-- This schema provides:
-- - Zero-Config Setup Sessions (Magic Setup)
-- - Custom Notification Rules (User-defined triggers)
-- - Orchestrator State (Agent thinking logs)
-- - Bot Configurations (Per-user settings)
-- ============================================================================

-- ============================================================================
-- 1. ZERO-CONFIG SETUP SESSIONS
-- ============================================================================

-- Setup session status enum
DO $$ BEGIN
    CREATE TYPE telegram_setup_status AS ENUM (
        'pending',        -- Session created, waiting for token
        'token_valid',    -- Token validated, waiting for /start
        'waiting_start',  -- Bot deployed, waiting for user to send /start
        'completed',      -- Setup completed successfully
        'expired',        -- Session expired (10 min timeout)
        'failed'          -- Setup failed
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Zero-Config Setup Sessions table
CREATE TABLE IF NOT EXISTS telegram_setup_sessions (
    id SERIAL PRIMARY KEY,

    -- Session identification
    setup_token VARCHAR(64) UNIQUE NOT NULL,

    -- Bot configuration (stored securely)
    bot_token_encrypted BYTEA,  -- AES-256 encrypted bot token
    bot_username VARCHAR(100),

    -- Chat connection
    chat_id BIGINT,
    chat_username VARCHAR(100),
    chat_first_name VARCHAR(100),

    -- User association
    user_id INTEGER REFERENCES admin_users(id),

    -- Status tracking
    status telegram_setup_status DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
    token_validated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Error tracking
    last_error TEXT
);

-- ============================================================================
-- 2. CUSTOM NOTIFICATION RULES
-- ============================================================================

-- Event source enum
DO $$ BEGIN
    CREATE TYPE notification_event_source AS ENUM (
        'claude',     -- Claude Code sessions
        'system',     -- System events (CPU, RAM, Disk)
        'n8n',        -- n8n workflow events
        'services',   -- Docker service events
        'custom'      -- User-defined webhooks
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Severity enum (reuse if exists)
DO $$ BEGIN
    CREATE TYPE notification_severity AS ENUM (
        'info',
        'warning',
        'error',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Custom Notification Rules table
CREATE TABLE IF NOT EXISTS telegram_notification_rules (
    id SERIAL PRIMARY KEY,

    -- Rule identification
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Event matching
    event_source notification_event_source NOT NULL,
    event_type VARCHAR(100) NOT NULL,  -- e.g., 'task_started', 'disk_warning'

    -- Trigger conditions (JSON for flexibility)
    trigger_condition JSONB DEFAULT '{}',
    -- Examples:
    -- {"threshold": 80, "operator": ">="}  for disk usage
    -- {"status": "failed"} for workflow events
    -- {"regex": "ERROR.*timeout"} for log matching

    -- Notification settings
    severity notification_severity DEFAULT 'info',
    message_template TEXT NOT NULL,
    -- Template variables: {{event.type}}, {{event.value}}, {{timestamp}}, etc.

    -- Throttling
    cooldown_seconds INTEGER DEFAULT 60,  -- Min seconds between notifications
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,

    -- Status
    is_enabled BOOLEAN DEFAULT TRUE,

    -- User association
    user_id INTEGER REFERENCES admin_users(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. ORCHESTRATOR STATE (Agent Thinking Logs)
-- ============================================================================

-- Agent type enum
DO $$ BEGIN
    CREATE TYPE telegram_agent_type AS ENUM (
        'master',       -- Master orchestrator
        'setup',        -- Setup agent
        'notification', -- Notification agent
        'command'       -- Command handler agent
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Orchestrator State table
CREATE TABLE IF NOT EXISTS telegram_orchestrator_state (
    id SERIAL PRIMARY KEY,

    -- Agent identification
    agent_type telegram_agent_type NOT NULL,
    session_id VARCHAR(64),

    -- State storage
    state JSONB DEFAULT '{}',

    -- Thinking mode logs (for debugging and transparency)
    thinking_log JSONB DEFAULT '[]',
    -- Format: [{"timestamp": "...", "thought": "...", "action": "..."}]

    -- Performance tracking
    last_action TIMESTAMPTZ DEFAULT NOW(),
    actions_count INTEGER DEFAULT 0,
    avg_response_ms INTEGER,

    -- Unique constraint per agent per session
    UNIQUE(agent_type, session_id)
);

-- ============================================================================
-- 4. BOT CONFIGURATIONS (Per-User Settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_bot_configs (
    id SERIAL PRIMARY KEY,

    -- User association
    user_id INTEGER REFERENCES admin_users(id) UNIQUE,

    -- Bot credentials (encrypted)
    bot_token_encrypted BYTEA,
    chat_id BIGINT,

    -- Bot info (cached from Telegram API)
    bot_username VARCHAR(100),
    bot_first_name VARCHAR(100),

    -- Notification preferences
    notifications_enabled BOOLEAN DEFAULT TRUE,
    quiet_hours_start TIME,  -- e.g., 22:00
    quiet_hours_end TIME,    -- e.g., 07:00
    min_severity notification_severity DEFAULT 'info',

    -- Feature toggles
    claude_notifications BOOLEAN DEFAULT TRUE,
    system_notifications BOOLEAN DEFAULT TRUE,
    n8n_notifications BOOLEAN DEFAULT TRUE,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_message_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. NOTIFICATION HISTORY (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_notification_history (
    id SERIAL PRIMARY KEY,

    -- Rule reference (null for system notifications)
    rule_id INTEGER REFERENCES telegram_notification_rules(id) ON DELETE SET NULL,

    -- User reference
    user_id INTEGER REFERENCES admin_users(id),
    chat_id BIGINT,

    -- Notification content
    event_source notification_event_source,
    event_type VARCHAR(100),
    severity notification_severity,
    message_sent TEXT,

    -- Delivery status
    telegram_message_id BIGINT,
    delivered BOOLEAN DEFAULT FALSE,
    delivery_error TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Setup sessions
CREATE INDEX IF NOT EXISTS idx_telegram_setup_token ON telegram_setup_sessions(setup_token);
CREATE INDEX IF NOT EXISTS idx_telegram_setup_status ON telegram_setup_sessions(status);
CREATE INDEX IF NOT EXISTS idx_telegram_setup_user ON telegram_setup_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_setup_expires ON telegram_setup_sessions(expires_at)
    WHERE status IN ('pending', 'token_valid', 'waiting_start');

-- Notification rules
CREATE INDEX IF NOT EXISTS idx_telegram_rules_source ON telegram_notification_rules(event_source);
CREATE INDEX IF NOT EXISTS idx_telegram_rules_enabled ON telegram_notification_rules(is_enabled)
    WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_telegram_rules_user ON telegram_notification_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_rules_event ON telegram_notification_rules(event_source, event_type);

-- Orchestrator state
CREATE INDEX IF NOT EXISTS idx_telegram_orchestrator_agent ON telegram_orchestrator_state(agent_type);
CREATE INDEX IF NOT EXISTS idx_telegram_orchestrator_session ON telegram_orchestrator_state(session_id);

-- Bot configs
CREATE INDEX IF NOT EXISTS idx_telegram_bot_configs_user ON telegram_bot_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_configs_active ON telegram_bot_configs(is_active)
    WHERE is_active = TRUE;

-- Notification history
CREATE INDEX IF NOT EXISTS idx_telegram_history_user ON telegram_notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_history_created ON telegram_notification_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_history_rule ON telegram_notification_history(rule_id);

-- ============================================================================
-- 7. FUNCTIONS
-- ============================================================================

-- Function to create a setup session
CREATE OR REPLACE FUNCTION create_telegram_setup_session(
    p_user_id INTEGER,
    p_setup_token VARCHAR(64)
)
RETURNS INTEGER AS $$
DECLARE
    v_session_id INTEGER;
BEGIN
    INSERT INTO telegram_setup_sessions (setup_token, user_id, status)
    VALUES (p_setup_token, p_user_id, 'pending')
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete setup
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

    -- Update session
    UPDATE telegram_setup_sessions
    SET chat_id = p_chat_id,
        chat_username = p_chat_username,
        chat_first_name = p_chat_first_name,
        status = 'completed',
        completed_at = NOW()
    WHERE id = v_session.id;

    -- Create or update bot config
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

-- Function to log orchestrator thinking
CREATE OR REPLACE FUNCTION log_orchestrator_thinking(
    p_agent_type telegram_agent_type,
    p_session_id VARCHAR(64),
    p_thought TEXT,
    p_action TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_log_entry JSONB;
BEGIN
    v_log_entry := jsonb_build_object(
        'timestamp', NOW(),
        'thought', p_thought,
        'action', p_action
    );

    INSERT INTO telegram_orchestrator_state (agent_type, session_id, thinking_log, last_action)
    VALUES (p_agent_type, p_session_id, jsonb_build_array(v_log_entry), NOW())
    ON CONFLICT (agent_type, session_id) DO UPDATE
    SET thinking_log = telegram_orchestrator_state.thinking_log || v_log_entry,
        last_action = NOW(),
        actions_count = telegram_orchestrator_state.actions_count + 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check if notification should be sent (cooldown check)
CREATE OR REPLACE FUNCTION should_send_notification(
    p_rule_id INTEGER
)
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

    -- Check cooldown
    IF v_rule.last_triggered_at IS NOT NULL AND
       v_rule.last_triggered_at + (v_rule.cooldown_seconds || ' seconds')::INTERVAL > NOW() THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to mark rule as triggered
CREATE OR REPLACE FUNCTION mark_rule_triggered(
    p_rule_id INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE telegram_notification_rules
    SET last_triggered_at = NOW(),
        trigger_count = trigger_count + 1
    WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE telegram_setup_sessions
    SET status = 'expired'
    WHERE status IN ('pending', 'token_valid', 'waiting_start')
    AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger for updated_at on notification rules
CREATE OR REPLACE FUNCTION update_telegram_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_telegram_rules_updated_at ON telegram_notification_rules;
CREATE TRIGGER trigger_telegram_rules_updated_at
    BEFORE UPDATE ON telegram_notification_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_rules_updated_at();

-- Trigger for updated_at on bot configs
DROP TRIGGER IF EXISTS trigger_telegram_bot_configs_updated_at ON telegram_bot_configs;
CREATE TRIGGER trigger_telegram_bot_configs_updated_at
    BEFORE UPDATE ON telegram_bot_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_rules_updated_at();

-- ============================================================================
-- 9. DEFAULT NOTIFICATION RULES (Pre-configured)
-- ============================================================================

-- Insert default rules for admin user (id=1)
INSERT INTO telegram_notification_rules (name, description, event_source, event_type, severity, message_template, user_id, is_enabled)
VALUES
    -- Claude Events
    ('Claude Task gestartet', 'Benachrichtigung wenn Claude einen Task startet', 'claude', 'task_started', 'info',
     '🚀 <b>Claude Task gestartet</b>\n\nTask: {{event.task_name}}\nZeit: {{timestamp}}', 1, TRUE),

    ('Claude Task abgeschlossen', 'Benachrichtigung wenn Claude einen Task abschließt', 'claude', 'task_completed', 'info',
     '✅ <b>Claude Task abgeschlossen</b>\n\nTask: {{event.task_name}}\nDauer: {{event.duration}}\nZeit: {{timestamp}}', 1, TRUE),

    ('Claude Blocker', 'Warnung wenn Claude einen Blocker erkennt', 'claude', 'blocker', 'warning',
     '⚠️ <b>Claude Blocker erkannt</b>\n\n{{event.message}}\n\nZeit: {{timestamp}}', 1, TRUE),

    ('Claude Rate-Limit', 'Warnung bei Rate-Limit', 'claude', 'rate_limit', 'warning',
     '⏳ <b>Rate-Limit erreicht</b>\n\nWarte {{event.wait_seconds}} Sekunden...\nZeit: {{timestamp}}', 1, TRUE),

    -- System Events
    ('Hohe Disk-Auslastung', 'Warnung bei Disk > 80%', 'system', 'disk_warning', 'warning',
     '💾 <b>Hohe Disk-Auslastung</b>\n\nAktuell: {{event.percent}}%\nFrei: {{event.free_gb}} GB\n\nZeit: {{timestamp}}', 1, TRUE),

    ('Hohe RAM-Auslastung', 'Warnung bei RAM > 90%', 'system', 'ram_warning', 'warning',
     '🧠 <b>Hohe RAM-Auslastung</b>\n\nAktuell: {{event.percent}}%\nFrei: {{event.free_gb}} GB\n\nZeit: {{timestamp}}', 1, TRUE),

    ('Service Neustart', 'Info bei Service-Neustart durch Self-Healing', 'system', 'service_restart', 'info',
     '🔄 <b>Service neu gestartet</b>\n\nService: {{event.service_name}}\nGrund: {{event.reason}}\n\nZeit: {{timestamp}}', 1, TRUE),

    -- n8n Events
    ('Workflow fehlgeschlagen', 'Fehler wenn n8n Workflow fehlschlägt', 'n8n', 'workflow_failed', 'error',
     '❌ <b>Workflow fehlgeschlagen</b>\n\nWorkflow: {{event.workflow_name}}\nFehler: {{event.error}}\n\nZeit: {{timestamp}}', 1, TRUE)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE telegram_setup_sessions IS 'Zero-Config Magic Setup sessions for Telegram Bot';
COMMENT ON TABLE telegram_notification_rules IS 'User-defined notification rules for Telegram';
COMMENT ON TABLE telegram_orchestrator_state IS 'Agent state and thinking logs for debugging';
COMMENT ON TABLE telegram_bot_configs IS 'Per-user Telegram Bot configurations';
COMMENT ON TABLE telegram_notification_history IS 'Audit trail of sent notifications';

COMMENT ON FUNCTION create_telegram_setup_session IS 'Creates a new Zero-Config setup session';
COMMENT ON FUNCTION complete_telegram_setup IS 'Completes setup when user sends /start to bot';
COMMENT ON FUNCTION log_orchestrator_thinking IS 'Logs agent thinking for transparency';
COMMENT ON FUNCTION should_send_notification IS 'Checks cooldown before sending notification';
