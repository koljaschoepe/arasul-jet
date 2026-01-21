-- Migration: Fix incorrect foreign key references from users(id) to admin_users(id)
-- Problem: Several tables reference non-existent 'users' table instead of 'admin_users'
-- Affected tables: claude_terminal_queries, claude_terminal_history, notification_events,
--                  notification_subscriptions, telegram_rule_processing_log, telegram_rules,
--                  telegram_sessions, telegram_message_log

-- Note: This migration is idempotent - it only adds constraints if they don't exist
-- The incorrect constraints may fail on DB init, so we just ensure correct ones exist

-- 1. Fix claude_terminal_queries.user_id
DO $$
BEGIN
    -- Drop old constraint if it exists (may have failed during init)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'claude_terminal_queries_user_id_fkey'
               AND table_name = 'claude_terminal_queries') THEN
        ALTER TABLE claude_terminal_queries DROP CONSTRAINT claude_terminal_queries_user_id_fkey;
    END IF;

    -- Add correct constraint if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claude_terminal_queries') THEN
        -- Only add if admin_users table exists and constraint doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'claude_terminal_queries_admin_user_fkey'
                       AND table_name = 'claude_terminal_queries') THEN
            ALTER TABLE claude_terminal_queries
            ADD CONSTRAINT claude_terminal_queries_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 2. Fix claude_terminal_history.user_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'claude_terminal_history_user_id_fkey'
               AND table_name = 'claude_terminal_history') THEN
        ALTER TABLE claude_terminal_history DROP CONSTRAINT claude_terminal_history_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claude_terminal_history') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'claude_terminal_history_admin_user_fkey'
                       AND table_name = 'claude_terminal_history') THEN
            ALTER TABLE claude_terminal_history
            ADD CONSTRAINT claude_terminal_history_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 3. Fix notification_events.user_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'notification_events_user_id_fkey'
               AND table_name = 'notification_events') THEN
        ALTER TABLE notification_events DROP CONSTRAINT notification_events_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_events') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'notification_events_admin_user_fkey'
                       AND table_name = 'notification_events') THEN
            ALTER TABLE notification_events
            ADD CONSTRAINT notification_events_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 4. Fix notification_subscriptions.user_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'notification_subscriptions_user_id_fkey'
               AND table_name = 'notification_subscriptions') THEN
        ALTER TABLE notification_subscriptions DROP CONSTRAINT notification_subscriptions_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_subscriptions') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'notification_subscriptions_admin_user_fkey'
                       AND table_name = 'notification_subscriptions') THEN
            ALTER TABLE notification_subscriptions
            ADD CONSTRAINT notification_subscriptions_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 5. Fix telegram_rule_processing_log.user_id (from 027_telegram_app_schema.sql)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'telegram_rule_processing_log_user_id_fkey'
               AND table_name = 'telegram_rule_processing_log') THEN
        ALTER TABLE telegram_rule_processing_log DROP CONSTRAINT telegram_rule_processing_log_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_rule_processing_log') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'telegram_rule_processing_log_admin_user_fkey'
                       AND table_name = 'telegram_rule_processing_log') THEN
            ALTER TABLE telegram_rule_processing_log
            ADD CONSTRAINT telegram_rule_processing_log_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id);
        END IF;
    END IF;
END $$;

-- 6. Fix telegram_rules.user_id (from 027_telegram_app_schema.sql)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'telegram_rules_user_id_fkey'
               AND table_name = 'telegram_rules') THEN
        ALTER TABLE telegram_rules DROP CONSTRAINT telegram_rules_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_rules') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'telegram_rules_admin_user_fkey'
                       AND table_name = 'telegram_rules') THEN
            ALTER TABLE telegram_rules
            ADD CONSTRAINT telegram_rules_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id);
        END IF;
    END IF;
END $$;

-- 7. Fix telegram_sessions.user_id (from 027_telegram_app_schema.sql)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'telegram_sessions_user_id_fkey'
               AND table_name = 'telegram_sessions') THEN
        ALTER TABLE telegram_sessions DROP CONSTRAINT telegram_sessions_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_sessions') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'telegram_sessions_admin_user_fkey'
                       AND table_name = 'telegram_sessions') THEN
            ALTER TABLE telegram_sessions
            ADD CONSTRAINT telegram_sessions_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id);
        END IF;
    END IF;
END $$;

-- 8. Fix telegram_message_log.user_id (from 027_telegram_app_schema.sql)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'telegram_message_log_user_id_fkey'
               AND table_name = 'telegram_message_log') THEN
        ALTER TABLE telegram_message_log DROP CONSTRAINT telegram_message_log_user_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_message_log') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = 'telegram_message_log_admin_user_fkey'
                       AND table_name = 'telegram_message_log') THEN
            ALTER TABLE telegram_message_log
            ADD CONSTRAINT telegram_message_log_admin_user_fkey
            FOREIGN KEY (user_id) REFERENCES admin_users(id);
        END IF;
    END IF;
END $$;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 030: Fixed user_id foreign key references to admin_users table';
END $$;
