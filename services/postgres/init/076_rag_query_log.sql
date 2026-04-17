-- Migration 076: RAG query telemetry for Phase 6.2 metrics dashboard.
-- Each /api/rag/query invocation appends one row here. Aggregates drive the
-- "RAG-Metriken" card (retrieval rate, avg rerank score, avg answer length,
-- no-document rate). Intentionally lean — no FK to conversations so old rows
-- survive conversation cleanup.

CREATE TABLE IF NOT EXISTS rag_query_log (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conversation_id INTEGER,
    user_id         INTEGER,
    query_text      TEXT NOT NULL,
    query_length    INTEGER NOT NULL,
    retrieved_count INTEGER NOT NULL DEFAULT 0,
    top_rerank_score DOUBLE PRECISION,
    avg_rerank_score DOUBLE PRECISION,
    space_ids       INTEGER[],
    routing_method  TEXT,
    marginal_results BOOLEAN NOT NULL DEFAULT FALSE,
    no_relevant_docs BOOLEAN NOT NULL DEFAULT FALSE,
    response_length INTEGER,
    latency_ms      INTEGER,
    error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_created_at
    ON rag_query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_conversation
    ON rag_query_log(conversation_id);

COMMENT ON TABLE rag_query_log IS
    'Per-query RAG telemetry. Aggregated by /api/rag/metrics for the Database Overview dashboard.';

INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (76, '076_rag_query_log.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;
