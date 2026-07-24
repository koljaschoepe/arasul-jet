/**
 * Unit-Tests für die Projekt-Route (Workspace-Neuausrichtung Batch 2).
 * Deckt Liste, aktives Projekt (Get/Set), Anlegen und die Lösch-Schutzregeln ab.
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(async callback => {
    const db = require('../../src/database');
    return callback({ query: db.query });
  }),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/core/cacheService', () => ({
  cacheService: { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() },
  cacheMiddleware: () => (req, res, next) => next(),
}));

const db = require('../../src/database');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
    if (query.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (query.includes('active_sessions') && query.includes('SELECT')) {
      return Promise.resolve({ rows: [mockSession] });
    }
    if (query.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (query.includes('admin_users')) return Promise.resolve({ rows: [mockUser] });
    if (customHandler) return customHandler(query, params);
    return Promise.resolve({ rows: [] });
  });
}

// Gültige v4-UUID (z.uuid() verlangt ein gültiges Versions-Nibble).
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('Projects Routes', () => {
  let token;
  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  test('GET /api/projects — 401 ohne Token', async () => {
    const response = await request(app).get('/api/projects');
    expect(response.status).toBe(401);
  });

  test('GET /api/projects — liefert die Projektliste', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('FROM projects p')) {
        return Promise.resolve({
          rows: [
            { id: PROJECT_ID, name: 'Standard', slug: 'standard', is_default: true, folder_count: 3 },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data[0].name).toBe('Standard');
  });

  test('GET /api/projects/active — aktives Projekt + space_ids', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('active_project_id')) {
        return Promise.resolve({ rows: [{ active_project_id: PROJECT_ID }] });
      }
      if (query.includes('SELECT * FROM projects WHERE id')) {
        return Promise.resolve({ rows: [{ id: PROJECT_ID, name: 'Standard', is_default: true }] });
      }
      if (query.includes('FROM knowledge_spaces WHERE project_id')) {
        return Promise.resolve({ rows: [{ id: 'space-1' }, { id: 'space-2' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .get('/api/projects/active')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.project.id).toBe(PROJECT_ID);
    expect(response.body.data.space_ids).toEqual(['space-1', 'space-2']);
  });

  test('POST /api/projects — legt ein Projekt an (201)', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('LOWER(name)')) return Promise.resolve({ rows: [] });
      if (query.includes('slug LIKE')) return Promise.resolve({ rows: [] });
      if (query.includes('MAX(sort_order)')) return Promise.resolve({ rows: [{ next_order: 1 }] });
      if (query.includes('INSERT INTO projects')) {
        return Promise.resolve({ rows: [{ id: PROJECT_ID, name: 'Marketing', slug: 'marketing' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Marketing' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Marketing');
  });

  test('PUT /api/projects/active — setzt das aktive Projekt (200)', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('SELECT * FROM projects WHERE id')) {
        return Promise.resolve({ rows: [{ id: PROJECT_ID, name: 'Standard' }] });
      }
      if (query.includes('FROM knowledge_spaces WHERE project_id')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .put('/api/projects/active')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: PROJECT_ID });

    expect(response.status).toBe(200);
    expect(response.body.data.active_project_id).toBe(PROJECT_ID);
  });

  test('DELETE /api/projects/:id — Standard-Projekt ist geschützt (403)', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('SELECT * FROM projects WHERE id')) {
        return Promise.resolve({ rows: [{ id: PROJECT_ID, name: 'Standard', is_default: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  test('DELETE /api/projects/:id — nicht-leeres Projekt (409)', async () => {
    setupMocksWithAuth(query => {
      if (query.includes('SELECT * FROM projects WHERE id')) {
        return Promise.resolve({ rows: [{ id: PROJECT_ID, name: 'Marketing', is_default: false }] });
      }
      if (query.includes('COUNT(*)') && query.includes('knowledge_spaces')) {
        return Promise.resolve({ rows: [{ c: 2 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const response = await request(app)
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
  });
});
