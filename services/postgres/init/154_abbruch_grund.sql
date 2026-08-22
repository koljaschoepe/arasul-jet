-- 154_abbruch_grund.sql — Plan 023 E1: warum ein Lauf geendet hat.
--
-- Gemeldet war ein Abbruch "ohne erkennbares Muster". Das Muster fehlte, weil
-- die Spalten fehlten: `error_message` blieb bei einem Nutzer-Abbruch und beim
-- Zeitlimit leer, und der Nutzer sah in beiden Faellen denselben Satz.
--
-- Vier Spalten, ausdruecklich getrennt von `error_message`. Der Grund ist eine
-- stabile Kennung (`stream_still`, `nutzer`, ...), nach der sich zaehlen laesst;
-- `error_message` ist freier Text, nach dem sich nicht zaehlen laesst. Beide
-- zusammenzulegen hiesse, eine der beiden Bedeutungen zu verlieren.
--
-- `llm_jobs` liegt in `public`, nicht in `arasul` (siehe services/postgres/
-- CLAUDE.md, "Zwei Schemata, ein search_path"). Deshalb ausdruecklich
-- qualifiziert: unqualifiziert legte diese Migration eine Schattentabelle an.

ALTER TABLE public.llm_jobs ADD COLUMN IF NOT EXISTS abbruch_grund   VARCHAR(40);
ALTER TABLE public.llm_jobs ADD COLUMN IF NOT EXISTS abbruch_kennung VARCHAR(60);
ALTER TABLE public.llm_jobs ADD COLUMN IF NOT EXISTS abbruch_detail  TEXT;
ALTER TABLE public.llm_jobs ADD COLUMN IF NOT EXISTS abbruch_am      TIMESTAMPTZ;

COMMENT ON COLUMN public.llm_jobs.abbruch_grund IS
  'Stabile Kennung des Abbruchgrunds aus services/llm/abbruchGrund.js (GRUENDE). Zaehlbar, im Gegensatz zu error_message.';
COMMENT ON COLUMN public.llm_jobs.abbruch_kennung IS
  'ABB-<6 Zeichen der Job-Id>-<Grund>. Steht auch im Chat und im Protokoll, damit der Weg vom Bildschirm zur Protokollzeile eine Suche ist.';
COMMENT ON COLUMN public.llm_jobs.abbruch_detail IS
  'Die rohe technische Ursache. Fuer die Fehlersuche, nicht fuer den Nutzer.';

-- Teilindex: gesucht wird immer nach den abgebrochenen Laeufen, nie nach den
-- anderen. Ein voller Index waere zu 95 Prozent NULL.
CREATE INDEX IF NOT EXISTS idx_llm_jobs_abbruch_grund
  ON public.llm_jobs (abbruch_grund, abbruch_am DESC)
  WHERE abbruch_grund IS NOT NULL;
