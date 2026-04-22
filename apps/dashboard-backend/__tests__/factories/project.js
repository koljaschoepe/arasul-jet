const { nextId } = require('./_seq');

/**
 * projects row (user-scoped "workspace" for chats, system prompts, etc).
 */
function makeProject(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Project ${id}`,
    description: `Description for project ${id}`,
    system_prompt: 'You are a helpful assistant.',
    icon: 'folder',
    color: '#4F46E5',
    knowledge_space_id: null,
    is_default: false,
    user_id: 1,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * knowledge_spaces row (RAG corpus grouping referenced by projects and
 * documents via space_id).
 */
function makeKnowledgeSpace(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Space ${id}`,
    slug: `space-${id}`,
    description: `Knowledge space ${id}`,
    is_default: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

module.exports = { makeProject, makeKnowledgeSpace };
