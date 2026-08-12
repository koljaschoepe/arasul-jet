-- 138_ocr_katalog_fehler_bereinigen.sql
--
-- OCR-Engines (Tesseract/PaddleOCR) sind im Katalog als model_type='ocr'
-- geführt, sind aber KEINE Ollama-Modelle: sie werden vom Dokument-Indexer
-- verwaltet (services/document-indexer/ocr_service.py). Ein früherer Klick auf
-- „Laden" im Modell-Raster löste einen Ollama-Pull aus, der zwangsläufig mit
-- „not found" scheiterte und einen dauerhaften status='error' in
-- llm_installed_models zurückließ — die Karte zeigte für immer „Fehler".
--
-- Ab jetzt werden OCR-Modelle im Frontend gar nicht mehr als ladbare Modelle
-- angeboten und der /download-Endpunkt lehnt sie sauber ab. Diese Migration
-- räumt die schon entstandenen Fehl-Einträge auf. Idempotent: löscht nur die
-- verwaisten error-Zeilen für OCR-Modelle; existieren keine, passiert nichts.

DELETE FROM llm_installed_models i
USING llm_model_catalog c
WHERE i.id = c.id
  AND c.model_type = 'ocr'
  AND i.status = 'error';
