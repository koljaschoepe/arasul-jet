# CLAUDE.md

Instructions for Claude Code working in the Arasul Platform repository.

---

## Quick Navigation

| Looking for...              | Go to...                                                       |
| --------------------------- | -------------------------------------------------------------- |
| All documentation           | [docs/INDEX.md](docs/INDEX.md)                                 |
| **Getting started**         | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)             |
| **Architecture & Services** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   |
| **Development Guide**       | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)                     |
| **Frontend Design System**  | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                 |
| API endpoints               | [docs/API_REFERENCE.md](docs/API_REFERENCE.md)                 |
| Database schema             | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)             |
| Environment variables       | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) |

---

## Project Overview

**Arasul Platform** - Autonomous Edge AI appliance for NVIDIA Jetson AGX Orin.

| Property  | Value                                              |
| --------- | -------------------------------------------------- |
| Hardware  | Jetson AGX Orin (12-Core ARM, 64GB DDR5)           |
| Runtime   | Docker Compose V2 + NVIDIA Container Runtime       |
| Frontend  | React 19 SPA + Vite 6 (`apps/dashboard-frontend/`) |
| Backend   | Node.js/Express (`apps/dashboard-backend/`)        |
| Database  | PostgreSQL 16                                      |
| AI        | Ollama (LLM) + Sentence Transformers (Embeddings)  |
| Vector DB | Qdrant                                             |
| Storage   | MinIO (S3-compatible)                              |
| Services  | 17 Docker containers                               |

---

## Critical Rules

### 1. Always Test Before Commit

```bash
./scripts/test/run-tests.sh --backend
```

### 2. Follow Design System for Frontend

- Primary color: `#45ADFF`, Background: `#101923` / `#1A2330`
- Always use CSS variables (`var(--primary-color)`) - never hardcoded hex in JSX
- See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

### 3. Backend Patterns

- **Always**: `asyncHandler()` wrapper + custom errors from `utils/errors.js`
- **Always**: `useApi()` hook for frontend REST calls
- **Never**: manual try-catch at route level, raw `fetch()` in components
- See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

### 4. Update Documentation

| Change Type      | Update These Files              |
| ---------------- | ------------------------------- |
| New API endpoint | `docs/API_REFERENCE.md`         |
| Database schema  | `docs/DATABASE_SCHEMA.md`       |
| New env variable | `docs/ENVIRONMENT_VARIABLES.md` |
| Bug fix          | `BUGS_AND_FIXES.md`             |

### 5. Git Commit Convention

```
feat|fix|docs|refactor|test|chore: Description
```

---

## Essential Commands

```bash
docker compose up -d                          # Start all services
docker compose logs -f <service-name>         # View logs
docker compose up -d --build <service-name>   # Rebuild service
docker exec -it postgres-db psql -U arasul -d arasul_db  # Database shell
./scripts/test/run-tests.sh --backend         # Run tests
npm run lint:fix                              # Lint code
```

---

## Key Entry Points

| Domain      | Entry Point                           | Pattern Reference                  |
| ----------- | ------------------------------------- | ---------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js` | `routes/index.js` (central router) |
| Frontend    | `apps/dashboard-frontend/src/App.tsx` | `features/chat/ChatRouter.tsx`     |
| Database    | `services/postgres/init/`             | Next: `048_*.sql`                  |
| AI Services | `services/llm-service/api_server.py`  | -                                  |

---

## Quick Debugging

| Problem             | Command                                        |
| ------------------- | ---------------------------------------------- |
| Service won't start | `docker compose logs <service>`                |
| Database issues     | `docker exec postgres-db pg_isready -U arasul` |
| LLM not responding  | `docker compose logs llm-service`              |
| Check all services  | `docker compose ps`                            |

Full debugging guide: [docs/DEVELOPMENT.md#6-debugging-cheatsheet](docs/DEVELOPMENT.md#6-debugging-cheatsheet)

---

## Context Templates

For task-specific context, see `.claude/context/`:

- `base.md` - Project overview
- `backend.md` - Node.js/Express patterns
- `frontend.md` - React component patterns
- `database.md` - PostgreSQL migrations
- `api-endpoint.md` - Adding new endpoints
- `component.md` - Adding React components
