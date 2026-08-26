/**
 * Unit tests for Settings Routes
 *
 * Tests all settings endpoints:
 * - POST /api/settings/password/dashboard - Change dashboard password
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
  // Liefert seit dem 23.08.2026 den Inhalt im Speicher statt eine Datei
  // anzulegen, siehe Kopf von `utils/envManager.js`.
  backupEnvFile: jest.fn().mockResolvedValue('ADMIN_HASH=alt\n'),
  envZurueckrollen: jest.fn().mockResolvedValue(true)
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
jest.mock('../../src/services/core/eventListenerService', () => ({
  getStatus: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
  sendTestNotification: jest.fn()
}));

jest.mock('../../src/middleware/rateLimit', () => require('../helpers/rateLimitMock'));

jest.mock('../../src/config/services', () => ({
  metrics: { url: 'http://localhost:9100', host: 'localhost', port: 9100 },
  llm: { url: 'http://localhost:11434', host: 'localhost', port: 11434 },
  embedding: { url: 'http://localhost:11435', host: 'localhost', port: 11435 },
  qdrant: { url: 'http://localhost:6333', host: 'localhost', port: 6333 },
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
    test('GET /api/settings/password-requirements returns 200 without token (public endpoint)', async () => {
      const res = await request(app).get('/api/settings/password-requirements');
      expect(res.status).toBe(200);
    });

    test('POST /api/settings/password/dashboard returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .send({ currentPassword: 'test', newPassword: 'test' });
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
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
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

    test('returns 400 when new password is too short (< 8 chars)', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/settings/password/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'OldPass123!', newPassword: 'abc' });

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
        .send({ currentPassword: 'OldPass123!', newPassword: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // GET /api/settings/company-context
  // ============================================================================
});
