-- ARASUL PLATFORM - Chat Schema Migration
-- Version: 1.0.0
-- Description: Creates tables for multi-conversation chat with message persistence

-- ============================================================================
-- CHAT CONVERSATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    message_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_deleted ON chat_conversations(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- CHAT MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    thinking TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- ============================================================================
-- AUTO-UPDATE MESSAGE COUNT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE chat_conversations
        SET message_count = message_count + 1, updated_at = NOW()
        WHERE id = NEW.conversation_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE chat_conversations
        SET message_count = message_count - 1, updated_at = NOW()
        WHERE id = OLD.conversation_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to avoid conflicts
DROP TRIGGER IF EXISTS trigger_update_message_count ON chat_messages;

CREATE TRIGGER trigger_update_message_count
AFTER INSERT OR DELETE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_count();

-- ============================================================================
-- RETENTION FUNCTION
-- ============================================================================

-- Auto-delete old deleted chats after 30 days
CREATE OR REPLACE FUNCTION cleanup_deleted_chats()
RETURNS void AS $$
BEGIN
    DELETE FROM chat_conversations WHERE deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL PRIVILEGES ON chat_conversations TO arasul;
GRANT ALL PRIVILEGES ON chat_messages TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE chat_conversations_id_seq TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE chat_messages_id_seq TO arasul;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE chat_conversations IS 'Multi-conversation chat sessions';
COMMENT ON TABLE chat_messages IS 'Chat messages with role (user/assistant/system) and optional thinking blocks';
COMMENT ON COLUMN chat_messages.thinking IS 'LLM thinking/reasoning content from <think> blocks';

-- ============================================================================
-- LOG MIGRATION
-- ============================================================================

INSERT INTO self_healing_events (event_type, severity, description, action_taken, service_name, success)
VALUES (
    'database_migration',
    'INFO',
    'Chat schema migration (005) applied successfully',
    'Created chat_conversations and chat_messages tables with triggers',
    'postgres-db',
    true
);
