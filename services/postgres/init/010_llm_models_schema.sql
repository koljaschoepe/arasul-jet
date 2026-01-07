-- ============================================================================
-- LLM Model Management Schema for Arasul Platform
-- Version: 1.0.0
--
-- This schema provides dynamic LLM model management for Jetson AGX Orin:
-- - Curated model catalog with Jetson-tested models
-- - Installed models tracking with download status
-- - Model switch history for analytics
-- - Smart queue batching support with model affinity
-- ============================================================================

-- ============================================================================
-- 1. LLM Model Catalog (Curated Jetson-tested models)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_model_catalog (
    id VARCHAR(100) PRIMARY KEY,              -- e.g., 'qwen3:7b-q8'
    name VARCHAR(255) NOT NULL,               -- Display name
    description TEXT,                         -- Model description
    size_bytes BIGINT NOT NULL,               -- Download size in bytes
    ram_required_gb INTEGER NOT NULL,         -- Estimated RAM requirement
    category VARCHAR(50) NOT NULL             -- 'small', 'medium', 'large', 'xlarge'
        CHECK (category IN ('small', 'medium', 'large', 'xlarge')),
    capabilities JSONB DEFAULT '[]',          -- ['coding', 'reasoning', 'multilingual']
    recommended_for JSONB DEFAULT '[]',       -- ['chat', 'rag', 'coding']
    jetson_tested BOOLEAN DEFAULT true,       -- Tested on Jetson AGX Orin
    performance_tier INTEGER DEFAULT 2        -- 1=fastest, 3=slowest
        CHECK (performance_tier BETWEEN 1 AND 3),
    ollama_library_url VARCHAR(500),          -- URL to Ollama library page
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Installed Models Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_installed_models (
    id VARCHAR(100) PRIMARY KEY,              -- Model ID (same as catalog)
    status VARCHAR(20) DEFAULT 'available'
        CHECK (status IN ('downloading', 'available', 'error')),
    download_progress INTEGER DEFAULT 0       -- 0-100 percent
        CHECK (download_progress BETWEEN 0 AND 100),
    downloaded_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER DEFAULT 0,
    error_message TEXT,
    is_default BOOLEAN DEFAULT false          -- Default model for new chats
);

-- Ensure only one default model
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_installed_models_default
    ON llm_installed_models (is_default)
    WHERE is_default = true;

-- ============================================================================
-- 3. Model Switch History (for analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_model_switches (
    id SERIAL PRIMARY KEY,
    from_model VARCHAR(100),                  -- Previous model (null if first load)
    to_model VARCHAR(100) NOT NULL,           -- New model
    switch_duration_ms INTEGER,               -- Time to switch in milliseconds
    triggered_by VARCHAR(50),                 -- 'user', 'queue', 'workflow', 'auto'
    reason VARCHAR(100),                      -- 'same_model', 'no_same_model_jobs', 'max_wait_exceeded'
    switched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Extend llm_jobs for Model Batching
-- ============================================================================

-- Add model-related columns to llm_jobs
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS requested_model VARCHAR(100);
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS model_sequence JSONB DEFAULT NULL;
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS max_wait_seconds INTEGER DEFAULT 120;

-- Index for efficient model batching queries
CREATE INDEX IF NOT EXISTS idx_llm_jobs_model_pending
    ON llm_jobs(requested_model, priority DESC, queued_at ASC)
    WHERE status = 'pending';

-- Index for fairness check (oldest waiting job for different model)
CREATE INDEX IF NOT EXISTS idx_llm_jobs_fairness_check
    ON llm_jobs(queued_at ASC)
    WHERE status = 'pending';

-- ============================================================================
-- 5. Smart Batching Function
-- ============================================================================

-- Function to get next job with model batching logic
CREATE OR REPLACE FUNCTION get_next_batched_job(current_model VARCHAR(100))
RETURNS TABLE (
    job_id UUID,
    requested_model VARCHAR(100),
    should_switch BOOLEAN,
    switch_reason VARCHAR(100)
) AS $$
DECLARE
    max_wait_exceeded BOOLEAN;
    oldest_other_model_job RECORD;
    next_job RECORD;
BEGIN
    -- Check if any job for a different model has exceeded max wait time
    SELECT EXISTS (
        SELECT 1 FROM llm_jobs j
        WHERE j.status = 'pending'
        AND (j.requested_model IS DISTINCT FROM current_model OR current_model IS NULL)
        AND j.queued_at < NOW() - (COALESCE(j.max_wait_seconds, 120) * INTERVAL '1 second')
    ) INTO max_wait_exceeded;

    -- If a different model has waited too long, prioritize it (fairness)
    IF max_wait_exceeded THEN
        SELECT j.id, j.requested_model INTO oldest_other_model_job
        FROM llm_jobs j
        WHERE j.status = 'pending'
        AND (j.requested_model IS DISTINCT FROM current_model OR current_model IS NULL)
        AND j.queued_at < NOW() - (COALESCE(j.max_wait_seconds, 120) * INTERVAL '1 second')
        ORDER BY j.queued_at ASC
        LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT
                oldest_other_model_job.id,
                oldest_other_model_job.requested_model,
                TRUE,
                'max_wait_exceeded'::VARCHAR(100);
            RETURN;
        END IF;
    END IF;

    -- Otherwise: prefer jobs for the currently loaded model (batch by model)
    SELECT j.id, j.requested_model INTO next_job
    FROM llm_jobs j
    WHERE j.status = 'pending'
    ORDER BY
        -- Prioritize: 1) Same model, 2) High priority, 3) Oldest
        CASE WHEN j.requested_model = current_model THEN 0 ELSE 1 END,
        COALESCE(j.priority, 0) DESC,
        j.queued_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
        -- No pending jobs
        RETURN;
    END IF;

    -- Determine if we need to switch and why
    RETURN QUERY SELECT
        next_job.id,
        next_job.requested_model,
        CASE
            WHEN current_model IS NULL THEN TRUE
            WHEN next_job.requested_model IS NULL THEN FALSE
            WHEN next_job.requested_model = current_model THEN FALSE
            ELSE TRUE
        END,
        CASE
            WHEN next_job.requested_model = current_model THEN 'same_model'::VARCHAR(100)
            WHEN current_model IS NULL THEN 'no_model_loaded'::VARCHAR(100)
            WHEN next_job.requested_model IS NULL THEN 'use_default'::VARCHAR(100)
            ELSE 'no_same_model_jobs'::VARCHAR(100)
        END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Helper Functions
-- ============================================================================

-- Function to get queue status by model
CREATE OR REPLACE FUNCTION get_queue_status_by_model()
RETURNS TABLE (
    model VARCHAR(100),
    pending_count BIGINT,
    streaming_count BIGINT,
    oldest_pending TIMESTAMPTZ,
    avg_wait_seconds NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(j.requested_model, 'default') as model,
        COUNT(*) FILTER (WHERE j.status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE j.status = 'streaming') as streaming_count,
        MIN(j.queued_at) FILTER (WHERE j.status = 'pending') as oldest_pending,
        EXTRACT(EPOCH FROM AVG(NOW() - j.queued_at) FILTER (WHERE j.status = 'pending'))::NUMERIC as avg_wait_seconds
    FROM llm_jobs j
    WHERE j.status IN ('pending', 'streaming')
    GROUP BY COALESCE(j.requested_model, 'default')
    ORDER BY pending_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to record model switch
CREATE OR REPLACE FUNCTION record_model_switch(
    p_from_model VARCHAR(100),
    p_to_model VARCHAR(100),
    p_duration_ms INTEGER,
    p_triggered_by VARCHAR(50),
    p_reason VARCHAR(100)
) RETURNS void AS $$
BEGIN
    INSERT INTO llm_model_switches (from_model, to_model, switch_duration_ms, triggered_by, reason)
    VALUES (p_from_model, p_to_model, p_duration_ms, p_triggered_by, p_reason);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Initial Curated Model Catalog (Jetson AGX Orin 64GB)
-- ============================================================================

INSERT INTO llm_model_catalog (id, name, description, size_bytes, ram_required_gb, category, capabilities, recommended_for, jetson_tested, performance_tier, ollama_library_url) VALUES
    -- Small Models (7-9B) - Fast, good for quick tasks
    ('qwen3:7b-q8', 'Qwen 3 7B', 'Schnelles Allzweck-Modell mit hervorragender Mehrsprachigkeit', 8000000000, 10, 'small',
     '["general", "multilingual", "coding", "reasoning"]'::jsonb,
     '["chat", "quick-tasks", "translation"]'::jsonb,
     true, 1, 'https://ollama.com/library/qwen3'),

    ('llama3.1:8b', 'Llama 3.1 8B', 'Metas schnelles Basismodell mit guter Allgemeinleistung', 8500000000, 12, 'small',
     '["general", "coding", "instruction-following"]'::jsonb,
     '["chat", "quick-tasks"]'::jsonb,
     true, 1, 'https://ollama.com/library/llama3.1'),

    ('deepseek-coder:6.7b', 'DeepSeek Coder 6.7B', 'Spezialisiert auf Code-Generierung und -Analyse', 7000000000, 10, 'small',
     '["coding", "code-review", "debugging"]'::jsonb,
     '["coding", "code-review", "debugging"]'::jsonb,
     true, 1, 'https://ollama.com/library/deepseek-coder'),

    ('mistral:7b-q8', 'Mistral 7B', 'Europaeisches Qualitaetsmodell mit starker Reasoning-Faehigkeit', 8000000000, 10, 'small',
     '["general", "multilingual", "reasoning"]'::jsonb,
     '["chat", "european-languages", "analysis"]'::jsonb,
     true, 1, 'https://ollama.com/library/mistral'),

    ('gemma2:9b-q8', 'Gemma 2 9B', 'Googles effizientes Modell mit guter Balance aus Geschwindigkeit und Qualitaet', 9500000000, 12, 'small',
     '["general", "reasoning", "instruction-following"]'::jsonb,
     '["chat", "quick-tasks", "summarization"]'::jsonb,
     true, 1, 'https://ollama.com/library/gemma2'),

    -- Medium Models (14B) - Balanced performance
    ('qwen3:14b-q8', 'Qwen 3 14B', 'Ausgewogenes Modell fuer die meisten Aufgaben mit erweitertem Kontext', 15000000000, 20, 'medium',
     '["general", "multilingual", "coding", "reasoning", "analysis"]'::jsonb,
     '["chat", "rag", "coding", "document-analysis"]'::jsonb,
     true, 2, 'https://ollama.com/library/qwen3'),

    -- Large Models (32B) - High quality for complex tasks
    ('qwen3:32b-q4', 'Qwen 3 32B', 'Grosses Modell fuer komplexe Aufgaben und tiefgehende Analysen', 20000000000, 35, 'large',
     '["general", "multilingual", "coding", "reasoning", "analysis", "creative"]'::jsonb,
     '["complex-tasks", "analysis", "research", "creative-writing"]'::jsonb,
     true, 3, 'https://ollama.com/library/qwen3'),

    -- XLarge Models (70B) - Maximum quality
    ('llama3.1:70b-q4', 'Llama 3.1 70B', 'Metas groesstes Modell fuer maximale Qualitaet bei komplexen Aufgaben', 40000000000, 50, 'xlarge',
     '["general", "coding", "reasoning", "analysis", "research", "creative"]'::jsonb,
     '["complex-analysis", "research", "coding", "expert-tasks"]'::jsonb,
     true, 3, 'https://ollama.com/library/llama3.1')

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    size_bytes = EXCLUDED.size_bytes,
    ram_required_gb = EXCLUDED.ram_required_gb,
    category = EXCLUDED.category,
    capabilities = EXCLUDED.capabilities,
    recommended_for = EXCLUDED.recommended_for,
    jetson_tested = EXCLUDED.jetson_tested,
    performance_tier = EXCLUDED.performance_tier,
    ollama_library_url = EXCLUDED.ollama_library_url,
    updated_at = NOW();

-- ============================================================================
-- 8. Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_llm_model_catalog_category ON llm_model_catalog(category);
CREATE INDEX IF NOT EXISTS idx_llm_model_catalog_performance ON llm_model_catalog(performance_tier);
CREATE INDEX IF NOT EXISTS idx_llm_installed_models_status ON llm_installed_models(status);
CREATE INDEX IF NOT EXISTS idx_llm_installed_models_last_used ON llm_installed_models(last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_llm_model_switches_time ON llm_model_switches(switched_at DESC);

-- ============================================================================
-- 9. Triggers
-- ============================================================================

-- Update timestamp trigger for catalog
CREATE OR REPLACE FUNCTION update_llm_model_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_llm_model_catalog_updated_at ON llm_model_catalog;
CREATE TRIGGER trigger_llm_model_catalog_updated_at
    BEFORE UPDATE ON llm_model_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_model_catalog_updated_at();

-- ============================================================================
-- 10. Comments
-- ============================================================================

COMMENT ON TABLE llm_model_catalog IS 'Curated catalog of Jetson-tested LLM models';
COMMENT ON TABLE llm_installed_models IS 'Tracking of installed/downloaded models';
COMMENT ON TABLE llm_model_switches IS 'History of model switches for analytics';
COMMENT ON FUNCTION get_next_batched_job(VARCHAR) IS 'Smart queue batching: prioritizes jobs for currently loaded model';
COMMENT ON FUNCTION get_queue_status_by_model() IS 'Returns queue statistics grouped by requested model';
