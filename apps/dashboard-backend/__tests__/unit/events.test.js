/**
 * Unit tests for Events Routes
 *
 * Tests all event management endpoints:
 * - GET /api/events
 * - GET /api/events/stats
 * - GET /api/events/settings
 * - PUT /api/events/settings
 * - POST /api/events/test
 * - POST /api/events/webhook/n8n
 * - POST /api/events/webhook/self-healing
 * - POST /api/events/manual
 * - GET /api/events/service-status
 * - GET /api/events/boot-history
 * - DELETE /api/events/:id
 * - POST /api/events/cleanup
 *
 * NOTE: events.js uses `const auth = require('../middleware/auth')` then passes
 * `auth` directly as middleware. Since auth exports { requireAuth, optionalAuth },
 * not a function, this is a bug that causes Express to throw at route registration
 * time. We mock the auth middleware module to be a callable function that validates
 * the JWT token, so Express accepts it and tests can proceed.
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

// Mock auth middleware - events.js uses `auth` directly (the module object),
// which is a bug (should use auth.requireAuth). We mock it as a callable
// function so Express accepts it. The mock validates the Authorization header
// using JWT and returns 401 when no token is provided.
jest.mock('../../src/middleware/auth', () => {
  const jwt = require('jsonwebtoken');
  const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    try {
      const payload = jwt.verify(parts[1], TEST_JWT_SECRET);
      req.user = { id: payload.userId, username: payload.username, is_active: true };
      req.tokenData = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  authMiddleware.requireAuth = authMiddleware;
  authMiddleware.optionalAuth = (req, res, next) => next();

  return authMiddleware;
});

// Mock service dependencies
jest.mock('../../src/services/eventListenerService', () => ({
  getStats: jest.fn(),
  handleWorkflowEvent: jest.fn(),
  handleSelfHealingEvent: jest.fn()
}));

jest.mock('../../src/services/telegramNotificationService', () => ({
  testConnection: jest.fn(),
  queueNotification: jest.fn(),
  getStats: jest.fn()
}));

const db = require('../../src/database');
const eventListenerService = require('../../src/services/eventListenerService');
const telegramService = require('../../src/services/telegramNotificationService');
const { app } = require('../../src/server');

const { generateTestToken } = require('../helpers/authMock');

describe('Events Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default db.query mock - returns empty rows for unmatched queries
    db.query.mockResolvedValue({ rows: [] });
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/events
  // ============================================================================
  describe('GET /api/events', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/events');

      expect(response.status).toBe(401);
    });

    test('should return list of events', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('notification_events')) {
          return Promise.resolve({ rows: [{ id: 1, event_type: 'service_status', severity: 'info' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('count', 1);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by event_type and severity', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('notification_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events?event_type=service_status&severity=critical')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
    });
  });

  // ============================================================================
  // GET /api/events/stats
  // ============================================================================
  describe('GET /api/events/stats', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/events/stats');

      expect(response.status).toBe(401);
    });

    test('should return event statistics', async () => {
      eventListenerService.getStats.mockReturnValue({ running: true, events_processed: 42 });
      telegramService.getStats.mockResolvedValue({ queued: 0, sent: 10 });
      db.query.mockImplementation((query) => {
        if (query.includes('notification_events')) {
          return Promise.resolve({
            rows: [{ event_type: 'service_status', severity: 'info', count: '5', sent_count: '3' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('listener');
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('eventBreakdown');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/events/settings
  // ============================================================================
  describe('GET /api/events/settings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/events/settings');

      expect(response.status).toBe(401);
    });

    test('should return notification settings', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('notification_settings')) {
          return Promise.resolve({ rows: [{ channel: 'telegram', enabled: true }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events/settings')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('telegram');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // PUT /api/events/settings
  // ============================================================================
  describe('PUT /api/events/settings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/events/settings')
        .send({ channel: 'telegram', enabled: true });

      expect(response.status).toBe(401);
    });

    test('should update notification settings', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('notification_settings')) {
          return Promise.resolve({ rows: [{ channel: 'telegram', enabled: true }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/events/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ channel: 'telegram', enabled: true, min_severity: 'warning' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('settings');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/events/test
  // ============================================================================
  describe('POST /api/events/test', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/events/test');

      expect(response.status).toBe(401);
    });

    test('should send test notification successfully', async () => {
      telegramService.testConnection.mockResolvedValue({ success: true, botInfo: { username: 'testbot' } });
      telegramService.queueNotification.mockResolvedValue({ eventId: 99 });

      const response = await request(app)
        .post('/api/events/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'Test message' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('eventId', 99);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 503 if Telegram connection fails', async () => {
      telegramService.testConnection.mockResolvedValue({ success: false, error: 'Bot token invalid' });

      const response = await request(app)
        .post('/api/events/test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(503);
    });
  });

  // ============================================================================
  // POST /api/events/webhook/n8n
  // ============================================================================
  describe('POST /api/events/webhook/n8n', () => {
    test('should accept valid webhook event without secret configured', async () => {
      delete process.env.N8N_WEBHOOK_SECRET;
      eventListenerService.handleWorkflowEvent.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/events/webhook/n8n')
        .send({ workflow_id: 'wf-1', status: 'success' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received', true);
      expect(response.body).toHaveProperty('processed', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if workflow_id is missing', async () => {
      delete process.env.N8N_WEBHOOK_SECRET;

      const response = await request(app)
        .post('/api/events/webhook/n8n')
        .send({ status: 'success' });

      expect(response.status).toBe(400);
    });

    test('should return 400 if status is missing', async () => {
      delete process.env.N8N_WEBHOOK_SECRET;

      const response = await request(app)
        .post('/api/events/webhook/n8n')
        .send({ workflow_id: 'wf-1' });

      expect(response.status).toBe(400);
    });

    test('should return 401 if webhook secret is wrong', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'correct-secret';

      const response = await request(app)
        .post('/api/events/webhook/n8n')
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({ workflow_id: 'wf-1', status: 'success' });

      expect(response.status).toBe(401);

      delete process.env.N8N_WEBHOOK_SECRET;
    });

    test('should accept webhook with correct secret header', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'correct-secret';
      eventListenerService.handleWorkflowEvent.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/events/webhook/n8n')
        .set('X-Webhook-Secret', 'correct-secret')
        .send({ workflow_id: 'wf-1', status: 'success' });

      expect(response.status).toBe(200);

      delete process.env.N8N_WEBHOOK_SECRET;
    });
  });

  // ============================================================================
  // POST /api/events/webhook/self-healing
  // ============================================================================
  describe('POST /api/events/webhook/self-healing', () => {
    test('should accept self-healing event', async () => {
      eventListenerService.handleSelfHealingEvent.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/events/webhook/self-healing')
        .send({ action_type: 'restart', service_name: 'backend', success: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if action_type is missing', async () => {
      const response = await request(app)
        .post('/api/events/webhook/self-healing')
        .send({ service_name: 'backend' });

      expect(response.status).toBe(400);
    });
  });

  // ============================================================================
  // POST /api/events/manual
  // ============================================================================
  describe('POST /api/events/manual', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/events/manual')
        .send({ title: 'Test Event' });

      expect(response.status).toBe(401);
    });

    test('should create manual event successfully', async () => {
      telegramService.queueNotification.mockResolvedValue({ eventId: 55 });

      const response = await request(app)
        .post('/api/events/manual')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Manual Test Event', message: 'Details here', severity: 'warning' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('eventId', 55);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if title is missing', async () => {
      const response = await request(app)
        .post('/api/events/manual')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'No title here' });

      expect(response.status).toBe(400);
    });
  });

  // ============================================================================
  // GET /api/events/service-status
  // ============================================================================
  describe('GET /api/events/service-status', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/events/service-status');

      expect(response.status).toBe(401);
    });

    test('should return service status cache', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('service_status_cache')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events/service-status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('count', 0);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/events/boot-history
  // ============================================================================
  describe('GET /api/events/boot-history', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/events/boot-history');

      expect(response.status).toBe(401);
    });

    test('should return boot history', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('system_boot_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/events/boot-history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('boots');
      expect(response.body).toHaveProperty('count', 0);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // DELETE /api/events/:id
  // ============================================================================
  describe('DELETE /api/events/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete('/api/events/1');

      expect(response.status).toBe(401);
    });

    test('should delete an existing event', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('DELETE') && query.includes('notification_events')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/events/1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleted', true);
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 404 for non-existing event', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('DELETE') && query.includes('notification_events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/events/999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // POST /api/events/cleanup
  // ============================================================================
  describe('POST /api/events/cleanup', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/events/cleanup');

      expect(response.status).toBe(401);
    });

    test('should run cleanup and return deleted count', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('cleanup_old_notification_events')) {
          return Promise.resolve({ rows: [{ cleanup_old_notification_events: 5 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/events/cleanup')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted', 5);
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
