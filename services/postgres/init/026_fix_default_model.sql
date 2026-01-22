-- Migration: Fix default model for existing installations
-- Sets the most recently downloaded model as default if no default exists

DO $$
BEGIN
    -- Only set default if no default currently exists and there are installed models
    IF NOT EXISTS (
        SELECT 1 FROM llm_installed_models WHERE is_default = true
    ) AND EXISTS (
        SELECT 1 FROM llm_installed_models WHERE status = 'available'
    ) THEN
        -- Set the most recently downloaded available model as default
        UPDATE llm_installed_models
        SET is_default = true
        WHERE id = (
            SELECT id FROM llm_installed_models
            WHERE status = 'available'
            ORDER BY downloaded_at DESC NULLS LAST
            LIMIT 1
        );

        RAISE NOTICE 'Auto-set default model to most recently downloaded model';
    END IF;
END $$;
