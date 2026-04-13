-- Migration 069: Fix parent_chunk_id foreign key — add ON DELETE CASCADE
-- Without this, deleting parent chunks fails if child chunks reference them

ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS document_chunks_parent_chunk_id_fkey;

ALTER TABLE document_chunks ADD CONSTRAINT document_chunks_parent_chunk_id_fkey
  FOREIGN KEY (parent_chunk_id) REFERENCES document_parent_chunks(id) ON DELETE CASCADE;
