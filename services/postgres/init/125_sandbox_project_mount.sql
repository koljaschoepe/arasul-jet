-- 125_sandbox_project_mount.sql — Sandbox ↔ Projektablage
--
-- Eine Sandbox kann an ein Projekt angeschlossen werden: dessen Ablage-Ordner
-- (data/projects/<uuid>) wird beim Container-Start rw als /workspace/projekt
-- gemountet. Was Claude Code dort baut, liegt sofort in der Projektablage und
-- damit im Explorer. ON DELETE SET NULL: ein gelöschtes Projekt kappt nur die
-- Verbindung, die Sandbox bleibt.

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_project_id ON sandbox_projects(project_id);
