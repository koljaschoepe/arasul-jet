-- Migration 066: Add user isolation to chat conversations
-- Security: Ensures each user can only see their own conversations
-- Backfills existing conversations to the first admin user

BEGIN;

-- 1. Add user_id column (nullable first for backfill)
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES admin_users(id) ON DELETE CASCADE;

-- 2. Backfill: assign all existing conversations to the first admin user
UPDATE chat_conversations
SET user_id = (SELECT id FROM admin_users ORDER BY id ASC LIMIT 1)
WHERE user_id IS NULL;

-- 3. Make NOT NULL after backfill
ALTER TABLE chat_conversations ALTER COLUMN user_id SET NOT NULL;

-- 4. Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
  ON chat_conversations(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
