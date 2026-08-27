-- 169_app_modell_c3.sql — Das App-Modell: Tabelle `apps`, zwei Staende je App
-- (Phase C3 des Ueberordner-Plans vom 26.08.2026)
--
-- Diese Migration loest den AppStore aus Migration 013 ab. Dort war eine App
-- ein Container aus einem Katalog, den der Nutzer im Geraet durchblaettert und
-- installiert; vier Tabellen hielten Installationszustand, Konfiguration,
-- Abhaengigkeiten und Ereignisse fest. Die Loeschliste aus Phase B1
-- (docs/plans/audits/2026-08-26-loeschliste-b1.md, Abschnitt "Tabellen, die
-- ersetzt werden") sagt dazu: `app_installations`, `app_configurations`,
-- `app_dependencies`, `app_events` -> "Tabelle `apps` mit Manifest (C3)".
--
-- Eine App ist jetzt etwas anderes: der Partner baut sie mit dem Ara-Kit und
-- rollt sie auf das Geraet. Was sie ist, steht in ihrem Manifest `app.json`;
-- was am Geraet davon LAEUFT, steht hier. Es gibt keinen Katalog mehr, also
-- auch nichts zu durchblaettern, und `status`-Enums mit zehn Werten
-- ('installing', 'stopping', 'restarting', ...) beschreiben eine Weiche, die
-- niemand mehr stellt. Der Zustand eines Containers steht in Docker; ihn
-- daneben in einer Spalte zu fuehren hiess, zwei Wahrheiten zu pflegen.
--
-- ZWEI STAENDE JE APP (`kit-grundriss.md`, Zeile "C3"): jede App hat einen
-- Teststand und einen Livestand, jeder mit eigener Version und eigenem
-- Manifest. Der Partner rollt nach `test`, benannte Tester probieren, der
-- Administrator schaltet nach `live` (Endpunkt in C5). Deshalb zwei Tabellen
-- und nicht sechs Spalten mit den Praefixen `test_` und `live_`: eine
-- wiederholte Spaltengruppe ist eine Tabelle, die sich nicht traut.

-- ---------------------------------------------------------------------------
-- 1. Der alte AppStore
-- ---------------------------------------------------------------------------
-- Erst die abhaengige Sicht, dann die Tabellen, dann die Funktionen, die nur
-- auf ihnen arbeiten, dann die Typen. Kein CASCADE: was faellt, steht hier
-- namentlich, sonst nimmt eine spaetere Abhaengigkeit still etwas mit.
DROP VIEW IF EXISTS public.apps_with_status;
DROP TRIGGER IF EXISTS trigger_app_installations_updated_at ON public.app_installations;
DROP TRIGGER IF EXISTS trigger_app_configurations_updated_at ON public.app_configurations;
DROP TABLE IF EXISTS public.app_events;
DROP TABLE IF EXISTS public.app_dependencies;
DROP TABLE IF EXISTS public.app_configurations;
DROP TABLE IF EXISTS public.app_installations;
DROP FUNCTION IF EXISTS public.get_app_statistics();
DROP FUNCTION IF EXISTS public.log_app_event(VARCHAR, VARCHAR, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.cleanup_old_app_events();
DROP FUNCTION IF EXISTS public.update_app_installations_updated_at();
DROP TYPE IF EXISTS public.app_status;
DROP TYPE IF EXISTS public.app_type;

-- ---------------------------------------------------------------------------
-- 2. Die App
-- ---------------------------------------------------------------------------
-- Die Kennung ist der Schluessel und kommt aus dem Manifest. Sie steht im
-- Pfad (`/apps/<id>/`), im Containernamen und im Fremdschluessel der
-- Freigaben; eine zweite, kuenstliche Nummer daneben waere ein zweiter Name
-- fuer dieselbe Sache. Die Form prueft das Backend (`schemas/apps.js`), nicht
-- die Datenbank: eine CHECK-Regel mit einem regulaeren Ausdruck waere ein
-- zweiter Ort fuer dieselbe Regel.
CREATE TABLE IF NOT EXISTS public.apps (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  beschreibung  TEXT,
  angelegt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geaendert_am  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.apps IS
  'Die Apps am Geraet. Was eine App IST, steht in ihrem Manifest app.json; was von ihr laeuft, in app_staende. Ersetzt app_installations (013); seit 169';
COMMENT ON COLUMN public.apps.id IS
  'Kennung aus dem Manifest, zugleich Pfad (/apps/<id>/) und Containername';

-- ---------------------------------------------------------------------------
-- 3. Die zwei Staende
-- ---------------------------------------------------------------------------
-- Genau zwei Zeilen je App sind moeglich, und die CHECK-Regel sagt welche.
-- `manifest` ist das ganze `app.json` dieser Version, so wie es eingespielt
-- wurde: der Ordner am Geraet kann geloescht werden, die Antwort auf "womit
-- lief das" nicht.
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
  'Je App hoechstens zwei Zeilen: der Teststand und der Livestand, jeder mit Version und Manifest. Seit 169';
COMMENT ON COLUMN public.app_staende.manifest IS
  'Das app.json dieser Version, wie es eingespielt wurde';
COMMENT ON COLUMN public.app_staende.eingespielt_von IS
  'Der Administrator, der eingespielt hat; NULL, wenn sein Konto geloescht wurde';

-- ---------------------------------------------------------------------------
-- 4. Der Fremdschluessel, den C2 angekuendigt hat
-- ---------------------------------------------------------------------------
-- Migration 168: "`app_id` ist bis Phase C3 ein FREIER TEXT. ... C3 setzt den
-- Fremdschluessel nach." Hier ist er.
--
-- Zeilen, deren `app_id` keine App ist, koennen dabei nicht bleiben. Sie sind
-- Freigaben auf eine Kennung, die es am Geraet nie gab -- entstanden, weil bis
-- heute jede Zeichenkette erlaubt war (die Abnahme aus C2 legt `abnahme-app-
-- <zeitstempel>` an und raeumt sie wieder weg). Eine Freigabe auf nichts ist
-- keine Zusage, die jemand einloesen koennte; sie zu behalten hiesse, die
-- Tabelle `apps` mit erfundenen Zeilen zu fuellen, damit der Schluessel haelt.
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
-- `kit-grundriss.md` laesst ihn ausdruecklich fuer C3 offen ("Wer den
-- Teststand sieht, ist heute nirgends modelliert. Vorschlag: `app_members`
-- bekommt eine Spalte `stage`. Entscheidet C3.") -- hier ist die Entscheidung,
-- und sie heisst `stand`, wie ueberall sonst in diesem Modell.
--
-- Die Spalte sagt, WIE WEIT jemand fuer diese App freigegeben ist:
--   'live' -- der Normalfall: er sieht /apps/<id>/
--   'test' -- ein Tester: er sieht zusaetzlich /apps/<id>/test/
-- Ein Tester ist also kein anderer Nutzer, sondern ein Nutzer mit einer Tuer
-- mehr. Deshalb keine zweite Zeile je Mensch und App und keine zweite Tabelle:
-- der Primaerschluessel (app_id, user_id) bleibt, wie er ist, und eine
-- Freigabe bleibt ein Paar.
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
-- `run_all_cleanups()` laeuft alle vier Stunden und ruft `cleanup_old_app_events()`
-- auf. Die Funktion ist oben gefallen. Jeder Aufruf steht in einem eigenen
-- BEGIN/EXCEPTION, der Lauf waere also nicht abgestuerzt -- er haette
-- stattdessen alle vier Stunden einen Fehlereintrag ueber eine Aufraeumarbeit
-- geschrieben, die niemand mehr braucht. Ein Waechter, der dauerhaft ein
-- bekanntes Problem meldet, wird nach der dritten Woche nicht mehr gelesen.
--
-- Der Rumpf ist der aus 165, ein Block weniger; die Summe steht auf 13.
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
