/**
 * Unit tests for AppStore Routes
 *
 * Tests all app store endpoints:
 * - GET /api/apps
 * - GET /api/apps/categories
 * - GET /api/apps/:id
 * - GET /api/apps/:id/logs
 * - GET /api/apps/:id/events
 * - POST /api/apps/:id/install
 * - POST /api/apps/:id/uninstall
 * - POST /api/apps/:id/start
 * - POST /api/apps/:id/stop
 * - POST /api/apps/:id/restart
 * - GET /api/apps/:id/config
 * - POST /api/apps/:id/config
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

// Mock appService
jest.mock('../../src/services/app/appService', () => ({
  getAllApps: jest.fn(),
  getCategories: jest.fn(),
  getApp: jest.fn(),
  getAppLogs: jest.fn(),
  getAppEvents: jest.fn(),
  installApp: jest.fn(),
  uninstallApp: jest.fn(),
  startApp: jest.fn(),
  stopApp: jest.fn(),
  restartApp: jest.fn(),
  recreateAppWithConfig: jest.fn(),
  getAppConfig: jest.fn(),
  setAppConfig: jest.fn()
}));

const db = require('../../src/database');
const appService = require('../../src/services/app/appService');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  setupAuthMocks,
  generateTestToken
} = require('../helpers/authMock');

describe('AppStore Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/apps
  // ============================================================================
  describe('GET /api/apps', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps');

      expect(response.status).toBe(401);
    });

    test('should return all apps', async () => {
      const mockApps = [
        { id: 'beispiel-app', name: 'beispiel-app', category: 'automation', status: 'running' },
        { id: 'terminal', name: 'Terminal', category: 'tools', status: 'running' }
      ];
      appService.getAllApps.mockResolvedValue(mockApps);

      const response = await request(app)
        .get('/api/apps')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('apps');
      expect(response.body).toHaveProperty('total', 2);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support filtering by category', async () => {
      appService.getAllApps.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/apps?category=automation')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(appService.getAllApps).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'automation' })
      );
    });

    test('should support filtering by status', async () => {
      appService.getAllApps.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/apps?status=running')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(appService.getAllApps).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      );
    });

    test('should support search', async () => {
      appService.getAllApps.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/apps?search=terminal')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(appService.getAllApps).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'terminal' })
      );
    });
  });

  // ============================================================================
  // GET /api/apps/categories
  // ============================================================================
  describe('GET /api/apps/categories', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps/categories');

      expect(response.status).toBe(401);
    });

    test('should return app categories', async () => {
      const mockCategories = [
        { id: 'automation', name: 'Automation', count: 3 },
        { id: 'ai', name: 'AI & ML', count: 5 },
        { id: 'system', name: 'System', count: 8 }
      ];
      appService.getCategories.mockResolvedValue(mockCategories);

      const response = await request(app)
        .get('/api/apps/categories')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('categories');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/apps/:id
  // ============================================================================
  describe('GET /api/apps/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps/beispiel-app');

      expect(response.status).toBe(401);
    });

    test('should return app details', async () => {
      const mockApp = {
        id: 'beispiel-app',
        name: 'beispiel-app',
        description: 'Workflow automation',
        category: 'automation',
        status: 'running',
        version: '1.0.0'
      };
      appService.getApp.mockResolvedValue(mockApp);

      const response = await request(app)
        .get('/api/apps/beispiel-app')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('app');
      expect(response.body.app.id).toBe('beispiel-app');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 404 if app not found', async () => {
      appService.getApp.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/apps/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // GET /api/apps/:id/logs
  // ============================================================================
  describe('GET /api/apps/:id/logs', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps/beispiel-app/logs');

      expect(response.status).toBe(401);
    });

    test('should return app logs', async () => {
      const mockLogs = [
        '2026-01-22 10:00:00 INFO Starting app...',
        '2026-01-22 10:00:01 INFO app ready'
      ];
      appService.getAppLogs.mockResolvedValue(mockLogs);

      const response = await request(app)
        .get('/api/apps/beispiel-app/logs')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('appId', 'beispiel-app');
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support tail parameter', async () => {
      appService.getAppLogs.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/apps/beispiel-app/logs?tail=50')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(appService.getAppLogs).toHaveBeenCalledWith('beispiel-app', 50);
    });
  });

  // ============================================================================
  // GET /api/apps/:id/events
  // ============================================================================
  describe('GET /api/apps/:id/events', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps/beispiel-app/events');

      expect(response.status).toBe(401);
    });

    test('should return app events', async () => {
      const mockEvents = [
        { id: 1, event: 'started', timestamp: new Date() },
        { id: 2, event: 'config_updated', timestamp: new Date() }
      ];
      appService.getAppEvents.mockResolvedValue(mockEvents);

      const response = await request(app)
        .get('/api/apps/beispiel-app/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('appId', 'beispiel-app');
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/apps/:id/install
  // ============================================================================
  describe('POST /api/apps/:id/install', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/install');

      expect(response.status).toBe(401);
    });

    test('should install app', async () => {
      const mockResult = {
        success: true,
        appId: 'beispiel-app',
        status: 'installed'
      };
      appService.installApp.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/apps/beispiel-app/install')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ config: { port: 5678 } });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should accept config parameter', async () => {
      appService.installApp.mockResolvedValue({ success: true });

      const config = { port: 5678, debug: true };

      const response = await request(app)
        .post('/api/apps/beispiel-app/install')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ config });

      expect(response.status).toBe(201);
      expect(appService.installApp).toHaveBeenCalledWith('beispiel-app', config);
    });
  });

  // ============================================================================
  // POST /api/apps/:id/uninstall
  // ============================================================================
  describe('POST /api/apps/:id/uninstall', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/uninstall');

      expect(response.status).toBe(401);
    });

    test('should uninstall app', async () => {
      const mockResult = {
        success: true,
        appId: 'beispiel-app',
        status: 'uninstalled'
      };
      appService.uninstallApp.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/apps/beispiel-app/uninstall')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should support removeVolumes option', async () => {
      appService.uninstallApp.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/apps/beispiel-app/uninstall')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ removeVolumes: true });

      expect(response.status).toBe(200);
      expect(appService.uninstallApp).toHaveBeenCalledWith('beispiel-app', true);
    });
  });

  // ============================================================================
  // POST /api/apps/:id/start
  // ============================================================================
  describe('POST /api/apps/:id/start', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/start');

      expect(response.status).toBe(401);
    });

    test('should start app', async () => {
      const mockResult = {
        success: true,
        appId: 'beispiel-app',
        status: 'running'
      };
      appService.startApp.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/apps/beispiel-app/start')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/apps/:id/stop
  // ============================================================================
  describe('POST /api/apps/:id/stop', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/stop');

      expect(response.status).toBe(401);
    });

    test('should stop app', async () => {
      const mockResult = {
        success: true,
        appId: 'beispiel-app',
        status: 'stopped'
      };
      appService.stopApp.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/apps/beispiel-app/stop')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  // ============================================================================
  // POST /api/apps/:id/restart
  // ============================================================================
  describe('POST /api/apps/:id/restart', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/restart');

      expect(response.status).toBe(401);
    });

    test('should restart app', async () => {
      const mockResult = {
        success: true,
        appId: 'beispiel-app',
        status: 'running'
      };
      appService.restartApp.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/apps/beispiel-app/restart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should recreate with config when applyConfig is true', async () => {
      appService.recreateAppWithConfig.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/apps/beispiel-app/restart')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ applyConfig: true });

      expect(response.status).toBe(200);
      expect(appService.recreateAppWithConfig).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // GET /api/apps/:id/config
  // ============================================================================
  describe('GET /api/apps/:id/config', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/apps/beispiel-app/config');

      expect(response.status).toBe(401);
    });

    test('should return app config', async () => {
      const mockConfig = {
        port: 5678,
        debug: false,
        secret: '***masked***'
      };
      appService.getAppConfig.mockResolvedValue(mockConfig);

      const response = await request(app)
        .get('/api/apps/beispiel-app/config')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('config');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/apps/:id/config
  // ============================================================================
  describe('POST /api/apps/:id/config', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/config')
        .send({ config: { port: 5678 } });

      expect(response.status).toBe(401);
    });

    test('should update app config', async () => {
      appService.setAppConfig.mockResolvedValue();

      const response = await request(app)
        .post('/api/apps/beispiel-app/config')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ config: { port: 5679, debug: true } });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if config is missing', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/config')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('config');
    });

    test('should return 400 if config is not an object', async () => {
      const response = await request(app)
        .post('/api/apps/beispiel-app/config')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ config: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

});
