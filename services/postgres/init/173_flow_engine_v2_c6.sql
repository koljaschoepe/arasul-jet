-- 173_flow_engine_v2_c6.sql — Flows kommen mit der App
-- (Phase C6 des Ueberordner-Plans vom 26.08.2026)
--
-- Bis hierher war ein Flow eine Datei unter `/arasul/flows/`, die ein Mensch
-- am Geraet anlegt, und `app.json` nannte in `flows: [...]` die Namen derer,
-- die eine App VORAUSSETZT -- eine Forderung, keine Lieferung. Wer eine App
-- ausrollte, musste ihre Flows getrennt davon von Hand nachbauen, und ob
-- beides zusammenpasste, merkte man beim ersten Lauf.
--
-- Ab C6 bringt das Paket seine Flows mit (`flows/*.md`, Entscheidung Kolja vom
-- 27.08.2026). Sie werden beim Einspielen JE APP UND STAND registriert, und
-- damit ist der Namensraum die App: zwei Apps duerfen beide einen Flow
-- `bericht` haben, ohne voneinander zu wissen. Ein Flow des Teststandes ist
-- ein anderer Gegenstand als der gleichnamige des Livestandes -- der Teststand
-- ist eine andere Version.
--
-- DREI TABELLEN-AENDERUNGEN, und jede beantwortet eine eigene Frage:
--
--   app_flows       welche Flows hat dieser Stand dieser App
--   flow_settings   was hat der Administrator daran geaendert
--   flow_runs       zu welcher App und welchem Stand gehoert dieser Lauf
--
-- Rollback (down):
--   ALTER TABLE arasul.flow_runs DROP COLUMN stand, DROP COLUMN app_id;
--   DROP TABLE IF EXISTS public.flow_settings;
--   DROP TABLE IF EXISTS public.app_flows;

-- ---------------------------------------------------------------------------
-- 1. app_flows — die Flows eines Standes
-- ---------------------------------------------------------------------------
-- DIE DEFINITION STEHT HIER, obwohl die Datei auf der Platte liegt
-- (`/arasul/apps/<id>/<version>/flows/<name>.md`). Das ist derselbe Schnitt,
-- den `app_staende.manifest` schon macht, und aus demselben Grund: ein STAND
-- ist etwas Festes. Waere die Datei die Wahrheit, aenderte sich der Flow eines
-- laufenden Livestandes, sobald jemand unter dem Versionsordner etwas
-- editiert -- ohne Einspielen, ohne Schalten, ohne dass es irgendwo steht.
-- Registriert wird beim Einspielen; danach ist die Zeile massgeblich.
--
-- `version` sagt, aus welchem Paket dieser Flow stammt. Sie ist die Antwort
-- auf "warum tut der Flow im Teststand etwas anderes als im Livestand".
CREATE TABLE IF NOT EXISTS public.app_flows (
  app_id         TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  stand          TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  version        TEXT        NOT NULL,
  definition     JSONB       NOT NULL,
  registriert_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, stand, name)
);

DO $$ BEGIN
  ALTER TABLE public.app_flows
    ADD CONSTRAINT app_flows_stand_check CHECK (stand IN ('test', 'live'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_flows_app ON public.app_flows (app_id);

COMMENT ON TABLE public.app_flows IS
  'Die Flows, die ein Stand einer App hat (Phase C6). Kommen aus flows/*.md im App-Paket und werden beim Einspielen registriert. Namensraum ist die App: zwei Apps duerfen denselben Flow-Namen tragen.';
COMMENT ON COLUMN public.app_flows.definition IS
  'Die geparste Flow-Definition (schemas/flows.js, FlowDefinition) samt systemPrompt. Kopie der Datei aus dem Versionsordner, so wie app_staende.manifest eine Kopie von app.json ist: ein Stand soll sich nicht aendern, weil jemand eine Datei anfasst.';
COMMENT ON COLUMN public.app_flows.version IS
  'Die App-Version, aus deren Paket dieser Flow stammt.';

-- ---------------------------------------------------------------------------
-- 2. flow_settings — was der Administrator am Flow geaendert hat
-- ---------------------------------------------------------------------------
-- Das Standardmodell eines Flows steht in seinem Frontmatter; der Partner, der
-- die App gebaut hat, weiss am besten, womit sein Flow gemeint war. Der
-- Administrator am Geraet darf es ueberschreiben -- er kennt sein Geraet und
-- weiss, welche Modelle darauf liegen.
--
-- DIE UEBERSCHREIBUNG LIEGT HIER UND NICHT IN DER DATEI, und das ist der Kern
-- dieser Tabelle. Schriebe sie der Administrator in `flows/<name>.md`, waere
-- sie beim naechsten App-Update weg: das Paket bringt die Datei mit, und ein
-- Deploy, der eine Datei des Kunden nicht ueberschreibt, waere ein Deploy, der
-- etwas anderes ausliefert als das Paket. So bleibt beides ganz -- die Datei
-- gehoert dem Partner, die Zeile hier dem Kunden.
--
-- DER SCHLUESSEL IST (app_id, flow_name), OHNE STAND. Eine Entscheidung des
-- Administrators ueber "welches Modell treibt diesen Flow" gilt dem Flow und
-- nicht der Fassung, mit der jemand gerade testet. Je Stand eine Zeile hiesse:
-- wer im Teststand einstellt, stellt im Livestand nichts ein -- und merkt es
-- beim Schalten.
--
-- DIE VIER `extern_`-SPALTEN SIND HEUTE LEER. Sie sind das Datenmodell fuer
-- "externe Modelle je Flow mit API-Schluessel in der Flow-Ansicht"
-- (Entscheidung Kolja vom 27.08.2026: "spaeter D-Phasen, jetzt nur das
-- Datenmodell dafuer"). Sie stehen hier und nicht erst dort, weil die
-- Ansicht in den D-Phasen entsteht und eine Migration mehr dann nichts
-- verbessert, aber der Schnitt heute festgelegt werden muss.
--
-- Der Schluessel liegt verschluesselt, nie im Klartext -- dieselbe Zusage wie
-- `arasul.externe_modell_anbieter` (Migration 153) und
-- `user_external_credentials` (107): AES-256-GCM-Blob aus
-- `utils/tokenCrypto.js`, Schluessel aus JWT_SECRET. Eine geleakte Zeile ohne
-- JWT_SECRET ist wertlos. `endet_auf` ist bewusst Klartext, damit die
-- Oberflaeche zeigen kann, WELCHER Schluessel hinterlegt ist.
--
-- ON DELETE CASCADE: wer eine App entfernt, entfernt sie ganz. Eine
-- Einstellung zu einem Flow, den es nicht mehr gibt, waere eine Zeile, die
-- niemand je wieder liest und die beim naechsten Deploy derselben Kennung
-- still wirksam wuerde -- eine Ueberraschung, kein Dienst.
CREATE TABLE IF NOT EXISTS public.flow_settings (
  app_id                 TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  flow_name              TEXT        NOT NULL,
  modell                 TEXT,
  extern_anbieter        TEXT,
  extern_modell          TEXT,
  extern_schluessel      BYTEA,
  extern_endet_auf       VARCHAR(8),
  geaendert_am           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geaendert_von          BIGINT      REFERENCES admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (app_id, flow_name)
);

COMMENT ON TABLE public.flow_settings IS
  'Was der Administrator am Geraet an einem Flow einer App geaendert hat (Phase C6). Ueberlebt ein App-Update, weil sie NICHT in der Flow-Datei steht: die gehoert dem Paket. Schluessel ohne `stand` -- die Entscheidung gilt dem Flow, nicht der Fassung.';
COMMENT ON COLUMN public.flow_settings.modell IS
  'Ueberschreibt das Modell aus dem Frontmatter des Flows. NULL = es gilt, was im Paket steht.';
COMMENT ON COLUMN public.flow_settings.extern_anbieter IS
  'Datenmodell fuer die D-Phasen: externes Modell je Flow. Anbieter-Kennung wie in arasul.externe_modell_anbieter. Heute schreibt das niemand.';
COMMENT ON COLUMN public.flow_settings.extern_schluessel IS
  'AES-256-GCM-Blob (IV || AuthTag || Ciphertext) des Anbieter-Schluessels, via utils/tokenCrypto.js. Niemals Klartext. Datenmodell fuer die D-Phasen.';
COMMENT ON COLUMN public.flow_settings.extern_endet_auf IS
  'Die letzten vier Zeichen des Schluessels im Klartext, damit die Oberflaeche zeigen kann, welcher hinterlegt ist, ohne ihn zu entschluesseln.';

-- ---------------------------------------------------------------------------
-- 3. flow_runs — zu welcher App gehoert ein Lauf
-- ---------------------------------------------------------------------------
-- OHNE FREMDSCHLUESSEL auf `apps`, und mit derselben Begruendung, mit der
-- Migration 112 `flow_name` ohne Fremdschluessel gelassen hat: ein Lauf ist
-- Geschichte. Er soll lesbar bleiben, wenn die App, die ihn gestartet hat,
-- laengst weg ist. Ein `ON DELETE SET NULL` haette den Lauf behalten und ihm
-- die Zugehoerigkeit genommen -- also genau die Angabe, die man Monate spaeter
-- sucht.
--
-- NULL heisst: ein Lauf der Plattform, nicht einer App. Beide Spalten sind
-- zusammen gesetzt oder zusammen leer, dieselbe Regel wie bei
-- `api_keys.app_id`/`stand` (Migration 171).
--
-- DER ORT DER TABELLE WIRD GESUCHT, nicht angenommen. Migration 112 legte sie
-- unqualifiziert an; ab Migration 090 gibt es das Schema `arasul`, und der
-- `search_path` ist `"$user", public`. Auf jedem Geraet, das 090 vor 112
-- angewendet hat, steht sie deshalb in `arasul` (so auch am Orin, siehe
-- docs/api/DATABASE_SCHEMA.md). Ein hart geschriebenes `arasul.` waere fuer
-- ein Geraet mit der anderen Vorgeschichte ein "relation does not exist" --
-- und eine gescheiterte Migration ist eine Sackgasse
-- (services/postgres/CLAUDE.md).
DO $$
DECLARE
  ziel regclass := COALESCE(to_regclass('arasul.flow_runs'), to_regclass('public.flow_runs'));
BEGIN
  IF ziel IS NULL THEN
    RAISE EXCEPTION 'flow_runs gibt es weder in arasul noch in public. Migration 112 fehlt.';
  END IF;

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS app_id TEXT', ziel);
  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS stand  TEXT', ziel);

  BEGIN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT flow_runs_stand_check '
      'CHECK (stand IS NULL OR stand IN (''test'', ''live''))', ziel);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT flow_runs_app_stand_check '
      'CHECK ((app_id IS NULL) = (stand IS NULL))', ziel);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Die Frage, die diesen Index braucht: "welche Laeufe hat diese App in
  -- diesem Stand". Sie steht hinter jeder Anzeige einer App-Flow-Ansicht und
  -- hinter der Rechteprueferei beim Abruf eines Laufs ueber einen
  -- App-Schluessel.
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_flow_runs_app ON %s (app_id, stand) '
    'WHERE app_id IS NOT NULL', ziel);

  EXECUTE format(
    'COMMENT ON COLUMN %s.app_id IS %L', ziel,
    'Die App, deren Flow hier lief; NULL = ein Flow der Plattform. Ohne Fremdschluessel: ein Lauf ist Geschichte und soll die App ueberleben. Seit 173');
  EXECUTE format(
    'COMMENT ON COLUMN %s.stand IS %L', ziel,
    'Der Stand der App (test oder live); NULL, wenn app_id NULL ist. Seit 173');
END $$;
