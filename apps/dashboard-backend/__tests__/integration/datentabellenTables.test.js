/**
 * Integration tests for /api/v1/datentabellen/tables/*
 *
 * The datentabellen router is a two-database story: `pool` is the main
 * backend DB (used for auth + knowledge_spaces validation), and `dataDb`
 * is a separate Postgres pool that owns the dt_tables / dt_fields meta
 * tables plus the dynamically-created `data_<slug>` physical tables.
 *
 * This suite mocks both surfaces and verifies:
 *   - every endpoint's auth check fires
 *   - slug validation (only lowercase letters/numbers/underscores,
 *     must start with a letter, not a reserved keyword)
 *   - schema validation via validateBody
 *   - the create/delete/alter transactions run in the expected order
 *     (advisory lock → duplicate check → insert → CREATE TABLE → trigger)
 *   - 404/409/validation failure paths surface the correct HTTP code
 *   - system-table guard on PATCH/DELETE
 *   - type-change pre-check blocks ALTER COLUMN TYPE when data wouldn't
 *     cast cleanly
 */

const request = require('supertest');
const {
  generateTestToken,
  setupAuthMocks,
  mockUser,
  testRequiresAuth,
} = require('../helpers/authMock');

jest.mock('../../src/database');
jest.mock('../../src/dataDatabase');
jest.mock('../../src/utils/logger');

const pool = require('../../src/database'); // main db (auth + knowledge_spaces)
const dataDb = require('../../src/dataDatabase'); // data db (dt_* tables)
const logger = require('../../src/utils/logger');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

// Data DB is "ready" by default — the initialization middleware would
// otherwise short-circuit every request with a 503.
dataDb.isInitialized = jest.fn(() => true);
dataDb.initialize = jest.fn(() => Promise.resolve(true));
dataDb.healthCheck = jest.fn(() => Promise.resolve({ healthy: true }));

/**
 * Wraps a route-specific handler so auth queries on `pool` pass first.
 */
function authedPool(handler) {
  return (sql, params) => {
    if (sql.includes('token_blacklist')) return Promise.resolve({ rows: [] });
    if (sql.includes('active_sessions') && sql.includes('SELECT'))
      return Promise.resolve({ rows: [{ id: 1 }] });
    if (sql.includes('update_session_activity')) return Promise.resolve({ rows: [] });
    if (sql.includes('admin_users')) return Promise.resolve({ rows: [mockUser] });
    if (handler) return handler(sql, params);
    return Promise.resolve({ rows: [] });
  };
}

describe('Datentabellen Tables API', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
    dataDb.query.mockReset();
    dataDb.isInitialized.mockReturnValue(true);
    // Default dataDb.transaction: call the callback with a client that
    // delegates every query back to dataDb.query so individual tests can
    // program the script via one surface.
    dataDb.transaction = jest.fn(async (cb) => {
      const client = { query: (...args) => dataDb.query(...args) };
      return cb(client);
    });
    // Default: no main-db fall-through besides auth.
    pool.query.mockImplementation(authedPool());
  });

  // ---------------------------------------------------------------------------
  // GET /
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/datentabellen/tables', () => {
    testRequiresAuth(app, 'get', '/api/v1/datentabellen/tables');

    test('returns tables + total + row_count map (happy path)', async () => {
      const metaRows = [
        {
          id: 1,
          name: 'Orders',
          slug: 'orders',
          description: null,
          icon: '📦',
          color: '#45ADFF',
          is_system: false,
          created_at: '',
          updated_at: '',
          created_by: 'admin',
          space_id: null,
          status: 'active',
          category: null,
          needs_reindex: false,
          last_indexed_at: null,
          index_row_count: 0,
          field_count: 4,
        },
      ];
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*)::int as total')) return Promise.resolve({ rows: [{ total: 1 }] });
        if (sql.includes('FROM dt_tables t')) return Promise.resolve({ rows: metaRows });
        if (sql.includes('pg_stat_user_tables'))
          return Promise.resolve({ rows: [{ table_name: 'data_orders', row_count: 42 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({ slug: 'orders', row_count: 42 });
    });

    test('falls back to per-table COUNT(*) when pg_stat errors', async () => {
      const metaRows = [{ id: 1, slug: 'orders', field_count: 0 }];
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*)::int as total')) return Promise.resolve({ rows: [{ total: 1 }] });
        if (sql.includes('FROM dt_tables t')) return Promise.resolve({ rows: metaRows });
        if (sql.includes('pg_stat_user_tables')) return Promise.reject(new Error('blocked'));
        if (sql.includes('COUNT(*)::int as count FROM "data_orders"'))
          return Promise.resolve({ rows: [{ count: 7 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].row_count).toBe(7);
    });

    test('forwards filter params to the count + data queries', async () => {
      dataDb.query.mockImplementation((sql, params) => {
        if (sql.includes('COUNT(*)::int as total')) {
          expect(sql).toMatch(/t\.space_id = \$1/);
          expect(sql).toMatch(/t\.status = \$2/);
          expect(sql).toMatch(/ILIKE/);
          expect(params).toEqual(['space-1', 'active', '%foo%']);
          return Promise.resolve({ rows: [{ total: 0 }] });
        }
        if (sql.includes('FROM dt_tables t')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      await request(app)
        .get('/api/v1/datentabellen/tables?space_id=space-1&status=active&search=foo')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /:slug
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/datentabellen/tables/:slug', () => {
    testRequiresAuth(app, 'get', '/api/v1/datentabellen/tables/orders');

    test('rejects slug containing invalid characters', async () => {
      const response = await request(app)
        .get('/api/v1/datentabellen/tables/Bad-Name')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Ungültiger Tabellenname/);
    });

    test('returns 404 when table meta row is missing', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });
      const response = await request(app)
        .get('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('returns table with fields, views, row_count', async () => {
      const table = { id: 7, slug: 'orders', name: 'Orders' };
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug')) return Promise.resolve({ rows: [table] });
        if (sql.includes('FROM dt_fields')) return Promise.resolve({ rows: [{ id: 1, slug: 'name' }] });
        if (sql.includes('FROM dt_views')) return Promise.resolve({ rows: [{ id: 1, is_default: true }] });
        if (sql.includes('COUNT(*)::int as count FROM "data_orders"'))
          return Promise.resolve({ rows: [{ count: 12 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: 7,
        slug: 'orders',
        row_count: 12,
      });
      expect(response.body.data.fields).toHaveLength(1);
      expect(response.body.data.views).toHaveLength(1);
    });

    test('row_count falls back to 0 when physical table is missing', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug')) return Promise.resolve({ rows: [{ id: 1, slug: 'orders' }] });
        if (sql.includes('FROM dt_fields')) return Promise.resolve({ rows: [] });
        if (sql.includes('FROM dt_views')) return Promise.resolve({ rows: [] });
        if (sql.includes('COUNT(*)::int as count')) return Promise.reject(new Error('relation does not exist'));
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.row_count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/datentabellen/tables', () => {
    testRequiresAuth(app, 'post', '/api/v1/datentabellen/tables', { name: 'Orders' });

    test('rejects missing name via schema', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    test('returns 400 when space_id does not exist in main DB', async () => {
      pool.query.mockImplementation(
        authedPool((sql) => {
          if (sql.includes('FROM knowledge_spaces')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        })
      );

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Orders', space_id: 'missing' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Ungültiger Wissensbereich/);
    });

    test('returns 409 when slug already exists', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve({ rows: [] });
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Orders' });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/existiert bereits/);
    });

    test('creates table and issues DDL (advisory lock → insert → CREATE TABLE → trigger)', async () => {
      const seen = [];
      dataDb.query.mockImplementation((sql) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve({ rows: [] });
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [] });
        if (sql.includes('INSERT INTO dt_tables'))
          return Promise.resolve({ rows: [{ id: 1, slug: 'orders', name: 'Orders' }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Orders', createDefaultField: true });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ slug: 'orders' });
      // The full DDL sequence fired: lock, dup-check, INSERT, CREATE TABLE,
      // INSERT INTO dt_fields (default field), CREATE TRIGGER.
      expect(seen.some((s) => s.startsWith('SELECT pg_advisory_xact_lock'))).toBe(true);
      expect(seen.some((s) => s.startsWith('INSERT INTO dt_tables'))).toBe(true);
      expect(seen.some((s) => s.startsWith('CREATE TABLE'))).toBe(true);
      expect(seen.some((s) => s.startsWith('INSERT INTO dt_fields'))).toBe(true);
      expect(seen.some((s) => s.startsWith('CREATE TRIGGER'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /:slug
  // ---------------------------------------------------------------------------
  describe('PATCH /api/v1/datentabellen/tables/:slug', () => {
    testRequiresAuth(app, 'patch', '/api/v1/datentabellen/tables/orders', { name: 'New' });

    test('rejects invalid slug', async () => {
      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/BAD')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New' });
      expect(response.status).toBe(400);
    });

    test('returns 404 when table does not exist', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });
      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New' });
      expect(response.status).toBe(404);
    });

    test('rejects rename of a system table', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug'))
          return Promise.resolve({
            rows: [{ id: 1, slug: 'orders', name: 'Orders', is_system: true }],
          });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Systemtabellen/);
    });

    test('rejects PATCH with no writable fields (same name only)', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1, name: 'Orders', is_system: false }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Orders' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Keine Änderungen/);
    });

    test('updates and returns the new row on success', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1, name: 'Orders', is_system: false }] });
        if (sql.includes('UPDATE dt_tables'))
          return Promise.resolve({ rows: [{ id: 1, slug: 'orders', name: 'Renamed' }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Renamed');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /:slug
  // ---------------------------------------------------------------------------
  describe('DELETE /api/v1/datentabellen/tables/:slug', () => {
    testRequiresAuth(app, 'delete', '/api/v1/datentabellen/tables/orders');

    test('rejects system tables', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1, is_system: true }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/nicht gelöscht/);
    });

    test('drops physical + meta in a transaction on success', async () => {
      const seen = [];
      dataDb.query.mockImplementation((sql) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        if (sql.includes('FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1, slug: 'orders', is_system: false }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/datentabellen/tables/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(seen.some((s) => s.startsWith('DROP TABLE IF EXISTS'))).toBe(true);
      expect(seen.some((s) => s.startsWith('DELETE FROM dt_tables'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /:slug/fields
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/datentabellen/tables/:slug/fields', () => {
    testRequiresAuth(app, 'post', '/api/v1/datentabellen/tables/orders/fields', {
      name: 'Price',
      field_type: 'number',
    });

    test('rejects unknown field_type via schema', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables/orders/fields')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Price', field_type: 'alien' });
      expect(response.status).toBe(400);
    });

    test('returns 404 when parent table is missing', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/orders/fields')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Price', field_type: 'number' });

      expect(response.status).toBe(404);
    });

    test('auto-increments slug on duplicate and ALTERs physical table', async () => {
      const seen = [];
      let existingCalls = 0;
      dataDb.query.mockImplementation((sql, params) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('SELECT COALESCE(MAX(field_order)'))
          return Promise.resolve({ rows: [{ next_order: 3 }] });
        if (sql.includes('SELECT id FROM dt_fields WHERE table_id = $1 AND slug')) {
          existingCalls++;
          // First lookup (slug "price") returns a row → collision.
          // Second lookup (slug "price_2") returns empty → accepted.
          if (existingCalls === 1) return Promise.resolve({ rows: [{ id: 9 }] });
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('INSERT INTO dt_fields'))
          return Promise.resolve({
            rows: [{ id: 42, slug: params[2], name: params[1] }],
          });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/orders/fields')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Price', field_type: 'number' });

      expect(response.status).toBe(201);
      expect(response.body.data.slug).toBe('price_2');
      expect(response.body.data.name).toBe('Price 2');
      expect(seen.some((s) => s.startsWith('ALTER TABLE'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /:slug/fields/:fieldSlug
  // ---------------------------------------------------------------------------
  describe('DELETE /api/v1/datentabellen/tables/:slug/fields/:fieldSlug', () => {
    testRequiresAuth(
      app,
      'delete',
      '/api/v1/datentabellen/tables/orders/fields/price'
    );

    test('returns 404 when table is missing', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });
      const response = await request(app)
        .delete('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('returns 404 when field is missing', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('SELECT id FROM dt_fields'))
          return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });
      const response = await request(app)
        .delete('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
    });

    test('drops the column and deletes the metadata row in a transaction', async () => {
      const seen = [];
      dataDb.query.mockImplementation((sql) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('SELECT id FROM dt_fields'))
          return Promise.resolve({ rows: [{ id: 9 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .delete('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(seen.some((s) => s.includes('ALTER TABLE'))).toBe(true);
      expect(seen.some((s) => s.includes('DELETE FROM dt_fields'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /:slug/fields/:fieldSlug
  // ---------------------------------------------------------------------------
  describe('PATCH /api/v1/datentabellen/tables/:slug/fields/:fieldSlug', () => {
    testRequiresAuth(
      app,
      'patch',
      '/api/v1/datentabellen/tables/orders/fields/price',
      { is_required: true }
    );

    test('rejects empty patch (no writable fields)', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Keine Änderungen/);
    });

    test('updates metadata only when field_type is unchanged', async () => {
      const seen = [];
      dataDb.query.mockImplementation((sql, params) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('UPDATE dt_fields'))
          return Promise.resolve({ rows: [{ id: 9, slug: 'price', is_required: params[0] }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`)
        .send({ is_required: true });

      expect(response.status).toBe(200);
      // No ALTER TABLE should fire when the type stays the same.
      expect(seen.some((s) => s.startsWith('ALTER TABLE'))).toBe(false);
    });

    test('blocks type change to number when data would fail the numeric cast', async () => {
      dataDb.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('bad_rows')) return Promise.resolve({ rows: [{ bad_rows: 3 }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`)
        .send({ field_type: 'number' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Typänderung nicht möglich/);
    });

    test('performs ALTER COLUMN TYPE when pre-check passes', async () => {
      const seen = [];
      dataDb.query.mockImplementation((sql, params) => {
        seen.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (sql.includes('SELECT id FROM dt_tables WHERE slug'))
          return Promise.resolve({ rows: [{ id: 1 }] });
        if (sql.includes('bad_rows')) return Promise.resolve({ rows: [{ bad_rows: 0 }] });
        if (sql.includes('UPDATE dt_fields'))
          return Promise.resolve({ rows: [{ id: 9, slug: 'price', field_type: 'number' }] });
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/orders/fields/price')
        .set('Authorization', `Bearer ${token}`)
        .send({ field_type: 'number' });

      expect(response.status).toBe(200);
      expect(response.body.data.field_type).toBe('number');
      expect(seen.some((s) => s.startsWith('ALTER TABLE'))).toBe(true);
    });
  });
});
