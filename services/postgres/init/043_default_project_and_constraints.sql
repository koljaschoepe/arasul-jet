-- 043: Default Project and Constraints
-- Ensures every chat belongs to a project. Creates "Allgemein" as default.

-- 1. Add is_default column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- 2. Create "Allgemein" default project (idempotent)
INSERT INTO projects (name, description, icon, color, is_default)
SELECT 'Allgemein', 'Standard-Projekt fuer alle Chats', 'inbox', '#94A3B8', TRUE
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE is_default = TRUE);

-- 3. Migrate ungrouped chats to default project
UPDATE chat_conversations
SET project_id = (SELECT id FROM projects WHERE is_default = TRUE LIMIT 1)
WHERE project_id IS NULL;

-- 4. Set NOT NULL constraint (after migration)
ALTER TABLE chat_conversations ALTER COLUMN project_id SET NOT NULL;

-- 5. Index for recent chats query
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON chat_conversations(updated_at DESC)
WHERE deleted_at IS NULL;
