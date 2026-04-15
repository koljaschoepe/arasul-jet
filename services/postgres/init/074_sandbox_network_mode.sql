-- Migration 074: Add network_mode to sandbox_projects
-- Allows per-project network configuration:
--   'isolated' = Standard Docker bridge (Internet only, no access to internal services) [DEFAULT]
--   'internal' = Backend network (access to LLM, Qdrant, DB) — requires explicit choice

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS network_mode VARCHAR(50) DEFAULT 'isolated';

COMMENT ON COLUMN sandbox_projects.network_mode IS 'Network mode: isolated (bridge, Internet only) or internal (backend network with access to LLM/DB)';

-- Record migration
INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (74, '074_sandbox_network_mode.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;
