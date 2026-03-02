# Getting Started

Quick onboarding guide for developers working on the Arasul Platform.

---

## Prerequisites

- **Docker** 24.0+ with Docker Compose V2
- **Node.js** 18+ (via nvm recommended)
- **Git**
- **NVIDIA Container Runtime** (for GPU services)

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url> arasul-platform
cd arasul-platform

# 2. Configure environment
cp .env.template .env
# Edit .env with your credentials

# 3. Start all services
docker compose up -d

# 4. Verify
docker compose ps          # All services should be healthy
curl http://localhost/api/health
```

Dashboard: `http://localhost` | n8n: `http://localhost/n8n` | MinIO: `http://localhost:9001`

---

## Project Structure

```
arasul-platform/
├── apps/                          # Actively developed applications
│   ├── dashboard-backend/         #   Node.js/Express REST API
│   │   └── src/
│   │       ├── routes/            #     API routes (central router: routes/index.js)
│   │       ├── services/          #     Business logic
│   │       └── middleware/        #     Auth, error handling, rate limiting
│   └── dashboard-frontend/        #   React 18 SPA
│       └── src/
│           ├── features/          #     Feature modules (chat, documents, settings, ...)
│           ├── components/        #     Shared UI components
│           └── hooks/             #     Custom hooks (useApi, useConfirm, ...)
├── services/                      # Infrastructure services (Docker)
│   ├── llm-service/               #   Ollama LLM (Python/Flask)
│   ├── embedding-service/         #   Text vectorization (Python/Flask)
│   ├── document-indexer/          #   RAG document processing
│   ├── postgres/init/             #   Database migrations (001-041)
│   └── ...                        #   metrics-collector, self-healing, telegram-bot
├── packages/shared/               # Shared constants, validation, formatting
├── compose/                       # Docker Compose split files
├── config/                        # Traefik, TLS, secrets
├── scripts/                       # Categorized scripts (setup, test, deploy, ...)
├── docs/                          # Documentation
├── CLAUDE.md                      # Claude Code instructions
└── docker-compose.yml             # Main compose file (includes compose/)
```

**Key distinction**: `apps/` = code you actively develop, `services/` = infrastructure containers.

---

## First Change Walkthrough

### Backend: Add an API endpoint

1. Create route in `apps/dashboard-backend/src/routes/myroute.js`
2. Register in `src/routes/index.js`
3. Use `asyncHandler` + custom error classes (see [DEVELOPMENT.md](DEVELOPMENT.md#2-backend-patterns))
4. Run tests: `./scripts/test/run-tests.sh --backend`

### Frontend: Add a component

1. Create in `apps/dashboard-frontend/src/features/<feature>/`
2. Export from barrel file (`index.js`)
3. Use `useApi()` for API calls, CSS variables for styling
4. Follow [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

### Database: Add a migration

1. Create `services/postgres/init/042_description.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Rebuild: `docker compose up -d --build postgres-db`

---

## Essential Commands

```bash
# Services
docker compose up -d                    # Start all
docker compose logs -f <service>        # View logs
docker compose up -d --build <service>  # Rebuild

# Development
./scripts/test/run-tests.sh --backend   # Run tests
npm run lint:fix                        # Fix lint issues

# Database
docker exec -it postgres-db psql -U arasul -d arasul_db
```

---

## Key Documentation

| Topic                   | Document                                             |
| ----------------------- | ---------------------------------------------------- |
| Architecture & services | [ARCHITECTURE.md](ARCHITECTURE.md)                   |
| Development patterns    | [DEVELOPMENT.md](DEVELOPMENT.md)                     |
| Frontend design system  | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                 |
| API endpoints           | [API_REFERENCE.md](API_REFERENCE.md)                 |
| Database schema         | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)             |
| Environment variables   | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| All documentation       | [INDEX.md](INDEX.md)                                 |
