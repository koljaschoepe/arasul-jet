/**
 * Unit tests for Workspaces Routes
 *
 * Tests all workspace endpoints:
 * - GET /api/workspaces - List workspaces
 * - GET /api/workspaces/:id - Get single workspace
 * - POST /api/workspaces - Create workspace
 * - PUT /api/workspaces/:id - Update workspace
 * - DELETE /api/workspaces/:id - Delete workspace
 * - POST /api/workspaces/:id/default - Set default
 * - POST /api/workspaces/:id/use - Mark as used
 * - GET /api/workspaces/volumes/list - List volumes
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

// Mock fs module - preserve original fs functions for bcrypt and other modules
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined)
    }
  };
});

const db = require('../../src/database');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');
const fs = require('fs').promises;

/**
 * Helper to setup combined auth + custom query mocks
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

describe('Workspaces Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  // ============================================================================
  // GET /api/workspaces
  // ============================================================================
  describe('GET /api/workspaces', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/workspaces');
      expect(response.status).toBe(401);
    });

    test('should return list of active workspaces', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('claude_workspaces') && query.includes('is_active = TRUE')) {
          return Promise.resolve({
            rows: [
              { id: 1, name: 'Default', slug: 'default', is_default: true, is_system: true },
              { id: 2, name: 'Project', slug: 'project', is_default: false, is_system: false }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspaces');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.workspaces)).toBe(true);
      expect(response.body.total).toBe(2);
    });
  });

  // ============================================================================
  // GET /api/workspaces/:id
  // ============================================================================
  describe('GET /api/workspaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/workspaces/1');
      expect(response.status).toBe(401);
    });

    test('should return workspace details by ID', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('id = $1 OR slug = $1')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Default', slug: 'default', host_path: '/workspace/default' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/workspaces/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspace');
      expect(response.body.workspace.id).toBe(1);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return workspace details by slug', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('id = $1 OR slug = $1')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Default', slug: 'default' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/workspaces/default')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.workspace.slug).toBe('default');
    });

    test('should return 404 if workspace not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('claude_workspaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/workspaces/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // POST /api/workspaces
  // ============================================================================
  describe('POST /api/workspaces', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Test', hostPath: '/home/arasul/test' });
      expect(response.status).toBe(401);
    });

    test('should return 400 if name is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ hostPath: '/home/arasul/test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('erforderlich');
    });

    test('should return 400 if hostPath is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('erforderlich');
    });

    test('should return 400 if name contains invalid characters', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test<script>', hostPath: '/home/arasul/test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Ungültiger Name');
    });

    test('should return 400 if name is too short', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X', hostPath: '/home/arasul/test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('zu kurz');
    });

    test('should return 400 if hostPath is not absolute', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', hostPath: 'relative/path' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('absoluter Pfad');
    });

    test('should return 400 if hostPath is not in allowed prefix', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', hostPath: '/etc/passwd' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Präfixe');
    });

    test('should return 409 if slug already exists', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM claude_workspaces WHERE slug')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Existing', hostPath: '/home/arasul/existing' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('existiert bereits');
    });

    test('should create workspace with valid data', async () => {
      fs.access.mockResolvedValue(undefined);

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM claude_workspaces WHERE slug')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO claude_workspaces')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              name: 'New Project',
              slug: 'new-project',
              host_path: '/home/arasul/new-project',
              container_path: '/workspace/new-project'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Project', hostPath: '/home/arasul/new-project', description: 'Test' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('workspace');
      expect(response.body).toHaveProperty('message');
      expect(response.body.workspace.slug).toBe('new-project');
    });

    test('should create directory if it does not exist', async () => {
      fs.access.mockRejectedValueOnce(new Error('ENOENT'));
      fs.mkdir.mockResolvedValue(undefined);

      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM claude_workspaces WHERE slug')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'New', slug: 'new' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New', hostPath: '/home/arasul/new' });

      expect(response.status).toBe(201);
      expect(fs.mkdir).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PUT /api/workspaces/:id
  // ============================================================================
  describe('PUT /api/workspaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/workspaces/1')
        .send({ name: 'Updated' });
      expect(response.status).toBe(401);
    });

    test('should return 404 if workspace not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/workspaces/999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });

    test('should return 403 when trying to rename system workspace', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'System', is_system: true }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/workspaces/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('System-Workspaces');
    });

    test('should update workspace with valid data', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Old', is_system: false }]
          });
        }
        if (query.includes('UPDATE claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'New Name', description: 'Updated' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/workspaces/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name', description: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workspace');
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // DELETE /api/workspaces/:id
  // ============================================================================
  describe('DELETE /api/workspaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).delete('/api/workspaces/1');
      expect(response.status).toBe(401);
    });

    test('should return 404 if workspace not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/workspaces/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should return 403 when trying to delete system workspace', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'System', is_system: true, is_default: false }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/workspaces/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('System-Workspaces');
    });

    test('should return 403 when trying to delete default workspace', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Default', is_system: false, is_default: true }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/workspaces/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Standard-Workspace');
    });

    test('should soft delete workspace', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 2, name: 'Custom', is_system: false, is_default: false }]
          });
        }
        if (query.includes('UPDATE claude_workspaces SET is_active = FALSE')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/workspaces/2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // POST /api/workspaces/:id/default
  // ============================================================================
  describe('POST /api/workspaces/:id/default', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).post('/api/workspaces/1/default');
      expect(response.status).toBe(401);
    });

    test('should return 404 if workspace not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces/999/default')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should set workspace as default', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM claude_workspaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Workspace' }]
          });
        }
        if (query.includes('set_default_workspace')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces/1/default')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // POST /api/workspaces/:id/use
  // ============================================================================
  describe('POST /api/workspaces/:id/use', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).post('/api/workspaces/1/use');
      expect(response.status).toBe(401);
    });

    test('should increment usage count', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('increment_workspace_usage')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/workspaces/1/use')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/workspaces/volumes/list
  // ============================================================================
  describe('GET /api/workspaces/volumes/list', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/workspaces/volumes/list');
      expect(response.status).toBe(401);
    });

    test('should return list of volume bindings', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('host_path, container_path, slug')) {
          return Promise.resolve({
            rows: [
              { host_path: '/home/arasul/project1', container_path: '/workspace/project1', slug: 'project1' },
              { host_path: '/home/arasul/project2', container_path: '/workspace/project2', slug: 'project2' }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/workspaces/volumes/list')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('volumes');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.volumes)).toBe(true);
      expect(response.body.volumes[0]).toHaveProperty('name');
      expect(response.body.volumes[0]).toHaveProperty('containerPath');
      expect(response.body.volumes[0]).toHaveProperty('type', 'bind');
    });
  });
});
