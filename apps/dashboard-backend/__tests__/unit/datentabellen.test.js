/**
 * Datentabellen Routes Unit Tests
 * Tests for /api/v1/datentabellen/tables CRUD and field operations
 *
 * Uses middleware mock for route isolation (same pattern as documents.test.js)
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies before requiring the routes
jest.mock('../../src/dataDatabase');
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');

const dataDb = require('../../src/dataDatabase');
const pool = require('../../src/database');
const logger = require('../../src/utils/logger');

// Mock logger methods
logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

// Mock auth middleware
jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { username: 'testuser', id: 1 };
    req.tokenData = { userId: 1, username: 'testuser', jti: 'test-jti', type: 'access' };
    next();
  },
}));

// Import routes after mocking
const tablesRouter = require('../../src/routes/datentabellen/tables');
const { errorHandler } = require('../../src/middleware/errorHandler');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/v1/datentabellen/tables', tablesRouter);
app.use(errorHandler);

// Mock data
const MOCK_TABLE = {
  id: 'table-uuid-1',
  name: 'Produkte',
  slug: 'produkte',
  description: 'Produktliste',
  icon: '📦',
  color: '#45ADFF',
  is_system: false,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  created_by: 'admin',
  space_id: null,
  status: 'active',
  category: null,
};

const MOCK_FIELD = {
  id: 'field-uuid-1',
  table_id: 'table-uuid-1',
  name: 'Preis',
  slug: 'preis',
  field_type: 'number',
  field_order: 0,
  is_required: false,
  is_unique: false,
  is_primary_display: false,
};

describe('Datentabellen Tables Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dataDb.query.mockReset();
    dataDb.transaction.mockReset();
    pool.query.mockReset();
  });

  // =====================================================
  // GET /api/v1/datentabellen/tables - List Tables
  // =====================================================
  describe('GET /api/v1/datentabellen/tables', () => {
    test('returns empty list when no tables exist', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // Count
        .mockResolvedValueOnce({ rows: [] }); // Tables

      const response = await request(app).get('/api/v1/datentabellen/tables');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    test('returns tables with row counts', async () => {
      const mockTables = [
        { ...MOCK_TABLE, field_count: 3 },
        { ...MOCK_TABLE, id: 'table-2', name: 'Kunden', slug: 'kunden', field_count: 5 },
      ];

      dataDb.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // Count
        .mockResolvedValueOnce({ rows: mockTables }) // Tables
        .mockResolvedValueOnce({ rows: [{ table_name: 'data_produkte', row_count: 42 }, { table_name: 'data_kunden', row_count: 15 }] }); // pg_stat

      const response = await request(app).get('/api/v1/datentabellen/tables');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.data[0].row_count).toBe(42);
      expect(response.body.data[1].row_count).toBe(15);
    });

    test('filters by space_id', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ ...MOCK_TABLE, field_count: 2, space_id: 'space-1' }] })
        .mockResolvedValueOnce({ rows: [{ table_name: 'data_produkte', row_count: 10 }] });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables')
        .query({ space_id: 'space-1' });

      expect(response.status).toBe(200);
      expect(dataDb.query).toHaveBeenCalledWith(
        expect.stringContaining('t.space_id = $'),
        expect.arrayContaining(['space-1'])
      );
    });

    test('filters by search term', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ ...MOCK_TABLE, field_count: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/v1/datentabellen/tables')
        .query({ search: 'Produkt' });

      expect(response.status).toBe(200);
      expect(dataDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%Produkt%'])
      );
    });

    test('handles pg_stat query failure with fallback count', async () => {
      const mockTables = [{ ...MOCK_TABLE, field_count: 2 }];

      dataDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // Count
        .mockResolvedValueOnce({ rows: mockTables }) // Tables
        .mockRejectedValueOnce(new Error('pg_stat error')) // pg_stat fails
        .mockResolvedValueOnce({ rows: [{ count: 7 }] }); // Fallback COUNT(*)

      const response = await request(app).get('/api/v1/datentabellen/tables');

      expect(response.status).toBe(200);
      expect(response.body.data[0].row_count).toBe(7);
    });
  });

  // =====================================================
  // GET /api/v1/datentabellen/tables/:slug - Single Table
  // =====================================================
  describe('GET /api/v1/datentabellen/tables/:slug', () => {
    test('returns table with fields and views', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [MOCK_TABLE] }) // Table
        .mockResolvedValueOnce({ rows: [MOCK_FIELD] }) // Fields
        .mockResolvedValueOnce({ rows: [] }) // Views
        .mockResolvedValueOnce({ rows: [{ count: 10 }] }); // Row count

      const response = await request(app).get('/api/v1/datentabellen/tables/produkte');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Produkte');
      expect(response.body.data.fields).toHaveLength(1);
      expect(response.body.data.row_count).toBe(10);
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/v1/datentabellen/tables/nonexistent');

      expect(response.status).toBe(404);
    });

    test('returns 400 for invalid slug', async () => {
      const response = await request(app).get('/api/v1/datentabellen/tables/DROP%20TABLE');

      expect(response.status).toBe(400);
    });
  });

  // =====================================================
  // POST /api/v1/datentabellen/tables - Create Table
  // =====================================================
  describe('POST /api/v1/datentabellen/tables', () => {
    test('creates table successfully', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // Check slug exists
          .mockResolvedValueOnce({ rows: [MOCK_TABLE] }) // Insert
          .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
          .mockResolvedValueOnce({ rows: [] }), // CREATE TRIGGER
      };

      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ name: 'Produkte', description: 'Produktliste' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('erstellt');
    });

    test('creates table with default field when createDefaultField is true', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // Check slug exists
          .mockResolvedValueOnce({ rows: [MOCK_TABLE] }) // Insert
          .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE with name column
          .mockResolvedValueOnce({ rows: [] }) // Insert default field
          .mockResolvedValueOnce({ rows: [] }), // CREATE TRIGGER
      };

      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ name: 'Kunden', createDefaultField: true });

      expect(response.status).toBe(201);
      // Verify the default field insert was called
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO dt_fields"),
        expect.arrayContaining([MOCK_TABLE.id])
      );
    });

    test('returns 400 without name', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ description: 'No name' });

      expect(response.status).toBe(400);
    });

    test('returns 400 for empty name', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ name: '   ' });

      expect(response.status).toBe(400);
    });

    test('returns 409 for duplicate table name', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }), // Slug already exists
      };

      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ name: 'Produkte' });

      expect(response.status).toBe(409);
    });

    test('validates space_id against main database', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // Space not found

      const response = await request(app)
        .post('/api/v1/datentabellen/tables')
        .send({ name: 'Test', space_id: 'invalid-space' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Wissensbereich');
    });
  });

  // =====================================================
  // PATCH /api/v1/datentabellen/tables/:slug - Update
  // =====================================================
  describe('PATCH /api/v1/datentabellen/tables/:slug', () => {
    test('updates table metadata', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [MOCK_TABLE] }) // Existing table
        .mockResolvedValueOnce({ rows: [{ ...MOCK_TABLE, description: 'Neue Beschreibung' }] }); // Update result

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/produkte')
        .send({ description: 'Neue Beschreibung' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/nonexistent')
        .send({ description: 'Update' });

      expect(response.status).toBe(404);
    });

    test('prevents renaming system tables', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [{ ...MOCK_TABLE, is_system: true }] });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/produkte')
        .send({ name: 'Neuer Name' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Systemtabellen');
    });

    test('validates status values', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [MOCK_TABLE] });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/produkte')
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Ungültiger Status');
    });

    test('returns 400 for invalid slug', async () => {
      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/DROP%20TABLE')
        .send({ name: 'test' });

      expect(response.status).toBe(400);
    });
  });

  // =====================================================
  // DELETE /api/v1/datentabellen/tables/:slug
  // =====================================================
  describe('DELETE /api/v1/datentabellen/tables/:slug', () => {
    test('deletes table and data', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // DROP TABLE
          .mockResolvedValueOnce({ rows: [] }), // DELETE meta
      };

      dataDb.query.mockResolvedValueOnce({ rows: [MOCK_TABLE] }); // Check exists
      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app).delete('/api/v1/datentabellen/tables/produkte');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('gelöscht');
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).delete('/api/v1/datentabellen/tables/nonexistent');

      expect(response.status).toBe(404);
    });

    test('prevents deleting system tables', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [{ ...MOCK_TABLE, is_system: true }] });

      const response = await request(app).delete('/api/v1/datentabellen/tables/system_table');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Systemtabellen');
    });

    test('returns 400 for invalid slug', async () => {
      const response = await request(app).delete('/api/v1/datentabellen/tables/DROP%20TABLE');

      expect(response.status).toBe(400);
    });
  });

  // =====================================================
  // POST /api/v1/datentabellen/tables/:slug/fields - Add Field
  // =====================================================
  describe('POST /api/v1/datentabellen/tables/:slug/fields', () => {
    test('adds text field successfully', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ next_order: 1 }] }) // Next order
          .mockResolvedValueOnce({ rows: [] }) // No duplicate
          .mockResolvedValueOnce({ rows: [] }) // ALTER TABLE
          .mockResolvedValueOnce({ rows: [MOCK_FIELD] }), // Insert field meta
      };

      dataDb.query.mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] }); // Get table
      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/produkte/fields')
        .send({ name: 'Preis', field_type: 'number' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('hinzugefügt');
    });

    test('returns 400 without field name', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables/produkte/fields')
        .send({ field_type: 'text' });

      expect(response.status).toBe(400);
    });

    test('returns 400 without field type', async () => {
      const response = await request(app)
        .post('/api/v1/datentabellen/tables/produkte/fields')
        .send({ name: 'Email' });

      expect(response.status).toBe(400);
    });

    test('returns 400 for invalid field type', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/produkte/fields')
        .send({ name: 'Test', field_type: 'nonexistent_type' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Ungültiger Feldtyp');
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/nonexistent/fields')
        .send({ name: 'Test', field_type: 'text' });

      expect(response.status).toBe(404);
    });

    test('auto-increments slug for duplicate field name', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ next_order: 1 }] }) // Next order
          .mockResolvedValueOnce({ rows: [{ id: 'existing-field' }] }) // First slug check: duplicate found
          .mockResolvedValueOnce({ rows: [] }) // Second slug check (preis_2): no duplicate
          .mockResolvedValueOnce({ rows: [] }) // ALTER TABLE ADD COLUMN
          .mockResolvedValueOnce({ rows: [{ ...MOCK_FIELD, slug: 'preis_2', name: 'Preis 2' }] }), // Insert field meta
      };

      dataDb.query.mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] });
      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app)
        .post('/api/v1/datentabellen/tables/produkte/fields')
        .send({ name: 'Preis', field_type: 'number' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('supports all valid field types', async () => {
      const validTypes = [
        'text', 'textarea', 'number', 'currency', 'date', 'datetime',
        'select', 'multiselect', 'checkbox', 'relation', 'file',
        'image', 'email', 'url', 'phone', 'formula',
      ];

      for (const fieldType of validTypes) {
        jest.clearAllMocks();
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ next_order: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ ...MOCK_FIELD, field_type: fieldType }] }),
        };

        dataDb.query.mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] });
        dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

        const response = await request(app)
          .post('/api/v1/datentabellen/tables/produkte/fields')
          .send({ name: `Test ${fieldType}`, field_type: fieldType });

        expect(response.status).toBe(201);
      }
    });
  });

  // =====================================================
  // DELETE /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
  // =====================================================
  describe('DELETE /api/v1/datentabellen/tables/:slug/fields/:fieldSlug', () => {
    test('removes field successfully', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // DROP COLUMN
          .mockResolvedValueOnce({ rows: [] }), // DELETE meta
      };

      dataDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] }) // Get table
        .mockResolvedValueOnce({ rows: [{ id: 'field-uuid-1' }] }); // Get field

      dataDb.transaction.mockImplementation(async (callback) => callback(mockClient));

      const response = await request(app).delete(
        '/api/v1/datentabellen/tables/produkte/fields/preis'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).delete(
        '/api/v1/datentabellen/tables/nonexistent/fields/preis'
      );

      expect(response.status).toBe(404);
    });

    test('returns 404 for non-existent field', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // Field not found

      const response = await request(app).delete(
        '/api/v1/datentabellen/tables/produkte/fields/nonexistent'
      );

      expect(response.status).toBe(404);
    });

    test('returns 400 for invalid slug', async () => {
      const response = await request(app).delete(
        '/api/v1/datentabellen/tables/DROP%20TABLE/fields/test'
      );

      expect(response.status).toBe(400);
    });
  });

  // =====================================================
  // PATCH /api/v1/datentabellen/tables/:slug/fields/:fieldSlug
  // =====================================================
  describe('PATCH /api/v1/datentabellen/tables/:slug/fields/:fieldSlug', () => {
    test('updates field metadata', async () => {
      dataDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] }) // Get table
        .mockResolvedValueOnce({ rows: [{ ...MOCK_FIELD, name: 'Neuer Name' }] }); // Update result

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/produkte/fields/preis')
        .send({ name: 'Neuer Name' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('returns 400 for invalid field_type', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [{ id: 'table-uuid-1' }] });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/produkte/fields/preis')
        .send({ field_type: 'invalid_type' });

      expect(response.status).toBe(400);
    });

    test('returns 404 for non-existent table', async () => {
      dataDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch('/api/v1/datentabellen/tables/nonexistent/fields/preis')
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });
});
