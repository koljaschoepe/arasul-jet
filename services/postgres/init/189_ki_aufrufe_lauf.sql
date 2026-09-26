-- 189_ki_aufrufe_lauf.sql — Auch der Modellschritt eines Flows steht im
-- Protokoll der Modellaufrufe (26.09.2026, J35, Auftrag
-- flows-im-ki-protokoll-und-auslesen-408)
--
-- WARUM. Migration 187 hat `ki_aufrufe` fuer die Aufrufe ueber die
-- Schnittstelle angelegt und Flows ausgelassen, weil ein Flow seinen Lauf mit
-- Schritten hat. Die App-Bau-Probe vom 26.09.2026 hat gezeigt, dass das nicht
-- reicht: nach einer Freigabe schreibt ein Flow einen Satz mit dem Modell, und
-- im Protokoll standen nur die zehn Auslesungen. Eine Kanzlei muss JEDEN
-- Vorschlag eines Modells nachweisen, und zwar an EINER Stelle -- nicht die
-- Haelfte in `ki_aufrufe` und die andere in den Schritten eines Laufs, die
-- ohne den Menschen, fuer den der Lauf lief, dastehen.
--
-- WAS DAZUKOMMT: `lauf_id`, der Lauf, zu dem ein Modellschritt gehoert. Ohne
-- Fremdschluessel auf `flow_runs`, aus demselben Grund wie in 187: ein
-- Nachweis ueberlebt, was er nachweist.
--
-- Rollback (down):
--   DROP INDEX IF EXISTS public.idx_ki_aufrufe_lauf;
--   ALTER TABLE public.ki_aufrufe DROP COLUMN IF EXISTS lauf_id;

ALTER TABLE public.ki_aufrufe
  ADD COLUMN IF NOT EXISTS lauf_id BIGINT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_aufrufe_lauf
  ON public.ki_aufrufe (lauf_id)
  WHERE lauf_id IS NOT NULL;

COMMENT ON COLUMN public.ki_aufrufe.lauf_id IS
  'Der Flow-Lauf, zu dem dieser Modellschritt gehoert; NULL fuer einen Aufruf ueber die Schnittstelle.';
