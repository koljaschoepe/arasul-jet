-- 209_nachtrag_bild_ist_text_m5.sql -- Nachgetragene Modelle mit Bild sind
-- Textmodelle (05.10.2026, M5, Auftrag jet-pruefung-zwei, Befund 1)
--
-- WARUM. Der Abgleich traegt Modelle, die nur bei Ollama liegen, in den Katalog
-- nach (`modelSyncHelpers.traegNachModelle`). Bis heute bekam jedes davon, das
-- Bilder liest, die Aufgabe `vision` -- auch `gemma4:26b`, das ebenso Prompts
-- beantwortet (Ollama meldet `completion`). `schrittModelle.faehigkeitenVon`
-- liest `vision` als „kein Text“: das Modell fehlte bei Textschritten und als
-- Standard. Der Code traegt jetzt `text` ein und das Bild in
-- `supports_vision_input`; diese Migration zieht die Zeilen nach, die schon
-- angelegt sind.
--
-- WELCHE ZEILEN. Nur die des Nachtrags: frei geladen und mit dessen
-- Beschreibung. Die Kurzliste (`llava-phi3` bleibt das Bildmodell) und frei
-- geladene Modelle aus der Verwaltung fasst sie nicht an. Ein nachgetragenes
-- Modell ganz ohne `completion` kennt Ollama heute nicht; traefe es doch eines,
-- haelt der Lauf es an der Fehlermeldung von Ollama an, nicht still.
--
-- Wiederholbar: ein zweiter Lauf findet keine Zeile mehr.
-- Rollback (down): nicht noetig; die alte Aufgabe war falsch.

UPDATE public.llm_model_catalog
   SET task = 'text',
       model_type = 'llm',
       updated_at = NOW()
 WHERE frei_geladen = true
   AND task = 'vision'
   AND supports_vision_input = true
   AND description LIKE 'Am Gerät bei Ollama gefunden%';
