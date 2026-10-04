-- 206_modelle_verwaltung_m5.sql -- Faehigkeiten der Modelle: Katalog und Ollama
-- gleichen sich ab (04.10.2026, M5, Auftrag verwaltung-modelle)
--
-- WARUM. Der Katalog fuehrte `qwen3.8:27b-q4_K_M` ohne Bild, Ollama meldet fuer
-- dasselbe Modell `vision` unter `capabilities` (/api/show). Bild-Schritte
-- (Kontrakt 8, Migration 205) schlossen das Standardmodell deshalb aus, obwohl
-- es Bilder liest. Ab jetzt liest `modelProfile` auch `vision` aus Ollama und
-- schreibt es in `supports_vision_input`; bei Widerspruch gewinnt Ollama.
--
-- Diese Migration setzt den Wert fuer das bekannte Modell sofort und stellt den
-- Steckbrief aller Modelle zum erneuten Lesen zurueck, damit auch jedes andere
-- am Geraet beim naechsten Abgleich angeglichen wird. Kein neues Schema.
--
-- Rollback (down): keine Strukturaenderung; der Wert korrigiert sich beim
-- naechsten Abgleich mit Ollama ohnehin selbst.

UPDATE llm_model_catalog
   SET supports_vision_input = true, updated_at = NOW()
 WHERE id IN ('qwen3.8:27b-q4_K_M', 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS');

UPDATE llm_model_catalog SET profile_read_at = NULL;
