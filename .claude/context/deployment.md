# Context: Deployment & Docker

## KRITISCH: Docker-Rebuild nach Code-Änderungen

Es gibt keinen lokalen Dev-Server. Alle Services laufen als Docker-Container.

```bash
# Nach Code-Änderungen IMMER rebuilden:
docker compose up -d --build dashboard-backend dashboard-frontend

# Oder via Makefile:
make build s=dashboard-backend
make build s=dashboard-frontend
```

---

## Compose-Architektur

**Entry Point:** `docker-compose.yml` inkludiert 6 Module:

```
docker-compose.yml
  ├─ compose/compose.secrets.yaml    # 8 Docker Secrets
  ├─ compose/compose.core.yaml       # postgres, minio, docker-proxy, traefik
  ├─ compose/compose.ai.yaml         # llm-service, embedding-service, qdrant, document-indexer
  ├─ compose/compose.app.yaml        # dashboard-backend, dashboard-frontend, n8n
  ├─ compose/compose.monitoring.yaml # metrics-collector, self-healing-agent, backup, loki, promtail
  └─ compose/compose.external.yaml   # cloudflared (optional, profile: tunnel)
```

### Startup-Reihenfolge (via depends_on: service_healthy)

1. postgres-db, minio
2. qdrant, llm-service, embedding-service
3. metrics-collector
4. reverse-proxy (Traefik)
5. dashboard-backend, dashboard-frontend, n8n
6. document-indexer
7. self-healing-agent, backup-service
8. loki, promtail

---

## Service-Namen für Rebuild

| Service          | Compose-Name         | Dockerfile                                                     |
| ---------------- | -------------------- | -------------------------------------------------------------- |
| Backend API      | `dashboard-backend`  | `apps/dashboard-backend/Dockerfile`                            |
| Frontend SPA     | `dashboard-frontend` | `apps/dashboard-frontend/Dockerfile` (Multi-Stage: Node→Nginx) |
| LLM Service      | `llm-service`        | `services/llm-service/Dockerfile` (Multi-Stage: Ollama→Ubuntu) |
| Embedding        | `embedding-service`  | `services/embedding-service/Dockerfile` (L4T PyTorch)          |
| Document Indexer | `document-indexer`   | `services/document-indexer/Dockerfile`                         |
| Metrics          | `metrics-collector`  | `services/metrics-collector/Dockerfile`                        |
| Self-Healing     | `self-healing-agent` | `services/self-healing-agent/Dockerfile`                       |
| n8n              | `n8n`                | `services/n8n/Dockerfile` (Multi-Stage Custom Nodes)           |

**Externe Images (kein Rebuild nötig):** postgres-db, minio, qdrant, reverse-proxy, docker-proxy, loki, promtail, cloudflared, backup-service

---

## Makefile-Targets

```bash
# Core
make start                    # docker compose up -d
make stop                     # docker compose down
make restart                  # stop + start
make ps                       # docker compose ps
make stats                    # docker stats

# Einzelne Services
make build s=<service>        # docker compose up -d --build <service>
make logs s=<service>         # docker compose logs -f <service>
make start-<service>          # z.B. make start-llm-service
make stop-<service>
make restart-<service>

# Tests
make test                     # Alle Tests
make test-backend             # Backend nur
make test-frontend            # Frontend nur

# Database
make db                       # psql Shell
make backup-db                # DB Backup

# Profiles
make start-all                # Inkl. monitoring + tunnel Profiles
```

---

## Netzwerke

| Netzwerk          | Subnet          | Services                                                                                 |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------- |
| arasul-frontend   | 172.30.0.0/26   | traefik, frontend, cloudflared                                                           |
| arasul-backend    | 172.30.0.64/26  | backend, postgres, minio, llm, embedding, qdrant, indexer, n8n, metrics, healing, backup |
| arasul-monitoring | 172.30.0.128/26 | backend, metrics, healing, backup, loki, promtail                                        |

---

## Resource Limits (Default)

| Service           | RAM | CPU |
| ----------------- | --- | --- |
| llm-service       | 32G | 8.0 |
| embedding-service | 12G | 4.0 |
| qdrant            | 6G  | 4.0 |
| postgres-db       | 4G  | 4.0 |
| minio             | 4G  | 2.0 |
| n8n               | 2G  | 2.0 |
| document-indexer  | 2G  | 2.0 |
| dashboard-backend | 1G  | 4.0 |

Alle konfigurierbar via `RAM_LIMIT_*` und `CPU_LIMIT_*` Env-Vars.

---

## Bootstrap-Flow

```bash
./arasul bootstrap
  ├─ check_requirements()      # Docker, docker-compose, nvidia-runtime
  ├─ validate_hardware()       # RAM, GPU, Disk, JetPack
  ├─ interactive_setup.sh      # .env generieren (10 Jetson-Profile)
  ├─ pull/build images
  ├─ init_database()           # Migrationen ausführen
  ├─ init_minio_buckets()      # Documents Bucket erstellen
  ├─ setup_secrets()           # JWT, BasicAuth, TLS Certs
  ├─ start_services()          # docker compose up -d
  ├─ smoke_tests()             # Alle Services verifizieren
  └─ install_systemd_timers()  # Backup, Watchdog
```

---

## Debugging

```bash
docker compose logs -f <service>                    # Live-Logs
docker compose logs --tail 100 <service>            # Letzte 100 Zeilen
docker compose ps                                   # Status + Health
docker exec -it postgres-db psql -U arasul -d arasul_db  # DB Shell
docker exec llm-service nvidia-smi                  # GPU Status
docker compose restart <service>                    # Service neustarten
```

## Health Checks prüfen

```bash
# Alle Health-Status:
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# Einzelner Service:
docker inspect --format='{{.State.Health.Status}}' arasul-platform-dashboard-backend-1
```
