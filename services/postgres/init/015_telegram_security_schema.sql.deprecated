-- =====================================================
-- 015_telegram_security_schema.sql
-- Telegram Bot Security: Whitelist, Confirmation, Token Encryption
-- =====================================================

-- Telegram Configuration with encrypted token storage
CREATE TABLE IF NOT EXISTS telegram_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    bot_token_encrypted TEXT,           -- AES-256-GCM encrypted token
    bot_token_iv TEXT,                  -- Initialization vector for decryption
    bot_token_auth_tag TEXT,            -- Authentication tag for GCM
    whitelist_enabled BOOLEAN DEFAULT true,
    confirmation_required BOOLEAN DEFAULT true,
    confirmation_timeout_seconds INTEGER DEFAULT 300, -- 5 minutes default
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_config CHECK (id = 1)
);

-- Initialize with default config if not exists
INSERT INTO telegram_config (id, whitelist_enabled, confirmation_required)
VALUES (1, true, true)
ON CONFLICT (id) DO NOTHING;

-- Telegram Whitelist: Allowed Chat IDs
CREATE TABLE IF NOT EXISTS telegram_whitelist (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL UNIQUE,
    label VARCHAR(255),                  -- Optional friendly name
    added_by VARCHAR(255),               -- Who added this entry
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ           -- Last interaction timestamp
);

-- Index for fast chat_id lookups
CREATE INDEX IF NOT EXISTS idx_telegram_whitelist_chat_id ON telegram_whitelist(chat_id);

-- Pending Confirmations for Critical Actions
CREATE TABLE IF NOT EXISTS telegram_pending_confirmations (
    id SERIAL PRIMARY KEY,
    confirmation_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    chat_id BIGINT NOT NULL,
    action_type VARCHAR(50) NOT NULL,    -- e.g., 'system_reboot', 'container_stop'
    action_payload JSONB,                -- Additional action parameters
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'expired', 'cancelled'
    CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled'))
);

-- Index for token lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_telegram_confirmations_token ON telegram_pending_confirmations(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_telegram_confirmations_status ON telegram_pending_confirmations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_confirmations_chat ON telegram_pending_confirmations(chat_id, status);

-- Audit log for security events
CREATE TABLE IF NOT EXISTS telegram_security_audit (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,     -- 'whitelist_blocked', 'confirmation_required', 'action_confirmed', etc.
    chat_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_telegram_audit_type ON telegram_security_audit(event_type);
CREATE INDEX IF NOT EXISTS idx_telegram_audit_chat ON telegram_security_audit(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_audit_created ON telegram_security_audit(created_at DESC);

-- Function to automatically clean up expired confirmations
CREATE OR REPLACE FUNCTION cleanup_expired_confirmations()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    UPDATE telegram_pending_confirmations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();

    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update last_active_at on whitelist entries
CREATE OR REPLACE FUNCTION update_whitelist_activity(p_chat_id BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE telegram_whitelist
    SET last_active_at = NOW()
    WHERE chat_id = p_chat_id;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE telegram_config IS 'Telegram bot configuration with encrypted token storage';
COMMENT ON TABLE telegram_whitelist IS 'Whitelist of allowed Telegram chat IDs';
COMMENT ON TABLE telegram_pending_confirmations IS 'Pending confirmations for critical actions';
COMMENT ON TABLE telegram_security_audit IS 'Audit log for Telegram security events';
