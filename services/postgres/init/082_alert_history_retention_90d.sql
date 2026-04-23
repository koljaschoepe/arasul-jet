-- ============================================================================
-- 082_alert_history_retention_90d.sql
-- Add time-based retention (90 days) to cleanup_old_alert_history().
--
-- The pre-existing function only capped by row count (max_history_entries,
-- default 1000). Under sustained alert flapping this left rows from months
-- ago hanging around, and under quiet periods the cap never triggered.
--
-- This migration:
--   1. Redefines cleanup_old_alert_history() to delete both:
--      - rows older than 90 days (time-based), and
--      - rows beyond the configured max (count-based, preserved for safety).
--   2. Runs a one-shot catch-up so the next scheduled run has a small
--      working set.
--
-- The function is already wired into run_all_cleanups() (migration 050);
-- this migration only changes its body.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION cleanup_old_alert_history()
RETURNS INTEGER AS $$
DECLARE
    max_entries INTEGER;
    deleted_time INTEGER;
    deleted_cap INTEGER;
BEGIN
    SELECT max_history_entries INTO max_entries
    FROM alert_settings
    WHERE id = 1;

    IF max_entries IS NULL THEN
        max_entries := 1000;
    END IF;

    -- Time-based retention: 90 days.
    DELETE FROM alert_history
    WHERE fired_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_time = ROW_COUNT;

    -- Count-based safety net: keep no more than max_entries rows.
    WITH oldest AS (
        SELECT id FROM alert_history
        ORDER BY fired_at DESC
        OFFSET max_entries
    )
    DELETE FROM alert_history
    WHERE id IN (SELECT id FROM oldest);
    GET DIAGNOSTICS deleted_cap = ROW_COUNT;

    RETURN COALESCE(deleted_time, 0) + COALESCE(deleted_cap, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_alert_history() IS
    'Deletes alert_history rows older than 90 days + caps at max_history_entries. Called by run_all_cleanups() every 4h.';

-- One-shot catch-up.
SELECT cleanup_old_alert_history();

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
SELECT 'database_migration', 'INFO',
    '082: alert_history retention extended with 90d time-based cleanup',
    'Redefined cleanup_old_alert_history() to combine time + count retention',
    'postgres-db', true
WHERE NOT EXISTS (
    SELECT 1 FROM self_healing_events
     WHERE event_type = 'database_migration'
       AND description = '082: alert_history retention extended with 90d time-based cleanup'
);

COMMIT;
