# Architecture

Complete architecture overview of the Arasul Platform.

---

## 1. Service Overview (17 Services)

| #   | Service            | Port      | Technology          | Entry Point           | Purpose                    |
| --- | ------------------ | --------- | ------------------- | --------------------- | -------------------------- |
| 1   | dashboard-frontend | 3000      | React 19            | `src/App.tsx`         | Web UI                     |
| 2   | dashboard-backend  | 3001      | Node.js/Express     | `src/index.js`        | REST API + SSE + WebSocket |
| 3   | postgres-db        | 5432      | PostgreSQL 16       | `init/*.sql`          | Relational database        |
| 4   | llm-service        | 11434     | Ollama + Flask      | `api_server.py`       | LLM inference              |
| 5   | embedding-service  | 11435     | Flask               | `embedding_server.py` | Text vectorization         |
| 6   | document-indexer   | 9102      | Flask               | `api_server.py`       | RAG document processing    |
| 7   | qdrant             | 6333      | Qdrant              | -                     | Vector database            |
| 8   | minio              | 9000/9001 | MinIO               | -                     | S3-compatible storage      |
| 9   | metrics-collector  | 9100      | aiohttp             | `collector.py`        | System metrics             |
| 10  | self-healing-agent | 9200      | Python              | `healing_engine.py`   | Autonomous recovery        |
| 11  | telegram-bot       | 8090      | python-telegram-bot | `bot.py`              | Notifications & commands   |
| 12  | n8n                | 5678      | n8n                 | -                     | Workflow automation        |
| 13  | reverse-proxy      | 80/443    | Traefik             | `routes.yml`          | Reverse proxy + SSL        |
| 14  | backup-service     | -         | Alpine + cron       | `backup.sh`           | Automated backups          |
| 15  | loki               | 3100      | Grafana Loki        | -                     | Log aggregation            |
| 16  | promtail           | 9080      | Grafana Promtail    | -                     | Log collector              |
| 17  | cloudflared        | -         | Cloudflare Tunnel   | -                     | OAuth & webhook gateway    |

---

## 2. System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION INTERFACE                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │    Frontend     │  │     Backend     │  │     n8n         │  │
│  │   (React SPA)   │  │  (Express API)  │  │  (Workflows)    │  │
│  │   Port: 3000    │  │   Port: 3001    │  │   Port: 5678    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         AI SERVICES                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   LLM Service   │  │   Embedding     │  │    Qdrant       │  │
│  │   (Ollama)      │  │   Service       │  │  (Vector DB)    │  │
│  │   Port: 11434   │  │   Port: 11435   │  │  Port: 6333     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐                                            │
│  │    Document     │                                            │
│  │    Indexer      │                                            │
│  │   Port: 9102    │                                            │
│  └─────────────────┘                                            │
├─────────────────────────────────────────────────────────────────┤
│                       SYSTEM SERVICES                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   PostgreSQL    │  │     MinIO       │  │    Metrics      │  │
│  │   (Database)    │  │  (Object Store) │  │   Collector     │  │
│  │   Port: 5432    │  │  Port: 9000/01  │  │   Port: 9100    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Reverse Proxy  │  │  Self-Healing   │  │  Telegram Bot   │  │
│  │   (Traefik)     │  │     Agent       │  │  (Notifications)│  │
│  │  Port: 80/443   │  │   Port: 9200    │  │   Port: 8090    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        CORE RUNTIME                              │
│     Docker Engine  │  Docker Compose  │  NVIDIA Container RT    │
├─────────────────────────────────────────────────────────────────┤
│                       HARDWARE LAYER                             │
│     NVIDIA Jetson AGX Orin  │  JetPack 6+  │  NVMe Storage      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Network Topology

```
                         ┌─────────────────┐
                         │    Internet     │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │  Reverse Proxy  │
                         │    (Traefik)    │
                         │   Port 80/443   │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        │           arasul-net (172.30.0.0/24)              │
        │                         │                         │
   ┌────▼────┐              ┌─────▼─────┐            ┌──────▼─────┐
   │Frontend │              │  Backend  │            │    n8n     │
   │ :3000   │─────────────▶│  :3001    │            │  :5678     │
   └─────────┘   REST/WS    └─────┬─────┘            └────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────▼─────┐          ┌──────▼──────┐        ┌───────▼──────┐
    │ PostgreSQL│          │ LLM Service │        │   MinIO      │
    │  :5432    │          │  :11434     │        │  :9000/9001  │
    └───────────┘          └─────────────┘        └──────────────┘
          │                       │
    ┌─────▼─────┐          ┌──────▼──────┐        ┌──────────────┐
    │ Metrics   │          │  Embedding  │        │   Qdrant     │
    │ :9100     │          │  :11435     │        │  :6333/6334  │
    └───────────┘          └─────────────┘        └──────────────┘
          │
    ┌─────▼─────┐          ┌─────────────┐
    │Self-Heal  │          │   Document  │
    │ :9200     │          │   Indexer   │
    └───────────┘          │   :9102     │
                           └─────────────┘
```

---

## 4. Port Mapping

| Service            | Internal Port | External Port        | Protocol   |
| ------------------ | ------------- | -------------------- | ---------- |
| reverse-proxy      | 80, 443       | 80, 443              | HTTP/HTTPS |
| dashboard-frontend | 3000          | 8080 (via proxy)     | HTTP       |
| dashboard-backend  | 3001          | 8080/api (via proxy) | HTTP/WS    |
| postgres-db        | 5432          | -                    | TCP        |
| minio              | 9000, 9001    | 9001                 | HTTP       |
| qdrant             | 6333, 6334    | 6333, 6334           | HTTP/gRPC  |
| llm-service        | 11434, 11436  | -                    | HTTP       |
| embedding-service  | 11435         | -                    | HTTP       |
| document-indexer   | 9102          | -                    | HTTP       |
| metrics-collector  | 9100          | -                    | HTTP       |
| self-healing-agent | 9200          | -                    | HTTP       |
| n8n                | 5678          | 5678                 | HTTP       |
| telegram-bot       | 8090          | -                    | HTTP       |

---

## 5. Startup Order

Critical dependency chain (enforced via Docker Compose `depends_on` with `condition: service_healthy`):

### Tier 1: Foundation Services (No Dependencies)

- **PostgreSQL** (5432) - Primary database
- **MinIO** (9000/9001) - Object storage

### Tier 2: Metrics Layer

- **metrics-collector** (9100) - Depends on: postgres-db

### Tier 3: AI Services Layer

- **llm-service** (11434) - Depends on: postgres-db. Requires GPU (NVIDIA runtime)
- **embedding-service** (11435) - Depends on: postgres-db. Requires GPU (NVIDIA runtime)
- **qdrant** (6333) - Vector database

### Tier 4: Application Services Layer

- **dashboard-backend** (3001) - Depends on: postgres-db, minio, metrics-collector, llm-service, embedding-service
- **dashboard-frontend** (3000) - No dependencies (static files served by Nginx)
- **document-indexer** (9102) - RAG pipeline

### Tier 5: Workflow & Routing

- **n8n** (5678) - Depends on: postgres-db, llm-service, embedding-service, minio
- **reverse-proxy** (80/443) - Starts after all application services are healthy

### Tier 6: Auxiliary Services

- **telegram-bot** (8090) - Notifications
- **backup-service** - Automated backups (cron)
- **loki** (3100) - Log aggregation
- **promtail** (9080) - Log collector (depends on loki)
- **cloudflared** - OAuth tunnel (depends on reverse-proxy, optional)

### Tier 7: Self-Healing (LAST)

- **self-healing-agent** (9200) - Starts LAST to monitor all other services

**Total bootstrap time**: ~2-3 minutes for full system startup.

---

## 6. Data Flows

### Chat Request Flow

```
User → Frontend → Backend → LLM Service → Backend → Frontend → User
          │                      │
          │                      └── PostgreSQL (store message)
          │
          └── WebSocket (metrics stream)
```

### RAG Query Flow

```
User Query
     │
     ▼
┌─────────┐    embed    ┌───────────┐   search   ┌────────┐
│ Backend │ ──────────▶ │ Embedding │ ─────────▶ │ Qdrant │
└────┬────┘             │  Service  │            └────┬───┘
     │                  └───────────┘                 │
     │◀────────────── relevant chunks ────────────────┘
     │
     │  context + query
     ▼
┌─────────┐
│   LLM   │ ──────────▶ Response with sources
│ Service │
└─────────┘
```

### Document Indexing Flow

```
Upload Document
      │
      ▼
┌─────────┐    store    ┌────────┐
│ Backend │ ──────────▶ │ MinIO  │
└─────────┘             └────┬───┘
                             │
                             │ scan (30s)
                             ▼
                     ┌───────────────┐
                     │   Document    │
                     │   Indexer     │
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         Parse Doc      Chunk Text     Embed Chunks
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │    Qdrant     │ (store vectors)
                     └───────────────┘
```

### Service Communication

```
Frontend ──HTTP──> Traefik ──HTTP──> Backend
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              LLM-Service      Embedding-Service       Qdrant
              (11434)          (11435)                 (6333)
                    │                  │                  │
                    └──────────────────┴──────────────────┘
                                       │
                              Document-Indexer
                                   (9102)
```

---

## 7. Key File Locations

### Backend (Node.js/Express)

```
apps/dashboard-backend/
├── src/index.js              # Entry point, Express app setup
├── src/database.js           # PostgreSQL connection pool
├── src/routes/
│   ├── index.js              # Central router (mounts all routes)
│   ├── auth.js               # /api/auth/login, /logout, /me
│   ├── llm.js                # /api/llm/chat (SSE), /queue, /jobs
│   ├── rag.js                # /api/rag/query (SSE)
│   ├── chats.js              # /api/chats CRUD
│   ├── documents.js          # /api/documents/upload, list, delete
│   ├── telegram/             # settings, app, bots
│   ├── system/               # system, services, metrics, logs, database
│   ├── admin/                # settings, audit, update, selfhealing
│   ├── ai/                   # models, embeddings, memory, spaces
│   ├── store/                # appstore, store, workflows, workspaces
│   ├── external/             # externalApi, claudeTerminal, events, alerts
│   └── datentabellen/        # tables, rows, quotes
├── src/middleware/
│   ├── auth.js               # JWT validation
│   ├── audit.js              # Request logging
│   ├── errorHandler.js       # asyncHandler + error middleware
│   └── rateLimit.js          # Per-user rate limiting
├── src/services/             # Business logic (telegram/, llm/, context/, core/, memory/, app/)
└── src/utils/
    ├── errors.js             # Custom error classes
    ├── logger.js             # Winston logging
    └── jwt.js                # Token utilities
```

### Frontend (React 19)

```
apps/dashboard-frontend/
├── src/App.tsx               # Routes, WebSocket, Auth context
├── src/features/             # Feature modules with barrel exports (index.ts)
│   ├── chat/                 # ChatRouter, ChatLanding, ChatView
│   ├── documents/            # DocumentManager, SpaceModal, Badges
│   ├── telegram/             # TelegramAppModal, BotSetupWizard
│   ├── settings/             # Settings, GeneralSettings, AIProfileSettings
│   ├── store/                # Store, StoreHome, StoreApps, StoreModels
│   ├── datentabellen/        # ExcelEditor
│   ├── claude/               # ClaudeCode, ClaudeTerminal
│   ├── system/               # SetupWizard, UpdatePage, Login
│   └── database/             # DatabaseOverview, DatabaseTable
├── src/components/
│   ├── ui/                   # Modal, Skeleton, LoadingSpinner, EmptyState
│   └── editor/               # MarkdownEditor, MermaidDiagram, GridEditor/
├── src/contexts/             # AuthContext, DownloadContext, ToastContext
├── src/hooks/                # useApi, useConfirm, useTokenBatching
└── src/__tests__/            # Test files
```

### AI Services (Python)

```
services/llm-service/
├── api_server.py             # Flask management API
├── entrypoint.sh             # Ollama + Flask startup
└── healthcheck.sh            # Health check

services/embedding-service/
└── embedding_server.py       # Flask, BAAI/bge-m3 (1024d)

services/document-indexer/
├── indexer.py                # Background loop (30s intervals)
├── api_server.py             # Flask REST API (port 9102)
├── enhanced_indexer.py       # RAG 2.0: batch embedding, deduplication
└── ...                       # parsers, chunker, OCR, metadata
```

### Database Migrations

```
services/postgres/init/
├── 001_init_schema.sql       # metrics, metric_history
├── 002_auth_schema.sql       # admin_users, sessions
├── ...
└── 049_*.sql
# Next migration: 050_*.sql
```

---

## 8. Resource Allocation

### CPU Limits

| Service           | Max CPU |
| ----------------- | ------- |
| LLM Service       | 50%     |
| Embedding Service | 30%     |
| Dashboard Backend | 5%      |
| Others            | Default |

### Memory Allocation

| Service           | RAM           |
| ----------------- | ------------- |
| LLM Service       | 32 GB (fixed) |
| Embedding Service | 8 GB (fixed)  |
| PostgreSQL        | 8 GB (max)    |
| n8n               | 2 GB (max)    |
| MinIO             | 4 GB (max)    |
| Others            | Default       |

### GPU Requirements

| Service           | GPU      | Memory     |
| ----------------- | -------- | ---------- |
| LLM Service       | Required | ~40 GB max |
| Embedding Service | Required | ~2 GB      |
| Others            | None     | -          |

---

## 9. Health Checks

| Service            | Health Check Command                              | Interval | Timeout | Retries | Start Period |
| ------------------ | ------------------------------------------------- | -------- | ------- | ------- | ------------ |
| postgres-db        | `pg_isready -U $USER -d $DB`                      | 10s      | 2s      | 3       | -            |
| minio              | `curl -f http://localhost:9000/minio/health/live` | 10s      | 1s      | 3       | -            |
| qdrant             | file check                                        | 10s      | 3s      | 3       | 10s          |
| metrics-collector  | `curl -f http://localhost:9100/health`            | 10s      | 1s      | 3       | -            |
| llm-service        | Custom script (model test)                        | 30s      | 5s      | 3       | 300s         |
| embedding-service  | Custom script (vectorization test)                | 15s      | 3s      | 3       | 300s         |
| dashboard-backend  | `curl -f http://localhost:3001/api/health`        | 10s      | 3s      | 3       | 10s          |
| dashboard-frontend | `test -f /usr/share/nginx/html/index.html`        | 10s      | 1s      | 3       | -            |
| n8n                | `wget --spider -q http://localhost:5678/healthz`  | 15s      | 2s      | 3       | -            |
| reverse-proxy      | `wget -q --spider http://localhost:8080/ping`     | 10s      | 3s      | 3       | 30s          |
| self-healing-agent | `python3 /app/heartbeat.py --test`                | 30s      | 3s      | 3       | 10s          |
| telegram-bot       | `curl -f http://localhost:8090/health`            | 30s      | 3s      | 3       | 10s          |

### Validation

```bash
./scripts/validate/validate_dependencies.sh
```

---

## 10. Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      External Network                        │
│                                                             │
│  Exposed Ports: 80, 443, 5678, 9001, 6333, 6334            │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Reverse Proxy  │
                    │   (Traefik)     │
                    │                 │
                    │  - TLS termination
                    │  - Rate limiting │
                    │  - CORS policy  │
                    └────────┬────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Internal Network                          │
│                  (172.30.0.0/24)                            │
│                                                             │
│  - JWT authentication (24h expiry)                          │
│  - Account lockout (5 attempts, 15 min)                     │
│  - Password requirements (8+ chars, complexity)             │
│  - Rate limiting per user                                   │
│  - All services isolated                                    │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variables (Critical)

```bash
# Required secrets
ADMIN_PASSWORD=<secure>
JWT_SECRET=<32+ chars>
POSTGRES_PASSWORD=<secure>
MINIO_ROOT_USER=<key>
MINIO_ROOT_PASSWORD=<secure>
N8N_ENCRYPTION_KEY=<32+ chars>

# Telegram Bot
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_ALLOWED_CHAT_IDS=<comma-separated>
```

Full reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)

---

## Related Documentation

- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database structure
- [API_REFERENCE.md](API_REFERENCE.md) - API endpoints
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment & installation
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
