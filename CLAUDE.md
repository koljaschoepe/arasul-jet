# CLAUDE.md — Arasul Platform

## Vision

Arasul ist eine autonome Edge-AI-Plattform für NVIDIA Jetson. Sie wird als kommerzielles Produkt an Unternehmen verkauft — eine Plug-&-Play-Box, die KI-Funktionen (Chat, RAG, Dokumentenanalyse, Automatisierung) komplett lokal und datenschutzkonform bereitstellt. Ziel: 5 Jahre autonomer Betrieb ohne manuellen Eingriff.

---

## Architektur auf einen Blick

```
Internet (443) → Traefik → Dashboard-Frontend (React 19 SPA)
                         → Dashboard-Backend (Express API :3001)
                              ├─ PostgreSQL 16 (85 Tabellen, 59 Migrationen)
                              ├─ MinIO (S3-kompatibler Object Storage)
                              ├─ Ollama/LLM-Service (:11434/:11436) [GPU]
                              ├─ Embedding-Service (:11435) [GPU]
                              ├─ Qdrant Vector DB (:6333)
                              ├─ Document-Indexer (:9102)
                              ├─ n8n Workflow Engine (:5678)
                              └─ Docker-Proxy → Self-Healing, Metrics, Backup
```

| Schicht  | Technologie                                                  | Ort                                                           |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript     | `apps/dashboard-frontend/`                                    |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                 | `apps/dashboard-backend/`                                     |
| AI       | Ollama (LLM) + BGE-M3 (Embeddings) + Qdrant (Vektoren)       | `services/llm-service/`, `services/embedding-service/`        |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik v2.11 | `compose/`, `config/traefik/`                                 |
| Ops      | Self-Healing Agent + Metrics Collector + Backup Service      | `services/self-healing-agent/`, `services/metrics-collector/` |
| DB       | PostgreSQL 16 (75 Migrationen, nächste: `076_*.sql`)         | `services/postgres/init/`                                     |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32-128GB, CUDA 8.7-10.0)      | Erkennung: `scripts/setup/detect-jetson.sh`                   |

---

## Unverhandelbare Regeln

### 1. Backend: asyncHandler + Custom Errors

```javascript
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError } = require('../utils/errors');
router.post(
  '/endpoint',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body.name) throw new ValidationError('Name ist erforderlich');
    // ... Logik
    res.json({ data: result });
  })
);
```

- **Immer**: `asyncHandler()` Wrapper, Errors aus `utils/errors.js`
- **Nie**: try-catch auf Route-Level, raw `fetch()` im Frontend

### 2. Frontend: useApi + TypeScript + CSS Variables

```typescript
const api = useApi();
const data = await api.get<MyType>('/endpoint');
```

- **Immer**: `useApi()` Hook, TypeScript (`.tsx`/`.ts`), `var(--primary-color)` statt Hex
- **Nie**: raw `fetch()`, `.js`-Dateien, hardcoded Farben in JSX

### 3. Testen vor Commit

```bash
./scripts/test/run-tests.sh --backend    # Jest (50 Test-Files)
./scripts/test/run-tests.sh --frontend   # Vitest (35 Test-Files)
```

### 4. Deployment: Docker Rebuild nach Code-Änderungen

```bash
docker compose up -d --build dashboard-backend dashboard-frontend
```

Es gibt keinen lokalen Dev-Server — der User testet im Browser erst nach Container-Rebuild.

### 5. Dokumentation aktualisieren

| Änderung           | Aktualisiere                    |
| ------------------ | ------------------------------- |
| Neuer API-Endpoint | `docs/API_REFERENCE.md`         |
| DB-Schema          | `docs/DATABASE_SCHEMA.md`       |
| Neue Env-Variable  | `docs/ENVIRONMENT_VARIABLES.md` |

### 6. Git Convention: `feat|fix|docs|refactor|test|chore: Beschreibung`

---

## Task-Router: Welchen Kontext laden?

Lade den passenden Kontext aus `.claude/context/` je nach Aufgabe:

| Wenn du...                      | Lade diesen Kontext              |
| ------------------------------- | -------------------------------- |
| Backend-Route/Service schreibst | `backend.md`                     |
| React-Component baust           | `frontend.md` + `component.md`   |
| DB-Migration erstellst          | `database.md` + `migration.md`   |
| API-Endpoint hinzufügst         | `api-endpoint.md` + `backend.md` |
| Docker/Compose/Traefik änderst  | `infra.md` + `deployment.md`     |
| Python-Service bearbeitest      | `python-services.md`             |
| Telegram-Bot entwickelst        | `telegram.md`                    |
| n8n-Workflow/Custom Node baust  | `n8n-workflow.md`                |
| Tests schreibst/debuggst        | `testing.md`                     |
| Security/Auth bearbeitest       | `security.md`                    |
| Service deployst/debuggst       | `deployment.md` + `debug.md`     |
| Architektur-Überblick brauchst  | `base.md`                        |

---

## Quick Reference

### Entry Points

| Domain      | Datei                                                      |
| ----------- | ---------------------------------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js` → `routes/index.js`  |
| Frontend    | `apps/dashboard-frontend/src/App.tsx`                      |
| Database    | `services/postgres/init/` (nächste Migration: `076_*.sql`) |
| LLM Service | `services/llm-service/api_server.py`                       |
| Setup       | `scripts/interactive_setup.sh`                             |
| Bootstrap   | `./arasul bootstrap`                                       |

### Befehle

```bash
docker compose up -d                              # Alle Services starten
docker compose up -d --build <service>             # Service neu bauen
docker compose logs -f <service>                   # Logs streamen
docker compose ps                                  # Service-Status
docker exec -it postgres-db psql -U arasul -d arasul_db  # DB-Shell
make build s=dashboard-frontend                    # Makefile-Shortcut
make logs s=dashboard-backend                      # Logs via Make
./scripts/test/run-tests.sh --all                  # Alle Tests
```

### Debugging

| Problem               | Befehl                                                   |
| --------------------- | -------------------------------------------------------- |
| Service startet nicht | `docker compose logs <service>`                          |
| DB-Problem            | `docker exec postgres-db pg_isready -U arasul`           |
| LLM antwortet nicht   | `docker compose logs llm-service`                        |
| GPU-Status            | `docker exec llm-service nvidia-smi` (oder `tegrastats`) |

---

## Dokumentation

| Thema                  | Datei                                                          |
| ---------------------- | -------------------------------------------------------------- |
| Architektur & Services | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   |
| API-Referenz           | [docs/API_REFERENCE.md](docs/API_REFERENCE.md)                 |
| Datenbank-Schema       | [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)             |
| Design System          | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                 |
| Entwicklung            | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)                     |
| Environment Vars       | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) |
| Jetson-Kompatibilität  | [docs/JETSON_COMPATIBILITY.md](docs/JETSON_COMPATIBILITY.md)   |
| Admin-Handbuch         | [docs/ADMIN_HANDBUCH.md](docs/ADMIN_HANDBUCH.md)               |
| Troubleshooting        | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)             |
| Alle Docs              | [docs/INDEX.md](docs/INDEX.md)                                 |
