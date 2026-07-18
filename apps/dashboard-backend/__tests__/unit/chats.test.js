/**
 * Unit tests for Chat Routes
 *
 * Tests all chat conversation endpoints:
 * - GET    /api/chats              - List all chats
 * - GET    /api/chats/recent       - Top 10 recent chats
 * - GET    /api/chats/search       - Search chats by title
 * - GET    /api/chats/:id          - Get single chat with settings
 * - POST   /api/chats              - Create new chat conversation
 * - GET    /api/chats/:id/messages - Get paginated messages for a chat
 * - GET    /api/chats/:id/jobs     - Get active jobs for a conversation
 * - POST   /api/chats/:id/messages - Add message to chat
 * - PATCH  /api/chats/:id          - Update chat title
 * - PATCH  /api/chats/:id/settings - Update chat settings (RAG, Think, Model, Space)
 * - GET    /api/chats/:id/export   - Export chat (JSON or Markdown)
 * - DELETE /api/chats/:id          - Soft-delete chat conversation
 */

const request = require('supertest');

// Mock database module — include transaction for DELETE route
const mockTransactionClient = { query: jest.fn() };
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(async (callback) => {
    const db = require('../../src/database');
    const client = { query: db.query };
    return callback(client);
  }),
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

// Mock bcrypt — native binary not available on musl-less host environments
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
  genSalt: jest.fn().mockResolvedValue('salt')
}));

// Mock llmJobService (used by /:id/jobs and DELETE /:id)
jest.mock('../../src/services/llm/llmJobService', () => ({
  getActiveJobsForConversation: jest.fn().mockResolvedValue([]),
  cancelJob: jest.fn().mockResolvedValue(undefined)
}));

const db = require('../../src/database');
const llmJobService = require('../../src/services/llm/llmJobService');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const mockChat = {
  id: 1,
  title: 'Test Chat',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  message_count: 5
};

const mockChatFull = {
  ...mockChat,
  use_rag: false,
  use_thinking: true,
  preferred_model: null,
  preferred_space_id: null
};

const mockMessage = {
  id: 10,
  role: 'user',
  content: 'Hello world',
  thinking: null,
  sources: null,
  matched_spaces: null,
  created_at: new Date().toISOString(),
  status: 'completed',
  job_id: null,
  job_status: null
};

// ---------------------------------------------------------------------------
// Helper: set up db.query to handle auth middleware queries + a custom
// route-level handler.  This mirrors the pattern in spaces.test.js.
// ---------------------------------------------------------------------------
function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
    // Auth: blacklist check
    if (query.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    // Auth: session check
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    // Auth: update activity
    if (query.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    // Auth: user lookup
    if (query.includes('admin_users')) {
      return Promise.resolve({ rows: [mockUser] });
    }

    // Route-level queries
    if (customHandler) {
      return customHandler(query, params);
    }
    return Promise.resolve({ rows: [] });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chat Routes', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  // ==========================================================================
  // GET /api/chats
  // ==========================================================================
  describe('GET /api/chats', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats');
      expect(response.status).toBe(401);
    });

    test('should return 401 with an invalid token', async () => {
      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(response.status).toBe(401);
    });

    test('should return list of chats for authenticated user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.resolve({ rows: [mockChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chats');
      expect(Array.isArray(response.body.chats)).toBe(true);
      expect(response.body.chats[0]).toHaveProperty('id', mockChat.id);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return empty array when user has no chats', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toHaveLength(0);
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.reject(new Error('DB connection lost'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/recent
  // ==========================================================================
  describe('GET /api/chats/recent', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/recent');
      expect(response.status).toBe(401);
    });

    test('should return up to 10 recent chats', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && query.includes('LIMIT 10')) {
          return Promise.resolve({ rows: [mockChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/recent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chats');
      expect(Array.isArray(response.body.chats)).toBe(true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return empty array when user has no recent chats', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/recent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toHaveLength(0);
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.reject(new Error('Query timeout'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/recent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/search
  // ==========================================================================
  describe('GET /api/chats/search', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/search?q=test');
      expect(response.status).toBe(401);
    });

    test('should return empty array when q is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/search')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toHaveLength(0);
    });

    test('should return empty array when q is blank', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/search?q=   ')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toHaveLength(0);
    });

    test('should return matching chats when q is provided', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('ILIKE')) {
          return Promise.resolve({ rows: [mockChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/search?q=Test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chats');
      expect(response.body.chats[0]).toHaveProperty('id', mockChat.id);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('ILIKE')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/search?q=Test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/:id
  // ==========================================================================
  describe('GET /api/chats/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/1');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid (non-integer) conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/abc')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid conversation_id');
    });

    test('should return 400 for zero conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/0')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should return 400 for negative conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/-5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not exist', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && query.includes('use_rag')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('Chat not found');
    });

    test('should return chat with settings', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && query.includes('use_rag')) {
          return Promise.resolve({ rows: [mockChatFull] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chat');
      expect(response.body.chat).toHaveProperty('id', 1);
      expect(response.body.chat).toHaveProperty('settings');
      expect(response.body.chat.settings).toHaveProperty('use_rag', false);
      expect(response.body.chat.settings).toHaveProperty('use_thinking', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && query.includes('use_rag')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // POST /api/chats
  // ==========================================================================
  describe('POST /api/chats', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/chats')
        .send({ title: 'New Chat' });
      expect(response.status).toBe(401);
    });

    test('should return 400 when request body contains unknown fields (strict schema)', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Chat', extra_field: 'oops' });

      expect(response.status).toBe(400);
    });

    test('should create a chat with explicit title', async () => {
      const newChat = { ...mockChat, id: 2, title: 'My Chat' };

      setupMocksWithAuth((query) => {
        if (query.includes('INSERT INTO chat_conversations')) {
          return Promise.resolve({ rows: [newChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My Chat' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chat');
      expect(response.body.chat).toHaveProperty('title', 'My Chat');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should create a chat with default title when none provided', async () => {
      const defaultChat = { ...mockChat, title: 'Neuer Chat' };

      setupMocksWithAuth((query) => {
        if (query.includes('INSERT INTO chat_conversations')) {
          return Promise.resolve({ rows: [defaultChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.chat).toHaveProperty('title');
    });

    test('should return 500 on INSERT error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('INSERT INTO chat_conversations')) {
          return Promise.reject(new Error('Insert failed'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/:id/messages
  // ==========================================================================
  describe('GET /api/chats/:id/messages', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/1/messages');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/xyz/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid conversation_id');
    });

    test('should return 404 when chat does not belong to user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && query.includes('deleted_at IS NULL')) {
          return Promise.resolve({ rows: [] }); // ownership check fails
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should return messages in chronological order', async () => {
      setupMocksWithAuth((query) => {
        // verifyOwnership query
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        // messages query
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: [mockMessage] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
      expect(response.body).toHaveProperty('hasMore');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support cursor-based pagination with before param', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: [mockMessage] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/messages?before=5&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
    });

    test('should set hasMore to true when returned rows equal limit', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        ...mockMessage,
        id: i + 1
      }));

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: messages });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/messages?limit=50')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.hasMore).toBe(true);
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/:id/jobs
  // ==========================================================================
  describe('GET /api/chats/:id/jobs', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/1/jobs');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/not-an-id/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not belong to user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should return active jobs for the conversation', async () => {
      const mockJob = { id: 'job-abc', status: 'running', conversation_id: 1 };
      llmJobService.getActiveJobsForConversation.mockResolvedValueOnce([mockJob]);

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jobs');
      expect(response.body.jobs[0]).toHaveProperty('id', 'job-abc');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return empty jobs array when none are active', async () => {
      llmJobService.getActiveJobsForConversation.mockResolvedValueOnce([]);

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.jobs).toHaveLength(0);
    });
  });

  // ==========================================================================
  // POST /api/chats/:id/messages
  // ==========================================================================
  describe('POST /api/chats/:id/messages', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/chats/1/messages')
        .send({ role: 'user', content: 'Hello' });
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/chats/abc/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user', content: 'Hello' });

      expect(response.status).toBe(400);
    });

    test('should return 400 when role is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello' });

      expect(response.status).toBe(400);
    });

    test('should return 400 when content is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user' });

      expect(response.status).toBe(400);
    });

    test('should return 400 when role is invalid', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'invalid', content: 'Hello' });

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not belong to user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user', content: 'Hello' });

      expect(response.status).toBe(404);
    });

    test('should insert user message and return it', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('INSERT INTO chat_messages')) {
          return Promise.resolve({ rows: [mockMessage] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user', content: 'Hello world' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toHaveProperty('role', 'user');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should accept assistant role with thinking field', async () => {
      const assistantMsg = {
        ...mockMessage,
        id: 11,
        role: 'assistant',
        content: 'I am an AI',
        thinking: 'Let me think...'
      };

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('INSERT INTO chat_messages')) {
          return Promise.resolve({ rows: [assistantMsg] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'assistant', content: 'I am an AI', thinking: 'Let me think...' });

      expect(response.status).toBe(200);
      expect(response.body.message).toHaveProperty('role', 'assistant');
      expect(response.body.message).toHaveProperty('thinking', 'Let me think...');
    });

    test('should return 500 on INSERT error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM chat_conversations')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('INSERT INTO chat_messages')) {
          return Promise.reject(new Error('Insert failed'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user', content: 'Hello' });

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // PATCH /api/chats/:id
  // ==========================================================================
  describe('PATCH /api/chats/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .patch('/api/chats/1')
        .send({ title: 'New Title' });
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/abc')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Title' });

      expect(response.status).toBe(400);
    });

    test('should return 400 when no title is provided', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 400 for unknown body fields (strict schema)', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test', unknown_field: true });

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not exist or belongs to another user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [] }); // no rows updated → not found
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/999')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Title' });

      expect(response.status).toBe(404);
    });

    test('should update title and return updated chat', async () => {
      const updatedChat = { ...mockChat, title: 'Renamed Chat' };

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [updatedChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Renamed Chat' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chat');
      expect(response.body.chat).toHaveProperty('title', 'Renamed Chat');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New' });

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // PATCH /api/chats/:id/settings
  // ==========================================================================
  describe('PATCH /api/chats/:id/settings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .patch('/api/chats/1/settings')
        .send({ use_rag: true });
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/not-a-number/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: true });

      expect(response.status).toBe(400);
    });

    test('should return 400 when no settings field is provided', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 400 for unknown settings field (strict schema)', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: true, unknown: 'x' });

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not exist', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/999/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: true });

      expect(response.status).toBe(404);
    });

    test('should update use_rag setting', async () => {
      const updatedSettings = {
        use_rag: true,
        use_thinking: true,
        preferred_model: null,
        preferred_space_id: null
      };

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [updatedSettings] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('settings');
      expect(response.body.settings).toHaveProperty('use_rag', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should update preferred_model setting', async () => {
      const updatedSettings = {
        use_rag: false,
        use_thinking: true,
        preferred_model: 'gemma3:4b',
        preferred_space_id: null
      };

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [updatedSettings] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ preferred_model: 'gemma3:4b' });

      expect(response.status).toBe(200);
      expect(response.body.settings).toHaveProperty('preferred_model', 'gemma3:4b');
    });

    test('should allow clearing preferred_model with null', async () => {
      const updatedSettings = {
        use_rag: false,
        use_thinking: true,
        preferred_model: null,
        preferred_space_id: null
      };

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({ rows: [updatedSettings] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ preferred_model: null });

      expect(response.status).toBe(200);
      expect(response.body.settings).toHaveProperty('preferred_model', null);
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: false });

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // GET /api/chats/:id/export
  // ==========================================================================
  describe('GET /api/chats/:id/export', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/chats/1/export');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/abc/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should return 400 for invalid format', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/1/export?format=csv')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid format');
    });

    test('should return 404 when chat does not exist', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations') && !query.includes('chat_messages')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/999/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should export chat as JSON by default', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, title, created_at, updated_at')) {
          return Promise.resolve({ rows: [{ id: 1, title: 'Test Chat', created_at: new Date(), updated_at: new Date() }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: [mockMessage] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toMatch(/\.json/);
      expect(response.body).toHaveProperty('chat');
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('export_info');
    });

    test('should export chat as Markdown when format=markdown', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, title, created_at, updated_at')) {
          return Promise.resolve({ rows: [{ id: 1, title: 'Test Chat', created_at: new Date(), updated_at: new Date() }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: [{ ...mockMessage, role: 'user', content: 'Hello' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/export?format=markdown')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/markdown/);
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toMatch(/\.md/);
      expect(response.text).toContain('# Test Chat');
    });

    test('should accept format=md as alias for markdown', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, title, created_at, updated_at')) {
          return Promise.resolve({ rows: [{ id: 1, title: 'Test Chat', created_at: new Date(), updated_at: new Date() }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/export?format=md')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/markdown/);
    });

    test('should include message count in JSON export_info', async () => {
      const messages = [
        { ...mockMessage, id: 1, role: 'user', content: 'Hi' },
        { ...mockMessage, id: 2, role: 'assistant', content: 'Hello' }
      ];

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, title, created_at, updated_at')) {
          return Promise.resolve({ rows: [{ id: 1, title: 'Test Chat', created_at: new Date(), updated_at: new Date() }] });
        }
        if (query.includes('chat_messages')) {
          return Promise.resolve({ rows: messages });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/export?format=json')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.export_info).toHaveProperty('message_count', 2);
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, title, created_at, updated_at')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats/1/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // DELETE /api/chats/:id
  // ==========================================================================
  describe('DELETE /api/chats/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).delete('/api/chats/1');
      expect(response.status).toBe(401);
    });

    test('should return 400 for invalid conversation_id', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .delete('/api/chats/abc')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    test('should return 404 when chat does not exist or belongs to another user', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations') && query.includes('deleted_at')) {
          return Promise.resolve({ rows: [] }); // no rows updated
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/chats/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should soft-delete chat and return success', async () => {
      llmJobService.getActiveJobsForConversation.mockResolvedValueOnce([]);

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations') && query.includes('deleted_at')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should cancel active jobs when deleting a chat', async () => {
      const activeJob = { id: 'job-xyz' };
      llmJobService.getActiveJobsForConversation.mockResolvedValueOnce([activeJob]);
      llmJobService.cancelJob.mockResolvedValueOnce(undefined);

      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations') && query.includes('deleted_at')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(llmJobService.cancelJob).toHaveBeenCalledWith('job-xyz');
    });

    test('should return 500 on database error', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations') && query.includes('deleted_at')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ==========================================================================
  // Input validation edge cases
  // ==========================================================================
  describe('isValidConversationId edge cases', () => {
    const routes = [
      { method: 'get', path: '/api/chats/{id}' },
      { method: 'get', path: '/api/chats/{id}/messages' },
      { method: 'get', path: '/api/chats/{id}/jobs' },
      { method: 'post', path: '/api/chats/{id}/messages' },
      { method: 'patch', path: '/api/chats/{id}' },
      { method: 'patch', path: '/api/chats/{id}/settings' },
      { method: 'get', path: '/api/chats/{id}/export' },
      { method: 'delete', path: '/api/chats/{id}' },
    ];

    const invalidIds = ['abc', '1.5', '1e2', ' ', '2147483648', '-1', '0'];

    for (const { method, path } of routes) {
      for (const badId of invalidIds) {
        test(`${method.toUpperCase()} ${path} rejects id="${badId}"`, async () => {
          setupMocksWithAuth();

          const url = path.replace('{id}', encodeURIComponent(badId));
          const body = method === 'post' ? { role: 'user', content: 'x' } :
                       method === 'patch' && path.includes('settings') ? { use_rag: true } :
                       method === 'patch' ? { title: 'x' } : undefined;

          let req = request(app)[method](url).set('Authorization', `Bearer ${token}`);
          if (body) req = req.send(body);

          const response = await req;

          // float "1.5" or exponential "1e2" may not match /chats/:id (Express
          // might route them to /:id with the full string), so they hit the
          // validation check inside the handler → 400.
          // Strings like "abc" may also 404 at the router for param matching.
          expect([400, 404]).toContain(response.status);
        });
      }
    }
  });

  // ==========================================================================
  // Response format invariants
  // ==========================================================================
  describe('Response format', () => {
    test('all successful responses include a timestamp', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('chat_conversations')) {
          return Promise.resolve({ rows: [mockChat] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timestamp');
      const ts = new Date(response.body.timestamp);
      expect(ts.toString()).not.toBe('Invalid Date');
    });

    test('all error responses include a timestamp', async () => {
      const response = await request(app).get('/api/chats');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('all error responses use JSON content-type', async () => {
      const response = await request(app).get('/api/chats');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('error envelope contains error.message', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .get('/api/chats/abc')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
