-- 160_selbst_hinzugefuegte_modelle.sql — was der Kunde selbst eingetragen hat
--
-- Mit `POST /api/models/katalog` (Plan 023, Entscheidung vom 23.08.2026) kann
-- ein Kunde ein Modell ueber einen Link hinzufuegen. Beim Nachweisen am Geraet
-- fiel die Kehrseite auf: es gibt keinen Weg zurueck. `DELETE /api/models/:id`
-- raeumt nur `llm_installed_models`, die Katalogzeile bleibt. Ein Tippfehler
-- im Namen stuende damit fuer immer im Katalog des Kunden.
--
-- Diese Spalte trennt, was geloescht werden darf, von dem, was bleiben muss.
-- Sie steht hier und nicht als Text in `description`, weil eine Berechtigung
-- nicht davon abhaengen darf, wie ein Satz formuliert ist.
--
-- Die kuratierten Zeilen behalten `false`: sie kommen aus Migrationen und
-- kaemen beim naechsten Start ohnehin wieder.

ALTER TABLE public.llm_model_catalog
  ADD COLUMN IF NOT EXISTS selbst_hinzugefuegt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.llm_model_catalog.selbst_hinzugefuegt IS
  'true = vom Kunden ueber POST /api/models/katalog eingetragen und wieder entfernbar';

-- Was bereits ueber die neue Route hereinkam, traegt den Satz aus der Route.
-- Einmalig nachgezogen, damit die erste Zeile nicht als kuratiert gilt.
UPDATE public.llm_model_catalog
   SET selbst_hinzugefuegt = true
 WHERE description LIKE 'Selbst hinzugefügt%';
