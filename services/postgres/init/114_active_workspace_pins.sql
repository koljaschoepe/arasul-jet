-- 114_active_workspace_pins.sql — Plan 012 Phase A, Schritt 1:
-- Fundament für den EINEN aktiven Ordner-Kontext.
--
-- (1) system_settings.active_workspace_space_id: der aktuell aktive
--     Top-Level-Wissensraum. Einzel-Admin → app-weite Singleton-Einstellung
--     (kein Rechtekonzept). ON DELETE SET NULL, damit das Löschen des Ordners
--     die Einstellung leert statt zu blockieren. NULL = kein Ordner aktiv
--     (Alt-Verhalten: Auto-Routing über alle Räume bleibt erhalten).
--
-- (2) pinned_documents: an den Chat angeheftete Dokumente ODER Unterordner.
--     Ein Pin zielt auf GENAU EINES von beiden (CHECK). Pins sind immer im
--     Chat-Kontext, unabhängig vom Auto-Routing (Schritt 4).
--
-- Rein additiv, idempotent, keine Backfills. Bestehende Daten bleiben
-- unangetastet. Rollback (down):
--   DROP TABLE IF EXISTS pinned_documents;
--   ALTER TABLE system_settings DROP COLUMN IF EXISTS active_workspace_space_id;

-- (1) Aktiver Workspace als Teil der System-Singleton-Zeile (id = 1).
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS active_workspace_space_id UUID
    REFERENCES knowledge_spaces(id) ON DELETE SET NULL;

COMMENT ON COLUMN system_settings.active_workspace_space_id IS
  'Plan 012: der aktive Top-Level-Wissensraum; bindet Chat + Suche global. NULL = keiner aktiv.';

-- (2) An den Chat angeheftete Dokumente / Unterordner.
CREATE TABLE IF NOT EXISTS pinned_documents (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  space_id     UUID REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Genau eines von beiden Zielen ist gesetzt.
  CONSTRAINT pinned_documents_exactly_one_target CHECK (
    (document_id IS NOT NULL)::int + (space_id IS NOT NULL)::int = 1
  )
);

-- Ein Dokument / ein Unterordner kann pro Nutzer nur einmal angeheftet sein.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_documents_uniq_doc
  ON pinned_documents(user_id, document_id)
  WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_documents_uniq_space
  ON pinned_documents(user_id, space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pinned_documents_user
  ON pinned_documents(user_id);

COMMENT ON TABLE pinned_documents IS
  'Plan 012: an den Chat angeheftete Dokumente/Unterordner — immer im Kontext, unabhängig vom Auto-Routing.';
