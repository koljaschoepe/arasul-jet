# Environment Variables

Complete reference for all Arasul Platform configuration variables.

All variables are defined in `.env` file at repository root.

## Eine Variable in der `.env` wirkt nur, wenn `compose/` sie durchreicht

Die Container bekommen ihre Umgebung ausschliesslich ueber den
`environment:`-Block in `compose/*.yaml`. Es gibt kein `env_file:`. Steht eine
Variable hier in der Dokumentation und im Quelltext, aber in keiner
Compose-Datei, dann erreicht ein Wert aus der `.env` den Container nie, und der
Code faellt still auf seinen eingebauten Vorgabewert zurueck. Es wird nichts
rot, es passiert nur nichts.

Am 22.08.2026 gemessen: **88 der hier beschriebenen Variablen** werden im
Backend gelesen und von `compose/` nicht durchgereicht. Sie sind damit auf
einem ausgelieferten Geraet nicht einstellbar. Die Liste steht in
`scripts/test/durchreichung.py`; derselbe Waechter laesst keine neue
dazukommen. Wer eine davon braucht, ergaenzt eine Zeile in
`compose/compose.app.yaml` und streicht sie dort aus der Liste.

Geheimnisse sind die Ausnahme und richtig verdrahtet: `JWT_SECRET` kommt als
`JWT_SECRET_FILE` aus `compose.secrets.yaml` und wird von
`utils/resolveSecrets.js` beim Start eingelesen.

---

## System

| Variable        | Default       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYSTEM_NAME     | arasul        | System identifier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SYSTEM_VERSION  | (unset)       | Current version. **There is no `1.0.0` default any more.** When unset, everything a human reads says `Vorserie` (`utils/version.js`, `versionFuerAnzeige`), because claiming a finished 1.0.0 with none of the seven sales gates closed is a promise nobody made. Only the internal comparison value used by the update check still falls back to `1.0.0` (`versionFuerVergleich`), so `checkForUpdates` keeps comparing the same way it always did. Set this from the release tag once deliveries are versioned |
| BUILD_HASH      | dev-build     | Git commit hash. **The default is a literal value, not a fallback** — it is shown verbatim as "Build" on the settings page. Set it at build time (`BUILD_HASH=$(git rev-parse --short HEAD) docker compose up -d --build`) or a customer reads "dev-build" on a shipped device                                                                                                                                                                                                                                   |
| JETPACK_VERSION | 6.0           | JetPack version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| NODE_ENV        | production    | Node.js environment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| NODE_VERSION    | 22            | Node.js version (Docker build arg)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PYTHON_VERSION  | 3.11.12       | Python version (Docker build arg)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| TZ              | Europe/Berlin | Zeitzone des Dashboard-Backends — Flow-Zeitpläne (Cron) rechnen in dieser Lokalzeit; ohne sie liefe der Container in UTC und „täglich 8 Uhr" feuerte um 10 Uhr deutscher Zeit                                                                                                                                                                                                                                                                                                                                    |

---

## Authentication

| Variable               | Default            | Description                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN_USERNAME         | admin              | Dashboard admin username                                                                                                                                                                                                                                                  |
| ADMIN_PASSWORD         | (required)         | Dashboard admin password (redacted after bootstrap)                                                                                                                                                                                                                       |
| ADMIN_EMAIL            | admin@arasul.local | Bootstrap admin email                                                                                                                                                                                                                                                     |
| JWT_SECRET             | (required)         | JWT signing key (32+ chars)                                                                                                                                                                                                                                               |
| JWT_EXPIRY             | 4h                 | Lebensdauer eines Tokens (`24h`, `4h`, `30m`, oder Sekunden als Zahl). Das Sitzungs-Cookie folgt diesem Wert seit dem 23.08.2026; vorher stand dort fest 4h, und bei `JWT_EXPIRY=24h` lief die Sitzung im Browser nach vier Stunden still aus, weil er nur das Cookie hat |
| LOGIN_LOCKOUT_ATTEMPTS | 5                  | Failed attempts before lockout                                                                                                                                                                                                                                            |
| LOGIN_LOCKOUT_MINUTES  | 15                 | Lockout duration                                                                                                                                                                                                                                                          |
| FORCE_HTTPS            | false              | HTTPS erzwingen                                                                                                                                                                                                                                                           |
| FORCE_SECURE_COOKIES   | false              | Secure-Flag für Cookies                                                                                                                                                                                                                                                   |

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

## LLM Service

> **Hinweis:** `LLM_HOST`, `LLM_PORT` und `LLM_MANAGEMENT_PORT` sind **deprecated**. Der interne Code verwendet `LLM_SERVICE_HOST`, `LLM_SERVICE_PORT` und `LLM_SERVICE_MANAGEMENT_PORT`. Die alten Namen werden noch als Fallback akzeptiert, sollten aber in neuen Konfigurationen nicht mehr verwendet werden.

| Variable                    | Default       | Description                                                                                                                                                                             |
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM_SERVICE_HOST            | llm-service   | Hostname des LLM-Service                                                                                                                                                                |
| LLM_SERVICE_PORT            | 11434         | Port des LLM-Service                                                                                                                                                                    |
| LLM_SERVICE_MANAGEMENT_PORT | 11436         | Management-Port des LLM-Service                                                                                                                                                         |
| LLM_HOST                    | llm-service   | _(deprecated)_ Alias für `LLM_SERVICE_HOST`                                                                                                                                             |
| LLM_PORT                    | 11434         | _(deprecated)_ Alias für `LLM_SERVICE_PORT`                                                                                                                                             |
| LLM_MANAGEMENT_PORT         | 11436         | _(deprecated)_ Alias für `LLM_SERVICE_MANAGEMENT_PORT`                                                                                                                                  |
| LLM_MODEL                   | gemma4:26b-q4 | Default LLM model (Gemma 4, hardware-abhängig)                                                                                                                                          |
| LLM_MAX_TOKENS              | 2048          | Max response tokens                                                                                                                                                                     |
| LLM_CONTEXT_SIZE            | 4096          | Context window size                                                                                                                                                                     |
| LLM_MAX_RAM_GB              | 40            | Max RAM allocation (GB)                                                                                                                                                                 |
| LLM_GPU_LAYERS              | 33            | GPU layers                                                                                                                                                                              |
| LLM_KEEP_ALIVE_SECONDS      | 3600          | Seconds Ollama keeps a loaded model resident (default 1h after migration 094)                                                                                                           |
| OLLAMA_NUM_PARALLEL         | 2             | Concurrent Ollama generation slots (1 on tight 32 GB Orin)                                                                                                                              |
| OLLAMA_KV_CACHE_TYPE        | q8_0          | KV-Cache-Quantisierung (seit Harness v2; vorher fest q4_0). q8_0 = halber f16-Speicher bei praktisch verlustfreier Qualität; auf knappen 32-GB-Orins via `.env` auf q4_0 zurückstellbar |
| OLLAMA_CONTEXT_LENGTH       | 32768         | Default-Kontextfenster aller Ollama-Modelle (≥32k, sonst kürzt Ollama Werkzeugaufrufe still). Auf knappen 32-GB-Orins via `.env` absenkbar                                              |
| OLLAMA_STARTUP_TIMEOUT      | 120           | Ollama startup timeout (seconds)                                                                                                                                                        |
| MAX_STORED_MODELS           | 10            | Maximale Anzahl gespeicherter Modelle                                                                                                                                                   |

---

## Model Management

Dynamic LLM model management with smart batching for Jetson devices.

| Variable                        | Default | Description                                               |
| ------------------------------- | ------- | --------------------------------------------------------- |
| MODEL_BATCHING_ENABLED          | true    | Enable smart model batching                               |
| MODEL_MAX_WAIT_SECONDS          | 120     | Max wait before forcing model switch                      |
| MODEL_SWITCH_COOLDOWN_SECONDS   | 5       | Cooldown between model switches                           |
| JETSON_TOTAL_RAM_GB             | 64      | Total Jetson RAM (GB)                                     |
| JETSON_RESERVED_RAM_GB          | 10      | RAM reserved for system (GB)                              |
| OLLAMA_READY_TIMEOUT            | 300000  | Ollama startup timeout (ms, 5 min)                        |
| OLLAMA_RETRY_INTERVAL           | 5000    | Retry interval for Ollama connection (ms)                 |
| MODEL_SYNC_INTERVAL             | 60000   | Sync models with DB interval (ms, 1 min)                  |
| MODEL_INACTIVITY_THRESHOLD      | 1800000 | Auto-unload model after inactivity (ms, 30 min)           |
| RAM_CRITICAL_THRESHOLD          | 95      | RAM threshold for auto model unload (%)                   |
| LONG_REQUEST_THRESHOLD          | 180000  | Long request threshold (ms, 3 min)                        |
| LLM_BURST_WINDOW_MS             | 1000    | Burst window for rate limiting (ms)                       |
| LLM_MAX_CONCURRENT_ENQUEUE      | 10      | Max parallel enqueue operations                           |
| OLLAMA_MAX_LOADED_MODELS        | 3       | Max models loaded simultaneously in RAM                   |
| MODEL_LIFECYCLE_ENABLED         | true    | Enable adaptive model lifecycle management                |
| MODEL_PEAK_KEEP_ALIVE_MINUTES   | 30      | Keep-alive during peak usage hours (minutes)              |
| MODEL_NORMAL_KEEP_ALIVE_MINUTES | 10      | Keep-alive during normal usage hours (minutes)            |
| MODEL_IDLE_KEEP_ALIVE_MINUTES   | 2       | Keep-alive during idle hours (minutes)                    |
| MODEL_PEAK_THRESHOLD            | 2       | Avg requests/hour to classify as peak                     |
| MODEL_ACTIVITY_WINDOW_MINUTES   | 10      | Fenster fuer die kurzfristige Aktivitaet (Plan 023 D6)    |
| MODEL_ACTIVITY_PEAK_REQUESTS    | 3       | Anfragen im Fenster, ab denen die Haltezeit auf peak geht |
| MODEL_MEMORY_SAFETY_BUFFER_MB   | 2048    | Safety buffer for model memory budget (MB)                |

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

## Document Indexer

| Variable                  | Default          | Description                                                                                                                                          |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCUMENT_INDEXER_HOST     | document-indexer | Hostname des Document-Indexer                                                                                                                        |
| DOCUMENT_INDEXER_API_PORT | 9102             | API-Port des Document-Indexer                                                                                                                        |
| BOOTSTRAP_DB_VERSUCHE     | 10               | Wie oft der Start auf eine noch nicht erreichbare Datenbank wartet. Eine GESCHEITERTE Migration wird nie wiederholt, nur eine abgewiesene Verbindung |
| BOOTSTRAP_DB_WARTE_MS     | 3000             | Pause zwischen zwei Versuchen. Postgres startet bei einer frischen Datenbank zweimal, und der Healthcheck kann in der ersten Phase schon gruen sein  |
| DOCUMENT_MAX_SIZE_MB      | 100              | Maximum file size (MB)                                                                                                                               |
| OCR_LANGS                 | deu+eng          | Tesseract-Sprachen für die lokale OCR bildbasierter PDFs (Plan 019); Pakete `tesseract-ocr-deu/-eng` im Indexer-Image                                |
| STAGE2_VRAM_FLOOR_MB      | 2048             | Skip BGE-CrossEncoder Stage 2 when free VRAM drops below this floor                                                                                  |

> Der Indexer ist ein reiner Extraktionsdienst: `GET /health` und
> `POST /extract-text` (multipart, Feld `file`), ohne Datenbank und ohne GPU.
> `STAGE2_VRAM_FLOOR_MB` liest der Embedding-Dienst
> (`services/embedding-service/embedding_server.py`).

---

## Cloudflare Tunnel (Fernzugriff ohne offene Ports)

Optional, Profil `tunnel` in `compose/compose.external.yaml`.

| Variable                | Default    | Description                             |
| ----------------------- | ---------- | --------------------------------------- |
| CLOUDFLARE_TUNNEL_TOKEN | (optional) | Tunnel token from Cloudflare Zero Trust |
| RAM_LIMIT_CLOUDFLARED   | 128M       | Memory limit for cloudflared            |

### Setup

1. Create tunnel at [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels
2. Copy tunnel token (starts with `eyJ...`)
3. Set `CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token` in `.env`
4. Configure public hostname in Cloudflare dashboard: `http://reverse-proxy:80`
5. Start: `docker compose --profile tunnel up -d cloudflared`

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

| Variable                 | Default           | Description              |
| ------------------------ | ----------------- | ------------------------ |
| METRICS_COLLECTOR_HOST   | metrics-collector | Collector hostname       |
| METRICS_INTERVAL_LIVE    | 5                 | Live update interval (s) |
| METRICS_INTERVAL_PERSIST | 30                | DB persist interval (s)  |
| METRICS_RETENTION_DAYS   | 7                 | Data retention (days)    |

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

| Device           | CPU warn/crit | RAM warn/crit | Temp warn/crit |
| ---------------- | ------------- | ------------- | -------------- |
| Jetson AGX Orin  | 75/90         | 75/90         | 65/80          |
| Jetson Orin Nano | 70/85         | 70/85         | 60/75          |
| Jetson Nano      | 65/80         | 65/80         | 55/70          |
| Generic Linux    | 80/95         | 80/95         | 70/85          |

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
| VITE_PLATFORM_DESCRIPTION | Edge-KI Verwaltungssystem | Description shown on login page                                                                                                                                                                                 |
| VITE_SUPPORT_EMAIL        | info@arasul.de            | Support email (login & settings)                                                                                                                                                                                |
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

## Selbstheilung, Ollama und Datentraeger

| Variable                           | Default                    | Description                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SELFHEAL_COMPOSE_PROJECT           | (leer)                     | Compose-Projekt, dessen Container die Selbstheilung überwacht. Leer heißt: der Agent liest es aus seinem eigenen Container, was auch bei umbenanntem Projekt stimmt. Ohne diesen Filter überwacht er JEDEN Container des Hosts. Auf dem Orin war das auch der Prüfstand: 311 CRITICAL-Ereignisse in sieben Tagen zu einem Dienst, den es im Produkt nicht gibt (23.08.2026) |
| SELFHEAL_WARTUNGSDATEI             | /arasul/logs/wartung.aktiv | Wartungsfenster. Solange die Datei kein `ende=` trägt, läuft eine Wartung und Kategorie A greift nicht ein. Beim Beenden wird sie **nicht gelöscht**, sondern bekommt `ende=<epoch>`: dauert ein Vorgang weniger als einen Agent-Takt, hat der Agent das offene Fenster nie gesehen, und ohne diesen Zeitpunkt gäbe es keinen Nachlauf (24.08.2026)                         |
| SELFHEAL_WARTUNG_MAX_MINUTEN       | 30                         | Deckel für das Wartungsfenster. Bleibt die Datei nach einem abgebrochenen Deploy liegen, greift die Selbstheilung nach dieser Zeit trotzdem wieder ein. Ein Wartungsfenster ohne Deckel wäre ein Ausschalter, den niemand zurückdreht                                                                                                                                       |
| SELFHEAL_WARTUNG_NACHLAUF_SEKUNDEN | 300                        | Nachlauf nach dem Ende der Wartung. Der erste Wurf stand auf 60 s und war zu kurz: am 24.08.2026 griff die Selbstheilung **zwölf Sekunden** nach Ablauf zu (`00:34:05` Nachlauf vorbei, `00:34:17` n8n restart), und dieser eine Eingriff löste eine Kaskade aus. 300 s decken den gemessenen Fall mit Abstand ab                                                           |
| OLLAMA_NO_CLOUD                    | 1                          | Schaltet Ollamas Cloud-Verbindungen ab. Am 24.08.2026 hielt `llm-service` eine Minute lang eine Verbindung zu `ollama.com` (34.36.133.15), ohne dass jemand danach gefragt hatte. Das Gerät braucht keine davon: die Websuche der Agenten läuft über `searxng`. Modelle über `hf.co/` bleiben möglich, mit zwei Wegwerf-Containern gegengeprobt                             |
| EXTERNE_MEDIEN                     | /media/arasul              | Plan 023 J3: Einhaengepunkt des HOSTS fuer angesteckte Datentraeger. Wird nach /arasul/medien in den Container gereicht; der Container sieht damit genau die eingehaengten Platten und sonst nichts vom Host. Einhaengen bleibt Sache des Betriebssystems                                                                                                                   |
| EXTERNE_MEDIEN_DIR                 | /arasul/medien             | Plan 023 J3: wo dieselben Datentraeger IM Container liegen. Nur aendern, wenn auch der Mount oben geaendert wird                                                                                                                                                                                                                                                            |

---

## Werkzeug-Schleife (Tool-Loop)

Der Flow-Runner (`services/flows/runFlow.js` → `toolLoop.js`) bedient das
lokale Modell mit echten Function-Calls (Plan 011, Schritt 10). Die Grenzen
eines Laufs — Werkzeug-Runden und Gesamt-Zeitlimit — kommen PRO Flow aus
dessen Kopfdaten (`grenzen.werkzeug_runden` / `grenzen.zeitlimit_s`), nicht aus
einer Umgebungsvariablen. Steuerbar per Env ist nur das Zeitlimit je einzelnem
Modell-Aufruf:

| Variable                    | Default | Description                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLOW_LLM_TIMEOUT_MS         | 120000  | Wie lange eine Modell-Runde eines Subagenten (`services/flows/subagent.js`) ZWISCHEN zwei Woertern stumm bleiben darf. Der Zaehler beginnt bei jedem Datenstueck neu. Seit 22.08.2026 in `compose.app.yaml` durchgereicht; davor bewirkte ein Wert in der `.env` nichts. Bis zum 22.08.2026 galt diese Zahl AUCH fuer Flows, dort aber mit anderer Bedeutung, siehe die naechste Zeile |
| FLOW_LLM_AUFRUF_TIMEOUT_MS  | 300000  | Zeitlimit eines GANZEN Flow-Aufrufs (`services/flows/toolLoop.js`, `stream: false`, also keine Zwischenstuecke). 120 Sekunden Stille zwischen zwei Zeichen sind grosszuegig, 120 Sekunden fuer eine ganze Antwort sind bei rund zehn Token je Sekunde etwa 1200 Token. Am 22.08.2026 lief `handbuch-bau` deshalb achtmal ins Zeitlimit und hinterliess eine Datei mit 373 Bytes        |
| FLOW_RUECKFRAGE_TIMEOUT_MS  | 1800000 | Plan 023 I3: wie lange ein Flow in der Betriebsart `rueckfragen` auf eine Antwort wartet, bevor er die erste Empfehlung als Annahme nimmt und weiterlaeuft. Ein haengender Lauf waere schlechter als eine Annahme. Das Warten kostet keine GPU: die Sperre umschliesst einen einzelnen Modellaufruf, nicht den ganzen Lauf                                                             |
| FLOW_LLM_VORLAUF_TIMEOUT_MS | 300000  | Wie lange eine Runde VOR ihrem ersten Wort stumm bleiben darf, waehrend Modellladung und Vorverarbeitung laufen. Getrennt seit 22.08.2026: bei vollem Zusammenhang dauert die Vorverarbeitung auf dem Orin gemessen bis zu 119 Sekunden, und eine gemeinsame Grenze von 120 Sekunden liess lange Laeufe an ihrer eigenen Groesse sterben                                               |

### Modell-Aufrufe (`services/llm/agentConfig.js`, `services/llm/extern/`)

| Variable                   | Default | Description                                                                                                                                                                                                                                                               |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENT_NUM_CTX              | 32768   | Kontextfenster (Token), das ein Subagent-Aufruf PRO Aufruf explizit setzt — nie den Ollama-Server-Default nutzen (stiller Front-Truncate frisst System-Prompt)                                                                                                            |
| AGENT_NUM_PREDICT          | -1      | Max. Antwort-Token je Runde (-1 = unbegrenzt, Ollama-Konvention)                                                                                                                                                                                                          |
| AGENT_VERLAUF_TOKEN_BUDGET | 1200    | Wie viele Token der VERLAUF im Vorlauf der ersten Runde hoechstens kosten darf (Plan 023 D7). Nicht zu verwechseln mit AGENT_NUM_CTX: das ist der Ueberlaufschutz, dies der Schutz der Zeit bis zum ersten Wort. Hoeher heisst laengeres Gedaechtnis und laengeres Warten |
| EXTERN_TIMEOUT_MS          | 60000   | Plan 023 D9: nach so vielen Millisekunden ohne Antwort gilt ein Cloud-Anbieter als still                                                                                                                                                                                  |
| EXTERN_MODELLE_CACHE_MS    | 300000  | Plan 023 D9: wie lange die Modellliste eines Cloud-Anbieters zwischengespeichert wird, bevor erneut gefragt wird                                                                                                                                                          |
| AGENT_KEEP_ALIVE           | 30m     | Wie lange Ollama das Modell zwischen Runden geladen hält (Kaltstart auf dem Jetson: 6–30 s)                                                                                                                                                                               |
| AGENT_PLAN_TOKENS_GROSS    | 2048    | Token-Deckel der Plan-Runde für GROSSE Aufträge (Recherche/Subagenten/Mehr-Datei; Qualitätsmodell mit Thinking — Deckel zählt Thinking + Plan zusammen)                                                                                                                   |
| AGENT_PLAN_TOKENS_KLEIN    | 512     | Token-Deckel der knappen Plan-Runde für kleine Erstell-Aufgaben (Arbeitsmodell, ohne Thinking)                                                                                                                                                                            |
| AGENT_QUALITAETS_MODELL    | (leer)  | Optionales größeres Modell für schwere Einzelschritte (Plan-Runde, pruefer-Rolle), z. B. `qwen3:32b`. Leer = keine Eskalation                                                                                                                                             |
| AGENT_THINKING             | an      | `aus` schaltet den live gestreamten Gedankengang (Reasoning-Trace) global ab; wirkt nur bei Modellen, die denken können (qwen3 u. a., nicht Coder/Gemma)                                                                                                                  |
| AGENT_MAX_SUBAGENTEN       | 60      | Obergrenze der Subagent-Aufrufe je Lauf (Plan 019 · Phase 5, aggressive Delegation). Höher = mehr kleine, in sich geschlossene Blöcke; Verschachtelung bleibt über maxTiefe (2) hart begrenzt                                                                             |

> **GPU-Sperre:** Alle lokalen Modell-Aufrufe — externer Auftrag wie Flow —
> laufen durch EINE gemeinsame Sperre (`services/flows/gpuQueue.js`); nie
> treffen zwei zugleich auf die GPU (strikt einer nach dem anderen, keine
> Priorisierung). Ein Auftrag gibt sie spätestens nach `LLM_INACTIVITY_TIMEOUT_MS`
> (Default 600000) wieder frei, falls ein Strom hängt.

> Die früheren `AGENT_LLM_TIMEOUT_MS` / `AGENT_MAX_ITERATIONS` gehörten zur
> abgelösten Agenten-Werkzeugschleife (`services/agents/toolLoop.js`, jetzt
> verwaist). Die übrigen `AGENT_*`-Variablen des Fluss-Layers (`AGENT_CLOUD_TIMEOUT_MS`,
> `AGENT_MAX_TOKENS`, `AGENT_WEB_TIMEOUT_MS`, `AGENT_FLOW_CONCURRENCY`) sind mit
> Plan 011 entfallen, ebenso die verschlüsselten Provider-Keys in der DB —
> Arasul spricht wieder ausschließlich lokale Modelle an.

---

## Flows

Flows sind Markdown-Dateien mit YAML-Kopfdaten — es gibt keine Tabelle. Die
Dateien liegen auf dem Host unter `data/flows/` und werden in zwei Container
gemountet: schreibend ins Backend (`compose/compose.app.yaml`), lesend in den
Backup-Dienst (`compose/compose.monitoring.yaml`). Beide Variablen sind
optional; die Defaults passen zu diesen Mounts.

| Variable         | Default       | Description                                                                                                         |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| FLOWS_DIR        | /arasul/flows | Verzeichnis der Flow-Dateien im Backend-Container; die Registry legt es beim Start an, falls es fehlt               |
| FLOWS_BACKUP_DIR | /arasul/flows | Quellverzeichnis für die Flow-Sicherung im Backup-Dienst (`services/backup-service/backup.sh`, read-only gemountet) |

> Bewusst getrennt von den Arbeitsordnern der Flows: ein Flow mit Schreibrecht auf einen
> Arbeitsordner kann seine eigene Definition nicht überschreiben.

---

## System Paths & Networking

| Variable               | Default                              | Description                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MDNS_NAME              | arasul                               | LAN hostname (without `.local`). Drives the access name `https://<MDNS_NAME>.local`, the self-signed cert CN, and `GET /api/system/network`. Set to your device hostname to avoid a cert mismatch.                                                                                                                   |
| NV_TEGRA_RELEASE       | /etc/nv_tegra_release                | Host path mounted read-only into dashboard-backend so `GET /api/system/info` can report the JetPack/L4T version. `dpkg-query` targets a HOST package and always fails inside the container; without this mount the settings page shows `unknown` forever. Point elsewhere (or at an empty file) on non-Jetson hosts. |
| ENV_FILE_PATH          | /arasul/config/.env                  | Path to runtime .env file                                                                                                                                                                                                                                                                                            |
| APPSTORE_MANIFESTS_DIR | /arasul/appstore/manifests           | App store manifest directory                                                                                                                                                                                                                                                                                         |
| DOCKER_GATEWAY_IP      | 172.30.0.1                           | Docker bridge gateway IP                                                                                                                                                                                                                                                                                             |
| DOCKER_NETWORK         | arasul-platform_arasul-backend       | Docker network name (project `name:` in docker-compose.yml)                                                                                                                                                                                                                                                          |
| SSH_PORT               | 2222                                 | SSH port (2222 after hardening)                                                                                                                                                                                                                                                                                      |
| SSH_USER               | arasul                               | SSH username for app access                                                                                                                                                                                                                                                                                          |
| UPDATE_PUBLIC_KEY_PATH | /arasul/config/public_update_key.pem | Public key for update verification                                                                                                                                                                                                                                                                                   |

---

## Jetson Device Configuration

These variables configure the platform for different NVIDIA Jetson devices. Use `./scripts/setup/detect-platform.sh` to auto-detect and generate optimal values.

### GPU & Base Image

| Variable             | Default                 | Description                                                                        |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| TORCH_CUDA_ARCH_LIST | 8.7                     | CUDA compute capability (10.0=Thor, 8.7=Orin, 7.2=Xavier, 5.3=Nano)                |
| L4T_PYTORCH_TAG      | r36.4.0                 | dustynv/l4t-pytorch base image tag (build arg for embedding-service)               |
| CUDA_ARCH_LIST       | (=TORCH_CUDA_ARCH_LIST) | Docker build arg alias, passed to embedding-service Dockerfile                     |
| JETSON_PROFILE       | (auto)                  | Device profile name set by detect-platform.sh (e.g. `thor_128gb`, `agx_orin_64gb`) |
| JETSON_DESCRIPTION   | (auto)                  | Human-readable device description (e.g. "NVIDIA Jetson Thor 128GB")                |
| JETSON_RAM_TOTAL     | (auto)                  | Detected total RAM in GB (read-only, set by detect-platform.sh)                    |
| JETSON_CPU_CORES     | (auto)                  | Detected CPU core count (read-only, set by detect-platform.sh)                     |

`TORCH_CUDA_ARCH_LIST` is used at both build time (as `CUDA_ARCH_LIST` build arg in `compose/compose.ai.yaml`) and runtime (passed to PyTorch inside the embedding-service container). The detection script sets this automatically based on device family. For Thor, the value `10.0` is speculative (Blackwell sm_100) and may need adjustment.

`L4T_PYTORCH_TAG` selects the dustynv/l4t-pytorch base image for the embedding-service Docker build. It must match the host L4T major.minor version. For Thor, the tag currently falls back to `r36.4.0` because dustynv has not yet published an L4T r37 image. The detection script verifies tag availability via `docker manifest inspect` and falls back automatically.

### Memory Limits (per Service)

All memory limits use Docker memory notation (e.g., `512M`, `2G`, `48G`).

| Variable                   | Default | Description                  |
| -------------------------- | ------- | ---------------------------- |
| RAM_LIMIT_LLM              | 32G     | LLM service memory           |
| RAM_LIMIT_EMBEDDING        | 12G     | Embedding service memory     |
| RAM_LIMIT_POSTGRES         | 4G      | PostgreSQL database memory   |
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

| Device           | RAM   | LLM Limit | Embedding | Default Model  |
| ---------------- | ----- | --------- | --------- | -------------- |
| Thor 128GB       | 128GB | 88G       | 8G        | gemma4:31b-q8  |
| Thor 64GB        | 64GB  | 34G       | 6G        | gemma4:31b-q4  |
| AGX Orin 64GB    | 64GB  | 38G       | 6G        | gemma4:26b-q4  |
| AGX Orin 32GB    | 32GB  | 20G       | 3G        | gemma4:e4b-q8  |
| Orin NX 16GB     | 16GB  | 10G       | 2G        | gemma4:e4b-q4  |
| Orin NX/Nano 8GB | 8GB   | 5G        | 1G        | phi3:mini      |
| Orin Nano 4GB    | 4GB   | 2G        | 512M      | tinyllama:1.1b |
| Xavier AGX       | 32GB  | 20G       | 3G        | gemma4:e4b-q4  |
| Xavier NX 8GB    | 8GB   | 5G        | 1G        | phi3:mini      |
| Jetson Nano 4GB  | 4GB   | 2G        | 512M      | tinyllama:1.1b |

### Auto-Detection

```bash
# Detect device and show profile
./scripts/setup/detect-platform.sh detect

# Generate .env with optimal values
./scripts/setup/detect-platform.sh generate

# Apply configuration
./scripts/setup/detect-platform.sh apply

# See recommended models
./scripts/setup/detect-platform.sh recommend
```

See [docs/features/PLATFORM_COMPATIBILITY.md](features/PLATFORM_COMPATIBILITY.md) for full device compatibility guide.

---

## Required Variables

The following variables **must** be set before starting:

```bash
# Authentication
ADMIN_PASSWORD=<secure password>
JWT_SECRET=<32+ character random string>

# Database
POSTGRES_PASSWORD=<secure password>
```

## Example .env File

```bash
# System
SYSTEM_NAME=arasul
# Leave unset on a pre-release device: everything a human reads then says
# "Vorserie" instead of claiming a finished 1.0.0.
# SYSTEM_VERSION=1.2.0

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

# LLM
LLM_MODEL=gemma4:26b-q4
LLM_KEEP_ALIVE_SECONDS=3600

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
- Key lengths (JWT_SECRET >= 32 chars)

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

# Restrict permissions
chmod 600 config/secrets/*
```

### Supported Secrets

| Secret File         | Services                                                                              | Resolves To         |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| `postgres_password` | postgres-db, dashboard-backend, metrics-collector, self-healing-agent, backup-service | `POSTGRES_PASSWORD` |
| `jwt_secret`        | dashboard-backend                                                                     | `JWT_SECRET`        |

### Precedence

If both `VAR` and `VAR_FILE` are set, the file-based value wins (overwrites the env var). Remove the plain env var from `.env` when switching to secrets.

---

## Related Documentation

- [Deployment](ops/DEPLOYMENT.md) - Setup & deployment guide
- [config/README.md](../config/README.md) - Config directory
