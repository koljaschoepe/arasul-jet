-- 101_model_catalog_context_window_seed.sql — Store 3.1: show context length
-- on the model detail page.
--
-- The catalog already carries `context_window` (integer, tokens) from migration
-- 041, but that migration predates the Gemma 4 catalog (062/065), so those rows
-- are still NULL. Seed the known windows here so the Extensions/Store detail
-- page can render "Kontextlänge". Additive + idempotent; no BEGIN/COMMIT — the
-- migration runner wraps each file in its own transaction.

-- Safety net in case the column was never created (already exists post-041).
ALTER TABLE llm_model_catalog
    ADD COLUMN IF NOT EXISTS context_window integer;

-- Seed only where still NULL so re-runs never clobber operator edits.
UPDATE llm_model_catalog SET context_window = 131072
    WHERE id = 'gemma4:e4b-q4' AND context_window IS NULL;   -- 128K
UPDATE llm_model_catalog SET context_window = 262144
    WHERE id = 'gemma4:26b-q4' AND context_window IS NULL;   -- 256K
UPDATE llm_model_catalog SET context_window = 262144
    WHERE id = 'gemma4:31b-q4' AND context_window IS NULL;   -- 256K
