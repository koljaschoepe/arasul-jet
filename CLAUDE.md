# CLAUDE.md

Instructions for Claude Code working in the Arasul Platform repository.

---

## Quick Navigation

| Looking for...              | Go to...                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| All documentation           | [docs/INDEX.md](docs/INDEX.md)                                                 |
| **Architecture & Services** | [docs/CLAUDE_ARCHITECTURE.md](docs/CLAUDE_ARCHITECTURE.md)                     |
| **Development Workflows**   | [docs/CLAUDE_DEVELOPMENT.md](docs/CLAUDE_DEVELOPMENT.md)                       |
| **Frontend Design System**  | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                                 |
| API endpoints               | [docs/API_REFERENCE.md](docs/API_REFERENCE.md)                                 |
| Database schema             | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)                             |
| Environment variables       | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)                 |
| Error Handling Pattern      | `asyncHandler()` + custom errors in `utils/errors.js`                          |

---

## Project Overview

**Arasul Platform** - Autonomous Edge AI appliance for NVIDIA Jetson AGX Orin.

| Property  | Value                                             |
| --------- | ------------------------------------------------- |
| Hardware  | Jetson AGX Orin (12-Core ARM, 64GB DDR5)          |
| Runtime   | Docker Compose V2 + NVIDIA Container Runtime      |
| Frontend  | React 18 SPA                                      |
| Backend   | Node.js/Express                                   |
| Database  | PostgreSQL 16                                     |
| AI        | Ollama (LLM) + Sentence Transformers (Embeddings) |
| Vector DB | Qdrant                                            |
| Storage   | MinIO (S3-compatible)                             |
| Services  | 15 Docker containers                              |

---

## Critical Rules

### 1. Always Test Before Commit

```bash
./scripts/run-tests.sh --backend
```

### 2. Follow Design System for Frontend

- Primary color: `#45ADFF`
- Background: `#101923` / `#1A2330`
- See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

### 3. Update Documentation

| Change Type      | Update These Files              |
| ---------------- | ------------------------------- |
| New API endpoint | `docs/API_REFERENCE.md`         |
| Database schema  | `docs/DATABASE_SCHEMA.md`       |
| New env variable | `docs/ENVIRONMENT_VARIABLES.md` |
| Bug fix          | `BUGS_AND_FIXES.md`             |

### 4. Git Commit Convention

```
feat: Add new feature
fix: Bug fix
docs: Documentation only
refactor: Code restructure
test: Add/update tests
chore: Maintenance tasks
```

---

## Essential Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f <service-name>

# Rebuild service
docker compose up -d --build <service-name>

# Database shell
docker exec -it postgres-db psql -U arasul -d arasul_db

# Run tests
./scripts/run-tests.sh --backend

# Lint code
npm run lint
npm run lint:fix
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER LAYER                              │
│  FRONTEND (3000) ──── TRAEFIK (80/443) ──── TELEGRAM-BOT (8090)│
├─────────────────────────────────────────────────────────────────┤
│                       APPLICATION LAYER                         │
│  BACKEND (3001) ─────── n8n (5678) ─────── DOCUMENT-INDEXER    │
├─────────────────────────────────────────────────────────────────┤
│                          AI LAYER                               │
│  LLM-SERVICE (11434) ── EMBEDDING (11435) ── QDRANT (6333)     │
├─────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE LAYER                       │
│  POSTGRES (5432) ── MINIO (9000) ── METRICS (9100)             │
│       SELF-HEALING-AGENT (9200) ── BACKUP-SERVICE              │
├─────────────────────────────────────────────────────────────────┤
│                      MONITORING LAYER                           │
│  LOKI (3100) ─────────── PROMTAIL (9080)                       │
├─────────────────────────────────────────────────────────────────┤
│                      EXTERNAL ACCESS LAYER                      │
│  CLOUDFLARED ───── (OAuth Tunnel to Cloudflare Edge)           │
└─────────────────────────────────────────────────────────────────┘
```

**Full service details:** [docs/CLAUDE_ARCHITECTURE.md](docs/CLAUDE_ARCHITECTURE.md)

---

## Key Entry Points

| Domain      | Entry Point                               | Pattern Reference         |
| ----------- | ----------------------------------------- | ------------------------- |
| Backend API | `services/dashboard-backend/src/index.js` | `routes/auth.js`          |
| Frontend    | `services/dashboard-frontend/src/App.js`  | `components/ChatMulti.js` |
| Database    | `services/postgres/init/`                 | Next: `036_*.sql`         |
| AI Services | `services/llm-service/api_server.py`      | -                         |

---

## Quick Debugging

| Problem             | Command                                        |
| ------------------- | ---------------------------------------------- |
| Service won't start | `docker compose logs <service>`                |
| Database issues     | `docker exec postgres-db pg_isready -U arasul` |
| LLM not responding  | `docker compose logs llm-service`              |
| Check all services  | `docker compose ps`                            |

**Full debugging guide:** [docs/CLAUDE_DEVELOPMENT.md#debugging](docs/CLAUDE_DEVELOPMENT.md#debugging-cheatsheet)

---

## Context Templates

For task-specific context, see `.claude/context/`:

- `base.md` - Project overview
- `backend.md` - Node.js/Express patterns
- `frontend.md` - React component patterns
- `database.md` - PostgreSQL migrations
- `api-endpoint.md` - Adding new endpoints
- `component.md` - Adding React components

---

## References

- [docs/CLAUDE_ARCHITECTURE.md](docs/CLAUDE_ARCHITECTURE.md) - Services, ports, startup order
- [docs/CLAUDE_DEVELOPMENT.md](docs/CLAUDE_DEVELOPMENT.md) - Workflows, API reference, debugging
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) - **Frontend Design Guidelines (MANDATORY)**
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - API documentation
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) - Database schema
- [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md) - Historical bugs & solutions
