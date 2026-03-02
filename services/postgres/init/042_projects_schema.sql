-- 042: Projects Schema
-- Adds project system for grouping conversations with system prompts and knowledge spaces

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT DEFAULT '',
  icon VARCHAR(50) DEFAULT 'folder',
  color VARCHAR(7) DEFAULT '#45ADFF',
  knowledge_space_id UUID REFERENCES knowledge_spaces(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link conversations to projects
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_project ON chat_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, created_at DESC);
