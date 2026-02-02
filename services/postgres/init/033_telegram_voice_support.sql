-- ============================================================================
-- Telegram Voice Support Schema
-- Version: 3.1.0
--
-- Adds:
-- - OpenAI API key for Whisper voice transcription
-- - Rate limiting for LLM calls
-- - Input validation flags
-- ============================================================================

-- ============================================================================
-- 1. ADD: OpenAI API Key columns for Voice-to-Text (Whisper)
-- ============================================================================

DO $$
BEGIN
    -- OpenAI API Key for Whisper transcription
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_bots' AND column_name = 'openai_api_key_encrypted'
    ) THEN
        ALTER TABLE telegram_bots
        ADD COLUMN openai_api_key_encrypted BYTEA,
        ADD COLUMN openai_api_key_iv VARCHAR(64),
        ADD COLUMN openai_api_key_auth_tag VARCHAR(64);
    END IF;

    -- Voice feature flag per bot
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_bots' AND column_name = 'voice_enabled'
    ) THEN
        ALTER TABLE telegram_bots
        ADD COLUMN voice_enabled BOOLEAN DEFAULT true;
    END IF;

    -- Max voice duration per bot (seconds)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_bots' AND column_name = 'max_voice_duration'
    ) THEN
        ALTER TABLE telegram_bots
        ADD COLUMN max_voice_duration INTEGER DEFAULT 120;
    END IF;
END $$;

-- ============================================================================
-- 2. CREATE: Rate Limiting Table for LLM Calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_rate_limits (
    id SERIAL PRIMARY KEY,

    -- Identification
    bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE NOT NULL,
    chat_id BIGINT NOT NULL,
    user_id BIGINT,

    -- Rate limiting counters
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW(),

    -- Limits (configurable per bot)
    max_requests_per_minute INTEGER DEFAULT 10,
    max_requests_per_hour INTEGER DEFAULT 100,

    -- Cooldown tracking
    is_rate_limited BOOLEAN DEFAULT false,
    cooldown_until TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(bot_id, chat_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_rate_limits_bot_chat ON telegram_rate_limits(bot_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_rate_limits_limited ON telegram_rate_limits(is_rate_limited)
    WHERE is_rate_limited = TRUE;

-- ============================================================================
-- 3. FUNCTIONS: Rate Limiting
-- ============================================================================

-- Check and update rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_bot_id INTEGER,
    p_chat_id BIGINT,
    p_user_id BIGINT DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ) AS $$
DECLARE
    v_limit telegram_rate_limits%ROWTYPE;
    v_max_per_minute INTEGER := 10;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Get or create rate limit record
    SELECT * INTO v_limit
    FROM telegram_rate_limits
    WHERE bot_id = p_bot_id AND chat_id = p_chat_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create new record
        INSERT INTO telegram_rate_limits (bot_id, chat_id, user_id, request_count, window_start)
        VALUES (p_bot_id, p_chat_id, p_user_id, 1, v_now)
        RETURNING * INTO v_limit;

        RETURN QUERY SELECT TRUE, v_max_per_minute - 1, v_now + INTERVAL '1 minute';
        RETURN;
    END IF;

    -- Check if in cooldown
    IF v_limit.is_rate_limited AND v_limit.cooldown_until > v_now THEN
        RETURN QUERY SELECT FALSE, 0, v_limit.cooldown_until;
        RETURN;
    END IF;

    -- Check if window has expired (1 minute window)
    IF v_limit.window_start + INTERVAL '1 minute' < v_now THEN
        -- Reset window
        UPDATE telegram_rate_limits
        SET request_count = 1,
            window_start = v_now,
            is_rate_limited = FALSE,
            cooldown_until = NULL,
            updated_at = v_now
        WHERE id = v_limit.id;

        RETURN QUERY SELECT TRUE, v_limit.max_requests_per_minute - 1, v_now + INTERVAL '1 minute';
        RETURN;
    END IF;

    -- Check if limit exceeded
    IF v_limit.request_count >= v_limit.max_requests_per_minute THEN
        -- Set rate limit with 1 minute cooldown
        UPDATE telegram_rate_limits
        SET is_rate_limited = TRUE,
            cooldown_until = v_now + INTERVAL '1 minute',
            updated_at = v_now
        WHERE id = v_limit.id;

        RETURN QUERY SELECT FALSE, 0, v_now + INTERVAL '1 minute';
        RETURN;
    END IF;

    -- Increment counter
    UPDATE telegram_rate_limits
    SET request_count = request_count + 1,
        updated_at = v_now
    WHERE id = v_limit.id
    RETURNING * INTO v_limit;

    RETURN QUERY SELECT TRUE,
                        v_limit.max_requests_per_minute - v_limit.request_count,
                        v_limit.window_start + INTERVAL '1 minute';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ADD: Admin whitelist per bot
-- ============================================================================

DO $$
BEGIN
    -- Allowed users list (JSONB array of user IDs)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_bots' AND column_name = 'allowed_users'
    ) THEN
        ALTER TABLE telegram_bots
        ADD COLUMN allowed_users JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Restrict to allowed users only
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'telegram_bots' AND column_name = 'restrict_users'
    ) THEN
        ALTER TABLE telegram_bots
        ADD COLUMN restrict_users BOOLEAN DEFAULT false;
    END IF;
END $$;

-- ============================================================================
-- 5. FUNCTION: Check if user is allowed
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_allowed(
    p_bot_id INTEGER,
    p_user_id BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_bot telegram_bots%ROWTYPE;
BEGIN
    SELECT * INTO v_bot FROM telegram_bots WHERE id = p_bot_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- If restrictions not enabled, allow all
    IF NOT v_bot.restrict_users THEN
        RETURN TRUE;
    END IF;

    -- Check if user is in allowed list
    RETURN v_bot.allowed_users ? p_user_id::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON COLUMN telegram_bots.openai_api_key_encrypted IS 'Encrypted OpenAI API key for Whisper voice transcription';
COMMENT ON COLUMN telegram_bots.voice_enabled IS 'Whether voice messages are enabled for this bot';
COMMENT ON COLUMN telegram_bots.max_voice_duration IS 'Maximum voice message duration in seconds';
COMMENT ON COLUMN telegram_bots.allowed_users IS 'JSONB array of allowed Telegram user IDs';
COMMENT ON COLUMN telegram_bots.restrict_users IS 'If true, only allowed_users can use this bot';

COMMENT ON TABLE telegram_rate_limits IS 'Per-chat rate limiting for LLM calls';
COMMENT ON FUNCTION check_rate_limit IS 'Check and update rate limit for a chat';
COMMENT ON FUNCTION is_user_allowed IS 'Check if a user is allowed to use a bot';
