# Developer Onboarding

**Goal:** From cold clone to your first merged PR in ~30 minutes.

This guide is for **developers**. If you are an operator deploying Arasul to a Jetson appliance, read [`docs/ops/DEPLOYMENT.md`](../ops/DEPLOYMENT.md) instead. If you are an end-customer setting up a pre-configured device, read [`docs/ops/QUICK_START.md`](../ops/QUICK_START.md).

---

## Minute 0–5: Set Up

### Prerequisites

You need access to a **Jetson AGX Orin or Thor** (your own dev unit, the team's shared dev Jetson via SSH, or a customer appliance for staging). Arasul is a Jetson-native edge-AI platform: GPU + CUDA + NVIDIA Container Runtime are part of the product, not an interchangeable backend. There is no x86 laptop dev mode — see "Why no x86 dev mode?" below.

On the Jetson you need:

- **Docker** 24.0+ with Docker Compose V2
- **NVIDIA Container Runtime** (preinstalled on JetPack)
- **Git**
- **Node.js** matching `.nvmrc` (only required if you run `./scripts/test/run-tests.sh` directly on the host; the running services bring their own runtimes via Docker)
- **`gh`** (GitHub CLI) — only if you plan to draft PRs from the terminal

### Set up

```bash
git clone <repo-url> arasul-jet
cd arasul-jet
./arasul bootstrap        # full appliance bring-up: detects hardware, generates .env, pulls images, starts services
```

The `arasul` script is the canonical CLI for the platform. Run `./arasul --help` for the full list of subcommands.

### Why no x86 dev mode?

Arasul's core surfaces (LLM service, embedding service, Qdrant indexing) are tied to the GPU. A mock-stack on x86 (mock-LLM that echoes prompts, mock-embedding that returns hashed vectors) was evaluated and rejected because the mocks would diverge from real CUDA behavior — UI work might pass against the mocks but break on the Jetson, creating false confidence. The single canonical workflow is "edit on the Jetson, rebuild the affected service, verify in the browser".

---

## Minute 5–10: Mental Model

Arasul is a **commercial edge-AI appliance** shipped on NVIDIA Jetson hardware. Customers buy a physical box; it runs autonomously for 5 years without manual intervention. Design priorities, in order:

1. **Reliability** — self-healing, no external dependencies, multi-year uptime.
2. **Data privacy** — everything runs locally, no cloud calls.
3. **Ergonomics** — dashboard UX for non-technical admins.

Concretely, this means:

- No cloud SaaS integrations (everything must work offline).
- No silent failures (log, alert, recover).
- No breaking migrations (always backward-compatible).
- No "rewrite" mindset (incremental improvements only).

### The 6 Surfaces

| Surface             | Lives in                        | Who cares               |
| ------------------- | ------------------------------- | ----------------------- |
| **Dashboard UI**    | `apps/dashboard-frontend/`      | End users, admins       |
| **HTTP API**        | `apps/dashboard-backend/`       | Frontend, n8n, agents   |
| **Database**        | `services/postgres/init/*.sql`  | All backend services    |
| **LLM / RAG**       | `services/llm-service/`, Qdrant | Chat, agents, search    |
| **Ops / Self-heal** | `services/self-healing-agent/`  | Autonomous recovery     |
| **Setup / Boot**    | `./arasul`, `scripts/setup/`    | First-boot provisioning |

### Project layout (orientation only — read what you need)

```
arasul-jet/
├── apps/                          actively developed apps
│   ├── dashboard-backend/         Node.js / Express REST API + Jest tests
│   └── dashboard-frontend/        React 19 SPA + Vitest
├── services/                      infrastructure containers (LLM, indexer, postgres, ...)
├── compose/                       Docker Compose split files
├── config/                        Traefik, TLS, secrets, profiles
├── scripts/                       setup, test, deploy, ops scripts
├── docs/                          documentation (this folder)
│   ├── development/               for contributors
│   ├── api/                       API reference, error catalog, schema
│   ├── ops/                       deployment, troubleshooting, admin
│   ├── features/                  per-service feature docs
│   └── plans/                     active and archived roadmaps
├── .claude/                       Claude Code workspace (commands, agents, hooks, context)
├── CLAUDE.md                      AI-facing entry point + non-negotiables
├── README.md                      "what is this" + start-here
└── CONTRIBUTING.md                workflow, conventions, slash-command catalog
```

**Key distinction:** `apps/` = code you actively develop, `services/` = infrastructure containers built once and run.

---

## Minute 10–15: Local Dev Loop

Arasul has **no host-side dev server with hot-reload** — every change goes through a Docker rebuild on the Jetson. This is intentional (see "Why no x86 dev mode?" above).

```bash
# Backend change
docker compose up -d --build dashboard-backend
docker compose logs -f dashboard-backend

# Frontend change
docker compose up -d --build dashboard-frontend
# Reload the browser at https://<jetson-host>/

# Both at once
docker compose up -d --build dashboard-backend dashboard-frontend
```

A backend rebuild typically takes ~30s on Jetson Orin; a frontend rebuild ~60s (Vite production build). For pure markup tweaks, the frontend container also runs Vite in watch mode in development — check `apps/dashboard-frontend/Dockerfile` for the current setup.

### Test Before Commit

```bash
./scripts/test/run-tests.sh --backend    # Jest, ~2 min
./scripts/test/run-tests.sh --frontend   # Vitest, ~3 min
./scripts/test/run-tests.sh --all        # both, ~5 min
```

A commit **must** pass both suites. CI has no special privileges that your local runs lack.

### Daily Commands Cheatsheet

| Want to…                             | Run                                                       |
| ------------------------------------ | --------------------------------------------------------- |
| See logs for a service               | `docker compose logs -f <service>`                        |
| Restart one service                  | `docker compose restart <service>`                        |
| DB shell                             | `docker exec -it postgres-db psql -U arasul -d arasul_db` |
| Check GPU usage (Jetson)             | `tegrastats` (or `docker exec llm-service nvidia-smi`)    |
| Check all service health             | `docker compose ps`                                       |
| Re-run migrations                    | `docker compose restart postgres-db`                      |
| Nuke node_modules + rebuild frontend | `docker compose build --no-cache dashboard-frontend`      |

---

## Minute 15–25: The Five Non-Negotiables

These are codified in [`CLAUDE.md`](../../CLAUDE.md) and the per-area `apps/*/CLAUDE.md` files. Read [`CLAUDE.md`](../../CLAUDE.md) once.

### 1. Backend — always `asyncHandler`

```javascript
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError } = require('../utils/errors');

router.post(
  '/foo',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body.name) throw new ValidationError('Name required');
    const result = await service.doThing(req.body);
    res.json({ data: result });
  })
);
```

No `try / catch` in route handlers. Errors flow through `utils/errors.js` and are mapped to HTTP responses by `middleware/errorHandler.js`.

### 2. Frontend — always `useApi()`, never raw `fetch`

```typescript
import { useApi } from '@/hooks/useApi';

const api = useApi();
const docs = await api.get<Document[]>('/documents');
await api.post('/documents', payload, { showError: false });
```

Raw `fetch` bypasses auth-token refresh, error toasts, and the abort-controller pattern that prevents memory leaks.

### 3. Frontend — CSS variables, not hex

```tsx
// YES
<div className="bg-primary/10 text-foreground border-border" />

// NO
<div style={{ background: '#3b82f6', color: '#fff' }} />
```

The theme system in `src/index.css` drives light / dark modes. Hex colors break it.

### 4. Database — migrations are append-only and idempotent

```bash
ls services/postgres/init/ | tail -1   # find the highest number
# Create the next file: NNN_<description>.sql
```

Migrations must use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc. Never `DROP` without an explicit fallback. See [`services/postgres/CLAUDE.md`](../../services/postgres/CLAUDE.md) for the full migration contract.

### 5. Commits — Conventional Commits

```
<type>(<scope>): <subject>
```

Types: `feat | fix | docs | refactor | test | chore | ci | build | perf`. PR title matches commit style. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for the full convention.

---

## Minute 25–30: Find Your First Task

### Entry Points by Task Type

| Doing…               | Start reading at                                                              |
| -------------------- | ----------------------------------------------------------------------------- |
| Adding an API route  | `apps/dashboard-backend/src/routes/index.js`                                  |
| Adding a UI page     | `apps/dashboard-frontend/src/App.tsx`                                         |
| Adding a DB field    | `services/postgres/init/` (next migration number)                             |
| Editing LLM behavior | `apps/dashboard-backend/src/services/llm/`                                    |
| Debugging n8n flow   | `services/n8n/` + dashboard n8n page                                          |
| Touching workspaces  | `apps/dashboard-backend/src/services/sandbox/` + `routes/sandbox.js`          |
| Changing design      | `docs/development/DESIGN_SYSTEM.md` + `apps/dashboard-frontend/src/index.css` |

### Reading guide per domain

Before editing in a domain, glance at the matching context file:

- `.claude/context/backend.md` — Express routes, services, middleware
- `.claude/context/n8n-workflow.md` — n8n workflow engine + custom nodes
- `.claude/context/rag.md` — RAG pipeline (chunk → embed → retrieve)
- `.claude/context/llm-queue.md` — LLM service queue + concurrency
- `.claude/context/security.md` — Auth, RBAC, audit logs
- `.claude/context/observability.md` — Metrics, logs, alerts
- `.claude/context/testing.md` — Test patterns and coverage expectations
- `.claude/context/debug.md` — Debugging recipes
- `.claude/context/commercial.md` — Commercial-launch surfaces

### Your first PR checklist

- [ ] Branch from `main` with a descriptive name (`feat/agent-tools`, `fix/rag-cite-parser`).
- [ ] Implementation + at least one test covering the change.
- [ ] `./scripts/test/run-tests.sh --all` passes locally.
- [ ] Updated relevant docs if behavior or API changed.
- [ ] Container rebuild verified in browser (UI changes).
- [ ] Commit message follows Conventional Commits.

---

## Common Gotchas

| Symptom                                           | Likely cause                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Frontend changes don't appear                     | Forgot `--build` — Docker cached the old image.                         |
| `relation does not exist` on DB query             | Migration not run — `docker compose restart postgres-db`.               |
| LLM stream hangs                                  | Ollama model not pulled — check `docker compose logs llm-service`.      |
| `useApi` returns `unknown` types                  | Intentional — narrow with `as` at use-site or supply `get<T>()` a type. |
| Sandbox container won't start                     | Check `sandboxService.js` logs for nvidia runtime errors.               |
| `401 Unauthorized` in dev                         | Token expired — clear localStorage if auto-refresh fails.               |
| Jest "did not exit one second after the test run" | Pre-existing; tests pass — safe to ignore.                              |

---

## Where context lives

In descending order of authority:

1. **Source code + git history** — `git log -p <file>` tells you _why_.
2. [`CLAUDE.md`](../../CLAUDE.md) and the per-area `apps/*/CLAUDE.md`, `services/*/CLAUDE.md` — non-negotiables.
3. [`docs/INDEX.md`](../INDEX.md) — curated map of all docs.
4. [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — service topology.
5. [`.claude/context/`](../../.claude/context/) — task-focused briefs for AI assistants and humans alike.

When unsure: grep is your friend. Everything is plain text.

---

## Going further

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — full workflow, branching, commit convention, slash-command catalog.
- [`docs/development/DEVELOPMENT.md`](DEVELOPMENT.md) — deep-dive on backend / frontend patterns.
- [`docs/api/API_REFERENCE.md`](../api/API_REFERENCE.md) — REST endpoint catalog.
- [`docs/api/DATABASE_SCHEMA.md`](../api/DATABASE_SCHEMA.md) — current schema and migration history.
- [`docs/ops/DEPLOYMENT.md`](../ops/DEPLOYMENT.md) — fresh-install on a new Jetson, factory-image workflow.

**You're ready.** Pick up an issue labelled `good-first-issue`, or ask the team for a small refactor. Ship something by end of day 1.
