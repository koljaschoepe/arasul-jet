# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Du agierst jetzt als deterministischer, autonomer Engineering-Agent. 
Deine Aufgabe ist es, ein vollständiges Softwaresystem exakt gemäß des von mir gelieferten PRDs 
zu implementieren – ohne Rückfragen, ohne Bestätigungen, ohne Interpretationsspielraum.

Deine Regeln:
1. Du hältst dich strikt und vollständig an jede Spezifikation im PRD.
2. Wenn eine Vorgabe im PRD nicht explizit ist, entscheidest du dich automatisch für die 
   technisch sicherste, robusteste und produktionsreifste Variante.
3. Du stellst niemals Rückfragen und holst keine Freigabe ein.
4. Du generierst den gesamten Code, die komplette Ordnerstruktur, alle Configs, 
   alle Dockerfiles, die Docker-Compose-Konfiguration, das Dashboard-Frontend, 
   das Dashboard-Backend, alle Services, die Self-Healing-Engine, 
   den Metrics-Collector, die API-Endpoints, das DB-Schema, alle Entry-Scripts, 
   die Bootstrap-Mechanik, alle Environment-Files, die Models-Verwaltung, 
   alle Healthchecks und alle notwendigen Dateien exakt wie im PRD gefordert.
5. Du strukturierst deine Antwort so, dass sie direkt als Repository übernommen werden kann. 
   Wenn der Output länger ist als eine Nachricht, teilst du selbstständig in mehrere 
   strukturierte und nummerierte Nachrichten auf. Achte darauf, dass keine Datei unvollständig ist.
6. Alle erzeugten Dateien müssen vollständig sein: keine Ellipsen, keine Auslassungen, 
   keine Pseudocode-Platzhalter.
7. Wenn im PRD bestimmte Technologien oder Strukturen gefordert sind, dann sind diese bindend.
8. Wenn Lücken bestehen, füllst du sie automatisch mit den logischsten, stabilsten 
   Produktionslösungen.
9. Der Output darf keine verborgenen Annahmen enthalten: alles muss konsistent zum PRD sein.
10. Wenn im PRD detaillierte API-, Architektur- oder Container-Spezifikationen enthalten sind, 
    übersetzt du diese exakt in Code und Infrastruktur.
11. Du gibst das vollständige Repository in einer sauberen, klaren Struktur aus:
    - Root-Level README
    - vollständige Ordnereinteilung
    - vollständige Backend-Implementierung
    - vollständige Frontend-Implementierung (Single-Page Dashboard)
    - vollständige Systemdienste
    - vollständige Docker/Compose-Konfiguration
    - vollständige Self-Healing-Mechanik
    - vollständiger Bootstrap-Prozess
    - vollständige Update-Logik
    - alle Migrationsskripte
    - alle Skripte, Hooks und Healthchecks
    - alle Modelle, Konfigurationsdateien und Integrationspunkte
12. Du beginnst direkt mit der Umsetzung. Keine erklärenden Sätze, kein Meta-Text. 
    Nur das vollständige Repo.

Aufgabe:
Nach dem Erhalt des PRDs sollst du ein vollständiges, lauffähiges, produktionsreifes 
Software-Repository erzeugen, das exakt der Spezifikation im PRD entspricht.


## Project Overview

**Arasul Platform** - An autonomous Edge AI appliance for NVIDIA Jetson AGX Orin Developer Kit (12-Core ARM, 64 GB DDR5). The platform is designed for non-technical end users with multi-year maintenance-free operation, local AI capabilities, and a single unified dashboard interface.

**Status**: Early development - PRD completed, implementation in progress

**Target Hardware**: NVIDIA Jetson AGX Orin with JetPack 6+

**Architecture**: Fully containerized (Docker Compose) with offline-first design

## Core Architecture

### System Layers (Bottom to Top)
1. **Hardware Layer**: Jetson AGX Orin, JetPack 6+, NVMe Storage
2. **Core Runtime**: Docker Engine, Docker Compose, NVIDIA Container Runtime
3. **System Services**: PostgreSQL, Metrics Collector, Self-Healing Engine, Reverse Proxy
4. **AI Services**: LLM Service (Ollama/LocalAI), Embedding Model Service
5. **Application Services**: n8n (workflows), MinIO (object storage)
6. **Application Interface**: Dashboard Backend API, Dashboard Frontend (SPA)

### Container Architecture

All services run as Docker containers on network `arasul-net` (172.30.0.0/24):

**System/Core Layer**:
- `reverse-proxy`: API Gateway, routing, TLS termination (Traefik or Nginx)
- `dashboard-backend`: REST + WebSocket API (port 3001 → 8080 via proxy)
- `dashboard-frontend`: Single Page App (port 3000 → 8080)
- `metrics-collector`: System metrics collection (5s live, 30s persistent)
- `postgres-db`: Telemetry + audit database (7-day retention)
- `self-healing-agent`: Autonomous service recovery (10s interval)

**AI Layer**:
- `llm-service`: Chat LLM with GPU acceleration (internal port 11434, max 40GB RAM)
- `embedding-service`: Embedding model (internal port 11435)

**Automation Layer**:
- `n8n`: Workflow engine with external integrations (port 5678 via proxy)

**Storage Layer**:
- `minio`: Local object storage (ports 9000/9001)

### Startup Order (Critical - Must Be Deterministic)
1. PostgreSQL
2. MinIO
3. Metrics Collector
4. LLM Service
5. Embedding Service
6. Reverse Proxy (depends on 1-5, not on dashboards)
7. Dashboard Backend (depends on 6 + core services)
8. Dashboard Frontend (depends on 6, not on backend)
9. n8n (depends on core services)
10. Self-Healing Engine (starts last, depends on all)

## Development Commands

### Bootstrap System
```bash
./arasul bootstrap
```
This initializes the entire system: validates hardware, installs dependencies, creates directory structure, starts containers, and runs smoke tests.

### Docker Compose Operations
```bash
# Start all services
docker compose up -d

# View logs for specific service
docker compose logs -f <service-name>

# Restart a service
docker compose restart <service-name>

# Stop all services
docker compose down

# Rebuild and restart a specific service
docker compose up -d --build <service-name>

# View resource usage
docker stats
```

### Validation Scripts
```bash
# Validate docker-compose dependency chain
./scripts/validate_dependencies.sh

# Validate environment configuration
./scripts/validate_config.sh
```

### Database Operations
```bash
# Connect to PostgreSQL
docker exec -it postgres-db psql -U arasul -d arasul_db

# Run migrations (when implemented)
docker exec -it postgres-db psql -U arasul -d arasul_db -f /migrations/001_initial.sql

# Check database size and retention
docker exec -it postgres-db psql -U arasul -d arasul_db -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### Testing
```bash
# Dashboard Backend tests
cd services/dashboard-backend
npm test                    # All tests with coverage
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:watch         # Watch mode

# Python service tests
cd services/self-healing-agent
python3 -m pytest tests/ -v

# Integration tests (from project root)
cd tests/integration
python3 test_self_healing_llm.py
python3 test_gpu_overload_recovery.py

# Load testing
cd tests
python3 load_test.py
python3 stability_monitor.py
```

## Directory Structure

```
/arasul/
  /config/          # Configuration files, .env, secrets
  /logs/            # Rotated logs (50MB max per file, 10 files)
    system.log
    self_healing.log
    update.log
    /service/       # Per-container logs
  /data/            # Persistent data
    /postgres/      # Database data
    /minio/         # Object storage
    /models/        # AI models
    /n8n/           # Workflow data
  /cache/           # Temporary cache
  /updates/         # Update packages (.araupdate files)
  /bootstrap/       # Bootstrap scripts
```

## API Architecture

### Dashboard Backend API Endpoints

**System Status**:
- `GET /api/system/status` - Overall system health (OK/WARNING/CRITICAL)
- `GET /api/system/info` - Version, build hash, JetPack version, uptime
- `GET /api/system/network` - IP addresses, mDNS name, internet connectivity
- `GET /api/health` - Backend health check

**Metrics**:
- `GET /api/metrics/live` - Current CPU, RAM, GPU, temperature, disk
- `GET /api/metrics/history?range=24h` - Historical metrics
- `WS /api/metrics/live-stream` - WebSocket stream (5s interval)

**Services**:
- `GET /api/services` - Status of all services (llm, embeddings, n8n, minio, postgres)
- `GET /api/services/ai` - AI services detail with GPU load

**Workflows**:
- `GET /api/workflows/activity` - n8n workflow statistics

**Updates**:
- `POST /api/update/upload` - Upload .araupdate file (multipart/form-data)

**AI Services** (Internal):
- `POST /api/llm/chat` - LLM inference (via llm-service)
- `POST /api/embeddings` - Text embedding (via embedding-service)

### Response Format

All API responses include:
- `timestamp`: ISO8601 timestamp
- Proper HTTP status codes
- JSON only (no XML or other formats)
- Deterministic structure (no dynamic fields)

## Database Schema

PostgreSQL database `arasul_db` with 7-day data retention:

**Metrics Tables**:
- `metrics_cpu` (timestamp, value)
- `metrics_ram` (timestamp, value)
- `metrics_gpu` (timestamp, value)
- `metrics_temperature` (timestamp, value)
- `metrics_disk` (timestamp, used, free, percent)

**Activity Tables**:
- `workflow_activity` (id, workflow_name, status, timestamp, duration_ms, error)
- `self_healing_events` (id, event_type, severity, description, timestamp, action_taken)

Auto-vacuum and WAL enabled. All timestamps use `timestamptz`.

## Self-Healing System

The Self-Healing Engine runs every 10 seconds and implements a 4-tier recovery strategy:

**Category A - Service Down**: Container healthcheck fails 3x → restart → stop+start → escalate
**Category B - Overload**: CPU/RAM/GPU/Temp thresholds exceeded → cache clear → session reset → throttling → restart → escalate
**Category C - Critical**: DB lost, minIO corruption, 3+ service failures in 10min → hard restart all services → disk cleanup → DB vacuum → GPU reset → full system restart
**Category D - Ultima Ratio**: Disk >97%, DB inconsistent, GPU permanently failed, 3 critical events in 30min → **system reboot**

All actions logged to `self_healing_events` table.

## Resource Constraints

**CPU Limits** (via cgroups):
- LLM: max 50%
- Embeddings: max 30%
- Dashboard: max 5%

**RAM Reservations**:
- LLM: 32GB fixed
- Embeddings: 8GB fixed
- PostgreSQL: max 8GB
- n8n: max 2GB

**Disk Thresholds**:
- 80%: Warning
- 90%: Automatic cleanup
- 95%: Critical error
- 97%: Forced reboot

## Health Checks

All containers must implement health checks:

- `dashboard-backend`: `GET /api/health` (1s timeout, 3 failures)
- `dashboard-frontend`: File exists check on `index.html`
- `llm-service`: `GET /health` (3s timeout, verify model loaded + GPU + minimal prompt)
- `embedding-service`: `GET /health` (3s timeout, test vectorization <50ms)
- `postgres-db`: `pg_isready` (2s timeout)
- `n8n`: `GET /healthz` (2s timeout)
- `minio`: `GET /minio/health/live` (1s timeout)
- `metrics-collector`: `GET /api/metrics/ping` (1s timeout)

All containers use `restart: always` policy.

## Update System

Two update methods (both use `.araupdate` files):
1. Dashboard upload: `POST /api/update/upload`
2. USB detection: Place file in `/updates/` on USB stick

Update packages contain:
- `manifest.json` (version, components, reboot requirement)
- `/payload/` (Docker images, migrations, frontend bundles)
- `signature.sig` (verified against `/arasul/config/public_update_key.pem`)

Validation checks:
- Signature verification
- Version > current version
- min_version ≤ current version

Rollback automatically triggered if critical service fails post-update.

## Security

**Authentication**:
- Single admin account (username: `admin`)
- Password hash in `/arasul/config/admin.hash`
- JWT tokens (24h validity)
- Basic Auth via reverse proxy

**Network Security**:
- Only ports 80/443 exposed externally
- All internal services on `arasul-net` bridge network
- Rate limits: n8n webhooks (100/min), LLM API (10/s), Metrics API (20/s)

**Secrets** (all in `/arasul/config/.env`):
- `ADMIN_HASH`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `JWT_SECRET`
- `UPDATE_PUBLIC_KEY`

## Development Guidelines

### When Writing Container Services

1. **Always implement health checks** following the specifications above
2. **Use deterministic startup order** - check dependencies before starting
3. **Handle failures gracefully** - never crash on temporary DB or network issues
4. **Log to stdout/stderr** - Docker captures these automatically
5. **Respect resource limits** - implement backpressure when approaching limits
6. **Support graceful shutdown** - handle SIGTERM properly
7. **No hardcoded values** - use environment variables from `.env`

### Service-Specific Implementation Notes

**Dashboard Backend** (Node.js/Express):
- Main entry: `services/dashboard-backend/src/index.js`
- Routes in: `services/dashboard-backend/src/routes/`
- Database connection pooling in: `services/dashboard-backend/src/database.js`
- WebSocket metrics stream: `services/dashboard-backend/src/services/metricsStream.js`
- Docker integration: Uses `dockerode` library for container management
- JWT authentication: `services/dashboard-backend/src/middleware/auth.js`

**Self-Healing Agent** (Python):
- Main engine: `services/self-healing-agent/healing_engine.py`
- GPU recovery: `services/self-healing-agent/gpu_recovery.py`
- USB monitoring: `services/self-healing-agent/usb_monitor.py`
- Uses connection pooling for PostgreSQL (psycopg2.pool)
- Runs every 10 seconds (configurable via SELF_HEALING_INTERVAL)

**Metrics Collector** (Python):
- Main collector: `services/metrics-collector/collector.py`
- GPU monitoring: `services/metrics-collector/gpu_monitor.py`
- Collects metrics every 5s (live) and persists every 30s

**LLM Service**:
- Based on Ollama container
- Custom healthcheck: `services/llm-service/healthcheck.sh`
- Requires GPU (NVIDIA Container Runtime)
- Models stored in Docker volume: `arasul-llm-models`

**Embedding Service** (Python):
- FastAPI server: `services/embedding-service/embedding_server.py`
- Requires GPU for inference
- Custom healthcheck validates vectorization speed (<50ms)

### When Implementing API Endpoints

1. **Always include timestamp** in responses (ISO8601 format)
2. **Use proper HTTP status codes** (200, 400, 404, 500, 503)
3. **Return deterministic JSON** - no dynamic field names
4. **Implement timeouts** - prevent hanging requests
5. **Support WebSocket upgrades** for real-time metrics
6. **Validate all inputs** - especially for update uploads

### When Adding Database Migrations

1. **Always sequential** - number migrations (001_, 002_, etc.)
2. **Include rollback** - provide down migration
3. **Test with data** - don't assume empty tables
4. **Document changes** - comment complex queries
5. **Respect 7-day retention** - clean up old data automatically

### GPU Considerations

1. **Enable NVIDIA Container Runtime** in docker-compose
2. **Monitor NVML errors** - implement GPU reset logic
3. **Limit GPU memory** - LLM service max 40GB
4. **Handle GPU recovery** - restart service on CUDA errors
5. **Monitor temperature** - throttle at >83°C

## Testing Requirements

**Smoke Tests** (must pass for production):
- Dashboard loads <1.5s
- LLM responds <2s
- Embedding <80ms
- n8n UI reachable
- PostgreSQL tables complete
- MinIO bucket listing works

**Restart Tests**:
- Individual container restart
- Full service restart
- Complete system reboot
- Verify telemetry + self-healing active after each

**Long-Run Test** (30 days):
- Memory leaks <5%
- Disk usage stable
- No critical errors
- All services stable

## Troubleshooting Common Issues

### Service Won't Start
1. Check health status: `docker compose ps`
2. View logs: `docker compose logs <service-name>`
3. Verify dependencies started first: `./scripts/validate_dependencies.sh`
4. Check resource usage: `docker stats`

### Database Connection Errors
- Services use retry logic (up to 5 attempts, 5s delay)
- Check PostgreSQL health: `docker exec postgres-db pg_isready -U arasul`
- Verify credentials in `.env` match across services

### GPU Not Available
- Verify NVIDIA drivers: `nvidia-smi`
- Check container runtime: `docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi`
- Ensure `runtime: nvidia` in docker-compose.yml for GPU services

### Health Check Failing
- LLM service has 300s start_period (model loading)
- Embedding service has 300s start_period (model loading)
- Check service-specific health endpoints manually:
  - Dashboard: `curl http://localhost/api/health`
  - Metrics: `curl http://metrics-collector:9100/health`
  - LLM: `docker exec llm-service curl http://localhost:11434/api/tags`

### Frontend Not Loading
- Check reverse-proxy: `docker compose logs reverse-proxy`
- Verify Traefik dashboard: `http://localhost:8080` (only on localhost)
- Ensure dashboard-frontend built correctly: `docker compose build dashboard-frontend`

### Self-Healing Too Aggressive
- Adjust thresholds in `.env`:
  - `DISK_CRITICAL_PERCENT` (default 95)
  - `SELF_HEALING_INTERVAL` (default 10)
- Temporarily disable: `SELF_HEALING_ENABLED=false` in `.env`

## Important Technical Notes

- **Language**: System supports German/English (PRD is in German)
- **Offline-First**: Internet is optional (only needed for n8n external integrations)
- **No Kubernetes**: Uses Docker Compose for simplicity
- **No Multi-Tenancy**: Single admin user by design
- **Deterministic Behavior**: System state must be predictable and reproducible
- **GPU Requirement**: NVIDIA GPU required for LLM/Embeddings
- **Target Users**: Non-technical end users (plug & play)
- **Note**: Use `docker compose` (not `docker-compose`) - Docker Compose V2 is required

## Key Design Principles

1. **Autonomy**: System self-heals without manual intervention
2. **Simplicity**: Single dashboard page, minimal user decisions
3. **Reliability**: Must run 3+ years without maintenance
4. **Determinism**: Identical deployment produces identical results
5. **Offline-First**: Core functionality without internet
6. **Security by Default**: Minimal attack surface, secure defaults
7. **Clear Separation**: No circular dependencies between components
8. **Replaceability**: Any service can be swapped without architecture changes

## Known Issues and Workarounds

See `BUGS_AND_FIXES.md` for detailed issue tracking and resolutions. Key historical issues:
- HIGH-010: Health check timeouts (resolved with proper timeout values)
- HIGH-014: Startup order enforcement (resolved with strict depends_on conditions)
- HIGH-015: Self-healing false positives (resolved with connection pooling)

## References

- Full specifications: `prd.md` (complete technical specification for MVP)
- Bug tracking: `BUGS_AND_FIXES.md` (historical issues and fixes)
- Test reports: `TEST_REPORT.md` (test results and coverage)
- Target Platform: NVIDIA Jetson AGX Orin Developer Kit
- JetPack Version: 6.x or later
