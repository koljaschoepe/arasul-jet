# Python Microservices Handbook

> Long-form patterns for the Python services under `services/`. For the
> service-folder contract (Dockerfile, healthcheck, README expectations)
> read [`services/CLAUDE.md`](../../services/CLAUDE.md) first.

## Overview

All Python services live under `services/`. They are Docker containers with
Flask APIs (except metrics-collector which uses aiohttp). Each service has a
`/health` endpoint returning JSON with service status.

---

## LLM-Service (`services/llm-service/`)

**Port:** 11436 (management API)
**Framework:** Flask + flask_cors
**Role:** Thin management layer over Ollama (inference at `http://localhost:11434`)

### Endpoints

| Method | Path                 | Purpose                                  |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/health`            | Service availability                     |
| GET    | `/api/models`        | List all downloaded models               |
| GET    | `/api/models/loaded` | List currently loaded models in RAM/VRAM |
| POST   | `/api/models/pull`   | Download a model                         |
| DELETE | `/api/models/delete` | Delete a model                           |
| POST   | `/api/cache/clear`   | Clear LLM cache (used by self-healing)   |
| POST   | `/api/session/reset` | Reset LLM session (used by self-healing) |
| POST   | `/api/gpu/recover`   | GPU recovery (used by self-healing)      |
| GET    | `/api/stats`         | GPU/memory statistics                    |
| GET    | `/api/info`          | Service and Ollama version info          |

### Key Details

- **Model cache:** 30s TTL (`MODEL_CACHE_TTL`), thread-safe with lock
- **HTTP retries:** `create_retry_session()` with exponential backoff (3 retries, 0.5s backoff, retries on 500/502/503/504)
- **CPU monitoring:** Background thread updates every 3s (1s measure + 2s sleep) to avoid blocking requests
- **Default model:** `$LLM_MODEL` env var (default: `qwen3:14b-q8`)
- Ollama base URL: `http://localhost:11434` (both run in same container)

---

## Document-Indexer (`services/document-indexer/`)

**Port:** 9102 (`DOCUMENT_INDEXER_API_PORT`)
**Framework:** Flask + flask_cors
**Role:** Stateless text extraction on request

### Endpoints

| Method | Path            | Purpose                                                       |
| ------ | --------------- | ------------------------------------------------------------- |
| GET    | `/health`       | Service availability                                          |
| POST   | `/extract-text` | multipart field `file` → `{ text, pages, title, ... }` (sync) |

### Pipeline

```
POST /extract-text (multipart) → parse (PDF/DOCX/image) → OCR if needed → text in the response
```

- **Parsers:** `document_parsers.py` (PDF via pdfplumber/poppler, DOCX, plain
  text, images), `metadata_extractor.py` (title, page count)
- **OCR:** local Tesseract (`ocr_service.py`) for image-PDFs and standalone
  images (`.png/.jpg/.jpeg/.tiff/.tif/.bmp/.webp`)
- **No state:** no database, no object store, no embedding, no LLM, no GPU, no
  background scan. Everything that indexed, chunked, searched (BM25), extracted
  entities or refined a knowledge graph fell with the documents, knowledge
  spaces and the text layer (Migration 163). Callers: the backend's
  `services/documents/extractionService.js` (external extraction API, flow
  style templates at upload time).

### Dependencies

None besides the backend that calls it.

---

## Embedding-Service (`services/embedding-service/`)

**Port:** 11435 (`EMBEDDING_SERVICE_PORT`)
**Framework:** Flask
**Role:** Text embedding and reranking

### Endpoints

| Method | Path           | Purpose                     |
| ------ | -------------- | --------------------------- |
| GET    | `/health`      | Service health + model info |
| GET    | `/info`        | Model and device info       |
| POST   | `/embed`       | Generate text embeddings    |
| POST   | `/embed/batch` | Batch embeddings            |
| POST   | `/rerank`      | 2-stage document reranking  |

### Key Details

- **Model:** BAAI/bge-m3 (1024 dimensions, 8192 token max)
- **Device:** CUDA (GPU) with CPU fallback
- **FP16:** Optional half-precision via `EMBEDDING_USE_FP16=true` (~50% VRAM reduction)
- **Reranking (2-stage):**
  1. **FlashRank** (`ms-marco-MiniLM-L-12-v2`) - CPU-based, fast initial reranking
  2. **CrossEncoder** (`BAAI/bge-reranker-v2-m3`) - GPU-based, accurate final reranking
- **Lazy loading:** Reranker models loaded on first use with thread-safe lock
- **Trusted models whitelist:** Only specific models (nomic, jina) get `trust_remote_code=True`

### Environment Variables

| Variable                     | Default                   | Purpose                |
| ---------------------------- | ------------------------- | ---------------------- |
| `EMBEDDING_MODEL`            | `BAAI/bge-m3`             | Embedding model        |
| `EMBEDDING_SERVICE_PORT`     | `11435`                   | API port               |
| `EMBEDDING_VECTOR_SIZE`      | `1024`                    | Vector dimensions      |
| `EMBEDDING_MAX_INPUT_TOKENS` | `8192`                    | Max input length       |
| `EMBEDDING_USE_FP16`         | `false`                   | Enable half-precision  |
| `ENABLE_RERANKING`           | `true`                    | Enable rerank endpoint |
| `FLASHRANK_MODEL`            | `ms-marco-MiniLM-L-12-v2` | FlashRank model        |
| `BGE_RERANKER_MODEL`         | `BAAI/bge-reranker-v2-m3` | CrossEncoder model     |

---

## Metrics-Collector (`services/metrics-collector/`)

**Port:** 9100
**Framework:** aiohttp (async, NOT Flask)
**Role:** System metrics collection and persistence

### Metrics Collected

| Metric      | Storage Table         | Live Interval | Persist Interval |
| ----------- | --------------------- | ------------- | ---------------- |
| CPU         | `metrics_cpu`         | 5s            | 30s              |
| RAM         | `metrics_ram`         | 5s            | 30s              |
| GPU         | `metrics_gpu`         | 5s            | 30s              |
| Temperature | `metrics_temperature` | 5s            | 30s              |
| Disk        | `metrics_disk`        | 5s            | 30s              |

### Key Details

- **Intervals:** 5s for live data (`METRICS_INTERVAL_LIVE`), 30s for database persistence (`METRICS_INTERVAL_PERSIST`)
- **Jetson-specific:** Dynamic GPU load path discovery, thermal zone matching
- **GPU Monitor:** Optional `gpu_monitor.py` module with `GPUMonitor`, `GPUHealth`, `GPUError` classes
- **PostgreSQL:** Connection pooling via `psycopg2.pool`
- **Docker secrets:** Resolves `POSTGRES_PASSWORD_FILE` env var automatically

---

## Self-Healing-Agent (`services/self-healing-agent/`)

**Port:** 9200 (heartbeat via `heartbeat.py`)
**Framework:** Custom event loop (not Flask), heartbeat file at `/tmp/self_healing_heartbeat.json`
**Role:** Autonomous monitoring and recovery

### Monitoring Cycle

10-second interval (`SELF_HEALING_INTERVAL`):

1. Check Docker container health
2. Check disk usage
3. Collect metrics from metrics-collector (port 9100)
4. Evaluate GPU, RAM, CPU, temperature thresholds
5. Execute recovery actions as needed

### Thresholds and Actions

| Metric      | Threshold  | Action                                               |
| ----------- | ---------- | ---------------------------------------------------- |
| GPU         | >95%       | Reset GPU session via LLM-Service                    |
| CPU         | >90%       | Clear LLM cache via LLM-Service                      |
| RAM         | >90%       | Event only (no stoppable service since B5)           |
| Temperature | >83C (avg) | Throttle (with hysteresis, re-arm at 78C)            |
| Temperature | >85C (avg) | Restart LLM service (with hysteresis, re-arm at 78C) |
| Disk        | >75%       | Warning logged                                       |
| Disk        | >85%       | Cleanup triggered                                    |
| Disk        | >95%       | Aggressive cleanup                                   |
| Disk        | >97%       | System reboot (if enabled)                           |

### Safety Limits

- **Container failures:** Max 3 in 10-minute window per container
- **Critical events:** Max 3 in 30-minute window before escalation
- **Reboots:** Max 1 per hour (`MAX_REBOOTS_PER_HOUR`), requires `SELF_HEALING_REBOOT_ENABLED=true`
- **Temperature hysteresis:** Sliding window of 5 readings, re-arm thresholds at 78C
- **Overload cooldown:** 300s (5 min) between repeated overload actions

### Communication

- **LLM-Service** (port 11436): `/api/cache/clear`, `/api/session/reset`
- **Metrics-Collector** (port 9100): System metrics
- **Docker socket:** Container restart via Docker SDK
- **PostgreSQL:** Event logging (`self_healing_events`, `service_failures`, `reboot_events`, `recovery_actions`)

### Key Modules

| File                        | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `healing_engine.py`         | Main engine: monitoring loop, thresholds, recovery actions |
| `heartbeat.py`              | HTTP heartbeat server on port 9200                         |
| `gpu_recovery.py`           | GPU-specific recovery actions (optional)                   |
| `post_reboot_validation.py` | Post-reboot state validation                               |

---

## Shared Patterns

### PostgreSQL Connection

All services that access the database use `psycopg2` with connection pooling:

```python
from psycopg2 import pool

connection_pool = pool.ThreadedConnectionPool(
    minconn=1, maxconn=5,
    host=POSTGRES_HOST, port=POSTGRES_PORT,
    user=POSTGRES_USER, password=POSTGRES_PASSWORD,
    database=POSTGRES_DB
)
```

### Docker Secrets Resolution

Services resolve `_FILE` env vars (for Docker secrets) at startup:

```python
def _resolve_secrets(*var_names):
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()

_resolve_secrets('POSTGRES_PASSWORD')
```

### HTTP Retries

Services calling other services use retry logic with exponential backoff:

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()
retry = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
session.mount('http://', HTTPAdapter(max_retries=retry))
```

### Lazy Model Loading

Heavy models (the rerankers of the embedding service) are loaded on first use, not at startup:

```python
_model = None
_model_lock = threading.Lock()

def get_model():
    global _model
    with _model_lock:
        if _model is None:
            _model = load_heavy_model()
        return _model
```

### Health Check Pattern

All services return structured JSON health responses:

```python
@app.route('/health')
def health():
    return jsonify({
        'service': 'service-name',
        'status': 'healthy',  # or 'degraded', 'initializing'
        'dependencies': { ... }
    }), 200
```

---

## Service Network Topology

```
Dashboard Backend (Node.js)
    ├── LLM-Service :11436 (management)
    │       └── Ollama :11434 (inference)
    ├── Embedding-Service :11435
    ├── Document-Indexer :9102 (stateless, no downstream)
    └── Metrics-Collector :9100

Self-Healing-Agent
    ├── LLM-Service :11436 (cache/session mgmt)
    ├── Metrics-Collector :9100 (system metrics)
    ├── Docker socket (container restart)
    └── PostgreSQL :5432 (event logging)
```

---

## Shared Python Library (`libs/shared-python/`)

Gemeinsame Utilities für alle Python-Services (8 Module):

| Module                  | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `structured_logging.py` | JSON-Logging (stdout) — von ALLEN Services genutzt        |
| `db_pool.py`            | Thread-safe Connection Pool, Retry-Logik, Context Manager |
| `health_check.py`       | Health-Check Endpoint Factory                             |
| `http_client.py`        | HTTP Client mit Retry + Exponential Backoff               |
| `service_config.py`     | Service Discovery Konfiguration                           |

### Usage Pattern (alle Services):

```python
from structured_logging import setup_logging
logger = setup_logging("service-name")
logger.info("Message", extra={"key": "value"})
# Output: {"timestamp": "...", "level": "INFO", "service": "service-name", "message": "Message", "key": "value"}
```

### Secrets Resolution (alle Services):

```python
# _FILE Pattern: POSTGRES_PASSWORD_FILE → /run/secrets/postgres_password
password = os.environ.get('POSTGRES_PASSWORD') or \
           open(os.environ.get('POSTGRES_PASSWORD_FILE')).read().strip()
```

---

## Debugging

```bash
# View service logs
docker compose logs -f llm-service
docker compose logs -f document-indexer
docker compose logs -f embedding-service
docker compose logs -f metrics-collector
docker compose logs -f self-healing-agent

# Test health endpoints
curl http://localhost:11436/health          # LLM-Service
curl http://localhost:9102/health           # Document-Indexer
curl http://localhost:11435/health          # Embedding-Service
curl http://localhost:9100/health           # Metrics-Collector

# Rebuild a service
docker compose up -d --build llm-service
```
