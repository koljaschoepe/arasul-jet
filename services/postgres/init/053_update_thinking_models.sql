-- Migration 053: Update thinking model catalog
-- Ollama 0.9.0+ supports native `think` parameter for many models.
-- Update supports_thinking for all known thinking-capable models.

BEGIN;

-- Enable thinking for DeepSeek-R1 variants
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'deepseek-r1%'
   OR id LIKE 'deepseek-r1%';

-- Enable thinking for QwQ
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'qwq%'
   OR id LIKE 'qwq%';

-- Enable thinking for DeepSeek-v3.1
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'deepseek-v3.1%'
   OR id LIKE 'deepseek-v3.1%';

-- Enable thinking for Qwen3.5
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'qwen3.5%'
   OR id LIKE 'qwen3.5%';

-- Enable thinking for Magistral
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'magistral%'
   OR id LIKE 'magistral%';

-- Enable thinking for Nemotron
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'nemotron%'
   OR id LIKE 'nemotron%';

-- Enable thinking for GLM-4.7
UPDATE llm_model_catalog SET supports_thinking = true
WHERE ollama_name LIKE 'glm-4.7%'
   OR id LIKE 'glm-4.7%';

COMMIT;
