-- ============================================================================
-- Fix LLM Model Catalog: Correct Ollama registry names and sizes
--
-- PROBLEM: ollama_name mappings pointed to wrong quantization variants:
--   - qwen3:14b-q8 → mapped to qwen3:14b (Q4, 9.3GB) instead of Q8 (15GB)
--   - qwen3:7b-q8  → mapped to qwen3:8b  (Q4, 5.2GB) instead of Q8 (~8GB)
--
-- Ollama registry uses underscore format: q8_0 (not q8)
-- ============================================================================

-- Fix qwen3:14b-q8 → correct Ollama registry tag is qwen3:14b-q8_0
UPDATE llm_model_catalog
SET ollama_name = 'qwen3:14b-q8_0',
    size_bytes = 15000000000,
    updated_at = NOW()
WHERE id = 'qwen3:14b-q8';

-- Fix qwen3:7b-q8 → correct Ollama registry tag is qwen3:8b-q8_0
UPDATE llm_model_catalog
SET ollama_name = 'qwen3:8b-q8_0',
    size_bytes = 8000000000,
    updated_at = NOW()
WHERE id = 'qwen3:7b-q8';

-- Fix mistral:7b-q8 → Q8 not available in registry, pull default (Q4)
-- Keep ollama_name as mistral:7b but fix size to match actual download
UPDATE llm_model_catalog
SET ollama_name = 'mistral:7b',
    size_bytes = 4100000000,
    updated_at = NOW()
WHERE id = 'mistral:7b-q8';

-- Fix gemma2:9b-q8 → Q8 not available in registry, pull default (Q4)
-- Keep ollama_name as gemma2:9b but fix size to match actual download
UPDATE llm_model_catalog
SET ollama_name = 'gemma2:9b',
    size_bytes = 5400000000,
    updated_at = NOW()
WHERE id = 'gemma2:9b-q8';

-- Fix llama3.1:8b size to match actual download
UPDATE llm_model_catalog
SET size_bytes = 4900000000,
    updated_at = NOW()
WHERE id = 'llama3.1:8b';

-- Fix qwen3:32b-q4 size to match actual download
UPDATE llm_model_catalog
SET ollama_name = 'qwen3:32b',
    size_bytes = 20000000000,
    updated_at = NOW()
WHERE id = 'qwen3:32b-q4';

-- Fix llama3.1:70b-q4 ollama_name
UPDATE llm_model_catalog
SET ollama_name = 'llama3.1:70b',
    size_bytes = 40000000000,
    updated_at = NOW()
WHERE id = 'llama3.1:70b-q4';
