/**
 * Unit tests for Automations Routes (Plan 007)
 *
 * - GET /api/automations/session — stellt die n8n-Session her und reicht den
 *   n8n-Set-Cookie durch; bei n8n-Ausfall sauberer ServiceUnavailableError.
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('axios');

jest.mock('../../src/middleware/rateLimit', () => ({
  apiLimiter: (req, res, next) => next(),
  metricsLimiter: (req, res, next) => next(),
  loginLimiter: (req, res, next) => next(),
  llmLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  generalAuthLimiter: (req, res, next) => next(),
  tailscaleLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  createUserRateLimiter: () => (req, res, next) => next(),
}));

jest.mock('../../src/config/services', () => ({
  metrics: { url: 'http://localhost:9100', host: 'localhost', port: 9100 },
  llm: { url: 'http://localhost:11434', host: 'localhost', port: 11434 },
  embedding: { url: 'http://localhost:11435', host: 'localhost', port: 11435 },
  qdrant: { url: 'http://localhost:6333', host: 'localhost', port: 6333 },
  minio: { host: 'localhost', port: 9000, consolePort: 9001, endpoint: 'localhost:9000' },
  documentIndexer: { url: 'http://localhost:9102', host: 'localhost', port: 9102 },
  selfHealing: { url: 'http://localhost:9200', host: 'localhost', port: 9200 },
  n8n: {
    host: 'n8n',
    port: 5678,
    url: 'http://n8n:5678',
    ownerEmail: 'owner@arasul.local',
    ownerPassword: 'A1testsecretpassword',
  },
  timeouts: { health: 5000, query: 15000, upload: 30000, embed: 30000, embedBatch: 120000 },
}));

const axios = require('axios');
const db = require('../../src/database');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

function setupAuth() {
  db.query.mockImplementation((query) => {
    if (query.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (query.includes('admin_users') && query.includes('SELECT') && !query.includes('password_hash')) {
      return Promise.resolve({ rows: [mockUser] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('Automations Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
    setupAuth();
  });

  describe('GET /api/automations/session', () => {
    test('meldet den Owner an und reicht den n8n-Set-Cookie durch', async () => {
      const cookie = 'n8n-auth=eyJhbGci.jwt.value; Path=/; HttpOnly; SameSite=lax';
      axios.post.mockResolvedValueOnce({ status: 200, headers: { 'set-cookie': [cookie] } });

      const res = await request(app)
        .get('/api/automations/session')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ authenticated: true });
      // Set-Cookie attributgetreu weitergereicht
      expect(res.headers['set-cookie']).toEqual([cookie]);

      // Login-Aufruf mit dem korrekten n8n-2.x-Body
      expect(axios.post).toHaveBeenCalledWith(
        'http://n8n:5678/rest/login',
        { emailOrLdapLoginId: 'owner@arasul.local', password: 'A1testsecretpassword' },
        expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
      );
    });

    test('n8n unerreichbar → 503 ServiceUnavailableError', async () => {
      const err = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      axios.post.mockRejectedValueOnce(err);

      const res = await request(app)
        .get('/api/automations/session')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('n8n erreichbar, aber Login ohne Cookie → 503', async () => {
      axios.post.mockResolvedValueOnce({ status: 401, headers: {} });

      const res = await request(app)
        .get('/api/automations/session')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('erfordert Auth', async () => {
      const res = await request(app).get('/api/automations/session');
      expect(res.status).toBe(401);
    });
  });
});
