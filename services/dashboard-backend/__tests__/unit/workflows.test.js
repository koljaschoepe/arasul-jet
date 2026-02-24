/**
 * Unit tests for Workflows Routes
 *
 * Tests all workflow endpoints:
 * - GET /api/workflows/activity
 * - GET /api/workflows/list
 * - POST /api/workflows/execution
 * - GET /api/workflows/history
 * - GET /api/workflows/stats
 * - GET /api/workflows/active
 * - DELETE /api/workflows/cleanup
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

// Mock n8nLogger service
jest.mock('../../src/services/n8nLogger', () => ({
  logExecution: jest.fn(),
  getExecutionHistory: jest.fn(),
  getWorkflowStats: jest.fn(),
  getActiveWorkflows: jest.fn(),
  cleanupOldRecords: jest.fn()
}));

// Mock services with side effects
jest.mock('../../src/services/eventListenerService', () => ({
  getStatus: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
  sendTestNotification: jest.fn()
}));

jest.mock('../../src/services/telegramNotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAlert: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/middleware/rateLimit', () => ({
  apiLimiter: (req, res, next) => next(),
  metricsLimiter: (req, res, next) => next(),
  loginLimiter: (req, res, next) => next(),
  llmLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  createUserRateLimiter: () => (req, res, next) => next()
}));

jest.mock('../../src/config/services', () => ({
  metrics: { url: 'http://localhost:9100', host: 'localhost', port: 9100 },
  llm: { url: 'http://localhost:11434', host: 'localhost', port: 11434 },
  embedding: { url: 'http://localhost:11435', host: 'localhost', port: 11435 },
  qdrant: { url: 'http://localhost:6333', host: 'localhost', port: 6333 },
  minio: { host: 'localhost', port: 9000, consolePort: 9001, endpoint: 'localhost:9000' },
  documentIndexer: { url: 'http://localhost:9102', host: 'localhost', port: 9102 },
  selfHealing: { url: 'http://localhost:9200', host: 'localhost', port: 9200 },
  n8n: { url: 'http://localhost:5678', host: 'localhost', port: 5678 }
}));

const db = require('../../src/database');
const n8nLogger = require('../../src/services/n8nLogger');
const { app } = require('../../src/server');
const { generateTestToken, setupAuthMocks } = require('../helpers/authMock');

const token = generateTestToken();

describe('Workflows Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
  });

  // ============================================================================
  // GET /api/workflows/activity
  // ============================================================================
  describe('GET /api/workflows/activity', () => {
    test('should return workflow activity summary', async () => {
      db.query.mockImplementation((query) => {
        // Auth queries
        if (query.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (query.includes('active_sessions') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [{ id: 1, user_id: 1, token_jti: 'test-jti-12345', expires_at: new Date(Date.now() + 86400000).toISOString() }] });
        }
        if (query.includes('update_session_activity')) return Promise.resolve({ rows: [] });
        if (query.includes('admin_users')) return Promise.resolve({ rows: [{ id: 1, username: 'admin', email: 'admin@arasul.local', is_active: true }] });
        // Workflow activity query
        return Promise.resolve({
          rows: [{
            active: '2',
            executed_today: '15',
            last_error: 'Connection timeout',
            last_success: new Date().toISOString()
          }]
        });
      });

      const response = await request(app)
        .get('/api/workflows/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('executed_today');
      expect(response.body).toHaveProperty('last_error');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return zeros when no activity', async () => {
      db.query.mockImplementation((query) => {
        if (query.includes('token_blacklist')) return Promise.resolve({ rows: [] });
        if (query.includes('active_sessions') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [{ id: 1, user_id: 1, token_jti: 'test-jti-12345', expires_at: new Date(Date.now() + 86400000).toISOString() }] });
        }
        if (query.includes('update_session_activity')) return Promise.resolve({ rows: [] });
        if (query.includes('admin_users')) return Promise.resolve({ rows: [{ id: 1, username: 'admin', email: 'admin@arasul.local', is_active: true }] });
        return Promise.resolve({
          rows: [{
            active: null,
            executed_today: null,
            last_error: null,
            last_success: null
          }]
        });
      });

      const response = await request(app)
        .get('/api/workflows/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.active).toBe(0);
      expect(response.body.executed_today).toBe(0);
      expect(response.body.last_error).toBeNull();
    });
  });

  // ============================================================================
  // GET /api/workflows/list
  // ============================================================================
  describe('GET /api/workflows/list', () => {
    test('should return empty workflows list with message', async () => {
      const response = await request(app)
        .get('/api/workflows/list')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workflows');
      expect(response.body).toHaveProperty('message');
      expect(response.body.workflows).toEqual([]);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/workflows/execution
  // ============================================================================
  describe('POST /api/workflows/execution', () => {
    test('should log workflow execution', async () => {
      const mockRecord = {
        id: 1,
        workflow_name: 'test-workflow',
        status: 'success',
        timestamp: new Date().toISOString()
      };
      n8nLogger.logExecution.mockResolvedValue(mockRecord);

      const response = await request(app)
        .post('/api/workflows/execution')
        .set('Authorization', `Bearer ${token}`)
        .send({
          workflow_name: 'test-workflow',
          execution_id: 'exec-123',
          status: 'success',
          duration_ms: 1500
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('record');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if workflow_name is missing', async () => {
      const response = await request(app)
        .post('/api/workflows/execution')
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'success'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('workflow_name');
    });

    test('should return 400 for invalid status', async () => {
      const response = await request(app)
        .post('/api/workflows/execution')
        .set('Authorization', `Bearer ${token}`)
        .send({
          workflow_name: 'test-workflow',
          status: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('status');
    });

    test('should accept all valid status values', async () => {
      const validStatuses = ['success', 'error', 'running', 'waiting'];

      for (const status of validStatuses) {
        n8nLogger.logExecution.mockResolvedValue({ id: 1, status });

        const response = await request(app)
          .post('/api/workflows/execution')
          .set('Authorization', `Bearer ${token}`)
          .send({
            workflow_name: 'test-workflow',
            status
          });

        expect(response.status).toBe(201);
      }
    });
  });

  // ============================================================================
  // GET /api/workflows/history
  // ============================================================================
  describe('GET /api/workflows/history', () => {
    test('should return execution history', async () => {
      const mockHistory = [
        { id: 1, workflow_name: 'workflow-1', status: 'success', timestamp: new Date() },
        { id: 2, workflow_name: 'workflow-2', status: 'error', timestamp: new Date() }
      ];
      n8nLogger.getExecutionHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/workflows/history')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by workflow_name', async () => {
      n8nLogger.getExecutionHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/workflows/history?workflow_name=test-workflow')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(n8nLogger.getExecutionHistory).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_name: 'test-workflow' })
      );
    });

    test('should support filtering by status', async () => {
      n8nLogger.getExecutionHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/workflows/history?status=error')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(n8nLogger.getExecutionHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' })
      );
    });

    test('should support pagination', async () => {
      n8nLogger.getExecutionHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/workflows/history?limit=50&offset=10')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('limit', 50);
      expect(response.body).toHaveProperty('offset', 10);
    });

    test('should cap limit at 1000', async () => {
      n8nLogger.getExecutionHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/workflows/history?limit=5000')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(n8nLogger.getExecutionHistory).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1000 })
      );
    });
  });

  // ============================================================================
  // GET /api/workflows/stats
  // ============================================================================
  describe('GET /api/workflows/stats', () => {
    test('should return workflow statistics', async () => {
      const mockStats = {
        total_executions: 100,
        success_rate: 95.5,
        avg_duration_ms: 2500
      };
      n8nLogger.getWorkflowStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/workflows/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by workflow_name', async () => {
      n8nLogger.getWorkflowStats.mockResolvedValue({});

      const response = await request(app)
        .get('/api/workflows/stats?workflow_name=test-workflow')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(n8nLogger.getWorkflowStats).toHaveBeenCalledWith('test-workflow', '24h');
    });

    test('should support different time ranges', async () => {
      n8nLogger.getWorkflowStats.mockResolvedValue({});

      for (const range of ['1h', '24h', '7d', '30d']) {
        const response = await request(app)
          .get(`/api/workflows/stats?range=${range}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(n8nLogger.getWorkflowStats).toHaveBeenCalledWith(null, range);
      }
    });

    test('should return 400 for invalid range', async () => {
      const response = await request(app)
        .get('/api/workflows/stats?range=invalid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('range');
    });
  });

  // ============================================================================
  // GET /api/workflows/active
  // ============================================================================
  describe('GET /api/workflows/active', () => {
    test('should return active workflows', async () => {
      const mockWorkflows = [
        { workflow_name: 'workflow-1', last_execution: new Date(), total_executions: 10 },
        { workflow_name: 'workflow-2', last_execution: new Date(), total_executions: 5 }
      ];
      n8nLogger.getActiveWorkflows.mockResolvedValue(mockWorkflows);

      const response = await request(app)
        .get('/api/workflows/active')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('workflows');
      expect(response.body).toHaveProperty('count', 2);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return empty list when no active workflows', async () => {
      n8nLogger.getActiveWorkflows.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/workflows/active')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.workflows).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });

  // ============================================================================
  // DELETE /api/workflows/cleanup
  // ============================================================================
  describe('DELETE /api/workflows/cleanup', () => {
    test('should cleanup old records', async () => {
      n8nLogger.cleanupOldRecords.mockResolvedValue(50);

      const response = await request(app)
        .delete('/api/workflows/cleanup')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deleted_count', 50);
      expect(response.body).toHaveProperty('days_kept', 7);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support custom days parameter', async () => {
      n8nLogger.cleanupOldRecords.mockResolvedValue(100);

      const response = await request(app)
        .delete('/api/workflows/cleanup?days=30')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.days_kept).toBe(30);
      expect(n8nLogger.cleanupOldRecords).toHaveBeenCalledWith(30);
    });

    test('should cap days at maximum 365', async () => {
      n8nLogger.cleanupOldRecords.mockResolvedValue(0);

      const response = await request(app)
        .delete('/api/workflows/cleanup?days=1000')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.days_kept).toBe(365);
    });

    test('should default to 7 days when 0 is provided', async () => {
      // Note: 0 || 7 evaluates to 7 in JavaScript, so days=0 defaults to 7
      n8nLogger.cleanupOldRecords.mockResolvedValue(0);

      const response = await request(app)
        .delete('/api/workflows/cleanup?days=0')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.days_kept).toBe(7);
    });
  });
});
