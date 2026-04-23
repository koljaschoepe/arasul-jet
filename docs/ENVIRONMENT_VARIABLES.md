# Environment Variables

Reference for Arasul Platform configuration variables. Variables are
defined in `.env` at the repository root and propagated to containers
via `compose/`.

> **Drift check:** `scripts/docs/check-env-vars.sh` scans the backend
> (JS/TS) and Python services for `process.env.X` / `getEnvVar()` /
> `os.environ` references and diffs them against this doc. Run it
> before releasing new features that add env vars. Currently ~77
> vars are referenced in code but not documented here (mostly
> threshold knobs and indexer flags); the script soft-fails on that
> backlog rather than gating CI.

---

## System

| Variable        | Default    | Description                        |
| --------------- | ---------- | ---------------------------------- |
| SYSTEM_NAME     | arasul     | System identifier                  |
| SYSTEM_VERSION  | 1.0.0      | Current version                    |
| BUILD_HASH      | dev-build  | Git commit hash                    |
| JETPACK_VERSION | 6.0        | JetPack version                    |
| NODE_ENV        | production | Node.js environment                |
| NODE_VERSION    | 20.19      | Node.js version (Docker build arg) |
| PYTHON_VERSION  | 3.11.12    | Python version (Docker build arg)  |

---

## Authentication

| Variable               | Default    | Description                                         |
| ---------------------- | ---------- | --------------------------------------------------- |
| ADMIN_USERNAME         | admin      | Dashboard admin username                            |
| ADMIN_PASSWORD         | (required) | Dashboard admin password (redacted after bootstrap) |
| JWT_SECRET             | (required) | JWT signing key (32+ chars)                         |
| JWT_EXPIRY             | 24h        | Token expiration time                               |
| LOGIN_LOCKOUT_ATTEMPTS | 5          | Failed attempts before lockout                      |
| LOGIN_LOCKOUT_MINUTES  | 15         | Lockout duration                                    |
| FORCE_HTTPS            | false      | HTTPS erzwingen                                     |
| FORCE_SECURE_COOKIES   | false      | Secure-Flag für Cookies                             |

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

| Variable                    | Default     | Description                            |
| --------------------------- | ----------- | -------------------------------------- |
| MINIO_HOST                  | minio       | MinIO hostname                         |
| MINIO_PORT                  | 9000        | MinIO API port                         |
| MINIO_CONSOLE_PORT          | 9001        | MinIO console port                     |
| MINIO_ROOT_USER             | (required)  | MinIO access key                       |
| MINIO_ROOT_PASSWORD         | (required)  | MinIO secret key                       |
| MINIO_BROWSER               | true        | Enable web console                     |
| MINIO_DOCUMENTS_QUOTA_BYTES | 10737418240 | Dokument-Bucket Quota (Default: 10 GB) |

---

## LLM Service

> **Hinweis:** `LLM_HOST`, `LLM_PORT` und `LLM_MANAGEMENT_PORT` sind **deprecated**. Der interne Code verwendet `LLM_SERVICE_HOST`, `LLM_SERVICE_PORT` und `LLM_SERVICE_MANAGEMENT_PORT`. Die alten Namen werden noch als Fallback akzeptiert, sollten aber in neuen Konfigurationen nicht mehr verwendet werden.

| Variable                    | Default       | Description                                            |
| --------------------------- | ------------- | ------------------------------------------------------ |
| LLM_SERVICE_HOST            | llm-service   | Hostname des LLM-Service                               |
| LLM_SERVICE_PORT            | 11434         | Port des LLM-Service                                   |
| LLM_SERVICE_MANAGEMENT_PORT | 11436         | Management-Port des LLM-Service                        |
| LLM_HOST                    | llm-service   | _(deprecated)_ Alias für `LLM_SERVICE_HOST`            |
| LLM_PORT                    | 11434         | _(deprecated)_ Alias für `LLM_SERVICE_PORT`            |
| LLM_MANAGEMENT_PORT         | 11436         | _(deprecated)_ Alias für `LLM_SERVICE_MANAGEMENT_PORT` |
| LLM_MODEL                   | gemma4:26b-q4 | Default LLM model (Gemma 4, hardware-abhängig)         |
| LLM_MAX_TOKENS              | 2048          | Max response tokens                                    |
| LLM_CONTEXT_SIZE            | 4096          | Context window size                                    |
| LLM_MAX_RAM_GB              | 40            | Max RAM allocation (GB)                                |
| LLM_GPU_LAYERS              | 33            | GPU layers                                             |
| LLM_KEEP_ALIVE_SECONDS      | 300           | Model unload timeout                                   |
| OLLAMA_STARTUP_TIMEOUT      | 120           | Ollama startup timeout (seconds)                       |
| MAX_STORED_MODELS           | 10            | Maximale Anzahl gespeicherter Modelle                  |

---

## Model Management

Dynamic LLM model management with smart batching for Jetson devices.

| Variable                        | Default | Description                                     |
| ------------------------------- | ------- | ----------------------------------------------- |
| MODEL_BATCHING_ENABLED          | true    | Enable smart model batching                     |
| MODEL_MAX_WAIT_SECONDS          | 120     | Max wait before forcing model switch            |
| MODEL_SWITCH_COOLDOWN_SECONDS   | 5       | Cooldown between model switches                 |
| JETSON_TOTAL_RAM_GB             | 64      | Total Jetson RAM (GB)                           |
| JETSON_RESERVED_RAM_GB          | 10      | RAM reserved for system (GB)                    |
| OLLAMA_READY_TIMEOUT            | 300000  | Ollama startup timeout (ms, 5 min)              |
| OLLAMA_RETRY_INTERVAL           | 5000    | Retry interval for Ollama connection (ms)       |
| MODEL_SYNC_INTERVAL             | 60000   | Sync models with DB interval (ms, 1 min)        |
| MODEL_INACTIVITY_THRESHOLD      | 1800000 | Auto-unload model after inactivity (ms, 30 min) |
| RAM_CRITICAL_THRESHOLD          | 95      | RAM threshold for auto model unload (%)         |
| LONG_REQUEST_THRESHOLD          | 180000  | Long request threshold (ms, 3 min)              |
| LLM_BURST_WINDOW_MS             | 1000    | Burst window for rate limiting (ms)             |
| LLM_MAX_CONCURRENT_ENQUEUE      | 10      | Max parallel enqueue operations                 |
| OLLAMA_MAX_LOADED_MODELS        | 3       | Max models loaded simultaneously in RAM         |
| MODEL_LIFECYCLE_ENABLED         | true    | Enable adaptive model lifecycle management      |
| MODEL_PEAK_KEEP_ALIVE_MINUTES   | 30      | Keep-alive during peak usage hours (minutes)    |
| MODEL_NORMAL_KEEP_ALIVE_MINUTES | 10      | Keep-alive during normal usage hours (minutes)  |
| MODEL_IDLE_KEEP_ALIVE_MINUTES   | 2       | Keep-alive during idle hours (minutes)          |
| MODEL_PEAK_THRESHOLD            | 2       | Avg requests/hour to classify as peak           |
| MODEL_MEMORY_SAFETY_BUFFER_MB   | 2048    | Safety buffer for model memory budget (MB)      |

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

| Variable                   | Default                 | Description                                                                 |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| EMBEDDING_SERVICE_HOST     | embedding-service       | Service hostname                                                            |
| EMBEDDING_SERVICE_PORT     | 11435                   | Service port                                                                |
| EMBEDDING_MODEL            | BAAI/bge-m3             | HuggingFace model                                                           |
| EMBEDDING_VECTOR_SIZE      | 1024                    | Vector dimension for embedding model                                        |
| EMBEDDING_MAX_INPUT_TOKENS | 8192                    | Max input token length                                                      |
| EMBEDDING_USE_FP16         | false                   | Use FP16 for embeddings (saves ~50% memory, recommended for <=32GB devices) |
| EMBEDDING_MAX_BATCH_SIZE   | 100                     | Max batch size for embedding requests (lower on memory-constrained devices) |
| ENABLE_RERANKING           | true                    | Enable 2-stage reranking                                                    |
| FLASHRANK_MODEL            | ms-marco-MiniLM-L-12-v2 | CPU reranker model                                                          |
| BGE_RERANKER_MODEL         | BAAI/bge-reranker-v2-m3 | GPU reranker model                                                          |

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

| Variable                             | Default                      | Description                                    |
| ------------------------------------ | ---------------------------- | ---------------------------------------------- |
| DOCUMENT_INDEXER_HOST                | document-indexer             | Hostname des Document-Indexer                  |
| DOCUMENT_INDEXER_API_PORT            | 9102                         | API-Port des Document-Indexer                  |
| DOCUMENT_INDEXER_URL                 | http://document-indexer:9102 | Vollständige URL des Document-Indexer          |
| DOCUMENT_INDEXER_INTERVAL            | 30                           | Scan interval (seconds)                        |
| DOCUMENT_INDEXER_CHUNK_SIZE          | 500                          | Chunk size (chars)                             |
| DOCUMENT_INDEXER_CHUNK_OVERLAP       | 50                           | Chunk overlap (chars)                          |
| DOCUMENT_INDEXER_PARENT_CHUNK_SIZE   | 2000                         | Parent chunk size in tokens                    |
| DOCUMENT_INDEXER_CHILD_CHUNK_SIZE    | 400                          | Child chunk size in tokens                     |
| DOCUMENT_INDEXER_CHILD_CHUNK_OVERLAP | 50                           | Child chunk overlap in tokens                  |
| DOCUMENT_INDEXER_MINIO_BUCKET        | documents                    | Source bucket                                  |
| DOCUMENT_MAX_SIZE_MB                 | 100                          | Maximum file size (MB)                         |
| BM25_INDEX_PATH                      | /data/bm25_index             | Path for BM25 index persistence                |
| RAG_HYBRID_SEARCH                    | true                         | Enable hybrid keyword+vector search            |
| RAG_ENABLE_MULTI_QUERY               | true                         | Enable multi-query generation                  |
| RAG_ENABLE_HYDE                      | true                         | Enable HyDE query expansion                    |
| RAG_ENABLE_DECOMPOUND                | true                         | Enable German word decompounding               |
| RAG_ENABLE_RERANKING                 | true                         | Enable 2-stage reranking in RAG pipeline       |
| RAG_QUERY_OPTIMIZER_MODEL            | ""                           | Model for query optimization (empty = default) |
| SPACE_ROUTING_THRESHOLD              | 0.4                          | Space routing confidence threshold             |
| SPACE_ROUTING_MAX_SPACES             | 3                            | Max spaces to search in RAG                    |
| RAG_RELEVANCE_THRESHOLD              | 0.5                          | Min rerank score to include document (0-1)     |
| RAG_VECTOR_SCORE_THRESHOLD           | 0.55                         | Min vector score when reranker is off (0-1)    |
| RAG_ENABLE_GRAPH                     | false                        | Knowledge Graph für RAG aktivieren             |
| RAG_GRAPH_MAX_ENTITIES               | 50                           | Max Entities pro Graph-Traversal               |
| RAG_GRAPH_TRAVERSAL_DEPTH            | 2                            | Traversal-Tiefe im Knowledge Graph             |

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

See [CUSTOMER_OAUTH_SETUP.md](./CUSTOMER_OAUTH_SETUP.md) for detailed instructions.

---

## Tailscale (Remote Access VPN)

Tailscale provides secure remote access via WireGuard mesh VPN. Configured during setup wizard.

| Variable           | Default          | Description                                        |
| ------------------ | ---------------- | -------------------------------------------------- |
| TAILSCALE_ENABLED  | false            | Enable Tailscale during bootstrap                  |
| TAILSCALE_AUTH_KEY | (optional)       | Auth key from Tailscale admin (starts with tskey-) |
| TAILSCALE_HOSTNAME | (SETUP_HOSTNAME) | Hostname for the device in the Tailnet             |

### Setup

1. Create account at [tailscale.com](https://login.tailscale.com)
2. Generate auth key at Admin > Settings > Keys (reusable recommended)
3. Set environment variables in `.env`:
   ```bash
   TAILSCALE_ENABLED=true
   TAILSCALE_AUTH_KEY=tskey-auth-...
   TAILSCALE_HOSTNAME=mein-arasul
   ```
4. Run bootstrap: `./arasul bootstrap` (or configure during interactive setup)

Tailscale runs on the host (not in Docker). Status is available via `GET /api/tailscale/status`.

See [REMOTE_MAINTENANCE.md](./REMOTE_MAINTENANCE.md) for detailed remote access documentation.

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

| Variable                    | Default            | Description                     |
| --------------------------- | ------------------ | ------------------------------- |
| SELF_HEALING_HOST           | self-healing-agent | Hostname des Self-Healing-Agent |
| SELF_HEALING_PORT           | 8085               | Port des Self-Healing-Agent     |
| SELF_HEALING_INTERVAL       | 10                 | Check interval (seconds)        |
| SELF_HEALING_ENABLED        | true               | Enable healing actions          |
| SELF_HEALING_REBOOT_ENABLED | false              | Enable system reboot            |
| SELF_HEALING_HEARTBEAT_PORT | 9200               | Self-healing heartbeat port     |

### Thresholds

These thresholds are used by both Self-Healing and the Dashboard. If not set, device-specific defaults are auto-detected (see `/api/system/thresholds`).

| Variable                    | Default | Description                                      |
| --------------------------- | ------- | ------------------------------------------------ |
| CPU_WARNING_PERCENT         | (auto)  | CPU warning threshold (dashboard yellow)         |
| CPU_CRITICAL_PERCENT        | 90      | CPU critical threshold (dashboard red)           |
| RAM_WARNING_PERCENT         | (auto)  | RAM warning threshold                            |
| RAM_CRITICAL_PERCENT        | 90      | RAM critical threshold                           |
| GPU_WARNING_PERCENT         | (auto)  | GPU utilization warning threshold                |
| GPU_CRITICAL_PERCENT        | 95      | GPU utilization critical threshold               |
| GPU_MEMORY_WARNING_PERCENT  | 85      | GPU memory usage warning (triggers cache clear)  |
| GPU_MEMORY_CRITICAL_PERCENT | 92      | GPU memory usage critical (triggers LLM restart) |
| GPU_MEMORY_MAX_PERCENT      | 97      | GPU memory hard limit                            |
| DISK_WARNING_PERCENT        | 75      | Disk warning threshold                           |
| DISK_CLEANUP_PERCENT        | 85      | Disk cleanup threshold                           |
| DISK_CRITICAL_PERCENT       | 95      | Disk critical threshold                          |
| DISK_REBOOT_PERCENT         | 97      | Disk reboot threshold                            |
| TEMP_WARNING_CELSIUS        | (auto)  | Temperature warning (dashboard yellow)           |
| TEMP_CRITICAL_CELSIUS       | (auto)  | Temperature critical (dashboard red)             |
| TEMP_THROTTLE_CELSIUS       | 83      | Temperature throttle (self-healing)              |
| TEMP_RESTART_CELSIUS        | 85      | Temperature restart (self-healing)               |

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
./scripts/backup/backup.sh

# List available backups
./scripts/backup/restore.sh --list

# Restore from latest
./scripts/backup/restore.sh --latest

# Restore from specific date
./scripts/backup/restore.sh --all --date 20260105
```

---

## Dashboard

| Variable                  | Default                   | Description                          |
| ------------------------- | ------------------------- | ------------------------------------ |
| PORT                      | 3001                      | Backend port                         |
| ALLOWED_ORIGINS           | (empty)                   | CORS allowed origins                 |
| VITE_API_URL              | /api                      | Frontend API URL                     |
| VITE_WS_URL               | (auto)                    | Frontend WebSocket URL               |
| VITE_PLATFORM_NAME        | Arasul                    | Platform brand name (white-label)    |
| VITE_PLATFORM_SUBTITLE    | Edge AI Platform          | Subtitle shown in sidebar            |
| VITE_PLATFORM_DESCRIPTION | Edge-KI Verwaltungssystem | Description shown on login page      |
| VITE_SUPPORT_EMAIL        | info@arasul.de            | Support email (login & settings)     |
| CLAUDE_TERMINAL_TIMEOUT   | 60000                     | Claude terminal command timeout (ms) |
| RATE_LIMIT_ENABLED        | true                      | Enable API rate limiting             |

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
| SSH_PORT               | 2222                                 | SSH port (2222 after hardening)    |
| SSH_USER               | arasul                               | SSH username for app access        |
| UPDATE_PUBLIC_KEY_PATH | /arasul/config/public_update_key.pem | Public key for update verification |

---

## Jetson Device Configuration

These variables configure the platform for different NVIDIA Jetson devices. Use `./scripts/setup/detect-jetson.sh` to auto-detect and generate optimal values.

### GPU & Base Image

| Variable             | Default                 | Description                                                                      |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| TORCH_CUDA_ARCH_LIST | 8.7                     | CUDA compute capability (10.0=Thor, 8.7=Orin, 7.2=Xavier, 5.3=Nano)              |
| L4T_PYTORCH_TAG      | r36.4.0                 | dustynv/l4t-pytorch base image tag (build arg for embedding-service)             |
| CUDA_ARCH_LIST       | (=TORCH_CUDA_ARCH_LIST) | Docker build arg alias, passed to embedding-service Dockerfile                   |
| JETSON_PROFILE       | (auto)                  | Device profile name set by detect-jetson.sh (e.g. `thor_128gb`, `agx_orin_64gb`) |
| JETSON_DESCRIPTION   | (auto)                  | Human-readable device description (e.g. "NVIDIA Jetson Thor 128GB")              |
| JETSON_RAM_TOTAL     | (auto)                  | Detected total RAM in GB (read-only, set by detect-jetson.sh)                    |
| JETSON_CPU_CORES     | (auto)                  | Detected CPU core count (read-only, set by detect-jetson.sh)                     |

`TORCH_CUDA_ARCH_LIST` is used at both build time (as `CUDA_ARCH_LIST` build arg in `compose/compose.ai.yaml`) and runtime (passed to PyTorch inside the embedding-service container). The detection script sets this automatically based on device family. For Thor, the value `10.0` is speculative (Blackwell sm_100) and may need adjustment.

`L4T_PYTORCH_TAG` selects the dustynv/l4t-pytorch base image for the embedding-service Docker build. It must match the host L4T major.minor version. For Thor, the tag currently falls back to `r36.4.0` because dustynv has not yet published an L4T r37 image. The detection script verifies tag availability via `docker manifest inspect` and falls back automatically.

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

| Device           | RAM   | LLM Limit | Embedding | Qdrant | Default Model  |
| ---------------- | ----- | --------- | --------- | ------ | -------------- |
| Thor 128GB       | 128GB | 88G       | 8G        | 4G     | gemma4:31b-q8  |
| Thor 64GB        | 64GB  | 34G       | 6G        | 2G     | gemma4:31b-q4  |
| AGX Orin 64GB    | 64GB  | 38G       | 6G        | 2G     | gemma4:26b-q4  |
| AGX Orin 32GB    | 32GB  | 20G       | 3G        | 1G     | gemma4:e4b-q8  |
| Orin NX 16GB     | 16GB  | 10G       | 2G        | 1G     | gemma4:e4b-q4  |
| Orin NX/Nano 8GB | 8GB   | 5G        | 1G        | 512M   | phi3:mini      |
| Orin Nano 4GB    | 4GB   | 2G        | 512M      | 256M   | tinyllama:1.1b |
| Xavier AGX       | 32GB  | 20G       | 3G        | 2G     | gemma4:e4b-q4  |
| Xavier NX 8GB    | 8GB   | 5G        | 1G        | 512M   | phi3:mini      |
| Jetson Nano 4GB  | 4GB   | 2G        | 512M      | 256M   | tinyllama:1.1b |

### Auto-Detection

```bash
# Detect device and show profile
./scripts/setup/detect-jetson.sh detect

# Generate .env with optimal values
./scripts/setup/detect-jetson.sh generate

# Apply configuration
./scripts/setup/detect-jetson.sh apply

# See recommended models
./scripts/setup/detect-jetson.sh recommend
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
LLM_MODEL=gemma4:26b-q4
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
./scripts/validate/validate_config.sh
```

Validates:

- Required variables present
- Port ranges valid
- Password strength
- Threshold ordering (WARNING < CLEANUP < CRITICAL < REBOOT)
- Key lengths (JWT_SECRET, N8N_ENCRYPTION_KEY >= 32 chars)

---

## Docker Secrets (Production)

In production, sensitive values can be provided as Docker secrets instead of plain environment variables. This keeps secrets out of `.env` files, `docker inspect` output, and process listings.

### How It Works

1. Place each secret in a file under `config/secrets/` (one value per file, no trailing newline)
2. Start with the secrets override: `docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d`
3. Docker mounts the file at `/run/secrets/<name>` inside the container
4. Each service resolves `VAR_FILE` → `VAR` at startup before any other code runs

All existing code continues to read `process.env.VAR` / `os.getenv('VAR')` unchanged.

### Setup

```bash
# Create the secrets directory
mkdir -p config/secrets
chmod 700 config/secrets

# Create secret files (example)
echo -n 'YourDBPassword123!' > config/secrets/postgres_password
echo -n 'YourJWTSecret32chars!' > config/secrets/jwt_secret
echo -n 'minioadmin' > config/secrets/minio_root_user
echo -n 'YourMinioPassword123!' > config/secrets/minio_root_password
echo -n 'YourN8nEncryptionKey32chars!' > config/secrets/n8n_encryption_key

# Restrict permissions
chmod 600 config/secrets/*
```

### Supported Secrets

| Secret File           | Services                                                                                                | Resolves To           |
| --------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| `postgres_password`   | postgres-db, dashboard-backend, metrics-collector, self-healing-agent, document-indexer, backup-service | `POSTGRES_PASSWORD`   |
| `jwt_secret`          | dashboard-backend                                                                                       | `JWT_SECRET`          |
| `minio_root_user`     | minio, dashboard-backend, backup-service                                                                | `MINIO_ROOT_USER`     |
| `minio_root_password` | minio, dashboard-backend, document-indexer, backup-service                                              | `MINIO_ROOT_PASSWORD` |
| `n8n_encryption_key`  | n8n                                                                                                     | `N8N_ENCRYPTION_KEY`  |

### Additional Backend Secrets

The dashboard-backend resolver also supports these `_FILE` variables (add them to `docker-compose.secrets.yml` as needed):

- `ARASUL_DATA_DB_PASSWORD_FILE` → `ARASUL_DATA_DB_PASSWORD`
- `TELEGRAM_ENCRYPTION_KEY_FILE` → `TELEGRAM_ENCRYPTION_KEY`

### Precedence

If both `VAR` and `VAR_FILE` are set, the file-based value wins (overwrites the env var). Remove the plain env var from `.env` when switching to secrets.

---

## Related Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Setup & deployment guide
- [config/README.md](../config/README.md) - Config directory
