-- ============================================================================
-- 081_cleanups_include_infra.sql
-- Append metrics_infra retention to run_all_cleanups() (Phase 5.6 companion).
--
-- Why a new migration instead of editing 050: 050 has already executed in
-- every environment; rewriting it is risky. Migrations are append-only.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION run_all_cleanups()
RETURNS JSONB AS $$
DECLARE
    results JSONB := '{}'::jsonb;
    start_ts TIMESTAMPTZ;
    fn_start TIMESTAMPTZ;
    ret_int INTEGER;
BEGIN
    start_ts := clock_timestamp();

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_metrics();
        results := results || jsonb_build_object('cleanup_old_metrics',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_metrics', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_expired_auth_data();
        results := results || jsonb_build_object('cleanup_expired_auth_data',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_expired_auth_data', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_service_failures();
        results := results || jsonb_build_object('cleanup_service_failures',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_service_failures', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_update_files();
        results := results || jsonb_build_object('cleanup_old_update_files',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_update_files', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_update_events();
        results := results || jsonb_build_object('cleanup_old_update_events',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_update_events', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_deleted_chats();
        results := results || jsonb_build_object('cleanup_deleted_chats',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_deleted_chats', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_llm_jobs();
        results := results || jsonb_build_object('cleanup_old_llm_jobs',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_llm_jobs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_stale_llm_jobs();
        results := results || jsonb_build_object('cleanup_stale_llm_jobs',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_stale_llm_jobs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_access_logs();
        results := results || jsonb_build_object('cleanup_old_access_logs',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_access_logs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_alert_history();
        results := results || jsonb_build_object('cleanup_old_alert_history',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_alert_history', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_app_events();
        results := results || jsonb_build_object('cleanup_old_app_events',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_app_events', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_audit_logs();
        results := results || jsonb_build_object('cleanup_old_audit_logs',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_audit_logs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_notification_events();
        results := results || jsonb_build_object('cleanup_old_notification_events',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_notification_events', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_api_audit_logs();
        results := results || jsonb_build_object('cleanup_old_api_audit_logs',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_api_audit_logs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_expired_telegram_sessions();
        results := results || jsonb_build_object('cleanup_expired_telegram_sessions',
            jsonb_build_object('status','ok','expired',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_expired_telegram_sessions', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_performance_metrics();
        results := results || jsonb_build_object('cleanup_old_performance_metrics',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_performance_metrics', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); PERFORM cleanup_old_compaction_logs();
        results := results || jsonb_build_object('cleanup_old_compaction_logs',
            jsonb_build_object('status','ok','ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_compaction_logs', jsonb_build_object('status','error','message',SQLERRM));
    END;

    -- NEW (Phase 5.6): generic infra-metrics retention (30d)
    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_metrics_infra();
        results := results || jsonb_build_object('cleanup_old_metrics_infra',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_metrics_infra', jsonb_build_object('status','error','message',SQLERRM));
    END;

    results := results || jsonb_build_object('_summary',
        jsonb_build_object(
            'total_functions', 18,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp()-start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;

-- Drop the throwaway helper added during Phase 5.6 prototyping.
DROP FUNCTION IF EXISTS run_all_cleanups_infra();

COMMIT;
