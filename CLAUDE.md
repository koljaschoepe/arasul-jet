# CLAUDE.md — Arasul Platform

## Vision

Arasul is an autonomous Edge-AI platform for NVIDIA Jetson, sold to companies
as a plug-&-play appliance: chat, RAG, document analysis, and automation,
running fully local and GDPR-compliant. Target: 5 years of unattended operation.

## Architecture at a glance

```
Internet (443) → Traefik → Dashboard-Frontend (React 19 SPA)
                         → Dashboard-Backend (Express API :3001)
                              ├─ PostgreSQL 16 (migrations in services/postgres/init/)
                              ├─ MinIO (S3-compatible object storage)
                              ├─ Ollama / LLM-Service (:11434/:11436) [GPU]
                              ├─ Embedding-Service (:11435) [GPU]
                              ├─ Qdrant Vector DB (:6333)
                              ├─ Document-Indexer (:9102)
                              ├─ n8n Workflow Engine (:5678)
                              └─ Docker-Proxy → Self-Healing, Metrics, Backup
```

| Layer    | Stack                                                             | Path                                                          |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript          | `apps/dashboard-frontend/`                                    |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                      | `apps/dashboard-backend/`                                     |
| AI       | Ollama (LLM) + BGE-M3 (embeddings) + Qdrant (vectors)             | `services/llm-service/`, `services/embedding-service/`        |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik v2.11      | `compose/`, `config/traefik/`                                 |
| Ops      | Self-Healing Agent + Metrics Collector + Backup Service           | `services/self-healing-agent/`, `services/metrics-collector/` |
| DB       | PostgreSQL 16 (sequential migrations; next = highest on disk + 1) | `services/postgres/init/`                                     |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32–128 GB, CUDA 8.7–10.0)          | Detection: `scripts/setup/detect-jetson.sh`                   |

## Non-negotiable rules

1. **Backend** — every route uses `asyncHandler` and throws custom errors from
   `utils/errors.js`. Never `try/catch` at route level, never `throw new Error`.
   Details: [`apps/dashboard-backend/CLAUDE.md`](apps/dashboard-backend/CLAUDE.md).
2. **Frontend** — every call goes through `useApi`. TypeScript only, theme
   tokens via CSS variables (no hex literals). Details:
   [`apps/dashboard-frontend/CLAUDE.md`](apps/dashboard-frontend/CLAUDE.md).
3. **Tests before commit** — `./scripts/test/run-tests.sh --backend|--frontend|--all`.
4. **Deploy** — there is no local dev server. After code changes:
   `docker compose up -d --build <service>`. The user verifies in the browser.
5. **Docs stay in sync**: API change → `docs/api/API_REFERENCE.md`,
   schema change → `docs/api/DATABASE_SCHEMA.md`,
   new env var → `docs/ENVIRONMENT_VARIABLES.md`.
6. **Conventional commits** — `feat|fix|docs|refactor|test|chore: <subject>`.
7. **Lockfile strategy: root-only.** This is an npm-workspaces monorepo with
   exactly **one** lockfile — `/package-lock.json`. Never add a per-workspace
   `package-lock.json` (they drift from the root lock and break `npm ci` on
   `main` — see the 2026-05-05 incident, `docs/plans/archive/2026-07-02_dependabot-hardening.md`).
   Install with `npm ci` from the repo root; Dockerfiles install via
   `npm ci --workspace=<name> --include-workspace-root`. Dependabot has a
   single npm entry at `/`, and CI's **Lockfile drift guard** fails any PR
   whose root lock is out of sync.
8. **PR hygiene** — keep the queue clean: one active PR per work-stream (finish
   what's open before starting the next related change), always merge/close with
   `--delete-branch` (no branch outlives its PR), and sweep stale/merged/superseded
   PRs on sight. Details: [`CONTRIBUTING.md`](CONTRIBUTING.md#pr-hygiene).

## Task router — which CLAUDE.md to read

Each subfolder owns its own `CLAUDE.md` with the conventions for code in that
folder. Read the closest one to where you're working:

| If you're touching…                     | Read first                                      |
| --------------------------------------- | ----------------------------------------------- |
| A backend route / service / middleware  | `apps/dashboard-backend/CLAUDE.md`              |
| A React component, hook, or feature     | `apps/dashboard-frontend/CLAUDE.md`             |
| A new long-running service / Dockerfile | `services/CLAUDE.md`                            |
| A SQL migration                         | `services/postgres/CLAUDE.md`                   |
| Compose / Traefik / infra wiring        | `services/CLAUDE.md` + `docs/ops/DEPLOYMENT.md` |
| Onboarding / first-time setup           | `docs/development/ONBOARDING.md`                |
| Testing strategy across the platform    | `docs/development/TESTING.md`                   |

Deeper-dive context packs (one-off topics — Telegram bot internals, n8n
custom nodes, security review checklist, etc.) live under `.claude/context/`.

## Quick reference

> **Der eine Faden:** [`docs/plans/ROADMAP.html`](docs/plans/ROADMAP.html) — Themenspeicher + 1.0.0-Gates. Die gesamte Weiterentwicklung läuft über **vier Commands** (`CONTRIBUTING.md` §8): `/plan` (Interview → HTML-Plan-Seite → Freigabe) → `/work` (autonome Ausführung bis Live-Verify auf dem Jetson) · `/audit` (Scan → Findings → Roadmap) · `/status` (Lagebild). Nightly: `scripts/util/nightly-run.sh`. Der alte Master-Plan ([`FIELD_1.0.0_MASTER_PLAN.md`](docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md)) bleibt Referenz, bis die Migration (Roadmap-Thema T01) ihn eingedampft hat.

### Entry points

| Domain      | File                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js` → `routes/index.js`            |
| Frontend    | `apps/dashboard-frontend/src/App.tsx`                                |
| Database    | `services/postgres/init/` (next migration = highest NNN on disk + 1) |
| LLM Service | `services/llm-service/api_server.py`                                 |
| Setup       | `scripts/interactive_setup.sh`                                       |
| Bootstrap   | `./arasul bootstrap`                                                 |

### Commands

```bash
docker compose up -d                               # Start all services
docker compose up -d --build <service>             # Rebuild one service
docker compose logs -f <service>                   # Stream logs
docker compose ps                                  # Service status (incl. health)
docker exec -it postgres-db psql -U arasul -d arasul_db   # DB shell
make build s=dashboard-frontend                    # Makefile shortcut
make logs s=dashboard-backend                      # Logs via Make
./scripts/test/run-tests.sh --all                  # All tests
```

### Debugging

| Symptom             | Command                                                |
| ------------------- | ------------------------------------------------------ |
| Service won't start | `docker compose logs <service>`                        |
| DB problem          | `docker exec postgres-db pg_isready -U arasul`         |
| LLM not responding  | `docker compose logs llm-service`                      |
| GPU status          | `docker exec llm-service nvidia-smi` (or `tegrastats`) |

## Documentation

| Topic                   | File                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                                                                       |
| API reference           | [docs/api/API_REFERENCE.md](docs/api/API_REFERENCE.md)                                                                                             |
| API errors              | [docs/api/API_ERRORS.md](docs/api/API_ERRORS.md)                                                                                                   |
| Database schema         | [docs/api/DATABASE_SCHEMA.md](docs/api/DATABASE_SCHEMA.md)                                                                                         |
| Design system           | [docs/development/DESIGN_SYSTEM.md](docs/development/DESIGN_SYSTEM.md)                                                                             |
| Development             | [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md)                                                                                 |
| Onboarding              | [docs/development/ONBOARDING.md](docs/development/ONBOARDING.md)                                                                                   |
| Testing                 | [docs/development/TESTING.md](docs/development/TESTING.md)                                                                                         |
| Environment variables   | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)                                                                                     |
| Jetson compatibility    | [docs/features/JETSON_COMPATIBILITY.md](docs/features/JETSON_COMPATIBILITY.md)                                                                     |
| Admin handbook          | [docs/ops/ADMIN_HANDBUCH.md](docs/ops/ADMIN_HANDBUCH.md) (DE)                                                                                      |
| Deployment              | [docs/ops/DEPLOYMENT.md](docs/ops/DEPLOYMENT.md)                                                                                                   |
| Troubleshooting         | [docs/ops/TROUBLESHOOTING.md](docs/ops/TROUBLESHOOTING.md)                                                                                         |
| Backup & DR             | [docs/ops/BACKUP_SYSTEM.md](docs/ops/BACKUP_SYSTEM.md), [docs/ops/DISASTER_RECOVERY.md](docs/ops/DISASTER_RECOVERY.md)                             |
| Integrations (n8n)      | [docs/integrations/N8N.md](docs/integrations/N8N.md) (operator), [docs/integrations/N8N_OVERVIEW.md](docs/integrations/N8N_OVERVIEW.md) (customer) |
| Integrations (Telegram) | [docs/integrations/TELEGRAM_BOT_SETUP.md](docs/integrations/TELEGRAM_BOT_SETUP.md)                                                                 |
| Legal / DSGVO           | [docs/legal/](docs/legal/) (AVV-Vorlage, Datenschutz-Module, Drittland-Konnektoren)                                                                |
| Full doc index          | [docs/INDEX.md](docs/INDEX.md)                                                                                                                     |
| Contributing            | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                                                 |
