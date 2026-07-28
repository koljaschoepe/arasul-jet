-- 122_documents_project_id.sql — Projekt-Isolation der Dateien.
--
-- Bug (live 2026-07-28): Dateien OHNE Ordner (`space_id IS NULL`) hingen an
-- keinem Projekt. Der Workspace-Explorer (`GET /spaces/tree`) reichte sie mit
-- einem `space_id == null`-Schlupfloch an jedem Projekt vorbei durch — deshalb
-- sah ein neues, leeres Projekt („Test") dieselben Root-Dateien wie „Standard".
-- Ordner waren korrekt getrennt (knowledge_spaces.project_id, Migration 118),
-- Dokumente nicht.
--
-- Fix: Dokumente bekommen eine echte Projekt-Spalte. Der Explorer filtert danach
-- (auch Root-Dateien), Uploads erben das aktive Projekt. Damit sind Projekte
-- wirklich unabhängig.
--
-- Datenabbildung (nicht-destruktiv):
--   * Dokument in einem Ordner  → project_id des Ordners.
--   * Dokument ohne Ordner (Root) → Standard-Projekt.
--   * Dokument in einem unsichtbaren Workspace-Raum (ks.project_id IS NULL)
--     bleibt project_id NULL — es gehört nicht in die Dokumenten-UI und wird
--     dort ohnehin (is_workspace) ausgeblendet.
--
-- Rein additiv, idempotent, forward-only. Rollback (down):
--   ALTER TABLE documents DROP COLUMN IF EXISTS project_id;

-- ============================================================================
-- (1) documents.project_id — jedes Dokument gehört zu einem Projekt
-- ============================================================================
-- ON DELETE RESTRICT (wie knowledge_spaces.project_id): das Löschen eines
-- Projekts darf keine Dokumente still mitreißen. Die Projekt-Löschroute erzwingt
-- ohnehin erst leere Ordner; der FK ist nur der DB-Backstop.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE RESTRICT;

-- Backfill (a): Dokumente in einem Ordner erben dessen Projekt.
UPDATE documents d
   SET project_id = ks.project_id
  FROM knowledge_spaces ks
 WHERE d.space_id = ks.id
   AND d.project_id IS NULL
   AND ks.project_id IS NOT NULL;

-- Backfill (b): Root-Dokumente (kein Ordner) wandern ins Standard-Projekt.
UPDATE documents
   SET project_id = (SELECT id FROM projects WHERE is_default = TRUE)
 WHERE project_id IS NULL
   AND space_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_project_id
  ON documents (project_id);

COMMENT ON COLUMN documents.project_id IS
  'Projekt, zu dem dieses Dokument gehört. Scopt den Workspace-Explorer. NULL nur bei Dokumenten unsichtbarer Workspace-Räume (is_workspace = TRUE).';
