-- 203_zeitplaner_m5.sql -- Der Zeitplaner im Geraet
-- (04.10.2026, M5, Auftrag zeitplaner-im-geraet)
--
-- WARUM. Ein Flow mit `ausloeser: zeitplan` (Kontrakt 8) lief bisher nie von
-- allein; das Geraet nahm den Eintrag an und tat nichts. Jetzt laeuft er zur
-- festgelegten Zeit, in der Zeitzone des Geraets, genau einmal je Termin.
--
-- VIER DINGE, vier Stellen:
--
--   flow_settings.zeitplan_pausiert   der Admin pausiert den Zeitplan EINES
--                                     Flows. Wie `aktiv` (200) in
--                                     `flow_settings`, ohne Stand, und es
--                                     wird nur `true` gespeichert: NULL =
--                                     der Zeitplan laeuft. Die Pause trifft
--                                     nur den Zeitplan; `aktiv` und der Start
--                                     von Hand bleiben, wie sie sind.
--   flow_runs.ausloeser               wodurch der Lauf entstand: `hand` (jeder
--                                     bisherige Lauf, auch der, den eine App
--                                     anstoesst) oder `zeitplan`.
--   flow_zeitplan_termine             ein Eintrag je Termin, den der
--                                     Zeitplaner angefasst hat. Der
--                                     Primaerschluessel IST die Zusage "genau
--                                     einmal": wer den Eintrag anlegt, startet
--                                     den Lauf, ein zweiter Versuch (zweiter
--                                     Takt, Neustart mitten im Termin) findet
--                                     ihn vor und tut nichts.
--   flow_zeitplaner                   eine Zeile: bis wohin der Zeitplaner
--                                     schon hingesehen hat. Ohne sie wuesste
--                                     das Backend nach einem Ausfall nicht,
--                                     wie lange es weg war.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.flow_zeitplaner;
--   DROP TABLE IF EXISTS public.flow_zeitplan_termine;
--   ALTER TABLE flow_runs DROP COLUMN IF EXISTS ausloeser;
--   ALTER TABLE public.flow_settings DROP COLUMN IF EXISTS zeitplan_pausiert;

ALTER TABLE public.flow_settings
  ADD COLUMN IF NOT EXISTS zeitplan_pausiert BOOLEAN
    CHECK (zeitplan_pausiert IS NULL OR zeitplan_pausiert = true);

COMMENT ON COLUMN public.flow_settings.zeitplan_pausiert IS
  'Der Admin hat den Zeitplan dieses Flows pausiert (true) oder er laeuft (NULL). Trifft nur den Zeitplan, nicht den Start von Hand. Migration 203.';

-- flow_runs liegt je nach Vorgeschichte in `arasul` oder `public` (siehe 173);
-- unqualifiziert, wie 198, findet es der search_path in beiden Faellen.
ALTER TABLE flow_runs
  ADD COLUMN IF NOT EXISTS ausloeser TEXT NOT NULL DEFAULT 'hand';

DO $$
BEGIN
  ALTER TABLE flow_runs
    ADD CONSTRAINT flow_runs_ausloeser_check CHECK (ausloeser IN ('hand', 'zeitplan'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN flow_runs.ausloeser IS
  'Wodurch der Lauf entstand: hand (ein Mensch oder die App stiess ihn an) oder zeitplan (der Zeitplaner des Geraets, ohne Einreicher). Migration 203.';

CREATE TABLE IF NOT EXISTS public.flow_zeitplan_termine (
  app_id    TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  flow_name TEXT        NOT NULL,
  termin    TIMESTAMPTZ NOT NULL,
  ergebnis  TEXT        NOT NULL
    CHECK (ergebnis IN ('gestartet', 'nachgeholt', 'uebersprungen')),
  grund     TEXT,
  run_id    BIGINT,
  erfasst_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, flow_name, termin)
);

CREATE INDEX IF NOT EXISTS idx_flow_zeitplan_termine_erfasst
  ON public.flow_zeitplan_termine (erfasst_am);

COMMENT ON TABLE public.flow_zeitplan_termine IS
  'Jeder Termin, den der Zeitplaner angefasst hat: gestartet (puenktlich), nachgeholt (nach einem Ausfall, hoechstens einer, innerhalb einer Stunde) oder uebersprungen (mit Grund). Der Primaerschluessel macht "genau einmal je Termin". Ohne Fremdschluessel auf flow_runs: der Lauf ist Geschichte. Migration 203.';

CREATE TABLE IF NOT EXISTS public.flow_zeitplaner (
  id          SMALLINT    PRIMARY KEY CHECK (id = 1),
  geprueft_bis TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.flow_zeitplaner IS
  'Eine Zeile: bis zu welcher Minute der Zeitplaner alle Termine gesehen hat. Aus dem Abstand zu jetzt ergibt sich nach einem Ausfall, was verpasst wurde. Migration 203.';
