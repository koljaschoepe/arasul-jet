-- ============================================================================
-- Convert System Apps to Official Apps
-- Version: 1.0.0
--
-- This migration:
-- - Converts n8n and minio from 'system' to 'official' app type
-- - Adds dependency tracking so that apps cannot be stopped if other apps depend on them
-- ============================================================================

-- Convert n8n and minio from 'system' to 'official'
-- This allows them to be stopped, started, and uninstalled like normal apps
UPDATE app_installations
SET app_type = 'official'
WHERE app_id IN ('n8n', 'minio');

-- Add dependencies for n8n
-- n8n depends on postgres-db (required) and minio (required for document storage)
INSERT INTO app_dependencies (app_id, depends_on, dependency_type) VALUES
    ('n8n', 'postgres-db', 'required'),
    ('n8n', 'minio', 'required')
ON CONFLICT (app_id, depends_on) DO NOTHING;

-- Log the migration event
INSERT INTO app_events (app_id, event_type, event_message, event_details)
VALUES
    ('n8n', 'config_update', 'App-Typ von system zu official geaendert', '{"migration": "012_convert_system_apps", "old_type": "system", "new_type": "official"}'::jsonb),
    ('minio', 'config_update', 'App-Typ von system zu official geaendert', '{"migration": "012_convert_system_apps", "old_type": "system", "new_type": "official"}'::jsonb);

-- Create function to check dependencies before stop/uninstall
CREATE OR REPLACE FUNCTION check_app_dependencies(p_app_id VARCHAR(100))
RETURNS TABLE (
    dependent_app_id VARCHAR(100),
    dependent_app_status app_status
) AS $$
BEGIN
    -- Return all running apps that depend on this app
    RETURN QUERY
    SELECT
        ai.app_id,
        ai.status
    FROM app_installations ai
    JOIN app_dependencies ad ON ai.app_id = ad.app_id
    WHERE ad.depends_on = p_app_id
      AND ai.status = 'running';
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION check_app_dependencies IS 'Returns running apps that depend on the given app_id. Used to prevent stopping apps that other running apps depend on.';
