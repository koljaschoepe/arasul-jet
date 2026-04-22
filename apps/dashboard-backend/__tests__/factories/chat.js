const { nextId } = require('./_seq');

/**
 * chat_conversations row.
 */
function makeChat(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: `Conversation ${id}`,
    user_id: 1,
    project_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * chat_messages row. Role defaults to 'user'; pass role: 'assistant' for
 * the other common case.
 */
function makeMessage(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    conversation_id: overrides.conversation_id ?? 1,
    role: 'user',
    content: `Message ${id} content`,
    thinking: null,
    status: 'completed',
    job_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * chat_attachments row (document pinned to a chat message).
 */
function makeAttachment(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    message_id: overrides.message_id ?? 1,
    filename: `doc-${id}.pdf`,
    mime_type: 'application/pdf',
    file_size: 1024,
    extracted_chars: 500,
    truncated: false,
    extraction_status: 'completed',
    object_key: `attachments/${id}`,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

module.exports = { makeChat, makeMessage, makeAttachment };
