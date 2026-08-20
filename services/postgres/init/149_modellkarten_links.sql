-- 149_modellkarten_links.sql — Plan 023 D2: jeder Link fuehrt auf die Modellkarte
--
-- Am 20.08.2026 wurden alle hinterlegten Links abgerufen. Einer davon war tot:
-- `paligemma-3b-mix` zeigte auf https://ollama.com/library/paligemma, und die
-- Seite antwortet mit 404. Die richtige Karte steht bei Google auf Hugging
-- Face und antwortet mit 200.
--
-- Vier weitere Eintraege trugen gar keinen Link, alle vier per Direkt-Pull in
-- den Katalog gekommen. Drei davon haben eine Karte in der Ollama-Bibliothek,
-- ebenfalls abgerufen und mit 200 bestaetigt. Die uebrigen beiden Eintraege
-- (`paddleocr:latest`, `tesseract:latest`) bekommen bewusst KEINEN Link: sie
-- sind keine Ollama-Modelle, und ein geratener Link waere schlechter als
-- keiner. Die Detailseite laesst die Zeile dann weg.
--
-- Kein Link wird ueberschrieben, der schon steht und funktioniert.
--
-- Am Pruefstand gegengeprueft: dort greift nur die erste Anweisung. Die drei
-- Direkt-Pull-Eintraege gibt es auf einem frischen Geraet gar nicht, sie
-- entstehen erst, wenn jemand ein Modell an Arasul vorbei zieht
-- (importUnknownModels). Die drei UPDATEs sind dort also folgenlos, und das
-- ist richtig so: sie raeumen den Zustand auf, der heute auf dem Arbeitsgeraet
-- steht, ohne einem frischen Geraet etwas vorzuschreiben.

UPDATE llm_model_catalog SET ollama_library_url = 'https://huggingface.co/google/paligemma-3b-mix-448', updated_at = NOW()
 WHERE id = 'paligemma-3b-mix' AND ollama_library_url = 'https://ollama.com/library/paligemma';

UPDATE llm_model_catalog SET ollama_library_url = 'https://ollama.com/library/llava-phi3', updated_at = NOW()
 WHERE id = 'llava-phi3' AND COALESCE(ollama_library_url, '') = '';

UPDATE llm_model_catalog SET ollama_library_url = 'https://ollama.com/library/qwen3-coder', updated_at = NOW()
 WHERE id = 'qwen3-coder:30b' AND COALESCE(ollama_library_url, '') = '';

UPDATE llm_model_catalog SET ollama_library_url = 'https://ollama.com/library/qwen3', updated_at = NOW()
 WHERE id = 'qwen3:14b-nothink' AND COALESCE(ollama_library_url, '') = '';
