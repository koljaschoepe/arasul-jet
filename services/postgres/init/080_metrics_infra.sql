-- ============================================================================
-- 080_metrics_infra.sql
-- Generic infrastructure-metrics sink (Phase 5.6).
--
-- One table, one schema. Every infra probe (pg_stat_user_tables, qdrant
-- collection stats, minio bucket usage) writes a row with source_type +
-- source_name + payload JSONB. Keeps the collector simple, lets the
-- dashboard query any key without a migration per metric.
--
-- Retention: 30 days (handled by cleanup_old_metrics_infra()).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS metrics_infra (
    id BIGSERIAL PRIMARY KEY,
    source_type VARCHAR(40) NOT NULL,   -- 'pg_table' | 'qdrant_collection' | 'minio_bucket' | ...
    source_name VARCHAR(120) NOT NULL,  -- table name / collection name / bucket name
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_infra_type_name_time
    ON metrics_infra (source_type, source_name, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_infra_collected_at
    ON metrics_infra (collected_at DESC);

CREATE OR REPLACE FUNCTION cleanup_old_metrics_infra()
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM metrics_infra
     WHERE collected_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE metrics_infra IS
    'Generic infra metrics sink: one row per (source_type, source_name, collection). '
    'payload is JSONB so new metrics do not require migrations.';

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
SELECT 'database_migration', 'INFO',
    '080: metrics_infra table + cleanup function created',
    'New generic infra-metrics sink for Phase 5.6 expansion',
    'postgres-db', true
WHERE NOT EXISTS (
    SELECT 1 FROM self_healing_events
     WHERE event_type = 'database_migration'
       AND description = '080: metrics_infra table + cleanup function created'
);

COMMIT;
