-- ============================================================================
-- 050_scheduled_cleanup_and_fk_fixes.sql
-- Consolidated Cleanup Scheduler & Foreign Key Fixes
--
-- Purpose:
--   1. Creates a single run_all_cleanups() function that invokes every
--      per-table cleanup function defined across the schema migrations.
--      This function can be called from:
--        - The backend's existing setInterval/cron scheduler
--        - A host-level cron job:  psql -U arasul -d arasul_db -c "SELECT run_all_cleanups()"
--      Each sub-call is wrapped in its own BEGIN/EXCEPTION block so that
--      a failure in one cleanup does not abort the rest.
--
--   2. Ensures llm_jobs.conversation_id has ON DELETE CASCADE.
--      The original 006 migration already declares it, but production
--      databases may have been altered; the idempotent DROP + ADD pattern
--      guarantees the correct constraint regardless of current state.
--
-- No pg_cron dependency - the function is passive until explicitly called.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FK FIX: llm_jobs.conversation_id -> ON DELETE CASCADE
-- ============================================================================

ALTER TABLE llm_jobs
  DROP CONSTRAINT IF EXISTS llm_jobs_conversation_id_fkey;

ALTER TABLE llm_jobs
  ADD CONSTRAINT llm_jobs_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. Consolidated cleanup function
-- ============================================================================

CREATE OR REPLACE FUNCTION run_all_cleanups()
RETURNS JSONB AS $$
DECLARE
    results JSONB := '{}'::jsonb;
    start_ts TIMESTAMPTZ;
    fn_start TIMESTAMPTZ;
    fn_name TEXT;
    ret_int INTEGER;
BEGIN
    start_ts := clock_timestamp();

    -- -----------------------------------------------------------------------
    -- 001: Metrics (7-day retention for CPU/RAM/GPU/Temp/Disk/Workflow/Snapshots,
    --       30-day for self_healing_events and service_restarts)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_metrics();
        results := results || jsonb_build_object('cleanup_old_metrics',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_metrics',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 002: Auth (expired tokens, sessions, old login attempts, password history)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_expired_auth_data();
        results := results || jsonb_build_object('cleanup_expired_auth_data',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_expired_auth_data',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 003: Self-healing (service_failures 1h, recovery_actions 7d, reboots 30d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_service_failures();
        results := results || jsonb_build_object('cleanup_service_failures',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_service_failures',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 004: Update files (90d, keep latest 10) and events (180d, keep latest 20)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_update_files();
        results := results || jsonb_build_object('cleanup_old_update_files',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_update_files',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_update_events();
        results := results || jsonb_build_object('cleanup_old_update_events',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_update_events',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 005: Soft-deleted chats (30d after deletion)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_deleted_chats();
        results := results || jsonb_build_object('cleanup_deleted_chats',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_deleted_chats',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 006: LLM jobs - completed/error/cancelled older than 1h
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_llm_jobs();
        results := results || jsonb_build_object('cleanup_old_llm_jobs',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_llm_jobs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 006: Stale LLM jobs - mark timed-out streaming jobs as error
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_stale_llm_jobs();
        results := results || jsonb_build_object('cleanup_stale_llm_jobs',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_stale_llm_jobs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 009: Document access logs (30d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_access_logs();
        results := results || jsonb_build_object('cleanup_old_access_logs',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_access_logs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 010: Alert history (trim to max_history_entries from alert_settings)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_old_alert_history();
        results := results || jsonb_build_object('cleanup_old_alert_history',
            jsonb_build_object('status', 'ok', 'deleted', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_alert_history',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 013: App store events (30d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_app_events();
        results := results || jsonb_build_object('cleanup_old_app_events',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_app_events',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 017: Bot audit logs (90d default)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_old_audit_logs();
        results := results || jsonb_build_object('cleanup_old_audit_logs',
            jsonb_build_object('status', 'ok', 'deleted', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_audit_logs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 019: Notification events (30d) and rate limits (1d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_old_notification_events();
        results := results || jsonb_build_object('cleanup_old_notification_events',
            jsonb_build_object('status', 'ok', 'deleted', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_notification_events',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 021: API audit logs (90d default)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_old_api_audit_logs();
        results := results || jsonb_build_object('cleanup_old_api_audit_logs',
            jsonb_build_object('status', 'ok', 'deleted', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_api_audit_logs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 024: Expired Telegram setup sessions
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_expired_telegram_sessions();
        results := results || jsonb_build_object('cleanup_expired_telegram_sessions',
            jsonb_build_object('status', 'ok', 'expired', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_expired_telegram_sessions',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 030: Model performance metrics (30d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        ret_int := cleanup_old_performance_metrics();
        results := results || jsonb_build_object('cleanup_old_performance_metrics',
            jsonb_build_object('status', 'ok', 'deleted', ret_int,
                'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_performance_metrics',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- 041: Context compaction logs (30d)
    -- -----------------------------------------------------------------------
    BEGIN
        fn_start := clock_timestamp();
        PERFORM cleanup_old_compaction_logs();
        results := results || jsonb_build_object('cleanup_old_compaction_logs',
            jsonb_build_object('status', 'ok', 'ms', EXTRACT(MILLISECOND FROM clock_timestamp() - fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_compaction_logs',
            jsonb_build_object('status', 'error', 'message', SQLERRM));
    END;

    -- -----------------------------------------------------------------------
    -- Summary
    -- -----------------------------------------------------------------------
    results := results || jsonb_build_object('_summary',
        jsonb_build_object(
            'total_functions', 17,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp() - start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION run_all_cleanups() IS
    'Consolidated cleanup: calls all per-table retention/cleanup functions. '
    'Returns JSONB with per-function status and timing. Safe to call at any frequency; '
    'each sub-call is isolated so one failure does not block the rest.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION run_all_cleanups() TO arasul;

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
VALUES (
    'database_migration',
    'INFO',
    'Scheduled cleanup and FK fixes migration (050) applied successfully',
    'Created run_all_cleanups() function consolidating 17 cleanup functions; ensured llm_jobs.conversation_id ON DELETE CASCADE',
    'postgres-db',
    true
);

COMMIT;
