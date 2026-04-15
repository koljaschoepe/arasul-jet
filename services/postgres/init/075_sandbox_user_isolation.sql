-- Migration 075: Add user_id to sandbox_projects for user isolation
-- Each sandbox project now belongs to a specific user.
-- Without this, all authenticated users see all projects.

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_user_id
  ON sandbox_projects(user_id);

-- Backfill: assign existing projects to the first admin user (if any)
UPDATE sandbox_projects
SET user_id = (SELECT id FROM admin_users ORDER BY id LIMIT 1)
WHERE user_id IS NULL;

-- Record migration
INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (75, '075_sandbox_user_isolation.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;
