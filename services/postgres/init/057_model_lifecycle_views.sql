-- Migration 057: Model Lifecycle Usage Profile Views
-- Provides hourly usage aggregation from llm_jobs for adaptive keep-alive

-- Idempotent: CREATE OR REPLACE is safe to re-run
CREATE OR REPLACE VIEW v_llm_hourly_usage AS
SELECT
    EXTRACT(HOUR FROM created_at)::INTEGER AS hour,
    EXTRACT(DOW FROM created_at)::INTEGER AS day_of_week,
    COUNT(*) AS request_count
FROM llm_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status IN ('completed', 'streaming')
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_llm_usage_profile AS
SELECT
    hour,
    ROUND(AVG(request_count), 1) AS avg_requests,
    MAX(request_count) AS peak_requests,
    COUNT(DISTINCT day_of_week) AS active_days
FROM v_llm_hourly_usage
GROUP BY hour
ORDER BY hour;

-- Record migration
INSERT INTO schema_migrations (version, filename, success)
VALUES (57, '057_model_lifecycle_views.sql', true)
ON CONFLICT (version) DO NOTHING;
