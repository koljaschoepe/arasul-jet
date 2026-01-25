/**
 * Unit tests for Knowledge Spaces Routes
 *
 * Tests all knowledge space endpoints:
 * - GET /api/spaces - List all spaces
 * - GET /api/spaces/:id - Get single space
 * - POST /api/spaces - Create space
 * - PUT /api/spaces/:id - Update space
 * - DELETE /api/spaces/:id - Delete space
 * - POST /api/spaces/:id/regenerate - Regenerate context
 * - POST /api/spaces/route - Find relevant spaces for query
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

// Mock axios for embedding service
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: { vectors: [[0.1, 0.2, 0.3]] }
  }),
  create: jest.fn(() => ({
    post: jest.fn().mockResolvedValue({ data: { vectors: [[0.1, 0.2, 0.3]] } })
  }))
}));

// Mock cache service
jest.mock('../../src/services/cacheService', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn()
  },
  cacheMiddleware: () => (req, res, next) => next()
}));

const db = require('../../src/database');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

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

describe('Knowledge Spaces Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  // ============================================================================
  // GET /api/spaces
  // ============================================================================
  describe('GET /api/spaces', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/spaces');
      expect(response.status).toBe(401);
    });

    test('should return list of spaces with valid token', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('knowledge_spaces')) {
          return Promise.resolve({
            rows: [
              { id: 1, name: 'General', slug: 'general', description: 'Default space', is_default: true },
              { id: 2, name: 'Technical', slug: 'technical', description: 'Technical docs', is_default: false }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/spaces')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('spaces');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.spaces)).toBe(true);
    });

    test('should return empty array when no spaces exist', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('knowledge_spaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/spaces')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.spaces).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  // ============================================================================
  // GET /api/spaces/:id
  // ============================================================================
  describe('GET /api/spaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/spaces/1');
      expect(response.status).toBe(401);
    });

    test('should return space details with valid token', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('WHERE ks.id')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'General', slug: 'general', description: 'Default space' }]
          });
        }
        if (query.includes('documents') && query.includes('space_id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/spaces/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('space');
      expect(response.body.space.id).toBe(1);
      expect(response.body).toHaveProperty('documents');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 404 if space not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('WHERE ks.id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/spaces/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // POST /api/spaces
  // ============================================================================
  describe('POST /api/spaces', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/spaces')
        .send({ name: 'Test', description: 'Test space' });
      expect(response.status).toBe(401);
    });

    test('should return 400 if name is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Test space' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('erforderlich');
    });

    test('should return 400 if description is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('erforderlich');
    });

    test('should create space with valid data', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('slug LIKE')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('LOWER(name)')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('MAX(sort_order)')) {
          return Promise.resolve({ rows: [{ next_order: 1 }] });
        }
        if (query.includes('INSERT INTO knowledge_spaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Test Space', slug: 'test-space', description: 'A test space' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Space', description: 'A test space' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('space');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 409 if space name already exists', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('slug LIKE')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('LOWER(name)')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Existing Space', description: 'Duplicate' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('existiert bereits');
    });
  });

  // ============================================================================
  // PUT /api/spaces/:id
  // ============================================================================
  describe('PUT /api/spaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .put('/api/spaces/1')
        .send({ name: 'Updated' });
      expect(response.status).toBe(401);
    });

    test('should return 404 if space not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/spaces/999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });

    test('should return 403 when trying to rename system space', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'System', is_system: true }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/spaces/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Systembereich');
    });

    test('should update space with valid data', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Old Name', is_system: false }]
          });
        }
        if (query.includes('UPDATE knowledge_spaces')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'New Name', description: 'Updated desc' }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/spaces/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name', description: 'Updated desc' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('space');
      expect(response.body).toHaveProperty('message');
    });

    test('should return 400 if no changes provided', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'Test', is_system: false }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put('/api/spaces/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Keine Änderungen');
    });
  });

  // ============================================================================
  // DELETE /api/spaces/:id
  // ============================================================================
  describe('DELETE /api/spaces/:id', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).delete('/api/spaces/1');
      expect(response.status).toBe(401);
    });

    test('should return 404 if space not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/spaces/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should return 403 when trying to delete system space', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({
            rows: [{ id: 1, name: 'System', is_system: true }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/spaces/1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Systembereich');
    });

    test('should delete space and move documents', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({
            rows: [{ id: 2, name: 'Custom', is_system: false }]
          });
        }
        if (query.includes('is_default = TRUE')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        if (query.includes('UPDATE documents')) {
          return Promise.resolve({ rows: [{ id: 1 }, { id: 2 }] });
        }
        if (query.includes('DELETE FROM knowledge_spaces')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/spaces/2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'deleted');
      expect(response.body).toHaveProperty('moved_documents');
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // POST /api/spaces/:id/regenerate
  // ============================================================================
  describe('POST /api/spaces/:id/regenerate', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app).post('/api/spaces/1/regenerate');
      expect(response.status).toBe(401);
    });

    test('should return 404 if space not found', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, name FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces/999/regenerate')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should queue regeneration for valid space', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, name FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: 1, name: 'Test' }] });
        }
        if (query.includes('UPDATE knowledge_spaces')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces/1/regenerate')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'queued');
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // POST /api/spaces/route
  // ============================================================================
  describe('POST /api/spaces/route', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/spaces/route')
        .send({ query: 'test' });
      expect(response.status).toBe(401);
    });

    test('should return 400 if query is missing', async () => {
      setupMocksWithAuth();

      const response = await request(app)
        .post('/api/spaces/route')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Query');
    });

    test('should return relevant spaces for query', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('description_embedding IS NOT NULL')) {
          return Promise.resolve({
            rows: [
              {
                id: 1,
                name: 'Technical',
                slug: 'technical',
                description: 'Technical documentation',
                description_embedding: JSON.stringify([0.1, 0.2, 0.3])
              }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces/route')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'how to configure' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('query');
      expect(response.body).toHaveProperty('spaces');
      expect(response.body).toHaveProperty('method');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
