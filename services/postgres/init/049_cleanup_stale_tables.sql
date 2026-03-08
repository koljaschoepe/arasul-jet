-- ============================================================================
-- 049_cleanup_stale_tables.sql
-- Remove stale tables, views, and functions that are no longer used
-- by any application code.
--
-- Verified by grepping the entire apps/dashboard-backend/ directory.
-- Each object listed below has ZERO references in backend source code.
-- ============================================================================

-- ============================================================================
-- 1. DROP: Stale views from migration 022
--    These views reference telegram_message_log, telegram_alert_cooldowns,
--    and telegram_config (as singleton cross-join). None are queried by
--    any backend route or service.
-- ============================================================================

DROP VIEW IF EXISTS v_telegram_stats_24h CASCADE;
DROP VIEW IF EXISTS v_telegram_active_cooldowns CASCADE;
DROP VIEW IF EXISTS v_telegram_recent_messages CASCADE;

-- ============================================================================
-- 2. DROP: Stale functions from migration 022
--    The old rate-limit function check_telegram_rate_limit (VARCHAR, INT, INT)
--    was replaced by check_rate_limit (INT, BIGINT, BIGINT) in migration 033.
--    The alert-cooldown, message-logging, and cleanup functions have zero
--    callers in the backend.
-- ============================================================================

DROP FUNCTION IF EXISTS check_telegram_rate_limit(VARCHAR, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS check_telegram_alert_cooldown(VARCHAR, VARCHAR, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS log_telegram_message(VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, INTEGER, JSONB, BOOLEAN, TEXT, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS cleanup_telegram_rate_limits() CASCADE;
DROP FUNCTION IF EXISTS cleanup_telegram_message_logs(INTEGER) CASCADE;

-- ============================================================================
-- 3. DROP: telegram_alert_cooldowns table (created in 022)
--    Used to track per-alert-type cooldowns for the old singleton
--    telegram_config notification system. The multi-bot architecture
--    (migration 032+) does not use this table. Zero backend references.
-- ============================================================================

DROP TABLE IF EXISTS telegram_alert_cooldowns CASCADE;

-- ============================================================================
-- 4. DROP: telegram_message_log table (created in 022)
--    Audit log for the old singleton notification system. The multi-bot
--    architecture uses telegram_notification_history instead.
--    Zero backend references (only migration 028 tried to fix a FK
--    on a user_id column that was never added to this table).
-- ============================================================================

DROP TABLE IF EXISTS telegram_message_log CASCADE;
