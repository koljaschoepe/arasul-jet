/**
 * database.js — retry-safety heuristic (isStatementReadOnly)
 *
 * Guards the fix for the "retry re-runs non-idempotent writes" finding: after an
 * ambiguous mid-flight connection drop, only genuinely read-only statements may
 * be retried. This heuristic MUST err on the safe side — a write must never be
 * classified as read-only.
 */

// database.js starts a leak-check interval and a pool; mock pg so requiring it
// doesn't open real connections.
jest.mock('pg', () => {
    const mPool = {
        on: jest.fn(),
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { isStatementReadOnly } = require('../../src/database');

describe('isStatementReadOnly', () => {
    test.each([
        'SELECT * FROM users WHERE id = $1',
        '  select 1',
        'SELECT id, name FROM documents',
        'SHOW server_version',
        'EXPLAIN SELECT * FROM chat_messages',
        '-- a comment\nSELECT * FROM t',
    ])('read-only: %s', (sql) => {
        expect(isStatementReadOnly(sql)).toBe(true);
    });

    test.each([
        'INSERT INTO chat_messages (content) VALUES ($1)',
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        'DELETE FROM sessions WHERE id = $1',
        'SELECT record_login_attempt($1, $2)',          // function with side effects
        'SELECT get_next_queue_position()',
        'SELECT nextval($1)',
        'WITH moved AS (INSERT INTO a SELECT * FROM b RETURNING *) SELECT * FROM moved',
        'CALL do_maintenance()',
        'TRUNCATE audit_log',
        'CREATE TABLE t (id int)',
    ])('NOT read-only: %s', (sql) => {
        expect(isStatementReadOnly(sql)).toBe(false);
    });

    test('non-string input is not read-only', () => {
        expect(isStatementReadOnly(undefined)).toBe(false);
        expect(isStatementReadOnly(null)).toBe(false);
    });
});
