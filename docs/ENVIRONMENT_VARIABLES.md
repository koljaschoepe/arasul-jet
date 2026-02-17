# Environment Variables

Complete reference for all Arasul Platform configuration variables.

All variables are defined in `.env` file at repository root.

---

## System

| Variable        | Default    | Description         |
| --------------- | ---------- | ------------------- |
| SYSTEM_NAME     | arasul     | System identifier   |
| SYSTEM_VERSION  | 1.0.0      | Current version     |
| BUILD_HASH      | dev-build  | Git commit hash     |
| JETPACK_VERSION | 6.0        | JetPack version     |
| NODE_ENV        | production | Node.js environment |

---

## Authentication

| Variable               | Default    | Description                    |
| ---------------------- | ---------- | ------------------------------ |
| ADMIN_USERNAME         | admin      | Dashboard admin username       |
| ADMIN_PASSWORD         | (required) | Dashboard admin password       |
| JWT_SECRET             | (required) | JWT signing key (32+ chars)    |
| JWT_EXPIRY             | 24h        | Token expiration time          |
| LOGIN_LOCKOUT_ATTEMPTS | 5          | Failed attempts before lockout |
| LOGIN_LOCKOUT_MINUTES  | 15         | Lockout duration               |

---

## PostgreSQL

| Variable                    | Default     | Description                |
| --------------------------- | ----------- | -------------------------- |
| POSTGRES_HOST               | postgres-db | Database hostname          |
| POSTGRES_PORT               | 5432        | Database port              |
| POSTGRES_USER               | arasul      | Database username          |
| POSTGRES_PASSWORD           | (required)  | Database password          |
| POSTGRES_DB                 | arasul_db   | Database name              |
| POSTGRES_MAX_CONNECTIONS    | 100         | Max connections            |
| POSTGRES_POOL_MIN           | 2           | Min pool connections       |
| POSTGRES_POOL_MAX           | 20          | Max pool connections       |
| POSTGRES_IDLE_TIMEOUT       | 30000       | Idle timeout (ms)          |
| POSTGRES_CONNECTION_TIMEOUT | 10000       | Connection timeout (ms)    |
| POSTGRES_STATEMENT_TIMEOUT  | 30000       | SQL statement timeout (ms) |

---

## Datentabellen (Dynamic Database)

| Variable                   | Default             | Description                     |
| -------------------------- | ------------------- | ------------------------------- |
| ARASUL_DATA_DB_HOST        | postgres-db         | Data DB hostname                |
| ARASUL_DATA_DB_PORT        | 5432                | Data DB port                    |
| ARASUL_DATA_DB_NAME        | arasul_data_db      | Data database name              |
| ARASUL_DATA_DB_USER        | arasul_data         | Data DB username                |
| ARASUL_DATA_DB_PASSWORD    | (POSTGRES_PASSWORD) | Data DB password                |
| DATA_DB_POOL_MAX           | 10                  | Data DB max pool connections    |
| DATA_DB_POOL_MIN           | 1                   | Data DB min pool connections    |
| DATA_DB_IDLE_TIMEOUT       | 30000               | Data DB idle timeout (ms)       |
| DATA_DB_CONNECTION_TIMEOUT | 10000               | Data DB connection timeout (ms) |

---

## MinIO (Object Storage)

| Variable            | Default    | Description        |
| ------------------- | ---------- | ------------------ |
| MINIO_HOST          | minio      | MinIO hostname     |
| MINIO_PORT          | 9000       | MinIO API port     |
| MINIO_CONSOLE_PORT  | 9001       | MinIO console port |
| MINIO_ROOT_USER     | (required) | MinIO access key   |
| MINIO_ROOT_PASSWORD | (required) | MinIO secret key   |
| MINIO_BROWSER       | true       | Enable web console |

---

## LLM Service

| Variable               | Default      | Description                      |
| ---------------------- | ------------ | -------------------------------- |
| LLM_HOST               | llm-service  | LLM service hostname             |
| LLM_PORT               | 11434        | Ollama API port                  |
| LLM_MANAGEMENT_PORT    | 11436        | Management API port              |
| LLM_MODEL              | qwen3:14b-q8 | Default LLM model                |
| LLM_MAX_TOKENS         | 2048         | Max response tokens              |
| LLM_CONTEXT_SIZE       | 4096         | Context window size              |
| LLM_MAX_RAM_GB         | 40           | Max RAM allocation (GB)          |
| LLM_GPU_LAYERS         | 33           | GPU layers                       |
| LLM_KEEP_ALIVE_SECONDS | 300          | Model unload timeout             |
| OLLAMA_STARTUP_TIMEOUT | 120          | Ollama startup timeout (seconds) |

---

## Model Management

Dynamic LLM model management with smart batching for Jetson devices.

| Variable                      | Default | Description                                     |
| ----------------------------- | ------- | ----------------------------------------------- |
| MODEL_BATCHING_ENABLED        | true    | Enable smart model batching                     |
| MODEL_MAX_WAIT_SECONDS        | 120     | Max wait before forcing model switch            |
| MODEL_SWITCH_COOLDOWN_SECONDS | 5       | Cooldown between model switches                 |
| JETSON_TOTAL_RAM_GB           | 64      | Total Jetson RAM (GB)                           |
| JETSON_RESERVED_RAM_GB        | 10      | RAM reserved for system (GB)                    |
| OLLAMA_READY_TIMEOUT          | 300000  | Ollama startup timeout (ms, 5 min)              |
| OLLAMA_RETRY_INTERVAL         | 5000    | Retry interval for Ollama connection (ms)       |
| MODEL_SYNC_INTERVAL           | 60000   | Sync models with DB interval (ms, 1 min)        |
| MODEL_INACTIVITY_THRESHOLD    | 1800000 | Auto-unload model after inactivity (ms, 30 min) |
| RAM_CRITICAL_THRESHOLD        | 95      | RAM threshold for auto model unload (%)         |
| LONG_REQUEST_THRESHOLD        | 180000  | Long request threshold (ms, 3 min)              |
| LLM_BURST_WINDOW_MS           | 1000    | Burst window for rate limiting (ms)             |
| LLM_MAX_CONCURRENT_ENQUEUE    | 10      | Max parallel enqueue operations                 |

### Smart Batching

When enabled, the queue system batches all requests for the currently loaded model before switching to a different model. This minimizes expensive model load times.

**Algorithm:**

1. Process all queued requests for current model
2. Only switch model when queue is empty OR max wait exceeded
3. Fairness: No request waits longer than `MODEL_MAX_WAIT_SECONDS`

**Example scenario:**

- Model A loaded, 5 requests for A and 3 for B in queue
- All 5 A requests processed first
- Then switch to B, process 3 B requests

---

## Embedding Service

| Variable                   | Default                        | Description       |
| -------------------------- | ------------------------------ | ----------------- |
| EMBEDDING_SERVICE_HOST     | embedding-service              | Service hostname  |
| EMBEDDING_SERVICE_PORT     | 11435                          | Service port      |
| EMBEDDING_MODEL            | nomic-ai/nomic-embed-text-v1.5 | HuggingFace model |
| EMBEDDING_VECTOR_SIZE      | 768                            | Vector dimensions |
| EMBEDDING_MAX_INPUT_TOKENS | 4096                           | Max input tokens  |

---

## Qdrant (Vector Database)

| Variable               | Default   | Description        |
| ---------------------- | --------- | ------------------ |
| QDRANT_HOST            | qdrant    | Qdrant hostname    |
| QDRANT_PORT            | 6333      | Qdrant HTTP port   |
| QDRANT_GRPC_PORT       | 6334      | Qdrant gRPC port   |
| QDRANT_COLLECTION_NAME | documents | Default collection |

---

## Document Indexer

| Variable                       | Default   | Description                         |
| ------------------------------ | --------- | ----------------------------------- |
| DOCUMENT_INDEXER_INTERVAL      | 30        | Scan interval (seconds)             |
| DOCUMENT_INDEXER_CHUNK_SIZE    | 500       | Chunk size (chars)                  |
| DOCUMENT_INDEXER_CHUNK_OVERLAP | 50        | Chunk overlap (chars)               |
| DOCUMENT_INDEXER_MINIO_BUCKET  | documents | Source bucket                       |
| DOCUMENT_MAX_SIZE_MB           | 100       | Maximum file size (MB)              |
| RAG_HYBRID_SEARCH              | true      | Enable hybrid keyword+vector search |
| SPACE_ROUTING_THRESHOLD        | 0.4       | Space routing confidence threshold  |
| SPACE_ROUTING_MAX_SPACES       | 3         | Max spaces to search in RAG         |

---

## n8n (Workflow)

| Variable                | Default                          | Description                          |
| ----------------------- | -------------------------------- | ------------------------------------ |
| N8N_HOST                | n8n                              | n8n hostname                         |
| N8N_PORT                | 5678                             | n8n port                             |
| N8N_BASIC_AUTH_USER     | (required)                       | Basic auth username                  |
| N8N_BASIC_AUTH_PASSWORD | (required)                       | Basic auth password                  |
| N8N_ENCRYPTION_KEY      | (required)                       | Encryption key (32+ chars)           |
| N8N_EXTERNAL_URL        | (optional)                       | Public HTTPS URL for OAuth callbacks |
| N8N_PROTOCOL            | https                            | Protocol (http/https)                |
| N8N_SECURE_COOKIE       | true                             | Secure cookies (true for HTTPS)      |
| N8N_URL                 | http://n8n:5678                  | n8n service URL                      |
| N8N_API_KEY             | (none)                           | n8n API key                          |
| N8N_WEBHOOK_SECRET      | (none)                           | n8n webhook verification secret      |
| N8N_SSH_KEY_PATH        | /arasul/ssh-keys/n8n_private_key | SSH key for n8n access               |

---

## Cloudflare Tunnel (OAuth Gateway)

Required for Google OAuth and external webhook access from other devices.

| Variable                | Default    | Description                                 |
| ----------------------- | ---------- | ------------------------------------------- |
| CLOUDFLARE_TUNNEL_TOKEN | (optional) | Tunnel token from Cloudflare Zero Trust     |
| N8N_EXTERNAL_URL        | (optional) | Public URL, e.g., `https://n8n.example.com` |
| RAM_LIMIT_CLOUDFLARED   | 128M       | Memory limit for cloudflared                |

### Setup

1. Create tunnel at [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels
2. Copy tunnel token (starts with `eyJ...`)
3. Set environment variables:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token
   N8N_EXTERNAL_URL=https://n8n.yourdomain.com
   ```
4. Configure public hostname in Cloudflare dashboard: `http://reverse-proxy:80`
5. Restart: `docker compose up -d cloudflared n8n`

See [N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md](./N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md) for detailed instructions.

---

## Metrics

| Variable                 | Default                       | Description              |
| ------------------------ | ----------------------------- | ------------------------ |
| METRICS_COLLECTOR_HOST   | metrics-collector             | Collector hostname       |
| METRICS_INTERVAL_LIVE    | 5                             | Live update interval (s) |
| METRICS_INTERVAL_PERSIST | 30                            | DB persist interval (s)  |
| METRICS_RETENTION_DAYS   | 7                             | Data retention (days)    |
| METRICS_URL              | http://metrics-collector:9100 | Metrics collector URL    |

---

## Self-Healing

| Variable                    | Default | Description                 |
| --------------------------- | ------- | --------------------------- |
| SELF_HEALING_INTERVAL       | 10      | Check interval (seconds)    |
| SELF_HEALING_ENABLED        | true    | Enable healing actions      |
| SELF_HEALING_REBOOT_ENABLED | false   | Enable system reboot        |
| SELF_HEALING_HEARTBEAT_PORT | 9200    | Self-healing heartbeat port |

### Thresholds

These thresholds are used by both Self-Healing and the Dashboard. If not set, device-specific defaults are auto-detected (see `/api/system/thresholds`).

| Variable              | Default | Description                              |
| --------------------- | ------- | ---------------------------------------- |
| CPU_WARNING_PERCENT   | (auto)  | CPU warning threshold (dashboard yellow) |
| CPU_CRITICAL_PERCENT  | 90      | CPU critical threshold (dashboard red)   |
| RAM_WARNING_PERCENT   | (auto)  | RAM warning threshold                    |
| RAM_CRITICAL_PERCENT  | 90      | RAM critical threshold                   |
| GPU_WARNING_PERCENT   | (auto)  | GPU warning threshold                    |
| GPU_CRITICAL_PERCENT  | 95      | GPU critical threshold                   |
| DISK_WARNING_PERCENT  | 80      | Disk warning threshold                   |
| DISK_CLEANUP_PERCENT  | 90      | Disk cleanup threshold                   |
| DISK_CRITICAL_PERCENT | 95      | Disk critical threshold                  |
| DISK_REBOOT_PERCENT   | 97      | Disk reboot threshold                    |
| TEMP_WARNING_CELSIUS  | (auto)  | Temperature warning (dashboard yellow)   |
| TEMP_CRITICAL_CELSIUS | (auto)  | Temperature critical (dashboard red)     |
| TEMP_THROTTLE_CELSIUS | 83      | Temperature throttle (self-healing)      |
| TEMP_RESTART_CELSIUS  | 85      | Temperature restart (self-healing)       |

**Auto-detected defaults by device:**
| Device | CPU warn/crit | RAM warn/crit | Temp warn/crit |
|--------|---------------|---------------|----------------|
| Jetson AGX Orin | 75/90 | 75/90 | 65/80 |
| Jetson Orin Nano | 70/85 | 70/85 | 60/75 |
| Jetson Nano | 65/80 | 65/80 | 55/70 |
| Generic Linux | 80/95 | 80/95 | 70/85 |

---

## Backup

| Variable              | Default      | Description                            |
| --------------------- | ------------ | -------------------------------------- |
| BACKUP_SCHEDULE       | 0 2 \* \* \* | Cron schedule (default: 2:00 AM daily) |
| BACKUP_RETENTION_DAYS | 30           | Days to keep daily backups             |

---

## Telegram Bot

### Core Configuration

| Variable                | Default    | Description                          |
| ----------------------- | ---------- | ------------------------------------ |
| TELEGRAM_BOT_TOKEN      | (required) | Bot token from @BotFather            |
| TELEGRAM_CHAT_ID        | -          | Default chat for notifications       |
| TELEGRAM_ALLOWED_USERS  | -          | Comma-separated user IDs (whitelist) |
| TELEGRAM_BOT_PORT       | 8090       | Health check port                    |
| TELEGRAM_NOTIFY_STARTUP | true       | Send startup notification            |
| TELEGRAM_NOTIFY_ERRORS  | true       | Send error notifications             |

### LLM Chat Configuration (Bot 2.0)

| Variable                      | Default                    | Description                                 |
| ----------------------------- | -------------------------- | ------------------------------------------- |
| TELEGRAM_LLM_ENABLED          | true                       | Enable LLM chat feature                     |
| TELEGRAM_DEFAULT_LLM_PROVIDER | ollama                     | Default provider (`ollama` or `claude`)     |
| TELEGRAM_DEFAULT_OLLAMA_MODEL | -                          | Default Ollama model (auto-select if empty) |
| TELEGRAM_DEFAULT_CLAUDE_MODEL | claude-3-5-sonnet-20241022 | Default Claude model                        |
| OLLAMA_URL                    | http://llm-service:11434   | Ollama API URL                              |
| OLLAMA_TIMEOUT                | 120                        | Ollama request timeout (seconds)            |

### Voice-to-Text Configuration

| Variable                | Default | Description                                       |
| ----------------------- | ------- | ------------------------------------------------- |
| TELEGRAM_VOICE_ENABLED  | false   | Enable voice message transcription                |
| TELEGRAM_VOICE_PROVIDER | local   | Voice provider (`local` or `api`)                 |
| TELEGRAM_WHISPER_MODEL  | base    | Whisper model size (tiny/base/small/medium/large) |
| OPENAI_API_KEY          | -       | OpenAI API key (for Whisper API provider)         |

### Session Configuration

| Variable                       | Default | Description                             |
| ------------------------------ | ------- | --------------------------------------- |
| TELEGRAM_MAX_CONTEXT_TOKENS    | 4096    | Maximum tokens for conversation context |
| TELEGRAM_SESSION_TIMEOUT_HOURS | 24      | Session auto-reset after inactivity     |

### Security Configuration

| Variable                | Default      | Description                           |
| ----------------------- | ------------ | ------------------------------------- |
| TELEGRAM_ENCRYPTION_KEY | (JWT_SECRET) | Encryption key for API keys (AES-256) |

### Advanced Configuration

| Variable                       | Default | Description                                 |
| ------------------------------ | ------- | ------------------------------------------- |
| TELEGRAM_MAX_RESPONSE_TOKENS   | 1024    | Max LLM response tokens per message         |
| TELEGRAM_MAX_VOICE_DURATION    | 120     | Max voice message duration (seconds)        |
| TELEGRAM_MAX_MESSAGE_LENGTH    | 4096    | Max Telegram message length (chars)         |
| TELEGRAM_NOTIFICATIONS_ENABLED | true    | Enable Telegram notifications               |
| TELEGRAM_RATE_LIMIT_PER_MINUTE | 10      | Max requests per minute per user            |
| TELEGRAM_RATE_LIMIT_PER_HOUR   | 100     | Max requests per hour per user              |
| THINKING_MODE                  | false   | Enable Claude extended thinking in Telegram |
| SKIP_PERMISSIONS               | false   | Skip permission checks (dev only)           |
| ORCHESTRATOR_MODE              | master  | Multi-bot orchestration mode                |
| PUBLIC_URL                     | (none)  | Public URL for Telegram webhooks            |

### Setup Instructions

1. Create bot via Telegram @BotFather (`/newbot`)
2. Copy bot token to `TELEGRAM_BOT_TOKEN`
3. Start bot and send `/start` to get your user ID
4. Optionally add your user ID to `TELEGRAM_ALLOWED_USERS`

### Bot 2.0 Features

**LLM Chat:**

- Send any message to chat with the AI
- Use `/new` to reset conversation
- Use `/model` to switch between Ollama and Claude
- Use `/context` to view memory usage

**Voice Messages:**

- Send voice messages (max 2 minutes)
- Automatic transcription via Whisper
- Transcribed text is processed through LLM

**API Keys:**

- Use `/apikey set claude <key>` to configure Claude API
- Keys are encrypted with AES-256-GCM
- Message containing key is auto-deleted

### Optional: S3 Offsite Backups

| Variable              | Default      | Description                   |
| --------------------- | ------------ | ----------------------------- |
| AWS_S3_BUCKET         | (none)       | S3 bucket for offsite backups |
| AWS_ACCESS_KEY_ID     | (none)       | AWS access key                |
| AWS_SECRET_ACCESS_KEY | (none)       | AWS secret key                |
| AWS_DEFAULT_REGION    | eu-central-1 | AWS region                    |

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

| Variable                | Default | Description                          |
| ----------------------- | ------- | ------------------------------------ |
| PORT                    | 3001    | Backend port                         |
| ALLOWED_ORIGINS         | (empty) | CORS allowed origins                 |
| REACT_APP_API_URL       | /api    | Frontend API URL                     |
| REACT_APP_WS_URL        | (auto)  | Frontend WebSocket URL               |
| CLAUDE_TERMINAL_TIMEOUT | 60000   | Claude terminal command timeout (ms) |
| RATE_LIMIT_ENABLED      | true    | Enable API rate limiting             |

---

## Reverse Proxy (Traefik)

| Variable           | Default    | Description              |
| ------------------ | ---------- | ------------------------ |
| TRAEFIK_DASHBOARD  | false      | Enable Traefik dashboard |
| TRAEFIK_ACME_EMAIL | (optional) | Let's Encrypt email      |
| DOMAIN             | (optional) | Public domain name       |

---

## Logging

| Variable      | Default      | Description                       |
| ------------- | ------------ | --------------------------------- |
| LOG_LEVEL     | info         | Log level (debug/info/warn/error) |
| LOG_MAX_SIZE  | 50m          | Max log file size                 |
| LOG_MAX_FILES | 10           | Max log files                     |
| LOG_DIR       | /arasul/logs | Log directory path                |

---

## System Paths & Networking

| Variable               | Default                              | Description                        |
| ---------------------- | ------------------------------------ | ---------------------------------- |
| ENV_FILE_PATH          | /arasul/config/.env                  | Path to runtime .env file          |
| APPSTORE_MANIFESTS_DIR | /arasul/appstore/manifests           | App store manifest directory       |
| DOCKER_GATEWAY_IP      | 172.30.0.1                           | Docker bridge gateway IP           |
| DOCKER_NETWORK         | arasul-jet_arasul-net                | Docker network name                |
| SSH_PORT               | 22                                   | SSH port for app access            |
| SSH_USER               | arasul                               | SSH username for app access        |
| UPDATE_PUBLIC_KEY_PATH | /arasul/config/public_update_key.pem | Public key for update verification |

---

## Jetson Device Configuration

These variables configure the platform for different NVIDIA Jetson devices. Use `./scripts/detect-jetson.sh` to auto-detect and generate optimal values.

### CUDA Architecture

| Variable             | Default | Description                                              |
| -------------------- | ------- | -------------------------------------------------------- |
| TORCH_CUDA_ARCH_LIST | 8.7     | CUDA compute capability (8.7=Orin, 7.2=Xavier, 5.3=Nano) |

### Memory Limits (per Service)

All memory limits use Docker memory notation (e.g., `512M`, `2G`, `48G`).

| Variable                   | Default | Description                  |
| -------------------------- | ------- | ---------------------------- |
| RAM_LIMIT_LLM              | 48G     | LLM service memory           |
| RAM_LIMIT_EMBEDDING        | 8G      | Embedding service memory     |
| RAM_LIMIT_QDRANT           | 4G      | Qdrant vector DB memory      |
| RAM_LIMIT_MINIO            | 4G      | MinIO object storage memory  |
| RAM_LIMIT_POSTGRES         | 2G      | PostgreSQL database memory   |
| RAM_LIMIT_N8N              | 2G      | n8n workflow engine memory   |
| RAM_LIMIT_DOCUMENT_INDEXER | 2G      | Document indexer memory      |
| RAM_LIMIT_METRICS          | 512M    | Metrics collector memory     |
| RAM_LIMIT_SELF_HEALING     | 512M    | Self-healing agent memory    |
| RAM_LIMIT_REVERSE_PROXY    | 512M    | Traefik reverse proxy memory |
| RAM_LIMIT_FRONTEND         | 256M    | Dashboard frontend memory    |
| RAM_LIMIT_BACKUP           | 256M    | Backup service memory        |
| RAM_LIMIT_TELEGRAM         | 256M    | Telegram bot memory          |
| RAM_LIMIT_BACKEND          | 1G      | Dashboard backend memory     |

### CPU Limits

| Variable            | Default | Description                 |
| ------------------- | ------- | --------------------------- |
| CPU_LIMIT_LLM       | 8       | LLM service CPU cores       |
| CPU_LIMIT_EMBEDDING | 4       | Embedding service CPU cores |
| CPU_LIMIT_DASHBOARD | 2       | Dashboard backend CPU cores |

### Device Profiles

Pre-configured profiles for common Jetson devices:

| Device           | RAM  | LLM Limit | Embedding | Qdrant | Recommended Model |
| ---------------- | ---- | --------- | --------- | ------ | ----------------- |
| AGX Orin 64GB    | 64GB | 48G       | 8G        | 4G     | qwen3:14b-q8      |
| AGX Orin 32GB    | 32GB | 24G       | 4G        | 2G     | qwen3:8b-q8       |
| Orin NX 16GB     | 16GB | 10G       | 2G        | 1G     | llama3.1:8b       |
| Orin NX/Nano 8GB | 8GB  | 5G        | 1G        | 512M   | phi3:mini         |
| Orin Nano 4GB    | 4GB  | 2G        | 512M      | 256M   | tinyllama:1.1b    |
| Xavier AGX 32GB  | 32GB | 24G       | 4G        | 2G     | llama3.1:8b       |
| Xavier NX 8GB    | 8GB  | 5G        | 1G        | 512M   | phi3:mini         |
| Jetson Nano 4GB  | 4GB  | 2G        | 512M      | 256M   | tinyllama:1.1b    |

### Auto-Detection

```bash
# Detect device and show profile
./scripts/detect-jetson.sh detect

# Generate .env with optimal values
./scripts/detect-jetson.sh generate

# Apply configuration
./scripts/detect-jetson.sh apply

# See recommended models
./scripts/detect-jetson.sh recommend
```

See [docs/JETSON_COMPATIBILITY.md](JETSON_COMPATIBILITY.md) for full device compatibility guide.

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
