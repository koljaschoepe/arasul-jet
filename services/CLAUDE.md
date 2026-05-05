# CLAUDE.md — services/

> Long-running, mostly Python sidecar services. The Express monolith lives
> in `apps/dashboard-backend/`. Anything here is its own container with its
> own lifecycle.

## What's in here

| Service               | Role                                                 | Lang    |
| --------------------- | ---------------------------------------------------- | ------- |
| `llm-service/`        | Ollama runtime + management API (GPU)                | Py + sh |
| `embedding-service/`  | BGE-M3 embeddings (GPU)                              | Python  |
| `document-indexer/`   | Ingest pipeline (parse → chunk → embed → store)      | Python  |
| `self-healing-agent/` | Watches services, restarts/recovers, optional reboot | Python  |
| `metrics-collector/`  | CPU/RAM/GPU/temperature → Postgres                   | Python  |
| `backup-service/`     | Scheduled `pg_dump` + restore-drill                  | Bash    |
| `n8n/`                | Workflow engine + custom nodes                       | TS/n8n  |
| `postgres/`           | DB image, migrations — **see `postgres/CLAUDE.md`**  | SQL     |
| `mcp-remote-bash/`    | MCP server (remote bash for Claude Code)             | TS      |
| `cloudflared/`        | Cloudflare tunnel client                             | config  |
| `claude-code/`        | Containerized Claude Code runtime                    | config  |
| `sandbox/`            | Per-user execution sandbox                           | config  |

## Service standard

Every service folder must have:

```
<service>/
  Dockerfile          ARM64-aware, multi-stage where useful, non-root user.
  README.md           Purpose, env vars, ports, healthcheck command.
  healthcheck.sh      Or an inline healthcheck in the compose file.
  requirements.txt    (Python) — pinned versions, ARM64-compatible.
  <main>.py           Single entrypoint; long-running services expose /health.
  tests/              (Optional but encouraged for stateful services.)
```

The compose entry lives in `compose/compose.<group>.yaml`
(`ai`, `app`, `core`, `external`, `monitoring`). Pick the group that
matches the service's blast-radius, not the alphabet.

## Conventions

1. **Ports**: AI services own `1143x`/`6333`/`9102`. App services own `300x`.
   Never bind a service to `0.0.0.0` outside of Docker — let Traefik or the
   docker network handle exposure.
2. **GPU access**: declare `runtime: nvidia` and `NVIDIA_VISIBLE_DEVICES=all`
   in the compose entry. The host is JetPack 6 / GLIBC 2.35 — base off
   `ubuntu:22.04` (or newer) for any image that links Tegra libs.
3. **Healthcheck**: every service must have one. Backend, self-healing-agent,
   and metrics-collector consume them — a missing healthcheck is invisible
   to the platform and self-healing can't recover it.
4. **Logging**: write to stdout/stderr. Docker collects the rest. Don't log
   to files inside the container — they vanish on restart.
5. **Secrets**: read from env vars (Docker secrets are mounted as files at
   `/run/secrets/<name>` and resolved at boot — see `dashboard-backend/src/utils/resolveSecrets.js`
   for the pattern).
6. **Migrations & schema**: services that own tables ship their SQL via
   `services/postgres/init/`, not via runtime `CREATE TABLE`. See
   `postgres/CLAUDE.md` for the migration contract.

## Adding a new service

1. Scaffold: `Dockerfile`, `README.md`, `healthcheck.sh`, code, `requirements.txt`.
2. Compose entry in `compose/compose.<group>.yaml` with healthcheck, depends_on,
   resource limits, and (if applicable) GPU runtime.
3. If it talks to Postgres, request a connection string via env, use
   `MIN_CONNECTIONS=2 / MAX_CONNECTIONS=20` (the platform-wide convention).
4. If it should auto-recover, register it in
   `services/self-healing-agent/category_handlers.py`.
5. Document it in `docs/ARCHITECTURE.md` (services table) and add a
   subsection to `services/<name>/README.md`.

## Deploy & debug

```bash
docker compose up -d --build <service>
docker compose logs -f <service>
docker compose ps                           # see health column
docker exec -it <service> sh                # poke around
```

If the container is unhealthy: check `healthcheck.sh` first, then logs,
then resource limits (Jetson has finite RAM and the LLM service is greedy).
