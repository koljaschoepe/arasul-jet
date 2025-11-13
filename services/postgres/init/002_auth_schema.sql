-- ARASUL PLATFORM - Authentication Schema
-- Version: 1.0.0
-- Description: User authentication, sessions, and token management

-- ============================================================================
-- ADMIN USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_active ON admin_users(is_active);

-- ============================================================================
-- TOKEN BLACKLIST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
    id BIGSERIAL PRIMARY KEY,
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES admin_users(id) ON DELETE CASCADE,
    blacklisted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);

-- ============================================================================
-- LOGIN ATTEMPTS TABLE (Rate Limiting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT
);

CREATE INDEX idx_login_attempts_username ON login_attempts(username);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX idx_login_attempts_time ON login_attempts(attempted_at DESC);

-- ============================================================================
-- ACTIVE SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS active_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES admin_users(id) ON DELETE CASCADE,
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_jti ON active_sessions(token_jti);
CREATE INDEX idx_active_sessions_expires ON active_sessions(expires_at);

-- ============================================================================
-- PASSWORD CHANGE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES admin_users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by VARCHAR(50),
    ip_address INET
);

CREATE INDEX idx_password_history_user ON password_history(user_id);
CREATE INDEX idx_password_history_time ON password_history(changed_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to cleanup expired tokens and sessions
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
    -- Delete expired tokens from blacklist
    DELETE FROM token_blacklist WHERE expires_at < NOW();

    -- Delete expired sessions
    DELETE FROM active_sessions WHERE expires_at < NOW();

    -- Delete old login attempts (older than 7 days)
    DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '7 days';

    -- Delete old password history (keep last 5 per user)
    DELETE FROM password_history
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY changed_at DESC) as rn
            FROM password_history
        ) sub WHERE rn > 5
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is locked
CREATE OR REPLACE FUNCTION is_user_locked(p_username VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_locked_until TIMESTAMPTZ;
BEGIN
    SELECT locked_until INTO v_locked_until
    FROM admin_users
    WHERE username = p_username;

    IF v_locked_until IS NULL THEN
        RETURN false;
    END IF;

    IF v_locked_until > NOW() THEN
        RETURN true;
    ELSE
        -- Unlock user if lock period expired
        UPDATE admin_users
        SET locked_until = NULL, login_attempts = 0
        WHERE username = p_username;
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_username VARCHAR,
    p_ip_address INET,
    p_success BOOLEAN,
    p_user_agent TEXT
)
RETURNS void AS $$
BEGIN
    INSERT INTO login_attempts (username, ip_address, success, user_agent)
    VALUES (p_username, p_ip_address, p_success, p_user_agent);

    IF p_success THEN
        -- Reset login attempts on success
        UPDATE admin_users
        SET login_attempts = 0, last_login = NOW(), locked_until = NULL
        WHERE username = p_username;
    ELSE
        -- Increment failed attempts
        UPDATE admin_users
        SET login_attempts = login_attempts + 1
        WHERE username = p_username;

        -- Lock account after 5 failed attempts for 15 minutes
        UPDATE admin_users
        SET locked_until = NOW() + INTERVAL '15 minutes'
        WHERE username = p_username
        AND login_attempts >= 5
        AND (locked_until IS NULL OR locked_until < NOW());
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity(p_token_jti VARCHAR)
RETURNS void AS $$
BEGIN
    UPDATE active_sessions
    SET last_activity = NOW()
    WHERE token_jti = p_token_jti;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for user login statistics
CREATE OR REPLACE VIEW v_user_login_stats AS
SELECT
    u.username,
    u.last_login,
    u.login_attempts,
    u.locked_until,
    COUNT(la.id) FILTER (WHERE la.attempted_at > NOW() - INTERVAL '24 hours') as attempts_24h,
    COUNT(la.id) FILTER (WHERE la.attempted_at > NOW() - INTERVAL '24 hours' AND la.success) as successful_24h,
    COUNT(s.id) as active_sessions
FROM admin_users u
LEFT JOIN login_attempts la ON la.username = u.username
LEFT JOIN active_sessions s ON s.user_id = u.id AND s.expires_at > NOW()
GROUP BY u.id, u.username, u.last_login, u.login_attempts, u.locked_until;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL PRIVILEGES ON admin_users TO arasul;
GRANT ALL PRIVILEGES ON token_blacklist TO arasul;
GRANT ALL PRIVILEGES ON login_attempts TO arasul;
GRANT ALL PRIVILEGES ON active_sessions TO arasul;
GRANT ALL PRIVILEGES ON password_history TO arasul;

GRANT ALL PRIVILEGES ON SEQUENCE admin_users_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE token_blacklist_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE login_attempts_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE active_sessions_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE password_history_id_seq TO arasul;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arasul;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE admin_users IS 'Administrator user accounts';
COMMENT ON TABLE token_blacklist IS 'Blacklisted JWT tokens (logged out)';
COMMENT ON TABLE login_attempts IS 'Login attempt history for security monitoring';
COMMENT ON TABLE active_sessions IS 'Active user sessions';
COMMENT ON TABLE password_history IS 'Password change history';

COMMENT ON FUNCTION cleanup_expired_auth_data() IS 'Cleanup expired tokens, sessions, and old login attempts';
COMMENT ON FUNCTION is_user_locked(VARCHAR) IS 'Check if user account is locked due to failed login attempts';
COMMENT ON FUNCTION record_login_attempt(VARCHAR, INET, BOOLEAN, TEXT) IS 'Record login attempt and handle account locking';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Note: Initial admin user will be created by bootstrap script
-- This just ensures the table structure is ready

-- Note: Schema creation logging removed because self_healing_events table
-- is created in 003_self_healing_schema.sql (executed after this file)
