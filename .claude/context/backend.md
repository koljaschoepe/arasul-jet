# Backend Context - Node.js/Express API

## Entry Points
- **Main App**: `services/dashboard-backend/src/index.js`
- **Server**: `services/dashboard-backend/src/server.js`
- **Routes**: `services/dashboard-backend/src/routes/` (24 files)
- **Services**: `services/dashboard-backend/src/services/` (13 files)
- **Middleware**: `services/dashboard-backend/src/middleware/`
- **Tests**: `services/dashboard-backend/__tests__/`

## Route Files (24)

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

## Route Pattern
```javascript
const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../database');

// Protected endpoint
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM table');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

## Middleware

| File | Purpose | Usage |
|------|---------|-------|
| auth.js | JWT validation | `require('../middleware/auth')` |
| audit.js | Request logging | Auto-applied |
| rateLimit.js | Per-user limits | Manual |

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
- Simple CRUD: `routes/auth.js`
- SSE Streaming: `routes/llm.js`
- File Upload: `routes/documents.js`
- WebSocket: `services/metricsStream.js`
