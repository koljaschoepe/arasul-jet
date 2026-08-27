const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../src/services/llm/modelService', () => ({
  getCatalog: jest.fn(),
  getDiskSpace: jest.fn(),
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

jest.mock('../../src/services/core/cacheService', () => ({
  cacheService: {
    invalidate: jest.fn(),
    invalidatePattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn()
  },
  cacheMiddleware: () => (req, res, next) => next()
}));

const db = require('../../src/database');
const modelService = require('../../src/services/llm/modelService');
const { app } = require('../../src/server');

const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

const MOCK_CATALOG = [
  { id: 'qwen3:32b-q4', name: 'Qwen 3 32B', description: 'Large model', capabilities: ['chat'] },
  { id: 'llama3:8b', name: 'Llama 3', description: 'Medium model', capabilities: ['chat'] }
];

describe('Store Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    token = generateTestToken();

    modelService.getCatalog.mockResolvedValue(MOCK_CATALOG);
    modelService.getDiskSpace.mockResolvedValue({ free: 107374182400, total: 214748364800 });
  });

  describe('GET /api/store/recommendations', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/store/recommendations');
      expect(res.status).toBe(401);
    });

    it('returns a models array', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('models');
      expect(Array.isArray(res.body.models)).toBe(true);
    });

    // Seit Phase C3 gibt es keinen App-Katalog mehr. Der Laden empfiehlt
    // Modelle; Apps kommen vom Partner und stehen unter /api/apps.
    it('nennt keine Apps mehr', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('apps');
    });

    it('returns systemInfo with llmRamGB and totalRamGB', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('systemInfo');
      expect(res.body.systemInfo).toHaveProperty('llmRamGB');
      expect(res.body.systemInfo).toHaveProperty('totalRamGB');
      expect(typeof res.body.systemInfo.llmRamGB).toBe('number');
      expect(typeof res.body.systemInfo.totalRamGB).toBe('number');
    });

  });

  describe('GET /api/store/search', () => {
    it('returns matching models for valid query', async () => {
      const res = await request(app)
        .get('/api/store/search?q=llama')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('models');
      expect(res.body).not.toHaveProperty('apps');
      expect(res.body.models.length).toBeGreaterThan(0);
      expect(res.body.models[0].id).toBe('llama3:8b');
    });

    it('returns an empty list for query shorter than 2 chars', async () => {
      const res = await request(app)
        .get('/api/store/search?q=a')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [] });
    });

    it('returns an empty list when no query param provided', async () => {
      const res = await request(app)
        .get('/api/store/search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [] });
    });

    it('returns the search query in response', async () => {
      const res = await request(app)
        .get('/api/store/search?q=qwen')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('query', 'qwen');
    });
  });

  describe('GET /api/store/info', () => {
    it('returns llmRamGB, totalRamGB and disk info', async () => {
      const res = await request(app)
        .get('/api/store/info')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('llmRamGB');
      expect(res.body).toHaveProperty('totalRamGB');
      expect(res.body).toHaveProperty('availableDiskGB');
      expect(res.body).toHaveProperty('totalDiskGB');
      expect(typeof res.body.llmRamGB).toBe('number');
      expect(typeof res.body.totalRamGB).toBe('number');
      expect(res.body.availableDiskGB).toBe(100);
      expect(res.body.totalDiskGB).toBe(200);
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/store/info');
      expect(res.status).toBe(401);
    });
  });
});
