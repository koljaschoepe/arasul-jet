-- 118_projects.sql — Workspace-Neuausrichtung Batch 2:
-- Eine echte PROJEKT-Ebene ÜBER den Ordnern (knowledge_spaces).
--
-- Bisher waren die Top-Level-Wissensräume selbst die „Workspaces" (der
-- WorkspaceSwitcher listete `parent_id IS NULL`-Ordner). Der Nutzer will aber
-- echte Projekte, zwischen denen er wechselt und die Suche/Agenten/sichtbare
-- Ordner auf genau dieses Projekt scopen — ein Projekt enthält MEHRERE Ordner
-- (Bsp.: Projekt „Marketing" → Ordner „Sales", „Kundenservice").
--
-- Hierarchie danach:  projects → knowledge_spaces (project_id) → documents (space_id)
--
-- Datenabbildung (nicht-destruktiv): ALLE bisherigen sichtbaren Ordner wandern
-- ins neue Standard-Projekt. Nichts geht verloren; der Nutzer legt weitere
-- Projekte an und ordnet Ordner um. Die unsichtbaren Workspace-Räume
-- (`is_workspace = TRUE`, per-Sandbox-RAG) bleiben bewusst OHNE Projekt.
--
-- Rein additiv, idempotent, forward-only. Rollback (down):
--   ALTER TABLE system_settings DROP COLUMN IF EXISTS active_project_id;
--   ALTER TABLE knowledge_spaces DROP COLUMN IF EXISTS project_id;
--   DROP TABLE IF EXISTS projects;

-- ============================================================================
-- (1) projects — die neue oberste Ebene
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  icon        VARCHAR(50) DEFAULT 'layers',
  color       VARCHAR(7)  DEFAULT '#6366f1',
  -- Genau ein Standard-Projekt (partieller Unique-Index, wie bei knowledge_spaces).
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_single_default
  ON projects (is_default) WHERE is_default = TRUE;

-- Standard-Projekt: Heimat aller bisherigen Ordner. is_default = nicht löschbar.
INSERT INTO projects (name, slug, description, icon, is_default, sort_order)
VALUES (
  'Standard',
  'standard',
  'Standard-Projekt — enthält alle bisherigen Ordner. Lege weitere Projekte an, um Wissensräume voneinander zu trennen.',
  'layers',
  TRUE,
  0
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- (2) knowledge_spaces.project_id — jeder Ordner gehört zu einem Projekt
-- ============================================================================
-- ON DELETE RESTRICT: das Löschen eines Projekts darf keine Ordner (und über
-- documents.space_id → Qdrant) still mitreißen. Die Route räumt Ordner erst auf
-- (leer erzwingen), der FK ist nur der DB-Backstop.
ALTER TABLE knowledge_spaces
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE RESTRICT;

-- Backfill: alle sichtbaren Ordner ins Standard-Projekt. Die unsichtbaren
-- Workspace-Räume (is_workspace = TRUE) bleiben project_id NULL.
UPDATE knowledge_spaces
   SET project_id = (SELECT id FROM projects WHERE is_default = TRUE)
 WHERE project_id IS NULL
   AND is_workspace = FALSE;

CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_project_id
  ON knowledge_spaces (project_id);

-- ============================================================================
-- (3) system_settings.active_project_id — das aktive Projekt (Singleton)
-- ============================================================================
-- Einzel-Admin → app-weite Singleton-Einstellung (id = 1). ON DELETE SET NULL,
-- damit das Löschen eines Projekts die Einstellung leert statt zu blockieren;
-- die Route setzt danach wieder auf das Standard-Projekt.
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS active_project_id UUID
    REFERENCES projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN system_settings.active_project_id IS
  'Batch 2: das aktive Projekt; scopt Explorer + Suche/Agenten. NULL = Standard.';

UPDATE system_settings
   SET active_project_id = (SELECT id FROM projects WHERE is_default = TRUE)
 WHERE id = 1
   AND active_project_id IS NULL;

COMMENT ON TABLE projects IS
  'Batch 2: oberste Ebene über den Ordnern (knowledge_spaces.project_id). Ein Projekt bündelt mehrere Ordner und scopt Suche/Agenten.';
COMMENT ON COLUMN knowledge_spaces.project_id IS
  'Batch 2: Projekt, zu dem dieser Ordner gehört. NULL nur bei unsichtbaren Workspace-Räumen (is_workspace = TRUE).';
