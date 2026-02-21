-- 040_filter_aware_statistics.sql
-- Filter-aware document statistics function
-- All parameters optional (NULL = no filter)

CREATE OR REPLACE FUNCTION get_filtered_document_statistics(
    p_space_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
)
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
        COUNT(*) FILTER (WHERE d.status != 'deleted'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR d.status = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'indexed'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR 'indexed' = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'pending'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR 'pending' = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'failed'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR 'failed' = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COALESCE(SUM(d.chunk_count) FILTER (WHERE d.status = 'indexed'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR 'indexed' = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ), 0),
        COALESCE(SUM(d.file_size) FILTER (WHERE d.status != 'deleted'
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR d.status = p_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ), 0),
        (
            SELECT jsonb_object_agg(
                COALESCE(dc.name, 'Unkategorisiert'),
                cnt
            )
            FROM (
                SELECT category_id, COUNT(*) as cnt
                FROM documents
                WHERE status != 'deleted'
                    AND (p_space_id IS NULL OR space_id = p_space_id)
                    AND (p_status IS NULL OR status = p_status)
                    AND (p_category_id IS NULL OR category_id = p_category_id)
                GROUP BY category_id
            ) sub
            LEFT JOIN document_categories dc ON dc.id = sub.category_id
        )
    FROM documents d;
END;
$$ LANGUAGE plpgsql STABLE;
