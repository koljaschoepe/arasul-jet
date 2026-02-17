-- Migration 037: Fix Foreign Key Constraints and Add Missing Indexes
-- Production-readiness: Ensure all FK constraints have explicit ON DELETE actions
-- and critical queries have composite indexes.

BEGIN;

-- ============================================================================
-- 1. Fix FK constraints in update_* tables (from 004_update_schema.sql)
-- ============================================================================

-- update_backups.update_event_id -> ON DELETE CASCADE
ALTER TABLE update_backups
  DROP CONSTRAINT IF EXISTS update_backups_update_event_id_fkey;
ALTER TABLE update_backups
  ADD CONSTRAINT update_backups_update_event_id_fkey
  FOREIGN KEY (update_event_id) REFERENCES update_events(id) ON DELETE CASCADE;

-- update_rollbacks.original_update_event_id -> ON DELETE CASCADE
ALTER TABLE update_rollbacks
  DROP CONSTRAINT IF EXISTS update_rollbacks_original_update_event_id_fkey;
ALTER TABLE update_rollbacks
  ADD CONSTRAINT update_rollbacks_original_update_event_id_fkey
  FOREIGN KEY (original_update_event_id) REFERENCES update_events(id) ON DELETE CASCADE;

-- update_rollbacks.backup_id -> ON DELETE CASCADE
ALTER TABLE update_rollbacks
  DROP CONSTRAINT IF EXISTS update_rollbacks_backup_id_fkey;
ALTER TABLE update_rollbacks
  ADD CONSTRAINT update_rollbacks_backup_id_fkey
  FOREIGN KEY (backup_id) REFERENCES update_backups(id) ON DELETE CASCADE;

-- update_state_snapshots.update_event_id -> ON DELETE CASCADE
ALTER TABLE update_state_snapshots
  DROP CONSTRAINT IF EXISTS update_state_snapshots_update_event_id_fkey;
ALTER TABLE update_state_snapshots
  ADD CONSTRAINT update_state_snapshots_update_event_id_fkey
  FOREIGN KEY (update_event_id) REFERENCES update_events(id) ON DELETE CASCADE;

-- component_updates.update_event_id -> ON DELETE CASCADE
ALTER TABLE component_updates
  DROP CONSTRAINT IF EXISTS component_updates_update_event_id_fkey;
ALTER TABLE component_updates
  ADD CONSTRAINT component_updates_update_event_id_fkey
  FOREIGN KEY (update_event_id) REFERENCES update_events(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. Fix FK constraint in documents table (from 009_documents_schema.sql)
-- ============================================================================

-- documents.category_id -> ON DELETE SET NULL (preserve doc if category removed)
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_category_id_fkey;
ALTER TABLE documents
  ADD CONSTRAINT documents_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. Fix FK constraint in api_keys table (from 023_api_keys_schema.sql)
-- ============================================================================

-- api_keys.created_by -> ON DELETE SET NULL (preserve key history if user removed)
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_created_by_fkey;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. Fix FK constraints in telegram_* tables (from 024_telegram_app_schema.sql)
-- ============================================================================

-- telegram_setup_sessions.user_id -> ON DELETE CASCADE
ALTER TABLE telegram_setup_sessions
  DROP CONSTRAINT IF EXISTS telegram_setup_sessions_user_id_fkey;
ALTER TABLE telegram_setup_sessions
  ADD CONSTRAINT telegram_setup_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;

-- telegram_notification_rules.user_id -> ON DELETE CASCADE
ALTER TABLE telegram_notification_rules
  DROP CONSTRAINT IF EXISTS telegram_notification_rules_user_id_fkey;
ALTER TABLE telegram_notification_rules
  ADD CONSTRAINT telegram_notification_rules_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;

-- telegram_bot_configs.user_id -> ON DELETE CASCADE
ALTER TABLE telegram_bot_configs
  DROP CONSTRAINT IF EXISTS telegram_bot_configs_user_id_fkey;
ALTER TABLE telegram_bot_configs
  ADD CONSTRAINT telegram_bot_configs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;

-- telegram_notification_history.user_id -> ON DELETE CASCADE
ALTER TABLE telegram_notification_history
  DROP CONSTRAINT IF EXISTS telegram_notification_history_user_id_fkey;
ALTER TABLE telegram_notification_history
  ADD CONSTRAINT telegram_notification_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;

-- ============================================================================
-- 5. Add missing composite indexes for performance
-- ============================================================================

-- Chat messages: queries filter by conversation_id + order by created_at
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON chat_messages(conversation_id, created_at DESC);

-- Documents: queries filter by space_id for RAG
CREATE INDEX IF NOT EXISTS idx_documents_space_id
  ON documents(space_id);

-- Documents: queries filter by status + order by uploaded_at
CREATE INDEX IF NOT EXISTS idx_documents_status_uploaded
  ON documents(status, uploaded_at DESC);

COMMIT;
