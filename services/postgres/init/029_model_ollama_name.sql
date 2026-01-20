-- ============================================================================
-- Migration: Add ollama_name field to llm_model_catalog
-- Version: 029
--
-- Purpose: Separate catalog IDs from Ollama registry names
-- This allows user-friendly IDs while using correct Ollama names for API calls
-- ============================================================================

-- Add ollama_name column for exact Ollama registry names
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS ollama_name VARCHAR(100);

-- Set default values (use id as fallback for backwards compatibility)
UPDATE llm_model_catalog
SET ollama_name = id
WHERE ollama_name IS NULL;

-- Update with correct Ollama registry names
-- These mappings ensure downloads use the exact names Ollama expects

-- Qwen models: q8/q4 quantization suffix is not part of Ollama name
UPDATE llm_model_catalog SET ollama_name = 'qwen3:7b' WHERE id = 'qwen3:7b-q8';
UPDATE llm_model_catalog SET ollama_name = 'qwen3:14b' WHERE id = 'qwen3:14b-q8';
UPDATE llm_model_catalog SET ollama_name = 'qwen3:32b' WHERE id = 'qwen3:32b-q4';

-- Mistral: q8 suffix is not part of Ollama name
UPDATE llm_model_catalog SET ollama_name = 'mistral:7b' WHERE id = 'mistral:7b-q8';

-- Gemma: q8 suffix is not part of Ollama name
UPDATE llm_model_catalog SET ollama_name = 'gemma2:9b' WHERE id = 'gemma2:9b-q8';

-- Llama: q4 suffix is not part of Ollama name for 70b
UPDATE llm_model_catalog SET ollama_name = 'llama3.1:70b' WHERE id = 'llama3.1:70b-q4';

-- These are already correct (no change needed):
-- llama3.1:8b -> llama3.1:8b
-- deepseek-coder:6.7b -> deepseek-coder:6.7b

-- Create index for efficient lookup by ollama_name
CREATE INDEX IF NOT EXISTS idx_llm_model_catalog_ollama_name
ON llm_model_catalog(ollama_name);

-- Add comment for documentation
COMMENT ON COLUMN llm_model_catalog.ollama_name IS
'Exact Ollama registry name for API calls. Falls back to id if NULL. Example: qwen3:14b (not qwen3:14b-q8)';
