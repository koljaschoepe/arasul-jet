-- ============================================================================
-- Sandbox Projects & Terminal Sessions Schema
-- Version: 1.0.0
--
-- Provides persistent sandbox environments for development:
-- - Project management with per-project Docker containers
-- - Terminal session tracking for interactive shell access
-- - Container lifecycle state (running, stopped, committed)
-- - Resource limits and environment configuration per project
-- ============================================================================

-- Project status enum
DO $$ BEGIN
    CREATE TYPE sandbox_project_status AS ENUM (
        'active',         -- Normal active project
        'archived'        -- Soft-archived, container removed
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Container status enum
DO $$ BEGIN
    CREATE TYPE sandbox_container_status AS ENUM (
        'none',           -- No container created yet
        'creating',       -- Container being created
        'running',        -- Container running
        'stopped',        -- Container stopped but preserved
        'committing',     -- Container state being saved as image
        'error'           -- Container in error state
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Terminal session status enum
DO $$ BEGIN
    CREATE TYPE sandbox_session_status AS ENUM (
        'active',         -- Session currently active
        'closed',         -- Session ended normally
        'error'           -- Session ended with error
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Terminal session type enum
DO $$ BEGIN
    CREATE TYPE sandbox_session_type AS ENUM (
        'shell',          -- Standard bash shell
        'claude-code',    -- Claude Code CLI
        'codex',          -- OpenAI Codex CLI
        'custom'          -- Custom command
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Main projects table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sandbox_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Project identification
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    icon VARCHAR(50) DEFAULT 'terminal',
    color VARCHAR(7) DEFAULT '#45ADFF',

    -- Container configuration
    base_image VARCHAR(255) NOT NULL DEFAULT 'arasul-sandbox:latest',
    status sandbox_project_status DEFAULT 'active',
    container_id VARCHAR(64),
    container_name VARCHAR(100),
    container_status sandbox_container_status DEFAULT 'none',
    committed_image VARCHAR(255),       -- Image name after commit (arasul-sandbox-{slug}:latest)

    -- Path configuration
    host_path TEXT NOT NULL,            -- /data/sandbox/projects/{slug}
    container_path TEXT NOT NULL DEFAULT '/workspace',

    -- Resource limits
    resource_limits JSONB DEFAULT '{"memory": "2G", "cpus": "2", "pids": 256}'::jsonb,

    -- Custom environment variables
    environment JSONB DEFAULT '{}'::jsonb,

    -- Tracking
    installed_packages TEXT[] DEFAULT '{}',
    last_accessed_at TIMESTAMPTZ,
    total_terminal_seconds INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Terminal sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sandbox_terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relations
    project_id UUID NOT NULL REFERENCES sandbox_projects(id) ON DELETE CASCADE,

    -- Session details
    session_type sandbox_session_type DEFAULT 'shell',
    command TEXT DEFAULT '/bin/bash',
    status sandbox_session_status DEFAULT 'active',

    -- Docker exec reference
    container_exec_id VARCHAR(64),

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Projects
CREATE INDEX IF NOT EXISTS idx_sandbox_projects_status
    ON sandbox_projects (status);

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_slug
    ON sandbox_projects (slug);

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_container_status
    ON sandbox_projects (container_status)
    WHERE container_status IN ('running', 'creating');

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_last_accessed
    ON sandbox_projects (last_accessed_at DESC NULLS LAST)
    WHERE status = 'active';

-- Terminal sessions
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_project
    ON sandbox_terminal_sessions (project_id);

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_active
    ON sandbox_terminal_sessions (project_id, status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_started
    ON sandbox_terminal_sessions (started_at DESC);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_sandbox_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sandbox_projects_updated_at ON sandbox_projects;
CREATE TRIGGER trigger_sandbox_projects_updated_at
    BEFORE UPDATE ON sandbox_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_sandbox_projects_updated_at();

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Generate unique slug from project name
CREATE OR REPLACE FUNCTION generate_sandbox_slug(project_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Normalize: lowercase, replace spaces/special chars with hyphens
    base_slug := lower(trim(project_name));
    base_slug := regexp_replace(base_slug, '[äÄ]', 'ae', 'g');
    base_slug := regexp_replace(base_slug, '[öÖ]', 'oe', 'g');
    base_slug := regexp_replace(base_slug, '[üÜ]', 'ue', 'g');
    base_slug := regexp_replace(base_slug, 'ß', 'ss', 'g');
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-|-$', '', 'g');
    base_slug := left(base_slug, 80);

    IF base_slug = '' THEN
        base_slug := 'projekt';
    END IF;

    final_slug := base_slug;

    -- Append counter if slug already exists
    WHILE EXISTS (SELECT 1 FROM sandbox_projects WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Get project statistics
CREATE OR REPLACE FUNCTION get_sandbox_statistics()
RETURNS TABLE(
    total_projects BIGINT,
    active_projects BIGINT,
    running_containers BIGINT,
    stopped_containers BIGINT,
    active_sessions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM sandbox_projects)::BIGINT,
        (SELECT COUNT(*) FROM sandbox_projects WHERE status = 'active')::BIGINT,
        (SELECT COUNT(*) FROM sandbox_projects WHERE container_status = 'running')::BIGINT,
        (SELECT COUNT(*) FROM sandbox_projects WHERE container_status = 'stopped')::BIGINT,
        (SELECT COUNT(*) FROM sandbox_terminal_sessions WHERE status = 'active')::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Cleanup stale terminal sessions (sessions without active containers)
CREATE OR REPLACE FUNCTION cleanup_stale_sandbox_sessions()
RETURNS INTEGER AS $$
DECLARE
    cleaned INTEGER;
BEGIN
    UPDATE sandbox_terminal_sessions s
    SET status = 'closed', ended_at = NOW()
    WHERE s.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM sandbox_projects p
          WHERE p.id = s.project_id
            AND p.container_status = 'running'
      );
    GET DIAGNOSTICS cleaned = ROW_COUNT;
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql;

-- Update terminal time tracking on session close
CREATE OR REPLACE FUNCTION update_sandbox_terminal_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('closed', 'error') AND OLD.status = 'active' AND NEW.ended_at IS NOT NULL THEN
        UPDATE sandbox_projects
        SET total_terminal_seconds = total_terminal_seconds +
            EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER
        WHERE id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sandbox_terminal_time ON sandbox_terminal_sessions;
CREATE TRIGGER trigger_sandbox_terminal_time
    AFTER UPDATE ON sandbox_terminal_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_sandbox_terminal_time();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE sandbox_projects IS 'Persistent sandbox development environments with Docker containers';
COMMENT ON TABLE sandbox_terminal_sessions IS 'Active and historical terminal sessions within sandbox projects';
COMMENT ON COLUMN sandbox_projects.host_path IS 'Absolute path on host where project files are stored';
COMMENT ON COLUMN sandbox_projects.container_path IS 'Mount path inside the sandbox container';
COMMENT ON COLUMN sandbox_projects.committed_image IS 'Docker image name after container commit (preserves installed packages)';
COMMENT ON COLUMN sandbox_projects.resource_limits IS 'JSON with memory, cpus, pids limits for the container';
COMMENT ON COLUMN sandbox_projects.environment IS 'Custom environment variables passed to the container';
COMMENT ON COLUMN sandbox_projects.installed_packages IS 'Tracking array of user-installed packages';
COMMENT ON COLUMN sandbox_terminal_sessions.container_exec_id IS 'Docker exec ID for this terminal session';
COMMENT ON FUNCTION generate_sandbox_slug IS 'Generates unique URL-safe slug from project name with German umlaut handling';
COMMENT ON FUNCTION get_sandbox_statistics IS 'Returns aggregate statistics for the sandbox system';
COMMENT ON FUNCTION cleanup_stale_sandbox_sessions IS 'Closes terminal sessions where the container is no longer running';
