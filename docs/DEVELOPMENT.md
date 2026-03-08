# Development Guide

Development workflows, patterns, API usage, and debugging for the Arasul Platform.

---

## 1. Workflow Rules

### After Every Significant Implementation

1. **Test** - `./scripts/test/run-tests.sh --backend`
2. **Lint** - `npm run lint:fix`
3. **Document** - Update relevant docs if behavior changed
4. **Commit** - Atomic commits with clear messages

### Documentation Protocol

| Change Type         | Update These Files                               |
| ------------------- | ------------------------------------------------ |
| New API endpoint    | `docs/API_REFERENCE.md`                          |
| Database schema     | `docs/DATABASE_SCHEMA.md`, add migration         |
| New env variable    | `docs/ENVIRONMENT_VARIABLES.md`, `.env.template` |
| Architecture change | `docs/ARCHITECTURE.md`                           |
| Bug fix             | `BUGS_AND_FIXES.md`                              |
| Frontend component  | Follow `docs/DESIGN_SYSTEM.md`                   |

---

## 2. Backend Patterns

### Route Handler Pattern

**Always** use `asyncHandler` for all async route handlers:

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

// CORRECT
router.get(
  '/endpoint',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await service.getData();
    res.json({ data: result, timestamp: new Date().toISOString() });
  })
);

// WRONG - No manual try-catch at route level
router.get('/endpoint', requireAuth, async (req, res) => {
  try {
    /* ... */
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Error Classes

```javascript
const {
  ValidationError, // 400 - Invalid input
  NotFoundError, // 404 - Resource not found
  ForbiddenError, // 403 - Access denied
  RateLimitError, // 429 - Too many requests
  ServiceUnavailableError, // 503 - Service down
} = require('../utils/errors');

// Usage
if (!req.body.name) throw new ValidationError('Name ist erforderlich');
if (!resource) throw new NotFoundError('Ressource nicht gefunden');
```

### Middleware Order

```javascript
router.post(
  '/endpoint',
  requireAuth, // 1. Authentication
  apiLimiter, // 2. Rate Limiting (if needed)
  asyncHandler(async (req, res) => {
    // 3. Handler
  })
);
```

### Response Format

Always include `timestamp`:

```javascript
// Single resource
res.json({ data: resource, timestamp: new Date().toISOString() });

// List
res.json({ data: items, total: items.length, timestamp: new Date().toISOString() });

// Action result
res.json({ success: true, message: 'Done', timestamp: new Date().toISOString() });
```

### Status Codes

| Code | Usage                              |
| ---- | ---------------------------------- |
| 200  | Successful GET/PUT/DELETE          |
| 201  | Successful POST (resource created) |
| 400  | ValidationError                    |
| 401  | Not authenticated                  |
| 403  | ForbiddenError                     |
| 404  | NotFoundError                      |
| 429  | RateLimitError                     |
| 500  | Unexpected error                   |
| 503  | ServiceUnavailableError            |

### Database Queries

```javascript
// CORRECT - Parameterized
const result = await db.query('SELECT * FROM users WHERE id = $1 AND status = $2', [
  userId,
  'active',
]);

// WRONG - String interpolation (SQL Injection!)
const result = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### Logging

```javascript
// CORRECT - With context object
logger.info('Service restart initiated', {
  service: serviceName,
  userId: req.user?.id,
});

// WRONG - String-only
logger.info(`User ${userId} restarted ${serviceName}`);
```

### External Service Calls

```javascript
// Always set timeouts
const response = await axios.get(url, { timeout: 5000 });
```

### New Route Checklist

- [ ] `asyncHandler` used
- [ ] Inputs validated (whitelist when possible)
- [ ] Parameterized SQL queries
- [ ] Custom error classes used
- [ ] Timeouts for external calls
- [ ] `timestamp` in all responses
- [ ] Logging with context object
- [ ] Tests written

---

## 3. Frontend Patterns

### useApi Hook

All REST calls use the `useApi()` hook from `hooks/useApi.ts`:

```javascript
const { api } = useApi();

// GET
const data = await api.get('/endpoint');

// POST
const result = await api.post('/endpoint', { name: 'value' });

// DELETE
await api.del('/endpoint/123');

// Options
api.get('/endpoint', { showError: false }); // Custom error handling
api.get('/endpoint', { signal }); // AbortController
api.get('/endpoint', { raw: true }); // Raw Response (for blobs, SSE)
```

### Design System

- Primary: `var(--primary-color)` (#45ADFF)
- Background: `var(--bg-dark)` (#101923) / `var(--bg-card)` (#1A2330)
- Never use hardcoded hex in JSX - always use CSS variables
- Full reference: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

### Component Structure

Components are organized in `src/features/` with barrel exports:

```
src/features/chat/index.ts       → ChatRouter, ChatLanding, ChatView
src/features/documents/index.ts  → DocumentManager, SpaceModal
src/features/settings/index.ts   → Settings, GeneralSettings
```

Shared UI: `src/components/ui/` (Modal, Skeleton, LoadingSpinner, etc.)

### Notifications & Dialogs

```javascript
const { showToast } = useToast(); // Toast notifications
const { confirm } = useConfirm(); // Confirmation dialogs (not window.confirm)
```

---

## 4. API Usage Guide

### Base URL

All endpoints are prefixed with `/api`:

```
http://arasul.local/api
```

Interactive docs: `http://arasul.local/api/docs`

### Authentication

```bash
# Login
curl -X POST http://arasul.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'

# Response: { "token": "eyJ...", "expires_in": 86400 }

# Use token
curl -H "Authorization: Bearer <token>" http://arasul.local/api/system/status
```

Token validity: 24 hours.

### WebSocket Streaming

```javascript
// Real-time metrics (5s interval)
const ws = new WebSocket(`ws://arasul.local/api/metrics/live-stream?token=${token}`);
ws.onmessage = event => {
  const metrics = JSON.parse(event.data);
  // { cpu, ram, gpu, temperature, disk, timestamp }
};
```

### Common Workflows

**Monitor system health:**

```bash
curl -H "Authorization: Bearer <token>" http://arasul.local/api/metrics/live
curl -H "Authorization: Bearer <token>" http://arasul.local/api/services/status
```

**Self-healing events:**

```bash
curl -H "Authorization: Bearer <token>" "http://arasul.local/api/self-healing/events?limit=10"
```

**System logs (SSE):**

```bash
curl -H "Authorization: Bearer <token>" -H "Accept: text/event-stream" \
  "http://arasul.local/api/logs/stream?log_type=system"
```

---

## 5. API Quick Reference

### Authentication

| Method | Path               | Auth | Description    |
| ------ | ------------------ | ---- | -------------- |
| POST   | `/api/auth/login`  | No   | Login, get JWT |
| POST   | `/api/auth/logout` | Yes  | Logout         |
| GET    | `/api/auth/me`     | Yes  | Current user   |

### AI Chat

| Method | Path             | Auth | Description         |
| ------ | ---------------- | ---- | ------------------- |
| POST   | `/api/llm/chat`  | Yes  | LLM inference (SSE) |
| POST   | `/api/rag/query` | Yes  | RAG query (SSE)     |
| GET    | `/api/chats`     | Yes  | List conversations  |
| POST   | `/api/chats`     | Yes  | Create conversation |
| GET    | `/api/llm/queue` | Yes  | Queue status        |

### Documents

| Method | Path                    | Auth | Description        |
| ------ | ----------------------- | ---- | ------------------ |
| POST   | `/api/documents/upload` | Yes  | Upload (multipart) |
| GET    | `/api/documents`        | Yes  | List all           |
| DELETE | `/api/documents/:id`    | Yes  | Delete             |

### System & Monitoring

| Method | Path                       | Auth | Description      |
| ------ | -------------------------- | ---- | ---------------- |
| GET    | `/api/health`              | No   | Health check     |
| GET    | `/api/metrics/live`        | Yes  | Current metrics  |
| WS     | `/api/metrics/live-stream` | Yes  | Real-time (5s)   |
| GET    | `/api/services/status`     | Yes  | Container status |
| POST   | `/api/services/restart`    | Yes  | Restart service  |

Full reference: [API_REFERENCE.md](API_REFERENCE.md)

---

## 6. Debugging Cheatsheet

### Service Won't Start

```bash
docker compose ps                                  # Check status
docker compose logs <service>                      # Check logs
./scripts/validate/validate_dependencies.sh        # Check deps
docker stats                                       # Check resources
```

### Database Issues

```bash
docker exec postgres-db pg_isready -U arasul
docker exec -it postgres-db psql -U arasul -d arasul_db
# Check connections:
SELECT count(*) FROM pg_stat_activity;
```

### LLM Not Responding

```bash
docker compose logs llm-service
docker exec llm-service curl http://localhost:11434/api/tags
# Model loads on first request - wait up to 300s
```

### GPU Issues

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
# Ensure runtime: nvidia in docker-compose.yml
```

### RAG Not Working

```bash
curl http://localhost:6333/collections/documents  # Check Qdrant
docker compose logs document-indexer              # Check indexer
docker compose logs embedding-service             # Check embeddings
```

### Traefik Routing Issues

```bash
curl -v http://localhost/api/health
docker compose logs reverse-proxy | tail -50
# Config: config/traefik/dynamic/routes.yml
```

### Known Issues

See [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md).

---

## 7. Common Development Tasks

### Add New API Endpoint

1. Create route in `apps/dashboard-backend/src/routes/`
2. Register in `src/routes/index.js` (central router)
3. Add auth middleware if needed
4. Update `docs/API_REFERENCE.md`
5. Write tests in `__tests__/`

### Add Database Migration

1. Create `services/postgres/init/042_name.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Update `docs/DATABASE_SCHEMA.md`
4. Rebuild: `docker compose up -d --build postgres-db`

### Add Frontend Component

1. Create in appropriate `apps/dashboard-frontend/src/features/` directory
2. Export from barrel file (`index.js`)
3. Add route in `App.js` if needed
4. Follow [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) guidelines

---

## 8. Feature-Erweiterbarkeit (Multi-Device)

Die Skalierungsarchitektur stellt sicher, dass neue Features automatisch auf allen Geraeten landen:

- **Neuer Docker-Service**: In `compose/*.yaml` hinzufuegen. Wird automatisch gebaut/gepullt bei `docker compose up -d`.
- **Neue DB-Migration**: SQL-Datei in `services/postgres/init/` ablegen. Wird beim naechsten frischen Setup angewendet. Fuer bestehende Geraete: Migration manuell oder via Update-Paket.
- **Neue env-Variable**: In `.env.example` dokumentieren. In `preconfigure.sh` Default setzen. In der relevanten Compose-Datei referenzieren.
- **Neues Frontend-Feature**: Normaler Build-Prozess. `docker compose up -d --build dashboard-frontend` aktualisiert.
- **Pfad-Referenzen**: Immer `process.env.COMPOSE_PROJECT_DIR || '/opt/arasul'` verwenden. Nie `/home/arasul/...` hardcoden.

Kein separater "Skalierungscode" noetig. `git pull && docker compose up -d --build` beinhaltet alle Aenderungen.

---

## Related Documentation

- [API_REFERENCE.md](API_REFERENCE.md) - Full endpoint reference
- [API_ERRORS.md](API_ERRORS.md) - Error codes & handling
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) - Frontend design guidelines
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database tables
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
