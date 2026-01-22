-- Telegram Bot Configuration
-- Stores encrypted bot token and chat settings for notifications
-- Encryption: AES-256-GCM using JWT_SECRET as key (handled in application layer)

-- ============================================================================
-- TELEGRAM CONFIGURATION TABLE (Singleton Pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Single record enforced (singleton)
    bot_token_encrypted TEXT,                          -- AES-256-GCM encrypted token
    bot_token_iv TEXT,                                 -- Initialization vector for decryption
    bot_token_tag TEXT,                                -- Authentication tag for GCM
    chat_id VARCHAR(50),                               -- Default Telegram chat/group ID for notifications
    enabled BOOLEAN DEFAULT false,                     -- Master switch for notifications
    alert_thresholds JSONB DEFAULT '{
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
    }'::jsonb,                                         -- Alert threshold configuration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups (though only one row exists)
CREATE INDEX IF NOT EXISTS idx_telegram_config_enabled ON telegram_config(enabled);

-- ============================================================================
-- AUTOMATIC TIMESTAMP UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_telegram_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_telegram_config_updated_at ON telegram_config;
CREATE TRIGGER trigger_telegram_config_updated_at
    BEFORE UPDATE ON telegram_config
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_config_updated_at();

-- ============================================================================
-- INITIALIZE SINGLETON ROW
-- ============================================================================

INSERT INTO telegram_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE telegram_config IS 'Telegram bot configuration (singleton) with encrypted token for system notifications';
COMMENT ON COLUMN telegram_config.bot_token_encrypted IS 'AES-256-GCM encrypted bot token - decrypt with JWT_SECRET';
COMMENT ON COLUMN telegram_config.bot_token_iv IS 'Initialization vector for AES-256-GCM decryption';
COMMENT ON COLUMN telegram_config.bot_token_tag IS 'Authentication tag for AES-256-GCM verification';
COMMENT ON COLUMN telegram_config.chat_id IS 'Default Telegram chat/group ID for broadcast notifications';
COMMENT ON COLUMN telegram_config.enabled IS 'Master switch to enable/disable all Telegram notifications';
COMMENT ON COLUMN telegram_config.alert_thresholds IS 'JSON configuration for alert thresholds and notification preferences';
