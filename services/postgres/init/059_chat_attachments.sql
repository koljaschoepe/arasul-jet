-- Migration 059: Chat Attachments
-- Enables file uploads in chat messages for document analysis

CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id BIGINT REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  file_extension VARCHAR(20),
  extracted_text TEXT,
  extraction_status VARCHAR(20) DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'extracting', 'done', 'failed')),
  extraction_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation ON chat_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_status ON chat_attachments(extraction_status)
  WHERE extraction_status != 'done';
