/**
 * Integration tests for /api/knowledge-graph/*
 *
 * The knowledge-graph route is a read-heavy view over kg_entities /
 * kg_relations / kg_entity_documents plus two POST endpoints that talk
 * to the document-indexer service. We mock the DB and axios and verify:
 *   - auth on every endpoint
 *   - input validation (search length, invalid types, bad UUID, missing
 *     required query params)
 *   - happy-path response shapes
 *   - safeguards get applied: limits clamped, depth clamped, etc.
 *   - POST /query still returns 200 when entity extraction fails
 *   - POST /refine passes 409 through and surfaces other indexer
 *     failures as 503
 *   - GET /refine/status falls back to direct DB stats when indexer
 *     is unreachable
 */

const request = require('supertest');
const {
  generateTestToken,
  setupAuthMocks,
  mockUser,
  testRequiresAuth,
} = require('../helpers/authMock');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const axios = require('axios');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

const authedDb = (handler) => (sql, params) => {
  if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
  if (sql.includes('active_sessions') && sql.includes('SELECT'))
    return Promise.resolve({ rows: [{ id: 1 }] });
  if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
  if (sql.includes('admin_users')) return Promise.resolve({ rows: [mockUser] });
  return handler(sql, params);
};

describe('Knowledge Graph API', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    axios.get.mockReset();
    axios.post.mockReset();
  });

  // ---------------------------------------------------------------------------
  // GET /entities
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/entities', () => {
    testRequiresAuth(app, 'get', '/api/knowledge-graph/entities');

    test('returns entities with default limit when no filters given', async () => {
      const rows = [{ id: 1, name: 'Acme', type: 'Organisation', mention_count: 5 }];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/FROM kg_entities/);
          expect(sql).not.toMatch(/WHERE/);
          expect(params).toEqual([50]);
          return Promise.resolve({ rows });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/entities')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ entities: rows, total: 1 });
    });

    test('applies search and type filters, caps limit at 200', async () => {
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/name ILIKE/);
          expect(sql).toMatch(/entity_type =/);
          expect(params).toEqual(['%acme%', 'Organisation', 200]);
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/entities?search=acme&type=Organisation&limit=5000')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    test('rejects search longer than 200 chars', async () => {
      setupAuthMocks(db);
      const longSearch = 'x'.repeat(201);
      const response = await request(app)
        .get(`/api/knowledge-graph/entities?search=${longSearch}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Suchbegriff zu lang/);
    });

    test('rejects invalid entity type', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/knowledge-graph/entities?type=Spaceship')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Ungültiger Entity-Typ/);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /related/:entityName
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/related/:entityName', () => {
    testRequiresAuth(app, 'get', '/api/knowledge-graph/related/Alice');

    test('traverses graph with clamped depth and limit', async () => {
      const rows = [{ name: 'Bob', type: 'Person', distance: 1, relation: 'KENNT' }];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/RECURSIVE graph_walk/);
          // depth=9 is clamped to 4, limit=500 is clamped to 100
          expect(params).toEqual(['Alice', 4, 100]);
          return Promise.resolve({ rows });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/related/Alice?depth=9&limit=500')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ entity: 'Alice', related: rows, total: 1 });
    });

    test('rejects entity name longer than 500 chars', async () => {
      setupAuthMocks(db);
      const longName = encodeURIComponent('a'.repeat(501));
      const response = await request(app)
        .get(`/api/knowledge-graph/related/${longName}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Entity-Name zu lang/);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /document/:documentId
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/document/:documentId', () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';

    testRequiresAuth(app, 'get', `/api/knowledge-graph/document/${validUuid}`);

    test('rejects non-UUID document id', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/knowledge-graph/document/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Ungültige Dokument-ID/);
    });

    test('returns 404 when document does not exist', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM documents')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get(`/api/knowledge-graph/document/${validUuid}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.message).toMatch(/Dokument nicht gefunden/);
    });

    test('returns document + entities + relations on success', async () => {
      const doc = { id: validUuid, filename: 'report.pdf', title: 'Q1 Report' };
      const entities = [{ id: 7, name: 'Acme', type: 'Organisation', mention_count: 3 }];
      const relations = [
        {
          source_name: 'Acme',
          source_type: 'Organisation',
          relation_type: 'GEGRÜNDET_VON',
          target_name: 'Bob',
          target_type: 'Person',
          context: 'founded in 1999',
        },
      ];

      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM documents')) return Promise.resolve({ rows: [doc] });
          if (sql.includes('kg_entity_documents') && !sql.includes('kg_relations'))
            return Promise.resolve({ rows: entities });
          if (sql.includes('FROM kg_relations')) return Promise.resolve({ rows: relations });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get(`/api/knowledge-graph/document/${validUuid}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        document: doc,
        entities,
        relations,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /connections
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/connections', () => {
    testRequiresAuth(app, 'get', '/api/knowledge-graph/connections');

    test('rejects when entity1 or entity2 is missing', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .get('/api/knowledge-graph/connections?entity1=Alice')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/entity1 und entity2 sind erforderlich/);
    });

    test('returns paths array on success with depth clamped to 4', async () => {
      const rows = [{ nodes: ['Alice', 'Bob'], relations: ['KENNT'] }];
      db.query.mockImplementation(
        authedDb((sql, params) => {
          expect(sql).toMatch(/RECURSIVE path_search/);
          // maxDepth=99 clamps to 4
          expect(params).toEqual(['Alice', 'Bob', 4]);
          return Promise.resolve({ rows });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/connections?entity1=Alice&entity2=Bob&maxDepth=99')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        from: 'Alice',
        to: 'Bob',
        paths: rows,
        found: true,
      });
    });

    test('found=false when no paths exist', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('RECURSIVE path_search')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/connections?entity1=A&entity2=B')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.found).toBe(false);
      expect(response.body.paths).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /stats
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/stats', () => {
    testRequiresAuth(app, 'get', '/api/knowledge-graph/stats');

    test('aggregates entity/relation/document counts and breakdowns', async () => {
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('entity_count')) {
            return Promise.resolve({
              rows: [{ entity_count: '120', relation_count: '340', document_count: '15' }],
            });
          }
          if (sql.includes('FROM kg_entities') && sql.includes('GROUP BY entity_type')) {
            return Promise.resolve({
              rows: [
                { entity_type: 'Person', count: '70' },
                { entity_type: 'Organisation', count: '50' },
              ],
            });
          }
          if (sql.includes('GROUP BY relation_type')) {
            return Promise.resolve({
              rows: [{ relation_type: 'KENNT', count: '200' }],
            });
          }
          if (sql.includes('ORDER BY mention_count DESC')) {
            return Promise.resolve({
              rows: [{ name: 'Acme', type: 'Organisation', mention_count: 99 }],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        entities: 120,
        relations: 340,
        documents: 15,
        entity_types: { Person: 70, Organisation: 50 },
        relation_types: { KENNT: 200 },
        top_entities: [{ name: 'Acme', type: 'Organisation', mention_count: 99 }],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /query
  // ---------------------------------------------------------------------------
  describe('POST /api/knowledge-graph/query', () => {
    testRequiresAuth(app, 'post', '/api/knowledge-graph/query', { question: 'test' });

    test('rejects empty question via validateBody', async () => {
      setupAuthMocks(db);
      const response = await request(app)
        .post('/api/knowledge-graph/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '' });

      expect(response.status).toBe(400);
    });

    test('happy path: extracts entities, walks graph, returns linked documents', async () => {
      axios.post.mockImplementation((url) => {
        if (url.includes('/extract-entities')) {
          return Promise.resolve({
            data: { entities: [{ name: 'Acme', type: 'Organisation' }] },
          });
        }
        return Promise.reject(new Error('unexpected POST ' + url));
      });

      db.query.mockImplementation(
        authedDb((sql, params) => {
          if (sql.includes('RECURSIVE graph_walk')) {
            expect(params[0]).toBe('Acme');
            return Promise.resolve({
              rows: [{ name: 'Bob', type: 'Person', distance: 1, relation: 'KENNT' }],
            });
          }
          if (sql.includes('FROM documents')) {
            expect(params[0]).toEqual(['acme']);
            return Promise.resolve({
              rows: [{ id: 'doc-1', filename: 'a.pdf', title: 'A', entity_name: 'Acme' }],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .post('/api/knowledge-graph/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'Tell me about Acme', include_documents: true });

      expect(response.status).toBe(200);
      expect(response.body.question).toBe('Tell me about Acme');
      expect(response.body.entities).toHaveLength(1);
      expect(response.body.graph_relations).toHaveLength(1);
      expect(response.body.graph_context).toMatch(/Acme/);
      expect(response.body.linked_documents).toHaveLength(1);
    });

    test('returns 503 when entity extraction fails (document-indexer down)', async () => {
      axios.post.mockRejectedValue(new Error('indexer down'));
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/knowledge-graph/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'hello', include_documents: false });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /refine
  // ---------------------------------------------------------------------------
  describe('POST /api/knowledge-graph/refine', () => {
    testRequiresAuth(app, 'post', '/api/knowledge-graph/refine');

    test('passes indexer response through on success', async () => {
      setupAuthMocks(db);
      axios.post.mockResolvedValue({ data: { started: true, job_id: 'ref-1' } });

      const response = await request(app)
        .post('/api/knowledge-graph/refine')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ started: true, job_id: 'ref-1' });
    });

    test('passes through 409 from indexer (refinement already running)', async () => {
      setupAuthMocks(db);
      const err = new Error('conflict');
      err.response = { status: 409, data: { error: 'already running' } };
      axios.post.mockRejectedValue(err);

      const response = await request(app)
        .post('/api/knowledge-graph/refine')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'already running' });
    });

    test('surfaces other indexer failures as 503', async () => {
      setupAuthMocks(db);
      axios.post.mockRejectedValue(new Error('connection refused'));

      const response = await request(app)
        .post('/api/knowledge-graph/refine')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error.message).toMatch(/Graph-Verfeinerung/);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /refine/status
  // ---------------------------------------------------------------------------
  describe('GET /api/knowledge-graph/refine/status', () => {
    testRequiresAuth(app, 'get', '/api/knowledge-graph/refine/status');

    test('returns indexer data when reachable', async () => {
      setupAuthMocks(db);
      axios.get.mockResolvedValue({
        data: { is_running: true, progress: 0.5 },
      });

      const response = await request(app)
        .get('/api/knowledge-graph/refine/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ is_running: true, progress: 0.5 });
    });

    test('falls back to direct DB stats when indexer is unreachable', async () => {
      axios.get.mockRejectedValue(new Error('ECONNREFUSED'));
      db.query.mockImplementation(
        authedDb((sql) => {
          if (sql.includes('FROM kg_entities')) {
            return Promise.resolve({
              rows: [{ total_entities: '100', refined_entities: '40', merged_entities: '5' }],
            });
          }
          if (sql.includes('FROM kg_relations')) {
            return Promise.resolve({
              rows: [{ total_relations: '200', refined_relations: '80', unrefined_generic: '20' }],
            });
          }
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .get('/api/knowledge-graph/refine/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('database_fallback');
      expect(response.body.is_running).toBe(false);
      expect(response.body.entities.total_entities).toBe('100');
      expect(response.body.relations.total_relations).toBe('200');
    });
  });
});
