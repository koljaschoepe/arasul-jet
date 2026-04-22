/**
 * Unit tests for utils/jwt.js
 *
 * Covers token generation, verification (including the in-memory cache and
 * activity throttle), blacklisting (single + mass), session listing, and
 * cleanup. The module exits on missing JWT_SECRET, so the env is set before
 * require and resetModules() is used to exercise the startup guard.
 */

// Mock DB and logger before each test group requires the module so the
// JWT_SECRET guard at module load does not call process.exit for real.
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const TEST_SECRET = 'test-secret-key-for-jwt-testing-minimum-32-chars';

describe('jwt', () => {
  const originalSecret = process.env.JWT_SECRET;
  let db;
  let jwtUtils;
  let jsonwebtoken;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.JWT_EXPIRY = '4h';
    db = require('../../src/database');
    db.query.mockReset();
    jwtUtils = require('../../src/utils/jwt');
    jsonwebtoken = require('jsonwebtoken');
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  // ---------------------------------------------------------------------------
  // generateToken
  // ---------------------------------------------------------------------------
  describe('generateToken', () => {
    test('signs a token with expected payload and inserts an active session', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const user = { id: 42, username: 'alice' };
      const result = await jwtUtils.generateToken(user, '10.0.0.1', 'jest-agent');

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('expiresIn', '4h');

      const decoded = jsonwebtoken.verify(result.token, TEST_SECRET);
      expect(decoded.userId).toBe(42);
      expect(decoded.username).toBe('alice');
      expect(decoded.type).toBe('access');
      expect(decoded.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(decoded.iss).toBe('arasul-platform');

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO active_sessions/);
      expect(params[0]).toBe(42);
      expect(params[1]).toBe(decoded.jti);
      expect(params[2]).toBe('10.0.0.1');
      expect(params[3]).toBe('jest-agent');
      expect(params[4]).toBeInstanceOf(Date);
    });

    test('wraps underlying DB errors as "Token generation failed"', async () => {
      db.query.mockRejectedValue(new Error('db down'));
      await expect(
        jwtUtils.generateToken({ id: 1, username: 'bob' }, '127.0.0.1', 'ua')
      ).rejects.toThrow('Token generation failed');
    });
  });

  // ---------------------------------------------------------------------------
  // verifyToken — signature / expiry / blacklist / session
  // ---------------------------------------------------------------------------
  describe('verifyToken', () => {
    function signToken(overrides = {}, options = {}) {
      return jsonwebtoken.sign(
        {
          userId: 1,
          username: 'alice',
          jti: 'jti-' + Math.random().toString(36).slice(2),
          type: 'access',
          ...overrides
        },
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '1h', issuer: 'arasul-platform', ...options }
      );
    }

    test('happy path: not blacklisted + session present → returns decoded payload', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (sql.includes('active_sessions')) return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      const token = signToken();
      const decoded = await jwtUtils.verifyToken(token);
      expect(decoded.username).toBe('alice');
      expect(decoded.userId).toBe(1);
    });

    test('blacklisted token is rejected', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [{ id: 7 }] });
        return Promise.resolve({ rows: [] });
      });
      await expect(jwtUtils.verifyToken(signToken())).rejects.toThrow('Token is blacklisted');
    });

    test('missing session is rejected', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (sql.includes('active_sessions')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });
      await expect(jwtUtils.verifyToken(signToken())).rejects.toThrow(
        'Session not found or expired'
      );
    });

    test('expired token surfaces as "Token expired"', async () => {
      const expired = signToken({}, { expiresIn: '-1h' });
      await expect(jwtUtils.verifyToken(expired)).rejects.toThrow('Token expired');
    });

    test('bad signature surfaces as "Invalid token"', async () => {
      const bad = jsonwebtoken.sign({ jti: 'x' }, 'different-secret-also-32-chars-or-longer', {
        algorithm: 'HS256',
        issuer: 'arasul-platform',
        expiresIn: '1h'
      });
      await expect(jwtUtils.verifyToken(bad)).rejects.toThrow('Invalid token');
    });

    test('second verification in cache window skips blacklist+session DB calls', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (sql.includes('active_sessions')) return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      const countHeavy = () =>
        db.query.mock.calls.filter(
          ([sql]) => sql.includes('token_blacklist') || sql.includes('FROM active_sessions')
        ).length;

      const token = signToken();
      await jwtUtils.verifyToken(token);
      const heavyAfterFirst = countHeavy();
      expect(heavyAfterFirst).toBe(2);

      await jwtUtils.verifyToken(token);
      expect(countHeavy()).toBe(heavyAfterFirst);
    });

    test('activity update is throttled on cached verifies', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (sql.includes('active_sessions')) return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      const token = signToken();
      await jwtUtils.verifyToken(token);
      await jwtUtils.verifyToken(token);
      await jwtUtils.verifyToken(token);

      const activityCalls = db.query.mock.calls.filter(([sql]) =>
        sql.includes('update_session_activity')
      );
      expect(activityCalls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // blacklistToken
  // ---------------------------------------------------------------------------
  describe('blacklistToken', () => {
    test('inserts into blacklist and deletes session', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const token = jsonwebtoken.sign(
        { userId: 1, username: 'alice', jti: 'jti-abc' },
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '1h', issuer: 'arasul-platform' }
      );
      await expect(jwtUtils.blacklistToken(token)).resolves.toBe(true);

      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls[0][0]).toMatch(/INSERT INTO token_blacklist/);
      expect(db.query.mock.calls[0][1]).toEqual([
        'jti-abc',
        1,
        expect.any(Date)
      ]);
      expect(db.query.mock.calls[1][0]).toMatch(/DELETE FROM active_sessions/);
      expect(db.query.mock.calls[1][1]).toEqual(['jti-abc']);
    });

    test('rejects malformed token as "Token blacklisting failed"', async () => {
      await expect(jwtUtils.blacklistToken('not-a-jwt')).rejects.toThrow(
        'Token blacklisting failed'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // blacklistAllUserTokens
  // ---------------------------------------------------------------------------
  describe('blacklistAllUserTokens', () => {
    test('blacklists every active session then deletes them', async () => {
      const sessions = [
        { token_jti: 'jti-1', expires_at: new Date() },
        { token_jti: 'jti-2', expires_at: new Date() },
        { token_jti: 'jti-3', expires_at: new Date() }
      ];

      db.query.mockImplementation((sql) => {
        if (sql.includes('SELECT token_jti')) return Promise.resolve({ rows: sessions });
        return Promise.resolve({ rows: [] });
      });

      await expect(jwtUtils.blacklistAllUserTokens(99)).resolves.toBe(true);

      const inserts = db.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO token_blacklist')
      );
      expect(inserts).toHaveLength(3);
      expect(inserts.map((c) => c[1][0])).toEqual(['jti-1', 'jti-2', 'jti-3']);

      const deletes = db.query.mock.calls.filter(([sql]) =>
        sql.includes('DELETE FROM active_sessions WHERE user_id')
      );
      expect(deletes).toHaveLength(1);
      expect(deletes[0][1]).toEqual([99]);
    });

    test('no-op delete when user has zero active sessions', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('SELECT token_jti')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      await expect(jwtUtils.blacklistAllUserTokens(42)).resolves.toBe(true);

      const inserts = db.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO token_blacklist')
      );
      expect(inserts).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getUserSessions
  // ---------------------------------------------------------------------------
  describe('getUserSessions', () => {
    test('returns rows from active_sessions for the user', async () => {
      const rows = [{ token_jti: 'jti-1' }, { token_jti: 'jti-2' }];
      db.query.mockResolvedValue({ rows });
      await expect(jwtUtils.getUserSessions(7)).resolves.toEqual(rows);
      expect(db.query.mock.calls[0][1]).toEqual([7]);
    });

    test('rethrows as "Failed to get user sessions" on DB error', async () => {
      db.query.mockRejectedValue(new Error('connection reset'));
      await expect(jwtUtils.getUserSessions(1)).rejects.toThrow('Failed to get user sessions');
    });
  });

  // ---------------------------------------------------------------------------
  // cleanupExpiredAuth
  // ---------------------------------------------------------------------------
  describe('cleanupExpiredAuth', () => {
    test('calls the cleanup_expired_auth_data() SQL function', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await jwtUtils.cleanupExpiredAuth();
      expect(db.query).toHaveBeenCalledWith('SELECT cleanup_expired_auth_data()');
    });

    test('swallows DB errors (does not throw)', async () => {
      db.query.mockRejectedValue(new Error('transient'));
      await expect(jwtUtils.cleanupExpiredAuth()).resolves.toBeUndefined();
    });
  });
});
