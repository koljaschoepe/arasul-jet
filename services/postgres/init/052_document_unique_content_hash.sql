-- ============================================================================
-- Add partial UNIQUE constraint on content_hash to prevent duplicate documents
-- Only applies to non-deleted documents (deleted_at IS NULL)
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_content_hash
    ON documents (content_hash)
    WHERE deleted_at IS NULL AND status <> 'deleted';
