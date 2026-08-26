# Architecture

Complete architecture overview of the Arasul Platform. **This is the single
canonical architecture document** — the compact topology diagrams in `README.md`
and `CLAUDE.md` are simplified mirrors. When the architecture changes, update
this file first.

## Design priorities (in order)

1. **Reliability.** Self-healing, no external dependencies, multi-year unattended uptime.
2. **Data privacy.** Everything runs locally. No cloud calls during normal operation.
3. **Ergonomics.** Dashboard UX is for non-technical operators and end-users.

Concretely: no SaaS integrations baked into the platform, no silent failures,
migrations always backward-compatible, no rewrites — only incremental change.

---

## 1. Service Overview (17 Services)

12 laufende Dienste + 2 im Profil `classic-rag` + 3 optionale. Die Workspaces
(Container, Netzwerkmodi, Wissensraum) laufen im dashboard-backend (kein
separater Container).

**Qdrant gibt es nicht mehr.** Plan 021, Schritt 8 hatte das klassische
Vektor-RAG durch agentisches ersetzt; am 24.08.2026 ist der Dienst samt Code
ausgebaut worden, weil drei Features still durchfielen, statt ihren Ausfall zu
melden (Migration `162_qdrant_ausbau.sql` nennt die Zahlen). Gesucht wird über
den Textlayer in `document_chunks` und die Werkzeuge des Agenten.

`embedding-service` (5) läuft dagegen ohne Profil mit: die OpenAI-kompatible
`/v1/embeddings`, das Wissensraum-Routing und die Einstellungsseite brauchen
ihn.

| #   | Service            | Port      | Technology          | Entry Point           | Purpose                            |
| --- | ------------------ | --------- | ------------------- | --------------------- | ---------------------------------- |
| 1   | dashboard-frontend | 3000      | React 19            | `src/App.tsx`         | Web UI                             |
| 2   | dashboard-backend  | 3001      | Node.js/Express     | `src/index.js`        | REST API + SSE + WebSocket         |
| 3   | postgres-db        | 5432      | PostgreSQL 16       | `init/*.sql`          | Relational database                |
| 4   | llm-service        | 11434     | Ollama + Flask      | `api_server.py`       | LLM inference                      |
| 5   | embedding-service  | 11435     | Flask               | `embedding_server.py` | Text vectorization                 |
| 6   | document-indexer   | 9102      | Flask               | `api_server.py`       | RAG document processing            |
| 8   | minio              | 9000/9001 | MinIO               | -                     | S3-compatible storage              |
| 9   | metrics-collector  | 9100      | aiohttp             | `collector.py`        | System metrics                     |
| 10  | self-healing-agent | 9200      | Python              | `healing_engine.py`   | Autonomous recovery                |
| 11  | docker-proxy       | -         | Docker Socket Proxy | -                     | Secure Docker API access           |
| 12  | n8n                | 5678      | n8n                 | -                     | Workflow automation                |
| 13  | reverse-proxy      | 80/443    | Traefik             | `routes.yml`          | Reverse proxy + SSL                |
| 14  | backup-service     | -         | Alpine + cron       | `backup.sh`           | Automated backups                  |
| 15  | loki               | 3100      | Grafana Loki        | -                     | Log aggregation (optional)         |
| 16  | promtail           | 9080      | Grafana Promtail    | -                     | Log collector (optional)           |
| 17  | cloudflared        | -         | Cloudflare Tunnel   | -                     | OAuth & webhook gateway (optional) |

### Host-Level Services

| Service   | Technology    | Purpose                     | Config                             |
| --------- | ------------- | --------------------------- | ---------------------------------- |
| Tailscale | WireGuard VPN | Secure remote access (mesh) | `scripts/setup/setup-tailscale.sh` |

Tailscale runs directly on the host (not in Docker) to provide VPN access to all services.
Managed via Dashboard UI (Einstellungen > Fernzugriff) and backend API (`/api/tailscale/*`).

**Access model:** LAN-only is the delivery default; remote is an opt-in via
Tailscale. One name per context, never a raw IP — in the LAN
`https://<hostname>.local`, remotely `https://<device>.<tailnet>.ts.net` with a
browser-trusted cert served by `tailscale serve` → Traefik:443.

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
│  │   LLM Service   │  │   Embedding     │  │    SearXNG      │  │
│  │   (Ollama)      │  │   Service       │  │  (Websuche)     │  │
│  │   Port: 11434   │  │   Port: 11435   │  │  Port: 8080     │  │
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
│  │  Reverse Proxy  │  │  Self-Healing   │  │  Docker Proxy   │  │
│  │   (Traefik)     │  │     Agent       │  │ (Socket Proxy)  │  │
│  │  Port: 80/443   │  │   Port: 9200    │  │  Port: 2375     │  │
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
    │ Metrics   │          │  Embedding  │        │   SearXNG    │
    │ :9100     │          │  :11435     │        │  :8080       │
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
| llm-service        | 11434, 11436  | -                    | HTTP       |
| embedding-service  | 11435         | -                    | HTTP       |
| document-indexer   | 9102          | -                    | HTTP       |
| metrics-collector  | 9100          | -                    | HTTP       |
| self-healing-agent | 9200          | -                    | HTTP       |
| docker-proxy       | 2375          | -                    | TCP        |
| n8n                | 5678          | 5678                 | HTTP       |

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
- **embedding-service** (11435) - Profil `classic-rag`, laeuft NICHT von selbst

### Tier 4: Application Services Layer

- **dashboard-backend** (3001) - Depends on: postgres-db, minio, metrics-collector, llm-service
  (embedding-service nur mit Profil `classic-rag`)
- **dashboard-frontend** (3000) - No dependencies (static files served by Nginx)
- **document-indexer** (9102) - RAG pipeline

### Tier 5: Workflow & Routing

- **n8n** (5678) - Depends on: postgres-db, llm-service, minio
- **reverse-proxy** (80/443) - Starts after all application services are healthy

### Tier 6: Auxiliary Services

- **backup-service** - Automated backups (cron)
- **docker-proxy** - Secure Docker socket access (for self-healing, metrics)
- **loki** (3100) - Log aggregation (optional)
- **promtail** (9080) - Log collector (depends on loki, optional)
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
┌─────────┐   grep / Symbolsuche / Datei   ┌──────────────────┐
│  Agent  │ ─────────────────────────────▶ │  document_chunks │
└────┬────┘                                │   (PostgreSQL)   │
     │                                     └────────┬─────────┘
     │◀──────────── passende Abschnitte ────────────┘
     │
     │  Zusammenhang + Frage
     ▼
┌─────────┐
│   LLM   │ ──────────▶ Antwort mit Fundstellen
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
         Parse Doc      Chunk Text     Kontext bilden
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                     ┌────────────────────┐
                     │  document_chunks   │ (Textlayer)
                     │  document_parent_… │
                     └────────────────────┘
```

### Service Communication

```
Frontend ──HTTP──> Traefik ──HTTP──> Backend
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              LLM-Service      Embedding-Service       SearXNG
              (11434)          (11435)                 (8080)
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
│   ├── sandbox.js            # /api/sandbox/projects (workspaces, Claude-Login)
│   ├── system/               # system, services, metrics, logs, database
│   ├── admin/                # settings, audit, update, selfhealing
│   ├── ai/                   # models, embeddings, memory, spaces
│   ├── store/                # appstore, store, workflows, workspaces
│   └── external/             # externalApi, claudeTerminal, events, alerts
├── src/middleware/
│   ├── auth.js               # JWT validation
│   ├── audit.js              # Request logging
│   ├── errorHandler.js       # asyncHandler + error middleware
│   └── rateLimit.js          # Per-user rate limiting
├── src/services/             # Business logic (sandbox/, llm/, context/, core/, memory/, app/,
│                             #   agents/ = Tool-Loop-Grundlage: toolLoop, pathSafe, gpuGate,
│                             #   workspaceIndexer, tools/)
└── src/utils/
    ├── errors.js             # Custom error classes
    ├── logger.js             # Winston logging
    └── jwt.js                # Token utilities
```

### Frontend (React 19)

```
apps/dashboard-frontend/
├── src/App.tsx               # Routes, Auth context (/ always → /workspace)
├── src/features/             # Feature modules
│   ├── flows/                # Flow-Editor-Tab, Flow-Dashboard, Läufe (RunCard, RunStep)
│   ├── settings/             # Settings, GeneralSettings, AIProfileSettings, System-Status
│   ├── store/                # Store (Modelle · Erweiterungen tabs)
│   ├── system/               # SetupWizard, UpdatePage, Login
│   └── workspace/            # Shell: ActivityBar (Modelle · Erweiterungen · Flows),
│                             #   Sidebar, Tabs, rechte Spalte (leer seit B2), StatusBar
├── src/components/
│   ├── ui/                   # Modal, Skeleton, LoadingSpinner, EmptyState, Baustein-Set
│   └── mascot/               # Das Maskottchen
├── src/contexts/             # AuthContext, DownloadContext, ToastContext, ActivationContext
├── src/stores/               # zustand (workspaceStore: Tabs, Sidebar-Ansicht, Spalten)
├── src/hooks/                # useApi, useConfirm, useFlowRun, useStoreCatalog
└── src/__tests__/            # Test files
```

**Workspace-Shell:** `/` landet immer auf `/workspace` (kein Feature-Flag mehr).
Die Shell ist ein Dreispalten-Raster mit einer immer sichtbaren ActivityBar
— **Modelle · Erweiterungen · Flows** — plus den aktivierten
App-Erweiterungen und **Einstellungen** (System-Status liegt unter
Einstellungen → System). Seit Phase B2 (26.08.2026) sind Editor,
Datei-Explorer, Agent-Chat, Terminal und Sandbox-Ansichten aus der
Oberfläche gefallen; die linke Spalte ist ohne gewählte Ansicht leer, die
rechte Spalte ganz. Das Raster bleibt, die Phasen D1 und D2 füllen die
Spalten neu.

**Workspace (Backend, Plan 008):** Ein **Workspace** ist die Entität
`sandbox_projects` — ein `host_path`-Ordner + Container mit einem
Netzwerkmodus (`isolated` · `internal` · `infrastructure`, letzterer nur
Admin) und einem Besitzer. Die Routen und Dienste dazu laufen weiter, bis B4
und B5 sie streichen; eine Oberfläche dafür gibt es seit B2 nicht mehr.
Details: [`docs/features/WORKSPACE.md`](features/WORKSPACE.md).

Die path-gejailte Tool-Loop-Grundlage dafür liegt in
`apps/dashboard-backend/src/services/flows/` (`toolLoop.js`, `pathSafe.js`,
`gpuQueue.js`, `stepExecutor.js`, `scheduler.js`, `tools/`) und baut auf
Ollama-Function-Calling auf. **Flows** (Chat-Slash-Befehle, Markdown-Dateien
unter `data/flows/`) ersetzen die früheren Agenten — Details:
[`docs/features/FLOWS.md`](features/FLOWS.md).

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
└── 055_*.sql
# Next migration: 056_*.sql
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
| metrics-collector  | `curl -f http://localhost:9100/health`            | 10s      | 1s      | 3       | -            |
| llm-service        | Custom script (model test)                        | 30s      | 5s      | 3       | 300s         |
| embedding-service  | Custom script (vectorization test)                | 15s      | 3s      | 3       | 300s         |
| dashboard-backend  | `curl -f http://localhost:3001/api/health`        | 10s      | 3s      | 3       | 10s          |
| dashboard-frontend | `test -f /usr/share/nginx/html/index.html`        | 10s      | 1s      | 3       | 15s          |
| n8n                | `wget --spider -q http://localhost:5678/healthz`  | 15s      | 2s      | 3       | -            |
| reverse-proxy      | `wget -q --spider http://localhost:8080/ping`     | 10s      | 3s      | 3       | 30s          |
| self-healing-agent | `python3 /app/heartbeat.py --test`                | 30s      | 3s      | 3       | 10s          |
| docker-proxy       | socket connectivity check                         | 10s      | 3s      | 3       | 5s           |

### Validation

```bash
./scripts/validate/validate-dependencies.sh
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
```

Full reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)

---

## Related Documentation

- [DATABASE_SCHEMA.md](api/DATABASE_SCHEMA.md) - Database structure
- [API_REFERENCE.md](api/API_REFERENCE.md) - API endpoints
- [Deployment](ops/DEPLOYMENT.md) - Deployment & installation
- [DEVELOPMENT.md](development/DEVELOPMENT.md) - Development workflows
