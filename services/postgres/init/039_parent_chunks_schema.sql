-- Migration 039: Parent-Document Retriever Schema
-- Supports hierarchical chunking: parent chunks (2000 tokens) for LLM context,
-- child chunks (400 tokens) for precise vector retrieval

-- Parent chunks table - stores larger context windows
CREATE TABLE IF NOT EXISTS document_parent_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    char_start INTEGER,
    char_end INTEGER,
    word_count INTEGER,
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, parent_index)
);

-- Add parent_chunk_id reference to child chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS parent_chunk_id UUID REFERENCES document_parent_chunks(id);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS child_index INTEGER;

-- Indices for efficient lookup
CREATE INDEX IF NOT EXISTS idx_document_chunks_parent ON document_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_parent_chunks_document ON document_parent_chunks(document_id);
