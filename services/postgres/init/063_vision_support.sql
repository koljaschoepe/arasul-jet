-- Migration 063: Vision support for multimodal models (Gemma 4, etc.)
-- Adds supports_vision_input flag to catalog and images column to jobs

BEGIN;

-- 1. Add vision capability flag to model catalog
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS supports_vision_input BOOLEAN DEFAULT false;

COMMENT ON COLUMN llm_model_catalog.supports_vision_input IS
    'Whether the model accepts image input for visual understanding (e.g. Gemma 4, LLaVA)';

-- 2. Set vision flag for all models with model_type = vision
UPDATE llm_model_catalog
SET supports_vision_input = true
WHERE model_type = 'vision';

-- 3. Add images column to llm_jobs for storing base64-encoded images
ALTER TABLE llm_jobs
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT NULL;

COMMENT ON COLUMN llm_jobs.images IS
    'Array of base64-encoded images attached to this chat job for vision models';

-- 4. Index for vision model lookups
CREATE INDEX IF NOT EXISTS idx_llm_catalog_vision
ON llm_model_catalog(supports_vision_input)
WHERE supports_vision_input = true;

COMMIT;
