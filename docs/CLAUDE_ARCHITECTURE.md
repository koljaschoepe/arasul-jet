# Claude Architecture Reference

Detailed service architecture for the Arasul Platform.

---

## Complete Service Reference (17 Services)

| #   | Service            | Port      | Technology          | Entry Point           | Purpose                    |
| --- | ------------------ | --------- | ------------------- | --------------------- | -------------------------- |
| 1   | dashboard-frontend | 3000      | React 18            | `src/App.js`          | Web UI                     |
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

## Startup Order (Enforced by depends_on)

```
1. postgres-db, minio              # Storage foundation
2. qdrant                          # Vector DB
3. metrics-collector               # Monitoring
4. llm-service, embedding-service  # AI services
5. document-indexer                # RAG pipeline
6. reverse-proxy (Traefik)         # Routing
7. dashboard-backend               # API
8. dashboard-frontend, n8n         # UI + Workflows
9. telegram-bot                    # Notifications
10. backup-service                 # Automated backups (cron)
11. loki                           # Log aggregation
12. promtail                       # Log collector (depends on loki)
13. cloudflared                    # OAuth tunnel (depends on reverse-proxy, optional)
14. self-healing-agent             # LAST - monitors all
```

---

## Key File Locations

### Backend (Node.js/Express)

```
services/dashboard-backend/
├── src/index.js              # Entry point, Express app setup
├── src/database.js           # PostgreSQL connection pool
├── src/routes/               # 34 route files
├── src/middleware/
│   ├── auth.js               # JWT validation
│   ├── audit.js              # Request logging
│   └── rateLimit.js          # Per-user rate limiting
├── src/services/             # 15 business logic services
└── src/utils/
    ├── logger.js             # Winston logging
    └── jwt.js                # Token utilities
```

### Backend Routes (34 Files)

| Category          | Route File              | Key Endpoints                                 |
| ----------------- | ----------------------- | --------------------------------------------- |
| **Auth**          | auth.js                 | `/api/auth/login`, `/logout`, `/me`           |
| **AI Chat**       | llm.js                  | `/api/llm/chat` (SSE), `/queue`, `/jobs`      |
| **RAG**           | rag.js                  | `/api/rag/query` (SSE)                        |
| **Conversations** | chats.js                | `/api/chats` CRUD                             |
| **Documents**     | documents.js            | `/api/documents/upload`, list, delete         |
| **System**        | metrics.js              | `/api/metrics/live`, `/history`               |
| **Services**      | services.js             | `/api/services/status`, `/restart`            |
| **Settings**      | settings.js             | `/api/settings/password`                      |
| **Alerts**        | alerts.js               | `/api/alerts/settings`, `/thresholds`         |
| **Events**        | events.js               | `/api/events`, `/webhook/*`                   |
| **Telegram**      | telegram.js             | `/api/telegram/config`, `/send`               |
| **Audit**         | audit.js                | `/api/audit/logs`, `/stats/*`                 |
| **Terminal**      | claudeTerminal.js       | `/api/terminal/query`, `/history`             |
| **Spaces**        | spaces.js               | `/api/spaces` CRUD                            |
| **Models**        | models.js               | `/api/models/installed`, `/download`          |
| **Apps**          | appstore.js             | `/api/apps` CRUD, `/config`                   |
| **Database**      | database.js             | `/api/database/health`, `/pool`               |
| **Logs**          | logs.js                 | `/api/logs/list`, `/stream`                   |
| **System Info**   | system.js               | `/api/system/info`, `/network`                |
| **Embeddings**    | embeddings.js           | `/api/embeddings/*` proxy                     |
| **Self-Healing**  | selfhealing.js          | `/api/selfhealing/events`                     |
| **Update**        | update.js               | `/api/update/*`                               |
| **Workflows**     | workflows.js            | `/api/workflows/stats`                        |
| **Workspaces**    | workspaces.js           | `/api/workspaces` CRUD                        |
| **Docs**          | docs.js                 | `/api/docs/`, `/openapi.json`                 |
| **External API**  | externalApi.js          | `/api/external/llm/*`                         |
| **Telegram App**  | telegramApp.js          | `/api/telegram-app/*`                         |
| **Telegram Bots** | telegramBots.js         | `/api/telegram-bots/*` (multi-bot management) |
| **Store**         | store.js                | `/api/store/*`                                |
| **Datentabellen** | datentabellen/index.js  | `/api/v1/datentabellen/*` (parent router)     |
| **Tables**        | datentabellen/tables.js | Table CRUD                                    |
| **Rows**          | datentabellen/rows.js   | Row CRUD + bulk ops                           |
| **Quotes**        | datentabellen/quotes.js | Quote management                              |
| **Health**        | (in index.js)           | `/api/health`                                 |

### Frontend (React 18)

```
services/dashboard-frontend/
├── src/App.js                # Routes, WebSocket, Auth context
├── src/components/
│   ├── ChatMulti.js          # AI Chat with RAG toggle
│   ├── DocumentManager.js    # Document management
│   ├── Settings.js           # Settings tabs container
│   ├── ModelStore.js         # LLM model management
│   ├── AppStore.js           # App marketplace
│   ├── ClaudeTerminal.js     # Claude Code terminal
│   ├── TelegramSettings.js   # Telegram configuration
│   └── ...                   # 15+ more components
├── src/contexts/             # AuthContext, DownloadContext
├── src/hooks/                # Custom hooks
└── src/__tests__/            # Test files
```

### AI Services (Python)

```
services/llm-service/
├── api_server.py             # Flask management API
├── entrypoint.sh             # Ollama + Flask startup
└── healthcheck.sh            # Health check

services/embedding-service/
└── embedding_server.py       # Flask, nomic-embed-text-v1.5

services/document-indexer/
├── indexer.py                # Background loop (30s intervals)
├── api_server.py             # Flask REST API (port 9102)
├── enhanced_indexer.py       # RAG 2.0: batch embedding, deduplication
├── database.py               # DB connection and queries
├── metadata_extractor.py     # File metadata extraction
├── ocr_service.py            # OCR for image-based documents
├── document_parsers.py       # PDF, DOCX, TXT, Markdown
├── text_chunker.py           # 500 char chunks
└── ai_services.py            # Embedding & Qdrant integration
# API endpoints: /health, /status, /statistics, /documents, /documents/:id,
#                /documents/:id/reindex, /documents/:id/similar, /categories, /scan, /search
# RAG 2.0: batch embedding, document deduplication, knowledge space integration
```

### Database Migrations

```
services/postgres/init/
├── 001_init_schema.sql           # metrics, metric_history
├── 002_auth_schema.sql           # admin_users, sessions
├── ...
└── 037_*.sql
# Next migration: 038_*.sql
```

---

## Health Checks Reference

| Service            | Method           | Timeout | Start Period |
| ------------------ | ---------------- | ------- | ------------ |
| postgres-db        | pg_isready       | 2s      | -            |
| minio              | curl /health     | 1s      | -            |
| qdrant             | file check       | 3s      | 10s          |
| llm-service        | bash script      | 5s      | 300s         |
| embedding-service  | bash script      | 3s      | 300s         |
| dashboard-backend  | GET /api/health  | 3s      | 10s          |
| dashboard-frontend | file check       | 1s      | -            |
| n8n                | wget spider      | 2s      | -            |
| metrics-collector  | curl /health     | 1s      | -            |
| self-healing-agent | python heartbeat | 3s      | 10s          |
| telegram-bot       | curl /health     | 3s      | 10s          |

---

## Environment Variables (Critical)

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

# Key settings
LLM_MODEL=qwen3:14b-q8
LLM_KEEP_ALIVE_SECONDS=300
SELF_HEALING_ENABLED=true
```

Full reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)

---

## Self-Healing Configuration

```bash
DISK_WARNING_PERCENT=80
DISK_CLEANUP_PERCENT=90
DISK_CRITICAL_PERCENT=95
CPU_CRITICAL_PERCENT=90
RAM_CRITICAL_PERCENT=90
SELF_HEALING_INTERVAL=10
```

---

## Service Communication

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
