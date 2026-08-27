-- 174_freigaben_c7.sql — Ein Lauf haelt an und wartet auf einen Menschen
-- (Phase C7 des Ueberordner-Plans vom 26.08.2026)
--
-- Bis hierher lief ein Flow durch, oder er lief nicht. Die einzige Stelle, an
-- der er auf einen Menschen wartete, war die Rueckfrage (`frage_nutzer`, Plan
-- 023 I3), und die lebt im Speicher des Prozesses: sie ist eine Frage an den,
-- der gerade zusieht, keine Aufgabe fuer irgendwen. Eine FREIGABE ist etwas
-- anderes. Sie hat einen Adressaten (jeder, dem die App freigegeben ist), eine
-- Frist, eine Entscheidung und die Frage „wer war es". Das gehoert in eine
-- Tabelle.
--
-- ZWEI DINGE HEISSEN IN DIESEM GERAET „FREIGABE", und sie sind nicht dasselbe:
--
--   app_members   diese App ist fuer diesen Menschen freigegeben (Phase C2)
--   approvals     dieser Lauf haelt an, bis ein Mensch ihn freigibt (hier)
--
-- Der englische Name der Tabelle steht so im Auftrag der Phase und trennt die
-- beiden im Code, wo `freigabe` sonst zweierlei bedeutete. Im Deutschen heisst
-- die Zeile hier „Freigabe-Anfrage": angefordert vom Flow, entschieden von
-- einem Menschen.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.approvals;
--   -- Die beiden Enum-Werte bleiben. Ein Wert laesst sich aus einem ENUM in
--   -- Postgres nicht entfernen, ohne den Typ neu zu bauen; sie stoeren nicht.

-- ---------------------------------------------------------------------------
-- 1. Zwei neue Zustaende eines Laufs
-- ---------------------------------------------------------------------------
-- `wartend`    er haelt an und tut nichts, bis jemand entscheidet. KEIN
--              Endzustand: derselbe Lauf laeuft danach weiter, ab dem Schritt,
--              an dem er stehengeblieben ist.
-- `abgelaufen` niemand hat innerhalb der Frist entschieden. Ein eigener
--              Endzustand und NICHT `fehler`, denn nichts ist kaputtgegangen;
--              ein Mensch hat nicht geantwortet. Wer die beiden zusammenwirft,
--              sucht spaeter in den Protokollen nach einem Fehler, den es nie
--              gab. Eine ABLEHNUNG dagegen bekommt keinen eigenen Wert: sie
--              ist `abgebrochen` mit einer Begruendung -- ein Mensch hat den
--              Lauf beendet, und genau das heisst dieses Wort seit 112.
--
-- ALTER TYPE ... ADD VALUE laeuft seit Postgres 12 auch in einer Transaktion
-- (der Runner umschliesst jede Migration mit einer). Was NICHT geht: den neuen
-- Wert in derselben Transaktion BENUTZEN. Deshalb steht hier nur das
-- Hinzufuegen und nirgends ein Vergleich gegen 'wartend'.
--
-- OHNE SCHEMA, entgegen der Regel dieses Ordners, und das ist hier der
-- vorsichtigere Weg. Der Typ heisst `flow_run_status` seit Migration 119
-- (davor `skill_run_status`, 112) und liegt je nach Vorgeschichte des Geraets
-- in `arasul` oder in `public` -- dieselbe Unschaerfe, die Migration 173 fuer
-- die Tabelle mit `to_regclass` aufloest. Fuer einen TYP ginge das nur ueber
-- dynamisches SQL in einem DO-Block, und `ALTER TYPE ... ADD VALUE` hat mit
-- Funktionskoerpern eine Geschichte, die vor Postgres 12 in einer harten
-- Fehlermeldung endete. Ein `search_path` von `"$user", public` und ein
-- Datenbanknutzer namens arasul loesen genau diese beiden Faelle richtig auf:
-- liegt der Typ in `arasul`, gewinnt er; sonst wird er in `public` gefunden.
-- Migrationen laufen unter keinem anderen Nutzer.
ALTER TYPE flow_run_status ADD VALUE IF NOT EXISTS 'wartend';
ALTER TYPE flow_run_status ADD VALUE IF NOT EXISTS 'abgelaufen';

-- ---------------------------------------------------------------------------
-- 2. approvals — die Freigabe-Anfrage eines Laufs
-- ---------------------------------------------------------------------------
-- SIE HAENGT AM LAUF, nicht an der App. Der Fremdschluessel unten zeigt auf
-- `flow_runs` mit ON DELETE CASCADE: eine Freigabe ohne ihren Lauf waere eine
-- Aufgabe, die niemand mehr erfuellen kann, und ein Lauf ohne seine Freigabe
-- eine Geschichte mit einem Loch. Auf `apps` zeigt dagegen KEIN
-- Fremdschluessel -- dieselbe Begruendung wie bei `flow_runs.app_id`
-- (Migration 173): wer eine App entfernt, soll nicht die Auskunft darueber
-- loeschen, wer damals was freigegeben hat.
--
-- `app_id`/`stand` stehen trotzdem in der Zeile, und zwar nicht als Bequem-
-- lichkeit: sie sind der NAMENSRAUM. Wer eine Freigabe sehen darf, entscheidet
-- `app_members` -- „jeder Mitarbeiter, der die App freigegeben hat, darf
-- bestaetigen oder ablehnen" (Entscheidung Kolja vom 27.08.2026). Diese Frage
-- laesst sich mit diesen zwei Spalten in einem JOIN beantworten, ohne den Lauf
-- dazuzuladen. Ein Rollenmodell je Flow gibt es nicht, und der Flow nennt
-- keine Person: er fordert eine Freigabe an, kein Gegenzeichnen durch Frau X.
--
-- `frist` ist eine ZEIT und keine Dauer. Eine Dauer muesste jeder Leser mit
-- `angefragt_am` verrechnen, und der erste, der es vergisst, zeigt einem
-- Mitarbeiter eine Freigabe, die laengst abgelaufen ist.
CREATE TABLE IF NOT EXISTS public.approvals (
  id                 BIGSERIAL   PRIMARY KEY,
  run_id             BIGINT      NOT NULL,
  app_id             TEXT        NOT NULL,
  stand              TEXT        NOT NULL,
  flow_name          TEXT        NOT NULL,
  -- Worum es geht, in einem Satz -- vom Flow gestellt, fuer einen Menschen.
  titel              TEXT        NOT NULL,
  -- Was der Flow an Zusammenhang mitgibt (der Entwurf, die Zahl, der Grund).
  zusammenhang       TEXT,
  -- offen | bestaetigt | abgelehnt | abgelaufen | verfallen
  --
  -- `abgelaufen` und `verfallen` sind NICHT dasselbe, und der Unterschied ist
  -- die Antwort auf die Frage, die danach gestellt wird: `abgelaufen` heisst,
  -- ein Mensch hat nicht geantwortet, `verfallen` heisst, der Lauf lief nicht
  -- mehr (Neustart des Backends, Abbruch). Wer die zwei zusammenwirft, sucht
  -- einen saeumigen Kollegen, und es war die Maschine.
  status             TEXT        NOT NULL DEFAULT 'offen',
  frist              TIMESTAMPTZ NOT NULL,
  angefragt_am       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entschieden_von    BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  entschieden_am     TIMESTAMPTZ,
  -- Bei einer Ablehnung die Begruendung, die der Lauf als Grund bekommt.
  begruendung        TEXT
);

DO $$ BEGIN
  ALTER TABLE public.approvals
    ADD CONSTRAINT approvals_stand_check CHECK (stand IN ('test', 'live'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.approvals
    ADD CONSTRAINT approvals_status_check
    CHECK (status IN ('offen', 'bestaetigt', 'abgelehnt', 'abgelaufen', 'verfallen'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Eine entschiedene Freigabe hat einen Zeitpunkt, eine offene keinen. Ohne
-- diese Regel koennte eine Zeile „bestaetigt" heissen und nicht sagen, wann --
-- und das ist die Angabe, die bei einer Nachfrage als erstes gesucht wird.
DO $$ BEGIN
  ALTER TABLE public.approvals
    ADD CONSTRAINT approvals_entschieden_check
    CHECK ((status = 'offen') = (entschieden_am IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Der Fremdschluessel auf den Lauf. `flow_runs` steht je nach Vorgeschichte
-- des Geraets in `arasul` oder in `public` (siehe Migration 173), also wird
-- der Ort gesucht statt angenommen.
DO $$
DECLARE
  ziel regclass := COALESCE(to_regclass('arasul.flow_runs'), to_regclass('public.flow_runs'));
BEGIN
  IF ziel IS NULL THEN
    RAISE EXCEPTION 'flow_runs gibt es weder in arasul noch in public. Migration 112 fehlt.';
  END IF;
  BEGIN
    EXECUTE format(
      'ALTER TABLE public.approvals ADD CONSTRAINT approvals_run_fk '
      'FOREIGN KEY (run_id) REFERENCES %s(id) ON DELETE CASCADE', ziel);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Die eine Frage, die ein Mitarbeiter stellt: „was wartet auf mich?" Der Index
-- traegt nur die offenen Zeilen -- entschiedene sind Geschichte und werden
-- nach Lauf gesucht, nicht nach App.
CREATE INDEX IF NOT EXISTS idx_approvals_offen
  ON public.approvals (app_id, stand)
  WHERE status = 'offen';

CREATE INDEX IF NOT EXISTS idx_approvals_run ON public.approvals (run_id);

-- HOECHSTENS EINE OFFENE JE LAUF. Ein Lauf hat genau einen Schreiber (siehe
-- runStore.startStep), zwei gleichzeitig offene Freigaben koennte es also nur
-- nach einem kuenftigen Umbau geben. Dann soll er hier scheitern und nicht
-- still zwei Anfragen erzeugen, von denen ein Mensch eine beantwortet und die
-- andere ewig steht.
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_eine_offene_je_lauf
  ON public.approvals (run_id)
  WHERE status = 'offen';

COMMENT ON TABLE public.approvals IS
  'Freigabe-Anfragen aus einem Flow (Phase C7): der Lauf haelt an, ein Mensch bestaetigt oder lehnt ab, nach der Frist laeuft sie ab. NICHT zu verwechseln mit app_members -- das ist die Freigabe einer App fuer einen Menschen (C2).';
COMMENT ON COLUMN public.approvals.run_id IS
  'Der Lauf, der wartet. ON DELETE CASCADE: eine Freigabe ohne Lauf koennte niemand mehr einloesen.';
COMMENT ON COLUMN public.approvals.app_id IS
  'Die App, in deren Namensraum die Freigabe liegt. Ohne Fremdschluessel: wer eine App entfernt, soll nicht die Auskunft darueber loeschen, wer was freigegeben hat.';
COMMENT ON COLUMN public.approvals.frist IS
  'Zeitpunkt, nicht Dauer. Danach ist die Freigabe abgelaufen und der Lauf endet als `abgelaufen`.';
COMMENT ON COLUMN public.approvals.begruendung IS
  'Die Begruendung einer Ablehnung. Sie wird zum Grund, mit dem der Lauf endet.';
