# Backend — Advanced Context

> Long-form notes on the Express backend that don't belong in
> [`apps/dashboard-backend/CLAUDE.md`](../../apps/dashboard-backend/CLAUDE.md)
> (which is the rules-and-forbidden-patterns contract). Read this when
> you need the _why_ behind a pattern, the boot sequence, or the
> inter-service URL map.

## Boot sequence (`src/index.js`)

1. `dotenv.config()` + `resolveSecrets()` — Docker secrets from
   `/run/secrets/*` are hydrated into `process.env`.
2. **Required-env gate** — refuses to start without
   `POSTGRES_PASSWORD / JWT_SECRET / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD`.
3. **Production-only weak-secret gate** — `JWT_SECRET ≥ 32 chars`,
   `POSTGRES_PASSWORD ≥ 16`, no `dev|test|default|example|changeme|password`
   substrings. Refuses to start otherwise.
4. Helmet → CORS (RFC 1918 + `.local` mDNS) → cookie parser →
   JSON body (10 MB) → request log (non-prod) → audit log → CSRF →
   `/api` routes → `notFoundHandler` → `errorHandler`.
5. HTTP server attached, then WebSocket via `noServer` mode (`server.on('upgrade')`).
6. `migrationRunner` runs unapplied SQL from `services/postgres/init/`.
7. `eventLoopMonitor` (`perf_hooks`) starts — multi-month uptime guard.

## Auth model

| Layer        | Detail                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| JWT          | HS256, 4 h expiry (`JWT_EXPIRY`), UUID-v4 JTI per token                   |
| Verify path  | signature → `token_blacklist` → in-process userCache (50 ent / 60 s) → DB |
| Sessions     | `active_sessions` (JTI, IP, UA); revoke = blacklist JTI                   |
| API key      | `aras_<32-hex>`, header `X-API-Key`, route via `requireApiKey`            |
| Forward-auth | `/api/auth/verify` for Traefik → returns `X-User-Id`/`X-User-Name`        |
| WebSocket    | token via `?token=` query param (cookie unreliable for upgrades)          |

## Inter-service URLs (`src/config/services.js`)

| Service          | URL                              | Notes                          |
| ---------------- | -------------------------------- | ------------------------------ |
| LLM (Ollama)     | `http://llm-service:11434`       | Inference                      |
| LLM management   | `http://llm-service:11436`       | Pull/list/delete models        |
| Embeddings       | `http://embedding-service:11435` | BGE-M3                         |
| Qdrant           | `http://qdrant:6333`             | Vector DB                      |
| MinIO            | `http://minio:9000`              | Object storage                 |
| Document indexer | `http://document-indexer:9102`   | Ingest pipeline                |
| Docker proxy     | `tcp://docker-proxy:2375`        | Read-only socket via tecnativa |

Always read URLs from `services.<name>.url`. Don't bake `http://*:port`
strings into routes — `services.js` owns timeouts and overrides too.

## Database client (`src/database.js`)

- Shared pool: min 2, max 20. `statement_timeout = 30 s`,
  `idle_in_transaction_session_timeout = 60 s`. Leak warning > 60 s.
- One-shot: `db.query(sql, params)`. Transactions: `db.getClient()` +
  `BEGIN`/`COMMIT`/`ROLLBACK`/`release()` in a `try/finally`.
- Second pool: `dataDatabase.js` for the user-data DB (`arasul_data_db`).

## Routes are mounted in `routes/index.js`

The route inventory lives at the top of `apps/dashboard-backend/src/routes/index.js`
(`API_ROUTE_GROUPS`). It is the source of truth — don't replicate it here
because it goes stale immediately. `GET /api/_meta` returns the same
structure at runtime.

## Reference files for common patterns

| Pattern           | File                                                   |
| ----------------- | ------------------------------------------------------ |
| Simple CRUD       | `routes/admin/settings.js`                             |
| SSE streaming     | `routes/llm.js` + `utils/sseHelper.js`                 |
| File upload       | `routes/documents.js`                                  |
| WebSocket upgrade | `src/index.js` (search `'upgrade'`)                    |
| Queue-based job   | `services/llm/llmQueueService.js`                      |
| GDPR / audit      | `routes/admin/gdpr.js` + `utils/auditLog.js`           |
| Circuit breaker   | `utils/retry.js` (see `circuitBreakers.get('ollama')`) |

## Things that have bitten us

- **Triggering errors after `res.write()`**: `errorHandler` is a no-op
  once headers are sent. Streams must flush an error frame themselves.
- **Forgetting `requireAuth`**: there is no implicit-auth middleware.
  Every `routes/index.js` mount is explicit — keep it that way.
- **Unbounded `for`-loops over external services**: wrap in
  `circuitBreakers.get(...).execute(...)` so a single broken dependency
  can't take down the whole queue.
- **Passing the wrong DB pool**: data tables live in `dataDatabase.js`,
  not the main `db`. Mixing them silently corrupts schemas.
