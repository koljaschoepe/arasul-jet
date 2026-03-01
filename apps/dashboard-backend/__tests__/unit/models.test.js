/**
 * Unit tests for Models Routes
 *
 * Tests all model management endpoints:
 * - GET  /api/models/catalog
 * - GET  /api/models/installed
 * - GET  /api/models/status
 * - GET  /api/models/loaded
 * - POST /api/models/download
 * - DELETE /api/models/:modelId
 * - POST /api/models/:modelId/activate
 * - POST /api/models/:modelId/deactivate
 * - POST /api/models/default
 * - GET  /api/models/default
 * - POST /api/models/sync
 * - GET  /api/models/:modelId
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock modelService
jest.mock('../../src/services/modelService', () => ({
  getCatalog: jest.fn(),
  getInstalledModels: jest.fn(),
  getStatus: jest.fn(),
  getLoadedModel: jest.fn(),
  getModelInfo: jest.fn(),
  downloadModel: jest.fn(),
  deleteModel: jest.fn(),
  activateModel: jest.fn(),
  unloadModel: jest.fn(),
  isModelInstalled: jest.fn(),
  setDefaultModel: jest.fn(),
  getDefaultModel: jest.fn(),
  syncWithOllama: jest.fn()
}));

// Mock cacheService
jest.mock('../../src/services/cacheService', () => ({
  cacheService: {
    invalidate: jest.fn(),
    invalidatePattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn()
  },
  cacheMiddleware: () => (req, res, next) => next()
}));

const db = require('../../src/database');
const modelService = require('../../src/services/modelService');
const { app } = require('../../src/server');

const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

describe('Models Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/models/catalog
  // ============================================================================
  describe('GET /api/models/catalog', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/models/catalog');

      expect(response.status).toBe(401);
    });

    test('should return models array', async () => {
      modelService.getCatalog.mockResolvedValue([
        { id: 'llama3:8b', name: 'Llama 3', installed: true }
      ]);

      const response = await request(app)
        .get('/api/models/catalog')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('models');
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.models[0].id).toBe('llama3:8b');
    });
  });

  // ============================================================================
  // GET /api/models/installed
  // ============================================================================
  describe('GET /api/models/installed', () => {
    test('should return installed models', async () => {
      modelService.getInstalledModels.mockResolvedValue([
        { id: 'llama3:8b' }
      ]);

      const response = await request(app)
        .get('/api/models/installed')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('models');
      expect(response.body).toHaveProperty('total', 1);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.models[0].id).toBe('llama3:8b');
    });
  });

  // ============================================================================
  // GET /api/models/status
  // ============================================================================
  describe('GET /api/models/status', () => {
    test('should return status object', async () => {
      modelService.getStatus.mockResolvedValue({
        loaded_model: null,
        queue: { pending: 0 }
      });

      const response = await request(app)
        .get('/api/models/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('loaded_model', null);
      expect(response.body).toHaveProperty('queue');
      expect(response.body.queue.pending).toBe(0);
    });
  });

  // ============================================================================
  // GET /api/models/loaded
  // ============================================================================
  describe('GET /api/models/loaded', () => {
    test('should return loaded model', async () => {
      modelService.getLoadedModel.mockResolvedValue({ model_id: 'llama3:8b' });

      const response = await request(app)
        .get('/api/models/loaded')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('loaded_model');
      expect(response.body.loaded_model.model_id).toBe('llama3:8b');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/models/download
  // ============================================================================
  describe('POST /api/models/download', () => {
    test('should return 400 without model_id', async () => {
      const response = await request(app)
        .post('/api/models/download')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 404 with unknown model', async () => {
      modelService.getModelInfo.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/models/download')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ model_id: 'nonexistent:model' });

      expect(response.status).toBe(404);
    });

    test('should stream SSE on valid model_id', async () => {
      modelService.getModelInfo.mockResolvedValue({
        id: 'llama3:8b',
        name: 'Llama 3'
      });
      modelService.downloadModel.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/models/download')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ model_id: 'llama3:8b' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    });
  });

  // ============================================================================
  // DELETE /api/models/:modelId
  // ============================================================================
  describe('DELETE /api/models/:modelId', () => {
    test('should delete model and return result', async () => {
      modelService.deleteModel.mockResolvedValue({ deleted: true });

      const response = await request(app)
        .delete('/api/models/llama3:8b')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('deleted', true);
      expect(response.body).toHaveProperty('message');
      expect(modelService.deleteModel).toHaveBeenCalledWith('llama3:8b');
    });
  });

  // ============================================================================
  // POST /api/models/:modelId/activate
  // ============================================================================
  describe('POST /api/models/:modelId/activate', () => {
    test('should activate model (non-streaming)', async () => {
      modelService.isModelInstalled.mockResolvedValue(true);
      modelService.activateModel.mockResolvedValue({
        success: true,
        model_id: 'llama3:8b',
        alreadyLoaded: false
      });

      const response = await request(app)
        .post('/api/models/llama3:8b/activate')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('model_id', 'llama3:8b');
      expect(response.body).toHaveProperty('message');
    });

    test('should return 404 if model not installed', async () => {
      modelService.isModelInstalled.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/models/llama3:8b/activate')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // POST /api/models/:modelId/deactivate
  // ============================================================================
  describe('POST /api/models/:modelId/deactivate', () => {
    test('should deactivate model', async () => {
      modelService.unloadModel.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/models/llama3:8b/deactivate')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(modelService.unloadModel).toHaveBeenCalledWith('llama3:8b');
    });
  });

  // ============================================================================
  // POST /api/models/default
  // ============================================================================
  describe('POST /api/models/default', () => {
    test('should set default model', async () => {
      modelService.isModelInstalled.mockResolvedValue(true);
      modelService.setDefaultModel.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/models/default')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ model_id: 'llama3:8b' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(modelService.setDefaultModel).toHaveBeenCalledWith('llama3:8b');
    });

    test('should return 400 without model_id', async () => {
      const response = await request(app)
        .post('/api/models/default')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 404 if model not installed', async () => {
      modelService.isModelInstalled.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/models/default')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ model_id: 'llama3:8b' });

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/models/default
  // ============================================================================
  describe('GET /api/models/default', () => {
    test('should return default model', async () => {
      modelService.getDefaultModel.mockResolvedValue('llama3:8b');

      const response = await request(app)
        .get('/api/models/default')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('default_model', 'llama3:8b');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/models/sync
  // ============================================================================
  describe('POST /api/models/sync', () => {
    test('should sync with Ollama', async () => {
      modelService.syncWithOllama.mockResolvedValue({ synced: 3 });

      const response = await request(app)
        .post('/api/models/sync')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('synced', 3);
      expect(response.body).toHaveProperty('message');
      expect(modelService.syncWithOllama).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GET /api/models/:modelId
  // ============================================================================
  describe('GET /api/models/:modelId', () => {
    test('should return model info', async () => {
      modelService.getModelInfo.mockResolvedValue({
        id: 'llama3:8b',
        name: 'Llama 3'
      });

      const response = await request(app)
        .get('/api/models/llama3:8b')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'llama3:8b');
      expect(response.body).toHaveProperty('name', 'Llama 3');
    });

    test('should return 404 if model not found', async () => {
      modelService.getModelInfo.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/models/nonexistent:model')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });
});
