/**
 * Auth Mock Helper
 *
 * Provides unified authentication mocking utilities for all tests.
 * This eliminates inconsistent auth mock strategies across test files.
 *
 * Usage:
 *   const { setupAuthMocks, generateTestToken, mockUser } = require('../helpers/authMock');
 *
 *   beforeEach(() => {
 *     setupAuthMocks(db);
 *   });
 *
 *   test('protected route', async () => {
 *     const token = generateTestToken();
 *     const response = await request(app)
 *       .get('/api/protected')
 *       .set('Authorization', `Bearer ${token}`);
 *   });
 */

const jwt = require('jsonwebtoken');

// Test JWT secret - must match jest.setup.js
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

// Default mock user
const mockUser = {
  id: 1,
  username: 'admin',
  email: 'admin@arasul.local',
  is_active: true
};

// Default mock session
const mockSession = {
  id: 1,
  user_id: 1,
  token_jti: 'test-jti-12345',
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
};

/**
 * Generate a valid JWT token for testing
 *
 * @param {Object} overrides - Override default token payload
 * @param {Object} options - JWT sign options
 * @returns {string} JWT token
 */
function generateTestToken(overrides = {}, options = {}) {
  const payload = {
    userId: mockUser.id,
    username: mockUser.username,
    jti: 'test-jti-12345',
    type: 'access',
    ...overrides
  };

  return jwt.sign(payload, TEST_JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'arasul-platform',
    subject: String(payload.userId),
    ...options
  });
}

/**
 * Generate an expired JWT token for testing
 *
 * @param {Object} overrides - Override default token payload
 * @returns {string} Expired JWT token
 */
function generateExpiredToken(overrides = {}) {
  return generateTestToken(overrides, { expiresIn: '-1h' });
}

/**
 * Setup auth mocks using query pattern matching (not order-dependent)
 *
 * This function sets up db.query mock to respond based on query content
 * rather than call order, making tests more robust.
 *
 * Auth Flow (4 database queries):
 * 1. jwt.js verifyToken() -> blacklist check (token_blacklist)
 * 2. jwt.js verifyToken() -> session check (active_sessions SELECT)
 * 3. jwt.js verifyToken() -> update activity (update_session_activity)
 * 4. auth.js requireAuth() -> user lookup (admin_users)
 *
 * @param {Object} db - Mocked database module
 * @param {Object} options - Configuration options
 * @param {Object} options.user - User to return (default: mockUser)
 * @param {boolean} options.blacklisted - Whether token is blacklisted (default: false)
 * @param {boolean} options.sessionExists - Whether session exists (default: true)
 * @param {boolean} options.userActive - Whether user is active (default: true)
 */
function setupAuthMocks(db, options = {}) {
  const {
    user = mockUser,
    blacklisted = false,
    sessionExists = true,
    userActive = true
  } = options;

  const effectiveUser = user ? { ...user, is_active: userActive } : null;

  db.query.mockImplementation((query, params) => {
    // 1. Blacklist Check (jwt.js verifyToken)
    if (query.includes('token_blacklist')) {
      return Promise.resolve({
        rows: blacklisted ? [{ id: 1 }] : []
      });
    }

    // 2. Session Check (jwt.js verifyToken)
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({
        rows: sessionExists ? [mockSession] : []
      });
    }

    // 3. Session Activity Update (jwt.js verifyToken)
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }

    // 4. User Lookup (auth.js requireAuth)
    if (query.includes('admin_users')) {
      return Promise.resolve({
        rows: effectiveUser ? [effectiveUser] : []
      });
    }

    // Default: return empty result
    return Promise.resolve({ rows: [] });
  });
}

/**
 * Setup auth mocks for order-dependent tests (legacy support)
 *
 * Use this when you need to verify specific query calls in order.
 * For most tests, prefer setupAuthMocks() instead.
 *
 * @param {Object} db - Mocked database module
 * @param {Object} options - Configuration options
 */
function setupAuthMocksSequential(db, options = {}) {
  const {
    user = mockUser,
    blacklisted = false,
    sessionExists = true,
    userActive = true
  } = options;

  const effectiveUser = user ? { ...user, is_active: userActive } : null;

  // Clear any existing mocks
  db.query.mockReset();

  // 1. Blacklist check
  db.query.mockResolvedValueOnce({
    rows: blacklisted ? [{ id: 1 }] : []
  });

  // 2. Session check
  db.query.mockResolvedValueOnce({
    rows: sessionExists ? [mockSession] : []
  });

  // 3. Update session activity
  db.query.mockResolvedValueOnce({ rows: [] });

  // 4. User lookup
  db.query.mockResolvedValueOnce({
    rows: effectiveUser ? [effectiveUser] : []
  });
}

/**
 * Setup mocks for login flow
 *
 * Login flow (4 database queries):
 * 1. Rate limit check (failed_login_attempts)
 * 2. User lookup with password (admin_users)
 * 3. Session creation (active_sessions INSERT)
 * 4. Optional: cleanup/other
 *
 * @param {Object} db - Mocked database module
 * @param {string} passwordHash - Bcrypt hash of password
 * @param {Object} options - Configuration options
 */
function setupLoginMocks(db, passwordHash, options = {}) {
  const {
    user = mockUser,
    accountLocked = false,
    rateLimited = false
  } = options;

  db.query.mockReset();

  // 1. Rate limit / lock check
  db.query.mockResolvedValueOnce({
    rows: [{ locked: accountLocked || rateLimited }]
  });

  // 2. User lookup with password
  db.query.mockResolvedValueOnce({
    rows: user ? [{ ...user, password_hash: passwordHash }] : []
  });

  // 3. Session creation (INSERT)
  db.query.mockResolvedValueOnce({ rows: [] });

  // 4. Any additional queries
  db.query.mockResolvedValueOnce({ rows: [] });
}

/**
 * Setup mocks for logout flow
 *
 * @param {Object} db - Mocked database module
 */
function setupLogoutMocks(db) {
  db.query.mockImplementation((query) => {
    // Blacklist insert
    if (query.includes('token_blacklist') && query.includes('INSERT')) {
      return Promise.resolve({ rows: [] });
    }

    // Session delete
    if (query.includes('active_sessions') && query.includes('DELETE')) {
      return Promise.resolve({ rows: [] });
    }

    // Auth checks (for the logout endpoint itself)
    if (query.includes('token_blacklist') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [] });
    }

    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }

    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }

    if (query.includes('admin_users')) {
      return Promise.resolve({ rows: [mockUser] });
    }

    return Promise.resolve({ rows: [] });
  });
}

/**
 * Create a mock auth middleware for route tests
 *
 * Use this when you want to bypass real auth entirely.
 * Useful for testing route logic in isolation.
 *
 * @param {Object} userOverrides - Override mock user properties
 * @returns {Function} Express middleware function
 */
function createMockAuthMiddleware(userOverrides = {}) {
  return (req, res, next) => {
    req.user = { ...mockUser, ...userOverrides };
    req.tokenData = {
      userId: req.user.id,
      username: req.user.username,
      jti: 'test-jti-12345',
      type: 'access'
    };
    next();
  };
}

/**
 * Setup mocks for password change flow
 *
 * Password change flow requires:
 * 1-4. Auth middleware queries (blacklist, session, activity, user)
 * 5. Password hash lookup for verification
 * 6. Password update query (if successful)
 *
 * @param {Object} db - Mocked database module
 * @param {string} passwordHash - Bcrypt hash of the current password
 * @param {Object} options - Configuration options
 */
function setupPasswordChangeMocks(db, passwordHash, options = {}) {
  const {
    user = mockUser,
    updateSuccess = true
  } = options;

  db.query.mockImplementation((query, params) => {
    // Auth middleware queries
    if (query.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    // User lookup from auth middleware - returns full user
    if (query.includes('admin_users') && query.includes('SELECT') && !query.includes('password_hash')) {
      return Promise.resolve({ rows: user ? [user] : [] });
    }
    // Password hash lookup - specific query for password_hash
    if (query.includes('password_hash') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [{ password_hash: passwordHash }] });
    }
    // Password update
    if (query.includes('admin_users') && query.includes('UPDATE')) {
      return Promise.resolve({ rowCount: updateSuccess ? 1 : 0 });
    }

    return Promise.resolve({ rows: [] });
  });
}

/**
 * Verify that auth was checked correctly
 *
 * @param {Object} db - Mocked database module
 * @param {Object} expectations - What to verify
 */
function verifyAuthChecks(db, expectations = {}) {
  const {
    blacklistChecked = true,
    sessionChecked = true,
    activityUpdated = true,
    userLookedUp = true
  } = expectations;

  const calls = db.query.mock.calls;

  if (blacklistChecked) {
    expect(calls.some(([q]) => q.includes('token_blacklist'))).toBe(true);
  }

  if (sessionChecked) {
    expect(calls.some(([q]) => q.includes('active_sessions') && q.includes('SELECT'))).toBe(true);
  }

  if (activityUpdated) {
    expect(calls.some(([q]) => q.includes('update_session_activity'))).toBe(true);
  }

  if (userLookedUp) {
    expect(calls.some(([q]) => q.includes('admin_users'))).toBe(true);
  }
}

module.exports = {
  // Constants
  TEST_JWT_SECRET,
  mockUser,
  mockSession,

  // Token generation
  generateTestToken,
  generateExpiredToken,

  // Mock setup (pattern-based - preferred)
  setupAuthMocks,
  setupLoginMocks,
  setupLogoutMocks,
  setupPasswordChangeMocks,

  // Mock setup (order-based - legacy)
  setupAuthMocksSequential,

  // Middleware mock (bypass auth)
  createMockAuthMiddleware,

  // Verification helpers
  verifyAuthChecks
};
