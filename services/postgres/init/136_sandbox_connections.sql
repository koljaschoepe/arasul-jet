-- 136_sandbox_connections.sql — Plan 017 Schritt 5: Projekt-Verbindungen + MCP.
--
-- Pro Sandbox-Projekt hinterlegte externe Zugänge (Env-Variablen wie Supabase-
-- Keys) und MCP-Server. Der Geheimwert liegt AES-256-GCM-verschlüsselt als
-- BYTEA (utils/tokenCrypto, wie user_external_credentials / project_git). Beim
-- Container-/Sitzungs-Start injiziert das Backend die Werte als Env (per Name,
-- nie als Kommandozeilen-Literal) plus generierte .mcp.json/Codex-Konfig — so
-- kann der Coding-Agent extern gehostete Systeme mitverwalten, ohne Klartext
-- im Workspace.

CREATE TABLE IF NOT EXISTS sandbox_project_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES sandbox_projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,                       -- Anzeigename / bei env der Variablenname
  kind           TEXT NOT NULL DEFAULT 'env'
                   CHECK (kind IN ('env', 'mcp')),
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- bei mcp: {command, args, envKeys}; bei env: {}
  secret_encrypted BYTEA,                             -- verschlüsselter Wert (env-Wert bzw. mcp-Token); NULL erlaubt
  created_by     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ein Name ist pro Projekt eindeutig (der env-Name bzw. MCP-Server-Name).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_connections_project_name
  ON sandbox_project_connections (project_id, name);
CREATE INDEX IF NOT EXISTS idx_sandbox_connections_project
  ON sandbox_project_connections (project_id);

COMMENT ON TABLE sandbox_project_connections IS
  'Projekt-Verbindungen (Plan 017 Schritt 5): verschlüsselte externe Zugänge (env) + MCP-Server je Sandbox-Projekt; injiziert beim Container-/Sitzungs-Start.';
COMMENT ON COLUMN sandbox_project_connections.secret_encrypted IS
  'AES-256-GCM (utils/tokenCrypto): env-Wert bzw. MCP-Token. Wird NIE über die API zurückgegeben.';
