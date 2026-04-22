/**
 * Integration tests covering the telegram-app routes that were NOT
 * exercised by telegramApp.test.js or telegramZeroConfig.test.js:
 *
 *   GET  /api/telegram-app/dashboard-data
 *   PUT  /api/telegram-app/settings
 *   GET  /api/telegram-app/global-stats
 *   POST /api/telegram-app/zero-config/cancel
 *   POST /api/telegram-app/rules/:id/test
 *
 * These routes delegate to telegramAppService / telegramSetupPollingService,
 * hit the Telegram HTTP API, and decrypt stored bot tokens — all are mocked.
 */

const request = require('supertest');
const {
  generateTestToken,
  setupAuthMocks,
  testRequiresAuth,
} = require('../helpers/authMock');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../../src/services/websocketService', () => ({ broadcast: jest.fn() }), {
  virtual: true,
});
jest.mock('../../src/utils/tokenCrypto', () => ({
  encryptToken: jest.fn((t) => `enc:${t}`),
  decryptToken: jest.fn(() => 'plain-bot-token'),
}));
jest.mock('../../src/services/telegram/telegramAppService', () => ({
  getAppStatus: jest.fn(),
  getDashboardAppData: jest.fn(),
  updateSettings: jest.fn(),
  recordActivity: jest.fn().mockResolvedValue(undefined),
  getGlobalStats: jest.fn(),
}));
jest.mock('../../src/services/telegram/telegramSetupPollingService', () => ({
  stopPolling: jest.fn(),
  startPolling: jest.fn(),
}));
jest.mock('../../src/services/telegram/telegramOrchestratorService', () => ({
  logThinking: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const axios = require('axios');
const telegramAppService = require('../../src/services/telegram/telegramAppService');
const telegramSetupPollingService = require('../../src/services/telegram/telegramSetupPollingService');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

let token;

beforeAll(() => {
  token = generateTestToken();
});

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/telegram-app/dashboard-data
// ---------------------------------------------------------------------------
describe('GET /api/telegram-app/dashboard-data', () => {
  testRequiresAuth(app, 'get', '/api/telegram-app/dashboard-data');

  test('returns app data from service and records activity when app exists', async () => {
    setupAuthMocks(db);
    const fakeApp = { id: 'tg-1', name: 'Telegram', badge: 3 };
    telegramAppService.getDashboardAppData.mockResolvedValue(fakeApp);

    const response = await request(app)
      .get('/api/telegram-app/dashboard-data')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, app: fakeApp });
    expect(telegramAppService.getDashboardAppData).toHaveBeenCalledTimes(1);
    // recordActivity fires only when app is present
    expect(telegramAppService.recordActivity).toHaveBeenCalledTimes(1);
  });

  test('does NOT record activity when service returns null (icon hidden)', async () => {
    setupAuthMocks(db);
    telegramAppService.getDashboardAppData.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/telegram-app/dashboard-data')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, app: null });
    expect(telegramAppService.recordActivity).not.toHaveBeenCalled();
  });

  test('recordActivity failure is swallowed (fire-and-forget)', async () => {
    setupAuthMocks(db);
    telegramAppService.getDashboardAppData.mockResolvedValue({ id: 'x' });
    telegramAppService.recordActivity.mockRejectedValueOnce(new Error('boom'));

    const response = await request(app)
      .get('/api/telegram-app/dashboard-data')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/telegram-app/settings
// ---------------------------------------------------------------------------
describe('PUT /api/telegram-app/settings', () => {
  testRequiresAuth(app, 'put', '/api/telegram-app/settings', {
    settings: { notifications: true },
  });

  test('returns 400 when settings body is missing', async () => {
    setupAuthMocks(db);

    const response = await request(app)
      .put('/api/telegram-app/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(telegramAppService.updateSettings).not.toHaveBeenCalled();
  });

  test('forwards settings to the service and returns the persisted object', async () => {
    setupAuthMocks(db);
    const persisted = { notifications: false, volume: 'low' };
    telegramAppService.updateSettings.mockResolvedValue(persisted);

    const response = await request(app)
      .put('/api/telegram-app/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ settings: { notifications: false, volume: 'low' } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, settings: persisted });
    expect(telegramAppService.updateSettings).toHaveBeenCalledWith(
      expect.any(Number),
      { notifications: false, volume: 'low' }
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/telegram-app/global-stats
// ---------------------------------------------------------------------------
describe('GET /api/telegram-app/global-stats', () => {
  testRequiresAuth(app, 'get', '/api/telegram-app/global-stats');

  test('returns stats from the service', async () => {
    setupAuthMocks(db);
    const stats = { totalUsers: 42, activeBots: 7, messagesLast24h: 1234 };
    telegramAppService.getGlobalStats.mockResolvedValue(stats);

    const response = await request(app)
      .get('/api/telegram-app/global-stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, stats });
  });
});

// ---------------------------------------------------------------------------
// POST /api/telegram-app/zero-config/cancel
// ---------------------------------------------------------------------------
describe('POST /api/telegram-app/zero-config/cancel', () => {
  testRequiresAuth(app, 'post', '/api/telegram-app/zero-config/cancel', {
    setupToken: 'tok',
  });

  test('returns 400 when setupToken is missing (schema)', async () => {
    setupAuthMocks(db);

    const response = await request(app)
      .post('/api/telegram-app/zero-config/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(telegramSetupPollingService.stopPolling).not.toHaveBeenCalled();
  });

  test('returns 404 when the session is not in a cancellable state', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
      if (sql.includes('active_sessions') && sql.includes('SELECT'))
        return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
      if (sql.includes('admin_users'))
        return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin' }] });
      // Route query: ownership lookup returns no row.
      if (sql.includes('FROM telegram_setup_sessions'))
        return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .post('/api/telegram-app/zero-config/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ setupToken: 'nope' });

    expect(response.status).toBe(404);
    expect(telegramSetupPollingService.stopPolling).not.toHaveBeenCalled();
  });

  test('happy path: stops polling, marks session failed, returns success', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
      if (sql.includes('active_sessions') && sql.includes('SELECT'))
        return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
      if (sql.includes('admin_users'))
        return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin' }] });
      // Ownership lookup succeeds.
      if (sql.includes('FROM telegram_setup_sessions'))
        return Promise.resolve({ rows: [{ id: 99 }] });
      // UPDATE
      if (sql.includes('UPDATE telegram_setup_sessions'))
        return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .post('/api/telegram-app/zero-config/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send({ setupToken: 'abc123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(telegramSetupPollingService.stopPolling).toHaveBeenCalledWith('abc123');

    const updates = db.query.mock.calls.filter(([sql]) =>
      sql.includes('UPDATE telegram_setup_sessions')
    );
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual(['abc123']);
  });
});

// ---------------------------------------------------------------------------
// POST /api/telegram-app/rules/:id/test
// ---------------------------------------------------------------------------
describe('POST /api/telegram-app/rules/:id/test', () => {
  testRequiresAuth(app, 'post', '/api/telegram-app/rules/1/test');

  test('returns 404 when rule or active bot config is missing', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
      if (sql.includes('active_sessions') && sql.includes('SELECT'))
        return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
      if (sql.includes('admin_users'))
        return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin' }] });
      if (sql.includes('telegram_notification_rules'))
        return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .post('/api/telegram-app/rules/1/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('happy path: sends Telegram test message with formatted template', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
      if (sql.includes('active_sessions') && sql.includes('SELECT'))
        return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
      if (sql.includes('admin_users'))
        return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin' }] });
      if (sql.includes('telegram_notification_rules')) {
        return Promise.resolve({
          rows: [{
            id: 7,
            name: 'CPU Alert',
            message_template: 'CPU bei {{event.value}}% am {{timestamp}}',
            bot_token_encrypted: 'enc-token',
            chat_id: '555',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    axios.post.mockResolvedValue({ data: { ok: true } });

    const response = await request(app)
      .post('/api/telegram-app/rules/7/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botplain-bot-token/sendMessage');
    expect(payload.chat_id).toBe('555');
    expect(payload.parse_mode).toBe('HTML');
    // Template placeholders must be substituted
    expect(payload.text).toContain('[TEST: value]');
    expect(payload.text).not.toContain('{{event.value}}');
    expect(payload.text).not.toContain('{{timestamp}}');
    // Rule name must be included for operator context
    expect(payload.text).toContain('CPU Alert');
  });

  test('surfaces Telegram API failure as 500 (no silent swallow)', async () => {
    db.query.mockImplementation((sql) => {
      if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
      if (sql.includes('active_sessions') && sql.includes('SELECT'))
        return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
      if (sql.includes('admin_users'))
        return Promise.resolve({ rows: [{ id: 1, username: 'admin', role: 'admin' }] });
      if (sql.includes('telegram_notification_rules')) {
        return Promise.resolve({
          rows: [{
            id: 8,
            name: 'Flaky',
            message_template: 'x',
            bot_token_encrypted: 'enc',
            chat_id: '1',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    axios.post.mockRejectedValueOnce(new Error('429 Too Many Requests'));

    const response = await request(app)
      .post('/api/telegram-app/rules/8/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
  });
});
