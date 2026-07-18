-- 102_drop_telegram.sql — Plan 008 Schritt 2: remove the Telegram feature.
--
-- The Telegram bot/integration subsystem was removed from the product. This
-- migration drops all Telegram-owned tables and functions. It is forward-only
-- and idempotent (every DROP guarded with IF EXISTS). CASCADE is required and
-- intentional: it removes the triggers, constraints, and indexes that the
-- earlier telegram migrations (020, 022, 024, 025, 032-034, 047, 055, 091,
-- 092, 095) hung off these objects.
--
-- Deliberately NOT dropped: notification_events / notification_settings and
-- their generic functions (record_notification_event, get_pending_notifications,
-- mark_notification_sent, cleanup_old_notification_events,
-- check_notification_rate_limit) — the channel-neutral notification-events
-- pipeline stays alive; only the Telegram delivery channel is gone.

-- Drop Telegram-owned tables (CASCADE clears dependent triggers/constraints).
DROP TABLE IF EXISTS telegram_config CASCADE;
DROP TABLE IF EXISTS telegram_rate_limits CASCADE;
DROP TABLE IF EXISTS telegram_message_log CASCADE;
DROP TABLE IF EXISTS telegram_alert_cooldowns CASCADE;
DROP TABLE IF EXISTS telegram_setup_sessions CASCADE;
DROP TABLE IF EXISTS telegram_notification_rules CASCADE;
DROP TABLE IF EXISTS telegram_orchestrator_state CASCADE;
DROP TABLE IF EXISTS telegram_bot_configs CASCADE;
DROP TABLE IF EXISTS telegram_notification_history CASCADE;
DROP TABLE IF EXISTS telegram_bots CASCADE;
DROP TABLE IF EXISTS telegram_bot_commands CASCADE;
DROP TABLE IF EXISTS telegram_bot_chats CASCADE;
DROP TABLE IF EXISTS telegram_bot_sessions CASCADE;
DROP TABLE IF EXISTS telegram_app_status CASCADE;
DROP TABLE IF EXISTS telegram_user_consent CASCADE;
DROP TABLE IF EXISTS telegram_user_chats CASCADE;

-- Drop every Telegram-only function, regardless of signature/overload. Only
-- functions whose name contains "telegram" are matched, so the shared
-- notification-pipeline functions (no "telegram" in the name) are untouched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '%telegram%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- Remove the Telegram entry from the platform app registry.
DELETE FROM platform_apps WHERE id = 'telegram';
