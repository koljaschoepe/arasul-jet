-- ============================================================================
-- Document Intelligence Schema for Arasul Platform
-- Version: 1.0.0
--
-- This schema provides comprehensive document management and RAG optimization:
-- - Document metadata storage with automatic extraction
-- - Category management with LLM-based auto-categorization
-- - Document summaries and key information
-- - Similarity tracking for duplicate detection
-- - Processing status and error tracking
-- ============================================================================

-- Document status enum
DO $$ BEGIN
    CREATE TYPE document_status AS ENUM (
        'pending',      -- Just uploaded, not yet processed
        'processing',   -- Currently being indexed
        'indexed',      -- Successfully indexed in Qdrant
        'failed',       -- Processing failed
        'deleted'       -- Soft deleted
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Document categories (predefined + custom)
CREATE TABLE IF NOT EXISTS document_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',  -- Hex color for UI
    icon VARCHAR(50) DEFAULT 'file',     -- Icon name for UI
    is_system BOOLEAN DEFAULT FALSE,     -- System categories cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default system categories
INSERT INTO document_categories (name, description, color, icon, is_system) VALUES
    ('Technisch', 'Technische Dokumentation, Anleitungen, API-Docs', '#3b82f6', 'code', TRUE),
    ('Legal', 'Rechtliche Dokumente, Verträge, AGB', '#ef4444', 'scale', TRUE),
    ('Finanzen', 'Finanzberichte, Rechnungen, Budgets', '#22c55e', 'banknote', TRUE),
    ('Marketing', 'Marketing-Materialien, Präsentationen', '#f59e0b', 'megaphone', TRUE),
    ('Personal', 'HR-Dokumente, Mitarbeiterunterlagen', '#8b5cf6', 'users', TRUE),
    ('Allgemein', 'Allgemeine Dokumente ohne spezifische Kategorie', '#6b7280', 'file', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Main documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic file information
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,           -- Path in MinIO bucket
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    file_extension VARCHAR(20),

    -- Content hashes for duplicate detection
    content_hash VARCHAR(64) NOT NULL,          -- SHA256 of file content
    file_hash VARCHAR(64) NOT NULL,             -- SHA256 of filename + size (for quick checks)

    -- Processing status
    status document_status DEFAULT 'pending',
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Extracted metadata
    title VARCHAR(500),                         -- Extracted or generated title
    author VARCHAR(255),                        -- Extracted author if available
    language VARCHAR(10) DEFAULT 'de',          -- Detected language (ISO 639-1)
    page_count INTEGER,                         -- For PDFs
    word_count INTEGER,                         -- Total words in document
    char_count INTEGER,                         -- Total characters

    -- RAG optimization
    chunk_count INTEGER DEFAULT 0,              -- Number of chunks in Qdrant
    embedding_model VARCHAR(100),               -- Model used for embeddings

    -- AI-generated content
    summary TEXT,                               -- LLM-generated summary (max 500 words)
    key_topics TEXT[],                          -- Extracted key topics/keywords
    category_id INTEGER REFERENCES document_categories(id),
    category_confidence DECIMAL(3,2),           -- Confidence score for auto-categorization (0-1)

    -- User metadata
    user_tags TEXT[],                           -- User-defined tags
    user_notes TEXT,                            -- User notes about document
    is_favorite BOOLEAN DEFAULT FALSE,

    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    indexed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Uploaded by (for future multi-user support)
    uploaded_by VARCHAR(100) DEFAULT 'admin'
);

-- Document chunks tracking (mirrors Qdrant for reference)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY,                        -- Same as Qdrant point ID
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    char_start INTEGER,                         -- Position in original document
    char_end INTEGER,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id, chunk_index)
);

-- Document similarity tracking
CREATE TABLE IF NOT EXISTS document_similarities (
    id SERIAL PRIMARY KEY,
    document_id_1 UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_id_2 UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5,4) NOT NULL,     -- Cosine similarity (0-1)
    similarity_type VARCHAR(50) DEFAULT 'semantic', -- 'semantic', 'content_hash', 'title'
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id_1, document_id_2),
    CHECK(document_id_1 < document_id_2),       -- Ensure consistent ordering
    CHECK(similarity_score >= 0 AND similarity_score <= 1)
);

-- Document processing queue
CREATE TABLE IF NOT EXISTS document_processing_queue (
    id SERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,             -- 'index', 'summarize', 'categorize', 'similarity'
    priority INTEGER DEFAULT 0,                 -- Higher = more urgent
    status VARCHAR(20) DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    UNIQUE(document_id, task_type, status)
);

-- Document access log (for analytics)
CREATE TABLE IF NOT EXISTS document_access_log (
    id SERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL,           -- 'view', 'download', 'rag_query', 'search'
    user_id VARCHAR(100),
    query_text TEXT,                            -- For RAG queries
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_similarities_doc1 ON document_similarities(document_id_1);
CREATE INDEX IF NOT EXISTS idx_document_similarities_doc2 ON document_similarities(document_id_2);
CREATE INDEX IF NOT EXISTS idx_document_similarities_score ON document_similarities(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_document_queue_status ON document_processing_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_document_access_log_document ON document_access_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_time ON document_access_log(accessed_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;
CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Trigger to update category updated_at timestamp
DROP TRIGGER IF EXISTS trigger_categories_updated_at ON document_categories;
CREATE TRIGGER trigger_categories_updated_at
    BEFORE UPDATE ON document_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

-- Function to get document statistics
CREATE OR REPLACE FUNCTION get_document_statistics()
RETURNS TABLE (
    total_documents BIGINT,
    indexed_documents BIGINT,
    pending_documents BIGINT,
    failed_documents BIGINT,
    total_chunks BIGINT,
    total_size_bytes BIGINT,
    documents_by_category JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status != 'deleted'),
        COUNT(*) FILTER (WHERE status = 'indexed'),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COALESCE(SUM(chunk_count) FILTER (WHERE status = 'indexed'), 0),
        COALESCE(SUM(file_size) FILTER (WHERE status != 'deleted'), 0),
        (
            SELECT jsonb_object_agg(
                COALESCE(dc.name, 'Unkategorisiert'),
                cnt
            )
            FROM (
                SELECT category_id, COUNT(*) as cnt
                FROM documents
                WHERE status != 'deleted'
                GROUP BY category_id
            ) sub
            LEFT JOIN document_categories dc ON dc.id = sub.category_id
        )
    FROM documents;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar documents
CREATE OR REPLACE FUNCTION find_similar_documents(
    p_document_id UUID,
    p_min_similarity DECIMAL DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    document_id UUID,
    filename VARCHAR(500),
    title VARCHAR(500),
    similarity_score DECIMAL(5,4),
    similarity_type VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN ds.document_id_1 = p_document_id THEN ds.document_id_2
            ELSE ds.document_id_1
        END as doc_id,
        d.filename,
        d.title,
        ds.similarity_score,
        ds.similarity_type
    FROM document_similarities ds
    JOIN documents d ON (
        CASE
            WHEN ds.document_id_1 = p_document_id THEN ds.document_id_2
            ELSE ds.document_id_1
        END = d.id
    )
    WHERE (ds.document_id_1 = p_document_id OR ds.document_id_2 = p_document_id)
        AND ds.similarity_score >= p_min_similarity
        AND d.status = 'indexed'
    ORDER BY ds.similarity_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- View for document list with category info
CREATE OR REPLACE VIEW documents_with_category AS
SELECT
    d.*,
    dc.name as category_name,
    dc.color as category_color,
    dc.icon as category_icon
FROM documents d
LEFT JOIN document_categories dc ON d.category_id = dc.id
WHERE d.deleted_at IS NULL;

-- Retention policy: Clean up old access logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_access_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM document_access_log
    WHERE accessed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Comment on tables
COMMENT ON TABLE documents IS 'Main document metadata storage for RAG system';
COMMENT ON TABLE document_categories IS 'Document categories for organization and filtering';
COMMENT ON TABLE document_chunks IS 'Tracking of document chunks indexed in Qdrant';
COMMENT ON TABLE document_similarities IS 'Pre-computed document similarity scores';
COMMENT ON TABLE document_processing_queue IS 'Queue for async document processing tasks';
COMMENT ON TABLE document_access_log IS 'Analytics log for document access patterns';
