# CLAUDE.md — Dashboard Backend

> Express API for the Arasul Platform. This file is the contract an AI agent
> follows when writing code under `apps/dashboard-backend/`. For the API
> surface and feature inventory, read `README.md` in this folder.

## Stack

Node.js 22 (LTS, see root `.nvmrc`) · Express 4 · PostgreSQL 16 (`pg` pool) ·
WebSocket (`ws`) · SSE · Zod (validation) · Jest (tests) · ESLint.

Entry: `src/index.js` → `src/server.js` → `src/routes/index.js`.

## Folder convention

```
src/
  routes/        HTTP layer — thin. Validate, authorize, delegate. No business logic.
    <domain>/    Sub-router per domain (telegram/, system/, ai/, store/, ...).
  services/      Business logic. Routes call services; services call db/external.
    <domain>/    One folder per domain that has multiple cooperating modules.
  middleware/    Cross-cutting: auth, csrf, rateLimit, validate, errorHandler, audit.
  schemas/       Zod schemas — one file per route domain (auth.js, chats.js, ...).
  utils/         Stateless helpers: errors, logger, jwt, password, retry, ...
  config/        Static config (no runtime state).
  tools/         Standalone scripts (run via `node src/tools/<name>.js`).
  database.js    Main pg.Pool. Use `db.query(...)` — never instantiate your own pool.
  dataDatabase.js Separate pool for the user-data DB (datentabellen feature).
```

## Non-negotiable patterns

### 1. Routes use `asyncHandler` + thrown custom errors — never try/catch

```javascript
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { NotFoundError } = require('../utils/errors');
const { CreateFooBody } = require('../schemas/foo');

router.post(
  '/foo',
  requireAuth,
  validateBody(CreateFooBody),
  asyncHandler(async (req, res) => {
    const foo = await fooService.create(req.user.id, req.body);
    if (!foo) throw new NotFoundError('Foo not created');
    res.status(201).json({ data: foo });
  })
);
```

The global error handler (`middleware/errorHandler.js`) serializes every
thrown `ApiError` into the canonical envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} },
  "timestamp": "2026-..." }
```

It also maps `ECONNREFUSED → 503/SERVICE_UNAVAILABLE`, PG `23505 → 409/CONFLICT`,
PG `23503 → 400/VALIDATION_ERROR`. **Don't replicate this logic in routes.**

### 2. Available error classes (`utils/errors.js`)

`ApiError` (base) · `ValidationError` (400) · `UnauthorizedError` (401) ·
`ForbiddenError` (403) · `NotFoundError` (404) · `ConflictError` (409) ·
`RateLimitError` (429) · `ServiceUnavailableError` (503).

Each carries a stable `code` for clients to dispatch on. Add new subclasses
here — don't `throw new Error(...)` from routes.

### 3. Validate every body/query/params with Zod

```javascript
const { validateBody, validateQuery, validateParams } = require('../middleware/validate');
router.get('/items', validateQuery(ListItemsQuery), asyncHandler(...));
```

Schemas live in `src/schemas/<domain>.js` and use Zod's `.coerce`/`.default`
liberally — the parsed result replaces `req.body|query|params` so handlers
get typed, trimmed, defaulted data.

### 4. Pick the right rate limiter

`middleware/rateLimit.js` exports ready-made limiters; use them, don't roll your own:

| Limiter                          | Use for                                   | Window / max |
| -------------------------------- | ----------------------------------------- | ------------ |
| `loginLimiter`                   | `/auth/login`                             | 15 min / 10  |
| `generalAuthLimiter`             | other `/auth/*` (logout, change-password) | 15 min / 30  |
| `apiLimiter`                     | default, per-IP                           | 1 min / 100  |
| `llmLimiter`                     | `/llm/*`, `/rag/*` (expensive)            | 1 sec / 10   |
| `metricsLimiter`                 | high-frequency polling endpoints          | 1 sec / 20   |
| `webhookLimiter`                 | inbound webhooks (telegram, n8n, ...)     | 1 min / 100  |
| `uploadLimiter`                  | multipart uploads                         | 1 min / 20   |
| `tailscaleLimiter`               | tailscale orchestration                   | (per-domain) |
| `createUserRateLimiter(max, ms)` | user-scoped (after auth)                  | factory      |

Disable in tests via `RATE_LIMIT_ENABLED=false`.

### 5. Auth & CSRF

`requireAuth` (middleware/auth.js) populates `req.user`. State-changing
methods (POST/PUT/PATCH/DELETE) require a CSRF token — `useApi` handles
this automatically on the client. `apiKeyAuth.js` is for `/api/external/*`.

### 6. Mount new route groups in `routes/index.js`

Add the prefix to `API_ROUTE_GROUPS` so it surfaces in `GET /api/_meta`.
Group choice (`core | telegram | system | admin | ai | store | external`)
is documented at the top of `routes/index.js`.

### 7. SSE / WebSocket

For SSE use `utils/sseHelper.js`. For LLM streaming, the global error handler
is a no-op once headers are sent — flush an error frame yourself before
closing. WebSocket auth: token comes from the `?token=` query param (post
Phase 5 hardening); the cookie is unreliable for WS upgrades.

### 8. Logging

`utils/logger.js` (rotating Winston). Use `logger.info|warn|error`. Never
`console.log` outside of `src/tools/`. `logger.error(msg, { ...context })`
is preferred so `errorHandler` keeps structured fields.

## Forbidden

- ❌ `try/catch` at route level (use `asyncHandler` + thrown errors).
- ❌ `throw new Error('...')` in routes/services (use a class from `utils/errors`).
- ❌ Hand-rolled `pool = new Pool(...)` (use `require('./database')`).
- ❌ `console.log` in shipping code (use `logger`).
- ❌ Direct `process.env.SECRET` reads in business logic — `utils/resolveSecrets`
  hydrates from Docker secrets at boot; read once, pass via config.
- ❌ Returning bare strings or arrays at the top level — wrap in `{ data, ... }`
  so response shape is uniform.

## Testing

```bash
cd apps/dashboard-backend && npm test                  # full suite (Jest)
npm run test:unit                                       # __tests__/unit/
npm run test:integration                                # __tests__/integration/
```

Helpers: `__tests__/testHelpers.js`, `__mocks__/` for `pg`, `dockerode`, etc.
Set `RATE_LIMIT_ENABLED=false` in tests; `jest.setup.js` does this and silences
logger.

## When you change something

| You changed…              | Also update                                  |
| ------------------------- | -------------------------------------------- |
| A route or response shape | `docs/api/API_REFERENCE.md`                  |
| An error code             | `docs/api/API_ERRORS.md` + `utils/errors.js` |
| A Zod schema              | `openapi.yaml` (if exposed)                  |
| An env var                | `docs/ENVIRONMENT_VARIABLES.md`              |
| A migration               | See `services/postgres/CLAUDE.md`            |

## Deploy

```bash
docker compose up -d --build dashboard-backend
docker compose logs -f dashboard-backend
```

There is **no local dev server** — the user tests in the browser after a
container rebuild. Iterating without rebuild is a footgun.
