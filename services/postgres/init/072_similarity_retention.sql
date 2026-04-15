-- ============================================================================
-- Document similarities retention cleanup
-- Removes stale similarity records for deleted documents and limits table growth
-- ============================================================================

-- Cleanup function: remove similarities older than 90 days or for deleted documents
CREATE OR REPLACE FUNCTION cleanup_document_similarities(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    _rows INTEGER;
BEGIN
    -- Delete similarities for soft-deleted documents
    DELETE FROM document_similarities ds
    WHERE EXISTS (
        SELECT 1 FROM documents d
        WHERE (d.id = ds.document_id_1 OR d.id = ds.document_id_2)
          AND d.deleted_at IS NOT NULL
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Delete similarities older than retention period
    DELETE FROM document_similarities
    WHERE calculated_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS _rows = ROW_COUNT;
    deleted_count := deleted_count + _rows;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_document_similarities IS 'Removes stale document similarity records. Called by self-healing agent.';
