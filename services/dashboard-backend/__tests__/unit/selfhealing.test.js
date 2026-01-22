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
      // Mock auth middleware queries (handled by setupAuthMocks)
      // Then mock the route-specific queries
      db.query
        .mockImplementationOnce((query) => {
          // Auth: blacklist check
          if (query.includes('token_blacklist')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        })
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] })) // Session
        .mockImplementationOnce(() => Promise.resolve({ rows: [] })) // Activity
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] })) // User
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { id: 1, event_type: 'service_restart', severity: 'WARNING', timestamp: new Date() },
            { id: 2, event_type: 'disk_cleanup', severity: 'INFO', timestamp: new Date() }
          ]
        })) // Events query
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '2' }] })); // Count query

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
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] })) // Blacklist
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '0' }] }));

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
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '0' }] }));

      const response = await request(app)
        .get('/api/self-healing/events?event_type=service_restart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    test('should support pagination', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '50' }] }));

      const response = await request(app)
        .get('/api/self-healing/events?limit=10&offset=20')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('offset', 20);
    });
  });

  // ============================================================================
  // GET /api/self-healing/status
  // ============================================================================
  describe('GET /api/self-healing/status', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/status');

      expect(response.status).toBe(401);
    });

    test('should return self-healing status with healthy heartbeat', async () => {
      // Mock axios for heartbeat
      axios.get.mockResolvedValue({
        data: {
          healthy: true,
          seconds_since_heartbeat: 5,
          check_count: 100,
          last_action: 'disk_cleanup'
        }
      });

      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        // Statistics query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [{
            total_events: '50',
            info_count: '30',
            warning_count: '15',
            critical_count: '5',
            last_hour: '3',
            last_24h: '50'
          }]
        }))
        // Event types query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { event_type: 'service_restart', count: '10', last_occurrence: new Date() }
          ]
        }))
        // Recovery actions query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        // Service failures query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        // Last reboot query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }));

      const response = await request(app)
        .get('/api/self-healing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('overall_health');
      expect(response.body).toHaveProperty('heartbeat');
      expect(response.body).toHaveProperty('statistics');
      expect(response.body).toHaveProperty('common_event_types');
      expect(response.body).toHaveProperty('recent_recovery_actions');
      expect(response.body).toHaveProperty('service_failures');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should handle heartbeat failure gracefully', async () => {
      // Mock axios to fail
      axios.get.mockRejectedValue(new Error('Connection refused'));

      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({
          rows: [{
            total_events: '0',
            info_count: '0',
            warning_count: '0',
            critical_count: '0',
            last_hour: '0',
            last_24h: '0'
          }]
        }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }));

      const response = await request(app)
        .get('/api/self-healing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.heartbeat).toHaveProperty('healthy', false);
      expect(response.body.overall_health).toBe('CRITICAL');
    });
  });

  // ============================================================================
  // GET /api/self-healing/recovery-actions
  // ============================================================================
  describe('GET /api/self-healing/recovery-actions', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/recovery-actions');

      expect(response.status).toBe(401);
    });

    test('should return recovery actions', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { id: 1, action_type: 'restart_service', target: 'llm-service', success: true, timestamp: new Date() },
            { id: 2, action_type: 'clear_cache', target: 'docker', success: true, timestamp: new Date() }
          ]
        }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '2' }] }));

      const response = await request(app)
        .get('/api/self-healing/recovery-actions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('actions');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support pagination', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '100' }] }));

      const response = await request(app)
        .get('/api/self-healing/recovery-actions?limit=5&offset=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('limit', 5);
      expect(response.body).toHaveProperty('offset', 10);
    });
  });

  // ============================================================================
  // GET /api/self-healing/service-failures
  // ============================================================================
  describe('GET /api/self-healing/service-failures', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/service-failures');

      expect(response.status).toBe(401);
    });

    test('should return service failures', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { id: 1, service_name: 'llm-service', failure_reason: 'OOM', timestamp: new Date() }
          ]
        }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '1' }] }));

      const response = await request(app)
        .get('/api/self-healing/service-failures')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('failures');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('total');
    });

    test('should support filtering by service_name', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '0' }] }));

      const response = await request(app)
        .get('/api/self-healing/service-failures?service_name=llm-service')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // GET /api/self-healing/reboot-history
  // ============================================================================
  describe('GET /api/self-healing/reboot-history', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/reboot-history');

      expect(response.status).toBe(401);
    });

    test('should return reboot history', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { id: 1, reason: 'critical_disk_usage', initiated_by: 'self-healing-agent', timestamp: new Date() }
          ]
        }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ count: '1' }] }));

      const response = await request(app)
        .get('/api/self-healing/reboot-history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('reboots');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/self-healing/metrics
  // ============================================================================
  describe('GET /api/self-healing/metrics', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/self-healing/metrics');

      expect(response.status).toBe(401);
    });

    test('should return self-healing metrics', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        // Uptime query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { service_name: 'llm-service', failure_count: '2', downtime_seconds: '120', uptime_percent: '99.97' }
          ]
        }))
        // Recovery success query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { action_type: 'restart_service', successful: '8', failed: '2', success_rate: '80.00' }
          ]
        }))
        // Event trends query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            { date: '2026-01-22', total_events: '10', critical_events: '1', warning_events: '3' }
          ]
        }));

      const response = await request(app)
        .get('/api/self-healing/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('recovery_success_rates');
      expect(response.body).toHaveProperty('event_trends');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
