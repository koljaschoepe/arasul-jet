/**
 * Unit tests for Settings Routes
 *
 * Tests all settings endpoints:
 * - POST /api/settings/password/dashboard - Change dashboard password
 * - GET  /api/settings/password-requirements - Get password requirements
 * - GET  /api/settings/firmenname         - Firmenname ueber dem Anmeldeformular
 * - PUT  /api/settings/firmenname         - Firmenname setzen (leer = keiner)
 * - PUT  /api/settings/logo              - Logo des Hauses setzen (PNG, JPEG, WebP)
 * - DELETE /api/settings/logo             - Logo entfernen
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
  // Logo des Hauses (M5, Migration 207)
  // ============================================================================
  describe('/api/settings/logo', () => {
    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 1),
    ]);
    const alsAdresse = (typ, inhalt) => `data:${typ};base64,${inhalt.toString('base64')}`;

    test('PUT ohne Anmeldung: 401', async () => {
      const res = await request(app)
        .put('/api/settings/logo')
        .send({ bild: alsAdresse('image/png', PNG) });
      expect(res.status).toBe(401);
    });

    test('PUT schreibt Datei, Art und Stand und laedt den Cache neu', async () => {
      const systemSettings = require('../../src/services/system-settings/systemSettingsService');
      const updates = [];
      const stand = new Date('2026-10-04T20:00:00Z');
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE system_settings')) {
          updates.push(params);
          return Promise.resolve({ rows: [{ company_logo_stand: stand }] });
        }
        if (query.includes('FROM system_settings')) {
          return Promise.resolve({ rows: [{ company_logo_stand: stand }] });
        }
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .put('/api/settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .send({ bild: alsAdresse('image/png', PNG) });
      expect(res.status).toBe(200);
      expect(res.body.data.logo).toBe(stand.toISOString());
      expect(updates).toHaveLength(1);
      expect(Buffer.isBuffer(updates[0][0])).toBe(true);
      expect(updates[0][0].equals(PNG)).toBe(true);
      expect(updates[0][1]).toBe('image/png');
      expect(systemSettings.get('company_logo_stand')).toEqual(stand);
      systemSettings._setForTest({ company_logo_stand: null });
    });

    test('PUT weist ein SVG ab', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .put('/api/settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .send({ bild: alsAdresse('image/svg+xml', Buffer.from('<svg><script>1</script></svg>')) });
      expect(res.status).toBe(400);
    });

    test('PUT weist eine Datei ab, die nur behauptet, ein PNG zu sein', async () => {
      setupMocksWithAuth();
      const res = await request(app)
        .put('/api/settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .send({ bild: alsAdresse('image/png', Buffer.from('<html>kein Bild</html>')) });
      expect(res.status).toBe(400);
    });

    test('PUT weist ein Bild ueber 256 KB ab', async () => {
      setupMocksWithAuth();
      const gross = Buffer.concat([PNG, Buffer.alloc(256 * 1024, 1)]);
      const res = await request(app)
        .put('/api/settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .send({ bild: alsAdresse('image/png', gross) });
      expect(res.status).toBe(400);
    });

    test('DELETE setzt alle drei Spalten auf NULL', async () => {
      const updates = [];
      setupMocksWithAuth(query => {
        if (query.includes('UPDATE system_settings')) updates.push(query);
        return Promise.resolve({ rows: [] });
      });
      const res = await request(app)
        .delete('/api/settings/logo')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.logo).toBeNull();
      expect(updates[0]).toMatch(
        /company_logo = NULL.*company_logo_typ = NULL.*company_logo_stand = NULL/s
      );
    });
  });

  // Die Standardwerte fuer das Modell und der Basis-Prompt haben seit dem
  // 04.10.2026 keinen Weg mehr: der Administrator aendert keine Prompts.
  test('GET und PATCH /api/settings/sprachmodell gibt es nicht mehr', async () => {
    setupMocksWithAuth();
    const lesen = await request(app)
      .get('/api/settings/sprachmodell')
      .set('Authorization', `Bearer ${token}`);
    expect(lesen.status).toBe(404);
    const schreiben = await request(app)
      .patch('/api/settings/sprachmodell')
      .set('Authorization', `Bearer ${token}`)
      .send({ llm_base_system_prompt: 'x' });
    expect(schreiben.status).toBe(404);
  });

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
