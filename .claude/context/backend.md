# Backend Context — Node.js/Express API

## Entry Points

- **Main App**: `apps/dashboard-backend/src/index.js` (bootstrap, middleware, WebSocket)
- **Central Router**: `apps/dashboard-backend/src/routes/index.js` (all route registration)
- **Services**: `apps/dashboard-backend/src/services/` (business logic by domain)
- **Middleware**: `apps/dashboard-backend/src/middleware/`
- **Tests**: `apps/dashboard-backend/__tests__/`

## Route Registration

Routes are registered in `src/routes/index.js`, NOT in `src/index.js`:

```javascript
// src/routes/index.js
const exampleRoutes = require('./example');
router.use('/example', requireAuth, exampleRoutes);
```

## Route Files

| File                    | Endpoints                 | Auth    |
| ----------------------- | ------------------------- | ------- |
| auth.js                 | `/api/auth/*`             | Mixed   |
| llm.js                  | `/api/llm/*`              | Yes     |
| rag.js                  | `/api/rag/*`              | Yes     |
| chats.js                | `/api/chats/*`            | Yes     |
| documents.js            | `/api/documents/*`        | Yes     |
| ai/models.js            | `/api/models/*`           | Yes     |
| system/system.js        | `/api/system/*`           | Yes     |
| system/services.js      | `/api/services/*`         | Yes     |
| system/metrics.js       | `/api/metrics/*`          | Yes     |
| system/logs.js          | `/api/logs/*`             | Yes     |
| system/database.js      | `/api/database/*`         | Yes     |
| system/tailscale.js     | `/api/tailscale/*`        | Yes     |
| admin/settings.js       | `/api/settings/*`         | Yes     |
| admin/update.js         | `/api/update/*`           | Yes     |
| store/store.js          | `/api/store/*`            | Yes     |
| store/appstore.js       | `/api/apps/*`             | Yes     |
| telegram/telegram.js    | `/api/telegram/*`         | Yes     |
| telegram/telegramApp.js | `/api/telegram-app/*`     | Yes     |
| telegram/bots.js        | `/api/telegram-bots/*`    | Yes     |
| datentabellen/tables.js | `/api/v1/datentabellen/*` | Yes     |
| documents.js (spaces)   | `/api/spaces/*`           | Yes     |
| knowledgeGraph.js       | `/api/knowledge-graph/*`  | Yes     |
| projects.js             | `/api/projects/*`         | Yes     |
| alerts.js               | `/api/alerts/*`           | Yes     |
| audit.js                | `/api/audit/*`            | Yes     |
| selfhealing.js          | `/api/self-healing/*`     | Yes     |
| events.js               | `/api/events/*`           | Yes     |
| workflows.js            | `/api/workflows/*`        | Yes     |
| workspaces.js           | `/api/workspaces/*`       | Yes     |
| externalApi.js          | `/api/v1/external/*`      | API Key |
| claudeTerminal.js       | `/api/claude-terminal/*`  | Yes     |

## Error Handling (MANDATORY)

```javascript
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body.name) throw new ValidationError('Name ist erforderlich');
    // ... Logik
    res.status(201).json({ data: result });
  })
);
```

| Error Class             | Status | Use For                   |
| ----------------------- | ------ | ------------------------- |
| ValidationError         | 400    | Bad input, missing fields |
| UnauthorizedError       | 401    | Auth required             |
| ForbiddenError          | 403    | Not authorized            |
| NotFoundError           | 404    | Resource not found        |
| ConflictError           | 409    | Duplicate entry           |
| RateLimitError          | 429    | Rate limit exceeded       |
| ServiceUnavailableError | 503    | External service down     |

**Rules:**

- ALWAYS: `asyncHandler()` wrapper, Custom Errors aus `utils/errors.js`
- NEVER: try-catch auf Route-Level, `res.status(4xx).json()` für Errors

## Auth Middleware

```javascript
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requireApiKey } = require('../middleware/apiKeyAuth');

router.get('/', requireAuth, ...);          // JWT required
router.get('/public', optionalAuth, ...);   // JWT optional, user attached if valid
router.post('/webhook', requireApiKey, ...); // API key (X-API-Key header)
```

- JWT: HS256, 4h Expiry, cached 60s to reduce DB hits
- API Key Format: `aras_<32-char-hex>`
- Forward Auth: `/api/auth/verify` für Traefik (returns X-User-Id, X-User-Name headers)

## Middleware Chain (in order)

1. Helmet (security headers, CSP for local network)
2. CORS (RFC 1918 private networks + .local mDNS)
3. Cookie parser + JSON body (10MB limit)
4. Request logging (non-production)
5. Audit logging (masks sensitive fields)
6. CSRF protection (double-submit cookie, skipped for safe methods + API keys)
7. Routes at `/api`

## Services Organization

```
src/services/
├── llm/                    # LLM queue, job processor, model management, Ollama readiness
├── rag/                    # RAG pipeline (ragCore.js — hybrid search + reranking)
├── context/                # Context injection, budget management, query optimization
├── memory/                 # Chat memory, compaction service
├── telegram/               # Bot orchestration, polling, webhooks, voice, notifications
├── core/                   # Cache, Docker, event listener
├── auth/                   # Password service
└── app/                    # App store service
```

## Key Architecture Patterns

### LLM Queue (Single-Stream)

- Only ONE LLM stream at a time (GPU memory protection)
- Jobs queued in FIFO order with priority support
- Client subscribes for streaming updates
- Tab-switch resilient (job continues in background)

### SSE Streaming

```javascript
const { createSSEHelper } = require('../utils/sseHelper');
const sse = createSSEHelper(res);
sse.send({ token: 'hello' });
sse.done();
```

### WebSocket

- Metrics live-stream: `/api/metrics/live-stream` (authenticated)
- Telegram setup: `/api/telegram-app/ws`
- Both use noServer mode, routed via `server.on('upgrade')`

### Inter-Service Communication

- LLM: `http://llm-service:11434` (inference) + `:11436` (management)
- Embeddings: `http://embedding-service:11435`
- Qdrant: `http://qdrant:6333`
- MinIO: `http://minio:9000`
- Docker: `tcp://docker-proxy:2375`
- Config: `src/config/services.js` (centralized timeouts)

### Database

```javascript
const db = require('../database');
const result = await db.query('SELECT * FROM table WHERE id = $1', [id]);
```

- Pool: min 2, max 20 connections
- Statement timeout: 30s
- Leak detection: warns if connection held >60s

## Testing

```bash
./scripts/test/run-tests.sh --backend     # Full suite
cd apps/dashboard-backend && npm test      # Direct
npm run test:unit                          # Unit only
npm run test:integration                   # Integration only
```

- Framework: Jest 29.7 + supertest
- Mocks: `__tests__/testHelpers.js` (createMockDatabase, createMockResponse, etc.)
- Auth mocks: `__tests__/helpers/authMock.js` (setupAuthMocks, generateTestToken)
- Coverage thresholds: Lines 30%, Functions 30%, Branches 20%

## Reference Files

| Pattern         | Example File                                     |
| --------------- | ------------------------------------------------ |
| Simple CRUD     | `routes/admin/settings.js`                       |
| SSE Streaming   | `routes/llm.js`                                  |
| File Upload     | `routes/documents.js`                            |
| WebSocket       | `src/index.js` (upgrade handling)                |
| Queue-based Job | `services/llm/llmQueueService.js`                |
| Error handling  | `middleware/errorHandler.js` + `utils/errors.js` |
| Auth patterns   | `middleware/auth.js`                             |
