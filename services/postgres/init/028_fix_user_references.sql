-- Migration: Fix incorrect foreign key references from users(id) to admin_users(id)
-- Problem: Several tables reference non-existent 'users' table instead of 'admin_users'
-- Note: This migration is idempotent - checks table AND column existence before adding constraints

-- Helper: Only add FK constraint if both table and column exist
CREATE OR REPLACE FUNCTION _fix_user_fk(
    p_table TEXT, p_old_constraint TEXT, p_new_constraint TEXT, p_on_delete TEXT DEFAULT 'CASCADE'
) RETURNS VOID AS $$
BEGIN
    -- Drop old constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = p_old_constraint AND table_name = p_table) THEN
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, p_old_constraint);
    END IF;

    -- Only add new constraint if table has user_id column and constraint doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = p_table AND column_name = 'user_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE constraint_name = p_new_constraint AND table_name = p_table) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE %s',
                        p_table, p_new_constraint, p_on_delete);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply fixes
SELECT _fix_user_fk('claude_terminal_queries', 'claude_terminal_queries_user_id_fkey', 'claude_terminal_queries_admin_user_fkey');
SELECT _fix_user_fk('claude_terminal_history', 'claude_terminal_history_user_id_fkey', 'claude_terminal_history_admin_user_fkey');
SELECT _fix_user_fk('notification_events', 'notification_events_user_id_fkey', 'notification_events_admin_user_fkey');
SELECT _fix_user_fk('notification_subscriptions', 'notification_subscriptions_user_id_fkey', 'notification_subscriptions_admin_user_fkey');
SELECT _fix_user_fk('telegram_rule_processing_log', 'telegram_rule_processing_log_user_id_fkey', 'telegram_rule_processing_log_admin_user_fkey', 'NO ACTION');
SELECT _fix_user_fk('telegram_rules', 'telegram_rules_user_id_fkey', 'telegram_rules_admin_user_fkey', 'NO ACTION');
SELECT _fix_user_fk('telegram_sessions', 'telegram_sessions_user_id_fkey', 'telegram_sessions_admin_user_fkey', 'NO ACTION');
SELECT _fix_user_fk('telegram_message_log', 'telegram_message_log_user_id_fkey', 'telegram_message_log_admin_user_fkey', 'NO ACTION');

-- Cleanup helper function
DROP FUNCTION _fix_user_fk(TEXT, TEXT, TEXT, TEXT);

DO $$ BEGIN RAISE NOTICE 'Migration 028: Fixed user_id foreign key references to admin_users table'; END $$;
