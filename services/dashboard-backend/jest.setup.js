/**
 * Jest Setup File
 * Global configuration and hooks for all tests
 *
 * This file is run before each test file via setupFilesAfterEnv in package.json
 */

// ============================================================================
// Environment Variables
// ============================================================================

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-minimum-32-chars';
process.env.JWT_EXPIRY = '24h';
process.env.ADMIN_PASSWORD = 'test-admin-password';

// Database
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';
process.env.POSTGRES_DB = 'test_db';

// Services
process.env.LLM_SERVICE_HOST = 'localhost';
process.env.LLM_SERVICE_PORT = '11434';
process.env.EMBEDDING_SERVICE_HOST = 'localhost';
process.env.EMBEDDING_SERVICE_PORT = '11435';
process.env.QDRANT_HOST = 'localhost';
process.env.QDRANT_PORT = '6333';

// Storage
process.env.MINIO_HOST = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ROOT_USER = 'test';
process.env.MINIO_ROOT_PASSWORD = 'test-password';

// Additional settings for tests
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.RATE_LIMIT_ENABLED = 'false'; // Disable rate limiting in tests

// ============================================================================
// Global Test Timeout
// ============================================================================

jest.setTimeout(10000); // 10 seconds default timeout

// ============================================================================
// Global Hooks
// ============================================================================

/**
 * Reset all mocks before each test
 * This ensures test isolation
 */
beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Cleanup after each test
 * Run any registered cleanup functions
 */
afterEach(() => {
  // Run any registered cleanup functions
  if (global.__testCleanupFunctions && global.__testCleanupFunctions.length > 0) {
    global.__testCleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    global.__testCleanupFunctions = [];
  }
});

/**
 * Cleanup after all tests in a file
 */
afterAll(() => {
  // Clear any remaining timers
  jest.clearAllTimers();

  // Clear cleanup functions
  global.__testCleanupFunctions = [];
});

// ============================================================================
// Global Test Utilities
// ============================================================================

/**
 * Register a cleanup function to run after the current test
 * Useful for cleaning up resources created during a test
 *
 * @param {Function} fn - Cleanup function to run
 */
global.registerTestCleanup = (fn) => {
  if (!global.__testCleanupFunctions) {
    global.__testCleanupFunctions = [];
  }
  global.__testCleanupFunctions.push(fn);
};

/**
 * Wait for a condition to be true
 * Useful for testing async operations without arbitrary delays
 *
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in ms (default: 5000)
 * @param {number} interval - Check interval in ms (default: 50)
 * @returns {Promise<void>}
 */
global.waitFor = async (condition, timeout = 5000, interval = 50) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
};

/**
 * Create a deferred promise for testing async flows
 * Returns an object with { promise, resolve, reject }
 *
 * @returns {Object} Deferred object
 */
global.createDeferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// ============================================================================
// Console Warning Suppression (Optional)
// ============================================================================

// Suppress specific console warnings during tests if needed
const originalConsoleError = console.error;
console.error = (...args) => {
  // Suppress known harmless warnings
  const message = args[0];
  if (typeof message === 'string') {
    // Suppress "Warning: An update to X inside a test was not wrapped in act(...)"
    if (message.includes('not wrapped in act')) return;
    // Suppress pg pool warnings about connection
    if (message.includes('Connection terminated')) return;
  }
  originalConsoleError.apply(console, args);
};

// ============================================================================
// Mock Service Reset Registry
// ============================================================================

/**
 * Registry for service reset functions
 * Services can register their reset functions here for cleanup between tests
 */
global.__serviceResetRegistry = new Map();

/**
 * Register a service reset function
 * Call this from services that have internal state
 *
 * @param {string} name - Service name
 * @param {Function} resetFn - Function to reset service state
 */
global.registerServiceReset = (name, resetFn) => {
  global.__serviceResetRegistry.set(name, resetFn);
};

/**
 * Reset all registered services
 * Call this in afterEach if you need to reset service state
 */
global.resetAllServices = () => {
  global.__serviceResetRegistry.forEach((resetFn, name) => {
    try {
      resetFn();
    } catch (e) {
      console.warn(`Failed to reset service ${name}:`, e.message);
    }
  });
};
