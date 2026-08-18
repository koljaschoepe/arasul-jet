-- 142_embedding_modelltyp_normalisieren.sql — Plan 022 (Schritt 3)
--
-- Embedding-Modelle konsequent aus der Chat-Modell-Auswahl halten. Der
-- Auto-Import direkt gezogener Ollama-Modelle (`importUnknownModels`) hat vor
-- Plan 022 JEDES Nicht-Vision-Modell als `model_type='llm'` in den Katalog
-- übernommen — ein so importierter Embedder (bge-m3, all-minilm, …) tauchte
-- dadurch fälschlich im Chat-Picker auf. Der Import erkennt Embedder jetzt
-- (siehe modelSyncHelpers.istEmbeddingModell); diese Migration korrigiert
-- rückwirkend bereits falsch getypte Katalogzeilen.
--
-- Die Namens-/Anzeige-Konsistenz für Qwen3.8 27B ist bereits durch Migration
-- 141 (Plan 021, #363) hergestellt — hier bewusst NICHT erneut angefasst.
--
-- Idempotent: reine UPDATE nach Muster; erneutes Ausführen ändert nichts.
-- Der model_type-CHECK erlaubt 'embedding' seit Migration 094.

UPDATE llm_model_catalog
SET model_type = 'embedding',
    updated_at = NOW()
WHERE model_type IN ('llm', 'text')
  AND (
        id   ~* '(^|[-_/])(nomic-embed|bge-m3|bge-large|all-minilm|e5-|gte-)'
     OR id   ~* 'embed(ding)?'
     OR name ~* '(^|[-_ /])(nomic[- ]?embed|bge[- ]?m3|all[- ]?minilm|e5[- ]|gte[- ])'
     OR name ~* 'embed(ding)?'
  );
