-- ============================================================================
-- 079_app_events_retention_90d.sql
-- Extend app_events retention from 30 → 90 days.
--
-- Source: ANALYSIS_PLAN Phase 5.5.
-- The function is already wired into run_all_cleanups() (050); this migration
-- only redefines it with the new horizon.
--
-- Chat-messages retention is NOT enforced here: chat history is user content,
-- not telemetry. If retention is ever needed it should be policy-driven
-- (per-tenant setting) rather than a global cron.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION cleanup_old_app_events()
RETURNS void AS $$
BEGIN
    DELETE FROM app_events
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_app_events() IS
    'Deletes app_events older than 90 days. Called by run_all_cleanups() every 4h.';

-- One-shot catch-up: purge anything that is already > 90d old so the next
-- scheduled run has a small working set.
SELECT cleanup_old_app_events();

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
SELECT 'database_migration', 'INFO',
    '079: app_events retention extended from 30d to 90d',
    'Redefined cleanup_old_app_events() and ran one-shot catch-up',
    'postgres-db', true
WHERE NOT EXISTS (
    SELECT 1 FROM self_healing_events
     WHERE event_type = 'database_migration'
       AND description = '079: app_events retention extended from 30d to 90d'
);

COMMIT;
