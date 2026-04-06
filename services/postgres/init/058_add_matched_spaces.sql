-- Migration 058: Add matched_spaces column to chat_messages and llm_jobs
-- Persists RAG knowledge space metadata so it survives page reload

-- Add to chat_messages (final storage)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'matched_spaces'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN matched_spaces JSONB DEFAULT NULL;
        COMMENT ON COLUMN chat_messages.matched_spaces IS 'RAG matched knowledge spaces as JSONB array [{name, color, score, id}]';
    END IF;
END $$;

-- Add to llm_jobs (streaming storage)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_jobs' AND column_name = 'matched_spaces'
    ) THEN
        ALTER TABLE llm_jobs ADD COLUMN matched_spaces JSONB DEFAULT NULL;
        COMMENT ON COLUMN llm_jobs.matched_spaces IS 'RAG matched knowledge spaces during streaming';
    END IF;
END $$;
