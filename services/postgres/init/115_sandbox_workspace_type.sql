-- Plan 012 Phase E · Schritt 13: Sandbox-Typ "Erweiterungs-Werkstatt".
--
-- Additiv: eine neue Spalte auf sandbox_projects, die den Zweck einer Sandbox
-- kennzeichnet. 'standard' = normale Terminal-Sandbox (bisheriges Verhalten);
-- 'erweiterungs-werkstatt' = eine Sandbox, die beim Anlegen mit Referenz-/
-- Template-Wissen (ANLEITUNG.md, Beispiel-App/-Flow/-Tool) bestückt wird,
-- damit externe Agenten sofort wissen, wie man eine Arasul-Erweiterung baut.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS + CHECK erst nach Existenzprüfung), damit
-- ein wiederholter Init-Lauf nicht bricht.

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(50) NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sandbox_projects_workspace_type_check'
  ) THEN
    ALTER TABLE sandbox_projects
      ADD CONSTRAINT sandbox_projects_workspace_type_check
      CHECK (workspace_type IN ('standard', 'erweiterungs-werkstatt'));
  END IF;
END$$;

COMMENT ON COLUMN sandbox_projects.workspace_type IS
  'Zweck der Sandbox: standard | erweiterungs-werkstatt (Plan 012 Phase E).';
