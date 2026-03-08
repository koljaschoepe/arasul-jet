-- 046: Chat-specific settings (RAG, Think, Model, Space)
-- Persists per-chat preferences across sessions

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS use_rag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_thinking BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferred_model VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_space_id UUID DEFAULT NULL;
