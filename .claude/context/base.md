# Arasul Platform - Base Context

## Platform Overview

Autonomous Edge AI appliance running on NVIDIA Jetson AGX Orin (12-Core ARM Cortex-A78AE, 64GB DDR5, CUDA 12.6). All services run as Docker containers orchestrated by Docker Compose V2 with NVIDIA Container Runtime for GPU workloads.

| Layer      | Technology                             |
| ---------- | -------------------------------------- |
| Frontend   | React 19 SPA + Vite 6 + Tailwind v4    |
| Backend    | Node.js/Express                        |
| Database   | PostgreSQL 16                          |
| LLM        | Ollama (default: qwen3:14b-q8)         |
| Embeddings | Sentence Transformers (BAAI/bge-m3)    |
| Vector DB  | Qdrant                                 |
| Storage    | MinIO (S3-compatible)                  |
| Proxy      | Traefik v2.11                          |
| Workflows  | n8n                                    |
| Monitoring | Metrics Collector + Self-Healing Agent |

## Services

### Core Infrastructure (`compose/compose.core.yaml`)

| Service       | Port(s)     | Responsibility                                |
| ------------- | ----------- | --------------------------------------------- |
| postgres-db   | 5432        | Primary database (arasul_db + arasul_data_db) |
| minio         | 9000 / 9001 | Object storage (API / Console)                |
| reverse-proxy | 80 / 443    | Traefik reverse proxy, TLS termination        |
| docker-proxy  | 2375        | Restricted Docker socket proxy (read/write)   |

### AI Services (`compose/compose.ai.yaml`)

| Service           | Port(s)       | Responsibility                                            |
| ----------------- | ------------- | --------------------------------------------------------- |
| llm-service       | 11434 / 11436 | Ollama LLM inference (11434) + management API             |
| embedding-service | 11435         | BGE-M3 embeddings + FlashRank/BGE reranking               |
| qdrant            | 6333          | Vector database for RAG                                   |
| document-indexer  | 9102          | Automatic document chunking, indexing, OCR, KG extraction |

### Application Layer (`compose/compose.app.yaml`)

| Service            | Port | Responsibility                    |
| ------------------ | ---- | --------------------------------- |
| dashboard-backend  | 3001 | Express API server                |
| dashboard-frontend | 3000 | nginx serving Vite-built SPA      |
| n8n                | 5678 | Visual workflow automation engine |

### Monitoring & Operations (`compose/compose.monitoring.yaml`)

| Service            | Port | Responsibility                                     |
| ------------------ | ---- | -------------------------------------------------- |
| metrics-collector  | 9100 | System metrics (CPU/RAM/GPU/disk/temp) to Postgres |
| self-healing-agent | 9200 | Autonomous service recovery, disk cleanup          |
| backup-service     | -    | Scheduled PostgreSQL + MinIO backups               |
| loki               | 3100 | Log aggregation (optional, profile: monitoring)    |
| promtail           | 9080 | Log collection (optional, profile: monitoring)     |

### External Access (`compose/compose.external.yaml`)

| Service     | Port | Responsibility                                |
| ----------- | ---- | --------------------------------------------- |
| cloudflared | -    | Cloudflare Tunnel (optional, profile: tunnel) |

## Startup Order (7 Layers)

1. **postgres-db, minio** -- data stores, healthchecked
2. **qdrant, llm-service, embedding-service** -- AI services (GPU), depend on postgres
3. **metrics-collector** -- system metrics, depends on postgres
4. **reverse-proxy** -- depends on postgres + minio healthy
5. **dashboard-backend, dashboard-frontend, n8n** -- app layer, depends on postgres + minio + docker-proxy
6. **document-indexer** -- depends on all AI services + minio healthy
7. **self-healing-agent, backup-service** -- depends on postgres + metrics-collector
8. **(optional) loki, promtail, cloudflared** -- profile-gated

## Docker Networks

| Network           | Subnet          | Purpose                   |
| ----------------- | --------------- | ------------------------- |
| arasul-frontend   | 172.30.0.0/26   | Frontend + proxy          |
| arasul-backend    | 172.30.0.64/26  | All backend services      |
| arasul-monitoring | 172.30.0.128/26 | Metrics, healing, logging |

dashboard-backend bridges all three networks.

## Data Flows

### Chat Flow

User -> frontend -> backend `/api/chat` -> llm-service (Ollama) -> SSE stream -> frontend

### RAG Flow

User query -> backend -> embedding-service (query vector) -> qdrant (similarity search) -> document_chunks context -> llm-service (generation with context) -> SSE stream -> frontend

### Document Indexing Flow

Upload -> backend -> MinIO storage -> document-indexer polls -> OCR/parse -> embedding-service (chunk vectors) -> qdrant (store vectors) -> postgres (metadata, chunks, KG entities)

## Directory Structure

```
apps/
  dashboard-backend/     # Express API (src/index.js, routes/, services/, middleware/)
  dashboard-frontend/    # React 19 SPA (src/App.tsx, features/, components/, hooks/)
services/
  postgres/init/         # SQL migrations (000-082, next: 083)
  llm-service/           # Ollama wrapper with health/management API
  embedding-service/     # BGE-M3 embeddings + reranking
  document-indexer/      # Python document processing pipeline
  metrics-collector/     # System metrics collector
  self-healing-agent/    # Autonomous recovery engine
  backup-service/        # Scheduled backup scripts
  n8n/                   # Workflow engine custom config
compose/                 # 6 Docker Compose files (core, ai, app, monitoring, external, secrets)
config/                  # Traefik, PostgreSQL, Loki, Promtail configs
scripts/
  setup/                 # Hardware detection, Tailscale setup
  deploy/                # Factory image, USB install
  backup/                # Backup scripts
  recovery/              # Disaster recovery
  test/                  # Test runner scripts
  security/              # Security audit scripts
  system/                # System maintenance scripts
  util/                  # Utility scripts (auto-restart, etc.)
  validate/              # Validation scripts
docs/                    # Architecture, API, Database, Design System docs
data/                    # Runtime data (models, backups, updates, appstore)
tests/                   # E2E and integration tests
```

## Critical Rules

1. **Design System**: Primary `#45ADFF`, Background `#101923`/`#1A2330`. Always use CSS variables (`var(--primary-color)`), never hardcoded hex in JSX.
2. **Testing**: Run `./scripts/test/run-tests.sh --backend` before commits.
3. **Backend**: Always use `asyncHandler()` wrapper + custom errors from `utils/errors.js`. Never try-catch at route level.
4. **Frontend**: Always use `useApi()` hook for REST calls. Never raw `fetch()` or `axios`.
5. **Migrations**: Always `IF NOT EXISTS` / `ON CONFLICT` for idempotency.
6. **Docs**: Update `API_REFERENCE.md`, `DATABASE_SCHEMA.md`, or `ENVIRONMENT_VARIABLES.md` when changing their respective domains.
7. **Commits**: `feat|fix|docs|refactor|test|chore: Description`

## Key Entry Points

| Domain      | File                                         |
| ----------- | -------------------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js`        |
| Router      | `apps/dashboard-backend/src/routes/index.js` |
| Frontend    | `apps/dashboard-frontend/src/App.tsx`        |
| Database    | `services/postgres/init/*.sql`               |
| LLM Service | `services/llm-service/api_server.py`         |
| Bootstrap   | `./arasul` (CLI entry point)                 |
| Setup       | `scripts/interactive_setup.sh`               |
