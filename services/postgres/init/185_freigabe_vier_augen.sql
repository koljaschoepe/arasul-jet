-- 185_freigabe_vier_augen.sql — Wer eine Freigabe entscheiden darf
-- (25.09.2026, J35, Auftrag apps-halten-daten-und-vier-augen)
--
-- WARUM. Seit C7 (Migration 174) darf jeder eine Freigabe entscheiden, dem
-- die App freigegeben ist -- auch der, der den Vorgang eingereicht hat. Fuer
-- eine Kanzlei ist das der Kern: niemand gibt seinen eigenen Vorschlag frei.
-- Zwei Dinge kommen deshalb dazu, beide FREIWILLIG und beide gesetzt von der
-- App, die den Lauf startet (sie kennt den Menschen aus `X-Arasul-User`):
--
--   einreicher        wer den Lauf ausgeloest hat
--   ohne_einreicher   dieser Mensch entscheidet nicht (Vier-Augen-Prinzip)
--   entscheider_*     nur diese Menschen sehen und entscheiden: die Rolle
--                     `admin` ODER eine Liste von Konten
--
-- DIE REGEL STEHT AM LAUF UND AN DER ANFRAGE. Am Lauf, weil sie beim Start
-- kommt und fuer jede Freigabe darin gilt; an der Anfrage, weil sie dort
-- beantwortet wird und dort auch in einem halben Jahr nachlesbar sein muss --
-- ein Lauf kann weggeraeumt werden, die Frage „wer durfte das" nicht.
--
-- Der Kreis bleibt dabei IMMER innerhalb von `app_members`: eine benannte
-- Entscheiderin, der die App nicht freigegeben ist, darf so wenig wie vorher.
-- Die Regel engt ein, sie erweitert nie.
--
-- Rollback (down):
--   ALTER TABLE public.approvals
--     DROP CONSTRAINT IF EXISTS approvals_entscheider_rolle_chk,
--     DROP COLUMN IF EXISTS einreicher_id,
--     DROP COLUMN IF EXISTS ohne_einreicher,
--     DROP COLUMN IF EXISTS entscheider_rolle,
--     DROP COLUMN IF EXISTS entscheider_ids;
--   ALTER TABLE flow_runs
--     DROP COLUMN IF EXISTS einreicher_id,
--     DROP COLUMN IF EXISTS freigabe_regel;

-- 1. Am Lauf. `flow_runs` steht je nach Vorgeschichte in `arasul` oder in
--    `public` (Migration 173) -- unqualifiziert, wie in 131, der `search_path`
--    findet sie. Kein Fremdschluessel auf `admin_users`: der liegt in `public`,
--    und ein Lauf, dessen Einreicher geloescht wurde, bleibt ein Lauf.
ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS einreicher_id BIGINT DEFAULT NULL;
ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS freigabe_regel JSONB DEFAULT NULL;

-- 2. An der Anfrage.
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS einreicher_id BIGINT
    REFERENCES public.admin_users(id) ON DELETE SET NULL;
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS ohne_einreicher BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS entscheider_rolle TEXT DEFAULT NULL;
-- Eine Liste von Konten. NULL heisst „keine Liste", eine leere Liste gibt es
-- nicht -- sie hiesse „niemand", und das weist schon der Start des Laufs ab.
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS entscheider_ids BIGINT[] DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.approvals'::regclass
       AND conname = 'approvals_entscheider_rolle_chk'
  ) THEN
    -- Rolle ODER Liste, nicht beides: zwei Kreise zugleich liessen offen, ob
    -- sie sich schneiden oder vereinigen, und genau diese Frage soll niemand
    -- beim Lesen einer Zeile beantworten muessen.
    ALTER TABLE public.approvals
      ADD CONSTRAINT approvals_entscheider_rolle_chk
      CHECK (
        (entscheider_rolle IS NULL OR entscheider_rolle = 'admin')
        AND NOT (entscheider_rolle IS NOT NULL AND entscheider_ids IS NOT NULL)
        AND (entscheider_ids IS NULL OR cardinality(entscheider_ids) > 0)
      );
  END IF;
END $$;
