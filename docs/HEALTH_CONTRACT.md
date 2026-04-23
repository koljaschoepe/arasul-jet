# Health Endpoint Contract

Public contract for probe and monitoring integrations. This is what
Traefik, Docker healthchecks, uptime dashboards, and external alerting
can rely on.

> **Scope:** dashboard-backend only. Each service (llm, embedding,
> document-indexer, etc.) has its own `/health` — see the per-service
> READMEs. This doc defines the API the external world talks to.

---

## The three endpoints

| Path          | Purpose               | HTTP codes | Typical use                             |
| ------------- | --------------------- | ---------- | --------------------------------------- |
| `/healthz`    | Liveness (process up) | 200        | Docker healthcheck, K8s liveness probe  |
| `/readyz`     | Readiness (deps up)   | 200 or 503 | Load balancer gate, K8s readiness probe |
| `/api/health` | Primary, legacy       | 200 or 503 | Dashboard UI, external monitoring       |

### Why three?

- **`/healthz`** is **fast and cheap** — it always returns 200 if the
  Express event loop can answer. It does not hit the database. Use it
  when you need to know "is the container process alive." A flapping
  database should not cause the process to be restarted.
- **`/readyz`** is **deep** — it exercises database, LLM, embeddings,
  and MinIO. Returns 503 if the database is unreachable (critical) so
  load balancers drain the node. Use it when you need "is this
  instance safe to send traffic to."
- **`/api/health`** is the legacy entry point. Without query params it
  behaves like `/healthz`. With `?detail=true` it behaves like
  `/readyz`. Kept for existing dashboards and external tools that
  already point at it.

---

## Response contract

### Liveness shape (`/healthz`, `/api/health`)

```json
{
  "status": "OK",
  "timestamp": "2026-04-23T12:00:00.000Z",
  "service": "dashboard-backend",
  "version": "1.0.0"
}
```

Status is always `OK`. HTTP code is always 200. If either of these
invariants is violated, the process is crashing and Docker / K8s
should restart it.

### Readiness shape (`/readyz`, `/api/health?detail=true`)

```json
{
  "status": "OK" | "DEGRADED" | "CRITICAL",
  "timestamp": "2026-04-23T12:00:00.000Z",
  "service": "dashboard-backend",
  "version": "1.0.0",
  "build_hash": "abc123",
  "checks": {
    "database":   { "status": "ok" | "error", "latencyMs": 12 },
    "ollama":     { "status": "ok" | "unreachable", "models": 3 },
    "embeddings": { "status": "ok" | "unreachable" },
    "minio":      { "status": "ok" | "unreachable" }
  },
  "eventLoop": {
    "min": 0.0, "max": 0.0, "mean": 0.0, "p99": 0.0, "stddev": 0.0
  },
  "circuitBreakers": { "...": "..." }
}
```

### Status field

| Value      | Meaning                                    | HTTP |
| ---------- | ------------------------------------------ | ---- |
| `OK`       | All deps reachable                         | 200  |
| `DEGRADED` | Non-critical dep unreachable (LLM, MinIO)  | 200  |
| `CRITICAL` | Database unreachable — do not send traffic | 503  |

The database is the one critical dep. AI services (Ollama, embeddings)
being down degrades the UI but doesn't prevent login or admin work,
so they map to `DEGRADED` (200, not 503). Load balancers decide based
on HTTP code, not the string field.

### Adding new dependencies

When you add a new service dep, decide:

- **Is it required for the dashboard to be usable?**
  Yes → add to `checks`, make failure promote status to `CRITICAL`
  (raise 503). Needs a review because it tightens the readiness
  contract — more 503s in the wild.
- **Is it nice-to-have?**
  Yes → add to `checks`, keep status at `DEGRADED` on failure. Stays
  at 200.

Update this doc when you do either.

---

## Traefik / Docker configuration

Traefik health checks and docker-compose healthcheck directives should
point at `/healthz`, not `/readyz`, because a transient MinIO blip
should not take the node out of rotation.

External uptime monitoring (StatusCake, UptimeRobot, internal Grafana)
should point at `/readyz` so incidents are visible.

Live users hit `/api/health?detail=true` via the dashboard's system
page. The detail response is the source of truth for per-dep status in
the UI.

---

## What can change

- **Adding fields** to the JSON response is non-breaking. Clients
  must tolerate extra keys.
- **Removing fields** (including specific `checks.*` entries) is a
  breaking change — bump `docs/API_REFERENCE.md` and notify external
  integrators.
- **Changing HTTP codes** is a breaking change — touches every
  monitoring setup in the wild. Avoid.
- **Renaming status values** is a breaking change. The current set
  (`OK | DEGRADED | CRITICAL`) is frozen.
