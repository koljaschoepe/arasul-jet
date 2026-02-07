-- ============================================================================
-- Telegram App Status Schema
-- Version: 1.0.0
--
-- Tracks per-user app activation status for dashboard icon visibility
-- The icon appears after first bot is created and stays visible for easy access
-- ============================================================================

-- ============================================================================
-- 1. APP STATUS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_app_status (
    id SERIAL PRIMARY KEY,

    -- User reference
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,

    -- App state
    is_enabled BOOLEAN DEFAULT FALSE,
    icon_visible BOOLEAN DEFAULT FALSE,

    -- Timestamps
    first_bot_created_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    -- User preferences (JSON for flexibility)
    settings JSONB DEFAULT '{
        "defaultLlmProvider": "ollama",
        "notificationsEnabled": true,
        "quietHoursEnabled": false,
        "quietHoursStart": "22:00",
        "quietHoursEnd": "07:00"
    }'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(user_id)
);

-- Create comment
COMMENT ON TABLE telegram_app_status IS 'Tracks Telegram App activation status per user for dashboard icon visibility';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Index for fast dashboard queries (only fetch users with visible icon)
CREATE INDEX IF NOT EXISTS idx_telegram_app_status_visible
ON telegram_app_status(user_id)
WHERE icon_visible = TRUE;

-- Index for enabled users
CREATE INDEX IF NOT EXISTS idx_telegram_app_status_enabled
ON telegram_app_status(user_id)
WHERE is_enabled = TRUE;

-- ============================================================================
-- 3. UPDATE TRIGGER
-- ============================================================================

-- Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_telegram_app_status_updated ON telegram_app_status;
CREATE TRIGGER trigger_telegram_app_status_updated
    BEFORE UPDATE ON telegram_app_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to ensure app status record exists for a user
CREATE OR REPLACE FUNCTION ensure_telegram_app_status(p_user_id INTEGER)
RETURNS telegram_app_status AS $$
DECLARE
    result telegram_app_status;
BEGIN
    -- Try to insert, on conflict update timestamp
    INSERT INTO telegram_app_status (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO UPDATE
        SET last_activity_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to activate app (sets icon visible)
CREATE OR REPLACE FUNCTION activate_telegram_app(p_user_id INTEGER)
RETURNS void AS $$
BEGIN
    INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible, first_bot_created_at)
    VALUES (p_user_id, TRUE, TRUE, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        is_enabled = TRUE,
        icon_visible = TRUE,
        first_bot_created_at = COALESCE(telegram_app_status.first_bot_created_at, NOW()),
        last_activity_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. BOT CREATION TRIGGER
-- ============================================================================

-- Function to update app status when bot is created/deleted
CREATE OR REPLACE FUNCTION update_telegram_app_on_bot_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When a bot is created, activate the app
    IF TG_OP = 'INSERT' THEN
        PERFORM activate_telegram_app(NEW.user_id);
        RETURN NEW;
    END IF;

    -- When a bot is deleted, check if any bots remain
    -- Icon stays visible (per user preference in plan)
    IF TG_OP = 'DELETE' THEN
        UPDATE telegram_app_status
        SET last_activity_at = NOW()
        WHERE user_id = OLD.user_id;
        RETURN OLD;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on telegram_bots (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_bots') THEN
        DROP TRIGGER IF EXISTS trigger_telegram_app_on_bot_change ON telegram_bots;
        CREATE TRIGGER trigger_telegram_app_on_bot_change
            AFTER INSERT OR DELETE ON telegram_bots
            FOR EACH ROW
            EXECUTE FUNCTION update_telegram_app_on_bot_change();
    END IF;
END $$;

-- ============================================================================
-- 6. MIGRATE EXISTING DATA
-- ============================================================================

-- Create app_status entries for users who already have bots
INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible, first_bot_created_at, last_activity_at)
SELECT DISTINCT
    user_id,
    TRUE,
    TRUE,
    MIN(created_at),
    MAX(COALESCE(last_message_at, created_at))
FROM telegram_bots
WHERE user_id IS NOT NULL
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
    is_enabled = TRUE,
    icon_visible = TRUE,
    first_bot_created_at = COALESCE(telegram_app_status.first_bot_created_at, EXCLUDED.first_bot_created_at),
    last_activity_at = EXCLUDED.last_activity_at;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to arasul user (standard for this codebase)
DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON telegram_app_status TO arasul';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE telegram_app_status_id_seq TO arasul';
EXCEPTION
    WHEN undefined_object THEN
        -- Ignore if user doesn't exist
        NULL;
END $$;

-- ============================================================================
-- 8. SUCCESS MESSAGE
-- ============================================================================

DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM telegram_app_status WHERE icon_visible = TRUE;
    RAISE NOTICE 'Telegram App Status schema created. % users migrated with visible icon.', migrated_count;
END $$;
