-- 048: Fix project_id constraint conflict
-- Problem: 042 defined ON DELETE SET NULL, 043 added NOT NULL.
-- When a project is deleted, SET NULL would violate NOT NULL.
-- Fix: Change to ON DELETE RESTRICT (backend handles reassignment before delete).

-- Drop the old foreign key and recreate with RESTRICT
DO $$
BEGIN
  -- Find and drop the existing FK constraint on project_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'chat_conversations'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.column_name = 'id'
      AND ccu.table_name = 'projects'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE chat_conversations DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'chat_conversations'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'project_id'
      LIMIT 1
    );
  END IF;
END $$;

-- Recreate with ON DELETE RESTRICT (safe: backend reassigns conversations before deleting project)
ALTER TABLE chat_conversations
  ADD CONSTRAINT fk_conversations_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
