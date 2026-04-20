# Onboarding Guide

**Goal:** From cold start to your first merged PR in 30 minutes.

This guide assumes the platform is already installed — if not, run through
[`GETTING_STARTED.md`](GETTING_STARTED.md) first (10 min).

---

## Minute 0–5: Mental Model

Arasul is a **commercial edge-AI appliance** shipped on NVIDIA Jetson hardware.
Customers buy a physical box; it runs autonomously for 5 years without manual
intervention. Design priorities in order:

1. **Reliability** — self-healing, no external dependencies, 5yr uptime
2. **Data privacy** — everything runs locally, no cloud calls
3. **Ergonomics** — dashboard UX for non-technical admins

Concretely, this means:

- No cloud SaaS integrations (everything must work offline)
- No silent failures (log, alert, recover)
- No breaking migrations (always backward-compatible)
- No "rewrite" mindset (incremental improvements only)

### The 6 Surfaces

| Surface             | Lives in                        | Who cares               |
| ------------------- | ------------------------------- | ----------------------- |
| **Dashboard UI**    | `apps/dashboard-frontend/`      | End users, admins       |
| **HTTP API**        | `apps/dashboard-backend/`       | Frontend, n8n, Bots     |
| **Database**        | `services/postgres/init/*.sql`  | All backend services    |
| **LLM/RAG**         | `services/llm-service/`, Qdrant | Chat, Telegram, Search  |
| **Ops/Self-heal**   | `services/self-healing-agent/`  | Autonomous recovery     |
| **Setup/Bootstrap** | `scripts/interactive_setup.sh`  | First-boot provisioning |

---

## Minute 5–15: Local Dev Loop

**Single most important rule:** Arasul has **no local dev server**. Every code
change requires a Docker rebuild. The user tests in a real browser against a
real container.

```bash
# Backend change
docker compose up -d --build dashboard-backend
docker compose logs -f dashboard-backend

# Frontend change
docker compose up -d --build dashboard-frontend
# Then reload the browser at https://<host>/

# Both at once
docker compose up -d --build dashboard-backend dashboard-frontend
```

### Test Before Commit

```bash
./scripts/test/run-tests.sh --backend    # Jest, ~2 min
./scripts/test/run-tests.sh --frontend   # Vitest, ~3 min
./scripts/test/run-tests.sh --all        # both, ~5 min
```

A commit **must** pass both suites. CI has no special privileges that your
local runs lack — if it passes locally, it passes in CI.

### Daily Commands Cheatsheet

| Want to...                           | Run                                                       |
| ------------------------------------ | --------------------------------------------------------- |
| See logs for a service               | `docker compose logs -f <service>`                        |
| Restart one service                  | `docker compose restart <service>`                        |
| DB shell                             | `docker exec -it postgres-db psql -U arasul -d arasul_db` |
| Check GPU usage                      | `docker exec llm-service nvidia-smi`                      |
| Check all service health             | `docker compose ps`                                       |
| Re-run migrations                    | `docker compose restart postgres-db`                      |
| Nuke node_modules + rebuild frontend | `docker compose build --no-cache dashboard-frontend`      |

---

## Minute 15–25: The Five Non-Negotiables

Read [`CLAUDE.md`](../CLAUDE.md) once. It's the source of truth. Highlights:

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

No try/catch in route handlers. Errors go through `utils/errors.js`.
Route-level logging is automatic via middleware.

### 2. Frontend — always `useApi()`, never raw `fetch`

```typescript
import { useApi } from '@/hooks/useApi';

const api = useApi();
const docs = await api.get<Document[]>('/documents');
await api.post('/documents', payload, { showError: false });
```

Using raw `fetch` bypasses auth token refresh, error toasts, and the
abort-controller pattern that prevents memory leaks.

### 3. Frontend — CSS variables, not hex

```tsx
// YES
<div className="bg-primary/10 text-foreground border-border" />

// NO
<div style={{ background: '#3b82f6', color: '#fff' }} />
```

The theme system (`src/index.css`) drives light/dark modes. Hex colors break it.

### 4. Database — migrations are append-only

Next migration number is **`078_*.sql`** (check
`services/postgres/init/` — always use next integer).
Migrations must be **idempotent** (use `CREATE TABLE IF NOT EXISTS`,
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Never `DROP` without a
fallback path.

### 5. Commits — conventional

`feat: | fix: | docs: | refactor: | test: | chore: <Beschreibung>` in German
or English. PR title matches commit style.

---

## Minute 25–30: Find Your First Task

### Entry Points by Task Type

| Doing...             | Start reading at                                                              |
| -------------------- | ----------------------------------------------------------------------------- |
| Adding an API route  | `apps/dashboard-backend/src/routes/index.js` (the router index)               |
| Adding a UI page     | `apps/dashboard-frontend/src/App.tsx` (route table)                           |
| Adding a DB field    | `services/postgres/init/` (next migration number)                             |
| Editing LLM behavior | `apps/dashboard-backend/src/services/llm/`                                    |
| Debugging n8n flow   | `services/n8n/` + dashboard n8n page                                          |
| Touching Telegram    | `apps/dashboard-frontend/src/features/telegram/` + backend `routes/telegram/` |
| Changing design      | `docs/DESIGN_SYSTEM.md` + `apps/dashboard-frontend/src/index.css`             |

### Reading Guide per Domain

Before editing, read the corresponding context file in `.claude/context/`:

- `backend.md` — Express routes, services, middleware
- `frontend.md` + `component.md` — React patterns, hooks, shadcn
- `database.md` + `migration.md` — PostgreSQL, migration rules
- `python-services.md` — LLM, embedding, metrics collectors
- `telegram.md` — Telegram bot architecture
- `security.md` — Auth, RBAC, audit logs
- `testing.md` — Test patterns and coverage expectations

### Your First PR Checklist

- [ ] Branch from `main` with a descriptive name (`feat/telegram-multi-bot`, `fix/rag-cite-parser`)
- [ ] Implementation + at least one test covering the change
- [ ] `./scripts/test/run-tests.sh --all` passes locally
- [ ] Updated relevant doc if behavior/API changed (see
      [CLAUDE.md § Dokumentation](../CLAUDE.md))
- [ ] Container rebuild verified in browser (UI changes)
- [ ] Commit message follows convention

---

## Common Gotchas

| Symptom                                           | Likely cause                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Frontend changes don't appear                     | Forgot `--build` — Docker cached the old image                           |
| "relation does not exist" on DB query             | Migration not run — `docker compose restart postgres-db`                 |
| LLM stream hangs                                  | Ollama model not pulled — check `docker compose logs llm-service`        |
| `useApi` returns `unknown` types                  | Intentional — narrow with `as` at use-site or give `get<T>()` a type     |
| Sandbox container won't start                     | Check `sandboxService.js` logs for nvidia runtime errors                 |
| `401 Unauthorized` in dev                         | Token expired — frontend should auto-refresh; if not, clear localStorage |
| Jest "did not exit one second after the test run" | Pre-existing; tests pass — safe to ignore                                |

---

## Where Context Lives

Authoritative, in descending order of specificity:

1. **Source code + git history** — `git log -p <file>` tells you _why_
2. **[CLAUDE.md](../CLAUDE.md)** — unbreakable rules
3. **[docs/INDEX.md](INDEX.md)** — curated doc map
4. **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — service topology
5. **[.claude/context/\*.md](../.claude/context/)** — task-focused briefs

If you're unsure, grep is your friend. Everything is a plain text file.

---

**You're ready.** Pick up an issue labelled `good-first-issue`, or ask the
team for a small refactor. Ship something by end of day 1.
