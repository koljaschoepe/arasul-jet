-- ============================================================
-- 040: Context Management System
-- Compaction, Memory, Token-Tracking, Model-Context-Windows
-- ============================================================

-- 1. Compaction fields in chat_conversations
ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS compaction_summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS compaction_token_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS compaction_message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_compacted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Token tracking in llm_jobs
ALTER TABLE llm_jobs
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS context_window_used INTEGER DEFAULT NULL;

-- 3. Model context windows in catalog
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recommended_ctx INTEGER DEFAULT 8192;

-- Set known context windows
UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 16384
WHERE id IN ('qwen3:7b-q8', 'qwen3:14b-q8', 'qwen3:32b-q4');

UPDATE llm_model_catalog SET context_window = 131072, recommended_ctx = 8192
WHERE id IN ('llama3.1:8b', 'llama3.1:70b-q4');

UPDATE llm_model_catalog SET context_window = 32768, recommended_ctx = 8192
WHERE id IN ('mistral:7b-q8');

UPDATE llm_model_catalog SET context_window = 8192, recommended_ctx = 8192
WHERE id IN ('gemma2:9b-q8');

UPDATE llm_model_catalog SET context_window = 16384, recommended_ctx = 8192
WHERE id IN ('deepseek-coder:6.7b');

-- 4. Memory tracking table
CREATE TABLE IF NOT EXISTS ai_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('fact', 'decision', 'preference')),
    content TEXT NOT NULL,
    source_conversation_id BIGINT REFERENCES chat_conversations(id)
        ON DELETE SET NULL,
    qdrant_point_id UUID,
    importance DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_type ON ai_memories(type);
CREATE INDEX IF NOT EXISTS idx_ai_memories_active ON ai_memories(is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_memories_created ON ai_memories(created_at DESC);

-- 5. AI profile in system_settings
ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS ai_profile_yaml TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ai_profile_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 6. Compaction statistics log
CREATE TABLE IF NOT EXISTS compaction_log (
    id SERIAL PRIMARY KEY,
    conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE CASCADE,
    messages_compacted INTEGER NOT NULL,
    tokens_before INTEGER NOT NULL,
    tokens_after INTEGER NOT NULL,
    compression_ratio DECIMAL(5,2),
    memories_extracted INTEGER DEFAULT 0,
    model_used VARCHAR(100),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compaction_log_conversation
    ON compaction_log(conversation_id);

-- 7. Cleanup function for old compaction logs
CREATE OR REPLACE FUNCTION cleanup_old_compaction_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM compaction_log WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
