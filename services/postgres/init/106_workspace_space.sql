-- 106_workspace_space.sql — Plan 008 Schritt 13:
-- Jeder Workspace (sandbox_projects) bekommt genau EINEN unsichtbaren
-- Wissensraum (knowledge_spaces), damit im Workspace geschriebene Dateien
-- OHNE manuellen Upload per RAG auffindbar werden und die RAG-Isolation
-- zwischen Workspaces greift.
--
-- Forward-only, idempotent. Keine Backfills: die App (sandboxService.createProject)
-- legt den verknüpften Space beim nächsten Anlegen eines Workspace an. Bestehende
-- Workspaces bleiben bis dahin ohne Space (space_id NULL) — der Agent scoped dann
-- bewusst NICHT (kein Fail-open auf ALLE Spaces, siehe runWorkspaceAgent.js).

-- (1) Verknüpfung Workspace -> Wissensraum. ON DELETE SET NULL, damit das
--     Löschen eines Space niemals einen Workspace mitreißt.
ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES knowledge_spaces(id) ON DELETE SET NULL;

-- (2) Markiert die per-Workspace-Spaces, damit die Dokumenten-UI sie ausblenden
--     kann. Bewusst NICHT is_default (das ist global unique über einen partiellen
--     Index) — is_workspace darf pro Workspace einmal TRUE sein.
ALTER TABLE knowledge_spaces
  ADD COLUMN IF NOT EXISTS is_workspace BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_space_id ON sandbox_projects(space_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_is_workspace ON knowledge_spaces(is_workspace)
  WHERE is_workspace = TRUE;

COMMENT ON COLUMN sandbox_projects.space_id IS
  'Plan 008 Schritt 13: der eine unsichtbare Wissensraum dieses Workspace (RAG-Scoping der Agenten).';
COMMENT ON COLUMN knowledge_spaces.is_workspace IS
  'Plan 008 Schritt 13: TRUE = automatischer, unsichtbarer Wissensraum eines Workspace (aus der Dokumenten-UI ausgeblendet).';
