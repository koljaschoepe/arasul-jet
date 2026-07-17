/**
 * Unit tests for Workspace-Apps Routes
 *
 * - GET /api/workspace-apps      - Manifest + Aktivierungszustand
 * - PUT /api/workspace-apps/:id  - App an-/abschalten
 */

const request = require('supertest');

const mockTransactionClient = { query: jest.fn() };
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(async (callback) => callback(mockTransactionClient)),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
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

jest.mock('../../src/services/core/eventListenerService', () => ({
  getStatus: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
  sendTestNotification: jest.fn()
}));

jest.mock('../../src/middleware/rateLimit', () => ({
  apiLimiter: (req, res, next) => next(),
  metricsLimiter: (req, res, next) => next(),
  loginLimiter: (req, res, next) => next(),
  llmLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  generalAuthLimiter: (req, res, next) => next(),
  tailscaleLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
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
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

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
    if (query.includes('admin_users') && query.includes('SELECT') && !query.includes('password_hash')) {
      return Promise.resolve({ rows: [mockUser] });
    }
    if (customHandler) {
      return customHandler(query, params);
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('Workspace-Apps Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  describe('GET /api/workspace-apps', () => {
    test('liefert Manifest mit DB-Zustand (fehlende Zeile = aktiviert)', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM platform_apps')) {
          return Promise.resolve({ rows: [{ id: 'database', enabled: false }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/workspace-apps')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.apps).toHaveLength(2);
      const byId = Object.fromEntries(res.body.apps.map(a => [a.id, a]));
      expect(byId.database.enabled).toBe(false);
      expect(byId.n8n.enabled).toBe(true);
      expect(byId.n8n.tab).toBe('automationen');
    });

    test('erfordert Auth', async () => {
      setupMocksWithAuth();
      const res = await request(app).get('/api/workspace-apps');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/workspace-apps/:id', () => {
    test('schaltet eine App ab (Upsert)', async () => {
      let upsertParams = null;
      setupMocksWithAuth((query, params) => {
        if (query.includes('INSERT INTO platform_apps')) {
          upsertParams = params;
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put('/api/workspace-apps/n8n')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.app).toEqual({ id: 'n8n', enabled: false });
      expect(upsertParams).toEqual(['n8n', false]);
    });

    test('404 für unbekannte App', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .put('/api/workspace-apps/spotify')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false });
      expect(res.status).toBe(404);
    });

    test('400 bei fehlendem enabled-Flag', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .put('/api/workspace-apps/n8n')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
