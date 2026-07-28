-- 126_model_catalog_honest.sql — Modellkatalog ehrlich machen
--
-- Drei Aufräumarbeiten aus dem Live-Audit 2026-07-28:
--
-- 1. Der Katalog-Eintrag qwen3:7b-q8 hieß „Qwen 3 7B", zieht aber real
--    qwen3:8b (8 Mrd. Parameter) — Anzeige und Wirklichkeit auseinander.
--    qwen3:14b-q8 zeigte auf den Registry-Tag 'qwen3:14b-q8', den es nicht
--    gibt (das real installierte Modell heißt qwen3:14b) — der Eintrag stand
--    dadurch dauerhaft auf „Fehler".
-- 2. Direkt in llm_installed_models eingetragene Roh-Namen (z. B. 'qwen3:14b')
--    duplizieren den Katalog-Eintrag, der auf denselben Ollama-Namen zeigt —
--    dasselbe Modell erschien doppelt bzw. gar nicht (kein Katalog-Join).
-- 3. Die Seed-Beschreibungen trugen Ersatz-Umlaute („fuer", „Qualitaet").
--
-- Ergänzend lernt der Sync (modelSyncHelpers.importUnknownModels), Modelle,
-- die nur in Ollama existieren, automatisch in den Katalog zu übernehmen.

-- --- 1. Qwen-Einträge geradeziehen -----------------------------------------

UPDATE llm_model_catalog
SET name = 'Qwen 3 8B',
    ollama_name = 'qwen3:8b',
    description = 'Schnelles Allzweck-Modell mit hervorragender Mehrsprachigkeit',
    updated_at = NOW()
WHERE id = 'qwen3:7b-q8';

UPDATE llm_model_catalog
SET ollama_name = 'qwen3:14b',
    description = 'Ausgewogenes Modell für die meisten Aufgaben mit erweitertem Kontext',
    updated_at = NOW()
WHERE id = 'qwen3:14b-q8';

UPDATE llm_model_catalog
SET ollama_name = 'qwen3:32b',
    description = 'Großes Modell für komplexe Aufgaben und tiefgehende Analysen',
    updated_at = NOW()
WHERE id = 'qwen3:32b-q4';

-- --- 2. Doppelte/verwaiste Installations-Zeilen ----------------------------

-- Trägt eine Roh-Namen-Zeile (ohne Katalog-Eintrag) das Default-Flag, wandert
-- das Flag auf den Katalog-Eintrag, der auf denselben Ollama-Namen zeigt —
-- erst danach darf die Duplikat-Zeile weg.
UPDATE llm_installed_models ziel
SET is_default = TRUE
WHERE EXISTS (
        SELECT 1
          FROM llm_installed_models dup
          JOIN llm_model_catalog c
            ON COALESCE(c.ollama_name, c.id) IN (dup.id, dup.id || ':latest')
         WHERE dup.is_default = TRUE
           AND c.id = ziel.id
           AND dup.id <> ziel.id
           AND NOT EXISTS (SELECT 1 FROM llm_model_catalog k WHERE k.id = dup.id)
      );

-- Duplikate löschen: Installations-Zeilen ohne Katalog-Eintrag, deren Name
-- bereits der Ollama-Name eines Katalog-Eintrags ist.
DELETE FROM llm_installed_models dup
WHERE NOT EXISTS (SELECT 1 FROM llm_model_catalog k WHERE k.id = dup.id)
  AND EXISTS (
        SELECT 1 FROM llm_model_catalog c
         WHERE COALESCE(c.ollama_name, c.id) IN (dup.id, dup.id || ':latest')
      );

-- Fehler-Leichen einmalig ausräumen (fehlgeschlagene/abgebrochene Downloads,
-- „nicht in Ollama gefunden"). Der Boot-Sync legt alles, was real in Ollama
-- liegt, sofort wieder als 'available' an — was danach fehlt, war wirklich
-- nur Karteileiche. Das Default-Flag bleibt unantastbar.
DELETE FROM llm_installed_models
WHERE status = 'error'
  AND is_default = FALSE;

-- --- 3. Echte Umlaute in den Seed-Texten -----------------------------------

UPDATE llm_model_catalog
SET description = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      description,
      'fuer', 'für'),
      'Qualitaet', 'Qualität'),
      'Faehigkeit', 'Fähigkeit'),
      'Europaeisches', 'Europäisches'),
      'Grosses', 'Großes'),
      'groesstes', 'größtes'),
      'Verstaendnis', 'Verständnis'),
      'beschraenkte', 'beschränkte'),
      'Geraete', 'Geräte'),
      'hoeherer', 'höherer'),
      'Unterstuetzt', 'Unterstützt'),
    updated_at = NOW()
WHERE description ~ '(fuer|Qualitaet|Faehigkeit|Europaeisches|Grosses|groesstes|Verstaendnis|beschraenkte|Geraete|hoeherer|Unterstuetzt)';
