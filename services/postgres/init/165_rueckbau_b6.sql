-- 165_rueckbau_b6.sql — die Chat-Tabellen fallen, llm_jobs wird zustandslos
-- (Phase B6 des Ueberordner-Plans vom 26.08.2026)
--
-- Der Oberflaechen-Chat ist seit Phase B2 aus der Oberflaeche, seine Routen
-- (`/api/chats`, `/api/llm`) fallen mit dieser Phase aus dem Backend. Uebrig
-- blieb eine Kopplung: jeder Auftrag an das Sprachmodell (`llm_jobs`) hing
-- ueber `conversation_id` und `message_id` an `chat_conversations` und
-- `chat_messages`, und die externe API legte fuer jeden Aufruf eine
-- Wegwerf-Konversation an, nur um den Besitzer des Auftrags zu kennen.
--
-- Ab hier traegt `llm_jobs` seinen Besitzer selbst (`user_id`), die Antwort
-- steht wie bisher in `llm_jobs.content`, und `cleanup_old_llm_jobs()` (159)
-- raeumt sie nach einer Stunde weg. Es gibt keine Konversation mehr, an der
-- etwas haengen bleiben koennte.
--
-- Es fallen:
--   * `chat_attachments` (059), `chat_messages` (005, 006, 007, 127, 128),
--     `chat_conversations` (005, 041, 046, 066, 155) samt Trigger und
--     Funktionen `update_message_count()` und `cleanup_deleted_chats()`.
--   * `llm_jobs.conversation_id`, `llm_jobs.message_id` und ihre Indizes;
--     dafuer kommt `llm_jobs.user_id`.
--   * `flow_runs.conversation_id` (112): der Verweis eines Laufs auf den Chat,
--     aus dem er gestartet wurde. Ohne Chat gibt es nichts zu verweisen.
--   * der Eintrag `cleanup_deleted_chats` in `run_all_cleanups()`.
--
-- VORHER SICHERN. Der Deploy legt vor jeder Migration einen vollen Abzug an
-- (scripts/deploy/deploy-local.sh). Auf dem Orin standen am 26.08.2026
-- 322 Konversationen und 636 Nachrichten des alten Oberflaechen-Chats.
--
-- Rueckwaerts: nicht vorgesehen. Wer die Chats zurueckholt, spielt den Abzug
-- ein und baut die Routen aus dem Stand d704ad64 wieder auf.

-- 1. Der Besitzer wandert an den Auftrag. Solange die Konversationen noch da
--    sind, laesst sich der Besitzer daraus uebernehmen; danach nicht mehr.
ALTER TABLE public.llm_jobs
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.admin_users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'llm_jobs'
                AND column_name = 'conversation_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'chat_conversations') THEN
    UPDATE public.llm_jobs j
       SET user_id = c.user_id
      FROM public.chat_conversations c
     WHERE j.conversation_id = c.id
       AND j.user_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_llm_jobs_user ON public.llm_jobs(user_id);

-- 2. Die Kopplung an den Chat faellt. Die Indizes auf den Spalten
--    (idx_llm_jobs_conversation, idx_llm_jobs_conversation_status,
--    idx_flow_runs_conversation) fallen mit den Spalten.
ALTER TABLE public.llm_jobs DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE public.llm_jobs DROP COLUMN IF EXISTS message_id;
-- flow_runs liegt in `arasul` (112 lief nach 090); ein Geraet ohne die
-- Tabelle darf hier nicht scheitern.
DO $$
BEGIN
  IF to_regclass('arasul.flow_runs') IS NOT NULL THEN
    ALTER TABLE arasul.flow_runs DROP COLUMN IF EXISTS conversation_id;
  END IF;
  IF to_regclass('public.flow_runs') IS NOT NULL THEN
    ALTER TABLE public.flow_runs DROP COLUMN IF EXISTS conversation_id;
  END IF;
END $$;

-- 3. Die Chat-Tabellen. CASCADE wie in 163 und 164: an `chat_messages` haengt
--    der Trigger aus 005, sonst verweist nach Schritt 2 nichts mehr darauf.
DROP TABLE IF EXISTS public.chat_attachments CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_conversations CASCADE;

-- 4. Die Funktionen dazu.
DROP FUNCTION IF EXISTS public.update_message_count() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_deleted_chats() CASCADE;

-- 5. run_all_cleanups() neu, ohne cleanup_deleted_chats. Der Rumpf ist der
--    aus 163, ein Block weniger; die Summe steht auf 14.
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
            'total_functions', 14,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp()-start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;
