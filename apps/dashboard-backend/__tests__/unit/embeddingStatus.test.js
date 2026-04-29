/**
 * Phase 4.9 — embedding-status + reindex-all proxy routes.
 *
 * Mocks axios and verifies:
 *  - GET  /api/rag/embedding-status returns the upstream payload as-is
 *  - POST /api/rag/reindex-all forwards `from_model` as a query param
 *  - upstream failure surfaces as INDEXER_UNAVAILABLE / 503
 *
 * We mount the rag router on a minimal Express app to avoid booting the
 * full server (websockets, queues, etc.) for these isolated proxy checks.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('axios', () => ({
  get: (...args) => mockGet(...args),
  post: (...args) => mockPost(...args),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 1, username: 'admin', role: 'admin' };
    next();
  },
}));

jest.mock('../../src/middleware/rateLimit', () => {
  const passthrough = (_req, _res, next) => next();
  return {
    loginLimiter: passthrough,
    apiLimiter: passthrough,
    llmLimiter: passthrough,
    metricsLimiter: passthrough,
    webhookLimiter: passthrough,
    generalAuthLimiter: passthrough,
    tailscaleLimiter: passthrough,
    uploadLimiter: passthrough,
    createUserRateLimiter: () => passthrough,
  };
});

// rag.js pulls in heavy services we don't exercise in this test — stub them.
jest.mock('../../src/services/llm/llmJobService', () => ({}));
jest.mock('../../src/services/llm/llmQueueService', () => ({}));
jest.mock('../../src/services/rag/ragMetrics', () => ({ logRagQuery: jest.fn() }));
jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn(),
  getEmbeddings: jest.fn(),
  getCompanyContext: jest.fn(),
  routeToSpaces: jest.fn(),
  hybridSearch: jest.fn(),
  rerankResults: jest.fn(),
  filterByRelevance: jest.fn(),
  deduplicateByDocument: jest.fn(),
  applyMMR: jest.fn(),
  graphEnrichedRetrieval: jest.fn(),
  getParentChunks: jest.fn(),
  buildHierarchicalContext: jest.fn(),
  ENABLE_RERANKING: false,
}));
jest.mock('../../src/services/context/queryOptimizer', () => ({ optimizeQuery: jest.fn() }));

const express = require('express');
const request = require('supertest');
const ragRouter = require('../../src/routes/rag');
const { errorHandler } = require('../../src/middleware/errorHandler');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/rag', ragRouter);
  app.use(errorHandler);
  return app;
}

describe('Phase 4.9 — embedding-status proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/rag/embedding-status forwards upstream JSON', async () => {
    const upstream = {
      current_model: 'BAAI/bge-m3',
      per_model: [
        { model: 'BAAI/bge-m3', count: 12 },
        { model: 'old/model', count: 30 },
      ],
      mismatched_count: 30,
      total_indexed: 42,
      has_mismatch: true,
    };
    mockGet.mockResolvedValueOnce({ status: 200, data: upstream });

    const res = await request(makeApp()).get('/api/rag/embedding-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(upstream);
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/embedding-status$/),
      expect.any(Object)
    );
  });

  test('GET /api/rag/embedding-status returns 503/INDEXER_UNAVAILABLE on upstream failure', async () => {
    mockGet.mockRejectedValueOnce(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const res = await request(makeApp()).get('/api/rag/embedding-status');
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('INDEXER_UNAVAILABLE');
  });
});

describe('Phase 4.9 — reindex-all proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/rag/reindex-all forwards from_model as query param', async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: { status: 'queued', count: 7, from_model: 'old/model' },
    });

    const res = await request(makeApp())
      .post('/api/rag/reindex-all')
      .send({ from_model: 'old/model' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(7);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/reindex-all\?from_model=old%2Fmodel$/),
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('POST /api/rag/reindex-all without from_model triggers full reindex', async () => {
    mockPost.mockResolvedValueOnce({ status: 200, data: { status: 'queued', count: 100 } });

    const res = await request(makeApp()).post('/api/rag/reindex-all').send({});
    expect(res.status).toBe(200);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/reindex-all$/),
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('POST /api/rag/reindex-all returns 503/INDEXER_UNAVAILABLE on upstream failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('upstream went away'));
    const res = await request(makeApp()).post('/api/rag/reindex-all').send({});
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('INDEXER_UNAVAILABLE');
  });
});
