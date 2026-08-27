-- 170_app_modell_reparatur_c3.sql — was 169 am Geraet nicht zu Ende gebracht hat
-- (Phase C3 des Ueberordner-Plans vom 26.08.2026, zweiter Anlauf 27.08.2026)
--
-- WAS AM 27.08.2026 AM ORIN PASSIERT IST
--
-- Migration 169 raeumt den alten AppStore aus 013 weg und legt `apps` und
-- `app_staende` an. Am Geraet brach sie ab:
--
--   ERROR: cannot drop type app_status because other objects depend on it
--
-- Der Runner faehrt jede Migration in ihrer eigenen Transaktion, also fiel der
-- ganze Lauf zurueck: kein `apps`, kein `app_staende`, kein Fremdschluessel,
-- und im Migrationsbuch stand 169 mit `success = false`.
--
-- 169 loescht die Sicht `apps_with_status`, die vier Tabellen und die vier
-- Funktionen aus 013 namentlich, bevor sie die Typen fallen laesst. Eine
-- Funktion fehlt in dieser Liste, und sie steht nicht in 013, sondern in 014:
--
--   check_app_dependencies(character varying)
--     RETURNS TABLE (dependent_app_id VARCHAR, dependent_app_status app_status)
--
-- Ihr Rueckgabetyp nennt `app_status`. Eine Funktion haengt damit am Typ, und
-- zwar unabhaengig davon, ob die Tabellen, ueber die sie liest, noch da sind:
-- `DROP TABLE` nimmt keine Funktion mit, denn Postgres sieht in einen
-- Funktionsrumpf nicht hinein. Die Signatur sieht es sehr wohl.
--
-- WARUM DIE REPARATUR HIER STEHT UND NICHT IN 169
--
-- 169 steht im Buch. Eine Migration, die einmal eingetragen ist, wird nicht
-- mehr geaendert (services/postgres/CLAUDE.md, "Forbidden") -- auch dann
-- nicht, wenn sie gescheitert ist: das Buch ist der Beleg dafuer, was das
-- Geraet versucht hat, und wer den Versuch nachtraeglich umschreibt, nimmt
-- dem naechsten Leser die Erklaerung fuer den Zustand, den er vorfindet.
--
-- Diese Datei tut deshalb noch einmal ALLES, was 169 tut, und zusaetzlich das
-- eine, was ihr gefehlt hat. Jede Anweisung ist gegen beide Ausgangslagen
-- gebaut:
--
--   * Geraet mit gescheiterter 169 (der Orin): der alte AppStore steht noch
--     vollstaendig da, `apps` gibt es nicht. Hier wirkt jede Zeile.
--   * Frisches Geraet: dort raeumt `168a_appstore_funktion_vor_169.sh` die
--     Funktion aus dem Weg, BEVOR der Docker-Init 169 anwendet; 169 laeuft
--     dann durch, und hier ist nichts mehr zu tun. Jedes DROP findet nichts,
--     jedes CREATE ist ein IF NOT EXISTS.
--
-- Beide enden im selben Schema. Das ist der Punkt der Uebung.
--
-- Der Migrations-Runner weiss von dieser Ablesung: `ABGELOEST` in
-- `apps/dashboard-backend/src/migrationRunner.js` haelt fest, dass 169 von 170
-- abgeloest ist. Ohne das kaeme diese Datei nie an die Reihe -- der Runner
-- haelt beim ersten Fehlschlag an, und 169 scheitert auf einem gewachsenen
-- Geraet bei jedem Start erneut.

-- ---------------------------------------------------------------------------
-- 1. Der alte AppStore, diesmal vollstaendig
-- ---------------------------------------------------------------------------
-- Reihenfolge: erst was auf den Tabellen sitzt (Sicht), dann was den Typ in
-- der Signatur traegt (die beiden Funktionen aus 013 und 014), dann die
-- Tabellen von der abhaengigen zur tragenden, dann der Rest der Funktionen,
-- zuletzt die Typen. Kein CASCADE: was faellt, steht hier namentlich, sonst
-- nimmt eine spaetere Abhaengigkeit still etwas mit.
--
-- Die Trigger aus 013 stehen nicht dabei. Sie sitzen auf `app_installations`
-- und `app_configurations` und fallen mit ihren Tabellen; ein
-- `DROP TRIGGER ... ON <Tabelle>` auf einem frischen Geraet haette dagegen
-- eine Tabelle zu nennen, die es dort nicht mehr gibt.
DROP VIEW IF EXISTS public.apps_with_status;

-- Die Zeile, die 169 gefehlt hat.
DROP FUNCTION IF EXISTS public.check_app_dependencies(character varying);
DROP FUNCTION IF EXISTS public.get_app_statistics();

DROP TABLE IF EXISTS public.app_events;
DROP TABLE IF EXISTS public.app_dependencies;
DROP TABLE IF EXISTS public.app_configurations;
DROP TABLE IF EXISTS public.app_installations;

DROP FUNCTION IF EXISTS public.log_app_event(VARCHAR, VARCHAR, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.cleanup_old_app_events();
DROP FUNCTION IF EXISTS public.update_app_installations_updated_at();

DROP TYPE IF EXISTS public.app_status;
DROP TYPE IF EXISTS public.app_type;

-- ---------------------------------------------------------------------------
-- 2. Die App
-- ---------------------------------------------------------------------------
-- Wortgleich mit 169. Die Kennung ist der Schluessel und kommt aus dem
-- Manifest; sie steht im Pfad (`/apps/<id>/`), im Containernamen und im
-- Fremdschluessel der Freigaben.
CREATE TABLE IF NOT EXISTS public.apps (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  beschreibung  TEXT,
  angelegt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geaendert_am  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.apps IS
  'Die Apps am Geraet. Was eine App IST, steht in ihrem Manifest app.json; was von ihr laeuft, in app_staende. Ersetzt app_installations (013); seit 169, am Geraet angelegt von 170';
COMMENT ON COLUMN public.apps.id IS
  'Kennung aus dem Manifest, zugleich Pfad (/apps/<id>/) und Containername';

-- ---------------------------------------------------------------------------
-- 3. Die zwei Staende
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_staende (
  app_id          TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  stand           TEXT        NOT NULL CHECK (stand IN ('test', 'live')),
  version         TEXT        NOT NULL,
  manifest        JSONB       NOT NULL,
  eingespielt_am  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eingespielt_von BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (app_id, stand)
);

COMMENT ON TABLE public.app_staende IS
  'Je App hoechstens zwei Zeilen: der Teststand und der Livestand, jeder mit Version und Manifest. Seit 169, am Geraet angelegt von 170';
COMMENT ON COLUMN public.app_staende.manifest IS
  'Das app.json dieser Version, wie es eingespielt wurde';
COMMENT ON COLUMN public.app_staende.eingespielt_von IS
  'Der Administrator, der eingespielt hat; NULL, wenn sein Konto geloescht wurde';

-- ---------------------------------------------------------------------------
-- 4. Der Fremdschluessel, den C2 angekuendigt hat
-- ---------------------------------------------------------------------------
-- Zeilen, deren `app_id` keine App ist, koennen dabei nicht bleiben: eine
-- Freigabe auf eine Kennung, die es am Geraet nie gab, ist keine Zusage, die
-- jemand einloesen koennte.
DELETE FROM public.app_members f
 WHERE NOT EXISTS (SELECT 1 FROM public.apps a WHERE a.id = f.app_id);

DO $$ BEGIN
  ALTER TABLE public.app_members
    ADD CONSTRAINT app_members_app_id_fkey
    FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.app_members.app_id IS
  'Kennung der App; Fremdschluessel auf apps.id seit 169';

-- ---------------------------------------------------------------------------
-- 5. Der Tester-Kreis
-- ---------------------------------------------------------------------------
-- 'live' ist der Normalfall, 'test' ist ein Tester: ein Nutzer mit einer Tuer
-- mehr, keine zweite Zeile und keine zweite Tabelle.
ALTER TABLE public.app_members
  ADD COLUMN IF NOT EXISTS stand TEXT NOT NULL DEFAULT 'live';

DO $$ BEGIN
  ALTER TABLE public.app_members
    ADD CONSTRAINT app_members_stand_check CHECK (stand IN ('test', 'live'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.app_members.stand IS
  'Wie weit freigegeben: live = nur der Livestand, test = zusaetzlich der Teststand (Tester)';

-- ---------------------------------------------------------------------------
-- 6. Die Aufraeumrunde ohne die Ereignisse, die es nicht mehr gibt
-- ---------------------------------------------------------------------------
-- `run_all_cleanups()` laeuft alle vier Stunden und rief `cleanup_old_app_events()`
-- auf. Die Funktion ist oben gefallen. Jeder Aufruf dort steht in einem eigenen
-- BEGIN/EXCEPTION, der Lauf waere also nicht abgestuerzt -- er haette
-- stattdessen alle vier Stunden einen Fehlereintrag ueber eine Aufraeumarbeit
-- geschrieben, die niemand mehr braucht. Ein Waechter, der dauerhaft ein
-- bekanntes Problem meldet, wird nach der dritten Woche nicht mehr gelesen.
--
-- Der Rumpf ist der aus 169. Auf dem Orin steht dort noch die Fassung aus 165
-- mit dem Aufruf, den es nicht mehr gibt; `CREATE OR REPLACE` stellt beide
-- Geraete auf dieselbe Fassung. Die Summe steht auf 13.
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
            'total_functions', 13,
            'total_ms', EXTRACT(MILLISECOND FROM clock_timestamp()-start_ts)::int,
            'completed_at', NOW()::text
        ));

    RETURN results;
END;
$$ LANGUAGE plpgsql;
