-- Migration 054: Schema Hardening
-- Adds missing FK constraints, indexes, and fixes identified in audit

-- 1. Add FK constraint for app_configurations.app_id
-- Only add if the constraint doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_app_configurations_app_id'
    ) THEN
        -- First clean up any orphaned rows
        DELETE FROM app_configurations ac
        WHERE NOT EXISTS (SELECT 1 FROM app_installations ai WHERE ai.app_id = ac.app_id);

        ALTER TABLE app_configurations
        ADD CONSTRAINT fk_app_configurations_app_id
        FOREIGN KEY (app_id) REFERENCES app_installations(app_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add FK constraint for app_dependencies.app_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_app_dependencies_app_id'
    ) THEN
        DELETE FROM app_dependencies ad
        WHERE NOT EXISTS (SELECT 1 FROM app_installations ai WHERE ai.app_id = ad.app_id);

        ALTER TABLE app_dependencies
        ADD CONSTRAINT fk_app_dependencies_app_id
        FOREIGN KEY (app_id) REFERENCES app_installations(app_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add missing index on kg_entity_documents(entity_id) for reverse lookups
CREATE INDEX IF NOT EXISTS idx_kg_entity_documents_entity_id
ON kg_entity_documents(entity_id);

-- 4. Add missing index on llm_jobs for status+created_at queries
CREATE INDEX IF NOT EXISTS idx_llm_jobs_status_created
ON llm_jobs(status, created_at DESC);
