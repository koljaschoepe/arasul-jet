/**
 * Unit tests for External API Routes
 *
 * Tests all external API endpoints:
 * - POST /api/v1/external/llm/chat - LLM chat via queue
 * - GET /api/v1/external/llm/job/:jobId - Get job status
 * - GET /api/v1/external/llm/queue - Get queue status
 * - GET /api/v1/external/models - Get available models
 * - POST /api/v1/external/api-keys - Create API key (JWT auth)
 * - GET /api/v1/external/api-keys - List API keys (JWT auth)
 * - DELETE /api/v1/external/api-keys/:keyId - Revoke API key (JWT auth)
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

// Mock llmQueueService
jest.mock('../../src/services/llmQueueService', () => ({
  enqueue: jest.fn(),
  getQueueStatus: jest.fn()
}));

// Mock llmJobService
jest.mock('../../src/services/llmJobService', () => ({
  getJob: jest.fn()
}));

// Mock modelService
jest.mock('../../src/services/modelService', () => ({
  getInstalledModels: jest.fn(),
  getDefaultModel: jest.fn(),
  getLoadedModel: jest.fn()
}));

// Mock apiKeyAuth middleware
jest.mock('../../src/middleware/apiKeyAuth', () => ({
  requireApiKey: jest.fn((req, res, next) => {
    if (req.headers['x-api-key'] === 'valid-api-key') {
      req.apiKey = { id: 1, name: 'Test API Key', allowed_endpoints: ['llm:chat', 'llm:status'] };
      next();
    } else {
      res.status(401).json({ error: 'Invalid API key' });
    }
  }),
  requireEndpoint: jest.fn((endpoint) => (req, res, next) => {
    if (req.apiKey && req.apiKey.allowed_endpoints.includes(endpoint)) {
      next();
    } else {
      res.status(403).json({ error: 'Endpoint not allowed' });
    }
  }),
  generateApiKey: jest.fn()
}));

const db = require('../../src/database');
const llmQueueService = require('../../src/services/llmQueueService');
const llmJobService = require('../../src/services/llmJobService');
const modelService = require('../../src/services/modelService');
const { generateApiKey } = require('../../src/middleware/apiKeyAuth');
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

describe('External API Routes', () => {
  let jwtToken;
  const apiKey = 'valid-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    jwtToken = generateTestToken();
  });

  // ============================================================================
  // POST /api/v1/external/llm/chat
  // ============================================================================
  describe('POST /api/v1/external/llm/chat', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .send({ prompt: 'Hello' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if prompt is missing', async () => {
      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('prompt');
    });

    test('should enqueue job and return immediately with wait_for_result=false', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 1,
        model: 'qwen3:14b-q8'
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hello', wait_for_result: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job_id).toBe('job-uuid');
      expect(response.body.status).toBe('pending');
    });

    test('should return result when wait_for_result=true and job completes', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 0,
        model: 'qwen3:14b-q8'
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        status: 'completed',
        content: 'AI response here',
        thinking: null
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({ prompt: 'Hello', wait_for_result: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.response).toBe('AI response here');
    });

    test('should accept optional parameters', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-uuid',
        messageId: 'msg-uuid',
        queuePosition: 0,
        model: 'custom-model'
      });
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        status: 'completed',
        content: 'Response',
        thinking: 'Thinking process'
      });

      const response = await request(app)
        .post('/api/v1/external/llm/chat')
        .set('X-API-Key', apiKey)
        .send({
          prompt: 'Hello',
          model: 'custom-model',
          temperature: 0.5,
          max_tokens: 1024,
          thinking: true
        });

      expect(response.status).toBe(200);
      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        expect.any(Number),
        'chat',
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1024,
          thinking: true
        }),
        expect.objectContaining({
          model: 'custom-model'
        })
      );
    });
  });

  // ============================================================================
  // GET /api/v1/external/llm/job/:jobId
  // ============================================================================
  describe('GET /api/v1/external/llm/job/:jobId', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid');

      expect(response.status).toBe(401);
    });

    test('should return job status with valid API key', async () => {
      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-uuid',
        status: 'processing',
        queue_position: 0,
        content: null,
        thinking: null,
        error_message: null,
        queued_at: '2026-01-25T10:00:00Z',
        started_at: '2026-01-25T10:00:01Z',
        completed_at: null
      });

      const response = await request(app)
        .get('/api/v1/external/llm/job/job-uuid')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job_id).toBe('job-uuid');
      expect(response.body.status).toBe('processing');
    });

    test('should return 404 if job not found', async () => {
      llmJobService.getJob.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/external/llm/job/nonexistent')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/v1/external/llm/queue
  // ============================================================================
  describe('GET /api/v1/external/llm/queue', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/llm/queue');

      expect(response.status).toBe(401);
    });

    test('should return queue status', async () => {
      llmQueueService.getQueueStatus.mockResolvedValueOnce({
        pending_count: 3,
        processing: {
          id: 'current-job',
          started_at: '2026-01-25T10:00:00Z'
        }
      });
      modelService.getLoadedModel.mockResolvedValueOnce({
        model_id: 'qwen3:14b-q8'
      });

      const response = await request(app)
        .get('/api/v1/external/llm/queue')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.queue_length).toBe(3);
      expect(response.body.loaded_model).toBe('qwen3:14b-q8');
      expect(response.body.processing.job_id).toBe('current-job');
    });

    test('should handle empty queue', async () => {
      llmQueueService.getQueueStatus.mockResolvedValueOnce({
        pending_count: 0,
        processing: null
      });
      modelService.getLoadedModel.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/external/llm/queue')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.queue_length).toBe(0);
      expect(response.body.loaded_model).toBeNull();
      expect(response.body.processing).toBeNull();
    });
  });

  // ============================================================================
  // GET /api/v1/external/models
  // ============================================================================
  describe('GET /api/v1/external/models', () => {
    test('should return 401 without API key', async () => {
      const response = await request(app)
        .get('/api/v1/external/models');

      expect(response.status).toBe(401);
    });

    test('should return available models', async () => {
      modelService.getInstalledModels.mockResolvedValueOnce([
        { id: 'model1', name: 'Model 1', category: 'chat', ram_required_gb: 8 },
        { id: 'model2', name: 'Model 2', category: 'coding', ram_required_gb: 16 }
      ]);
      modelService.getDefaultModel.mockResolvedValueOnce('model1');

      const response = await request(app)
        .get('/api/v1/external/models')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toHaveLength(2);
      expect(response.body.models[0].is_default).toBe(true);
      expect(response.body.models[1].is_default).toBe(false);
      expect(response.body.default_model).toBe('model1');
    });
  });

  // ============================================================================
  // POST /api/v1/external/api-keys (JWT Auth)
  // ============================================================================
  describe('POST /api/v1/external/api-keys', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .send({ name: 'New Key' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if name is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('name');
    });

    test('should create API key with valid data', async () => {
      setupMocksWithAuth();
      generateApiKey.mockResolvedValueOnce({
        key: 'arasul_live_abc123...',
        keyPrefix: 'arasul_live_abc',
        keyId: 'key-uuid'
      });

      const response = await request(app)
        .post('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'N8N Integration',
          description: 'For workflow automation',
          rate_limit_per_minute: 100,
          allowed_endpoints: ['llm:chat']
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.api_key).toBe('arasul_live_abc123...');
      expect(response.body.key_prefix).toBe('arasul_live_abc');
    });
  });

  // ============================================================================
  // GET /api/v1/external/api-keys (JWT Auth)
  // ============================================================================
  describe('GET /api/v1/external/api-keys', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/external/api-keys');

      expect(response.status).toBe(401);
    });

    test('should return list of API keys', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('api_keys') && query.includes('SELECT')) {
          return Promise.resolve({
            rows: [
              {
                id: 'key1',
                key_prefix: 'arasul_live_abc',
                name: 'Key 1',
                description: 'Test key',
                created_at: '2026-01-25T10:00:00Z',
                last_used_at: '2026-01-25T12:00:00Z',
                expires_at: null,
                is_active: true,
                rate_limit_per_minute: 60,
                allowed_endpoints: ['llm:chat']
              }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/external/api-keys')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.api_keys).toHaveLength(1);
      expect(response.body.api_keys[0].name).toBe('Key 1');
    });
  });

  // ============================================================================
  // DELETE /api/v1/external/api-keys/:keyId (JWT Auth)
  // ============================================================================
  describe('DELETE /api/v1/external/api-keys/:keyId', () => {
    test('should return 401 without JWT token', async () => {
      const response = await request(app)
        .delete('/api/v1/external/api-keys/key-uuid');

      expect(response.status).toBe(401);
    });

    test('should revoke API key', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE api_keys')) {
          return Promise.resolve({
            rows: [{ key_prefix: 'arasul_live_abc' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/external/api-keys/key-uuid')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('API key revoked');
    });

    test('should return 404 if key not found', async () => {
      setupMocksWithAuth((query, params) => {
        if (query.includes('UPDATE api_keys')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/external/api-keys/nonexistent')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(404);
    });
  });
});
