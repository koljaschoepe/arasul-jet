const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../src/services/modelService', () => ({
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

jest.mock('../../src/services/appService', () => ({
  getAllApps: jest.fn()
}));

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
const appService = require('../../src/services/appService');
const { app } = require('../../src/server');

const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

const MOCK_CATALOG = [
  { id: 'qwen3:32b-q4', name: 'Qwen 3 32B', description: 'Large model', capabilities: ['chat'] },
  { id: 'llama3:8b', name: 'Llama 3', description: 'Medium model', capabilities: ['chat'] }
];

const MOCK_APPS = [
  { id: 'n8n', name: 'n8n', description: 'Workflow automation', category: 'automation' },
  { id: 'telegram-bot', name: 'Telegram Bot', description: 'Messaging', category: 'communication' }
];

describe('Store Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    token = generateTestToken();

    modelService.getCatalog.mockResolvedValue(MOCK_CATALOG);
    modelService.getDiskSpace.mockResolvedValue({ free: 107374182400, total: 214748364800 });
    appService.getAllApps.mockResolvedValue(MOCK_APPS);
  });

  describe('GET /api/store/recommendations', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/store/recommendations');
      expect(res.status).toBe(401);
    });

    it('returns models and apps arrays', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('models');
      expect(res.body).toHaveProperty('apps');
      expect(Array.isArray(res.body.models)).toBe(true);
      expect(Array.isArray(res.body.apps)).toBe(true);
    });

    it('returns systemInfo with availableRamGB', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('systemInfo');
      expect(res.body.systemInfo).toHaveProperty('availableRamGB');
      expect(typeof res.body.systemInfo.availableRamGB).toBe('number');
    });

    it('includes featured apps from catalog', async () => {
      const res = await request(app)
        .get('/api/store/recommendations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(appService.getAllApps).toHaveBeenCalled();
    });
  });

  describe('GET /api/store/search', () => {
    it('returns matching models and apps for valid query', async () => {
      const res = await request(app)
        .get('/api/store/search?q=llama')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('models');
      expect(res.body).toHaveProperty('apps');
      expect(res.body.models.length).toBeGreaterThan(0);
      expect(res.body.models[0].id).toBe('llama3:8b');
    });

    it('returns empty arrays for query shorter than 2 chars', async () => {
      const res = await request(app)
        .get('/api/store/search?q=a')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [], apps: [] });
    });

    it('returns empty arrays when no query param provided', async () => {
      const res = await request(app)
        .get('/api/store/search')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [], apps: [] });
    });

    it('returns matching apps for app-specific query', async () => {
      const res = await request(app)
        .get('/api/store/search?q=workflow')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.apps.length).toBeGreaterThan(0);
      expect(res.body.apps[0].id).toBe('n8n');
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
    it('returns availableRamGB and disk info', async () => {
      const res = await request(app)
        .get('/api/store/info')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('availableRamGB');
      expect(res.body).toHaveProperty('availableDiskGB');
      expect(res.body).toHaveProperty('totalDiskGB');
      expect(res.body.availableRamGB).toBe(64);
      expect(res.body.availableDiskGB).toBe(100);
      expect(res.body.totalDiskGB).toBe(200);
    });

    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/store/info');
      expect(res.status).toBe(401);
    });
  });
});
