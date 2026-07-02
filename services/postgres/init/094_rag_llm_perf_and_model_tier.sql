-- 094_rag_llm_perf_and_model_tier.sql
--
-- Performance-tuning DB-backed settings for RAG (top_k, thresholds, reranker)
-- and LLM (num_ctx, keep_alive, num_predict), plus a semantic `speed_tier`
-- column on the model catalog (Store UI grouping + Setup auto-pick) and
-- curated entries for small Gemma 3 variants and dedicated vision/embedding
-- models.
--
-- The runner wraps each file in its own transaction; do not BEGIN/COMMIT here.

-- ============================================================================
-- 0. Widen model_type CHECK before inserting the embedding model
-- ============================================================================
-- Migration 035 constrained model_type to ('llm','ocr','vision','audio'). Section 4
-- below inserts nomic-embed-text with model_type='embedding', which violated that
-- constraint and made this whole migration fail (schema_migrations stuck at 093,
-- 095 never applied). Widen the constraint idempotently so the insert succeeds on
-- both fresh installs and existing boxes retrying this migration.

ALTER TABLE llm_model_catalog
    DROP CONSTRAINT IF EXISTS llm_model_catalog_model_type_check;
ALTER TABLE llm_model_catalog
    ADD CONSTRAINT llm_model_catalog_model_type_check
    CHECK (model_type IN ('llm', 'text', 'ocr', 'vision', 'audio', 'embedding'));

-- ============================================================================
-- 1. system_settings: RAG + LLM performance defaults
-- ============================================================================
-- All defaults match the post-P0 env defaults in ragCore.js / llmOllamaStream.js
-- so a fresh install gets the calibrated values without manual tuning.
-- NULL on llm_num_ctx_default means "auto-detect via budget manager".

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_top_k INT DEFAULT 10;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_final_k INT DEFAULT 4;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_score_threshold FLOAT DEFAULT 0.30;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_relevance_threshold FLOAT DEFAULT 0.55;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_rerank_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS rag_timeout_rerank_ms INT DEFAULT 8000;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS llm_num_ctx_default INT DEFAULT NULL;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS llm_keep_alive_seconds INT DEFAULT 3600;
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS llm_num_predict_default INT DEFAULT 2048;

COMMENT ON COLUMN system_settings.rag_top_k IS
    'Candidate chunks fed into the reranker. Higher = better recall, slower.';
COMMENT ON COLUMN system_settings.rag_final_k IS
    'Final chunks the LLM sees after MMR + dedupe. Smaller = focused context.';
COMMENT ON COLUMN system_settings.rag_score_threshold IS
    'Minimum vector/RRF score for a chunk when no reranker was applied.';
COMMENT ON COLUMN system_settings.rag_relevance_threshold IS
    'Minimum reranker score for a chunk to be considered relevant.';
COMMENT ON COLUMN system_settings.rag_rerank_enabled IS
    'Master switch for the 2-stage BGE reranker.';
COMMENT ON COLUMN system_settings.rag_timeout_rerank_ms IS
    'Per-request rerank timeout. 120s previously masked silent failures.';
COMMENT ON COLUMN system_settings.llm_num_ctx_default IS
    'Default num_ctx for Ollama chat options. NULL = budget-manager auto-detect.';
COMMENT ON COLUMN system_settings.llm_keep_alive_seconds IS
    'Seconds Ollama keeps a loaded model resident before unloading. 3600 = 1h.';
COMMENT ON COLUMN system_settings.llm_num_predict_default IS
    'Default cap for generated tokens per chat turn. Overridable per-request.';

-- ============================================================================
-- 2. llm_model_catalog: semantic speed_tier column
-- ============================================================================

ALTER TABLE llm_model_catalog
    ADD COLUMN IF NOT EXISTS speed_tier VARCHAR(20) DEFAULT 'balanced'
    CHECK (speed_tier IN ('fast', 'balanced', 'quality', 'vision', 'ocr', 'embed'));

COMMENT ON COLUMN llm_model_catalog.speed_tier IS
    'Semantic tier for Store UI grouping and Setup auto-pick: fast/balanced/quality/vision/ocr/embed. Independent from the numeric performance_tier (1=fastest, 3=slowest).';

CREATE INDEX IF NOT EXISTS idx_llm_catalog_speed_tier
    ON llm_model_catalog(speed_tier);

-- ============================================================================
-- 3. Backfill speed_tier on existing rows
-- ============================================================================
-- Order matters: most-specific rules first, "fall-through balanced default" last.

-- Embedding models → 'embed'
UPDATE llm_model_catalog
SET speed_tier = 'embed'
WHERE model_type = 'embedding' AND speed_tier = 'balanced';

-- OCR-typed models → 'ocr'
UPDATE llm_model_catalog
SET speed_tier = 'ocr'
WHERE model_type = 'ocr' AND speed_tier = 'balanced';

-- Gemma 4 edge variants (E2B/E4B) → 'fast' (multimodal but tiny)
UPDATE llm_model_catalog
SET speed_tier = 'fast'
WHERE id IN ('gemma4:e2b-q4', 'gemma4:e2b-q8', 'gemma4:e4b-q4', 'gemma4:e4b-q8')
  AND speed_tier = 'balanced';

-- Large Gemma 4 (26B MoE, 31B dense) → 'quality'
UPDATE llm_model_catalog
SET speed_tier = 'quality'
WHERE id IN ('gemma4:26b-q4', 'gemma4:26b-q8', 'gemma4:31b-q4', 'gemma4:31b-q8')
  AND speed_tier = 'balanced';

-- Remaining vision-typed models (LLaVA, MiniCPM-V, etc.) → 'vision'
UPDATE llm_model_catalog
SET speed_tier = 'vision'
WHERE model_type = 'vision' AND speed_tier = 'balanced';

-- Small text models (≤ 5 GB RAM) → 'fast'
UPDATE llm_model_catalog
SET speed_tier = 'fast'
WHERE ram_required_gb <= 5
  AND model_type IN ('llm', 'text')
  AND speed_tier = 'balanced';

-- Large text models (≥ 20 GB RAM) → 'quality'
UPDATE llm_model_catalog
SET speed_tier = 'quality'
WHERE ram_required_gb >= 20
  AND model_type IN ('llm', 'text')
  AND speed_tier = 'balanced';

-- Everything else stays 'balanced' (the column default).

-- ============================================================================
-- 4. Curated catalog additions
-- ============================================================================
-- Entries marked jetson_tested=false until verified against the live Ollama
-- ARM64 library. The Store UI can show them in a "verify first" subsection
-- if needed; default Store rendering only shows the verified curated set.

INSERT INTO llm_model_catalog (
    id, name, description, ollama_name,
    size_bytes, ram_required_gb, category,
    capabilities, recommended_for,
    model_type, supports_thinking, supports_vision_input, rag_optimized,
    jetson_tested, performance_tier, speed_tier, ollama_library_url
) VALUES
    -- Fast text-only Gemma 3 (no native vision; pair with auto-vision-fallback)
    ('gemma3:1b', 'Gemma 3 1B',
     'Ultra-leichtes Google-Modell ohne Vision. Schnellste Antworten, kleinster Footprint. 32K Kontext.',
     'gemma3:1b',
     900000000, 2, 'small',
     '["general", "multilingual", "quick"]'::jsonb,
     '["chat", "quick-tasks", "fallback"]'::jsonb,
     'llm', false, false, false,
     false, 1, 'fast', 'https://ollama.com/library/gemma3'),

    ('gemma3:4b', 'Gemma 3 4B',
     'Kompaktes Google-Modell ohne Vision. Sehr schnell, gute Qualität für Alltagsfragen. 32K Kontext.',
     'gemma3:4b',
     2500000000, 4, 'small',
     '["general", "multilingual", "reasoning"]'::jsonb,
     '["chat", "quick-tasks", "rag"]'::jsonb,
     'llm', false, false, true,
     false, 1, 'fast', 'https://ollama.com/library/gemma3'),

    ('gemma3:12b', 'Gemma 3 12B',
     'Mittelgroßes Google-Modell ohne Vision. Ausgewogene Balance aus Qualität und Geschwindigkeit. 128K Kontext.',
     'gemma3:12b-it-q4_K_M',
     8000000000, 10, 'medium',
     '["general", "multilingual", "reasoning", "analysis"]'::jsonb,
     '["chat", "rag", "document-analysis"]'::jsonb,
     'llm', false, false, true,
     false, 2, 'balanced', 'https://ollama.com/library/gemma3'),

    -- Dedicated vision specialists (used as auto-vision-fallback in P6)
    ('paligemma-3b-mix', 'PaliGemma 3B Mix',
     'Googles spezialisiertes Vision-Modell. Bildanalyse, OCR, Caption-Generierung. Klein genug als Auto-Vision-Fallback für Text-only-Chats.',
     'paligemma:3b-mix-448-q4_0',
     3500000000, 5, 'small',
     '["vision", "ocr", "captioning"]'::jsonb,
     '["image-analysis", "auto-vision-fallback", "ocr"]'::jsonb,
     'vision', false, true, false,
     false, 1, 'vision', 'https://ollama.com/library/paligemma'),

    ('llava:7b', 'LLaVA 1.5 7B',
     'Bewährtes Vision-Modell auf Llama-Basis. Allgemeine Bildbeschreibung und visuelles Q&A.',
     'llava:7b',
     4500000000, 6, 'small',
     '["vision", "captioning", "visual-qa"]'::jsonb,
     '["image-analysis", "visual-chat"]'::jsonb,
     'vision', false, true, false,
     false, 2, 'vision', 'https://ollama.com/library/llava'),

    ('minicpm-v:8b', 'MiniCPM-V 2.6',
     'Multimodales 8B-Modell mit starker OCR. Dual-use als visueller Chat und als Vision-Fallback mit OCR-Tiefe.',
     'minicpm-v:8b',
     5000000000, 7, 'small',
     '["vision", "ocr", "multilingual"]'::jsonb,
     '["image-analysis", "ocr", "auto-vision-fallback"]'::jsonb,
     'vision', false, true, false,
     false, 2, 'vision', 'https://ollama.com/library/minicpm-v'),

    -- Smaller embedding alternative for RAM-constrained installs
    ('nomic-embed-text', 'Nomic Embed Text',
     'Kleines, schnelles Embedding-Modell als Alternative zu BGE-M3 für RAM-knappe Geräte. ~274 MB.',
     'nomic-embed-text',
     274000000, 1, 'small',
     '["embedding", "english", "multilingual"]'::jsonb,
     '["embeddings", "rag-low-memory"]'::jsonb,
     'embedding', false, false, false,
     false, 1, 'embed', 'https://ollama.com/library/nomic-embed-text')

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    ollama_name = EXCLUDED.ollama_name,
    size_bytes = EXCLUDED.size_bytes,
    ram_required_gb = EXCLUDED.ram_required_gb,
    category = EXCLUDED.category,
    capabilities = EXCLUDED.capabilities,
    recommended_for = EXCLUDED.recommended_for,
    model_type = EXCLUDED.model_type,
    supports_thinking = EXCLUDED.supports_thinking,
    supports_vision_input = EXCLUDED.supports_vision_input,
    rag_optimized = EXCLUDED.rag_optimized,
    performance_tier = EXCLUDED.performance_tier,
    speed_tier = EXCLUDED.speed_tier,
    ollama_library_url = EXCLUDED.ollama_library_url,
    updated_at = NOW();
