-- ============================================================================
-- 084_rag_log_privacy.sql
-- Phase 5.2 — DSGVO-konformes RAG-Query-Logging.
--
-- Vorher: rag_query_log.query_text NOT NULL → jeder User-Prompt landete
-- ungelöscht im Log; potenziell PII (Namen, Adressen, Geheimnisse) ohne TTL.
--
-- Jetzt:
--   * query_text wird nullable und nach 24h anonymisiert (auf NULL gesetzt)
--   * query_hash (SHA-256 hex, 64 chars) für Korrelation/Deduplication
--   * query_language (ISO 639-1 best-guess, 2-8 chars) für Aggregat-Stats
--   * Bestand älter als 7d wird beim Migrieren gleich anonymisiert
--   * Cron-Funktion cleanup_rag_query_log_pii() in run_all_cleanups() integriert
-- ============================================================================

BEGIN;

-- 0) pgcrypto wird für digest() in der Backfill-Sektion gebraucht.
--    001_init_schema.sql legt die Extension an, aber alte Installationen können
--    sie verloren haben (Restore ohne Contrib, Schema-Drift); idempotent absichern.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Schema-Erweiterung
ALTER TABLE rag_query_log
    ALTER COLUMN query_text DROP NOT NULL;

ALTER TABLE rag_query_log
    ADD COLUMN IF NOT EXISTS query_hash     VARCHAR(64),
    ADD COLUMN IF NOT EXISTS query_language VARCHAR(8);

-- query_hash für Bestand backfillen, solange Plaintext noch da ist
UPDATE rag_query_log
   SET query_hash = encode(digest(query_text, 'sha256'), 'hex')
 WHERE query_hash IS NULL
   AND query_text IS NOT NULL;

-- Bestand älter als 7d sofort anonymisieren (Plaintext löschen, Hash/Length behalten)
UPDATE rag_query_log
   SET query_text = NULL
 WHERE created_at < NOW() - INTERVAL '7 days'
   AND query_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rag_query_log_hash
    ON rag_query_log(query_hash)
 WHERE query_hash IS NOT NULL;

-- 2) Anonymisierungs-Cron: nach 24h Plaintext leeren, Aggregat-Felder behalten.
--    Komplett-Löschung übernimmt cleanup_rag_query_log_old() weiter unten (90d).
CREATE OR REPLACE FUNCTION cleanup_rag_query_log_pii()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE rag_query_log
       SET query_text = NULL
     WHERE query_text IS NOT NULL
       AND created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_rag_query_log_pii() IS
    'DSGVO: anonymisiert rag_query_log.query_text nach 24h. Hash + Aggregate bleiben für Telemetrie erhalten.';

-- 3) Retention: Rows komplett löschen nach 90d (Stats-Window deckt 30d ab).
CREATE OR REPLACE FUNCTION cleanup_rag_query_log_old()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM rag_query_log
     WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_rag_query_log_old() IS
    'DSGVO: löscht rag_query_log-Zeilen älter als 90d komplett.';

-- 4) Beide Funktionen in run_all_cleanups() registrieren
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

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_metrics_infra();
        results := results || jsonb_build_object('cleanup_old_metrics_infra',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_metrics_infra', jsonb_build_object('status','error','message',SQLERRM));
    END;

    -- NEW (Phase 5.2): DSGVO — RAG-Query-Plaintext nach 24h anonymisieren
    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_rag_query_log_pii();
        results := results || jsonb_build_object('cleanup_rag_query_log_pii',
            jsonb_build_object('status','ok','anonymized',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_rag_query_log_pii', jsonb_build_object('status','error','message',SQLERRM));
    END;

    -- NEW (Phase 5.2): RAG-Query-Log-Retention 90d
    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_rag_query_log_old();
        results := results || jsonb_build_object('cleanup_rag_query_log_old',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_rag_query_log_old', jsonb_build_object('status','error','message',SQLERRM));
    END;

    results := results || jsonb_build_object('_summary',
        jsonb_build_object(
            'total_functions', 20,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp()-start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (84, '084_rag_log_privacy.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;

COMMIT;
