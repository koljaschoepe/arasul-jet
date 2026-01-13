# CLAUDE.md

Instructions for Claude Code working in the Arasul Platform repository.

---

## Quick Navigation

| Looking for... | Go to... |
|----------------|----------|
| All documentation | [docs/INDEX.md](docs/INDEX.md) |
| API endpoints | [docs/API_REFERENCE.md](docs/API_REFERENCE.md) |
| Database schema | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) |
| Environment variables | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) |
| Architecture diagrams | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Backend service | [services/dashboard-backend/README.md](services/dashboard-backend/README.md) |
| Frontend service | [services/dashboard-frontend/README.md](services/dashboard-frontend/README.md) |
| Docker dependencies | [docs/DOCKER_DEPENDENCIES.md](docs/DOCKER_DEPENDENCIES.md) |

---

## Workflow Rules (CRITICAL)

### After Every Significant Implementation

1. **Test** - Run relevant tests before considering work complete
2. **Document** - Update relevant docs if behavior changed
3. **Commit** - Create atomic commits with clear messages
4. **Push** - Push to remote after successful tests

```bash
# Standard workflow after implementing a feature
npm test                           # or pytest for Python
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
| Database | PostgreSQL 15 |
| AI | Ollama (LLM) + Sentence Transformers (Embeddings) |
| Vector DB | Qdrant |
| Storage | MinIO |

---

## Architecture (10 Services)

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (3000) ─── BACKEND (3001) ─── n8n (5678)     │
├─────────────────────────────────────────────────────────┤
│  LLM (11434) ── EMBEDDING (11435) ── QDRANT (6333)     │
│                 DOCUMENT-INDEXER (8080)                 │
├─────────────────────────────────────────────────────────┤
│  POSTGRES (5432) ── MINIO (9000) ── METRICS (9100)     │
│  TRAEFIK (80/443) ── SELF-HEALING (9200)               │
└─────────────────────────────────────────────────────────┘
```

### Startup Order (Enforced by depends_on)

```
1. postgres-db, minio
2. qdrant
3. metrics-collector
4. llm-service, embedding-service
5. document-indexer
6. reverse-proxy
7. dashboard-backend, dashboard-frontend, n8n
8. self-healing-agent (LAST - monitors all)
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
```

---

## Key File Locations

### Backend (Node.js/Express)
```
services/dashboard-backend/
├── src/index.js              # Entry point, Express app
├── src/routes/               # 17 route files
│   ├── auth.js               # Login, logout, sessions
│   ├── llm.js                # LLM chat (SSE streaming)
│   ├── rag.js                # RAG queries
│   ├── chats.js              # Multi-conversation
│   ├── documents.js          # Document management
│   └── settings.js           # Password management
├── src/middleware/auth.js    # JWT middleware
├── src/database.js           # PostgreSQL pool
└── src/services/
    ├── llmJobService.js      # LLM job queue
    └── llmQueueService.js    # Sequential processing
```

### Frontend (React)
```
services/dashboard-frontend/
├── src/App.js                # Routes, WebSocket, Auth
└── src/components/
    ├── ChatMulti.js          # AI Chat with RAG toggle
    ├── DocumentManager.js    # Document upload
    ├── Settings.js           # Settings tabs
    └── Login.js              # Auth form
```

### AI Services (Python)
```
services/llm-service/
├── api_server.py             # Management API (Flask)
├── entrypoint.sh             # Dual server startup
└── healthcheck.sh            # Custom health check

services/embedding-service/
└── embedding_server.py       # Flask server (NOT FastAPI)

services/document-indexer/
├── indexer.py                # Main loop
├── document_parsers.py       # PDF, DOCX, TXT, MD
└── text_chunker.py           # 500 char chunks
```

### Database Migrations
```
services/postgres/init/
├── 001_init_schema.sql       # Metrics tables
├── 002_auth_schema.sql       # Users, sessions
├── 003_self_healing_schema.sql
├── 004_update_schema.sql
├── 005_chat_schema.sql       # Conversations, messages
├── 006_llm_jobs_schema.sql
├── 007_add_sources_to_messages.sql  # RAG sources
├── 008_llm_queue_schema.sql
└── 009_documents_schema.sql
```

---

## API Quick Reference

### Authentication
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | No |
| POST | `/api/auth/logout` | Yes |
| GET | `/api/auth/me` | Yes |

### AI Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm/chat` | LLM inference (SSE) |
| POST | `/api/rag/query` | RAG query (SSE) |
| GET | `/api/chats` | List conversations |
| POST | `/api/chats` | Create conversation |

### Documents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents/upload` | Upload (multipart) |
| GET | `/api/documents` | List all |
| DELETE | `/api/documents/:id` | Delete |

### System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metrics/live` | Current metrics |
| WS | `/api/metrics/live-stream` | Real-time (5s) |

Full reference: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

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
-- Example: 010_new_table.sql
CREATE TABLE IF NOT EXISTS new_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Add Frontend Component

1. Create in `services/dashboard-frontend/src/components/`
2. Add route in `App.js` if needed
3. Add CSS in corresponding `.css` file
4. Update service README

### Modify Self-Healing Thresholds

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

### Traefik Routing Issues (localhost vs. external)
```bash
# Test HTTP routing
curl -v http://localhost/api/health
curl -v http://127.0.0.1/api/health

# Check Traefik logs
docker compose logs reverse-proxy | tail -50

# IMPORTANT: All routing is defined in config/traefik/dynamic/routes.yml
# Docker labels in docker-compose.yml should have traefik.enable=false
# See HIGH-016 in BUGS_AND_FIXES.md for details
```

---

## Power Tips for Claude Code

### 1. Use Parallel Operations
When reading multiple files, request them in parallel:
```
Read file A, file B, file C simultaneously
```

### 2. Search Before Creating
Always search for existing implementations before writing new code:
```bash
# Find similar patterns
grep -r "pattern" services/
```

### 3. Verify Before Committing
```bash
# Run tests
npm test
# Check for TypeScript/lint errors
npm run lint
# Verify docker builds
docker compose build <service>
```

### 4. Use Service READMEs
Each service has a README with entry points, APIs, and dependencies. Read them first.

### 5. Check BUGS_AND_FIXES.md
Historical bugs are documented. Check if your issue was already solved:
- HIGH-010: Health check timeouts
- HIGH-014: Startup order
- HIGH-015: Connection pool exhaustion

### 6. Test Incrementally
Don't implement everything at once. Test each piece:
1. Add endpoint → Test with curl
2. Add frontend → Test in browser
3. Add database → Test with psql

### 7. Keep Context Small
For specific tasks, read only relevant files. Don't load the entire codebase.

### 8. Use Existing Patterns
Copy patterns from existing code:
- Route structure from `routes/auth.js`
- Database queries from `database.js`
- Frontend components from `ChatMulti.js`

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

# Key settings
LLM_MODEL=qwen3:14b-q8
LLM_KEEP_ALIVE_SECONDS=300
SELF_HEALING_ENABLED=true
SELF_HEALING_REBOOT_ENABLED=false
```

Full reference: [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)

---

## References

- [docs/INDEX.md](docs/INDEX.md) - Documentation navigator
- [docs/prd.md](docs/prd.md) - Original PRD (German)
- [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md) - Bug history & solutions
- [docs/API_GUIDE.md](docs/API_GUIDE.md) - Detailed API examples
