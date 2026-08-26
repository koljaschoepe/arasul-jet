-- 163_rueckbau_b4.sql — die Tabellen der gestrichenen Bereiche fallen
-- (Phase B4 des Ueberordner-Plans vom 26.08.2026)
--
-- Der Code zu Dokumenten, Wissensraeumen, Wissensgraph, Projekten, Git,
-- Sandbox, Terminal, Erweiterungs-Baukasten, Memory-Kompaktion und dem
-- Rechnungs-Flow ist mit den Commits dieser Phase weg. Diese Migration zieht
-- das Schema nach: 30 Tabellen, drei Spalten in bleibenden Tabellen, die
-- Funktionen, Sichten und Typen dazu, und die Laufzeit-Schemata `ext_<slug>`
-- der Erweiterungen. Die Migrationsdateien, die das alles angelegt haben,
-- bleiben liegen: eine angewendete Migration wird nicht geaendert, ihre
-- Pruefsumme steht im Migrationsbuch (so hat es 102 vorgemacht).
--
-- CASCADE ist hier bewusst gesetzt, mit IF EXISTS davor: an diesen Tabellen
-- haengen Trigger, Indizes und Fremdschluessel aus fuenfzehn Migrationen
-- (009 bis 157), und ein DROP ohne CASCADE muesste jeden davon vorher
-- einzeln kennen. Was NICHT mitfallen darf, steht ausdruecklich davor:
-- `flow_runs.projekt_id` und die beiden `system_settings`-Spalten werden als
-- Spalten entfernt, damit CASCADE ihre Fremdschluessel nicht als Anlass
-- nimmt, in bleibenden Tabellen mehr zu tun. Chat-Tabellen (B6), n8n- und
-- Plattform-App-Tabellen (B5) und `bot_audit_log` (Telegram-Rest) bleiben
-- stehen; sie gehoeren anderen Phasen.
--
-- Rueckwaerts: nicht vorgesehen. Wer einen Bereich zurueckholt, baut ihn neu
-- und legt das Schema dabei passend an.

-- 1. Spalten in bleibenden Tabellen, die auf Gestrichenes zeigen.
ALTER TABLE arasul.flow_runs DROP COLUMN IF EXISTS projekt_id;
ALTER TABLE public.system_settings DROP COLUMN IF EXISTS active_project_id;
ALTER TABLE public.system_settings DROP COLUMN IF EXISTS active_workspace_space_id;

-- 2. Die Laufzeit-Schemata der Erweiterungen (tabellenService legte je
--    Erweiterung ein Schema `ext_<slug>` an; sie stehen in keiner Migration).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'ext\_%' LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
  END LOOP;
END $$;

-- 3. Sichten ueber die Dokumente (009, 016).
DROP VIEW IF EXISTS public.documents_with_category;
DROP VIEW IF EXISTS public.documents_with_space;

-- 4. Die Tabellen, Kinder vor Eltern.
DROP TABLE IF EXISTS public.extension_zeitplaene CASCADE;
DROP TABLE IF EXISTS public.extension_tabellen CASCADE;
DROP TABLE IF EXISTS arasul.extensions CASCADE;
DROP TABLE IF EXISTS arasul.rechnungsnummern CASCADE;
DROP TABLE IF EXISTS arasul.rechnungsnummern_zaehler CASCADE;
DROP TABLE IF EXISTS arasul.project_git CASCADE;
DROP TABLE IF EXISTS arasul.pinned_documents CASCADE;
DROP TABLE IF EXISTS arasul.sandbox_session_titles CASCADE;
DROP TABLE IF EXISTS arasul.sandbox_project_connections CASCADE;
DROP TABLE IF EXISTS arasul.user_external_credentials CASCADE;
DROP TABLE IF EXISTS public.sandbox_terminal_sessions CASCADE;
DROP TABLE IF EXISTS public.sandbox_projects CASCADE;
DROP TABLE IF EXISTS public.claude_terminal_queries CASCADE;
DROP TABLE IF EXISTS public.claude_terminal_sessions CASCADE;
DROP TABLE IF EXISTS public.compaction_log CASCADE;
DROP TABLE IF EXISTS public.rag_query_log CASCADE;
DROP TABLE IF EXISTS public.kg_entity_documents CASCADE;
DROP TABLE IF EXISTS public.kg_relations CASCADE;
DROP TABLE IF EXISTS public.kg_entities CASCADE;
DROP TABLE IF EXISTS public.space_members CASCADE;
DROP TABLE IF EXISTS public.document_access_log CASCADE;
DROP TABLE IF EXISTS public.document_similarities CASCADE;
DROP TABLE IF EXISTS public.document_processing_queue CASCADE;
DROP TABLE IF EXISTS public.document_chunks CASCADE;
DROP TABLE IF EXISTS public.document_parent_chunks CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.document_categories CASCADE;
DROP TABLE IF EXISTS public.knowledge_spaces CASCADE;
DROP TABLE IF EXISTS public.company_context CASCADE;
DROP TABLE IF EXISTS arasul.projects CASCADE;

-- 5. Funktionen der gestrichenen Bereiche. Ueber pg_proc nach Namen, weil die
--    Signaturen ueber die Jahre variiert haben (dasselbe Muster wie in 102).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'arasul')
       AND p.proname IN (
         'cleanup_old_access_logs', 'cleanup_document_similarities',
         'get_document_statistics', 'get_filtered_document_statistics',
         'find_similar_documents', 'update_documents_updated_at',
         'generate_space_slug', 'get_space_statistics', 'update_space_statistics',
         'get_all_spaces_with_stats', 'update_knowledge_spaces_updated_at',
         'user_has_space_access', 'kg_update_timestamp',
         'cleanup_rag_query_log_pii', 'cleanup_rag_query_log_old',
         'cleanup_old_compaction_logs',
         'get_sandbox_statistics', 'generate_sandbox_slug',
         'cleanup_stale_sandbox_sessions', 'update_sandbox_projects_updated_at',
         'update_sandbox_terminal_time', 'enforce_claude_terminal_query_limit',
         -- Telegram-Rest, den 102 stehen liess; run_all_cleanups unten kennt
         -- ihn nicht mehr.
         'cleanup_expired_telegram_sessions'
       )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- 6. Aufzaehlungstypen, die nur diese Tabellen benutzten.
DROP TYPE IF EXISTS public.document_status;
DROP TYPE IF EXISTS public.sandbox_project_status;
DROP TYPE IF EXISTS public.sandbox_container_status;
DROP TYPE IF EXISTS public.sandbox_session_status;
DROP TYPE IF EXISTS public.sandbox_session_type;
DROP TYPE IF EXISTS public.space_permission;

-- 7. run_all_cleanups() neu, ohne die gefallenen Funktionen. Der Aufruf in
--    index.js laeuft alle vier Stunden; jeder Eintrag ist einzeln abgesichert,
--    bisher standen darin fuenf Aufrufe, die seit heute nur noch einen Fehler
--    ins Protokoll geschrieben haetten.
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

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_performance_metrics();
        results := results || jsonb_build_object('cleanup_old_performance_metrics',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_performance_metrics', jsonb_build_object('status','error','message',SQLERRM));
    END;

    BEGIN fn_start := clock_timestamp(); ret_int := cleanup_old_metrics_infra();
        results := results || jsonb_build_object('cleanup_old_metrics_infra',
            jsonb_build_object('status','ok','deleted',ret_int,'ms', EXTRACT(MILLISECOND FROM clock_timestamp()-fn_start)::int));
    EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('cleanup_old_metrics_infra', jsonb_build_object('status','error','message',SQLERRM));
    END;

    results := results || jsonb_build_object('_summary',
        jsonb_build_object(
            'total_functions', 15,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp()-start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;
