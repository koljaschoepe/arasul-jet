const { nextId } = require('./_seq');

/**
 * Build an admin_users row. Password hash is only included when asked for,
 * since most tests explicitly avoid handling credentials.
 */
function makeUser(overrides = {}) {
  const id = overrides.id ?? nextId();
  return {
    id,
    username: `user${id}`,
    email: `user${id}@arasul.local`,
    role: 'admin',
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAdmin(overrides = {}) {
  return makeUser({ role: 'admin', ...overrides });
}

function makeViewer(overrides = {}) {
  return makeUser({ role: 'viewer', ...overrides });
}

function makeInactiveUser(overrides = {}) {
  return makeUser({ is_active: false, ...overrides });
}

module.exports = { makeUser, makeAdmin, makeViewer, makeInactiveUser };
