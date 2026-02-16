-- 036_rag_performance.sql
-- Performance indexes for RAG system with 1000+ documents

-- GIN index for German full-text search on document_chunks
-- Dramatically speeds up keyword search in RAG hybrid queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_text_search_de
ON document_chunks
USING GIN (to_tsvector('german', chunk_text));

-- Composite index on documents for space-filtered queries
-- Used by keyword search and document listing with space filter
CREATE INDEX IF NOT EXISTS idx_documents_space_status
ON documents (space_id, status)
WHERE deleted_at IS NULL;
