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

## 1. Service Overview (14 Services)

**MinIO, Loki und Promtail gibt es nicht mehr.** Phase B4 des Rückbaus
(26.08.2026) hat alle drei ausgebaut: Die Text-Extraktion reicht Dateien
jetzt per multipart direkt an den document-indexer, ein Objektspeicher wird
dafür nicht mehr gebraucht; die zentrale Log-Aggregation ist entfallen, jeder
Dienst schreibt weiter nach stdout/stderr, `docker compose logs` bleibt der
Weg zu den Logs.

**Qdrant gibt es ebenfalls nicht mehr.** Plan 021, Schritt 8 hatte das
klassische Vektor-RAG durch agentisches ersetzt; am 24.08.2026 ist der Dienst
samt Code ausgebaut worden, weil drei Features still durchfielen, statt ihren
Ausfall zu melden (Migration `162_qdrant_ausbau.sql` nennt die Zahlen).

**Den Textlayer (`document_chunks`, `documents`, Wissensräume) gibt es
ebenfalls nicht mehr.** Migration `163` hat die dazugehörigen Tabellen mit
Phase B4 entfernt. `document-indexer` ist seither ein reiner
Extraktionsdienst: `GET /health` und `POST /extract-text` (multipart, Feld
`file`) liefern PDF/DOCX/OCR-Text auf Anfrage, ohne eigene Datenbank, ohne
MinIO, ohne Embedding, ohne LLM, ohne GPU, ohne Scan-Zyklus, ohne BM25, ohne
Chunks.

`embedding-service` läuft weiter ohne Profil: die OpenAI-kompatible
`/v1/embeddings` (`GET /api/embeddings` reicht seine Auskunft durch) braucht ihn.

| #   | Service            | Port         | Technology          | Entry Point           | Purpose                         |
| --- | ------------------ | ------------ | ------------------- | --------------------- | ------------------------------- |
| 1   | dashboard-frontend | 3000         | React 19            | `src/App.tsx`         | Web UI                          |
| 2   | dashboard-backend  | 3001         | Node.js/Express     | `src/index.js`        | REST API + SSE + WebSocket      |
| 3   | postgres-db        | 5432         | PostgreSQL 16       | `init/*.sql`          | Relational database             |
| 4   | llm-service        | 11434, 11436 | Ollama + Flask      | `api_server.py`       | LLM inference                   |
| 5   | embedding-service  | 11435        | Flask               | `embedding_server.py` | Text vectorization              |
| 6   | document-indexer   | 9102         | Flask               | `api_server.py`       | Text extraction on request      |
| 7   | metrics-collector  | 9100         | aiohttp             | `collector.py`        | System metrics                  |
| 8   | self-healing-agent | 9200         | Python              | `healing_engine.py`   | Autonomous recovery             |
| 9   | docker-proxy       | -            | Docker Socket Proxy | -                     | Secure Docker API access        |
| 10  | reverse-proxy      | 80/443       | Traefik             | `routes.yml`          | Reverse proxy + SSL             |
| 11  | backup-service     | -            | Alpine + cron       | `backup.sh`           | Automated backups               |
| 12  | cloudflared        | -            | Cloudflare Tunnel   | -                     | Remote access tunnel (optional) |

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
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │    Frontend     │  │     Backend     │                       │
│  │   (React SPA)   │  │  (Express API)  │                       │
│  │   Port: 3000    │  │   Port: 3001    │                       │
│  └─────────────────┘  └─────────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                         AI SERVICES                              │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │   LLM Service   │  │   Embedding     │                       │
│  │   (Ollama)      │  │   Service       │                       │
│  │   Port: 11434   │  │   Port: 11435   │                       │
│  └─────────────────┘  └─────────────────┘                       │
│  ┌─────────────────┐                                            │
│  │    Document     │                                            │
│  │    Indexer      │                                            │
│  │   Port: 9102    │                                            │
│  └─────────────────┘                                            │
├─────────────────────────────────────────────────────────────────┤
│                       SYSTEM SERVICES                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   PostgreSQL    │  │    Metrics      │  │  Reverse Proxy  │  │
│  │   (Database)    │  │   Collector     │  │   (Traefik)     │  │
│  │   Port: 5432    │  │   Port: 9100    │  │  Port: 80/443   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │  Self-Healing   │  │  Docker Proxy   │                       │
│  │     Agent       │  │ (Socket Proxy)  │                       │
│  │   Port: 9200    │  │  Port: 2375     │                       │
│  └─────────────────┘  └─────────────────┘                       │
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
   ┌────▼────┐              ┌─────▼─────┐                  │
   │Frontend │              │  Backend  │                  │
   │ :3000   │─────────────▶│  :3001    │                  │
   └─────────┘   REST/WS    └─────┬─────┘                  │
                                  │
          ┌───────────────────────┤
          │                       │
    ┌─────▼─────┐          ┌──────▼──────┐
    │ PostgreSQL│          │ LLM Service │
    │  :5432    │          │  :11434     │
    └───────────┘          └─────────────┘
          │                       │
    ┌─────▼─────┐          ┌──────▼──────┐        ┌──────────────┐
    │ Metrics   │          │  Embedding  │        │ Doc-Indexer  │
    │ :9100     │          │  :11435     │        │  :9102       │
    └───────────┘          └─────────────┘        └──────────────┘
          │
    ┌─────▼─────┐
    │Self-Heal  │
    │ :9200     │
    └───────────┘
```

---

## 4. Port Mapping

| Service            | Internal Port | External Port        | Protocol   |
| ------------------ | ------------- | -------------------- | ---------- |
| reverse-proxy      | 80, 443       | 80, 443              | HTTP/HTTPS |
| dashboard-frontend | 3000          | 8080 (via proxy)     | HTTP       |
| dashboard-backend  | 3001          | 8080/api (via proxy) | HTTP/WS    |
| postgres-db        | 5432          | -                    | TCP        |
| llm-service        | 11434, 11436  | -                    | HTTP       |
| embedding-service  | 11435         | -                    | HTTP       |
| document-indexer   | 9102          | -                    | HTTP       |
| metrics-collector  | 9100          | -                    | HTTP       |
| self-healing-agent | 9200          | -                    | HTTP       |
| docker-proxy       | 2375          | -                    | TCP        |

---

## 5. Startup Order

Critical dependency chain (enforced via Docker Compose `depends_on` with `condition: service_healthy`):

### Tier 1: Foundation Services (No Dependencies)

- **PostgreSQL** (5432) - Primary database
- **docker-proxy** - Secure Docker socket access
- **document-indexer** (9102) - reiner Extraktionsdienst (PDF/DOCX/OCR auf Anfrage), braucht weder Datenbank noch andere Dienste

### Tier 2: Core Dependents (Depends on: postgres-db)

- **metrics-collector** (9100)
- **llm-service** (11434) - Requires GPU (NVIDIA runtime)
- **embedding-service** (11435) - läuft ohne Profil mit
- **backup-service** - Automated backups (cron)

### Tier 3: Application Services Layer

- **dashboard-backend** (3001) - Depends on: postgres-db, docker-proxy
- **reverse-proxy** (80/443) - Depends on: postgres-db, docker-proxy

### Tier 4: Frontend

- **dashboard-frontend** (3000) - Depends on: dashboard-backend (healthy)

### Tier 5: Self-Healing

- **self-healing-agent** (9200) - Depends on: postgres-db, metrics-collector, docker-proxy;
  überwacht die übrigen Dienste

### Tier 6: Optional

- **cloudflared** - OAuth-Tunnel, Depends on: reverse-proxy (healthy), optional

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

### Document Text Extraction

Es gibt kein Dokumenten-Upload, keine Ablage und keine Wissensbasis mehr
(Phase B4, 26.08.2026, Migration `163`). `document-indexer` ist ein
zustandsloser Extraktionsdienst: der Aufrufer schickt eine Datei per
multipart, der Dienst parst sie synchron und gibt den Text zurück.

```
Client
     │  POST /extract-text (multipart, Feld "file")
     ▼
┌──────────────────┐
│  document-indexer │   PDF/DOCX/OCR-Parsing, synchron
└─────────┬─────────┘
          │
          ▼
       Text (Response)
```

Keine Datenbank, kein Objektspeicher, kein Hintergrund-Scan, kein Embedding.
Details zu den beiden verbliebenen Endpunkten (`GET /health`,
`POST /extract-text`) stehen in
[`docs/development/PYTHON_SERVICES.md`](development/PYTHON_SERVICES.md).

### Service Communication

```
Frontend ──HTTP──> Traefik ──HTTP──> Backend
                                       │
                    ┌──────────────────┤
                    ▼                  ▼
              LLM-Service      Embedding-Service
              (11434)          (11435)
                    │                  │
                    └──────────────────┘
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
│   ├── chats.js              # /api/chats CRUD
│   ├── flows.js              # /api/flows (Definitionen, Läufe, Vorlagen)
│   ├── docs.js               # /api/docs
│   ├── system/               # system, services, metrics, logs, database, tailscale
│   ├── admin/                # settings, audit, update, selfhealing, backup, gdpr, werksreset
│   ├── ai/                   # models, embeddings
│   ├── store/                # appstore, store, workflows
│   └── external/             # externalApi, openaiCompat, events, alerts
├── src/middleware/
│   ├── auth.js               # JWT validation
│   ├── audit.js              # Request logging
│   ├── errorHandler.js       # asyncHandler + error middleware
│   └── rateLimit.js          # Per-user rate limiting
├── src/services/             # Business logic (llm/, chat/, core/, app/, auth/, network/,
│                             #   system-settings/, werksreset/, medien/, documents/ = Extraktion,
│                             #   flows/ = Tool-Loop: toolLoop, pathSafe, gpuQueue, tools/)
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
│   ├── settings/             # Settings, GeneralSettings, AIProfileSettings, System-Status
│   ├── store/                # Store (Modelle: Raster + Detailseite)
│   ├── system/               # SetupWizard, UpdatePage, Login
│   └── workspace/            # Shell: ActivityBar (Modelle), Sidebar, Tabs,
│                             #   rechte Spalte (leer seit B2), StatusBar
├── src/components/
│   ├── ui/                   # Modal, Skeleton, LoadingSpinner, EmptyState, Baustein-Set
│   └── mascot/               # Das Maskottchen
├── src/contexts/             # AuthContext, DownloadContext, ToastContext, ActivationContext
├── src/stores/               # zustand (workspaceStore: Tabs, Sidebar-Ansicht, Spalten)
├── src/hooks/                # useApi, useConfirm, useStoreCatalog, useWorkspaceApps
└── src/__tests__/            # Test files
```

**Workspace-Shell:** `/` landet immer auf `/workspace` (kein Feature-Flag mehr).
Die Shell ist ein Dreispalten-Raster mit einer immer sichtbaren ActivityBar
— **Modelle** und **Einstellungen**
(System-Status liegt unter Einstellungen → System). Seit Phase B2
(26.08.2026) sind Editor, Datei-Explorer, Agent-Chat, Terminal und
Sandbox-Ansichten aus der Oberfläche gefallen, seit B3 auch Flow-Editor,
Erweiterungs-Store und der Tab einer installierten Erweiterung; die linke
Spalte ist ohne gewählte Ansicht leer, die rechte Spalte ganz. Das Raster
bleibt, die Phasen D1 und D2 füllen die Spalten neu.

**Workspace (Backend):** Die Entität `sandbox_projects` (Ordner plus
Container mit Netzwerkmodus und Besitzer, Plan 008) ist mit Phase B4
(26.08.2026) samt Routen, Diensten und Tabellen gefallen; was unter dem Namen
bleibt, steht in [`docs/features/WORKSPACE.md`](features/WORKSPACE.md).

Die path-gejailte Tool-Loop-Grundlage der Flows liegt in
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
├── api_server.py             # Flask: GET /health, POST /extract-text (port 9102)
├── document_parsers.py       # PDF/DOCX/Bild-Parser
├── ocr_service.py            # Tesseract-OCR für Bild-PDFs
└── metadata_extractor.py     # Titel, Seitenzahl
```

### Database Migrations

```
services/postgres/init/
├── 001_init_schema.sql       # metrics, metric_history
├── 002_auth_schema.sql       # admin_users, sessions
├── ...
└── 163_rueckbau_b4.sql       # Phase B4: Tabellen der gestrichenen Bereiche
# Next migration: highest NNN on disk + 1
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
| Others            | Default       |

### GPU Requirements

| Service           | GPU      | Memory     |
| ----------------- | -------- | ---------- |
| LLM Service       | Required | ~40 GB max |
| Embedding Service | Required | ~2 GB      |
| Others            | None     | -          |

---

## 9. Health Checks

| Service            | Health Check Command                          | Interval | Timeout | Retries | Start Period |
| ------------------ | --------------------------------------------- | -------- | ------- | ------- | ------------ |
| postgres-db        | `pg_isready -U $USER -d $DB`                  | 10s      | 2s      | 3       | -            |
| metrics-collector  | `curl -f http://localhost:9100/health`        | 10s      | 1s      | 3       | -            |
| llm-service        | Custom script (model test)                    | 30s      | 5s      | 3       | 300s         |
| embedding-service  | Custom script (vectorization test)            | 15s      | 3s      | 3       | 300s         |
| dashboard-backend  | `curl -f http://localhost:3001/api/health`    | 10s      | 3s      | 3       | 10s          |
| dashboard-frontend | `test -f /usr/share/nginx/html/index.html`    | 10s      | 1s      | 3       | 15s          |
| reverse-proxy      | `wget -q --spider http://localhost:8080/ping` | 10s      | 3s      | 3       | 30s          |
| self-healing-agent | `python3 /app/heartbeat.py --test`            | 30s      | 3s      | 3       | 10s          |
| docker-proxy       | socket connectivity check                     | 10s      | 3s      | 3       | 5s           |

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
```

Full reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)

---

## Related Documentation

- [DATABASE_SCHEMA.md](api/DATABASE_SCHEMA.md) - Database structure
- [API_REFERENCE.md](api/API_REFERENCE.md) - API endpoints
- [Deployment](ops/DEPLOYMENT.md) - Deployment & installation
- [DEVELOPMENT.md](development/DEVELOPMENT.md) - Development workflows
