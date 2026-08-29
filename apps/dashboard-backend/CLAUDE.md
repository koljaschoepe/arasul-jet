# CLAUDE.md — Dashboard Backend

> Express API for the Arasul Platform. This file is the contract an AI agent
> follows when writing code under `apps/dashboard-backend/`. For the API
> surface and feature inventory, read `README.md` in this folder.

> **Woran gerade gearbeitet wird:** steht nicht in diesem Repo. Seit dem
> 26.08.2026 steuert der Überordner-Plan die Arbeit, und die laufende Phase
> liegt als `PHASE.md` im Wurzelverzeichnis des Worktrees (nie committet).
> Was war, steht in [`docs/plans/HISTORIE.md`](../../docs/plans/HISTORIE.md).

## Stack

Node.js 22 (LTS, see root `.nvmrc`) · Express 4 · PostgreSQL 16 (`pg` pool) ·
WebSocket (`ws`) · SSE · Zod (validation) · Jest (tests) · ESLint.

Entry: `src/index.js` → `src/server.js` → `src/routes/index.js`.

## Folder convention

```
src/
  routes/        HTTP layer — thin. Validate, authorize, delegate. No business logic.
    <domain>/    Sub-router per domain (system/, admin/, ai/, store/, external/).
  services/      Business logic. Routes call services; services call db/external.
    <domain>/    One folder per domain that has multiple cooperating modules.
  middleware/    Cross-cutting: auth, csrf, rateLimit, validate, errorHandler, audit.
  schemas/       Zod schemas — one file per route domain (auth.js, flows.js, ...).
  utils/         Stateless helpers: errors, logger, jwt, password, retry, ...
  config/        Static config (no runtime state).
  tools/         Nur noch `baseTool.js`, die Basisklasse der Flow-Werkzeuge.
  database.js    Main pg.Pool. Use `db.query(...)` — never instantiate your own pool.
```

The box runs **exactly one** Postgres database (`arasul_db`). The former
second database (`arasul_data_db` / `dataDatabase.js`) was removed with the
Datentabellen feature (Plan 008).

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

| Limiter                          | Use for                                         | Window / max |
| -------------------------------- | ----------------------------------------------- | ------------ |
| `loginLimiter`                   | `/auth/login` (failures only)                   | 15 min / 30  |
| `probeLimiter`                   | `/auth/session`, `/auth/needs-setup`            | 1 min / 120  |
| `generalAuthLimiter`             | `/auth/logout`                                  | 1 min / 30   |
| `apiLimiter`                     | default, per-IP                                 | 1 min / 100  |
| `llmLimiter`                     | `/llm/*`, `/embeddings`, `/flows/*` (expensive) | 1 sec / 10   |
| `metricsLimiter`                 | high-frequency polling endpoints                | 1 sec / 20   |
| `webhookLimiter`                 | inbound webhooks (self-healing agent)           | 1 min / 100  |
| `uploadLimiter`                  | multipart uploads                               | 1 min / 20   |
| `tailscaleLimiter`               | tailscale orchestration                         | (per-domain) |
| `createUserRateLimiter(max, ms)` | user-scoped (after auth)                        | factory      |

`loginLimiter` carries `skipSuccessfulRequests`: a login that succeeds costs
nothing. The sharp lock is per account — five failed attempts lock it for
15 minutes (`record_login_attempt`, `002_auth_schema.sql`). Behind Traefik
every request shares one IP, so a per-IP counter that also counted successes
locked out an office, not an attacker.

Disable in tests via `RATE_LIMIT_ENABLED=false`.

### 5. Auth & CSRF

`requireAuth` (middleware/auth.js) populates `req.user`. State-changing
methods (POST/PUT/PATCH/DELETE) require a CSRF token — `useApi` handles
this automatically on the client. `apiKeyAuth.js` is for `/api/external/*`.

### 6. Mount new route groups in `routes/index.js`

Add the prefix to `API_ROUTE_GROUPS` so it surfaces in `GET /api/_meta`.
Group choice (`core | system | admin | ai | store | external`)
is documented at the top of `routes/index.js`.

### 7. SSE / WebSocket

For SSE use `utils/sseHelper.js`. For LLM streaming, the global error handler
is a no-op once headers are sent — flush an error frame yourself before
closing. WebSocket auth: token comes from the `?token=` query param (post
Phase 5 hardening); the cookie is unreliable for WS upgrades.

### 8. Logging

`utils/logger.js` (rotating Winston). Use `logger.info|warn|error`. Never
`console.log` im Backend. `logger.error(msg, { ...context })`
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

## Werkzeug-Schleife (Plan 008 / 011)

Der Agenten- und Fluss-Layer ist mit Plan 011 entfernt; an seine Stelle treten
**Flows** (Markdown-Dateien unter `data/flows/`, gestartet über
`POST /api/flows/laeufe` oder extern per API-Schlüssel). Der Flow-Layer lebt vollständig in `services/flows/` und bringt
seine eigenen Bausteine mit (keine Abhängigkeit mehr auf `services/agents/`):

- `runFlow.js` — der Runner (Schritt 10): lädt den Flow, setzt Argumente ein,
  stellt die Werkzeuge zusammen, baut den Kontext (die im Flow deklarierten
  erlaubten Ordner der Datei-Werkzeuge) und treibt die Schleife; schreibt Lauf
  und Schritte über `runStore.js` (Schritt 9) mit.
- `toolLoop.js` — die Ollama-Function-Calling-Schleife. Grenzen kommen PRO
  Flow (`grenzen.werkzeug_runden` / `zeitlimit_s`), nicht aus einer
  Umgebungsvariablen. Per-Aufruf-Timeout: `FLOW_LLM_TIMEOUT_MS`.
- `stepExecutor.js` — der deterministische Schritt-Executor (B7): führt eine
  deklarierte `schritte`-Kette in fester Reihenfolge aus (subagent-Rollen /
  direkte Werkzeuge, mit Iteration), threadet die Ausgaben und lässt danach den
  Rumpf-Prompt synthetisieren. `runFlow` verzweigt hierher, wenn ein Flow
  `schritte` deklariert — sonst bleibt es beim modellgetriebenen `toolLoop`.
- Flows werden über `POST /api/flows/laeufe` (Anmeldung) oder extern per
  HTTP-Trigger (`POST /api/v1/external/flows/:name/run`, API-Key mit Scope
  `flow:run`) gestartet. Einen Zeitplaner gibt es im Gerät nicht; Cron kommt
  von außen über den Trigger.
- `gpuQueue.js` — die **eine** GPU-Sperre für alles, was in DIESEM Prozess
  läuft: der Ollama-Aufruf in `services/llm/llmOllamaStream.js`
  (`streamFromOllama`) geht durch dieselbe `withGpuLock`. Nie treffen ein
  Auftrag der externen API und ein Flow zugleich auf die GPU
  (Nutzer-Entscheidung: strikt einer nach dem anderen, keine Priorisierung).
- `pathSafe.js` — symlink-sichere Pfad-Sperre über mehrere erlaubte Ordner;
  schließt das TOCTOU-Fenster über Dateideskriptoren. **Jeder** Dateizugriff
  läuft hierdurch.
- `flowFile.js` — Parser/Serializer für Markdown + YAML-Frontmatter, plus
  Platzhalter (`{{argument}}`).
- `toolRegistry.js` — setzt die Werkzeug-Freigabe durch; `tools/` enthält
  `dateien` (lesen/schreiben/bearbeiten/anhängen getrennt, plus `dateien_suchen`),
  `symbol_suche` und `frage` (`frage_nutzer`, nur in der Betriebsart
  `rueckfragen`). `subagent.js` liegt eine Ebene höher. Es gibt keine
  Web-Werkzeuge; ein Flow arbeitet auf dem Gerät.

Ordner sind genau die im Flow deklarierten (`ordner`-Feld); es gibt keinen
Arbeitsbereich, kein Projekt und keinen Wissensraum daneben. Aufträge an das
Sprachmodell (`llm_jobs`) sind zustandslos und tragen `user_id`;
`llmQueueService.enqueue(userId, ...)` ist der einzige Weg zu einem Auftrag,
aufgerufen von `routes/external/externalApi.js` und `openaiCompat.js`. Die
Oberfläche hat keinen Chat.

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

**Lockfile:** root-only (see root `CLAUDE.md` rule 7). There is no
`apps/dashboard-backend/package-lock.json`. The Dockerfile installs from the
single root lock via `npm ci --workspace=arasul-dashboard-backend --include-workspace-root`.
To add/upgrade a dependency, edit this `package.json` then run
`npm install` from the **repo root** so the root lock regenerates.
