/**
 * Route tests for the admin RAG/LLM tunables endpoints (096):
 *  - GET  /api/rag/settings  (admin-only, returns raw column values)
 *  - PATCH /api/rag/settings (admin-only, Zod-bounded, hot-reloads the cache)
 *
 * Complements __tests__/unit/ragSettings.test.js (service getters + prompt modes).
 */

const request = require('supertest');

// Mock database module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock axios for external service calls
jest.mock('axios');

// Mock ragCore — settings routes don't touch it, but routes/rag.js requires it at load
jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn(),
  getEmbeddings: jest.fn(),
  getCompanyContext: jest.fn(),
  routeToSpaces: jest.fn(),
  buildSpaceFilter: jest.fn(),
  hybridSearch: jest.fn(),
  rerankResults: jest.fn(),
  filterByRelevance: jest.fn(),
  deduplicateByDocument: jest.fn(),
  applyMMR: jest.fn(),
  graphEnrichedRetrieval: jest.fn(),
  getParentChunks: jest.fn(),
  buildHierarchicalContext: jest.fn(),
  ENABLE_RERANKING: false,
  RAG_FINAL_K: 4,
}));

jest.mock('../../src/services/context/queryOptimizer', () => ({
  optimizeQuery: jest.fn(),
}));

jest.mock('../../src/services/llm/llmJobService', () => ({
  createJob: jest.fn(),
  updateJobContent: jest.fn(),
  completeJob: jest.fn(),
}));

jest.mock('../../src/services/llm/llmQueueService', () => ({
  enqueue: jest.fn(),
  subscribeToJob: jest.fn(),
}));

const db = require('../../src/database');
const systemSettings = require('../../src/services/system-settings/systemSettingsService');
const { _clearUserCacheForTest } = require('../../src/middleware/auth');
const { app } = require('../../src/server');
const { mockUser, mockSession, generateTestToken } = require('../helpers/authMock');

// Full singleton row as it comes back from Postgres (id=1)
const settingsRow = {
  rag_top_k: 10,
  rag_final_k: 4,
  rag_score_threshold: 0.4,
  rag_relevance_threshold: 0.35,
  rag_rerank_enabled: true,
  rag_timeout_rerank_ms: 30000,
  llm_num_ctx_default: null,
  llm_keep_alive_seconds: 3600,
  llm_num_predict_default: 2048,
  rag_temperature: 0.2,
  rag_num_predict: 2048,
  rag_mmr_lambda: 0.7,
  rag_dedup_max_per_doc: 3,
  rag_hybrid_search: true,
  rag_space_routing_threshold: 0.35,
  rag_space_routing_max_spaces: 3,
  llm_base_system_prompt: null,
};

/**
 * Pattern-based db.query mock: auth chain + system_settings SELECT/UPDATE.
 * @param {Object} options
 * @param {Object} options.user - authenticated user row (role drives 403)
 */
function setupMocks({ user = mockUser } = {}) {
  db.query.mockReset();
  db.query.mockImplementation(query => {
    const queryLower = query.toLowerCase();

    // Auth chain (jwt.js + auth.js)
    if (queryLower.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] });
    }
    if (queryLower.includes('active_sessions') && queryLower.includes('select')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (queryLower.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }
    if (queryLower.includes('admin_users')) {
      return Promise.resolve({ rows: [user] });
    }

    // Settings routes + systemSettings.reload()
    if (queryLower.includes('system_settings') && queryLower.startsWith('update')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (queryLower.includes('system_settings')) {
      return Promise.resolve({ rows: [settingsRow] });
    }

    return Promise.resolve({ rows: [] });
  });
}

describe('RAG Settings Routes', () => {
  let reloadSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    _clearUserCacheForTest();
    setupMocks();
    reloadSpy = jest.spyOn(systemSettings, 'reload');
  });

  afterEach(() => {
    reloadSpy.mockRestore();
  });

  describe('GET /api/rag/settings', () => {
    it('returns 401 without auth', async () => {
      const response = await request(app).get('/api/rag/settings');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 for a non-admin user', async () => {
      // Distinct userId so the auth middleware's per-user cache (keyed by
      // userId, 60s TTL, module-level) never collides with the admin (id=1)
      // entry that the other tests rely on.
      setupMocks({ user: { ...mockUser, id: 2, role: 'user' } });

      const response = await request(app)
        .get('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken({ userId: 2 })}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns every tunable from SETTINGS_COLUMNS for an admin', async () => {
      const response = await request(app)
        .get('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`);

      expect(response.status).toBe(200);
      for (const col of systemSettings.SETTINGS_COLUMNS) {
        expect(response.body.data).toHaveProperty(col);
      }
      expect(response.body.data.rag_final_k).toBe(4);
      expect(response.body.data.rag_mmr_lambda).toBe(0.7);

      // The SELECT must request exactly the cached columns
      const selectCall = db.query.mock.calls.find(([q]) => q.includes('FROM system_settings'));
      expect(selectCall).toBeDefined();
      for (const col of systemSettings.SETTINGS_COLUMNS) {
        expect(selectCall[0]).toContain(col);
      }
    });
  });

  describe('PATCH /api/rag/settings', () => {
    it('returns 401 without auth', async () => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .send({ rag_final_k: 6 });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 for a non-admin user', async () => {
      // Distinct userId — see the GET non-admin test for the cache rationale.
      setupMocks({ user: { ...mockUser, id: 2, role: 'user' } });

      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken({ userId: 2 })}`)
        .send({ rag_final_k: 6 });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('updates settings, reloads the cache, and returns the fresh row', async () => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .send({ rag_final_k: 6, rag_mmr_lambda: 0.5 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('rag_final_k');

      const updateCall = db.query.mock.calls.find(([q]) => q.startsWith('UPDATE system_settings'));
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain('rag_final_k = $1');
      expect(updateCall[0]).toContain('rag_mmr_lambda = $2');
      expect(updateCall[1]).toEqual([6, 0.5]);

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['rag_final_k below minimum', { rag_final_k: 0 }],
      ['rag_final_k above maximum', { rag_final_k: 21 }],
      ['rag_temperature above maximum', { rag_temperature: 2.5 }],
      ['rag_mmr_lambda above maximum', { rag_mmr_lambda: 1.5 }],
      ['rag_dedup_max_per_doc below minimum', { rag_dedup_max_per_doc: 0 }],
      ['non-numeric value', { rag_final_k: 'vier' }],
      ['unknown key (strict schema)', { rag_final_kk: 4 }],
      ['llm_base_system_prompt too long', { llm_base_system_prompt: 'x'.repeat(4001) }],
    ])('rejects out-of-bounds body: %s', async (_label, body) => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(db.query.mock.calls.some(([q]) => q.startsWith('UPDATE'))).toBe(false);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('rejects an empty body with 400 (no settings provided)', async () => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it('resets llm_base_system_prompt to NULL when an empty string is sent', async () => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .send({ llm_base_system_prompt: '' });

      expect(response.status).toBe(200);

      const updateCall = db.query.mock.calls.find(([q]) => q.startsWith('UPDATE system_settings'));
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain('llm_base_system_prompt = $1');
      expect(updateCall[1]).toEqual([null]);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('accepts an explicit null to reset llm_num_ctx_default', async () => {
      const response = await request(app)
        .patch('/api/rag/settings')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .send({ llm_num_ctx_default: null });

      expect(response.status).toBe(200);

      const updateCall = db.query.mock.calls.find(([q]) => q.startsWith('UPDATE system_settings'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([null]);
    });
  });
});
