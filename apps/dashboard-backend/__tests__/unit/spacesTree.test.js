/**
 * Unit tests für den Second-Brain-Ordnerbaum (Plan ide-workspace-shell):
 * - GET /api/spaces/tree (Explorer-Aggregat)
 * - POST /api/spaces mit parent_id (verschachtelte Ordner)
 * - PUT /api/spaces/:id parent_id (Verschieben inkl. Zyklus-Schutz)
 * - DELETE /api/spaces/:id (verweigert bei Unterordnern)
 * - GET/PUT/DELETE /api/spaces/:id/context-file (Kontextdateien)
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(async (callback) => {
    const db = require('../../src/database');
    const client = { query: db.query };
    return callback(client);
  }),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { vectors: [[0.1, 0.2, 0.3]] } }),
  create: jest.fn(() => ({
    post: jest.fn().mockResolvedValue({ data: { vectors: [[0.1, 0.2, 0.3]] } })
  }))
}));

jest.mock('../../src/services/core/cacheService', () => ({
  cacheService: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn()
  },
  cacheMiddleware: () => (req, res, next) => next()
}));

jest.mock('../../src/services/documents/minioService', () => ({
  uploadObject: jest.fn().mockResolvedValue(undefined),
  getObject: jest.fn(),
  isValidMinioPath: jest.fn().mockReturnValue(true)
}));

jest.mock('../../src/services/rag/folderContextService', () => ({
  getFolderContext: jest.fn(),
  getFolderContexts: jest.fn().mockResolvedValue([]),
  invalidateFolderContext: jest.fn()
}));

const db = require('../../src/database');
const minioService = require('../../src/services/documents/minioService');
const { invalidateFolderContext } = require('../../src/services/rag/folderContextService');
const { app } = require('../../src/server');
const { generateTestToken, mockUser, mockSession } = require('../helpers/authMock');

const SPACE_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const CHILD_ID = '33333333-3333-4333-8333-333333333333';

function setupMocksWithAuth(customHandler) {
  db.query.mockImplementation((query, params) => {
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
    if (customHandler) {
      return customHandler(query, params);
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('Spaces Tree & Nesting (ide-workspace-shell)', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  describe('GET /api/spaces/tree', () => {
    test('401 ohne Auth', async () => {
      const response = await request(app).get('/api/spaces/tree');
      expect(response.status).toBe(401);
    });

    test('liefert Spaces und Dokumente als flache Listen', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('FROM knowledge_spaces')) {
          return Promise.resolve({
            rows: [
              { id: PARENT_ID, name: 'Mandanten', parent_id: null },
              { id: SPACE_ID, name: 'Müller GmbH', parent_id: PARENT_ID }
            ]
          });
        }
        if (query.includes('FROM documents')) {
          return Promise.resolve({
            rows: [
              { id: 'd1', filename: 'bilanz.pdf', space_id: SPACE_ID, is_context_file: false }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/spaces/tree')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.spaces).toHaveLength(2);
      expect(response.body.spaces[1].parent_id).toBe(PARENT_ID);
      expect(response.body.documents).toHaveLength(1);
    });
  });

  describe('POST /api/spaces mit parent_id', () => {
    test('400 wenn parent_id kein UUID ist', async () => {
      setupMocksWithAuth();
      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Neu', description: 'Neu', parent_id: 'kein-uuid' });
      expect(response.status).toBe(400);
    });

    test('400 wenn Eltern-Ordner nicht existiert', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Neu', description: 'Neu', parent_id: PARENT_ID });

      expect(response.status).toBe(400);
    });

    test('erstellt Unterordner mit gültigem parent_id', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM knowledge_spaces WHERE id')) {
          return Promise.resolve({ rows: [{ id: PARENT_ID }] });
        }
        if (query.includes('SELECT slug FROM knowledge_spaces')) {
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
            rows: [{ id: CHILD_ID, name: 'Neu', parent_id: PARENT_ID }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/spaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Neu', description: 'Neu', parent_id: PARENT_ID });

      expect(response.status).toBe(201);
      expect(response.body.space.parent_id).toBe(PARENT_ID);
    });
  });

  describe('PUT /api/spaces/:id parent_id (Verschieben)', () => {
    test('400 beim Verschieben in sich selbst', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'A', is_system: false }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_id: SPACE_ID });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('sich selbst');
    });

    test('400 beim Verschieben in den eigenen Unterordner (Zyklus)', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'A', is_system: false }] });
        }
        if (query.includes('WITH RECURSIVE subtree')) {
          return Promise.resolve({ rows: [{ hit: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_id: CHILD_ID });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Unterordner');
    });

    test('verschiebt Ordner bei zyklusfreiem Ziel', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'A', is_system: false }] });
        }
        if (query.includes('WITH RECURSIVE subtree')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('UPDATE knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, parent_id: PARENT_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_id: PARENT_ID });

      expect(response.status).toBe(200);
      expect(response.body.space.parent_id).toBe(PARENT_ID);
    });

    test('parent_id: null verschiebt auf die Wurzelebene', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'A', is_system: false }] });
        }
        if (query.includes('UPDATE knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, parent_id: null }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parent_id: null });

      expect(response.status).toBe(200);
      expect(response.body.space.parent_id).toBeNull();
    });
  });

  describe('DELETE /api/spaces/:id mit Unterordnern', () => {
    test('409 wenn der Ordner Unterordner hat', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT * FROM knowledge_spaces')) {
          return Promise.resolve({
            rows: [{ id: SPACE_ID, name: 'A', is_system: false, is_default: false }]
          });
        }
        if (query.includes('child_count')) {
          return Promise.resolve({ rows: [{ child_count: 2 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete(`/api/spaces/${SPACE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain('Unterordner');
    });
  });

  describe('Kontextdateien (/api/spaces/:id/context-file)', () => {
    test('GET liefert null-Werte ohne Kontextdatei', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID }] });
        }
        if (query.includes('is_context_file')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get(`/api/spaces/${SPACE_ID}/context-file`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.document).toBeNull();
      expect(response.body.content).toBeNull();
    });

    test('PUT legt neue Kontextdatei an (status context, is_context_file)', async () => {
      let insertParams = null;
      let insertQuery = null;
      setupMocksWithAuth((query, params) => {
        if (query.includes('SELECT id, name FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'Müller GmbH' }] });
        }
        if (query.includes('is_context_file = TRUE') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('INSERT INTO documents')) {
          insertQuery = query;
          insertParams = params;
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}/context-file`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '# Kontext\nWichtige Hinweise.' });

      expect(response.status).toBe(200);
      expect(minioService.uploadObject).toHaveBeenCalled();
      expect(insertQuery).toContain("'context'");
      expect(insertQuery).toContain('is_context_file');
      expect(insertParams).toEqual(expect.arrayContaining([SPACE_ID, 'KONTEXT.md']));
      expect(invalidateFolderContext).toHaveBeenCalledWith(SPACE_ID);
    });

    test('PUT aktualisiert bestehende Kontextdatei am selben MinIO-Pfad', async () => {
      let updateRan = false;
      setupMocksWithAuth((query) => {
        if (query.includes('SELECT id, name FROM knowledge_spaces')) {
          return Promise.resolve({ rows: [{ id: SPACE_ID, name: 'Müller GmbH' }] });
        }
        if (query.includes('is_context_file = TRUE') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [{ id: 'doc-1', file_path: 'ctx.md' }] });
        }
        if (query.includes('UPDATE documents')) {
          updateRan = true;
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .put(`/api/spaces/${SPACE_ID}/context-file`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Neuer Inhalt' });

      expect(response.status).toBe(200);
      expect(updateRan).toBe(true);
      expect(minioService.uploadObject).toHaveBeenCalledWith(
        'ctx.md',
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(invalidateFolderContext).toHaveBeenCalledWith(SPACE_ID);
    });

    test('DELETE ohne Kontextdatei → 404', async () => {
      setupMocksWithAuth((query) => {
        if (query.includes('UPDATE documents')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete(`/api/spaces/${SPACE_ID}/context-file`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });
});
