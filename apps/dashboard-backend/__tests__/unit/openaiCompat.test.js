/**
 * Unit tests for OpenAI-compatible routes
 *
 * Covers:
 * - GET  /v1/models                — listing in OpenAI format
 * - POST /v1/embeddings            — embedding format + usage block
 * - POST /v1/chat/completions      — non-streaming format + auth/scope
 *
 * Streaming responses are exercised via integration; the unit suite focuses
 * on auth, validation, and response-format conformance.
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

jest.mock('../../src/services/llm/llmQueueService', () => ({
  enqueue: jest.fn(),
  getQueueStatus: jest.fn(),
  subscribeToJob: jest.fn(),
}));

jest.mock('../../src/services/llm/llmJobService', () => ({
  getJob: jest.fn(),
}));

jest.mock('../../src/services/llm/modelService', () => ({
  getInstalledModels: jest.fn(),
  getDefaultModel: jest.fn(),
  getLoadedModel: jest.fn(),
}));

// Phase 4.1: tests run with a healthy Ollama by default. Individual tests
// override `quickCheck` when they want to exercise the unhealthy path.
jest.mock('../../src/services/llm/ollamaReadiness', () => ({
  quickCheck: jest.fn().mockResolvedValue({ ready: true, latencyMs: 5 }),
  isReady: jest.fn().mockReturnValue(true),
}));

// Auth middleware: pass-through for the dummy bearer token used in tests.
jest.mock('../../src/middleware/apiKeyAuth', () => ({
  requireApiKey: jest.fn((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key) {
      return res.status(401).json({ error: { message: 'no key', type: 'invalid_request_error' } });
    }
    if (key === 'aras_valid_key') {
      req.apiKey = {
        id: 1,
        prefix: 'aras_valid_k',
        name: 'Test Key',
        userId: 1,
        allowedEndpoints: ['openai:chat', 'openai:embeddings', 'openai:models'],
      };
      return next();
    }
    if (key === 'aras_legacy_only') {
      req.apiKey = {
        id: 2,
        prefix: 'aras_legacy_',
        name: 'Legacy Key',
        userId: 1,
        // Older keys never had openai:* — must still grant chat via fallback
        allowedEndpoints: ['llm:chat', 'llm:status'],
      };
      return next();
    }
    if (key === 'aras_no_chat') {
      req.apiKey = {
        id: 3,
        prefix: 'aras_no_chat',
        name: 'Locked Key',
        userId: 1,
        allowedEndpoints: ['openai:models'],
      };
      return next();
    }
    return res.status(401).json({ error: { message: 'invalid', type: 'invalid_request_error' } });
  }),
  requireEndpoint: jest.fn(() => (_req, _res, next) => next()),
  generateApiKey: jest.fn(),
}));

// Stub out axios so embeddings tests don't try to hit a real service.
// Jest's mock-factory rule requires the closure-captured ref to start with `mock`.
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args) => mockAxiosPost(...args),
  get: jest.fn(),
  create: jest.fn(() => ({ post: jest.fn(), get: jest.fn() })),
}));

const llmQueueService = require('../../src/services/llm/llmQueueService');
const llmJobService = require('../../src/services/llm/llmJobService');
const modelService = require('../../src/services/llm/modelService');
const ollamaReadiness = require('../../src/services/llm/ollamaReadiness');
const db = require('../../src/database');
const { app } = require('../../src/server');

describe('OpenAI-compatible routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(() => Promise.resolve({ rows: [{ id: 99 }] }));
  });

  describe('GET /v1/models', () => {
    test('rejects missing API key', async () => {
      const res = await request(app).get('/v1/models');
      expect(res.status).toBe(401);
    });

    test('returns OpenAI-style list with installed chat models', async () => {
      modelService.getInstalledModels.mockResolvedValueOnce([
        { id: 'gemma4:26b-q4', name: 'Gemma 4', model_type: 'chat' },
        { id: 'qwen3:14b-q8', name: 'Qwen3', model_type: 'chat' },
        { id: 'tesseract:5', name: 'OCR', model_type: 'ocr' },
      ]);

      const res = await request(app).get('/v1/models').set('X-API-Key', 'aras_valid_key');

      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
      expect(Array.isArray(res.body.data)).toBe(true);
      // OCR is filtered out from /v1/models — it's not a chat model
      expect(res.body.data.find(m => m.id === 'tesseract:5')).toBeUndefined();
      expect(res.body.data).toHaveLength(2);
      const first = res.body.data[0];
      expect(first.object).toBe('model');
      expect(first.owned_by).toBe('arasul');
      expect(typeof first.created).toBe('number');
    });

    test('accepts Authorization: Bearer header (OpenAI SDK style)', async () => {
      modelService.getInstalledModels.mockResolvedValueOnce([]);
      const res = await request(app)
        .get('/v1/models')
        .set('Authorization', 'Bearer aras_valid_key');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/embeddings', () => {
    test('rejects missing input', async () => {
      const res = await request(app)
        .post('/v1/embeddings')
        .set('X-API-Key', 'aras_valid_key')
        .send({});
      expect(res.status).toBe(400);
    });

    test('returns OpenAI-format embeddings with usage', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { vectors: [[0.1, 0.2], [0.3, 0.4]], dimension: 2 },
      });

      const res = await request(app)
        .post('/v1/embeddings')
        .set('X-API-Key', 'aras_valid_key')
        .send({ input: ['hello', 'world'], model: 'bge-m3' });

      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ object: 'embedding', index: 0 });
      expect(res.body.data[0].embedding).toEqual([0.1, 0.2]);
      expect(res.body.usage).toHaveProperty('prompt_tokens');
      expect(res.body.usage).toHaveProperty('total_tokens');
      expect(res.body.model).toBe('bge-m3');
    });

    test('falls back to BGE-M3 when no model is requested', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { vectors: [[0.5]], dimension: 1 },
      });
      const res = await request(app)
        .post('/v1/embeddings')
        .set('X-API-Key', 'aras_valid_key')
        .send({ input: 'test' });
      expect(res.status).toBe(200);
      expect(res.body.model).toMatch(/bge-m3/i);
    });

    test('returns 503 when embedding service errors', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await request(app)
        .post('/v1/embeddings')
        .set('X-API-Key', 'aras_valid_key')
        .send({ input: 'test' });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /v1/chat/completions (non-streaming)', () => {
    test('rejects body without messages', async () => {
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-API-Key', 'aras_valid_key')
        .send({ model: 'gemma4:26b-q4' });
      expect(res.status).toBe(400);
    });

    test('returns OpenAI-format completion with usage', async () => {
      modelService.getDefaultModel.mockResolvedValueOnce('gemma4:26b-q4');
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-1',
        messageId: 'm1',
        queuePosition: 0,
        model: 'gemma4:26b-q4',
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-1',
        status: 'completed',
        content: 'Hello world!',
        thinking: null,
      });

      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-API-Key', 'aras_valid_key')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: false });

      expect(res.status).toBe(200);
      expect(res.body.object).toBe('chat.completion');
      expect(res.body.choices).toHaveLength(1);
      expect(res.body.choices[0].message).toEqual({ role: 'assistant', content: 'Hello world!' });
      expect(res.body.choices[0].finish_reason).toBe('stop');
      expect(res.body.usage).toHaveProperty('prompt_tokens');
      expect(res.body.usage).toHaveProperty('completion_tokens');
      expect(res.body.usage).toHaveProperty('total_tokens');
    });

    test('uses requested model over default', async () => {
      modelService.getDefaultModel.mockResolvedValueOnce('gemma4:26b-q4');
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-2',
        messageId: 'm2',
        queuePosition: 0,
        model: 'qwen3:14b-q8',
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-2',
        status: 'completed',
        content: 'hi',
        thinking: null,
      });

      await request(app)
        .post('/v1/chat/completions')
        .set('X-API-Key', 'aras_valid_key')
        .send({
          model: 'qwen3:14b-q8',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
        });

      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        expect.any(Number),
        'chat',
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        expect.objectContaining({ model: 'qwen3:14b-q8' })
      );
    });

    test('returns 503 when no model is installed', async () => {
      modelService.getDefaultModel.mockResolvedValueOnce(null);
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-API-Key', 'aras_valid_key')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: false });
      expect(res.status).toBe(503);
    });

    // Phase 4.1: dead Ollama must short-circuit before enqueue
    test('returns 503 OLLAMA_UNAVAILABLE when Ollama is dead', async () => {
      ollamaReadiness.quickCheck.mockResolvedValueOnce({
        ready: false,
        latencyMs: 2001,
        error: 'ECONNREFUSED',
      });
      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-API-Key', 'aras_valid_key')
        .send({ messages: [{ role: 'user', content: 'Hi' }], stream: false });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('OLLAMA_UNAVAILABLE');
      // Crucially, we must not have hit the queue
      expect(llmQueueService.enqueue).not.toHaveBeenCalled();
    });
  });
});
