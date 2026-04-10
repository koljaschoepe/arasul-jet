-- Migration 064: Mark Gemma 4 as platform-recommended default models
-- This migration adds is_platform_default to identify which models the platform
-- recommends by default for new installations. It does NOT change existing
-- user-set defaults (is_default on llm_installed_models is untouched).

BEGIN;

-- 1. Add platform default flag to catalog
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS is_platform_default BOOLEAN DEFAULT false;

COMMENT ON COLUMN llm_model_catalog.is_platform_default IS
    'Whether this model is a platform-recommended default for new installations (Gemma 4 family)';

-- 2. Mark Gemma 4 models as platform defaults
UPDATE llm_model_catalog
SET is_platform_default = true
WHERE id LIKE 'gemma4:%';

-- 3. Create index for quick lookup of platform defaults
CREATE INDEX IF NOT EXISTS idx_llm_catalog_platform_default
ON llm_model_catalog (is_platform_default)
WHERE is_platform_default = true;

COMMIT;
