-- 098_nested_spaces_context_files.sql — Plan ide-workspace-shell:
-- Second-Brain-Ordnerbaum + Kontextdateien.
--
-- (1) knowledge_spaces.parent_id: Wissensräume werden verschachtelbar und
--     bilden den Ordnerbaum des Workspace-Explorers. ON DELETE SET NULL als
--     DB-seitiges Sicherheitsnetz; die API verweigert das Löschen nicht-leerer
--     Ordner (Kinder oder Dokumente vorhanden).
-- (2) documents.is_context_file: markiert die Kontextdatei eines Ordners
--     (à la CLAUDE.md). Kontextdateien werden vom Document-Indexer
--     übersprungen (kein RAG-Zitat) und stattdessen bei ordner-gescopten
--     Chats als eigene Prompt-Ebene injiziert.
--
-- Rollback (down):
--   ALTER TABLE documents DROP COLUMN IF EXISTS is_context_file;
--   ALTER TABLE knowledge_spaces DROP COLUMN IF EXISTS parent_id;
--   (rein additiv-nullable, kein Datenverlust; ungenutzte Spalten sind inert)

ALTER TABLE knowledge_spaces
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES knowledge_spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_parent_id
    ON knowledge_spaces(parent_id)
    WHERE parent_id IS NOT NULL;

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS is_context_file BOOLEAN NOT NULL DEFAULT FALSE;

-- Eigener Status für Kontextdateien: der Document-Indexer pollt nur
-- status='pending' und überspringt sie damit automatisch (kein Qdrant-Index,
-- kein RAG-Zitat). Additiv + idempotent, gleiches Muster wie 097 ('partial').
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'context';

-- Partieller Index: schneller Lookup "Kontextdatei dieses Space" beim
-- Prompt-Assembly (höchstens eine pro Space, enforced in der API).
CREATE INDEX IF NOT EXISTS idx_documents_context_file
    ON documents(space_id)
    WHERE is_context_file = TRUE AND deleted_at IS NULL;
