-- ============================================================================
-- Claude Workspaces Schema
-- Version: 1.0.0
--
-- This schema provides dynamic workspace management for Claude Code:
-- - Create unlimited workspaces
-- - Track workspace metadata and usage
-- - Support custom host paths
-- ============================================================================

-- Claude workspaces table
CREATE TABLE IF NOT EXISTS claude_workspaces (
    id SERIAL PRIMARY KEY,

    -- Workspace identification
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,

    -- Path configuration
    host_path VARCHAR(500) NOT NULL,           -- Path on the host filesystem
    container_path VARCHAR(500) NOT NULL,      -- Path inside the container

    -- Flags
    is_default BOOLEAN DEFAULT FALSE,          -- Default workspace for new sessions
    is_system BOOLEAN DEFAULT FALSE,           -- System workspace (cannot be deleted)
    is_active BOOLEAN DEFAULT TRUE,            -- Soft delete flag

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique partial index for default workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_claude_workspaces_default
    ON claude_workspaces (is_default)
    WHERE is_default = TRUE;

-- Index for active workspaces
CREATE INDEX IF NOT EXISTS idx_claude_workspaces_active
    ON claude_workspaces (is_active, name);

-- Index for slug lookup
CREATE INDEX IF NOT EXISTS idx_claude_workspaces_slug
    ON claude_workspaces (slug);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_claude_workspaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_claude_workspaces_updated_at ON claude_workspaces;
CREATE TRIGGER trigger_claude_workspaces_updated_at
    BEFORE UPDATE ON claude_workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_claude_workspaces_updated_at();

-- Insert default workspaces
INSERT INTO claude_workspaces (name, slug, description, host_path, container_path, is_default, is_system)
VALUES
    (
        'Arasul Projekt',
        'arasul',
        'Das Hauptprojekt dieser Plattform. Ideal zum Entwickeln und Anpassen der Arasul-Plattform.',
        '/home/arasul/arasul/arasul-jet',
        '/workspace/arasul',
        TRUE,
        TRUE
    ),
    (
        'Eigener Workspace',
        'custom',
        'Dein persoenliches Verzeichnis fuer eigene Projekte.',
        '/home/arasul/workspace',
        '/workspace/custom',
        FALSE,
        FALSE
    )
ON CONFLICT (slug) DO NOTHING;

-- Function to set a workspace as default (and unset others)
CREATE OR REPLACE FUNCTION set_default_workspace(workspace_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    -- Unset all other defaults
    UPDATE claude_workspaces SET is_default = FALSE WHERE is_default = TRUE;

    -- Set the new default
    UPDATE claude_workspaces SET is_default = TRUE WHERE id = workspace_id AND is_active = TRUE;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_workspace_usage(workspace_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE claude_workspaces
    SET usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = workspace_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE claude_workspaces IS 'Dynamic workspace management for Claude Code';
COMMENT ON COLUMN claude_workspaces.host_path IS 'Absolute path on the host filesystem';
COMMENT ON COLUMN claude_workspaces.container_path IS 'Mount path inside the Claude Code container';
COMMENT ON COLUMN claude_workspaces.is_system IS 'System workspaces cannot be deleted';
