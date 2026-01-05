# Environment Variables

Complete reference for all Arasul Platform configuration variables.

All variables are defined in `.env` file at repository root.

---

## System

| Variable | Default | Description |
|----------|---------|-------------|
| SYSTEM_NAME | arasul | System identifier |
| SYSTEM_VERSION | 1.0.0 | Current version |
| BUILD_HASH | dev-build | Git commit hash |
| JETPACK_VERSION | 6.0 | JetPack version |

---

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| ADMIN_USERNAME | admin | Dashboard admin username |
| ADMIN_PASSWORD | (required) | Dashboard admin password |
| JWT_SECRET | (required) | JWT signing key (32+ chars) |
| JWT_EXPIRY | 24h | Token expiration time |
| LOGIN_LOCKOUT_ATTEMPTS | 5 | Failed attempts before lockout |
| LOGIN_LOCKOUT_MINUTES | 15 | Lockout duration |

---

## PostgreSQL

| Variable | Default | Description |
|----------|---------|-------------|
| POSTGRES_HOST | postgres-db | Database hostname |
| POSTGRES_PORT | 5432 | Database port |
| POSTGRES_USER | arasul | Database username |
| POSTGRES_PASSWORD | (required) | Database password |
| POSTGRES_DB | arasul_db | Database name |
| POSTGRES_MAX_CONNECTIONS | 100 | Max connections |
| POSTGRES_POOL_MIN | 2 | Min pool connections |
| POSTGRES_POOL_MAX | 20 | Max pool connections |
| POSTGRES_IDLE_TIMEOUT | 30000 | Idle timeout (ms) |

---

## MinIO (Object Storage)

| Variable | Default | Description |
|----------|---------|-------------|
| MINIO_HOST | minio | MinIO hostname |
| MINIO_PORT | 9000 | MinIO API port |
| MINIO_CONSOLE_PORT | 9001 | MinIO console port |
| MINIO_ROOT_USER | (required) | MinIO access key |
| MINIO_ROOT_PASSWORD | (required) | MinIO secret key |
| MINIO_BROWSER | true | Enable web console |

---

## LLM Service

| Variable | Default | Description |
|----------|---------|-------------|
| LLM_HOST | llm-service | LLM service hostname |
| LLM_PORT | 11434 | Ollama API port |
| LLM_MANAGEMENT_PORT | 11436 | Management API port |
| LLM_MODEL | qwen3:14b-q8 | Default LLM model |
| LLM_MAX_TOKENS | 2048 | Max response tokens |
| LLM_CONTEXT_SIZE | 4096 | Context window size |
| LLM_MAX_RAM_GB | 40 | Max RAM allocation (GB) |
| LLM_GPU_LAYERS | 33 | GPU layers |
| LLM_KEEP_ALIVE_SECONDS | 300 | Model unload timeout |

---

## Embedding Service

| Variable | Default | Description |
|----------|---------|-------------|
| EMBEDDING_SERVICE_HOST | embedding-service | Service hostname |
| EMBEDDING_SERVICE_PORT | 11435 | Service port |
| EMBEDDING_MODEL | nomic-ai/nomic-embed-text-v1.5 | HuggingFace model |
| EMBEDDING_VECTOR_SIZE | 768 | Vector dimensions |
| EMBEDDING_MAX_INPUT_TOKENS | 4096 | Max input tokens |

---

## Qdrant (Vector Database)

| Variable | Default | Description |
|----------|---------|-------------|
| QDRANT_HOST | qdrant | Qdrant hostname |
| QDRANT_PORT | 6333 | Qdrant HTTP port |
| QDRANT_GRPC_PORT | 6334 | Qdrant gRPC port |
| QDRANT_COLLECTION_NAME | documents | Default collection |

---

## Document Indexer

| Variable | Default | Description |
|----------|---------|-------------|
| DOCUMENT_INDEXER_INTERVAL | 30 | Scan interval (seconds) |
| DOCUMENT_INDEXER_CHUNK_SIZE | 500 | Chunk size (chars) |
| DOCUMENT_INDEXER_CHUNK_OVERLAP | 50 | Chunk overlap (chars) |
| DOCUMENT_INDEXER_MINIO_BUCKET | documents | Source bucket |

---

## n8n (Workflow)

| Variable | Default | Description |
|----------|---------|-------------|
| N8N_HOST | n8n | n8n hostname |
| N8N_PORT | 5678 | n8n port |
| N8N_BASIC_AUTH_USER | (required) | Basic auth username |
| N8N_BASIC_AUTH_PASSWORD | (required) | Basic auth password |
| N8N_ENCRYPTION_KEY | (required) | Encryption key (32+ chars) |

---

## Metrics

| Variable | Default | Description |
|----------|---------|-------------|
| METRICS_COLLECTOR_HOST | metrics-collector | Collector hostname |
| METRICS_INTERVAL_LIVE | 5 | Live update interval (s) |
| METRICS_INTERVAL_PERSIST | 30 | DB persist interval (s) |
| METRICS_RETENTION_DAYS | 7 | Data retention (days) |

---

## Self-Healing

| Variable | Default | Description |
|----------|---------|-------------|
| SELF_HEALING_INTERVAL | 10 | Check interval (seconds) |
| SELF_HEALING_ENABLED | true | Enable healing actions |
| SELF_HEALING_REBOOT_ENABLED | false | Enable system reboot |

### Thresholds

These thresholds are used by both Self-Healing and the Dashboard. If not set, device-specific defaults are auto-detected (see `/api/system/thresholds`).

| Variable | Default | Description |
|----------|---------|-------------|
| CPU_WARNING_PERCENT | (auto) | CPU warning threshold (dashboard yellow) |
| CPU_CRITICAL_PERCENT | 90 | CPU critical threshold (dashboard red) |
| RAM_WARNING_PERCENT | (auto) | RAM warning threshold |
| RAM_CRITICAL_PERCENT | 90 | RAM critical threshold |
| GPU_WARNING_PERCENT | (auto) | GPU warning threshold |
| GPU_CRITICAL_PERCENT | 95 | GPU critical threshold |
| DISK_WARNING_PERCENT | 80 | Disk warning threshold |
| DISK_CLEANUP_PERCENT | 90 | Disk cleanup threshold |
| DISK_CRITICAL_PERCENT | 95 | Disk critical threshold |
| DISK_REBOOT_PERCENT | 97 | Disk reboot threshold |
| TEMP_WARNING_CELSIUS | (auto) | Temperature warning (dashboard yellow) |
| TEMP_CRITICAL_CELSIUS | (auto) | Temperature critical (dashboard red) |
| TEMP_THROTTLE_CELSIUS | 83 | Temperature throttle (self-healing) |
| TEMP_RESTART_CELSIUS | 85 | Temperature restart (self-healing) |

**Auto-detected defaults by device:**
| Device | CPU warn/crit | RAM warn/crit | Temp warn/crit |
|--------|---------------|---------------|----------------|
| Jetson AGX Orin | 75/90 | 75/90 | 65/80 |
| Jetson Orin Nano | 70/85 | 70/85 | 60/75 |
| Jetson Nano | 65/80 | 65/80 | 55/70 |
| Generic Linux | 80/95 | 80/95 | 70/85 |

---

## Backup

| Variable | Default | Description |
|----------|---------|-------------|
| BACKUP_SCHEDULE | 0 2 * * * | Cron schedule (default: 2:00 AM daily) |
| BACKUP_RETENTION_DAYS | 30 | Days to keep daily backups |

### Optional: S3 Offsite Backups

| Variable | Default | Description |
|----------|---------|-------------|
| AWS_S3_BUCKET | (none) | S3 bucket for offsite backups |
| AWS_ACCESS_KEY_ID | (none) | AWS access key |
| AWS_SECRET_ACCESS_KEY | (none) | AWS secret key |
| AWS_DEFAULT_REGION | eu-central-1 | AWS region |

### Backup Commands

```bash
# Start backup service
docker compose up -d backup-service

# Manual backup
./scripts/backup.sh

# List available backups
./scripts/restore.sh --list

# Restore from latest
./scripts/restore.sh --latest

# Restore from specific date
./scripts/restore.sh --all --date 20260105
```

---

## Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Backend port |
| ALLOWED_ORIGINS | (empty) | CORS allowed origins |
| REACT_APP_API_URL | /api | Frontend API URL |
| REACT_APP_WS_URL | (auto) | Frontend WebSocket URL |

---

## Reverse Proxy (Traefik)

| Variable | Default | Description |
|----------|---------|-------------|
| TRAEFIK_DASHBOARD | false | Enable Traefik dashboard |
| TRAEFIK_ACME_EMAIL | (optional) | Let's Encrypt email |
| DOMAIN | (optional) | Public domain name |

---

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| LOG_LEVEL | info | Log level (debug/info/warn/error) |
| LOG_MAX_SIZE | 50m | Max log file size |
| LOG_MAX_FILES | 10 | Max log files |

---

## Required Variables

The following variables **must** be set before starting:

```bash
# Authentication
ADMIN_PASSWORD=<secure password>
JWT_SECRET=<32+ character random string>

# Database
POSTGRES_PASSWORD=<secure password>

# MinIO
MINIO_ROOT_USER=<access key>
MINIO_ROOT_PASSWORD=<secure password>

# n8n
N8N_BASIC_AUTH_USER=<username>
N8N_BASIC_AUTH_PASSWORD=<secure password>
N8N_ENCRYPTION_KEY=<32+ character random string>
```

## Example .env File

```bash
# System
SYSTEM_NAME=arasul
SYSTEM_VERSION=1.0.0

# Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourSecurePassword123!
JWT_SECRET=your-32-char-random-string-here-for-jwt
JWT_EXPIRY=24h

# PostgreSQL
POSTGRES_HOST=postgres-db
POSTGRES_PORT=5432
POSTGRES_USER=arasul
POSTGRES_PASSWORD=YourDBPassword123!
POSTGRES_DB=arasul_db

# MinIO
MINIO_HOST=minio
MINIO_PORT=9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=YourMinioPassword123!

# LLM
LLM_MODEL=qwen3:14b-q8
LLM_KEEP_ALIVE_SECONDS=300

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=YourN8nPassword123!
N8N_ENCRYPTION_KEY=your-32-char-random-string-here-for-n8n

# Self-Healing
SELF_HEALING_ENABLED=true
SELF_HEALING_REBOOT_ENABLED=false
```

---

## Validation

Run the validation script to check configuration:

```bash
./scripts/validate_config.sh
```

Validates:
- Required variables present
- Port ranges valid
- Password strength
- Threshold ordering (WARNING < CLEANUP < CRITICAL < REBOOT)
- Key lengths (JWT_SECRET, N8N_ENCRYPTION_KEY >= 32 chars)

---

## Related Documentation

- [INSTALLATION.md](../INSTALLATION.md) - Setup guide
- [config/README.md](../config/README.md) - Config directory
