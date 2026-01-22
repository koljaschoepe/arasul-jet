/**
 * Unit tests for Alert Routes
 *
 * Tests all alert management endpoints:
 * - GET /api/alerts/settings
 * - PUT /api/alerts/settings
 * - GET /api/alerts/thresholds
 * - PUT /api/alerts/thresholds/:metricType
 * - GET /api/alerts/quiet-hours
 * - PUT /api/alerts/quiet-hours/:dayOfWeek
 * - PUT /api/alerts/quiet-hours
 * - GET /api/alerts/history
 * - POST /api/alerts/history/:id/acknowledge
 * - POST /api/alerts/history/acknowledge-all
 * - GET /api/alerts/statistics
 * - POST /api/alerts/test-webhook
 * - POST /api/alerts/trigger-check
 * - GET /api/alerts/status
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

// Mock alertEngine service
jest.mock('../../src/services/alertEngine', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  getAllThresholds: jest.fn(),
  updateThreshold: jest.fn(),
  getQuietHours: jest.fn(),
  updateQuietHours: jest.fn(),
  getHistory: jest.fn(),
  acknowledgeAlert: jest.fn(),
  acknowledgeAll: jest.fn(),
  getStatistics: jest.fn(),
  testWebhook: jest.fn(),
  triggerCheck: jest.fn(),
  isInQuietHours: jest.fn()
}));

const db = require('../../src/database');
const alertEngine = require('../../src/services/alertEngine');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  setupAuthMocks,
  generateTestToken
} = require('../helpers/authMock');

describe('Alert Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/alerts/settings
  // ============================================================================
  describe('GET /api/alerts/settings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/settings');

      expect(response.status).toBe(401);
    });

    test('should return alert settings', async () => {
      const mockSettings = {
        alerts_enabled: true,
        webhook_enabled: false,
        in_app_notifications: true,
        email_notifications: false
      };
      alertEngine.getSettings.mockResolvedValue(mockSettings);

      const response = await request(app)
        .get('/api/alerts/settings')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alerts_enabled', true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // PUT /api/alerts/settings
  // ============================================================================
  describe('PUT /api/alerts/settings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/alerts/settings')
        .send({ alerts_enabled: false });

      expect(response.status).toBe(401);
    });

    test('should update alert settings', async () => {
      const updatedSettings = {
        alerts_enabled: false,
        webhook_enabled: true
      };
      alertEngine.updateSettings.mockResolvedValue(updatedSettings);

      const response = await request(app)
        .put('/api/alerts/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ alerts_enabled: false, webhook_enabled: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 for invalid settings', async () => {
      alertEngine.updateSettings.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/alerts/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ============================================================================
  // GET /api/alerts/thresholds
  // ============================================================================
  describe('GET /api/alerts/thresholds', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/thresholds');

      expect(response.status).toBe(401);
    });

    test('should return all thresholds', async () => {
      const mockThresholds = [
        { metric_type: 'cpu', warning_threshold: 80, critical_threshold: 95 },
        { metric_type: 'ram', warning_threshold: 85, critical_threshold: 95 },
        { metric_type: 'disk', warning_threshold: 80, critical_threshold: 90 },
        { metric_type: 'temperature', warning_threshold: 70, critical_threshold: 85 }
      ];
      alertEngine.getAllThresholds.mockResolvedValue(mockThresholds);

      const response = await request(app)
        .get('/api/alerts/thresholds')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('thresholds');
      expect(response.body.thresholds).toHaveLength(4);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // PUT /api/alerts/thresholds/:metricType
  // ============================================================================
  describe('PUT /api/alerts/thresholds/:metricType', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/alerts/thresholds/cpu')
        .send({ warning_threshold: 75, critical_threshold: 90 });

      expect(response.status).toBe(401);
    });

    test('should update CPU threshold', async () => {
      const updatedThreshold = {
        metric_type: 'cpu',
        warning_threshold: 75,
        critical_threshold: 90
      };
      alertEngine.updateThreshold.mockResolvedValue(updatedThreshold);

      const response = await request(app)
        .put('/api/alerts/thresholds/cpu')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ warning_threshold: 75, critical_threshold: 90 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('threshold');
      expect(response.body).toHaveProperty('message');
    });

    test('should return 400 for invalid metric type', async () => {
      const response = await request(app)
        .put('/api/alerts/thresholds/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ warning_threshold: 75, critical_threshold: 90 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Metrik-Typ');
    });

    test('should return 400 if warning >= critical', async () => {
      const response = await request(app)
        .put('/api/alerts/thresholds/cpu')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ warning_threshold: 95, critical_threshold: 80 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('kleiner');
    });

    test('should return 400 for out of range threshold', async () => {
      const response = await request(app)
        .put('/api/alerts/thresholds/cpu')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ warning_threshold: 150 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('100');
    });

    test('should return 404 if threshold not found', async () => {
      alertEngine.updateThreshold.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/alerts/thresholds/cpu')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ warning_threshold: 75 });

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/alerts/quiet-hours
  // ============================================================================
  describe('GET /api/alerts/quiet-hours', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/quiet-hours');

      expect(response.status).toBe(401);
    });

    test('should return quiet hours configuration', async () => {
      const mockQuietHours = [
        { day_of_week: 0, enabled: true, start_time: '22:00', end_time: '07:00' },
        { day_of_week: 1, enabled: false, start_time: null, end_time: null }
      ];
      alertEngine.getQuietHours.mockResolvedValue(mockQuietHours);

      const response = await request(app)
        .get('/api/alerts/quiet-hours')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quiet_hours');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // PUT /api/alerts/quiet-hours/:dayOfWeek
  // ============================================================================
  describe('PUT /api/alerts/quiet-hours/:dayOfWeek', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/alerts/quiet-hours/0')
        .send({ enabled: true, start_time: '22:00', end_time: '07:00' });

      expect(response.status).toBe(401);
    });

    test('should update quiet hours for Sunday', async () => {
      const updatedQuietHours = {
        day_of_week: 0,
        enabled: true,
        start_time: '22:00',
        end_time: '07:00'
      };
      alertEngine.updateQuietHours.mockResolvedValue(updatedQuietHours);

      const response = await request(app)
        .put('/api/alerts/quiet-hours/0')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: true, start_time: '22:00', end_time: '07:00' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quiet_hours');
      expect(response.body).toHaveProperty('message');
    });

    test('should return 400 for invalid day of week', async () => {
      const response = await request(app)
        .put('/api/alerts/quiet-hours/7')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: true });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Wochentag');
    });

    test('should return 400 for invalid time format', async () => {
      const response = await request(app)
        .put('/api/alerts/quiet-hours/0')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ start_time: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Format');
    });
  });

  // ============================================================================
  // PUT /api/alerts/quiet-hours (batch update)
  // ============================================================================
  describe('PUT /api/alerts/quiet-hours (batch)', () => {
    test('should update multiple days', async () => {
      alertEngine.updateQuietHours.mockResolvedValue({ day_of_week: 0, enabled: true });

      const response = await request(app)
        .put('/api/alerts/quiet-hours')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          days: [
            { day_of_week: 0, enabled: true, start_time: '22:00', end_time: '07:00' },
            { day_of_week: 6, enabled: true, start_time: '22:00', end_time: '08:00' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('updated_count');
      expect(response.body).toHaveProperty('quiet_hours');
    });

    test('should return 400 if days is not an array', async () => {
      const response = await request(app)
        .put('/api/alerts/quiet-hours')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ days: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Array');
    });
  });

  // ============================================================================
  // GET /api/alerts/history
  // ============================================================================
  describe('GET /api/alerts/history', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/history');

      expect(response.status).toBe(401);
    });

    test('should return alert history', async () => {
      const mockHistory = {
        alerts: [
          { id: 1, metric_type: 'cpu', severity: 'warning', value: 85 },
          { id: 2, metric_type: 'ram', severity: 'critical', value: 96 }
        ],
        total: 2
      };
      alertEngine.getHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/alerts/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alerts');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by metric_type', async () => {
      alertEngine.getHistory.mockResolvedValue({ alerts: [], total: 0 });

      const response = await request(app)
        .get('/api/alerts/history?metric_type=cpu')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(alertEngine.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({ metricType: 'cpu' })
      );
    });

    test('should support filtering by severity', async () => {
      alertEngine.getHistory.mockResolvedValue({ alerts: [], total: 0 });

      const response = await request(app)
        .get('/api/alerts/history?severity=critical')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(alertEngine.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' })
      );
    });

    test('should support pagination', async () => {
      alertEngine.getHistory.mockResolvedValue({ alerts: [], total: 0 });

      const response = await request(app)
        .get('/api/alerts/history?limit=50&offset=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(alertEngine.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 10 })
      );
    });
  });

  // ============================================================================
  // POST /api/alerts/history/:id/acknowledge
  // ============================================================================
  describe('POST /api/alerts/history/:id/acknowledge', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/alerts/history/1/acknowledge');

      expect(response.status).toBe(401);
    });

    test('should acknowledge an alert', async () => {
      const acknowledgedAlert = {
        id: 1,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: 1
      };
      alertEngine.acknowledgeAlert.mockResolvedValue(acknowledgedAlert);

      const response = await request(app)
        .post('/api/alerts/history/1/acknowledge')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alert');
      expect(response.body).toHaveProperty('message');
    });

    test('should return 400 for invalid alert ID', async () => {
      const response = await request(app)
        .post('/api/alerts/history/invalid/acknowledge')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Alert-ID');
    });

    test('should return 404 if alert not found', async () => {
      alertEngine.acknowledgeAlert.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/alerts/history/999/acknowledge')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // POST /api/alerts/history/acknowledge-all
  // ============================================================================
  describe('POST /api/alerts/history/acknowledge-all', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/alerts/history/acknowledge-all');

      expect(response.status).toBe(401);
    });

    test('should acknowledge all alerts', async () => {
      alertEngine.acknowledgeAll.mockResolvedValue(5);

      const response = await request(app)
        .post('/api/alerts/history/acknowledge-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('acknowledged_count', 5);
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // GET /api/alerts/statistics
  // ============================================================================
  describe('GET /api/alerts/statistics', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/statistics');

      expect(response.status).toBe(401);
    });

    test('should return alert statistics', async () => {
      const mockStats = {
        total_alerts: 100,
        unacknowledged: 5,
        critical_last_24h: 2,
        warning_last_24h: 10
      };
      alertEngine.getStatistics.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/alerts/statistics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_alerts');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/alerts/test-webhook
  // ============================================================================
  describe('POST /api/alerts/test-webhook', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/alerts/test-webhook')
        .send({ webhook_url: 'https://example.com/webhook' });

      expect(response.status).toBe(401);
    });

    test('should test webhook successfully', async () => {
      alertEngine.testWebhook.mockResolvedValue({ success: true, response_time: 120 });

      const response = await request(app)
        .post('/api/alerts/test-webhook')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ webhook_url: 'https://example.com/webhook' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    test('should return 400 if webhook_url is missing', async () => {
      const response = await request(app)
        .post('/api/alerts/test-webhook')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('URL');
    });

    test('should return 400 for invalid URL', async () => {
      const response = await request(app)
        .post('/api/alerts/test-webhook')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ webhook_url: 'not-a-valid-url' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('URL');
    });
  });

  // ============================================================================
  // POST /api/alerts/trigger-check
  // ============================================================================
  describe('POST /api/alerts/trigger-check', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/alerts/trigger-check');

      expect(response.status).toBe(401);
    });

    test('should trigger alert check', async () => {
      alertEngine.triggerCheck.mockResolvedValue({ checked: true, alerts_generated: 0 });

      const response = await request(app)
        .post('/api/alerts/trigger-check')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/alerts/status
  // ============================================================================
  describe('GET /api/alerts/status', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/alerts/status');

      expect(response.status).toBe(401);
    });

    test('should return alert engine status', async () => {
      alertEngine.getSettings.mockResolvedValue({
        alerts_enabled: true,
        webhook_enabled: true,
        in_app_notifications: true
      });
      alertEngine.getStatistics.mockResolvedValue({ total_alerts: 100 });
      alertEngine.isInQuietHours.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/alerts/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled', true);
      expect(response.body).toHaveProperty('in_quiet_hours', false);
      expect(response.body).toHaveProperty('webhook_enabled', true);
      expect(response.body).toHaveProperty('statistics');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
