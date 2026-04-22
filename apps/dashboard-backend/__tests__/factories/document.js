const { nextId } = require('./_seq');
const crypto = require('crypto');

/**
 * documents row.
 */
function makeDocument(overrides = {}) {
  const id = overrides.id ?? nextId();
  const uuid = overrides.uuid ?? `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
  const contentHash = overrides.content_hash ?? crypto
    .createHash('sha256')
    .update(`doc-${id}`)
    .digest('hex');
  return {
    id: uuid,
    filename: `doc-${id}.pdf`,
    original_filename: `doc-${id}.pdf`,
    file_path: `/storage/documents/${uuid}.pdf`,
    file_size: 4096,
    mime_type: 'application/pdf',
    file_extension: 'pdf',
    content_hash: contentHash,
    file_hash: contentHash,
    status: 'processed',
    uploaded_by: 1,
    space_id: overrides.space_id ?? 1,
    title: `Document ${id}`,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

module.exports = { makeDocument };
