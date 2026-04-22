/**
 * Integration tests for /api/chats/*
 *
 * Covers the full chat CRUD surface: list/recent/search, single read with
 * project join, create (with default-project fallback), messages GET
 * (including the inline orphan-recovery path for stuck streaming messages),
 * jobs listing, message append, PATCH title/settings, export (JSON +
 * Markdown), and DELETE (soft-delete + job cancellation).
 *
 * DB and llmJobService are mocked. DB transactions are stubbed by
 * invoking the caller's callback with a fake client whose .query
 * delegates to db.query — the route logic sees one query surface.
 */

const request = require('supertest');
const {
  generateTestToken,
  setupAuthMocks,
  mockUser,
  testRequiresAuth,
} = require('../helpers/authMock');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/llm/llmJobService', () => ({
  getActiveJobsForConversation: jest.fn().mockResolvedValue([]),
  cancelJob: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const llmJobService = require('../../src/services/llm/llmJobService');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

// Transaction stub: call the user's callback with a client.query that
// just delegates to the same db.query mock the rest of the test relies on.
db.transaction = jest.fn(async (callback) => {
  const client = { query: (...args) => db.query(...args) };
  return callback(client);
});

/**
 * Installs a db.query handler that satisfies the auth middleware first,
 * then falls through to the route-specific handler.
 */
function authedDb(handler) {
  return (sql, params) => {
    if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (sql.includes('active_sessions') && sql.includes('SELECT'))
      return Promise.resolve({ rows: [{ id: 1 }] });
    if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (sql.includes('admin_users')) return Promise.resolve({ rows: [mockUser] });
    return handler(sql, params);
  };
}

describe('Chats API', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.transaction.mockImplementation(async (callback) => {
      const client = { query: (...args) => db.query(...args) };
      return callback(client);
    });
    llmJobService.getActiveJobsForConversation.mockReset().mockResolvedValue([]);
    llmJobService.cancelJob.mockReset().mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // GET /
  // ---------------------------------------------------------------------------
  describe('GET /api/chats', () => {
    testRequiresAuth(app, 'get', '/api/chats');

    test('returns user-scoped chats with user_id bound', async () => {
      const rows = [
        { id: 1, title: 'Chat A', project_id: 7, created_at: '', updated_at: '', message_count: 3 },
      ];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/FROM chat_conversations/);
          expect(sql).not.toMatch(/project_id = \$2/);
          expect(params).toEqual([mockUser.id]);
          return Promise.resolve({ rows });
        })
      );

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toEqual(rows);
    });

    test('applies project_id filter when query param present', async () => {
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/project_id = \$2/);
          expect(params).toEqual([mockUser.id, '42']);
          return Promise.resolve({ rows: [] });
        })
      );

      await request(app)
        .get('/api/chats?project_id=42')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /recent
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/recent', () => {
    testRequiresAuth(app, 'get', '/api/chats/recent');

    test('returns top-10 recent with project join', async () => {
      const rows = [
        {
          id: 1,
          title: 'Recent',
          project_id: 7,
          updated_at: '',
          message_count: 5,
          project_name: 'Main',
          project_color: '#fff',
        },
      ];
      db.query.mockImplementation(
        authedDb((sql) => {
          expect(sql).toMatch(/LEFT JOIN projects p ON c.project_id = p.id/);
          expect(sql).toMatch(/LIMIT 10/);
          return Promise.resolve({ rows });
        })
      );

      const response = await request(app)
        .get('/api/chats/recent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.chats).toEqual(rows);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /search
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/search', () => {
    testRequiresAuth(app, 'get', '/api/chats/search');

    test('returns empty array when q is blank', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/chats/search?q=%20')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chats).toEqual([]);
    });

    test('passes trimmed %ILIKE% pattern and project_id to the query', async () => {
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/title ILIKE \$2/);
          expect(params).toEqual([mockUser.id, '%hello%', '9']);
          return Promise.resolve({ rows: [{ id: 1 }] });
        })
      );

      await request(app)
        .get('/api/chats/search?q=%20hello%20&project_id=9')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/:id', () => {
    testRequiresAuth(app, 'get', '/api/chats/1');

    test('rejects non-positive-integer ids', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/chats/abc')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Invalid conversation_id/);
    });

    test('returns 404 when chat not owned or missing', async () => {
      db.query.mockImplementation(
        authedDb(() => Promise.resolve({ rows: [] }))
      );
      const response = await request(app)
        .get('/api/chats/999')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('flattens chat + project + settings on success', async () => {
      db.query.mockImplementation(
        authedDb(() =>
          Promise.resolve({
            rows: [
              {
                id: 5,
                title: 'T',
                project_id: 7,
                created_at: '',
                updated_at: '',
                message_count: 2,
                use_rag: true,
                use_thinking: null,
                preferred_model: 'gemma',
                preferred_space_id: null,
                project_name: 'Main',
                project_description: 'desc',
                project_system_prompt: 'sys',
                project_icon: 'icon',
                project_color: '#fff',
                project_space_id: 'space-1',
              },
            ],
          })
        )
      );

      const response = await request(app)
        .get('/api/chats/5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.chat).toMatchObject({
        id: 5,
        settings: {
          use_rag: true,
          use_thinking: true, // nullish-coalescing default
          preferred_model: 'gemma',
          preferred_space_id: null,
        },
      });
      expect(response.body.project).toMatchObject({
        id: 7,
        name: 'Main',
        knowledge_space_id: 'space-1',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /
  // ---------------------------------------------------------------------------
  describe('POST /api/chats', () => {
    testRequiresAuth(app, 'post', '/api/chats', {});

    test('falls back to default project when project_id omitted', async () => {
      const capturedInserts = [];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('is_default = TRUE')) {
            return Promise.resolve({ rows: [{ id: 99 }] });
          }
          if (sql.includes('INSERT INTO chat_conversations')) {
            capturedInserts.push(params);
            return Promise.resolve({
              rows: [
                {
                  id: 100,
                  title: params[0],
                  project_id: params[1],
                  created_at: '',
                  updated_at: '',
                  message_count: 0,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My chat' });

      expect(response.status).toBe(200);
      expect(response.body.chat.project_id).toBe(99);
      expect(capturedInserts[0]).toEqual(['My chat', 99, mockUser.id]);
    });

    test('returns 503 when no default project exists', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('is_default = TRUE')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(503);
      expect(response.body.error.message).toMatch(/Standard-Projekt/);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id/messages  (includes orphan recovery)
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/:id/messages', () => {
    testRequiresAuth(app, 'get', '/api/chats/1/messages');

    test('returns 404 when chat not owned', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          // verifyOwnership returns no rows → 404
          if (sql.includes('SELECT id FROM chat_conversations')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('returns chronological messages and hasMore flag', async () => {
      const messages = [
        {
          id: 2,
          role: 'assistant',
          content: 'B',
          thinking: null,
          sources: null,
          matched_spaces: null,
          created_at: '',
          status: 'completed',
          job_id: null,
          job_status: null,
        },
        {
          id: 1,
          role: 'user',
          content: 'A',
          thinking: null,
          sources: null,
          matched_spaces: null,
          created_at: '',
          status: 'completed',
          job_id: null,
          job_status: null,
        },
      ];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          if (sql.includes('FROM chat_messages m')) {
            expect(params[1]).toBe(50); // default limit
            return Promise.resolve({ rows: messages });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      // reversed → chronological
      expect(response.body.messages.map((m) => m.id)).toEqual([1, 2]);
      expect(response.body.hasMore).toBe(false);
    });

    test('applies cursor pagination when before param is given', async () => {
      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          if (sql.includes('FROM chat_messages m')) {
            expect(sql).toMatch(/m\.id < \$3/);
            expect(params).toEqual(['1', 50, '10']);
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      await request(app)
        .get('/api/chats/1/messages?before=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    test('orphan recovery transfers content from completed job', async () => {
      const orphan = {
        id: 55,
        role: 'assistant',
        content: '',
        thinking: null,
        sources: null,
        matched_spaces: null,
        created_at: new Date().toISOString(),
        status: 'streaming',
        job_id: 'job-x',
        job_status: 'completed',
      };
      const jobContent = {
        id: 'job-x',
        content: 'recovered answer',
        thinking: 'thought',
        sources: null,
        matched_spaces: null,
      };
      const updateCalls = [];

      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          if (sql.includes('FROM chat_messages m')) return Promise.resolve({ rows: [orphan] });
          if (sql.includes('FROM llm_jobs WHERE id = ANY')) return Promise.resolve({ rows: [jobContent] });
          if (sql.includes('UPDATE chat_messages SET content')) {
            updateCalls.push(params);
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.messages[0]).toMatchObject({
        id: 55,
        status: 'completed',
        content: 'recovered answer',
      });
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toBe('recovered answer');
    });

    test('orphan recovery marks stale no-job orphans as error', async () => {
      const stale = {
        id: 77,
        role: 'assistant',
        content: '',
        thinking: null,
        sources: null,
        matched_spaces: null,
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10min old
        status: 'streaming',
        job_id: null,
        job_status: null,
      };
      let markedError = false;

      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          if (sql.includes('FROM chat_messages m')) return Promise.resolve({ rows: [stale] });
          if (sql.includes("UPDATE chat_messages SET status = 'error'")) {
            markedError = true;
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.messages[0].status).toBe('error');
      expect(markedError).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id/jobs
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/:id/jobs', () => {
    testRequiresAuth(app, 'get', '/api/chats/1/jobs');

    test('rejects non-positive ids before touching the DB', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/chats/0/jobs')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(400);
    });

    test('returns jobs from llmJobService', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          return Promise.resolve({ rows: [] });
        })
      );
      llmJobService.getActiveJobsForConversation.mockResolvedValue([
        { id: 'job-1', status: 'running' },
      ]);

      const response = await request(app)
        .get('/api/chats/1/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.jobs).toEqual([{ id: 'job-1', status: 'running' }]);
      expect(llmJobService.getActiveJobsForConversation).toHaveBeenCalledWith(1);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:id/messages
  // ---------------------------------------------------------------------------
  describe('POST /api/chats/:id/messages', () => {
    testRequiresAuth(app, 'post', '/api/chats/1/messages', { role: 'user', content: 'hi' });

    test('rejects unknown role via validateBody', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'alien', content: 'hi' });
      expect(response.status).toBe(400);
    });

    test('inserts message after ownership check', async () => {
      const inserts = [];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('SELECT id FROM chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          if (sql.includes('INSERT INTO chat_messages')) {
            inserts.push(params);
            return Promise.resolve({
              rows: [
                {
                  id: 9,
                  role: params[1],
                  content: params[2],
                  thinking: params[3],
                  created_at: '',
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .post('/api/chats/1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'user', content: 'Hello' });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatchObject({ id: 9, role: 'user', content: 'Hello' });
      expect(inserts[0]).toEqual(['1', 'user', 'Hello', null]);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /:id
  // ---------------------------------------------------------------------------
  describe('PATCH /api/chats/:id', () => {
    testRequiresAuth(app, 'patch', '/api/chats/1', { title: 'x' });

    test('rejects empty body via schema refine', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    test('returns 404 when UPDATE affects zero rows', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('UPDATE chat_conversations')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .patch('/api/chats/99')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'new' });
      expect(response.status).toBe(404);
    });

    test('returns the updated row on success', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('UPDATE chat_conversations')) {
            return Promise.resolve({
              rows: [
                {
                  id: 1,
                  title: 'new',
                  project_id: 7,
                  created_at: '',
                  updated_at: '',
                  message_count: 0,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .patch('/api/chats/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'new' });

      expect(response.status).toBe(200);
      expect(response.body.chat.title).toBe('new');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /:id/settings
  // ---------------------------------------------------------------------------
  describe('PATCH /api/chats/:id/settings', () => {
    testRequiresAuth(app, 'patch', '/api/chats/1/settings', { use_rag: true });

    test('rejects empty body via schema refine', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    test('returns flattened settings object on success', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('UPDATE chat_conversations')) {
            return Promise.resolve({
              rows: [
                {
                  use_rag: true,
                  use_thinking: false,
                  preferred_model: 'gemma',
                  preferred_space_id: null,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .patch('/api/chats/1/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_rag: true, preferred_model: 'gemma' });

      expect(response.status).toBe(200);
      expect(response.body.settings).toEqual({
        use_rag: true,
        use_thinking: false,
        preferred_model: 'gemma',
        preferred_space_id: null,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:id/export
  // ---------------------------------------------------------------------------
  describe('GET /api/chats/:id/export', () => {
    testRequiresAuth(app, 'get', '/api/chats/1/export');

    test('rejects invalid format', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/chats/1/export?format=xml')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Invalid format/);
    });

    test('returns 404 when chat not owned', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM chat_conversations')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );
      const response = await request(app)
        .get('/api/chats/1/export')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('JSON export: response body includes chat + messages + export_info', async () => {
      const chat = { id: 1, title: 'My Chat', created_at: '', updated_at: '' };
      const msgs = [
        { role: 'user', content: 'hi', thinking: null, sources: [], matched_spaces: [], created_at: '' },
      ];
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM chat_conversations')) return Promise.resolve({ rows: [chat] });
          if (sql.includes('FROM chat_messages')) return Promise.resolve({ rows: msgs });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toMatch(/attachment; filename=/);
      expect(response.body.chat.title).toBe('My Chat');
      expect(response.body.messages).toHaveLength(1);
      expect(response.body.export_info.format).toBe('json');
    });

    test('Markdown export returns text/markdown with role labels', async () => {
      const chat = { id: 1, title: 'My Chat', created_at: '', updated_at: '' };
      const msgs = [
        {
          role: 'user',
          content: 'Hallo',
          thinking: null,
          sources: null,
          matched_spaces: null,
          created_at: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Antwort',
          thinking: 'dachte nach',
          sources: [{ document_name: 'doc.pdf', text_preview: 'snippet', score: 0.9 }],
          matched_spaces: [{ name: 'Allgemein' }],
          created_at: new Date().toISOString(),
        },
      ];
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM chat_conversations')) return Promise.resolve({ rows: [chat] });
          if (sql.includes('FROM chat_messages')) return Promise.resolve({ rows: msgs });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/chats/1/export?format=markdown')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/markdown/);
      expect(response.text).toMatch(/\*\*Du:\*\*/);
      expect(response.text).toMatch(/\*\*AI:\*\*/);
      expect(response.text).toMatch(/💭 Gedankengang/);
      expect(response.text).toMatch(/Durchsuchte Bereiche/);
      expect(response.text).toMatch(/doc\.pdf/);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/chats/:id', () => {
    testRequiresAuth(app, 'delete', '/api/chats/1');

    test('returns 404 when the update affects no rows', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('UPDATE chat_conversations')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );
      const response = await request(app)
        .delete('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('soft-deletes and cancels all active jobs', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('UPDATE chat_conversations'))
            return Promise.resolve({ rows: [{ id: 1 }] });
          return Promise.resolve({ rows: [] });
        })
      );
      llmJobService.getActiveJobsForConversation.mockResolvedValue([
        { id: 'job-a' },
        { id: 'job-b' },
      ]);

      const response = await request(app)
        .delete('/api/chats/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(llmJobService.cancelJob).toHaveBeenCalledTimes(2);
      expect(llmJobService.cancelJob).toHaveBeenCalledWith('job-a');
      expect(llmJobService.cancelJob).toHaveBeenCalledWith('job-b');
    });
  });
});
