# Backend Context - Node.js/Express API

## Entry Points
- **Main App**: `services/dashboard-backend/src/index.js`
- **Server**: `services/dashboard-backend/src/server.js`
- **Routes**: `services/dashboard-backend/src/routes/` (31 files)
- **Services**: `services/dashboard-backend/src/services/` (13 files)
- **Middleware**: `services/dashboard-backend/src/middleware/`
- **Tests**: `services/dashboard-backend/__tests__/`

## Route Files (31)

| File | Endpoints | Auth |
|------|-----------|------|
| auth.js | `/api/auth/*` | No/Yes |
| llm.js | `/api/llm/*` | Yes |
| rag.js | `/api/rag/*` | Yes |
| chats.js | `/api/chats/*` | Yes |
| documents.js | `/api/documents/*` | Yes |
| metrics.js | `/api/metrics/*` | Yes |
| services.js | `/api/services/*` | Yes |
| settings.js | `/api/settings/*` | Yes |
| alerts.js | `/api/alerts/*` | Yes |
| events.js | `/api/events/*` | Yes |
| telegram.js | `/api/telegram/*` | Yes |
| telegramApp.js | `/api/telegram-app/*` | Yes |
| telegramBots.js | `/api/telegram-bots/*` | Yes |
| audit.js | `/api/audit/*` | Yes |
| claudeTerminal.js | `/api/terminal/*` | Yes |
| spaces.js | `/api/spaces/*` | Yes |
| models.js | `/api/models/*` | Yes |
| appstore.js | `/api/apps/*` | Yes |
| database.js | `/api/database/*` | Yes |
| logs.js | `/api/logs/*` | Yes |
| system.js | `/api/system/*` | Yes |
| embeddings.js | `/api/embeddings/*` | Yes |
| selfhealing.js | `/api/selfhealing/*` | Yes |
| update.js | `/api/update/*` | Yes |
| workflows.js | `/api/workflows/*` | Yes |
| workspaces.js | `/api/workspaces/*` | Yes |
| externalApi.js | `/api/external-api/*` | Yes |
| store.js | `/api/store/*` | Yes |
| datentabellen/tables.js | `/api/datentabellen/tables/*` | Yes |
| datentabellen/rows.js | `/api/datentabellen/rows/*` | Yes |
| datentabellen/quotes.js | `/api/datentabellen/quotes/*` | Yes |

## Error Handling (MANDATORY PATTERN)

### Rules
- **ALWAYS**: Use `asyncHandler()` wrapper for all route handlers
- **ALWAYS**: Use `throw new ValidationError(...)` for 400 errors
- **ALWAYS**: Use `throw new NotFoundError(...)` for 404 errors
- **ALWAYS**: Use custom error classes from `utils/errors.js`
- **NEVER**: Use try-catch at route handler level (only in service layer)
- **NEVER**: Use `res.status(4xx).json(...)` for errors in route handlers

### Required Imports
```javascript
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError, ServiceUnavailableError } = require('../utils/errors');
```

### Route Pattern
```javascript
const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Protected endpoint
router.get('/', auth, asyncHandler(async (req, res) => {
  const result = await db.query('SELECT * FROM table');
  res.json({ success: true, data: result.rows });
}));

// Validation example
router.post('/', auth, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) {
    throw new ValidationError('Name is required');
  }
  const result = await db.query('INSERT INTO table (name) VALUES ($1) RETURNING *', [name]);
  res.status(201).json({ success: true, data: result.rows[0] });
}));

module.exports = router;
```

### Error Classes (utils/errors.js)
| Class | Status | Use For |
|-------|--------|---------|
| ValidationError | 400 | Bad input, missing fields |
| UnauthorizedError | 401 | Auth required |
| ForbiddenError | 403 | Not authorized |
| NotFoundError | 404 | Resource not found |
| ConflictError | 409 | Duplicate entry |
| RateLimitError | 429 | Rate limit exceeded |
| ServiceUnavailableError | 503 | External service down |

### When to keep inner try-catch
- JSON.parse of untrusted input
- External API calls (fetch/axios) that need specific error mapping
- File system operations
- Database operations that need rollback logic

## Middleware

| File | Purpose | Usage |
|------|---------|-------|
| auth.js | JWT validation | `require('../middleware/auth')` |
| audit.js | Request logging | Auto-applied |
| rateLimit.js | Per-user limits | Manual |
| errorHandler.js | asyncHandler + global error handler | Required |

## Database Connection
```javascript
const db = require('../database');
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

## SSE Streaming Pattern (llm.js)
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Send data
res.write(`data: ${JSON.stringify(chunk)}\n\n`);

// End stream
res.write('data: [DONE]\n\n');
res.end();
```

## Testing
```bash
# Run backend tests only
./scripts/run-tests.sh --backend

# Or directly
cd services/dashboard-backend && npm test
```

## Environment Variables
- `PORT`: Backend port (default: 3001)
- `DATABASE_URL`: PostgreSQL connection
- `JWT_SECRET`: Token signing key
- `OLLAMA_HOST`: LLM service URL
- `QDRANT_HOST`: Vector DB URL

## Reference Files
- Error handling: `middleware/errorHandler.js` + `utils/errors.js`
- Simple CRUD: `routes/settings.js`
- SSE Streaming: `routes/llm.js`
- File Upload: `routes/documents.js`
- WebSocket: `services/metricsStream.js`
