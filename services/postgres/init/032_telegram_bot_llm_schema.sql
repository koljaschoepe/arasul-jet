-- ============================================================================
-- Telegram Bot 2.0 LLM Schema
-- Session management, message history, and API key storage
-- ============================================================================

-- Sessions Table
-- Tracks per-chat LLM sessions with provider/model preferences
CREATE TABLE IF NOT EXISTS telegram_llm_sessions (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT UNIQUE NOT NULL,
    user_id BIGINT NOT NULL,
    provider VARCHAR(20) DEFAULT 'ollama',
    model VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 0
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_telegram_llm_sessions_chat_id
    ON telegram_llm_sessions(chat_id);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_telegram_llm_sessions_last_message
    ON telegram_llm_sessions(last_message_at);

-- Messages Table (Memory)
-- Stores conversation history for context
CREATE TABLE IF NOT EXISTS telegram_llm_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES telegram_llm_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for message retrieval by session
CREATE INDEX IF NOT EXISTS idx_telegram_llm_messages_session
    ON telegram_llm_messages(session_id, created_at);

-- API Keys Table (Encrypted)
-- Stores user API keys for Claude, Whisper, etc.
CREATE TABLE IF NOT EXISTS telegram_api_keys (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    key_encrypted BYTEA NOT NULL,
    key_iv VARCHAR(64) NOT NULL,
    key_auth_tag VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Index for API key lookup
CREATE INDEX IF NOT EXISTS idx_telegram_api_keys_user_provider
    ON telegram_api_keys(user_id, provider);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_sessions(
    timeout_hours INTEGER DEFAULT 24
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM telegram_llm_sessions
    WHERE last_message_at < NOW() - (timeout_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get session stats
CREATE OR REPLACE FUNCTION get_telegram_session_stats(p_chat_id BIGINT)
RETURNS TABLE (
    session_id INTEGER,
    provider VARCHAR(20),
    model VARCHAR(100),
    message_count INTEGER,
    total_tokens BIGINT,
    created_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id AS session_id,
        s.provider,
        s.model,
        s.message_count,
        COALESCE(SUM(m.tokens), 0)::BIGINT AS total_tokens,
        s.created_at,
        s.last_message_at
    FROM telegram_llm_sessions s
    LEFT JOIN telegram_llm_messages m ON m.session_id = s.id
    WHERE s.chat_id = p_chat_id
    GROUP BY s.id, s.provider, s.model, s.message_count, s.created_at, s.last_message_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE telegram_llm_sessions IS 'Telegram Bot 2.0: LLM chat sessions per chat';
COMMENT ON TABLE telegram_llm_messages IS 'Telegram Bot 2.0: Message history for conversation context';
COMMENT ON TABLE telegram_api_keys IS 'Telegram Bot 2.0: Encrypted API keys for external providers';

COMMENT ON COLUMN telegram_llm_sessions.chat_id IS 'Telegram chat ID (unique per session)';
COMMENT ON COLUMN telegram_llm_sessions.user_id IS 'Telegram user ID who owns the session';
COMMENT ON COLUMN telegram_llm_sessions.provider IS 'LLM provider: ollama, claude';
COMMENT ON COLUMN telegram_llm_sessions.model IS 'Specific model within provider';

COMMENT ON COLUMN telegram_llm_messages.role IS 'Message role: system, user, assistant';
COMMENT ON COLUMN telegram_llm_messages.tokens IS 'Estimated token count for context management';

COMMENT ON COLUMN telegram_api_keys.key_encrypted IS 'AES-256-GCM encrypted API key';
COMMENT ON COLUMN telegram_api_keys.key_iv IS 'Initialization vector (hex)';
COMMENT ON COLUMN telegram_api_keys.key_auth_tag IS 'Authentication tag (hex)';
