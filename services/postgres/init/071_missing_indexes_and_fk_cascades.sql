-- Migration 071: Missing index on token_blacklist FK + FK cascade fix
-- Prevents slow queries on user deletion/token cleanup and orphaned document rows
--
-- NOTE: Indexes on chat_messages.conversation_id, chat_attachments.conversation_id,
-- llm_jobs.conversation_id, and audit_logs.user_id already exist from earlier migrations
-- (005, 059, 006, 021 respectively). Only token_blacklist.user_id was missing.

-- ============================================================
-- Missing index on foreign key column
-- ============================================================

-- token_blacklist.user_id — used in ON DELETE CASCADE from admin_users
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);

-- ============================================================
-- FK cascade fix: documents.category_id
-- ============================================================
-- If a category is deleted, set documents' category_id to NULL instead of blocking deletion.
-- Check if constraint exists before altering (idempotent).
DO $$
BEGIN
  -- Drop old constraint without cascade
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_category_id_fkey'
    AND table_name = 'documents'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_category_id_fkey;
    ALTER TABLE documents ADD CONSTRAINT documents_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Record migration
INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (71, '071_missing_indexes_and_fk_cascades.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;
