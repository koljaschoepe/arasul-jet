/**
 * Unit tests for Projects Routes
 *
 * Tests all project endpoints:
 * - GET    /api/projects                - List all projects
 * - POST   /api/projects                - Create project
 * - GET    /api/projects/:id            - Get project details
 * - PUT    /api/projects/:id            - Update project
 * - DELETE /api/projects/:id            - Delete project
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

jest.mock('../../src/services/telegram/telegramNotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true),
  sendAlert: jest.fn().mockResolvedValue(true)
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

const mockProject = {
  id: 'test-uuid-1234',
  name: 'Test Projekt',
  description: 'Ein Testprojekt',
  system_prompt: 'Du bist ein hilfreicher Assistent.',
  icon: 'folder',
  color: '#45ADFF',
  knowledge_space_id: null,
  sort_order: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

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

describe('Projects Routes', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionClient.query.mockReset();
  });

  // ===========================================
  // GET /api/projects
  // ===========================================
  describe('GET /api/projects', () => {
    test('returns list of projects', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM projects')) {
          return Promise.resolve({
            rows: [{ ...mockProject, conversation_count: '2', space_name: null }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.projects).toBeDefined();
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.projects[0].name).toBe('Test Projekt');
    });

    test('includes conversations when requested', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM projects')) {
          return Promise.resolve({
            rows: [{ ...mockProject, conversation_count: '1', space_name: null }]
          });
        }
        if (query.includes('FROM chat_conversations') && query.includes('project_id IS NOT NULL')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Test Chat', project_id: mockProject.id,
              updated_at: new Date().toISOString(), message_count: 5
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/projects?include=conversations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.projects[0].conversations).toBeDefined();
      expect(res.body.projects[0].conversations).toHaveLength(1);
    });

    test('returns empty list when no projects', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM projects')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.projects).toEqual([]);
    });

    test('requires authentication', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
    });
  });

  // ===========================================
  // POST /api/projects
  // ===========================================
  describe('POST /api/projects', () => {
    test('creates a project with valid data', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('INSERT INTO projects')) {
          return Promise.resolve({ rows: [mockProject] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Projekt', system_prompt: 'Du bist ein Assistent.' });

      expect(res.status).toBe(200);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.name).toBe('Test Projekt');
    });

    test('rejects empty name', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    test('rejects missing name', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No name' });

      expect(res.status).toBe(400);
    });

    test('rejects name over 100 chars', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'A'.repeat(101) });

      expect(res.status).toBe(400);
    });

    test('validates knowledge_space_id exists', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('knowledge_spaces') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [] }); // Space not found
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', knowledge_space_id: 'nonexistent-uuid' });

      expect(res.status).toBe(400);
    });

    test('creates project with knowledge_space_id', async () => {
      const spaceId = 'valid-space-uuid';
      setupMocksWithAuth((query) => {
        if (query.includes('knowledge_spaces') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [{ id: spaceId }] });
        }
        if (query.includes('INSERT INTO projects')) {
          return Promise.resolve({
            rows: [{ ...mockProject, knowledge_space_id: spaceId }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', knowledge_space_id: spaceId });

      expect(res.status).toBe(200);
      expect(res.body.project.knowledge_space_id).toBe(spaceId);
    });
  });

  // ===========================================
  // GET /api/projects/:id
  // ===========================================
  describe('GET /api/projects/:id', () => {
    test('returns project with conversations', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM projects') && query.includes('WHERE p.id')) {
          return Promise.resolve({
            rows: [{ ...mockProject, space_name: null }]
          });
        }
        if (query.includes('FROM chat_conversations') && query.includes('project_id')) {
          return Promise.resolve({
            rows: [
              { id: 1, title: 'Chat 1', updated_at: new Date().toISOString(), message_count: 3 },
              { id: 2, title: 'Chat 2', updated_at: new Date().toISOString(), message_count: 7 },
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get(`/api/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe('Test Projekt');
      expect(res.body.project.conversations).toHaveLength(2);
    });

    test('returns 404 for nonexistent project', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM projects')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/projects/nonexistent-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // PUT /api/projects/:id
  // ===========================================
  describe('PUT /api/projects/:id', () => {
    test('updates project name', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE projects')) {
          return Promise.resolve({
            rows: [{ ...mockProject, name: 'Updated Name' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put(`/api/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe('Updated Name');
    });

    test('updates system prompt', async () => {
      const newPrompt = 'Du bist ein Experte für JavaScript.';
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE projects')) {
          return Promise.resolve({
            rows: [{ ...mockProject, system_prompt: newPrompt }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put(`/api/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ system_prompt: newPrompt });

      expect(res.status).toBe(200);
      expect(res.body.project.system_prompt).toBe(newPrompt);
    });

    test('returns 404 for nonexistent project', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE projects')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .put('/api/projects/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    test('rejects empty name', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .put(`/api/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // DELETE /api/projects/:id
  // ===========================================
  describe('DELETE /api/projects/:id', () => {
    test('deletes project and reassigns conversations to default', async () => {
      const defaultProjectId = 'default-project-uuid';
      setupMocksWithAuth((query, params) => {
        // Check if project exists (before transaction)
        if (query.includes('SELECT') && query.includes('is_default') && query.includes('WHERE id')) {
          return Promise.resolve({ rows: [{ id: mockProject.id, is_default: false }] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Transaction client handles the atomic operations
      mockTransactionClient.query
        .mockResolvedValueOnce({ rows: [{ id: defaultProjectId }] })  // SELECT default project
        .mockResolvedValueOnce({ rowCount: 2 })                       // UPDATE conversations
        .mockResolvedValueOnce({ rows: [{ id: mockProject.id }] });   // DELETE project

      const res = await request(app)
        .delete(`/api/projects/${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify transaction was used
      expect(db.transaction).toHaveBeenCalled();
      // Verify conversations were reassigned inside transaction
      const updateCall = mockTransactionClient.query.mock.calls.find(
        ([q]) => q.includes('UPDATE chat_conversations') && q.includes('project_id = $1')
      );
      expect(updateCall).toBeDefined();
    });

    test('returns 400 when trying to delete default project', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT') && query.includes('is_default') && query.includes('WHERE id')) {
          return Promise.resolve({ rows: [{ id: 'default-id', is_default: true }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .delete('/api/projects/default-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Standard-Projekt');
    });

    test('returns 404 for nonexistent project', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT') && query.includes('is_default') && query.includes('WHERE id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .delete('/api/projects/nonexistent-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ===========================================
  // Chat project_id support
  // ===========================================
  describe('Chat project_id integration', () => {
    test('POST /api/chats creates chat with project_id', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('INSERT INTO chat_conversations')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Neuer Chat', project_id: mockProject.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 0
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Neuer Chat', project_id: mockProject.id });

      expect(res.status).toBe(200);
      expect(res.body.chat.project_id).toBe(mockProject.id);
    });

    test('POST /api/chats falls back to default project when no project_id', async () => {
      const defaultProjectId = 'default-project-uuid';
      setupMocksWithAuth((query) => {
        if (query.includes('is_default = TRUE')) {
          return Promise.resolve({ rows: [{ id: defaultProjectId }] });
        }
        if (query.includes('INSERT INTO chat_conversations')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Neuer Chat', project_id: defaultProjectId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 0
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Neuer Chat' });

      expect(res.status).toBe(200);
      expect(res.body.chat.project_id).toBe(defaultProjectId);
    });

    test('GET /api/chats returns project_id', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM chat_conversations') && query.includes('WHERE deleted_at IS NULL')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Test', project_id: mockProject.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 0
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats[0].project_id).toBe(mockProject.id);
    });

    test('GET /api/chats?project_id filters by project', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('FROM chat_conversations') && query.includes('project_id = $')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Project Chat', project_id: mockProject.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 3
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get(`/api/chats?project_id=${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].project_id).toBe(mockProject.id);
    });

    test('PATCH /api/chats/:id updates project_id', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE chat_conversations')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Test', project_id: mockProject.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              message_count: 0
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ project_id: mockProject.id });

      expect(res.status).toBe(200);
      expect(res.body.chat.project_id).toBe(mockProject.id);
    });
  });

  // ===========================================
  // GET /api/chats/recent
  // ===========================================
  describe('GET /api/chats/recent', () => {
    test('returns top 10 recent chats with project info', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM chat_conversations') && query.includes('project_name') && query.includes('LIMIT 10')) {
          return Promise.resolve({
            rows: [
              {
                id: 1, title: 'Recent Chat 1', project_id: mockProject.id,
                updated_at: new Date().toISOString(), message_count: 5,
                project_name: 'Test Projekt', project_color: '#45ADFF'
              },
              {
                id: 2, title: 'Recent Chat 2', project_id: mockProject.id,
                updated_at: new Date().toISOString(), message_count: 3,
                project_name: 'Test Projekt', project_color: '#45ADFF'
              }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/chats/recent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(2);
      expect(res.body.chats[0].project_name).toBe('Test Projekt');
      expect(res.body.chats[0].project_color).toBe('#45ADFF');
    });

    test('requires authentication', async () => {
      const res = await request(app).get('/api/chats/recent');
      expect(res.status).toBe(401);
    });
  });

  // ===========================================
  // GET /api/chats/search
  // ===========================================
  describe('GET /api/chats/search', () => {
    test('searches chats by title', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('ILIKE')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'JavaScript Fragen', project_id: mockProject.id,
              updated_at: new Date().toISOString(), message_count: 10,
              project_name: 'Test Projekt', project_color: '#45ADFF'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get('/api/chats/search?q=JavaScript')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
      expect(res.body.chats[0].title).toBe('JavaScript Fragen');
    });

    test('returns empty array for empty query', async () => {
      setupMocksWithAuth();

      const res = await request(app)
        .get('/api/chats/search?q=')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toEqual([]);
    });

    test('filters by project_id', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('ILIKE') && query.includes('project_id = $')) {
          return Promise.resolve({
            rows: [{
              id: 1, title: 'Test Chat', project_id: mockProject.id,
              updated_at: new Date().toISOString(), message_count: 2,
              project_name: 'Test Projekt', project_color: '#45ADFF'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await request(app)
        .get(`/api/chats/search?q=Test&project_id=${mockProject.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.chats).toHaveLength(1);
    });

    test('requires authentication', async () => {
      const res = await request(app).get('/api/chats/search?q=test');
      expect(res.status).toBe(401);
    });
  });
});
