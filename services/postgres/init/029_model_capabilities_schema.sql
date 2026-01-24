-- Migration 029: Model Capabilities Schema
-- Adds supports_thinking and rag_optimized flags to model catalog
-- Part of Phase 2 KI System Optimization

-- Add supports_thinking column to track which models support <think> tags
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS supports_thinking BOOLEAN DEFAULT false;

-- Add rag_optimized column for better RAG mode recommendations
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS rag_optimized BOOLEAN DEFAULT false;

-- Update known models with thinking support (Qwen3 models support extended thinking)
UPDATE llm_model_catalog SET supports_thinking = true
WHERE id IN ('qwen3:7b-q8', 'qwen3:14b-q8', 'qwen3:32b-q4');

-- Update known models optimized for RAG
-- Qwen3 models are excellent for RAG due to their context handling
-- Larger models generally perform better with retrieval-augmented generation
UPDATE llm_model_catalog SET rag_optimized = true
WHERE id IN ('qwen3:7b-q8', 'qwen3:14b-q8', 'qwen3:32b-q4', 'llama3.1:70b-q4');

-- Add comment explaining the columns
COMMENT ON COLUMN llm_model_catalog.supports_thinking IS
    'Whether the model supports extended thinking with <think>...</think> tags';
COMMENT ON COLUMN llm_model_catalog.rag_optimized IS
    'Whether the model is optimized for Retrieval-Augmented Generation queries';

-- Create index for quick capability lookups
CREATE INDEX IF NOT EXISTS idx_llm_catalog_capabilities
ON llm_model_catalog(supports_thinking, rag_optimized);
