-- ARASUL PLATFORM - LLM Jobs Schema Migration
-- Version: 1.0.0
-- Description: Creates tables for background LLM job tracking with tab-switch resilience

-- ============================================================================
-- LLM JOBS TABLE
-- Tracks active and completed LLM streaming jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,

    -- Job metadata
    job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('chat', 'rag')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'streaming', 'completed', 'error', 'cancelled')),

    -- Request data (stored for potential retry/reconnection)
    request_data JSONB NOT NULL,

    -- Streaming content (incrementally updated)
    content TEXT NOT NULL DEFAULT '',
    thinking TEXT,
    sources JSONB,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_update_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Error tracking
    error_message TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_llm_jobs_conversation ON llm_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_llm_jobs_status ON llm_jobs(status) WHERE status IN ('pending', 'streaming');
CREATE INDEX IF NOT EXISTS idx_llm_jobs_created ON llm_jobs(created_at DESC);

-- ============================================================================
-- EXTEND CHAT_MESSAGES TABLE
-- Add job reference and status tracking
-- ============================================================================

-- Add job_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'job_id'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN job_id UUID REFERENCES llm_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add status column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'status'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN status VARCHAR(20) DEFAULT 'completed'
            CHECK (status IN ('pending', 'streaming', 'completed', 'error'));
    END IF;
END $$;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_chat_messages_job ON chat_messages(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_status ON chat_messages(status) WHERE status != 'completed';

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Auto-cleanup old completed jobs (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_llm_jobs()
RETURNS void AS $$
BEGIN
    DELETE FROM llm_jobs
    WHERE status IN ('completed', 'error', 'cancelled')
    AND completed_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Cleanup stale streaming jobs (backend restart recovery)
CREATE OR REPLACE FUNCTION cleanup_stale_llm_jobs()
RETURNS void AS $$
BEGIN
    -- Mark jobs as error if they haven't been updated in 10 minutes
    UPDATE llm_jobs
    SET status = 'error',
        error_message = 'Job timed out (backend restart or connection lost)',
        completed_at = NOW()
    WHERE status IN ('pending', 'streaming')
    AND last_update_at < NOW() - INTERVAL '10 minutes';

    -- Update corresponding messages
    UPDATE chat_messages
    SET status = 'error'
    WHERE job_id IN (
        SELECT id FROM llm_jobs
        WHERE status = 'error'
        AND error_message LIKE '%timed out%'
    )
    AND status != 'error';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL PRIVILEGES ON llm_jobs TO arasul;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE llm_jobs IS 'Background LLM streaming jobs for tab-switch resilience';
COMMENT ON COLUMN llm_jobs.job_type IS 'Type of job: chat (normal chat) or rag (RAG query)';
COMMENT ON COLUMN llm_jobs.status IS 'Job status: pending, streaming, completed, error, cancelled';
COMMENT ON COLUMN llm_jobs.request_data IS 'Original request parameters (messages, temperature, etc.)';
COMMENT ON COLUMN llm_jobs.content IS 'Accumulated response content (incrementally updated during streaming)';
COMMENT ON COLUMN llm_jobs.thinking IS 'LLM thinking/reasoning content from <think> blocks';
COMMENT ON COLUMN llm_jobs.sources IS 'RAG sources as JSONB array (for RAG queries)';
COMMENT ON COLUMN llm_jobs.last_update_at IS 'Last content update timestamp (for stale job detection)';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
VALUES (
    'database_migration',
    'INFO',
    'LLM Jobs schema migration (006) applied successfully',
    'Created llm_jobs table and extended chat_messages with job_id and status',
    'postgres-db',
    true
);
