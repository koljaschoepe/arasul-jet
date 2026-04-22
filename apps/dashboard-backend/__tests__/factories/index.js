/**
 * Test data factories.
 *
 * Each `makeX({ ...overrides })` returns a plain object shaped like a row
 * from the matching Postgres table. Use these in place of repeated inline
 * literals so tests read at the level of intent, not column names.
 *
 * Factories are for *data*, not mock infrastructure — jest.fn(), supertest
 * wiring, and db.query stubs live in testHelpers.js / helpers/authMock.js.
 */

module.exports = {
  ...require('./user'),
  ...require('./chat'),
  ...require('./document'),
  ...require('./bot'),
  ...require('./project'),
};
