# Environment Variables

Complete reference for all Arasul Platform configuration variables.

All variables are defined in `.env` file at repository root.

---

## System

| Variable        | Default    | Description                        |
| --------------- | ---------- | ---------------------------------- |
| SYSTEM_NAME     | arasul     | System identifier                  |
| SYSTEM_VERSION  | 1.0.0      | Current version                    |
| BUILD_HASH      | dev-build  | Git commit hash                    |
| JETPACK_VERSION | 6.0        | JetPack version                    |
| NODE_ENV        | production | Node.js environment                |
| NODE_VERSION    | 22         | Node.js version (Docker build arg) |
| PYTHON_VERSION  | 3.11.12    | Python version (Docker build arg)  |

---

## Authentication

| Variable               | Default            | Description                                         |
| ---------------------- | ------------------ | --------------------------------------------------- |
| ADMIN_USERNAME         | admin              | Dashboard admin username                            |
| ADMIN_PASSWORD         | (required)         | Dashboard admin password (redacted after bootstrap) |
| ADMIN_EMAIL            | admin@arasul.local | Bootstrap admin email                               |
| JWT_SECRET             | (required)         | JWT signing key (32+ chars)                         |
| JWT_EXPIRY             | 4h                 | Token expiration time                               |
| LOGIN_LOCKOUT_ATTEMPTS | 5                  | Failed attempts before lockout                      |
| LOGIN_LOCKOUT_MINUTES  | 15                 | Lockout duration                                    |
| FORCE_HTTPS            | false              | HTTPS erzwingen                                     |
| FORCE_SECURE_COOKIES   | false              | Secure-Flag für Cookies                             |

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

| Variable                    | Default       | Description                                                                                                                                                                                               |
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM_SERVICE_HOST            | llm-service   | Hostname des LLM-Service                                                                                                                                                                                  |
| LLM_SERVICE_PORT            | 11434         | Port des LLM-Service                                                                                                                                                                                      |
| LLM_SERVICE_MANAGEMENT_PORT | 11436         | Management-Port des LLM-Service                                                                                                                                                                           |
| LLM_HOST                    | llm-service   | _(deprecated)_ Alias für `LLM_SERVICE_HOST`                                                                                                                                                               |
| LLM_PORT                    | 11434         | _(deprecated)_ Alias für `LLM_SERVICE_PORT`                                                                                                                                                               |
| LLM_MANAGEMENT_PORT         | 11436         | _(deprecated)_ Alias für `LLM_SERVICE_MANAGEMENT_PORT`                                                                                                                                                    |
| LLM_MODEL                   | gemma4:26b-q4 | Default LLM model (Gemma 4, hardware-abhängig)                                                                                                                                                            |
| LLM_MAX_TOKENS              | 2048          | Max response tokens                                                                                                                                                                                       |
| LLM_CONTEXT_SIZE            | 4096          | Context window size                                                                                                                                                                                       |
| LLM_MAX_RAM_GB              | 40            | Max RAM allocation (GB)                                                                                                                                                                                   |
| LLM_GPU_LAYERS              | 33            | GPU layers                                                                                                                                                                                                |
| LLM_KEEP_ALIVE_SECONDS      | 3600          | Seconds Ollama keeps a loaded model resident (default 1h after migration 094)                                                                                                                             |
| OLLAMA_NUM_PARALLEL         | 2             | Concurrent Ollama generation slots (1 on tight 32 GB Orin)                                                                                                                                                |
| OLLAMA_CONTEXT_LENGTH       | 32768         | Default-Kontextfenster aller Ollama-Modelle. ≥32k nötig für n8n-Agent-Tool-Calling (Ollama truncated sonst still). Auf knappen 32-GB-Orins via `.env` absenkbar — siehe `docs/integrations/N8N_AGENTS.md` |
| OLLAMA_STARTUP_TIMEOUT      | 120           | Ollama startup timeout (seconds)                                                                                                                                                                          |
| MAX_STORED_MODELS           | 10            | Maximale Anzahl gespeicherter Modelle                                                                                                                                                                     |
| MEMORY_MAX_ENTRIES          | 500           | Per-user max entries in conversation memory store                                                                                                                                                         |

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

| Variable                             | Default                      | Description                                                                                              |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| DOCUMENT_INDEXER_HOST                | document-indexer             | Hostname des Document-Indexer                                                                            |
| DOCUMENT_INDEXER_API_PORT            | 9102                         | API-Port des Document-Indexer                                                                            |
| DOCUMENT_INDEXER_URL                 | http://document-indexer:9102 | Vollständige URL des Document-Indexer                                                                    |
| DOCUMENT_INDEXER_INTERVAL            | 30                           | Scan interval (seconds)                                                                                  |
| INDEXER_WATCHDOG_INTERVAL_SECONDS    | 300                          | Periodic recover_stuck_processing interval (s)                                                           |
| INDEXER_LLM_CONTEXT_CACHE_MAX        | 1000                         | LRU max entries for LLM contextualization cache                                                          |
| DOCUMENT_INDEXER_CHUNK_SIZE          | 500                          | Chunk size (chars)                                                                                       |
| DOCUMENT_INDEXER_CHUNK_OVERLAP       | 50                           | Chunk overlap (chars)                                                                                    |
| DOCUMENT_INDEXER_PARENT_CHUNK_SIZE   | 2000                         | Parent chunk size in tokens                                                                              |
| DOCUMENT_INDEXER_CHILD_CHUNK_SIZE    | 400                          | Child chunk size in tokens                                                                               |
| DOCUMENT_INDEXER_CHILD_CHUNK_OVERLAP | 50                           | Child chunk overlap in tokens                                                                            |
| DOCUMENT_INDEXER_MINIO_BUCKET        | documents                    | Source bucket                                                                                            |
| DOCUMENT_MAX_SIZE_MB                 | 100                          | Maximum file size (MB)                                                                                   |
| BM25_INDEX_PATH                      | /data/bm25_index             | Path for BM25 index persistence                                                                          |
| RAG_HYBRID_SEARCH                    | true                         | Enable hybrid keyword+vector search                                                                      |
| RAG_ENABLE_MULTI_QUERY               | true                         | Enable multi-query generation                                                                            |
| RAG_ENABLE_HYDE                      | true                         | Enable HyDE query expansion                                                                              |
| RAG_ENABLE_DECOMPOUND                | true                         | Enable German word decompounding                                                                         |
| RAG_ENABLE_RERANKING                 | true                         | Enable 2-stage reranking in RAG pipeline                                                                 |
| RAG_QUERY_OPTIMIZER_MODEL            | ""                           | Model for query optimization (empty = default)                                                           |
| SPACE_ROUTING_THRESHOLD              | 0.4                          | Space routing confidence threshold                                                                       |
| SPACE_ROUTING_MAX_SPACES             | 3                            | Max spaces to search in RAG                                                                              |
| RAG_RELEVANCE_THRESHOLD              | 0.55                         | Min rerank score to include document (0-1) — raised from 0.01 in plan llm-rag-store-routing-optimization |
| RAG_VECTOR_SCORE_THRESHOLD           | 0.30                         | Min vector score when reranker is off (0-1) — raised from 0.005                                          |
| RAG_TIMEOUT_RERANK_MS                | 8000                         | Per-request rerank timeout — reduced from 120000                                                         |
| RAG_FINAL_K                          | 4                            | Final chunk count delivered to the LLM after MMR + dedupe                                                |
| STAGE2_VRAM_FLOOR_MB                 | 2048                         | Skip BGE-CrossEncoder Stage 2 when free VRAM drops below this floor                                      |
| DOCUMENT_INDEXER_CONTEXT_MODE        | heuristic                    | Chunk-context mode in indexer: `heuristic` (default, fast) or `llm` (high-recall, slow)                  |
| RAG_ENABLE_GRAPH                     | false                        | Knowledge Graph für RAG aktivieren                                                                       |
| RAG_GRAPH_MAX_ENTITIES               | 50                           | Max Entities pro Graph-Traversal                                                                         |
| RAG_GRAPH_TRAVERSAL_DEPTH            | 2                            | Traversal-Tiefe im Knowledge Graph                                                                       |

> **`system_settings` überschreibt env (Migration 094 + 096).** Die RAG/LLM-Tunables
> oben (`RAG_HYBRID_SEARCH`, `RAG_ENABLE_RERANKING`, `SPACE_ROUTING_THRESHOLD`,
> `SPACE_ROUTING_MAX_SPACES`, `RAG_RELEVANCE_THRESHOLD`, `RAG_VECTOR_SCORE_THRESHOLD`,
> `RAG_TIMEOUT_RERANK_MS`, `RAG_FINAL_K` sowie Temperatur/`num_predict`/MMR/Dedup)
> sind zur Laufzeit über die gleichnamigen `system_settings`-Spalten steuerbar und
> werden im Admin-Dashboard unter **Settings → „RAG & LLM"** bearbeitet. Der env-Wert
> ist nur noch der **Fallback**, falls die DB-Spalte `NULL`/leer ist. Änderungen über
> `PATCH /api/rag/settings` wirken sofort (Cache-Reload, kein Neustart). Der
> Basis-System-Prompt ist zusätzlich über die DB-Spalte `llm_base_system_prompt`
> editierbar (leer = eingebauter Default).

---

## n8n (Workflow)

| Variable                | Default                          | Description                                                                                                                                                |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N8N_HOST                | n8n                              | n8n hostname                                                                                                                                               |
| N8N_PORT                | 5678                             | n8n port                                                                                                                                                   |
| N8N_BASIC_AUTH_USER     | (deprecated, unused)             | Legacy basic-auth user. n8n 2.x runs with `N8N_BASIC_AUTH_ACTIVE=false`; auth is the fixed owner + forward-auth (Plan 007). Kept only for backward-compat. |
| N8N_BASIC_AUTH_PASSWORD | (deprecated, unused)             | Legacy basic-auth password — see above. Not required.                                                                                                      |
| N8N_ENCRYPTION_KEY      | (required)                       | Encryption key (32+ chars)                                                                                                                                 |
| N8N_OWNER_EMAIL         | via `n8n_owner_email` secret     | Fixed n8n owner e-mail (Plan 007). Resolved from the Docker secret; provisions the owner and drives `GET /api/automations/session`.                        |
| N8N_OWNER_PASSWORD      | via `n8n_owner_password` secret  | Fixed n8n owner password (Plan 007). Must satisfy n8n's policy (≥8 chars, ≥1 uppercase, ≥1 digit); auto-generated compliant.                               |
| N8N_EXTERNAL_URL        | (optional)                       | Public HTTPS URL for OAuth callbacks                                                                                                                       |
| N8N_PROTOCOL            | https                            | Protocol (http/https)                                                                                                                                      |
| N8N_SECURE_COOKIE       | true                             | Secure cookies (true for HTTPS)                                                                                                                            |
| N8N_URL                 | http://n8n:5678                  | n8n service URL                                                                                                                                            |
| N8N_API_KEY             | (none)                           | n8n API key                                                                                                                                                |
| N8N_WEBHOOK_SECRET      | (none)                           | n8n webhook verification secret                                                                                                                            |
| N8N_SSH_KEY_PATH        | /arasul/ssh-keys/n8n_private_key | SSH key for n8n access                                                                                                                                     |
| N8N_PROXY_HOPS          | 1                                | trust-proxy hop count behind Traefik                                                                                                                       |

### n8n 2.x — Task Runner & Agent-Härtung

Gesetzt in `compose/compose.app.yaml` (n8n + n8n-runners) bzw.
`compose/compose.secrets.yaml`; Hintergrund in
[docs/integrations/N8N_AGENTS.md](integrations/N8N_AGENTS.md).

| Variable                          | Default / Wert                                                                | Description                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N8N_RUNNERS_MODE                  | external                                                                      | Code-Nodes laufen im Sidecar `n8n-runners` statt im n8n-Prozess                                                                                                                                                            |
| N8N_RUNNERS_BROKER_LISTEN_ADDRESS | 0.0.0.0                                                                       | Task-Broker (Port 5679, nur Docker-Netz) für den Sidecar erreichbar machen                                                                                                                                                 |
| N8N_RUNNERS_AUTH_TOKEN            | (Docker-Secret `n8n_runners_auth_token`)                                      | Gemeinsames Auth-Token n8n ↔ Runner. Generiert von Setup/Bootstrap; nie in `.env` oder Compose eintragen                                                                                                                   |
| N8N_RUNNERS_TASK_BROKER_URI       | http://n8n:5679                                                               | (n8n-runners) Adresse des Task-Brokers                                                                                                                                                                                     |
| N8N_RUNNERS_LAUNCHER_LOG_LEVEL    | info                                                                          | (n8n-runners) Log-Level des Launchers                                                                                                                                                                                      |
| NODE_FUNCTION_ALLOW_BUILTIN       | crypto,fs,fs/promises,path                                                    | (n8n-runners) Freigegebene Node-Builtins im JS-Runner — nötig für Datei-Ablage im Agent-Workspace. **Nicht als Env setzbar**: wirkt nur über `services/n8n/runners/n8n-task-runners.json` (→ `/etc/n8n-task-runners.json`) |
| N8N_RESTRICT_FILE_ACCESS_TO       | /data/agent-workspace                                                         | Einziger für Datei-Nodes erlaubter Pfad (Volume `n8n-agent-workspace`, in n8n **und** n8n-runners gemountet)                                                                                                               |
| N8N_SSRF_PROTECTION_ENABLED       | true                                                                          | SSRF-Schutz der HTTP-Nodes (ab n8n 2.12): blockt RFC1918/Loopback/Link-Local inkl. Redirect/DNS-Rebinding                                                                                                                  |
| N8N_SSRF_ALLOWED_HOSTNAMES        | llm-service,qdrant,dashboard-backend,minio,embedding-service,document-indexer | Interne Hostnames, die trotz SSRF-Schutz erreichbar sind (Allowlist > Blocklist); postgres-db bewusst nicht                                                                                                                |
| N8N_DISABLED_MODULES              | mcp                                                                           | Instanzweiten MCP-Server abschalten (MCP-Client-Tool-Node bleibt nutzbar)                                                                                                                                                  |
| N8N_TEMPLATES_ENABLED             | false                                                                         | Kein Template-Store-Callout zu api.n8n.io (GDPR/offline)                                                                                                                                                                   |
| N8N_AGENT_MODEL                   | qwen3:8b                                                                      | (nur `scripts/util/n8n-import-templates.sh`) Default-Agent-Modell, das provisioniert wird                                                                                                                                  |
| RAM_LIMIT_N8N_RUNNERS             | 1G                                                                            | Memory-Limit des Runner-Sidecars                                                                                                                                                                                           |

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

See [CUSTOMER_OAUTH_SETUP.md](./features/CUSTOMER_OAUTH_SETUP.md) for detailed instructions.

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

### Browser-trusted remote HTTPS (`tailscale serve`)

Remote access is a deliberate opt-in — the delivery default is LAN-only. Once
connected, the device is reachable at `https://<device>.<tailnet>.ts.net`. To get
a **browser-trusted certificate** (green lock, no warning), `tailscale serve`
proxies the tailnet HTTPS endpoint to Traefik on port 443. This is enabled
automatically after connecting (via the dashboard or `setup-tailscale.sh`), and
can be managed via:

| Endpoint                      | Effect                                             |
| ----------------------------- | -------------------------------------------------- |
| `GET /api/tailscale/serve`    | Report serve state + whether HTTPS certs are ready |
| `POST /api/tailscale/serve`   | Enable serve (→ Traefik:443)                       |
| `DELETE /api/tailscale/serve` | Disable serve (falls back to the raw Tailscale IP) |

> **One-time admin action:** MagicDNS **and** HTTPS certificates must be enabled
> once in the Tailscale admin console (DNS settings) for the trusted cert to be
> issued. Until then, remote access still works over the raw Tailscale IP (with a
> certificate warning). The dashboard's Fernzugriff tab surfaces this state.

See [REMOTE_MAINTENANCE.md](./ops/REMOTE_MAINTENANCE.md) for detailed remote access documentation.

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

## Backup & Ops

### Backup Paths

| Variable             | Default                     | Description                                               |
| -------------------- | --------------------------- | --------------------------------------------------------- |
| BACKUP_REPORT_PATH   | /backups/backup_report.json | Path to last-run backup status JSON (used by healthcheck) |
| EXTERNAL_BACKUP_PATH | (none)                      | Optional: mount path for external drive backup copy       |

### Self-Healing / Ops

| Variable                    | Default | Description                                                            |
| --------------------------- | ------- | ---------------------------------------------------------------------- |
| SELF_HEALING_WEBHOOK_SECRET | (none)  | Shared secret for `/api/events/webhook/self-healing` auth              |
| COMPOSE_PROJECT_DIR         | (none)  | Absolute path to the arasul-jet repo root (used by backend ops routes) |

### Optional: S3 Offsite Backups

| Variable              | Default      | Description                   |
| --------------------- | ------------ | ----------------------------- |
| AWS_S3_BUCKET         | (none)       | S3 bucket for offsite backups |
| AWS_ACCESS_KEY_ID     | (none)       | AWS access key                |
| AWS_SECRET_ACCESS_KEY | (none)       | AWS secret key                |
| AWS_DEFAULT_REGION    | eu-central-1 | AWS region                    |

### Backup Commands

Backup/restore commands and workflow live in the canonical backup doc —
see [`docs/ops/BACKUP_SYSTEM.md`](ops/BACKUP_SYSTEM.md). This page documents only
the backup-related **environment variables** above.

---

## Dashboard

| Variable                  | Default                   | Description                                                                                                                                                                                                     |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT                      | 3001                      | Backend port                                                                                                                                                                                                    |
| ALLOWED_ORIGINS           | (empty)                   | Extra CORS origins. Usually stays empty: LAN (RFC-1918 IPs + `*.local`), `localhost`, and Tailscale (CGNAT `100.64.0.0/10` + `*.ts.net`) are allowed automatically. Only add here for an unusual custom domain. |
| VITE_API_URL              | /api                      | Frontend API URL                                                                                                                                                                                                |
| VITE_WS_URL               | (auto)                    | Frontend WebSocket URL                                                                                                                                                                                          |
| VITE_PLATFORM_NAME        | Arasul                    | Platform brand name (white-label)                                                                                                                                                                               |
| VITE_PLATFORM_SUBTITLE    | Edge AI Platform          | Subtitle shown in sidebar                                                                                                                                                                                       |
| VITE_PLATFORM_DESCRIPTION | Edge-KI Verwaltungssystem | Description shown on login page                                                                                                                                                                                 |
| VITE_SUPPORT_EMAIL        | info@arasul.de            | Support email (login & settings)                                                                                                                                                                                |
| CLAUDE_TERMINAL_TIMEOUT   | 60000                     | Claude terminal command timeout (ms)                                                                                                                                                                            |
| RATE_LIMIT_ENABLED        | true                      | Enable API rate limiting                                                                                                                                                                                        |

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

## Sandbox

Per-project developer sandboxes (dashboard-backend `services/sandbox/`).

| Variable                     | Default                          | Description                                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SANDBOX_DATA_DIR             | /arasul/sandbox/projects         | Backend-container path where sandbox project dirs are visible (bind mount, `compose/compose.app.yaml`)                                                                                                                                                                               |
| SANDBOX_HOST_DATA_DIR        | (auto-detected)                  | Host path of `data/sandbox/projects` for Docker bind mounts; auto-resolved by inspecting the backend container's own mounts                                                                                                                                                          |
| SANDBOX_HOST_TOOLS_DIR       | (sibling of projects: `…/tools`) | Host path of `data/sandbox/tools`, mounted read-only into every sandbox container at `/opt/tools` (open-ara sources)                                                                                                                                                                 |
| SANDBOX_HOST_REPO_DIR        | (ancestor of projects dir)       | Host path of the platform repo, mounted **rw** at `/workspace/repo` in `infrastructure`-mode containers. Fallback: derived from the projects dir (`…/data/sandbox/projects` → repo root); on the Jetson this resolves to `/home/arasul/arasul/arasul-jet`                            |
| SANDBOX_DOCKER_SOCK_GID      | (DOCKER_GID → stat → 994)        | GID of the host docker group; `infrastructure`-mode containers get it via `GroupAdd` so the unprivileged user can use the mounted `/var/run/docker.sock` (no extra capabilities). Resolution: `SANDBOX_DOCKER_SOCK_GID` → `DOCKER_GID` → `stat` of the socket → Jetson default `994` |
| CLAUDE_LOGIN_EXEC_TIMEOUT_MS | 15000                            | Wall-clock limit (ms) for the `docker exec` calls that capture/restore the Claude Code login files in a sandbox container (Plan 008 Schritt 14, `externalCredentialsService`)                                                                                                        |

Inside each sandbox container, the backend sets `ARASUL_OLLAMA_URL=http://llm-service:11434` as default endpoint for local agents (open-ara). It only resolves when the project's network mode is `internal` or `infrastructure`; project-level environment variables override it per shell session.

Network modes (`sandbox_projects.network_mode`, CHECK in migration 100): `isolated` (bridge, Internet only — GDPR-clean test environment), `internal` (backend network: LLM/Qdrant/DB), `infrastructure` (like `internal` plus platform repo rw + docker socket; **admin role only**, creation is audit-logged).

---

## System Paths & Networking

| Variable               | Default                              | Description                                                                                                                                                                                        |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MDNS_NAME              | arasul                               | LAN hostname (without `.local`). Drives the access name `https://<MDNS_NAME>.local`, the self-signed cert CN, and `GET /api/system/network`. Set to your device hostname to avoid a cert mismatch. |
| ENV_FILE_PATH          | /arasul/config/.env                  | Path to runtime .env file                                                                                                                                                                          |
| APPSTORE_MANIFESTS_DIR | /arasul/appstore/manifests           | App store manifest directory                                                                                                                                                                       |
| DOCKER_GATEWAY_IP      | 172.30.0.1                           | Docker bridge gateway IP                                                                                                                                                                           |
| DOCKER_NETWORK         | arasul-platform_arasul-backend       | Docker network name (project `name:` in docker-compose.yml)                                                                                                                                        |
| SSH_PORT               | 2222                                 | SSH port (2222 after hardening)                                                                                                                                                                    |
| SSH_USER               | arasul                               | SSH username for app access                                                                                                                                                                        |
| UPDATE_PUBLIC_KEY_PATH | /arasul/config/public_update_key.pem | Public key for update verification                                                                                                                                                                 |

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
| RAM_LIMIT_LLM              | 32G     | LLM service memory           |
| RAM_LIMIT_EMBEDDING        | 12G     | Embedding service memory     |
| RAM_LIMIT_QDRANT           | 6G      | Qdrant vector DB memory      |
| RAM_LIMIT_MINIO            | 4G      | MinIO object storage memory  |
| RAM_LIMIT_POSTGRES         | 4G      | PostgreSQL database memory   |
| RAM_LIMIT_N8N              | 2G      | n8n workflow engine memory   |
| RAM_LIMIT_DOCUMENT_INDEXER | 2G      | Document indexer memory      |
| RAM_LIMIT_METRICS          | 512M    | Metrics collector memory     |
| RAM_LIMIT_SELF_HEALING     | 512M    | Self-healing agent memory    |
| RAM_LIMIT_REVERSE_PROXY    | 512M    | Traefik reverse proxy memory |
| RAM_LIMIT_FRONTEND         | 256M    | Dashboard frontend memory    |
| RAM_LIMIT_BACKUP           | 256M    | Backup service memory        |
| RAM_LIMIT_BACKEND          | 1G      | Dashboard backend memory     |

### CPU Limits

| Variable            | Default | Description                 |
| ------------------- | ------- | --------------------------- |
| CPU_LIMIT_LLM       | 8       | LLM service CPU cores       |
| CPU_LIMIT_EMBEDDING | 4       | Embedding service CPU cores |
| CPU_LIMIT_DASHBOARD | 4       | Dashboard backend CPU cores |

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

See [docs/features/JETSON_COMPATIBILITY.md](features/JETSON_COMPATIBILITY.md) for full device compatibility guide.

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
JWT_EXPIRY=4h

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
LLM_KEEP_ALIVE_SECONDS=3600

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
./scripts/validate/validate-config.sh
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
2. Start normally with `docker compose up -d` — `compose/compose.secrets.yaml` is already included by the root `docker-compose.yml`, so no extra `-f` override is needed
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
openssl rand -hex 32 > config/secrets/n8n_runners_auth_token

# Restrict permissions
chmod 600 config/secrets/*
```

### Supported Secrets

| Secret File              | Services                                                                                                | Resolves To              |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `postgres_password`      | postgres-db, dashboard-backend, metrics-collector, self-healing-agent, document-indexer, backup-service | `POSTGRES_PASSWORD`      |
| `jwt_secret`             | dashboard-backend                                                                                       | `JWT_SECRET`             |
| `minio_root_user`        | minio, dashboard-backend, backup-service                                                                | `MINIO_ROOT_USER`        |
| `minio_root_password`    | minio, dashboard-backend, document-indexer, backup-service                                              | `MINIO_ROOT_PASSWORD`    |
| `n8n_encryption_key`     | n8n                                                                                                     | `N8N_ENCRYPTION_KEY`     |
| `n8n_runners_auth_token` | n8n (via entrypoint-Shim), n8n-runners (Launcher versteht `_FILE` nativ)                                | `N8N_RUNNERS_AUTH_TOKEN` |
| `n8n_owner_email`        | n8n (entrypoint provisioniert den Owner), dashboard-backend (Auto-Session)                              | `N8N_OWNER_EMAIL`        |
| `n8n_owner_password`     | n8n (entrypoint provisioniert den Owner), dashboard-backend (Auto-Session)                              | `N8N_OWNER_PASSWORD`     |

### Additional Backend Secrets

The dashboard-backend resolver also supports these `_FILE` variables (add them to `docker-compose.secrets.yml` as needed):

- `N8N_OWNER_EMAIL_FILE` → `N8N_OWNER_EMAIL` (Plan 007 — n8n Auto-Session)
- `N8N_OWNER_PASSWORD_FILE` → `N8N_OWNER_PASSWORD` (Plan 007 — n8n Auto-Session)

### Precedence

If both `VAR` and `VAR_FILE` are set, the file-based value wins (overwrites the env var). Remove the plain env var from `.env` when switching to secrets.

---

## Related Documentation

- [Deployment](ops/DEPLOYMENT.md) - Setup & deployment guide
- [config/README.md](../config/README.md) - Config directory
