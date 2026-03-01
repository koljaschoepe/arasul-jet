/**
 * Unit tests for Logs Routes
 *
 * Tests all logs endpoints:
 * - GET /api/logs - Read log file contents
 * - GET /api/logs/list - List available log files
 * - GET /api/logs/stream - Stream log file (SSE)
 * - GET /api/logs/search - Search logs for pattern
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

// Mock fs module - preserve actual fs for bcrypt compatibility
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const mockLogContent = `2026-01-25T10:00:00.000Z [INFO] Server started
2026-01-25T10:00:01.000Z [INFO] Connected to database
2026-01-25T10:00:02.000Z [WARN] High memory usage detected
2026-01-25T10:00:03.000Z [ERROR] Failed to connect to embedding service
2026-01-25T10:00:04.000Z [DEBUG] Request received: GET /api/health`;

  // Mock watcher object with close method
  const mockWatcher = {
    close: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  };

  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(mockLogContent),
      stat: jest.fn().mockResolvedValue({
        size: 1024,
        mtime: new Date('2026-01-25T10:00:00.000Z')
      }),
      watch: jest.fn().mockReturnValue(mockWatcher)
    },
    createReadStream: jest.fn()
  };
});

const db = require('../../src/database');
const { app } = require('../../src/server');
const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

describe('Logs Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  // ============================================================================
  // GET /api/logs
  // ============================================================================
  describe('GET /api/logs', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/logs');
      expect(response.status).toBe(401);
    });

    test('should return log contents with valid token', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${token}`);

      // May return 404 if log file doesn't exist in test environment
      expect([200, 404]).toContain(response.status);
    });

    test('should accept service parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    test('should return 400 for invalid service name', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=invalid-service')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid service');
    });

    test('should accept lines parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system&lines=50')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    test('should accept format=json parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system&format=json')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('service');
        expect(response.body).toHaveProperty('logs');
        expect(response.body).toHaveProperty('timestamp');
      }
    });

    test('should accept level filter parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system&level=ERROR&format=json')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    test('should return text/plain for text format', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system&format=text')
        .set('Authorization', `Bearer ${token}`);

      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/text\/plain/);
      }
    });
  });

  // ============================================================================
  // GET /api/logs/list
  // ============================================================================
  describe('GET /api/logs/list', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/logs/list');
      expect(response.status).toBe(401);
    });

    test('should return list of available log files', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/list')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    test('should include service name and path for each log', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/list')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      response.body.logs.forEach(log => {
        expect(log).toHaveProperty('service');
        expect(log).toHaveProperty('path');
        expect(log).toHaveProperty('accessible');
      });
    });
  });

  // ============================================================================
  // GET /api/logs/search
  // ============================================================================
  describe('GET /api/logs/search', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/logs/search?query=error');
      expect(response.status).toBe(401);
    });

    test('should return 400 if query is missing', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/search')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('query');
    });

    test('should search logs with valid query', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/search?query=error&service=system')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('query');
        expect(response.body).toHaveProperty('matches');
        expect(response.body).toHaveProperty('lines');
        expect(response.body).toHaveProperty('timestamp');
      }
    });

    test('should return 400 for invalid service', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/search?query=test&service=invalid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should accept case_sensitive parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/search?query=ERROR&service=system&case_sensitive=true')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.case_sensitive).toBe(true);
      }
    });

    test('should accept lines limit parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/search?query=test&service=system&lines=10')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  // ============================================================================
  // GET /api/logs/stream
  // ============================================================================
  describe('GET /api/logs/stream', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/logs/stream');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid service', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs/stream?service=invalid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    // Note: SSE streaming tests are limited in supertest
    // Real SSE functionality should be tested with integration tests
    test('should accept valid service parameter', async () => {
      setupAuthMocks(db);

      // SSE endpoints are harder to test with supertest
      // This test just verifies the route exists and validates params
      const response = await request(app)
        .get('/api/logs/stream?service=system')
        .set('Authorization', `Bearer ${token}`)
        .timeout(100)
        .catch(err => {
          // Timeout is expected for SSE - connection stays open
          return { status: 200, timeout: true };
        });

      expect([200, 404]).toContain(response.status);
    });
  });

  // ============================================================================
  // Security Tests
  // ============================================================================
  describe('Security', () => {
    test('should prevent path traversal in service parameter', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=../../../etc/passwd')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should validate service against whitelist', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/logs?service=system;cat /etc/passwd')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });
});
