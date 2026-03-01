/**
 * Test Helpers for Backend Services
 *
 * Provides helper functions for testing Node.js/Express services with:
 * - Database mocking with transaction support
 * - Logger mocking
 * - Authenticated request factories
 * - Response mocking with status tracking
 */

/**
 * Creates a mock database pool with transaction support
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.queryResults - Map of query patterns to results
 * @param {boolean} options.shouldFail - Whether queries should fail
 * @returns {Object} Mock database pool
 */
function createMockDatabase(options = {}) {
  const { queryResults = {}, shouldFail = false } = options;

  const findQueryResult = (text) => {
    for (const [pattern, result] of Object.entries(queryResults)) {
      if (text.includes(pattern)) {
        return result;
      }
    }
    return { rows: [], rowCount: 0 };
  };

  const mockClient = {
    query: jest.fn((text, params) => {
      if (shouldFail) {
        return Promise.reject(new Error('Database error'));
      }
      return Promise.resolve(findQueryResult(text));
    }),
    release: jest.fn(),
  };

  const mockPool = {
    query: jest.fn((text, params) => {
      if (shouldFail) {
        return Promise.reject(new Error('Database error'));
      }
      return Promise.resolve(findQueryResult(text));
    }),
    connect: jest.fn(() => Promise.resolve(mockClient)),
    end: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  };

  // Transaction helpers
  mockPool.transaction = async (callback) => {
    const client = await mockPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return mockPool;
}

/**
 * Creates a mock logger with all Winston methods
 *
 * @returns {Object} Mock logger with info, warn, error, debug, http methods
 */
function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    log: jest.fn(),
    child: jest.fn(() => createMockLogger()),
    // For Winston stream logging
    stream: {
      write: jest.fn(),
    },
  };
}

/**
 * Creates an authenticated Express request object
 *
 * @param {Object} options - Request configuration
 * @param {Object} options.user - User data for req.user
 * @param {string} options.method - HTTP method
 * @param {Object} options.body - Request body
 * @param {Object} options.params - Route parameters
 * @param {Object} options.query - Query parameters
 * @param {Object} options.headers - Request headers
 * @returns {Object} Mock Express request object
 */
function createAuthenticatedRequest(options = {}) {
  const {
    user = { id: 1, username: 'testuser', role: 'admin' },
    method = 'GET',
    body = {},
    params = {},
    query = {},
    headers = {},
  } = options;

  return {
    user,
    method,
    body,
    params,
    query,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
      ...headers,
    },
    ip: '127.0.0.1',
    get: jest.fn((header) => headers[header.toLowerCase()]),
    cookies: {},
    session: { userId: user.id },
    // For file uploads
    file: null,
    files: [],
  };
}

/**
 * Creates a mock Express response object with status tracking
 *
 * @returns {Object} Mock Express response with status, json, send methods
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    headersSent: false,
    _headers: {},
    _data: null,
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res._data = data;
    res.headersSent = true;
    return res;
  });

  res.send = jest.fn((data) => {
    res._data = data;
    res.headersSent = true;
    return res;
  });

  res.set = jest.fn((header, value) => {
    res._headers[header] = value;
    return res;
  });

  res.setHeader = jest.fn((header, value) => {
    res._headers[header] = value;
    return res;
  });

  res.write = jest.fn();

  res.end = jest.fn(() => {
    res.headersSent = true;
  });

  res.redirect = jest.fn();

  res.cookie = jest.fn(() => res);

  res.clearCookie = jest.fn(() => res);

  // SSE helpers
  res.flush = jest.fn();

  // Get the response data
  res.getData = () => res._data;
  res.getStatus = () => res.statusCode;

  return res;
}

/**
 * Creates a mock Express next function
 *
 * @returns {Function} Mock next function that tracks calls
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Creates mock dependencies for service testing
 * Following the DI pattern used in services like llmQueueService.js
 *
 * @param {Object} overrides - Override specific dependencies
 * @returns {Object} Object with all common dependencies
 */
function createMockDependencies(overrides = {}) {
  return {
    database: createMockDatabase(),
    logger: createMockLogger(),
    fetch: jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    ),
    axios: {
      get: jest.fn(() => Promise.resolve({ data: {} })),
      post: jest.fn(() => Promise.resolve({ data: {} })),
      put: jest.fn(() => Promise.resolve({ data: {} })),
      delete: jest.fn(() => Promise.resolve({ data: {} })),
    },
    ...overrides,
  };
}

/**
 * Helper to test async route handlers
 *
 * @param {Function} handler - Express route handler
 * @param {Object} req - Request object (use createAuthenticatedRequest)
 * @param {Object} res - Response object (use createMockResponse)
 * @returns {Promise} Resolves when handler completes
 */
async function testRouteHandler(handler, req, res) {
  const next = createMockNext();
  await handler(req, res, next);
  return { res, next };
}

/**
 * Creates a test JWT token
 *
 * @param {Object} payload - Token payload
 * @param {string} secret - JWT secret (default: 'test-secret')
 * @returns {string} JWT token string
 */
function createTestToken(payload = {}, secret = 'test-secret') {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      userId: 1,
      username: 'testuser',
      ...payload,
    },
    secret,
    { expiresIn: '1h' }
  );
}

/**
 * Creates mock WebSocket connection
 *
 * @returns {Object} Mock WebSocket with send, close, on methods
 */
function createMockWebSocket() {
  const eventHandlers = {};

  return {
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
    }),
    emit: (event, data) => {
      if (eventHandlers[event]) {
        eventHandlers[event](data);
      }
    },
    readyState: 1, // OPEN
    OPEN: 1,
    CLOSED: 3,
  };
}

module.exports = {
  createMockDatabase,
  createMockLogger,
  createAuthenticatedRequest,
  createMockResponse,
  createMockNext,
  createMockDependencies,
  testRouteHandler,
  createTestToken,
  createMockWebSocket,
};
