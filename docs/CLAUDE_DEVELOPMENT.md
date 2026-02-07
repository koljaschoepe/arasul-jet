# Claude Development Workflows

Development workflows, API reference, and debugging guide for the Arasul Platform.

---

## Workflow Rules (CRITICAL)

### After Every Significant Implementation

1. **Test** - Run relevant tests before considering work complete
2. **Document** - Update relevant docs if behavior changed
3. **Commit** - Create atomic commits with clear messages
4. **Push** - Push to remote after successful tests

```bash
# Standard workflow
./scripts/run-tests.sh --backend   # Run backend tests
npm run lint:fix                   # Auto-fix linting issues
git add -A
git commit -m "feat: description"
git push origin main
```

### Auto-Documentation Protocol

| Change Type | Update These Files |
|-------------|-------------------|
| New API endpoint | `docs/API_REFERENCE.md`, service README |
| Database schema | `docs/DATABASE_SCHEMA.md`, add migration |
| New env variable | `docs/ENVIRONMENT_VARIABLES.md`, `.env.template` |
| New service/component | Create `services/{name}/README.md` |
| Architecture change | `docs/ARCHITECTURE.md` |
| Bug fix | `BUGS_AND_FIXES.md` |
| **Frontend component** | Follow `docs/DESIGN_SYSTEM.md` |

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

Full reference: [API_REFERENCE.md](API_REFERENCE.md)

---

## Common Development Tasks

### Add New API Endpoint

1. Create route in `services/dashboard-backend/src/routes/`
2. Register in `src/index.js`
3. Add auth middleware if needed
4. Update `docs/API_REFERENCE.md`
5. Write tests in `__tests__/`

```javascript
// Pattern: src/routes/example.js
const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const auth = require('../middleware/auth');

router.get('/', auth, asyncHandler(async (req, res) => {
  const result = await someService.getData();
  res.json({ data: result, timestamp: new Date().toISOString() });
}));

module.exports = router;
```

### Add Database Migration

1. Create `services/postgres/init/029_name.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Update `docs/DATABASE_SCHEMA.md`
4. Rebuild: `docker compose up -d --build postgres-db`

```sql
-- Example: 029_new_table.sql
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
3. **Follow [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) guidelines**
4. Add tests in `src/__tests__/`

---

## Frontend Design System (MANDATORY)

### Color Palette
```
BLUE (Primary accent):
  Primary:     #45ADFF
  Hover:       #6EC4FF
  Active:      #2D8FD9

GRAYS (Backgrounds & Text):
  bg-dark:     #101923
  bg-card:     #1A2330
  bg-hover:    #222D3D
  border:      #2A3544
  text-primary:#F8FAFC
  text-secondary:#CBD5E1

STATUS (Only when semantic):
  Success:     #22C55E
  Warning:     #F59E0B
  Error:       #EF4444
```

### Component Patterns
```css
/* Button Primary */
background: #45ADFF; color: #000; border-radius: 6px;

/* Card */
background: #1A2330; border: 1px solid #2A3544; border-radius: 12px;

/* Input */
background: #101923; border: 1px solid #2A3544; border-radius: 8px;
```

Full reference: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

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
# Check connections:
SELECT count(*) FROM pg_stat_activity;
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
curl -v http://localhost/api/health
docker compose logs reverse-proxy | tail -50
# Config: config/traefik/dynamic/routes.yml
```

### Known Issues
Check [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md):
- HIGH-010: Health check timeouts
- HIGH-014: Startup order
- HIGH-015: Connection pool exhaustion
- HIGH-016: Traefik routing

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

# 2. Lint (automatisch via Hook)
npm run lint

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

### Autonome Session starten

```bash
./scripts/claude-autonomous.sh           # Hintergrund-Session
./scripts/claude-autonomous.sh --attach  # Mit Attach
./scripts/claude-autonomous.sh --status  # Status prüfen
./scripts/claude-autonomous.sh --kill    # Session beenden
```

---

## Subagent Context

When using Task agents, provide this base context:

```
Project: Arasul Platform
Hardware: NVIDIA Jetson AGX Orin (ARM64)
Stack: React 18 + Node.js/Express + PostgreSQL 16
AI: Ollama LLM + Embeddings + Qdrant
Services: 14 Docker containers

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
- Colors: Primary #45ADFF, Background #101923/#1A2330

**Backend Tasks:**
- Entry: `services/dashboard-backend/src/index.js`
- Routes: `src/routes/` (28 files)
- Auth: `require('../middleware/auth')` for protected routes

**Database Tasks:**
- Migrations: `services/postgres/init/` (28 files, start at 029)
- Always: `IF NOT EXISTS`, indexes for frequently queried columns

---

## Power Tips

1. **Use Parallel Operations** - Read multiple files at once
2. **Search Before Creating** - Check existing implementations
3. **Verify Before Committing** - Always run tests
4. **Use Service READMEs** - Each service has documentation
5. **Check BUGS_AND_FIXES.md** - Historical bugs documented
6. **Test Incrementally** - Don't implement everything at once
7. **Keep Context Small** - Read only relevant files
8. **Use Existing Patterns** - Copy from working code
