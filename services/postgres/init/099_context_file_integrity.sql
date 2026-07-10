-- 099_context_file_integrity.sql — Integritäts-Härtung für Kontextdateien
-- (Follow-up zu 098, Review-Findings aus PR #178):
--
-- (1) Dedupe: Der SELECT-then-INSERT-Upsert in PUT /spaces/:id/context-file
--     lief bisher ohne Transaktion/Eindeutigkeit — parallele PUTs konnten
--     mehrere is_context_file-Zeilen pro Space erzeugen. Vor dem Anlegen des
--     UNIQUE-Index werden Duplikate bereinigt: pro space_id bleibt nur die
--     neueste aktive Kontextdatei (uploaded_at; documents hat kein created_at),
--     alle älteren werden soft-deleted (gleiches Muster wie
--     DELETE /spaces/:id/context-file: deleted_at = NOW(), status = 'deleted').
-- (2) Eindeutigkeit: idx_documents_context_file (098, nicht unique) wird durch
--     einen UNIQUE partial index ersetzt — die DB erzwingt jetzt "höchstens
--     eine aktive Kontextdatei pro Space", nicht mehr nur die API.
-- (3) Statistiken: get_document_statistics() (009) und
--     get_filtered_document_statistics() (040) zählten Kontextdateien mit
--     (status 'context' ist weder 'deleted' noch gefiltert). Beide Funktionen
--     werden signaturgleich neu definiert mit is_context_file = FALSE.
--
-- Rollback (down):
--   DROP INDEX IF EXISTS idx_documents_context_file_unique;
--   CREATE INDEX IF NOT EXISTS idx_documents_context_file
--       ON documents(space_id)
--       WHERE is_context_file = TRUE AND deleted_at IS NULL;
--   -- Funktionen: Original-Definitionen aus 009_documents_schema.sql bzw.
--   -- 040_filter_aware_statistics.sql erneut einspielen (CREATE OR REPLACE).
--   -- Dedupe (1) ist ein Soft-Delete und via deleted_at = NULL reversibel,
--   -- wird aber bewusst nicht automatisch zurückgerollt.

-- (1) Vorab-Dedupe: pro Space nur die neueste aktive Kontextdatei behalten.
-- Idempotent — nach dem ersten Lauf (und mit UNIQUE-Index) matcht das UPDATE
-- keine Zeilen mehr.
UPDATE documents
   SET deleted_at = NOW(),
       status = 'deleted'
 WHERE is_context_file = TRUE
   AND deleted_at IS NULL
   AND id NOT IN (
       SELECT DISTINCT ON (space_id) id
         FROM documents
        WHERE is_context_file = TRUE
          AND deleted_at IS NULL
        ORDER BY space_id, uploaded_at DESC, id
   );

-- (2) Nicht-uniquen Index aus 098 durch UNIQUE partial index ersetzen.
DROP INDEX IF EXISTS idx_documents_context_file;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_context_file_unique
    ON documents(space_id)
    WHERE is_context_file = TRUE AND deleted_at IS NULL;

-- (3a) get_document_statistics() — Original aus 009_documents_schema.sql,
-- ergänzt um is_context_file = FALSE (Signatur unverändert).
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
        COUNT(*) FILTER (WHERE status != 'deleted' AND is_context_file = FALSE),
        COUNT(*) FILTER (WHERE status = 'indexed' AND is_context_file = FALSE),
        COUNT(*) FILTER (WHERE status = 'pending' AND is_context_file = FALSE),
        COUNT(*) FILTER (WHERE status = 'failed' AND is_context_file = FALSE),
        COALESCE(SUM(chunk_count) FILTER (WHERE status = 'indexed' AND is_context_file = FALSE), 0)::bigint,
        COALESCE(SUM(file_size) FILTER (WHERE status != 'deleted' AND is_context_file = FALSE), 0)::bigint,
        (
            SELECT jsonb_object_agg(
                COALESCE(dc.name, 'Unkategorisiert'),
                cnt
            )
            FROM (
                SELECT category_id, COUNT(*) as cnt
                FROM documents
                WHERE status != 'deleted'
                    AND is_context_file = FALSE
                GROUP BY category_id
            ) sub
            LEFT JOIN document_categories dc ON dc.id = sub.category_id
        )
    FROM documents;
END;
$$ LANGUAGE plpgsql;

-- (3b) get_filtered_document_statistics() — Original aus
-- 040_filter_aware_statistics.sql, ergänzt um is_context_file = FALSE
-- (Signatur unverändert).
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
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR d.status = p_status::document_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'indexed'
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR p_status = 'indexed')
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'pending'
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR p_status = 'pending')
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COUNT(*) FILTER (WHERE d.status = 'failed'
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR p_status = 'failed')
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ),
        COALESCE(SUM(d.chunk_count) FILTER (WHERE d.status = 'indexed'
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR p_status = 'indexed')
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ), 0),
        COALESCE(SUM(d.file_size) FILTER (WHERE d.status != 'deleted'
            AND d.is_context_file = FALSE
            AND (p_space_id IS NULL OR d.space_id = p_space_id)
            AND (p_status IS NULL OR d.status = p_status::document_status)
            AND (p_category_id IS NULL OR d.category_id = p_category_id)
        ), 0)::bigint,
        (
            SELECT jsonb_object_agg(
                COALESCE(dc.name, 'Unkategorisiert'),
                cnt
            )
            FROM (
                SELECT category_id, COUNT(*) as cnt
                FROM documents
                WHERE status != 'deleted'
                    AND is_context_file = FALSE
                    AND (p_space_id IS NULL OR space_id = p_space_id)
                    AND (p_status IS NULL OR status = p_status::document_status)
                    AND (p_category_id IS NULL OR category_id = p_category_id)
                GROUP BY category_id
            ) sub
            LEFT JOIN document_categories dc ON dc.id = sub.category_id
        )
    FROM documents d;
END;
$$ LANGUAGE plpgsql STABLE;
