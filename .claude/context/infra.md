# Infrastructure Context - Docker, Compose, Traefik, Networking, Deployment

## Docker Compose Structure

Root `docker-compose.yml` includes 6 files from `compose/`:

| File                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `compose.secrets.yaml`    | Docker secrets (passwords, keys as files)            |
| `compose.core.yaml`       | PostgreSQL, MinIO, Traefik, docker-proxy             |
| `compose.ai.yaml`         | LLM (Ollama), embedding-service, Qdrant, doc-indexer |
| `compose.app.yaml`        | Dashboard backend/frontend, n8n                      |
| `compose.monitoring.yaml` | Metrics, self-healing, backup, loki, promtail        |
| `compose.external.yaml`   | Cloudflare tunnel (optional, `--profile tunnel`)     |

**File locations**: `compose/*.yaml` (relative paths inside reference `../services/`, `../config/`, etc.)

**Startup order** (enforced by `depends_on` with `condition: service_healthy`):

1. `postgres-db`, `minio` (core)
2. `qdrant`, `llm-service`, `embedding-service` (AI)
3. `metrics-collector` (monitoring)
4. `reverse-proxy` (Traefik, waits for postgres + minio)
5. `dashboard-backend`, `dashboard-frontend`, `n8n` (app)
6. `document-indexer` (waits for all AI services)
7. `self-healing-agent`, `backup-service` (monitoring)
8. `loki`, `promtail` (optional, `--profile monitoring`)

## Networks (3 isolated bridge networks)

| Network             | Subnet            | Purpose                                      |
| ------------------- | ----------------- | -------------------------------------------- |
| `arasul-frontend`   | `172.30.0.0/26`   | Traefik, frontend, cloudflared               |
| `arasul-backend`    | `172.30.0.64/26`  | All internal services (DB, AI, backend, n8n) |
| `arasul-monitoring` | `172.30.0.128/26` | Metrics, self-healing, logging               |

**Cross-network services**: `dashboard-backend` is on all three networks (frontend + backend + monitoring). `metrics-collector` and `self-healing-agent` are on backend + monitoring. `reverse-proxy` is on frontend + backend.

## GPU / NVIDIA Integration

Both `llm-service` and `embedding-service` use `runtime: nvidia` with GPU reservations:

```yaml
runtime: nvidia
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

**LLM Dockerfile** (`services/llm-service/Dockerfile`):

- Multi-stage build: extracts Ollama binary from `ollama/ollama:0.9.0`, runs on `ubuntu:22.04`
- Reason: JetPack 6 Tegra libraries require GLIBC 2.35 (official Ollama uses Ubuntu 20.04 with GLIBC 2.31)
- Without this fix, Ollama falls back to CPU-only inference
- Includes Python Flask management API on port 11436 (model download/delete/list)
- CUDA libs mounted read-only from host: `/usr/local/cuda/lib64:/usr/local/cuda/lib64:ro`
- `LD_LIBRARY_PATH` includes `/usr/local/cuda/lib64`, `/usr/lib/aarch64-linux-gnu/nvidia`, `/usr/lib/ollama/cuda_jetpack6`

**Embedding Dockerfile** (`services/embedding-service/Dockerfile`):

- Based on `dustynv/l4t-pytorch:r36.4.0` (ARM64 CUDA pre-built PyTorch)
- `L4T_PYTORCH_TAG` build arg must match host L4T major.minor version
- `TORCH_CUDA_ARCH_LIST` build arg: `8.7` (Orin/Ampere), `10.0` (Thor/Blackwell)
- sentence-transformers installed without deps (torch already in base image)

## Traefik Configuration

All config under `config/traefik/`:

| File                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `traefik.yml`             | Static config: entrypoints, providers, logging, metrics       |
| `dynamic/routes.yml`      | HTTP routers and service definitions (priority 1-110)         |
| `dynamic/middlewares.yml` | Rate limits, auth, CORS, security headers, strip-prefix       |
| `dynamic/tls.yml`         | Self-signed cert, TLS 1.2+ with strong cipher suites          |
| `dynamic/websockets.yml`  | WebSocket routers for metrics, telegram, n8n, claude-terminal |

**Entrypoints**:

- `:80` (web) -- auto-redirects to HTTPS
- `:443` (websecure) -- all routers use this
- `:8080` (traefik) -- dashboard/ping, bound to `127.0.0.1` only

**Providers**:

- Docker: reads labels from containers (`exposedByDefault: false`)
- File: watches `dynamic/` directory for config changes

**Router priorities** (higher wins on overlap):

| Priority | Router                                      | Rule                                 |
| -------- | ------------------------------------------- | ------------------------------------ |
| 110      | claude-terminal-websocket                   | `/claude-terminal` + WS upgrade      |
| 100      | minio-console, n8n, claude-terminal         | `/minio`, `/n8n`, `/claude-terminal` |
| 85       | n8n-favicon                                 | `/favicon.ico`                       |
| 65       | dashboard-static                            | `/static/js`, `/static/css`, etc.    |
| 50       | all websocket routers                       | WS upgrade header match              |
| 35       | traefik-dashboard                           | `/api/traefik`, `/dashboard`         |
| 30       | minio-api                                   | `/minio-api`                         |
| 25       | llm-direct, embeddings-direct, n8n-webhooks | `/models`, `/embeddings`, `/webhook` |
| 20       | auth-api                                    | `/api/auth`                          |
| 15       | metrics-api                                 | `/api/metrics`                       |
| 10       | dashboard-api                               | `/api`                               |
| 1        | dashboard-frontend                          | `/` (catch-all)                      |

**Authentication middlewares**:

- `forward-auth`: JWT verification via `http://dashboard-backend:3001/api/auth/verify` (cookie or Authorization header)
- `basicAuth-traefik`: htpasswd hash for Traefik dashboard
- `basicAuth-n8n`: htpasswd hash for n8n access (on top of n8n's own auth)
- Hashes generated at bootstrap (`./arasul bootstrap`) or manually via `scripts/security/generate_htpasswd.sh`

**SSE/streaming**: `serversTransports.sse-transport` with 600s timeout, `flushInterval: 1ms` on backend service. Compression middleware excludes `text/event-stream`.

## Key Service Ports (internal Docker network)

| Service            | Port(s)       | Protocol          | Health Check Endpoint                          |
| ------------------ | ------------- | ----------------- | ---------------------------------------------- |
| postgres-db        | 5432          | PostgreSQL        | `pg_isready -U ${POSTGRES_USER}`               |
| minio              | 9000 / 9001   | S3 / Console      | `curl http://localhost:9000/minio/health/live` |
| docker-proxy       | 2375          | Docker API        | (service_started)                              |
| reverse-proxy      | 80, 443, 8080 | HTTP/S            | `wget http://localhost:8080/ping`              |
| llm-service        | 11434 / 11436 | Ollama / Mgmt API | `/healthcheck.sh` (bash)                       |
| embedding-service  | 11435         | HTTP              | `curl http://localhost:11435/health`           |
| qdrant             | 6333 / 6334   | HTTP / gRPC       | `test -f /qdrant/storage/raft_state.json`      |
| document-indexer   | 9102          | HTTP              | `curl http://localhost:9102/health`            |
| dashboard-backend  | 3001          | HTTP              | `node` inline check on `/api/health`           |
| dashboard-frontend | 3000          | HTTP (nginx)      | `test -f /usr/share/nginx/html/index.html`     |
| n8n                | 5678          | HTTP              | `wget http://localhost:5678/healthz`           |
| metrics-collector  | 9100          | HTTP              | `curl http://localhost:9100/health`            |
| self-healing-agent | 9200          | HTTP              | `python3 /app/heartbeat.py --test`             |
| backup-service     | --            | --                | `test -f /backups/backup_report.json`          |
| loki               | 3100          | HTTP              | `wget http://localhost:3100/ready`             |
| promtail           | 9080          | HTTP              | TCP check on port 9080                         |
| cloudflared        | --            | Tunnel            | `pgrep -x cloudflared`                         |

## Volumes (named + host mounts)

### Named Volumes

| Volume                     | Used By             | Content                     |
| -------------------------- | ------------------- | --------------------------- |
| `arasul-postgres`          | postgres-db         | Database data               |
| `arasul-minio`             | minio               | Object storage              |
| `arasul-llm-models`        | llm-service         | Ollama model files          |
| `arasul-embeddings-models` | embedding-service   | Sentence transformer models |
| `arasul-qdrant`            | qdrant              | Vector database storage     |
| `arasul-n8n`               | n8n                 | Workflow data               |
| `arasul-bm25-index`        | document-indexer    | BM25 search index           |
| `arasul-metrics`           | metrics-collector   | Metrics cache               |
| `arasul-wal`               | postgres-db, backup | WAL archive for backups     |
| `arasul-logs`              | promtail            | Application logs            |
| `arasul-loki`              | loki                | Log aggregation data        |

### Key Host Mounts

| Host Path                         | Container Path                    | Service(s)                    | Mode   |
| --------------------------------- | --------------------------------- | ----------------------------- | ------ |
| `.env`                            | `/arasul/config/.env`             | dashboard-backend             | rw     |
| `config/traefik/`                 | `/etc/traefik/`                   | reverse-proxy                 | ro     |
| `config/postgres/postgresql.conf` | `/etc/postgresql/postgresql.conf` | postgres-db                   | ro     |
| `services/postgres/init/`         | `/docker-entrypoint-initdb.d/`    | postgres-db                   | rw     |
| `/usr/local/cuda/lib64`           | `/usr/local/cuda/lib64`           | llm-service                   | ro     |
| `/var/run/docker.sock`            | `/var/run/docker.sock`            | docker-proxy, reverse-proxy   | ro     |
| `/sys`, `/proc`                   | `/host/sys`, `/host/proc`         | metrics, self-healing         | ro     |
| `logs/`                           | `/arasul/logs`                    | reverse-proxy, self-healing   | rw     |
| `data/backups/`                   | `/backups` or `/arasul/backups`   | backup, self-healing, backend | varies |
| `data/models/`                    | `/host-models`                    | llm-service                   | ro     |

## Docker Secrets

Defined in `compose/compose.secrets.yaml`. Secret files stored in `config/secrets/`:

| Secret                    | File Path                                | Used By              |
| ------------------------- | ---------------------------------------- | -------------------- |
| `postgres_password`       | `config/secrets/postgres_password`       | postgres-db, backend |
| `jwt_secret`              | `config/secrets/jwt_secret`              | backend              |
| `minio_root_user`         | `config/secrets/minio_root_user`         | minio, backend       |
| `minio_root_password`     | `config/secrets/minio_root_password`     | minio, backend       |
| `n8n_encryption_key`      | `config/secrets/n8n_encryption_key`      | n8n                  |
| `admin_password`          | `config/secrets/admin_password`          | backend              |
| `telegram_encryption_key` | `config/secrets/telegram_encryption_key` | backend              |
| `telegram_bot_token`      | `config/secrets/telegram_bot_token`      | backend              |

Secrets are mounted at `/run/secrets/<name>` and read via `*_FILE` environment variables (e.g., `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`). Backend uses `resolveSecrets.js` to read these.

## Security

### Container Hardening

- **Default**: `no-new-privileges:true` on all services (via `x-security` YAML anchor)
- **Exception**: `self-healing-agent` omits `no-new-privileges` because `sudo reboot` requires setuid
- **Capabilities**: `cap_drop: ALL` on most services, explicit `cap_add` only where needed:
  - `reverse-proxy`: `NET_BIND_SERVICE`, `DAC_READ_SEARCH`
  - `dashboard-frontend`: `NET_BIND_SERVICE`, `CHOWN`, `SETUID`, `SETGID` (nginx)
  - `self-healing-agent`: `SYS_ADMIN`, `SYS_BOOT`, `SYS_NICE`
- **Read-only filesystems**: `reverse-proxy`, `dashboard-frontend`, `docker-proxy`, `loki`, `promtail` (with tmpfs for writable paths)
- **Docker socket proxy** (`tecnativa/docker-socket-proxy`): restricts Docker API access. Explicitly allows `CONTAINERS`, `IMAGES`, `INFO`, `NETWORKS`, `VOLUMES`, `EXEC`, `SYSTEM`, `BUILD`, `POST`. Explicitly denies `AUTH`, `SECRETS`, `SWARM`, `NODES`, `PLUGINS`, `SERVICES`.

### Network Isolation

- Frontend services cannot reach monitoring network
- Monitoring services cannot reach frontend network
- Only `dashboard-backend` bridges all three networks

## Health Checks

| Service            | Method           | Interval | Timeout | Start Period | Retries |
| ------------------ | ---------------- | -------- | ------- | ------------ | ------- |
| postgres-db        | `pg_isready`     | 10s      | 2s      | --           | 3       |
| minio              | `curl` HTTP      | 10s      | 1s      | --           | 3       |
| reverse-proxy      | `wget` HTTP      | 10s      | 3s      | 30s          | 3       |
| llm-service        | bash script      | 30s      | 5s      | 300s         | 3       |
| embedding-service  | `curl` HTTP      | 30s      | 5s      | 300s         | 3       |
| qdrant             | file existence   | 10s      | 3s      | 10s          | 3       |
| document-indexer   | `curl` HTTP      | 30s      | 5s      | 60s          | 3       |
| dashboard-backend  | `node` inline    | 10s      | 3s      | 10s          | 3       |
| dashboard-frontend | file existence   | 10s      | 1s      | 15s          | 3       |
| n8n                | `wget` HTTP      | 15s      | 2s      | --           | 3       |
| metrics-collector  | `curl` HTTP      | 10s      | 1s      | --           | 3       |
| self-healing-agent | python heartbeat | 30s      | 3s      | 10s          | 3       |
| backup-service     | file existence   | 60s      | 5s      | 120s         | 3       |
| loki               | `wget` HTTP      | 30s      | 5s      | 30s          | 3       |
| promtail           | TCP check        | 30s      | 5s      | 10s          | 3       |
| cloudflared        | `pgrep`          | 30s      | 10s     | 15s          | 3       |

**Note**: AI services (llm-service, embedding-service) have 300s start period because model loading on Jetson can be slow.

## Resource Limits (configurable via `.env`)

| Variable                     | Default | Service            |
| ---------------------------- | ------- | ------------------ |
| `RAM_LIMIT_LLM`              | 32G     | llm-service        |
| `RAM_LIMIT_EMBEDDING`        | 12G     | embedding-service  |
| `RAM_LIMIT_QDRANT`           | 6G      | qdrant             |
| `RAM_LIMIT_POSTGRES`         | 4G      | postgres-db        |
| `RAM_LIMIT_MINIO`            | 4G      | minio              |
| `RAM_LIMIT_N8N`              | 2G      | n8n                |
| `RAM_LIMIT_DOCUMENT_INDEXER` | 2G      | document-indexer   |
| `RAM_LIMIT_BACKEND`          | 1G      | dashboard-backend  |
| `RAM_LIMIT_REVERSE_PROXY`    | 512M    | reverse-proxy      |
| `RAM_LIMIT_METRICS`          | 512M    | metrics-collector  |
| `RAM_LIMIT_SELF_HEALING`     | 512M    | self-healing-agent |
| `RAM_LIMIT_LOKI`             | 512M    | loki               |
| `RAM_LIMIT_FRONTEND`         | 256M    | dashboard-frontend |
| `RAM_LIMIT_BACKUP`           | 256M    | backup-service     |
| `RAM_LIMIT_PROMTAIL`         | 256M    | promtail           |
| `RAM_LIMIT_DOCKER_PROXY`     | 128M    | docker-proxy       |
| `RAM_LIMIT_CLOUDFLARED`      | 128M    | cloudflared        |
| `CPU_LIMIT_LLM`              | 8       | llm-service        |
| `CPU_LIMIT_EMBEDDING`        | 4       | embedding-service  |
| `CPU_LIMIT_DASHBOARD`        | 4       | dashboard-backend  |

## Logging

All services use JSON log driver with rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: '50m'
    max-file: '10'
```

Exceptions: backup-service, loki, promtail use smaller limits (`10m`, `3-5` files).

Traefik writes structured JSON logs to `logs/traefik.log` and access logs (errors + slow requests only) to `logs/traefik-access.log`.

## Adding a New Service

Checklist for adding a Docker service to the platform:

1. **Choose the compose file**: pick from `compose.core.yaml`, `compose.ai.yaml`, `compose.app.yaml`, or `compose.monitoring.yaml` based on the service category

2. **Create service directory**: `services/<service-name>/` with `Dockerfile` and application code

3. **Define the service** in the chosen compose file:

   ```yaml
   my-service:
     build:
       context: ../services/my-service
       dockerfile: Dockerfile
     container_name: my-service
     hostname: my-service
     restart: always
     networks:
       - arasul-backend   # pick appropriate network(s)
     environment:
       # ... env vars
     healthcheck:
       test: ['CMD', 'curl', '-f', 'http://localhost:PORT/health']
       interval: 10s
       timeout: 3s
       retries: 3
       start_period: 30s
     <<: *default-security
     cap_drop:
       - ALL
     deploy:
       resources:
         limits:
           memory: ${RAM_LIMIT_MY_SERVICE:-512M}
     logging: *default-logging
   ```

4. **Assign to network(s)**:
   - `arasul-backend` for internal-only services
   - `arasul-frontend` if Traefik needs to route to it
   - `arasul-monitoring` if it produces/consumes metrics

5. **Add health check**: every service must have one (required for `depends_on: condition: service_healthy`)

6. **Add Traefik route** (if externally accessible): create a router in `config/traefik/dynamic/routes.yml` with appropriate priority, middlewares, and TLS. Add a WebSocket router in `websockets.yml` if needed.

7. **Add secrets** (if needed): create secret file in `config/secrets/`, declare in `compose.secrets.yaml`, reference via `*_FILE` env var

8. **Add resource limit variable**: add `RAM_LIMIT_*` / `CPU_LIMIT_*` to `.env.example` and document in `docs/ENVIRONMENT_VARIABLES.md`

9. **Update documentation**:
   - `docs/ARCHITECTURE.md` -- add service to architecture diagram
   - `docs/ENVIRONMENT_VARIABLES.md` -- document new env vars
   - `.claude/context/base.md` -- add to service table

10. **Test**:
    ```bash
    docker compose up -d --build my-service
    docker compose ps my-service          # should show "healthy"
    docker compose logs my-service        # check for errors
    ```

## Common Commands

```bash
# Start all services
docker compose up -d

# Start with optional profiles
docker compose --profile tunnel up -d            # + Cloudflare tunnel
docker compose --profile monitoring up -d        # + Loki/Promtail

# Rebuild a single service after code changes
docker compose up -d --build dashboard-backend

# View logs
docker compose logs -f llm-service
docker compose logs --tail=100 reverse-proxy

# Check all service status
docker compose ps

# Restart a service
docker compose restart self-healing-agent

# Stop everything (keeps volumes)
docker compose down

# Stop everything AND destroy volumes (data loss!)
docker compose down -v

# Force full rebuild (no cache)
docker compose build --no-cache llm-service
```

## Reference Files

- **Root compose**: `docker-compose.yml`
- **Compose files**: `compose/*.yaml`
- **Traefik static**: `config/traefik/traefik.yml`
- **Traefik dynamic**: `config/traefik/dynamic/*.yml`
- **Secrets**: `config/secrets/` (not committed to git)
- **PostgreSQL config**: `config/postgres/postgresql.conf`
- **Loki config**: `config/loki/local-config.yaml`
- **Promtail config**: `config/promtail/config.yaml`
- **LLM Dockerfile**: `services/llm-service/Dockerfile`
- **Embedding Dockerfile**: `services/embedding-service/Dockerfile`
- **Bootstrap script**: `./arasul bootstrap` (generates secrets, certs, htpasswd hashes)
- **Env template**: `.env.example`
