/**
 * Unit tests for Telegram App Routes
 *
 * Tests the Telegram Bot App API endpoints:
 * - Zero-Config Setup endpoints
 * - Notification Rules CRUD
 * - Orchestrator endpoints
 * - Bot Config endpoints
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

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

// Mock websocket service (virtual - doesn't exist yet)
jest.mock('../../src/services/websocketService', () => ({
  broadcast: jest.fn()
}), { virtual: true });

const db = require('../../src/database');
const axios = require('axios');
const { app } = require('../../src/server');
const { generateTestToken } = require('../helpers/authMock');

// Mock user and session for auth
const mockUser = { id: 1, username: 'admin', role: 'admin', is_active: true };
const mockSession = { user_id: 1, token_hash: 'hash' };

/**
 * Setup database mocks that handle both auth middleware queries
 * and custom route queries.
 */
function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
    // Auth middleware queries
    if (query.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    if (query.includes('admin_users')) {
      return Promise.resolve({ rows: [mockUser] });
    }
    // Custom query handler
    if (customHandler) {
      return customHandler(query, params);
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('Telegram App Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  // ============================================================================
  // Zero-Config Setup Endpoints
  // ============================================================================
  describe('Zero-Config Setup', () => {
    describe('POST /api/telegram-app/zero-config/init', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .post('/api/telegram-app/zero-config/init');

        expect(response.status).toBe(401);
      });

      test('should initialize setup session with valid token', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('INSERT INTO telegram_setup_sessions')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .post('/api/telegram-app/zero-config/init')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.setupToken).toBeDefined();
        expect(response.body.expiresIn).toBe(600);
      });
    });

    describe('POST /api/telegram-app/zero-config/token', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .post('/api/telegram-app/zero-config/token')
          .send({ setupToken: 'test', botToken: 'test' });

        expect(response.status).toBe(401);
      });

      test('should return 400 if setupToken or botToken is missing', async () => {
        setupMocksWithAuth();

        const response = await request(app)
          .post('/api/telegram-app/zero-config/token')
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(response.status).toBe(400);
      });

      test('should validate bot token with Telegram API', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_setup_sessions')) {
            return Promise.resolve({
              rows: [{ setup_token: 'test-token', user_id: 1, status: 'pending' }]
            });
          }
          if (query.includes('UPDATE telegram_setup_sessions')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        axios.get.mockResolvedValueOnce({
          data: {
            ok: true,
            result: {
              username: 'testbot',
              first_name: 'Test Bot',
              can_join_groups: true,
              can_read_all_group_messages: false
            }
          }
        });

        const response = await request(app)
          .post('/api/telegram-app/zero-config/token')
          .set('Authorization', `Bearer ${token}`)
          .send({ setupToken: 'test-token', botToken: '123456:ABC-TEST' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.botInfo.username).toBe('testbot');
        expect(response.body.deepLink).toContain('t.me/testbot');
      });

      test('should return 404 if session not found', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_setup_sessions')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .post('/api/telegram-app/zero-config/token')
          .set('Authorization', `Bearer ${token}`)
          .send({ setupToken: 'invalid-token', botToken: '123456:ABC' });

        expect(response.status).toBe(404);
      });
    });

    describe('GET /api/telegram-app/zero-config/status/:token', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/zero-config/status/test-token');

        expect(response.status).toBe(401);
      });

      test('should return session status', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_setup_sessions')) {
            return Promise.resolve({
              rows: [{
                status: 'waiting_start',
                chat_id: null,
                chat_username: null,
                chat_first_name: null,
                bot_username: 'testbot'
              }]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/zero-config/status/test-token')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('waiting_start');
        expect(response.body.botUsername).toBe('testbot');
      });
    });

    describe('POST /api/telegram-app/zero-config/chat-detected', () => {
      test('should complete setup when chat is detected', async () => {
        db.query.mockImplementation((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_setup_sessions')) {
            return Promise.resolve({
              rows: [{ setup_token: 'test', status: 'waiting_start' }]
            });
          }
          if (query.includes('complete_telegram_setup')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .post('/api/telegram-app/zero-config/chat-detected')
          .send({
            setupToken: 'test-token',
            chatId: '123456789',
            username: 'testuser',
            firstName: 'Test'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  // ============================================================================
  // Notification Rules Endpoints
  // ============================================================================
  describe('Notification Rules', () => {
    describe('GET /api/telegram-app/rules', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/rules');

        expect(response.status).toBe(401);
      });

      test('should return list of notification rules', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_notification_rules')) {
            return Promise.resolve({
              rows: [
                {
                  id: 1,
                  name: 'CPU Alert',
                  event_source: 'system',
                  event_type: 'cpu_high',
                  is_enabled: true
                },
                {
                  id: 2,
                  name: 'Service Down',
                  event_source: 'system',
                  event_type: 'service_down',
                  is_enabled: true
                }
              ]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/rules')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.rules).toHaveLength(2);
        expect(response.body.total).toBe(2);
      });
    });

    describe('POST /api/telegram-app/rules', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .post('/api/telegram-app/rules')
          .send({ name: 'Test Rule' });

        expect(response.status).toBe(401);
      });

      test('should return 400 if required fields missing', async () => {
        setupMocksWithAuth();

        const response = await request(app)
          .post('/api/telegram-app/rules')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Test Rule' });

        expect(response.status).toBe(400);
      });

      test('should create notification rule with valid data', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('INSERT INTO telegram_notification_rules')) {
            return Promise.resolve({
              rows: [{
                id: 1,
                name: 'CPU Alert',
                event_source: 'system',
                event_type: 'cpu_high',
                message_template: 'CPU at {{event.value}}%',
                is_enabled: true
              }]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .post('/api/telegram-app/rules')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'CPU Alert',
            eventSource: 'system',
            eventType: 'cpu_high',
            messageTemplate: 'CPU at {{event.value}}%'
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.rule.name).toBe('CPU Alert');
      });
    });

    describe('PUT /api/telegram-app/rules/:id', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .put('/api/telegram-app/rules/1')
          .send({ name: 'Updated Rule' });

        expect(response.status).toBe(401);
      });

      test('should update notification rule', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_notification_rules')) {
            return Promise.resolve({ rows: [{ id: 1 }] });
          }
          if (query.includes('UPDATE telegram_notification_rules')) {
            return Promise.resolve({
              rows: [{ id: 1, name: 'Updated Rule', is_enabled: false }]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .put('/api/telegram-app/rules/1')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Updated Rule', isEnabled: false });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test('should return 404 if rule not found', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_notification_rules')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .put('/api/telegram-app/rules/999')
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'Updated Rule' });

        expect(response.status).toBe(404);
      });
    });

    describe('DELETE /api/telegram-app/rules/:id', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .delete('/api/telegram-app/rules/1');

        expect(response.status).toBe(401);
      });

      test('should delete notification rule', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('DELETE FROM telegram_notification_rules')) {
            return Promise.resolve({ rows: [{ id: 1, name: 'Deleted Rule' }] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .delete('/api/telegram-app/rules/1')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test('should return 404 if rule not found', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('DELETE FROM telegram_notification_rules')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .delete('/api/telegram-app/rules/999')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
      });
    });
  });

  // ============================================================================
  // Orchestrator Endpoints
  // ============================================================================
  describe('Orchestrator', () => {
    describe('GET /api/telegram-app/orchestrator/status', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/orchestrator/status');

        expect(response.status).toBe(401);
      });

      test('should return orchestrator status', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_orchestrator_state')) {
            return Promise.resolve({
              rows: [
                {
                  agent_type: 'setup',
                  state: 'idle',
                  last_action: new Date(),
                  actions_count: 10,
                  thinking_entries: 5
                }
              ]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/orchestrator/status')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.agents).toBeDefined();
      });
    });

    describe('GET /api/telegram-app/orchestrator/thinking/:agentType', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/orchestrator/thinking/setup');

        expect(response.status).toBe(401);
      });

      test('should return thinking logs for agent', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('thinking_log')) {
            return Promise.resolve({
              rows: [{
                thinking_log: [
                  { timestamp: '2026-01-25T10:00:00Z', message: 'Thinking...' },
                  { timestamp: '2026-01-25T10:00:01Z', message: 'Done' }
                ]
              }]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/orchestrator/thinking/setup')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.agentType).toBe('setup');
        expect(response.body.thinkingLog).toHaveLength(2);
      });
    });
  });

  // ============================================================================
  // Bot Config Endpoints
  // ============================================================================
  describe('Bot Config', () => {
    describe('GET /api/telegram-app/config', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/config');

        expect(response.status).toBe(401);
      });

      test('should return bot configuration', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_bot_configs')) {
            return Promise.resolve({
              rows: [{
                chat_id: '123456789',
                bot_username: 'testbot',
                notifications_enabled: true,
                is_active: true
              }]
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/config')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.configured).toBe(true);
        expect(response.body.config.bot_username).toBe('testbot');
      });

      test('should return configured: false if not configured', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('SELECT') && query.includes('telegram_bot_configs')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/config')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.configured).toBe(false);
      });
    });

    describe('PUT /api/telegram-app/config', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .put('/api/telegram-app/config')
          .send({ notificationsEnabled: false });

        expect(response.status).toBe(401);
      });

      test('should update bot configuration', async () => {
        setupMocksWithAuth((query, params) => {
          if (query.includes('UPDATE telegram_bot_configs')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .put('/api/telegram-app/config')
          .set('Authorization', `Bearer ${token}`)
          .send({
            notificationsEnabled: false,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/telegram-app/history', () => {
      test('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/telegram-app/history');

        expect(response.status).toBe(401);
      });

      test('should return notification history', async () => {
        setupMocksWithAuth((query, params) => {
          // Match the history query (has LIMIT)
          if (query.includes('telegram_notification_history') && query.includes('LIMIT')) {
            return Promise.resolve({
              rows: [
                { id: 1, rule_name: 'CPU Alert', created_at: '2026-01-25T10:00:00Z' },
                { id: 2, rule_name: 'Service Down', created_at: '2026-01-25T09:00:00Z' }
              ]
            });
          }
          // Match the count query (has COUNT)
          if (query.includes('COUNT') && query.includes('telegram_notification_history')) {
            return Promise.resolve({ rows: [{ count: '2' }] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/history')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.history).toHaveLength(2);
        expect(response.body.total).toBe(2);
      });

      test('should accept limit and offset parameters', async () => {
        setupMocksWithAuth((query, params) => {
          // Match the history query (has LIMIT)
          if (query.includes('telegram_notification_history') && query.includes('LIMIT')) {
            return Promise.resolve({ rows: [] });
          }
          // Match the count query (has COUNT)
          if (query.includes('COUNT') && query.includes('telegram_notification_history')) {
            return Promise.resolve({ rows: [{ count: '100' }] });
          }
          return Promise.resolve({ rows: [] });
        });

        const response = await request(app)
          .get('/api/telegram-app/history?limit=10&offset=20')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.limit).toBe(10);
        expect(response.body.offset).toBe(20);
      });
    });
  });
});
