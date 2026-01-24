-- Migration 030: Model Performance Metrics
-- Tracks tokens/second, latency, and other performance metrics per model
-- Part of Phase 4 KI System Optimization (P4-002)

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS model_performance_metrics (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(100) NOT NULL,
    job_id UUID REFERENCES llm_jobs(id) ON DELETE SET NULL,
    job_type VARCHAR(20) NOT NULL DEFAULT 'chat',  -- 'chat' or 'rag'

    -- Token metrics
    tokens_generated INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER DEFAULT NULL,  -- If available from model

    -- Timing metrics (in milliseconds)
    time_to_first_token_ms INTEGER DEFAULT NULL,
    total_duration_ms INTEGER NOT NULL,

    -- Calculated metrics
    tokens_per_second DECIMAL(10, 2) GENERATED ALWAYS AS (
        CASE WHEN total_duration_ms > 0
             THEN (tokens_generated::DECIMAL * 1000) / total_duration_ms
             ELSE 0
        END
    ) STORED,

    -- Context
    thinking_enabled BOOLEAN DEFAULT false,
    context_length INTEGER DEFAULT NULL,  -- Number of chars in context/prompt

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to model catalog (soft link - no constraint for flexibility)
    CONSTRAINT valid_model_id CHECK (model_id IS NOT NULL AND LENGTH(model_id) > 0)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_perf_model_id ON model_performance_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_perf_created_at ON model_performance_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_job_type ON model_performance_metrics(job_type);

-- View for aggregated model stats
CREATE OR REPLACE VIEW model_performance_stats AS
SELECT
    model_id,
    job_type,
    COUNT(*) as total_requests,
    AVG(tokens_per_second) as avg_tokens_per_second,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tokens_per_second) as median_tokens_per_second,
    MIN(tokens_per_second) as min_tokens_per_second,
    MAX(tokens_per_second) as max_tokens_per_second,
    AVG(time_to_first_token_ms) as avg_ttft_ms,
    AVG(total_duration_ms) as avg_duration_ms,
    SUM(tokens_generated) as total_tokens_generated,
    MAX(created_at) as last_used
FROM model_performance_metrics
WHERE created_at > NOW() - INTERVAL '7 days'  -- Last 7 days only
GROUP BY model_id, job_type
ORDER BY total_requests DESC;

-- Function to record performance metrics
CREATE OR REPLACE FUNCTION record_model_performance(
    p_model_id VARCHAR(100),
    p_job_id UUID,
    p_job_type VARCHAR(20),
    p_tokens_generated INTEGER,
    p_total_duration_ms INTEGER,
    p_time_to_first_token_ms INTEGER DEFAULT NULL,
    p_thinking_enabled BOOLEAN DEFAULT false,
    p_context_length INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    INSERT INTO model_performance_metrics (
        model_id, job_id, job_type, tokens_generated, total_duration_ms,
        time_to_first_token_ms, thinking_enabled, context_length
    ) VALUES (
        p_model_id, p_job_id, p_job_type, p_tokens_generated, p_total_duration_ms,
        p_time_to_first_token_ms, p_thinking_enabled, p_context_length
    )
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old metrics (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM model_performance_metrics
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE model_performance_metrics IS
    'Tracks LLM performance metrics (tokens/s, latency) for each model and request type';
