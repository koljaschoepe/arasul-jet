# Context: Adding New API Endpoint

## Quick Reference

**Route files:** `apps/dashboard-backend/src/routes/`
**Registration:** `src/routes/index.js` (central router — NOT in index.js)
**Tests:** `apps/dashboard-backend/__tests__/unit/`

---

## Steps

1. Create route file in `src/routes/`
2. Register in `src/routes/index.js`
3. Add auth middleware
4. Write tests in `__tests__/unit/`
5. Update `docs/API_REFERENCE.md`

---

## Route Pattern

```javascript
// src/routes/example.js
const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const db = require('../database');
const logger = require('../utils/logger');

// GET — list resources
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT * FROM example ORDER BY created_at DESC');
    res.json({ data: result.rows });
  })
);

// POST — create resource (with validation via Custom Errors)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, value } = req.body;
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Name ist erforderlich');
    }

    const result = await db.query('INSERT INTO example (name, value) VALUES ($1, $2) RETURNING *', [
      name,
      value,
    ]);

    logger.info(`Created example: ${result.rows[0].id}`);
    res.status(201).json({ data: result.rows[0] });
  })
);

// GET — single resource
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT * FROM example WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      throw new NotFoundError('Eintrag nicht gefunden');
    }
    res.json({ data: result.rows[0] });
  })
);

// DELETE — remove resource
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await db.query('DELETE FROM example WHERE id = $1 RETURNING id', [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      throw new NotFoundError('Eintrag nicht gefunden');
    }
    res.json({ message: 'Gelöscht' });
  })
);

module.exports = router;
```

---

## Registration in routes/index.js

```javascript
// src/routes/index.js
const exampleRoutes = require('./example');

// With auth (most routes)
router.use('/example', requireAuth, exampleRoutes);

// Without auth (public)
router.use('/example', exampleRoutes);

// With API key auth (external integrations)
router.use('/v1/external/example', requireApiKey, exampleRoutes);
```

---

## Test Pattern (Mock-Based)

```javascript
// __tests__/unit/example.test.js
const { createMockDatabase, createMockResponse, createMockLogger } = require('../testHelpers');

// Mock dependencies BEFORE require
jest.mock('../../src/database');
jest.mock('../../src/utils/logger', () => createMockLogger());

const db = require('../../src/database');

describe('Example Routes', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDatabase();
    db.query = mockDb.query;
  });

  describe('GET /', () => {
    it('should return all examples', async () => {
      const mockData = [{ id: 1, name: 'Test' }];
      mockDb.query.mockResolvedValue({ rows: mockData });

      const { default: request } = await import('supertest');
      // Or use the route handler directly via testRouteHandler()

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    });
  });

  describe('POST /', () => {
    it('should validate required fields', async () => {
      // Test that ValidationError is thrown for missing name
      const req = { body: {} };
      const res = createMockResponse();
      // ... invoke handler and expect error
    });
  });
});
```

---

## Response Format

Success:

```json
{ "data": { "id": 1, "name": "Example" } }
```

List:

```json
{ "data": [{ "id": 1 }, { "id": 2 }] }
```

Error (via Custom Error classes — automatic):

```json
{ "error": "Name ist erforderlich", "timestamp": "2026-03-29T..." }
```

---

## Checklist

- [ ] Route file in `src/routes/` mit `asyncHandler()` Wrapper
- [ ] Validation via `throw new ValidationError()` (nie `res.status(400)`)
- [ ] Registered in `src/routes/index.js` (mit `requireAuth`)
- [ ] Tests in `__tests__/unit/` mit Mock-Pattern
- [ ] `docs/API_REFERENCE.md` aktualisiert
- [ ] Error-Cases abgedeckt (404, 400, 409)
