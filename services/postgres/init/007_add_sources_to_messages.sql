-- ARASUL PLATFORM - Add sources column to chat_messages
-- Version: 1.0.0
-- Description: Adds sources JSONB column to persist RAG sources with messages

-- ============================================================================
-- ADD SOURCES COLUMN TO CHAT_MESSAGES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_messages' AND column_name = 'sources'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN sources JSONB;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN chat_messages.sources IS 'RAG sources as JSONB array (document_name, chunk_index, score, text_preview)';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
VALUES (
    'database_migration',
    'INFO',
    'Chat messages sources migration (007) applied successfully',
    'Added sources JSONB column to chat_messages table',
    'postgres-db',
    true
);
