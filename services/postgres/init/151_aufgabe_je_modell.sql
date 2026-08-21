-- 151_aufgabe_je_modell.sql — Plan 023 D5: ein Standard je Aufgabe
--
-- Der Katalog wusste bisher nicht, wofuer ein Modell da ist. Es gab zwei
-- Naeherungen, und beide taugten nicht:
--
--   `model_type`  sagt, WAS ein Modell kann (llm, vision, ocr, embedding),
--                 nicht, wofuer es vorgesehen ist. Gemma 4 kann Bilder lesen
--                 und ist trotzdem das Textmodell des Geraets.
--   `speed_tier`  vermischt Tempo (fast, balanced, quality) und Rolle
--                 (vision, ocr, embed) in einer Spalte.
--
-- Und der Standard je Aufgabe stand gar nicht hier, sondern als fest
-- verdrahtete Karte in `utils/hardware.js`. Acht der siebzehn Kennungen dort
-- gibt es im Katalog nicht; auf einem Xavier NX empfiehlt sie `phi3:mini`, ein
-- Modell, das niemand laden kann.
--
-- `is_platform_default` war der dritte Versuch. Die Spalte stand bei DREI
-- Modellen auf true, und keine Zeile im Backend hat sie je gelesen. Sie faellt
-- weg; nichts liest sie, also geht nichts verloren.
--
-- Neu: `task` sagt, wofuer ein Modell vorgesehen ist, und `is_task_default`
-- sagt, welches je Aufgabe voreingestellt ist. Das erzwingt ein eindeutiger
-- Teil-Index: es kann pro Aufgabe genau EINEN Standard geben. Ein Feld namens
-- "der Standard" mit drei Werten soll die Datenbank kuenftig ablehnen, nicht
-- ein Mensch bemerken.

ALTER TABLE llm_model_catalog
  ADD COLUMN IF NOT EXISTS task            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_task_default BOOLEAN DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'llm_model_catalog_task_check'
  ) THEN
    ALTER TABLE llm_model_catalog
      ADD CONSTRAINT llm_model_catalog_task_check
      CHECK (task IS NULL OR task IN ('text', 'coding', 'vision', 'ocr', 'embedding'));
  END IF;
END $$;

COMMENT ON COLUMN llm_model_catalog.task IS
  'Wofuer das Modell vorgesehen ist: text, coding, vision, ocr, embedding. NULL = keiner Aufgabe zugeordnet.';
COMMENT ON COLUMN llm_model_catalog.is_task_default IS
  'Voreingestellt fuer seine Aufgabe. Hoechstens einer je task, erzwungen durch idx_llm_catalog_task_default.';

-- Zuordnung nach dem, was die Modelle sind, nicht nach dem, was ihr Typ sagt.
UPDATE llm_model_catalog SET task = 'embedding' WHERE model_type = 'embedding' AND task IS NULL;
UPDATE llm_model_catalog SET task = 'ocr'       WHERE model_type = 'ocr'       AND task IS NULL;

-- Coding: die beiden Modelle, die dafuer im Katalog stehen.
UPDATE llm_model_catalog SET task = 'coding'
 WHERE id IN ('qwen3-coder:30b', 'deepseek-coder:6.7b') AND task IS NULL;

-- Sehen: Modelle, deren einziger Zweck das Bild ist. Gemma 4 kann es auch,
-- ist aber das Textmodell des Geraets und steht deshalb unter 'text'.
UPDATE llm_model_catalog SET task = 'vision'
 WHERE id IN ('llava:7b', 'llava-phi3', 'minicpm-v:8b', 'paligemma-3b-mix') AND task IS NULL;

-- Alles Uebrige ist Text, AUSSER Audio.
--
-- `model_type` kennt seit Migration 035 auch 'audio', und der Plan 023 nennt
-- fuenf Aufgaben: Text, Coding, Sehen, Texterkennung, Einbettung. Audio ist
-- keine davon. Ein Audiomodell hier unter 'text' einzusortieren waere still
-- falsch: es stuende im Filter unter Text, und niemand faende den Fehler.
--
-- Es bleibt deshalb ohne Aufgabe. Die Anzeige faellt dann auf `model_type`
-- zurueck und schreibt "Audio", also das, was zutrifft. Wer Audio zu einer
-- Aufgabe machen will, erweitert die Pruefbedingung und `TASK_LABELS`; bis
-- dahin wird nichts behauptet.
--
-- Heute traegt kein Katalogeintrag diesen Typ. Der Zweig steht hier, damit der
-- erste, der ihn traegt, nicht falsch einsortiert wird.
UPDATE llm_model_catalog SET task = 'text'
 WHERE task IS NULL AND COALESCE(model_type, 'llm') <> 'audio';

-- Ein nicht ladbarer Eintrag faellt weg, bevor er Standard werden koennte.
-- `paligemma` steht in der Ollama-Registrierung nicht, weder mit dem
-- hinterlegten Tag `3b-mix-448-q4_0` noch als `latest`; beide antworten mit
-- 404, geprueft am 21.08.2026. Ein Kunde, der darauf klickt, bekommt einen
-- Fehler. Und `getRecommendedModel` empfiehlt es auf vier Geraeteprofilen als
-- Standard fuers Sehen.
--
-- Nur, wenn es niemand installiert hat: eine Zeile in `llm_installed_models`
-- ohne Katalogeintrag waere schlimmer als der falsche Katalogeintrag.
DELETE FROM llm_model_catalog c
 WHERE c.id = 'paligemma-3b-mix'
   AND NOT EXISTS (SELECT 1 FROM llm_installed_models i WHERE i.id = c.id);

-- Ein Standard je Aufgabe, in einer Rangfolge statt mit festen Kennungen.
-- Auf einem frischen Geraet gibt es `qwen3-coder:30b` nicht, das ist ein
-- lokaler Direkt-Pull; ohne Rangfolge bliebe die Aufgabe `coding` ohne
-- Standard, am Pruefstand gesehen.
--
-- Gesetzt wird nur, wo die Aufgabe noch keinen Standard hat. Damit laeuft die
-- Migration ein zweites Mal folgenlos und ueberschreibt keine spaetere Wahl
-- von Hand.
WITH rangfolge(task, id, rang) AS (
  VALUES
    ('text',      'gemma4:26b-q4',    1),
    ('text',      'gemma4:e4b-q4',    2),
    ('text',      'qwen3:14b-q8',     3),
    ('coding',    'qwen3-coder:30b',  1),
    ('coding',    'deepseek-coder:6.7b', 2),
    ('vision',    'minicpm-v:8b',     1),
    ('vision',    'llava:7b',         2),
    ('ocr',       'tesseract:latest', 1),
    ('embedding', 'nomic-embed-text', 1)
),
wahl AS (
  SELECT DISTINCT ON (r.task) r.id
    FROM rangfolge r
    JOIN llm_model_catalog c ON c.id = r.id AND c.task = r.task
   WHERE NOT EXISTS (
     SELECT 1 FROM llm_model_catalog d WHERE d.task = r.task AND d.is_task_default
   )
   ORDER BY r.task, r.rang
)
UPDATE llm_model_catalog SET is_task_default = true WHERE id IN (SELECT id FROM wahl);

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_catalog_task_default
  ON llm_model_catalog (task) WHERE is_task_default = true;

-- Die tote Spalte. Sie stand bei drei Modellen auf true, und kein Aufrufer
-- existiert; `grep -rn is_platform_default apps/ services/` findet ausser der
-- Migration 064, die sie angelegt hat, nichts.
DROP INDEX IF EXISTS idx_llm_catalog_platform_default;
ALTER TABLE llm_model_catalog DROP COLUMN IF EXISTS is_platform_default;
