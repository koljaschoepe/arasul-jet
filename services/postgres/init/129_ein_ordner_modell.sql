-- 129: Ein-Ordner-Modell — die Platte ist die Wahrheit
--
-- Wissensraum-Ordner und Projektablage verschmelzen zu EINEM Baum: der
-- Projektordner (data/projects/<uuid>) ist die einzige Wahrheit. Jede Datei
-- und jeder Ordner darin wird in der DB gespiegelt und automatisch indexiert
-- (services/projects/ordnerSyncService.js).
--
--   documents.rel_pfad        — Pfad der Datei relativ zum Projektordner.
--                               NULL = noch nicht materialisiert (Alt-Dokument,
--                               liegt nur in MinIO; der Boot-Abgleich holt es
--                               auf die Platte und setzt den Pfad).
--   knowledge_spaces.rel_pfad — Pfad des Ordners relativ zum Projektordner.
--                               NULL = Wurzel-Raum („Allgemein") oder
--                               Workspace-Raum ohne Platten-Spiegel.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS rel_pfad TEXT DEFAULT NULL;

COMMENT ON COLUMN documents.rel_pfad IS
  'Pfad der Datei relativ zum Projektordner (Ein-Ordner-Modell); NULL = noch nicht materialisiert';

-- Ein Pfad zeigt auf genau ein lebendes Dokument je Projekt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_rel_pfad
  ON documents (project_id, rel_pfad)
  WHERE rel_pfad IS NOT NULL AND deleted_at IS NULL AND status <> 'deleted';

ALTER TABLE knowledge_spaces ADD COLUMN IF NOT EXISTS rel_pfad TEXT DEFAULT NULL;

COMMENT ON COLUMN knowledge_spaces.rel_pfad IS
  'Pfad des Ordners relativ zum Projektordner (Ein-Ordner-Modell); NULL = Wurzel-/Workspace-Raum';

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_spaces_project_rel_pfad
  ON knowledge_spaces (project_id, rel_pfad)
  WHERE rel_pfad IS NOT NULL;
