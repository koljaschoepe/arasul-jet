# Observability — Context

> How the platform sees itself. Read this before adding a `console.log`,
> a `try/catch`, or a new external service call.

## Logger (`apps/dashboard-backend/src/utils/logger.js`)

Winston, structured JSON, Console transport (Docker collects):

```javascript
const logger = require('../utils/logger');

logger.info('Job enqueued', { jobId, model, userId });
logger.warn('Slow query', { sql, durationMs });
logger.error('Ollama generation failed', { error: err.message, jobId });
```

Rules:

- **Never `console.log` in shipping code.** `src/tools/*.js` is the only
  exception (CLI scripts).
- **Pass a context object** as the second arg, not a stringified blob —
  the JSON formatter promotes it to top-level fields.
- **Don't include user content** (prompts, chat messages, document text).
  See `commercial.md` for the data-minimization rule.
- **Levels**: `error` = page someone, `warn` = investigate later,
  `info` = normal operation, `debug` = development. Levels are
  controlled by `LOG_LEVEL` (default `info`).
- **Error stacks**: use `logger.error(msg, { error: err.message, stack: err.stack })`.
  Winston's `errors({ stack: true })` formatter keeps it structured.

The global error handler (`middleware/errorHandler.js`) already logs every
thrown `ApiError` — don't double-log on the way up.

## Circuit breakers (`apps/dashboard-backend/src/utils/retry.js`)

External services have pre-registered breakers; use them, don't roll your own:

```javascript
const { circuitBreakers } = require('../utils/retry');

const ollama = circuitBreakers.get('ollama');
const result = await ollama.execute(() => axios.post(`${LLM_URL}/api/generate`, body));
```

Pre-registered: `ollama` (threshold 3), `qdrant` (5), `embedding` (5),
`minio` (5), all with 30 s reset timeout. State is exposed at
`GET /api/system/circuit-breakers` (and inside the platform's healthcheck JSON).

When a breaker is open, `.execute()` throws synchronously without calling
the inner function — surface that as `ServiceUnavailableError` with the
right `code` (`OLLAMA_DOWN`, `QDRANT_DOWN`, etc.) so the frontend can
dispatch on it.

## Error localization (frontend)

`useApi` normalizes the backend envelope `{ error: { code, message, details } }`
into a flat `ApiError` with `.status / .code / .details`. Frontend code
**dispatches on `code`**, never on `message`:

```typescript
catch (e) {
  if (e instanceof Error && (e as ApiError).code === 'OLLAMA_DOWN') {
    toast.error('Lokale KI ist gerade nicht verfügbar — bitte gleich erneut versuchen.');
  } else throw e;
}
```

Adding a new error path? Mint a stable `code` in `utils/errors.js`,
document it in `docs/api/API_ERRORS.md`, and ship the matching UI message
in the same PR.

## Healthchecks

- Each service in `docker-compose.*.yaml` has a `healthcheck:` block —
  the platform reads health status to drive self-healing and the Status
  page. Missing healthcheck = invisible to the system.
- Backend's `/health` is shallow (process up). `/api/system/health`
  is deep (DB + circuit breakers + queue depth + GPU).

## Metrics

- `services/metrics-collector/` writes CPU/RAM/GPU/temperature into
  `metrics_*` tables (Mig 077, 080) with 7-day retention.
- App-level events live in `app_events` (Mig 079, 90-day retention).
- Don't add a "metrics-y" table without registering it in the cleanup
  cron (Mig 081 / `81_cleanups_include_infra.sql`).

## Self-healing & alerts

- Service crashes / unhealthy state → `services/self-healing-agent/`
  attempts recovery; outcomes land in `self_healing_events`.
- `alertEngine.js` (backend) → Telegram on configured thresholds.
- New auto-recoverable failure mode → register a category handler in
  `services/self-healing-agent/category_handlers.py`.

## When you change observability

| Change                   | Also touch                                          |
| ------------------------ | --------------------------------------------------- |
| New error code           | `utils/errors.js` + `docs/api/API_ERRORS.md` + UI   |
| New external dependency  | `circuitBreakers.get('<name>', ...)` registration   |
| New service              | `healthcheck:` in compose + (if applicable) handler |
| New cron-cleanable table | Add to `08X_cleanups_*.sql`                         |
