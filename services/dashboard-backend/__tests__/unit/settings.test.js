/**
 * Unit tests for Settings Routes
 *
 * Tests all settings endpoints:
 * - POST /api/settings/password/dashboard - Change dashboard password
 * - POST /api/settings/password/minio     - Change MinIO password
 * - POST /api/settings/password/n8n       - Change n8n password
 * - GET  /api/settings/password-requirements - Get password requirements
 * - GET  /api/settings/company-context    - Get company context
 * - PUT  /api/settings/company-context    - Update company context
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../src/utils/envManager', () => ({
  updateEnvVariables: jest.fn().mockResolvedValue(true),
  backupEnvFile: jest.fn().mockResolvedValue(true)
}));

jest.mock('child_process', () => ({
  exec: jest.fn((cmd, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (callback) callback(null, '', '');
  }),
  execFile: jest.fn((cmd, args, opts, cb) => {
    if (cb) cb(null, { stdout: '', stderr: '' });
    return { stdout: '', stderr: '' };
  }),
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn()
  }))
}));

jest.mock('axios');

// Mock services that have side effects at module load time
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
const axios = require('axios');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

/**
 * Helper to setup auth + custom query mocks
 */
function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
    if (query.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    // Auth middleware user lookup (no password_hash column in SELECT)
    if (query.includes('admin_users') && query.includes('SELECT') && !query.includes('password_hash')) {
      return Promise.resolve({ rows: [mockUser] });
    }

    if (customHandler) {
      return customHandler(query, params);
    }

    return Promise.resolve({ rows: [] });
  });
}

describe('Settings Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
    // Default axios mock: embedding service unavailable (non-critical)
    axios.post = jest.fn().mockRejectedValue(new Error('Connection refused'));
  });

  // ============================================================================
  // AUTH: 401 without token
  // ============================================================================
  describe('Authentication', () => {
    test('GET /api/settings/password-requirements returns 401 without token', async () => {
      const res = await request(app).get('/api/settings/password-requirements');
      expect(res.status).toBe(401);
    });

    test('POST /api/settings/password/dashboard returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .send({ currentPassword: 'test', newPassword: 'test' });
      expect(res.status).toBe(401);
    });

    test('GET /api/settings/company-context returns 401 without token', async () => {
      const res = await request(app).get('/api/settings/company-context');
      expect(res.status).toBe(401);
    });

    test('PUT /api/settings/company-context returns 401 without token', async () => {
      const res = await request(app)
        .put('/api/settings/company-context')
        .send({ content: 'test' });
      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // GET /api/settings/password-requirements
  // ============================================================================
  describe('GET /api/settings/password-requirements', () => {
    test('returns password requirements object', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .get('/api/settings/password-requirements')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requirements');
      expect(res.body.requirements).toMatchObject({
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      });
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/settings/password/dashboard
  // ============================================================================
  describe('POST /api/settings/password/dashboard', () => {
    test('returns 400 when currentPassword is missing', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'ValidPass123' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when newPassword is missing', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when new password is too short (< 12 chars)', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'Short1' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when new password has no uppercase letter', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'alllowercase123' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when new password has no number', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'NoNumbersHereABC' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // POST /api/settings/password/minio
  // ============================================================================
  describe('POST /api/settings/password/minio', () => {
    test('returns 400 when currentPassword is missing', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/minio')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'ValidPass123' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when new password fails complexity check', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/minio')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // POST /api/settings/password/n8n
  // ============================================================================
  describe('POST /api/settings/password/n8n', () => {
    test('returns 400 when currentPassword is missing', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/n8n')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'ValidPass123' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when new password fails complexity check', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/n8n')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'tooshort' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // GET /api/settings/company-context
  // ============================================================================
  describe('GET /api/settings/company-context', () => {
    test('returns company context from db when it exists', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('company_context') && query.includes('SELECT')) {
          return Promise.resolve({
            rows: [{ content: 'Test company', updated_at: '2024-01-01', updated_by: 1 }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content', 'Test company');
      expect(res.body).toHaveProperty('updated_at');
      expect(res.body).toHaveProperty('updated_by');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('returns default template when no company context exists', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('company_context') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content');
      expect(res.body.content).toContain('Unternehmensprofil');
      expect(res.body.updated_at).toBeNull();
      expect(res.body.updated_by).toBeNull();
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // PUT /api/settings/company-context
  // ============================================================================
  describe('PUT /api/settings/company-context', () => {
    test('updates company context successfully', async () => {
      axios.post = jest.fn().mockResolvedValue({
        data: { vectors: [[0.1, 0.2, 0.3]] }
      });

      setupMocksWithAuth((query) => {
        if (query.includes('company_context') && (query.includes('INSERT') || query.includes('UPDATE'))) {
          return Promise.resolve({
            rows: [{ content: 'Updated content', updated_at: '2024-01-01' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
    });

    test('returns 400 when content field is missing', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .put('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('returns 400 when content is not a string', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .put('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 42 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('succeeds even when embedding service is unavailable', async () => {
      // axios.post already mocked to reject in beforeEach
      setupMocksWithAuth((query) => {
        if (query.includes('company_context') && (query.includes('INSERT') || query.includes('UPDATE'))) {
          return Promise.resolve({
            rows: [{ content: 'Content without embedding', updated_at: '2024-01-01' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put('/api/settings/company-context')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Content without embedding' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content');
    });
  });
});
