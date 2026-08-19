-- Migration 144: Entwicklernotiz aus dem Kundenkatalog entfernen
--
-- Modelle, die nur in Ollama existieren, werden automatisch in den Katalog
-- uebernommen (modelSyncHelpers.js, importUnknownModels). Ihre Beschreibung
-- lautete woertlich "Lokal in Ollama vorhandenes Modell (4B) — automatisch in
-- den Katalog uebernommen." und stand im Store unveraendert neben den
-- kuratierten Modellen. Der Text erklaerte dem Kunden die eigene
-- Importmechanik statt das Modell.
--
-- Der Erzeuger ist am 2026-08-19 auf einen Kundentext umgestellt. Diese
-- Migration zieht die bereits vorhandenen Eintraege nach; ohne sie behalten
-- sie den alten Text, weil der Import mit ON CONFLICT DO NOTHING arbeitet
-- und bestehende Zeilen nie anfasst.
--
-- Der Hinweis auf die fehlende Pruefung bleibt bewusst erhalten: das Feld
-- jetson_tested ist bei diesen Eintraegen false und wird in der Oberflaeche
-- (noch) nicht angezeigt.

UPDATE llm_model_catalog
SET description = 'Auf diesem Gerät installiert'
    || COALESCE(
         ', ' || NULLIF(
           (regexp_match(description, 'vorhandenes Modell \(([^)]+)\)'))[1],
           ''
         ),
         ''
       )
    || '. Nicht von Arasul geprüft.'
WHERE description LIKE '%automatisch in den Katalog%';

-- updated_at setzt der Trigger trigger_llm_model_catalog_updated_at.
