/**
 * Unit tests for Settings Routes
 *
 * Tests all settings endpoints:
 * - POST /api/settings/password/dashboard - Change dashboard password
 * - GET  /api/settings/password-requirements - Get password requirements
 * - GET  /api/settings/firmenname         - Firmenname ueber dem Anmeldeformular
 * - PUT  /api/settings/firmenname         - Firmenname setzen (leer = keiner)
 * - GET  /api/settings/sprachmodell       - Standardwerte fuer das Modell
 * - PATCH /api/settings/sprachmodell      - Standardwerte setzen
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utils/envManager', () => ({
  updateEnvVariables: jest.fn().mockResolvedValue(true),
  // Liefert seit dem 23.08.2026 den Inhalt im Speicher statt eine Datei
  // anzulegen, siehe Kopf von `utils/envManager.js`.
  backupEnvFile: jest.fn().mockResolvedValue('ADMIN_HASH=alt\n'),
  envZurueckrollen: jest.fn().mockResolvedValue(true),
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
    on: jest.fn(),
  })),
}));

jest.mock('axios');

// Mock services that have side effects at module load time
jest.mock('../../src/services/core/eventListenerService', () => ({
  getStatus: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
  sendTestNotification: jest.fn(),
}));

jest.mock('../../src/middleware/rateLimit', () => require('../helpers/rateLimitMock'));

jest.mock('../../src/config/services', () => ({
  metrics: { url: 'http://localhost:9100', host: 'localhost', port: 9100 },
  llm: { url: 'http://localhost:11434', host: 'localhost', port: 11434 },
  embedding: { url: 'http://localhost:11435', host: 'localhost', port: 11435 },
  qdrant: { url: 'http://localhost:6333', host: 'localhost', port: 6333 },
  documentIndexer: { url: 'http://localhost:9102', host: 'localhost', port: 9102 },
  selfHealing: { url: 'http://localhost:9200', host: 'localhost', port: 9200 },
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
    if (
      query.includes('admin_users') &&
      query.includes('SELECT') &&
      !query.includes('password_hash')
    ) {
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
  // Firmenname (Auftrag anmeldung-ohne-slogan, 30.08.2026)
  // ============================================================================
  describe('/api/settings/firmenname', () => {
    test('GET returns 401 without token', async () => {
      const res = await request(app).get('/api/settings/firmenname');
      expect(res.status).toBe(401);
    });

    test('GET liefert den gesetzten Namen', async () => {
      setupMocksWithAuth(query => {
        if (query.includes('company_name')) {
          return Promise.resolve({ rows: [{ company_name: 'Muster GmbH' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .get('/api/settings/firmenname')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.firmenname).toBe('Muster GmbH');
    });

    test('PUT schreibt den Namen und laedt den Cache neu', async () => {
      const systemSettings = require('../../src/services/system-settings/systemSettingsService');
      const updates = [];
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE system_settings')) {
          updates.push(params);
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('FROM system_settings')) {
          return Promise.resolve({ rows: [{ company_name: 'Muster GmbH' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .put('/api/settings/firmenname')
        .set('Authorization', `Bearer ${token}`)
        .send({ firmenname: '  Muster GmbH ' });
      expect(res.status).toBe(200);
      expect(res.body.firmenname).toBe('Muster GmbH');
      expect(updates).toEqual([['Muster GmbH']]);
      expect(systemSettings.get('company_name')).toBe('Muster GmbH');
      systemSettings._setForTest({ company_name: null });
    });

    test('PUT mit leerem Namen speichert NULL', async () => {
      const updates = [];
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE system_settings')) {
          updates.push(params);
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .put('/api/settings/firmenname')
        .set('Authorization', `Bearer ${token}`)
        .send({ firmenname: '   ' });
      expect(res.status).toBe(200);
      expect(res.body.firmenname).toBeNull();
      expect(updates).toEqual([[null]]);
    });

    test('PUT lehnt einen zu langen Namen ab', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .put('/api/settings/firmenname')
        .set('Authorization', `Bearer ${token}`)
        .send({ firmenname: 'x'.repeat(121) });
      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // Sprachmodell (J35): bis B4 unter /api/rag/settings, danach 404
  // ============================================================================
  describe('/api/settings/sprachmodell', () => {
    const WERTE = {
      llm_num_predict_default: 2048,
      llm_num_ctx_default: null,
      llm_keep_alive_seconds: 3600,
      llm_base_system_prompt: null,
    };

    test('GET ohne Anmeldung ist 401', async () => {
      const res = await request(app).get('/api/settings/sprachmodell');
      expect(res.status).toBe(401);
    });

    test('GET liefert die vier Werte', async () => {
      setupMocksWithAuth(query => {
        if (query.includes('FROM system_settings')) {
          return Promise.resolve({ rows: [WERTE] });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .get('/api/settings/sprachmodell')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(WERTE);
    });

    test('PATCH schreibt nur, was mitkommt, und laedt den Cache neu', async () => {
      const systemSettings = require('../../src/services/system-settings/systemSettingsService');
      const updates = [];
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE system_settings')) {
          updates.push({ query, params });
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('FROM system_settings')) {
          return Promise.resolve({ rows: [{ ...WERTE, llm_num_predict_default: 4096 }] });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .patch('/api/settings/sprachmodell')
        .set('Authorization', `Bearer ${token}`)
        .send({ llm_num_predict_default: 4096, llm_base_system_prompt: '' });
      expect(res.status).toBe(200);
      expect(res.body.data.llm_num_predict_default).toBe(4096);
      expect(updates).toHaveLength(1);
      expect(updates[0].query).toContain('llm_num_predict_default = $1');
      expect(updates[0].query).toContain('llm_base_system_prompt = $2');
      expect(updates[0].query).not.toContain('llm_keep_alive_seconds');
      // leerer Prompt heisst: eingebauter Prompt, also NULL
      expect(updates[0].params).toEqual([4096, null]);
      expect(systemSettings.getNumber('llm_num_predict_default')).toBe(4096);
      systemSettings._setForTest({ llm_num_predict_default: null });
    });

    test('PATCH ausserhalb der Grenzen ist 400', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .patch('/api/settings/sprachmodell')
        .set('Authorization', `Bearer ${token}`)
        .send({ llm_num_predict_default: 10 });
      expect(res.status).toBe(400);
    });

    test('PATCH ohne Feld oder mit fremdem Feld ist 400', async () => {
      setupMocksWithAuth();
      const leer = await request(app)
        .patch('/api/settings/sprachmodell')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(leer.status).toBe(400);
      const fremd = await request(app)
        .patch('/api/settings/sprachmodell')
        .set('Authorization', `Bearer ${token}`)
        .send({ company_name: 'x' });
      expect(fremd.status).toBe(400);
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
        requireSpecialChars: false,
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
  // GET /api/settings/company-context
  // ============================================================================
});
