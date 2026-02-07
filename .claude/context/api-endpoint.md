# Context: Adding New API Endpoint

## Quick Reference

**Location:** `services/dashboard-backend/src/routes/`
**Pattern:** `routes/auth.js` (simple), `routes/llm.js` (SSE streaming)
**Registration:** `src/index.js`

---

## Steps

1. Create route file in `src/routes/`
2. Register in `src/index.js`
3. Add auth middleware if needed
4. Write tests in `__tests__/`
5. Update `docs/API_REFERENCE.md`

---

## Code Pattern

```javascript
// src/routes/example.js
const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const auth = require('../middleware/auth');
const { query } = require('../database');
const logger = require('../utils/logger');

// GET endpoint with auth
router.get('/', auth, asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM table WHERE user_id = $1', [req.user.id]);
  res.json({
    data: result.rows,
    timestamp: new Date().toISOString()
  });
}));

// POST endpoint with validation
router.post('/', auth, asyncHandler(async (req, res) => {
  const { name, value } = req.body;

  // Validation
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: 'Name is required',
      timestamp: new Date().toISOString()
    });
  }

  // Business logic
  const result = await query(
    'INSERT INTO table (name, value, user_id) VALUES ($1, $2, $3) RETURNING *',
    [name, value, req.user.id]
  );

  logger.info(`Created record: ${result.rows[0].id}`);

  res.status(201).json({
    data: result.rows[0],
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
```

---

## Registration in index.js

```javascript
// src/index.js
const exampleRoutes = require('./routes/example');
app.use('/api/example', exampleRoutes);
```

---

## Response Format (ALWAYS)

```json
{
  "data": { ... },
  "timestamp": "2026-01-25T10:30:00.000Z"
}
```

Error response:
```json
{
  "error": "Error message",
  "details": { ... },
  "timestamp": "2026-01-25T10:30:00.000Z"
}
```

---

## Auth Middleware

```javascript
const auth = require('../middleware/auth');

// Protected route
router.get('/', auth, asyncHandler(...));

// Public route (no auth)
router.get('/public', asyncHandler(...));
```

---

## Test Pattern

```javascript
// __tests__/example.test.js
const request = require('supertest');
const app = require('../src/index');

describe('Example API', () => {
  let authToken;

  beforeAll(async () => {
    // Get auth token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'test' });
    authToken = res.body.token;
  });

  it('should return data', async () => {
    const res = await request(app)
      .get('/api/example')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('timestamp');
  });
});
```

---

## Checklist

- [ ] Route file created in `src/routes/`
- [ ] Registered in `src/index.js`
- [ ] Auth middleware added (if needed)
- [ ] asyncHandler wrapper used
- [ ] Response includes timestamp
- [ ] Input validation added
- [ ] Tests written
- [ ] `docs/API_REFERENCE.md` updated
