# Python-Services — Findings

## Scope

`services/llm-service/` (Ollama-Wrapper), `services/embedding-service/` (BGE-M3), `services/document-indexer/` (Qdrant-Indexing), `services/self-healing-agent/`, `services/metrics-collector/`, `services/telegram-bot/` (source missing!)

## BLOCKERS

### PY-B01: `services/telegram-bot/` — SOURCE FEHLT (nur `.pyc`)

- Repo enthält `bot.pyc`, aber KEIN `bot.py` — lost source!
- Git-History prüfen, `.gitignore` prüft Source evtl. nicht ein
- Container läuft seit 2 Monaten `Exited(1)` (siehe 18-live-runtime LIVE-B02)
- **Unwartbar.** Fix: Source wiederherstellen oder Service komplett entfernen

### PY-B02: LLM-Service Gunicorn 4 Threads + CUDA Race-Risk

- `services/llm-service/api_server.py` (und ggf. Gunicorn-Config): mehrere Threads pro Worker
- BGE-M3 / PyTorch-CUDA nicht thread-safe → Crash-Potential unter Load
- Fix: `--threads 1` + mehr Worker, oder async Pattern

### PY-B03: 3 unterschiedliche Base-Images

- `llm-service` nutzt `dustynv/l4t-pytorch:r36.x`
- `embedding-service` nutzt anderes Image (evtl. huggingface)
- `document-indexer` nutzt `python:3.11-slim`
- Jeder Build zieht andere Layer → unnötig groß + unkonsistent
- Fix: Gemeinsames Base-Image `arasul-python-base` mit PyTorch + CUDA-Runtime

## MAJORS

### PY-M01: Keine `requirements.txt` Pinning für einige Services

- `pip install xyz` ohne `==<version>` → reproduzierbare Builds gefährdet
- Fix: `pip freeze > requirements.txt` + Lock-File

### PY-M02: Keine async/await bei Embedding-Service Flask

- Sync Flask blockiert bei GPU-Calls
- Fix: Migration auf FastAPI oder Quart

### PY-M03: LLM-Service `num_ctx`-Logic nicht modellspezifisch

- Ollama fordert 256k, qwen3:32b kann nur 40k (LIVE-M06)
- Fix: Model-Registry mit `n_ctx_train` → automatisches Clamping

### PY-M04: Document-Indexer — tesseract fehlt im Image

- LIVE-M03: PNG-Upload → "No OCR engine available"
- Fix: `apt-get install tesseract-ocr` + `pytesseract`

### PY-M05: Self-Healing-Agent — fehlende Tests

- Recovery-Logic ist kritisch, hat aber kaum Unit-Tests
- Ein Bug könnte Restart-Loops auslösen

### PY-M06: Metrics-Collector — kein pgstat/qdrant-stat

- Siehe 13-ops-services OPS-M02

## MINORS

- PY-m01: Keine `python -m pip-audit` in CI
- PY-m02: Logging uneinheitlich (JSON/Plaintext gemischt)
- PY-m03: Health-Endpoints nicht einheitlich (`/health` vs `/healthz`)
- PY-m04: Kein `structlog` — alle Services rohes `logging`
- PY-m05: Kein Type-Hints-Audit (mypy)

## OK / FUNKTIONIERT

- LLM-Service: Ollama-Proxy stabil, Model-Lifecycle funktioniert, GPU-Offload läuft
- Embedding-Service: BGE-M3 läuft auf CUDA, Latenz 45ms/Request
- Document-Indexer: Qdrant-Sync OK, Collection `documents` mit 244 Chunks
- Self-Healing-Agent: 4 Category-Logik funktioniert (trotz Flood-Problem)
- Metrics-Collector: schreibt zuverlässig Postgres + Loki
- Alle Services in Docker-Healthcheck integriert

## Priorität

1. PY-B01 (telegram-bot Source wiederherstellen oder entfernen)
2. PY-B02 (Gunicorn-Thread-Safety)
3. PY-M04 (tesseract → document-indexer)
4. PY-M03 (num_ctx modellspezifisch)
5. PY-B03 (Base-Image konsolidieren)
