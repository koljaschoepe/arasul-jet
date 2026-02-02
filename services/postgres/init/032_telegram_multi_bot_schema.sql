-- ============================================================================
-- Telegram Multi-Bot Management Schema
-- Version: 3.0.0
--
-- This migration transforms the single-bot architecture to a multi-bot system:
-- - Multiple bots per user (telegram_bots)
-- - Custom slash commands per bot (telegram_bot_commands)
-- - Multiple chats per bot (telegram_bot_chats)
-- - LLM conversation sessions (telegram_bot_sessions)
--
-- BREAKING CHANGES:
-- - Drops telegram_bot_configs (replaced by telegram_bots)
-- - Drops telegram_api_keys, telegram_llm_messages, telegram_llm_sessions (Bot 2.0 remnants)
-- - Adds bot_id foreign keys to notification_rules and notification_history
-- ============================================================================

-- ============================================================================
-- 1. CLEANUP: Drop old Bot 2.0 tables
-- ============================================================================

DROP TABLE IF EXISTS telegram_llm_messages CASCADE;
DROP TABLE IF EXISTS telegram_llm_sessions CASCADE;
DROP TABLE IF EXISTS telegram_api_keys CASCADE;

-- ============================================================================
-- 2. CREATE: Main Multi-Bot Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_bots (
    id SERIAL PRIMARY KEY,

    -- Owner
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,

    -- Bot identity
    name VARCHAR(100) NOT NULL,
    bot_username VARCHAR(100),

    -- Encrypted bot token (AES-256-GCM)
    bot_token_encrypted BYTEA NOT NULL,
    bot_token_iv VARCHAR(64) NOT NULL,
    bot_token_tag VARCHAR(64) NOT NULL,

    -- LLM Configuration
    system_prompt TEXT DEFAULT 'Du bist ein hilfreicher Assistent. Antworte freundlich und auf Deutsch.',
    llm_provider VARCHAR(20) DEFAULT 'ollama' CHECK (llm_provider IN ('ollama', 'claude')),
    llm_model VARCHAR(100),

    -- Claude API Key (optional, encrypted)
    claude_api_key_encrypted BYTEA,
    claude_api_key_iv VARCHAR(64),
    claude_api_key_tag VARCHAR(64),

    -- Webhook configuration
    webhook_secret VARCHAR(64),
    webhook_url TEXT,

    -- Status
    is_active BOOLEAN DEFAULT false,
    is_polling BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,

    -- Constraints
    UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_bots_user ON telegram_bots(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bots_active ON telegram_bots(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_telegram_bots_username ON telegram_bots(bot_username);

-- ============================================================================
-- 3. CREATE: Custom Commands per Bot
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_bot_commands (
    id SERIAL PRIMARY KEY,

    -- Bot reference
    bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE NOT NULL,

    -- Command definition
    command VARCHAR(32) NOT NULL,
    description VARCHAR(256) NOT NULL,
    prompt TEXT NOT NULL,

    -- Status
    is_enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(bot_id, command)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_bot_commands_bot ON telegram_bot_commands(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_commands_enabled ON telegram_bot_commands(bot_id, is_enabled)
    WHERE is_enabled = TRUE;

-- ============================================================================
-- 4. CREATE: Chats per Bot
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_bot_chats (
    id SERIAL PRIMARY KEY,

    -- Bot reference
    bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE NOT NULL,

    -- Chat info
    chat_id BIGINT NOT NULL,
    chat_title VARCHAR(256),
    chat_type VARCHAR(20) DEFAULT 'private' CHECK (chat_type IN ('private', 'group', 'supergroup', 'channel')),
    chat_username VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,

    -- Timestamps
    added_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,

    -- Constraints
    UNIQUE(bot_id, chat_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_bot_chats_bot ON telegram_bot_chats(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_chats_chat ON telegram_bot_chats(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_chats_active ON telegram_bot_chats(bot_id, is_active)
    WHERE is_active = TRUE;

-- ============================================================================
-- 5. CREATE: LLM Sessions per Bot+Chat
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_bot_sessions (
    id SERIAL PRIMARY KEY,

    -- References
    bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE NOT NULL,
    chat_id BIGINT NOT NULL,

    -- Conversation history (JSONB array)
    messages JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"role": "user"|"assistant", "content": "...", "timestamp": "..."}]

    -- Token tracking
    token_count INTEGER DEFAULT 0,
    max_tokens INTEGER DEFAULT 4096,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(bot_id, chat_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_bot ON telegram_bot_sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_chat ON telegram_bot_sessions(bot_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_updated ON telegram_bot_sessions(updated_at DESC);

-- ============================================================================
-- 6. MODIFY: Add bot_id to notification_rules
-- ============================================================================

-- Add column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_notification_rules' AND column_name = 'bot_id'
    ) THEN
        ALTER TABLE telegram_notification_rules
        ADD COLUMN bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Index for bot_id
CREATE INDEX IF NOT EXISTS idx_telegram_rules_bot ON telegram_notification_rules(bot_id);

-- ============================================================================
-- 7. MODIFY: Add bot_id to notification_history
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_notification_history' AND column_name = 'bot_id'
    ) THEN
        ALTER TABLE telegram_notification_history
        ADD COLUMN bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_telegram_history_bot ON telegram_notification_history(bot_id);

-- ============================================================================
-- 8. MODIFY: Add bot_id to setup_sessions
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_setup_sessions' AND column_name = 'bot_id'
    ) THEN
        ALTER TABLE telegram_setup_sessions
        ADD COLUMN bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE SET NULL;
    END IF;

    -- Add bot_name column for wizard
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_setup_sessions' AND column_name = 'bot_name'
    ) THEN
        ALTER TABLE telegram_setup_sessions
        ADD COLUMN bot_name VARCHAR(100);
    END IF;

    -- Add llm_provider column for wizard
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_setup_sessions' AND column_name = 'llm_provider'
    ) THEN
        ALTER TABLE telegram_setup_sessions
        ADD COLUMN llm_provider VARCHAR(20) DEFAULT 'ollama';
    END IF;
END $$;

-- ============================================================================
-- 9. FUNCTIONS: Multi-Bot Support
-- ============================================================================

-- Function to create a new bot
CREATE OR REPLACE FUNCTION create_telegram_bot(
    p_user_id INTEGER,
    p_name VARCHAR(100),
    p_bot_token_encrypted BYTEA,
    p_bot_token_iv VARCHAR(64),
    p_bot_token_tag VARCHAR(64),
    p_bot_username VARCHAR(100) DEFAULT NULL,
    p_llm_provider VARCHAR(20) DEFAULT 'ollama',
    p_system_prompt TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_bot_id INTEGER;
BEGIN
    INSERT INTO telegram_bots (
        user_id, name, bot_token_encrypted, bot_token_iv, bot_token_tag,
        bot_username, llm_provider, system_prompt
    )
    VALUES (
        p_user_id, p_name, p_bot_token_encrypted, p_bot_token_iv, p_bot_token_tag,
        p_bot_username, p_llm_provider, COALESCE(p_system_prompt, 'Du bist ein hilfreicher Assistent.')
    )
    RETURNING id INTO v_bot_id;

    RETURN v_bot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add a chat to a bot
CREATE OR REPLACE FUNCTION add_telegram_bot_chat(
    p_bot_id INTEGER,
    p_chat_id BIGINT,
    p_chat_title VARCHAR(256) DEFAULT NULL,
    p_chat_type VARCHAR(20) DEFAULT 'private',
    p_chat_username VARCHAR(100) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_chat_row_id INTEGER;
BEGIN
    INSERT INTO telegram_bot_chats (bot_id, chat_id, chat_title, chat_type, chat_username)
    VALUES (p_bot_id, p_chat_id, p_chat_title, p_chat_type, p_chat_username)
    ON CONFLICT (bot_id, chat_id) DO UPDATE
    SET chat_title = COALESCE(EXCLUDED.chat_title, telegram_bot_chats.chat_title),
        chat_type = EXCLUDED.chat_type,
        chat_username = COALESCE(EXCLUDED.chat_username, telegram_bot_chats.chat_username),
        is_active = TRUE,
        last_message_at = NOW()
    RETURNING id INTO v_chat_row_id;

    RETURN v_chat_row_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create session
CREATE OR REPLACE FUNCTION get_or_create_bot_session(
    p_bot_id INTEGER,
    p_chat_id BIGINT
)
RETURNS INTEGER AS $$
DECLARE
    v_session_id INTEGER;
BEGIN
    -- Try to get existing session
    SELECT id INTO v_session_id
    FROM telegram_bot_sessions
    WHERE bot_id = p_bot_id AND chat_id = p_chat_id;

    IF v_session_id IS NULL THEN
        -- Create new session
        INSERT INTO telegram_bot_sessions (bot_id, chat_id)
        VALUES (p_bot_id, p_chat_id)
        RETURNING id INTO v_session_id;
    END IF;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add message to session
CREATE OR REPLACE FUNCTION add_message_to_session(
    p_bot_id INTEGER,
    p_chat_id BIGINT,
    p_role VARCHAR(20),
    p_content TEXT,
    p_tokens INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    v_message JSONB;
BEGIN
    v_message := jsonb_build_object(
        'role', p_role,
        'content', p_content,
        'timestamp', NOW()
    );

    INSERT INTO telegram_bot_sessions (bot_id, chat_id, messages, token_count)
    VALUES (p_bot_id, p_chat_id, jsonb_build_array(v_message), p_tokens)
    ON CONFLICT (bot_id, chat_id) DO UPDATE
    SET messages = telegram_bot_sessions.messages || v_message,
        token_count = telegram_bot_sessions.token_count + p_tokens,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to clear session (for /new command)
CREATE OR REPLACE FUNCTION clear_bot_session(
    p_bot_id INTEGER,
    p_chat_id BIGINT
)
RETURNS VOID AS $$
BEGIN
    UPDATE telegram_bot_sessions
    SET messages = '[]'::jsonb,
        token_count = 0,
        updated_at = NOW()
    WHERE bot_id = p_bot_id AND chat_id = p_chat_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update setup session with bot reference
CREATE OR REPLACE FUNCTION complete_multibot_setup(
    p_setup_token VARCHAR(64),
    p_chat_id BIGINT,
    p_chat_username VARCHAR(100),
    p_chat_first_name VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
    v_session telegram_setup_sessions%ROWTYPE;
    v_bot_id INTEGER;
BEGIN
    -- Get and lock the session
    SELECT * INTO v_session
    FROM telegram_setup_sessions
    WHERE setup_token = p_setup_token
    AND status = 'waiting_start'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Create the bot
    INSERT INTO telegram_bots (
        user_id, name, bot_token_encrypted, bot_token_iv, bot_token_tag,
        bot_username, llm_provider, is_active
    )
    VALUES (
        v_session.user_id,
        COALESCE(v_session.bot_name, v_session.bot_username, 'Neuer Bot'),
        v_session.bot_token_encrypted,
        '', -- IV will be stored differently
        '', -- Tag will be stored differently
        v_session.bot_username,
        COALESCE(v_session.llm_provider, 'ollama'),
        TRUE
    )
    RETURNING id INTO v_bot_id;

    -- Add the chat
    PERFORM add_telegram_bot_chat(v_bot_id, p_chat_id, NULL, 'private', p_chat_username);

    -- Update session
    UPDATE telegram_setup_sessions
    SET chat_id = p_chat_id,
        chat_username = p_chat_username,
        chat_first_name = p_chat_first_name,
        status = 'completed',
        completed_at = NOW(),
        bot_id = v_bot_id
    WHERE id = v_session.id;

    RETURN v_bot_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. TRIGGERS: Auto-update timestamps
-- ============================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_telegram_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to telegram_bots
DROP TRIGGER IF EXISTS trigger_telegram_bots_updated_at ON telegram_bots;
CREATE TRIGGER trigger_telegram_bots_updated_at
    BEFORE UPDATE ON telegram_bots
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_updated_at();

-- Apply to telegram_bot_commands
DROP TRIGGER IF EXISTS trigger_telegram_bot_commands_updated_at ON telegram_bot_commands;
CREATE TRIGGER trigger_telegram_bot_commands_updated_at
    BEFORE UPDATE ON telegram_bot_commands
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_updated_at();

-- Apply to telegram_bot_sessions
DROP TRIGGER IF EXISTS trigger_telegram_bot_sessions_updated_at ON telegram_bot_sessions;
CREATE TRIGGER trigger_telegram_bot_sessions_updated_at
    BEFORE UPDATE ON telegram_bot_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_updated_at();

-- ============================================================================
-- 11. MIGRATION: Move data from telegram_bot_configs to telegram_bots
-- ============================================================================

-- Migrate existing bot configs to new multi-bot table
INSERT INTO telegram_bots (
    user_id, name, bot_token_encrypted, bot_token_iv, bot_token_tag,
    bot_username, is_active
)
SELECT
    user_id,
    COALESCE(bot_username, 'Bot ' || user_id),
    bot_token_encrypted,
    '', -- Old schema didn't have separate IV
    '', -- Old schema didn't have separate tag
    bot_username,
    is_active
FROM telegram_bot_configs
WHERE bot_token_encrypted IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Migrate chats from old bot_configs
INSERT INTO telegram_bot_chats (bot_id, chat_id, chat_type)
SELECT tb.id, tbc.chat_id, 'private'
FROM telegram_bot_configs tbc
JOIN telegram_bots tb ON tb.user_id = tbc.user_id
WHERE tbc.chat_id IS NOT NULL
ON CONFLICT (bot_id, chat_id) DO NOTHING;

-- ============================================================================
-- 12. CLEANUP: Drop old tables (optional - commented out for safety)
-- ============================================================================

-- Uncomment these lines to remove old tables after verifying migration:
-- DROP TABLE IF EXISTS telegram_bot_configs CASCADE;
-- DROP TABLE IF EXISTS telegram_config CASCADE;

-- ============================================================================
-- 13. COMMENTS
-- ============================================================================

COMMENT ON TABLE telegram_bots IS 'Multi-bot management - each user can have multiple Telegram bots';
COMMENT ON TABLE telegram_bot_commands IS 'Custom slash commands per bot with LLM prompts';
COMMENT ON TABLE telegram_bot_chats IS 'Chats/groups connected to each bot';
COMMENT ON TABLE telegram_bot_sessions IS 'LLM conversation sessions per bot+chat';

COMMENT ON COLUMN telegram_bots.system_prompt IS 'System prompt sent to LLM for this bot personality';
COMMENT ON COLUMN telegram_bots.llm_provider IS 'LLM provider: ollama (local) or claude (API)';
COMMENT ON COLUMN telegram_bot_commands.prompt IS 'Prompt template sent to LLM when command is invoked. Use {{args}} for user input.';

COMMENT ON FUNCTION create_telegram_bot IS 'Creates a new bot for a user';
COMMENT ON FUNCTION add_telegram_bot_chat IS 'Adds or updates a chat connection for a bot';
COMMENT ON FUNCTION get_or_create_bot_session IS 'Gets or creates an LLM session for a bot+chat';
COMMENT ON FUNCTION add_message_to_session IS 'Appends a message to the session history';
COMMENT ON FUNCTION clear_bot_session IS 'Clears session messages (for /new command)';
