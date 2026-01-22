# CLAUDE.md

Instructions for Claude Code working in the Arasul Platform repository.

---

## Quick Navigation

| Looking for... | Go to... |
|----------------|----------|
| All documentation | [docs/INDEX.md](docs/INDEX.md) |
| **Frontend Design System** | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| API endpoints | [docs/API_REFERENCE.md](docs/API_REFERENCE.md) |
| Database schema | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) |
| Environment variables | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) |
| Architecture diagrams | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Backend service | [services/dashboard-backend/README.md](services/dashboard-backend/README.md) |
| Frontend service | [services/dashboard-frontend/README.md](services/dashboard-frontend/README.md) |
| Docker dependencies | [docs/DOCKER_DEPENDENCIES.md](docs/DOCKER_DEPENDENCIES.md) |
| Context Engineering | [docs/CONTEXT_ENGINEERING_PLAN.md](docs/CONTEXT_ENGINEERING_PLAN.md) |

---

## Workflow Rules (CRITICAL)

### After Every Significant Implementation

1. **Test** - Run relevant tests before considering work complete
2. **Document** - Update relevant docs if behavior changed
3. **Commit** - Create atomic commits with clear messages
4. **Push** - Push to remote after successful tests

```bash
# Standard workflow after implementing a feature
./scripts/run-tests.sh --backend   # Run backend tests
git add -A
git commit -m "feat: description"
git push origin main
```

### Auto-Documentation Protocol

When you modify these areas, update the corresponding docs:

| Change Type | Update These Files |
|-------------|-------------------|
| New API endpoint | `docs/API_REFERENCE.md`, service README |
| Database schema | `docs/DATABASE_SCHEMA.md`, add migration |
| New env variable | `docs/ENVIRONMENT_VARIABLES.md`, `.env.template` |
| New service/component | Create `services/{name}/README.md` |
| Architecture change | `docs/ARCHITECTURE.md` |
| Bug fix | `BUGS_AND_FIXES.md` |
| **Frontend component** | Follow `docs/DESIGN_SYSTEM.md` |

### Git Commit Convention

```
feat: Add new feature
fix: Bug fix
docs: Documentation only
refactor: Code restructure
test: Add/update tests
chore: Maintenance tasks
```

---

## Project Overview

**Arasul Platform** - Autonomous Edge AI appliance for NVIDIA Jetson AGX Orin.

| Property | Value |
|----------|-------|
| Hardware | Jetson AGX Orin (12-Core ARM, 64GB DDR5) |
| Runtime | Docker Compose V2 + NVIDIA Container Runtime |
| Frontend | React 18 SPA |
| Backend | Node.js/Express |
| Database | PostgreSQL 16 |
| AI | Ollama (LLM) + Sentence Transformers (Embeddings) |
| Vector DB | Qdrant |
| Storage | MinIO (S3-compatible) |

---

## Complete Architecture (15 Services)

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
│                  SELF-HEALING-AGENT (9200)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Complete Service Reference

| # | Service | Port | Technology | Entry Point | Purpose |
|---|---------|------|------------|-------------|---------|
| 1 | dashboard-frontend | 3000 | React 18 | `src/App.js` | Web UI |
| 2 | dashboard-backend | 3001 | Node.js/Express | `src/index.js` | REST API + SSE + WebSocket |
| 3 | postgres-db | 5432 | PostgreSQL 16 | `init/*.sql` | Relational database |
| 4 | llm-service | 11434 | Ollama + Flask | `api_server.py` | LLM inference |
| 5 | embedding-service | 11435 | Flask | `embedding_server.py` | Text vectorization |
| 6 | document-indexer | 8080 | Flask | `indexer.py` | RAG document processing |
| 7 | qdrant | 6333 | Qdrant | - | Vector database |
| 8 | minio | 9000/9001 | MinIO | - | S3-compatible storage |
| 9 | metrics-collector | 9100 | aiohttp | `collector.py` | System metrics |
| 10 | self-healing-agent | 9200 | Python | `healing_engine.py` | Autonomous recovery |
| 11 | telegram-bot | 8090 | python-telegram-bot | `bot.py` | Notifications & commands |
| 12 | n8n | 5678 | n8n | - | Workflow automation |
| 13 | reverse-proxy | 80/443 | Traefik | `routes.yml` | Reverse proxy + SSL |

### Startup Order (Enforced by depends_on)

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
10. self-healing-agent             # LAST - monitors all
```

---

## Key File Locations

### Backend (Node.js/Express)
```
services/dashboard-backend/
├── src/index.js              # Entry point, Express app setup
├── src/server.js             # Server initialization
├── src/database.js           # PostgreSQL connection pool
├── src/routes/               # 28 route files (see below)
├── src/middleware/
│   ├── auth.js               # JWT validation
│   ├── audit.js              # Request logging
│   └── rateLimit.js          # Per-user rate limiting
├── src/services/             # 15 business logic services
│   ├── llmJobService.js      # LLM job persistence
│   ├── llmQueueService.js    # Sequential LLM processing
│   ├── alertEngine.js        # Alert processing
│   ├── telegramNotificationService.js
│   └── contextInjectionService.js
└── src/utils/
    ├── logger.js             # Winston logging
    ├── jwt.js                # Token utilities
    └── password.js           # bcrypt hashing
```

### Backend Routes (28 Files)

| Category | Route File | Key Endpoints |
|----------|------------|---------------|
| **Auth** | auth.js | `/api/auth/login`, `/logout`, `/me` |
| **AI Chat** | llm.js | `/api/llm/chat` (SSE), `/queue`, `/jobs` |
| **RAG** | rag.js | `/api/rag/query` (SSE) |
| **Conversations** | chats.js | `/api/chats` CRUD |
| **Documents** | documents.js | `/api/documents/upload`, list, delete |
| **System** | metrics.js | `/api/metrics/live`, `/history` |
| **Services** | services.js | `/api/services/status`, `/restart` |
| **Settings** | settings.js | `/api/settings/password` |
| **Alerts** | alerts.js | `/api/alerts/settings`, `/thresholds`, `/history` |
| **Events** | events.js | `/api/events`, `/webhook/*` |
| **Telegram** | telegram.js | `/api/telegram/config`, `/send`, `/audit-logs` |
| **Audit** | audit.js | `/api/audit/logs`, `/stats/*` |
| **Terminal** | claudeTerminal.js | `/api/terminal/query`, `/history` |
| **Spaces** | spaces.js | `/api/spaces` CRUD |
| **Models** | models.js | `/api/models/installed`, `/download`, `/sync` |
| **Apps** | appstore.js | `/api/apps` CRUD, `/config` |
| **Database** | database.js | `/api/database/health`, `/pool` |
| **Logs** | logs.js | `/api/logs/list`, `/stream` |
| **System Info** | system.js | `/api/system/info`, `/network` |
| **Embeddings** | embeddings.js | `/api/embeddings/*` proxy |
| **Self-Healing** | selfhealing.js | `/api/selfhealing/events` |
| **Update** | update.js | `/api/update/*` |
| **Workflows** | workflows.js | `/api/workflows/stats` |
| **Workspaces** | workspaces.js | `/api/workspaces` CRUD |
| **Docs** | docs.js | `/api/docs/`, `/openapi.json`, `/openapi.yaml` |
| **External API** | externalApi.js | `/api/external/llm/*`, `/api-keys` |
| **Telegram App** | telegramApp.js | `/api/telegram-app/*` (15 endpoints) |
| **Health** | (in index.js) | `/api/health` |

### Frontend (React 18)
```
services/dashboard-frontend/
├── src/App.js                # Routes, WebSocket, Auth context
├── src/components/
│   ├── ChatMulti.js          # AI Chat with RAG toggle (Hauptkomponente)
│   ├── DocumentManager.js    # Document upload + management
│   ├── Settings.js           # Settings tabs container
│   ├── PasswordManagement.js # Password change UI
│   ├── ModelStore.js         # LLM model management
│   ├── AppStore.js           # App marketplace
│   ├── ClaudeTerminal.js     # Claude Code terminal
│   ├── TelegramSettings.js   # Telegram configuration
│   ├── SelfHealingEvents.js  # Event viewer
│   ├── UpdatePage.js         # System updates
│   ├── Login.js              # Auth form
│   ├── ErrorBoundary.js      # Error handling
│   └── LoadingSpinner.js     # Loading states
├── src/__tests__/            # 9 test files
└── src/*.css                 # Styling (dark theme)
```

### AI Services (Python)
```
services/llm-service/
├── api_server.py             # Flask management API (port 11436)
├── entrypoint.sh             # Dual server startup (Ollama + Flask)
└── healthcheck.sh            # Custom health check

services/embedding-service/
└── embedding_server.py       # Flask server, nomic-embed-text-v1.5

services/document-indexer/
├── indexer.py                # Main loop (30s intervals)
├── document_parsers.py       # PDF, DOCX, TXT, Markdown
├── text_chunker.py           # 500 char chunks
├── ai_services.py            # Embedding & Qdrant integration
└── api_server.py             # Flask management API
```

### Telegram Bot (Python)
```
services/telegram-bot/
├── bot.py                    # Main bot application
├── health.py                 # Flask health endpoint (port 8090)
├── config.py                 # Environment handling
├── commands/
│   ├── disk.py               # Disk commands
│   ├── logs.py               # Log commands
│   ├── services.py           # Service management
│   └── status.py             # System status
└── src/
    ├── handlers/             # Callback handlers
    ├── middleware/           # Audit middleware
    └── services/             # Audit logging
```

### Database Migrations (28 Files)
```
services/postgres/init/
├── 001_init_schema.sql           # metrics, metric_history
├── 002_auth_schema.sql           # admin_users, sessions
├── 003_self_healing_schema.sql
├── 004_update_schema.sql         # update_packages, update_history
├── 005_chat_schema.sql           # conversations, messages
├── 006_llm_jobs_schema.sql
├── 007_add_sources_to_messages.sql
├── 008_llm_queue_schema.sql
├── 009_documents_schema.sql      # documents, document_chunks
├── 010_alert_config_schema.sql
├── 011_llm_models_schema.sql
├── 012_performance_indexes.sql
├── 013_appstore_schema.sql
├── 014_convert_system_apps.sql
├── 015_claude_workspaces_schema.sql
├── 016_knowledge_spaces_schema.sql
├── 017_audit_log_schema.sql
├── 018_claude_terminal_schema.sql
├── 019_notification_events_schema.sql
├── 020_telegram_config_schema.sql
├── 021_api_audit_logs_schema.sql
├── 022_telegram_notification_system.sql
├── 023_api_keys_schema.sql
├── 024_telegram_app_schema.sql
├── 025_telegram_functions_fix.sql
├── 026_fix_default_model.sql
├── 027_model_ollama_name.sql
└── 028_fix_user_references.sql
```

---

## Essential Commands

```bash
# Start everything
docker compose up -d

# Logs for specific service
docker compose logs -f llm-service

# Rebuild single service
docker compose up -d --build dashboard-backend

# Database shell
docker exec -it postgres-db psql -U arasul -d arasul_db

# Validate setup
./scripts/validate_dependencies.sh
./scripts/validate_config.sh

# Run tests
./scripts/run-tests.sh --backend    # Backend only (recommended)
./scripts/run-tests.sh              # All tests
```

---

## API Quick Reference

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login, get JWT |
| POST | `/api/auth/logout` | Yes | Logout |
| GET | `/api/auth/me` | Yes | Current user |

### AI Chat
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/llm/chat` | Yes | LLM inference (SSE) |
| POST | `/api/rag/query` | Yes | RAG query (SSE) |
| GET | `/api/chats` | Yes | List conversations |
| POST | `/api/chats` | Yes | Create conversation |
| GET | `/api/llm/queue` | Yes | Queue status |

### Documents
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/documents/upload` | Yes | Upload (multipart) |
| GET | `/api/documents` | Yes | List all |
| DELETE | `/api/documents/:id` | Yes | Delete |

### System & Monitoring
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| GET | `/api/metrics/live` | Yes | Current metrics |
| WS | `/api/metrics/live-stream` | Yes | Real-time (5s) |
| GET | `/api/services/status` | Yes | Container status |
| POST | `/api/services/restart` | Yes | Restart service |

### Alerts & Events
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/alerts/settings` | Yes | Alert config |
| PUT | `/api/alerts/thresholds` | Yes | Update thresholds |
| GET | `/api/alerts/history` | Yes | Alert history |
| GET | `/api/events` | Yes | List events |
| POST | `/api/events/webhook/*` | Yes | Webhook triggers |

### Telegram
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/telegram/config` | Yes | Get config |
| PUT | `/api/telegram/config` | Yes | Update config |
| GET | `/api/telegram/audit-logs` | Yes | Audit logs |

Full reference: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

---

## Frontend Design System (MANDATORY)

> **Bei JEDER Frontend-Änderung MÜSSEN diese Richtlinien befolgt werden.**
> Vollständige Dokumentation: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

### Farbpalette (NUR diese Farben verwenden!)

```
BLAU (Einzige Akzentfarbe):
  Primary:     #45ADFF  → Buttons, Links, aktive Elemente
  Hover:       #6EC4FF  → Hover-Zustände
  Active:      #2D8FD9  → Pressed/Active
  Muted:       rgba(69, 173, 255, 0.15)  → Hintergrund-Akzente

GRAUSTUFEN (Hintergründe & Text):
  bg-dark:     #101923  → Haupt-Hintergrund
  bg-card:     #1A2330  → Karten
  bg-hover:    #222D3D  → Hover auf Karten
  border:      #2A3544  → Standard Border
  text-primary:#F8FAFC  → Haupttext (weiß)
  text-secondary:#CBD5E1 → Sekundär
  text-muted:  #94A3B8  → Gedämpft
```

### Status-Farben (NUR wenn semantisch notwendig)

```
Erfolg:  #22C55E  → "Indexiert", "Online"
Warnung: #F59E0B  → "Verarbeitung", "Ausstehend"
Fehler:  #EF4444  → "Fehlgeschlagen", "Offline"
```

### Quick Reference für Komponenten

```css
/* Button Primary */
background: #45ADFF; color: #000; border-radius: 6px; padding: 0.625rem 1rem;

/* Button Secondary */
background: transparent; border: 1px solid #2A3544; color: #CBD5E1;

/* Karte */
background: #1A2330; border: 1px solid #2A3544; border-radius: 12px; padding: 1.25rem;

/* Input */
background: #101923; border: 1px solid #2A3544; border-radius: 8px; color: #F8FAFC;

/* Hover-Effekt */
transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.5);

/* Focus-Ring */
border-color: #45ADFF; box-shadow: 0 0 0 3px rgba(69, 173, 255, 0.15);
```

### Checkliste vor Frontend-Commit

- [ ] Nur Blau (#45ADFF) als Akzentfarbe
- [ ] Graustufen aus der Palette
- [ ] Status-Farben nur wenn semantisch notwendig
- [ ] Hover/Focus-States definiert
- [ ] Responsive (Mobile-First)
- [ ] Transitions: `all 0.2s ease`

---

## Common Development Tasks

### Add New API Endpoint

1. Create route in `services/dashboard-backend/src/routes/`
2. Register in `src/index.js`
3. Add auth middleware if needed
4. Update `docs/API_REFERENCE.md`
5. Test with curl or frontend

```javascript
// Example: src/routes/example.js
const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  res.json({ data: 'example', timestamp: new Date().toISOString() });
});

module.exports = router;
```

### Add Database Migration

1. Create `services/postgres/init/0XX_name.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Update `docs/DATABASE_SCHEMA.md`
4. Rebuild postgres: `docker compose up -d --build postgres-db`

```sql
-- Example: 026_new_table.sql
CREATE TABLE IF NOT EXISTS new_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_new_table_name ON new_table(name);
```

### Add Frontend Component

1. Create in `services/dashboard-frontend/src/components/`
2. Add route in `App.js` if needed
3. Add CSS in corresponding `.css` file
4. **Follow [Design System](docs/DESIGN_SYSTEM.md) guidelines**
5. Update service README

---

## Debugging Cheatsheet

### Service Won't Start
```bash
docker compose ps                    # Check status
docker compose logs <service>        # Check logs
./scripts/validate_dependencies.sh   # Check deps
docker stats                         # Check resources
```

### Database Issues
```bash
docker exec postgres-db pg_isready -U arasul
docker exec -it postgres-db psql -U arasul -d arasul_db
# Check connections: SELECT count(*) FROM pg_stat_activity;
```

### LLM Not Responding
```bash
docker compose logs llm-service
docker exec llm-service curl http://localhost:11434/api/tags
# Model loads on first request - wait up to 300s
```

### GPU Issues
```bash
nvidia-smi                           # Check GPU
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
# Ensure runtime: nvidia in docker-compose.yml
```

### RAG Not Working
```bash
curl http://localhost:6333/collections/documents  # Check Qdrant
docker compose logs document-indexer              # Check indexer
docker compose logs embedding-service             # Check embeddings
```

### Traefik Routing Issues
```bash
# Test HTTP routing
curl -v http://localhost/api/health
curl -v http://127.0.0.1/api/health

# Check Traefik logs
docker compose logs reverse-proxy | tail -50

# IMPORTANT: All routing is defined in config/traefik/dynamic/routes.yml
# See HIGH-016 in BUGS_AND_FIXES.md for details
```

---

## Subagent Context (For Task Agents)

When using Task agents, they should understand this context:

### Base Context
```
Project: Arasul Platform
Hardware: NVIDIA Jetson AGX Orin (ARM64)
Stack: React 18 + Node.js/Express + PostgreSQL 16
AI: Ollama LLM + Embeddings + Qdrant
Services: 13 Docker containers

Critical Rules:
1. Follow docs/DESIGN_SYSTEM.md for all UI changes
2. Run ./scripts/run-tests.sh --backend before commits
3. Update docs/API_REFERENCE.md for API changes
4. Use IF NOT EXISTS in all migrations
```

### Domain-Specific Context

**Frontend Tasks:**
- Entry: `services/dashboard-frontend/src/App.js`
- Components: `src/components/` (20 files)
- Reference: `ChatMulti.js` (main pattern), `Settings.js` (forms)
- Colors: Primary #45ADFF, Background #101923/#1A2330

**Backend Tasks:**
- Entry: `services/dashboard-backend/src/index.js`
- Routes: `src/routes/` (28 files)
- Auth: `require('../middleware/auth')` for protected routes
- Reference: `auth.js` (simple), `llm.js` (SSE streaming)

**Database Tasks:**
- Migrations: `services/postgres/init/` (28 files, start at 029)
- Tables: users, conversations, messages, documents, alerts
- Always: `IF NOT EXISTS`, indexes for frequently queried columns

---

## Health Checks Reference

| Service | Method | Timeout | Start Period |
|---------|--------|---------|--------------|
| postgres-db | pg_isready | 2s | - |
| minio | curl /health | 1s | - |
| qdrant | file check | 3s | 10s |
| llm-service | bash script | 5s | 300s |
| embedding-service | bash script | 3s | 300s |
| dashboard-backend | GET /api/health | 3s | 10s |
| dashboard-frontend | file check | 1s | - |
| n8n | wget spider | 2s | - |
| metrics-collector | curl /health | 1s | - |
| self-healing-agent | python heartbeat | 3s | 10s |
| telegram-bot | curl /health | 3s | 10s |

---

## Environment Variables (Critical)

```bash
# Required secrets (must be set)
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
SELF_HEALING_REBOOT_ENABLED=false
```

Full reference: [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)

---

## Self-Healing Configuration

Edit `.env`:
```bash
DISK_WARNING_PERCENT=80
DISK_CLEANUP_PERCENT=90
DISK_CRITICAL_PERCENT=95
CPU_CRITICAL_PERCENT=90
RAM_CRITICAL_PERCENT=90
SELF_HEALING_INTERVAL=10
```

---

## References

- [docs/INDEX.md](docs/INDEX.md) - Documentation navigator
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) - **Frontend Design Guidelines (MANDATORY)**
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - API documentation
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) - Database schema
- [docs/CONTEXT_ENGINEERING_PLAN.md](docs/CONTEXT_ENGINEERING_PLAN.md) - Context optimization plan
- [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md) - Bug history & solutions
- [docs/prd.md](docs/prd.md) - Original PRD (German)

---

## Power Tips for Claude Code

### 1. Use Parallel Operations
When reading multiple files, request them in parallel to save context.

### 2. Search Before Creating
Always search for existing implementations before writing new code.

### 3. Verify Before Committing
```bash
./scripts/run-tests.sh --backend   # Always run tests
```

### 4. Use Service READMEs
Each service has a README with entry points, APIs, and dependencies.

### 5. Check BUGS_AND_FIXES.md
Historical bugs are documented. Check if your issue was already solved:
- HIGH-010: Health check timeouts
- HIGH-014: Startup order
- HIGH-015: Connection pool exhaustion
- HIGH-016: Traefik routing

### 6. Test Incrementally
Don't implement everything at once. Test each piece.

### 7. Keep Context Small
For specific tasks, read only relevant files.

### 8. Use Existing Patterns
Copy patterns from existing code:
- Route structure: `routes/auth.js`
- SSE streaming: `routes/llm.js`
- Database queries: `database.js`
- Frontend components: `ChatMulti.js`

---

## Autonomer Entwicklungsmodus

### Task-Queue System

Claude arbeitet Tasks aus `tasks.md` sequentiell ab:

1. **Priority 1** zuerst (von oben nach unten)
2. Nach jedem Task: Tests ausführen
3. Bei grünen Tests: Commit erstellen
4. Task abhaken und zum nächsten wechseln

### Nach jeder Implementierung

```bash
# 1. Tests ausführen
./scripts/run-tests.sh --backend

# 2. Type-Check (automatisch via Hook)
./scripts/run-typecheck.sh

# 3. Bei Erfolg: Commit
git add .
git commit -m "feat|fix|refactor: Beschreibung"
```

### Bei Problemen

- **Stoppen** - nicht raten bei Unklarheit
- **Dokumentieren** - Blocker in `docs/blockers.md` eintragen
- **Benachrichtigen** - `./scripts/telegram-notify.sh "BLOCKER: [Beschreibung]"`

### Session-Management

| Datei | Zweck |
|-------|-------|
| `tasks.md` | Aktuelle Task-Queue |
| `docs/blockers.md` | Blockierende Probleme |
| `docs/session-state.md` | Session-Persistenz |
| `~/logs/claude/` | Session-Logs |

### Custom Commands

- `/project:implement [task]` - Feature implementieren
- `/project:test [component]` - Tests schreiben
- `/project:review [scope]` - Code-Review durchführen

### Batch/Parallel Analyse-Modus

Wenn du einen Prompt mit "ANALYSE-MODUS" erhältst:

1. **Nur analysieren, NICHT implementieren**
2. **IMMER Fragen stellen** - auch bei scheinbar klaren Tasks
3. **JSON-Format strikt einhalten**

**Antwort-Format (strikt!):**
```json
{
  "plan": {
    "summary": "Was implementiert wird",
    "steps": ["Schritt 1", "Schritt 2"],
    "files": ["pfad/datei.js"],
    "complexity": "low|medium|high"
  },
  "questions": [
    "Mindestens eine Frage zur User-Präferenz"
  ]
}
```

### Autonome Session starten

```bash
# Hintergrund-Session starten
./scripts/claude-autonomous.sh

# Mit sofortigem Attach
./scripts/claude-autonomous.sh --attach

# Session-Status prüfen
./scripts/claude-autonomous.sh --status

# Session beenden
./scripts/claude-autonomous.sh --kill
```
