-- 096_rag_llm_tunables_and_prompts.sql
--
-- Completes the env→DB migration of RAG/LLM tunables started in 094 so every
-- knob the admin UI exposes lives in system_settings and survives redeploys.
-- All defaults exactly match the previously hardcoded/env values — applying
-- this migration changes no behavior until an operator edits a value.
--
-- The runner wraps each file in its own transaction; do not BEGIN/COMMIT here.
--
-- Down-script (manual rollback; code falls back to env/code defaults):
--   ALTER TABLE system_settings
--     DROP COLUMN IF EXISTS rag_temperature,
--     DROP COLUMN IF EXISTS rag_num_predict,
--     DROP COLUMN IF EXISTS rag_mmr_lambda,
--     DROP COLUMN IF EXISTS rag_dedup_max_per_doc,
--     DROP COLUMN IF EXISTS rag_hybrid_search,
--     DROP COLUMN IF EXISTS rag_space_routing_threshold,
--     DROP COLUMN IF EXISTS rag_space_routing_max_spaces,
--     DROP COLUMN IF EXISTS llm_base_system_prompt;

-- ============================================================================
-- 1. system_settings: remaining RAG generation + retrieval tunables
-- ============================================================================

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_temperature FLOAT DEFAULT 0.2;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_num_predict INT DEFAULT 2048;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_mmr_lambda FLOAT DEFAULT 0.7;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_dedup_max_per_doc INT DEFAULT 3;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_hybrid_search BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_space_routing_threshold FLOAT DEFAULT 0.4;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_space_routing_max_spaces INT DEFAULT 3;

COMMENT ON COLUMN system_settings.rag_temperature IS
    'Sampling temperature for RAG answers. Low (0.2) = faithful to sources.';
COMMENT ON COLUMN system_settings.rag_num_predict IS
    'Token cap for generated RAG answers (Ollama num_predict).';
COMMENT ON COLUMN system_settings.rag_mmr_lambda IS
    'MMR diversity trade-off: 1.0 = pure relevance, 0.0 = pure diversity.';
COMMENT ON COLUMN system_settings.rag_dedup_max_per_doc IS
    'Maximum chunks per source document in the final LLM context.';
COMMENT ON COLUMN system_settings.rag_hybrid_search IS
    'Master switch for Qdrant hybrid search (dense BGE-M3 + sparse BM25, RRF fusion).';
COMMENT ON COLUMN system_settings.rag_space_routing_threshold IS
    'Minimum cosine similarity for a knowledge space to be routed into a query.';
COMMENT ON COLUMN system_settings.rag_space_routing_max_spaces IS
    'Maximum knowledge spaces considered per query.';

-- ============================================================================
-- 2. system_settings: DB-editable base system prompt (layer 1)
-- ============================================================================
-- NULL means "use the code default" in systemPromptBuilder.js. Layers 2-4
-- (AI profile, company context, project prompt) were already DB-backed.

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS llm_base_system_prompt TEXT DEFAULT NULL;

COMMENT ON COLUMN system_settings.llm_base_system_prompt IS
    'Global base system prompt (layer 1). NULL = built-in default in systemPromptBuilder.js.';
