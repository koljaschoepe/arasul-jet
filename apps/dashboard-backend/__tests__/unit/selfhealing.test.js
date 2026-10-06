/**
 * Unit tests for Self-Healing Routes
 *
 * Tests all self-healing endpoints:
 * - GET /api/self-healing/events
 * - GET /api/self-healing/status
 * - GET /api/self-healing/recovery-actions
 * - GET /api/self-healing/service-failures
 * - GET /api/self-healing/reboot-history
 * - GET /api/self-healing/metrics
 */

const request = require('supertest');

// Mock database module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock axios for heartbeat requests
jest.mock('axios', () => ({
  get: jest.fn()
}));

const db = require('../../src/database');
const axios = require('axios');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  setupAuthMocks,
  generateTestToken
} = require('../helpers/authMock');

/**
 * Helper to create a pattern-based mock that handles both auth and route queries.
 * This avoids issues with JWT token caching causing sequential mocks to misalign.
 */
function mockWithRouteQueries(routeHandler) {
  db.query.mockImplementation((query, params) => {
    // Auth queries (pattern matching)
    if (query.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (query.includes('active_sessions') && query.includes('SELECT')) return Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] });
    if (query.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (query.includes('admin_users')) return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin', is_active: true }] });
    // Delegate to route-specific handler
    return routeHandler(query, params);
  });
}

describe('Self-Healing Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/self-healing/events
  // ============================================================================
  describe('GET /api/self-healing/events', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/events');

      expect(response.status).toBe(401);
    });

    test('should return self-healing events', async () => {
      mockWithRouteQueries((query) => {
        if (query.includes('self_healing_events') && query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '2' }] });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({
            rows: [
              { id: 1, event_type: 'service_restart', severity: 'WARNING', timestamp: new Date() },
              { id: 2, event_type: 'disk_cleanup', severity: 'INFO', timestamp: new Date() }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/self-healing/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by severity', async () => {
      mockWithRouteQueries((query) => {
        if (query.includes('self_healing_events') && query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/self-healing/events?severity=CRITICAL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Verify the query includes severity filter
      const queryCalls = db.query.mock.calls;
      const eventsQuery = queryCalls.find(([q]) => q.includes('self_healing_events') && q.includes('severity'));
      expect(eventsQuery).toBeDefined();
    });

    test('should support filtering by event_type', async () => {
      mockWithRouteQueries((query) => {
        if (query.includes('self_healing_events') && query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/self-healing/events?event_type=service_restart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    test('should support pagination', async () => {
      mockWithRouteQueries((query) => {
        if (query.includes('self_healing_events') && query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '50' }] });
        }
        if (query.includes('self_healing_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/self-healing/events?limit=10&offset=20')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('offset', 20);
    });
  });

});
