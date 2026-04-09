-- Migration 060: Enable pg_stat_statements for query performance monitoring
-- Tracks execution statistics of all SQL statements (top queries by time, calls, rows)
-- Required: shared_preload_libraries = 'pg_stat_statements' in postgresql.conf

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View: Top 20 slowest queries by total execution time
CREATE OR REPLACE VIEW v_slow_queries AS
SELECT
    queryid,
    LEFT(query, 200) AS query_preview,
    calls,
    ROUND(total_exec_time::numeric, 2) AS total_ms,
    ROUND(mean_exec_time::numeric, 2) AS mean_ms,
    ROUND(max_exec_time::numeric, 2) AS max_ms,
    rows
FROM pg_stat_statements
WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
ORDER BY total_exec_time DESC
LIMIT 20;

-- View: Database connection summary
CREATE OR REPLACE VIEW v_connection_summary AS
SELECT
    state,
    COUNT(*) AS count,
    MAX(EXTRACT(EPOCH FROM (now() - state_change)))::int AS max_age_seconds
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state;

-- View: Table bloat estimation (dead tuples needing vacuum)
CREATE OR REPLACE VIEW v_table_bloat AS
SELECT
    schemaname || '.' || relname AS table_name,
    n_live_tup,
    n_dead_tup,
    CASE WHEN n_live_tup > 0
        THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
        ELSE 0
    END AS dead_pct,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 20;
