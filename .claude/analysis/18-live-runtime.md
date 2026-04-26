# Live-Runtime-Analyse — Was läuft JETZT?

**Snapshot:** 2026-04-21 ~20:33 UTC | **Host:** Jetson AGX Orin 64GB | **Read-only**

## Executive Summary

Alle 14 Services `healthy`, DB läuft (78 Migrationen, 312 MB), 6 LLM-Modelle bereit, Qdrant + Indexer funktionieren. Aber **zwei aktive Endlos-Fehlerschleifen** + mehrere Resilience-Lücken gefährden 5J-Autonomie.

## BLOCKERS (live, jetzt aktiv!)

### LIVE-B01: PostgreSQL WAL-Archiving seit >5 Wochen gebrochen

- `2026-04-21 19:44:46 LOG: archive command failed with exit code 1`
- `DETAIL: test ! -f /backups/wal/00000001000000140000008D && cp pg_wal/... /backups/wal/...`
- `/backups/wal/` Mtime = **Mar 14 17:45**, Verzeichnis **leer** — nie ein WAL-Segment archiviert
- `backup_report.json`: `wal_segments: 0, wal_size: 4.0K`
- **Point-in-Time-Recovery unmöglich.** Max. Datenverlust = 24h (last daily basebackup)
- Wahrscheinlich Volume-Permission (postgres-UID vs backup-Volume)
- Fix: `chown` auf `/backups/wal/`, `archive_command` manuell testen; evtl. Streaming-Replication

### LIVE-B02: Self-Healing-Agent Flood-Loop (60k Events/Tag)

- `ERROR: Service telegram-bot-app failed 54 times in 10min window, escalating`
- `WARNING: Category C recovery triggered but in cooldown (last action < 1h ago)`
- Alle 10s dieselben 4 Log-Zeilen → `app_events`-Tabelle flutet
- `telegram-bot-app` Container: `Exited (1) 2 months ago`, steht weiter in der Watchlist
- Echte Incidents gehen im Rauschen unter, DB-Blähung
- Fix: Container aus Compose/Watchlist raus ODER Flapping-Detector mit exponentiellem Backoff

## MAJORS (live, silent degradation)

### LIVE-M01: Backend falsche GPU-Detection ("CPU only")

- Backend meldet: `Device: NVIDIA Jetson AGX Orin 64GB | GPU: NOT AVAILABLE (CPU only) | CUDA: N/A`
- Realität: `nvidia-smi` → Orin (nvgpu), CUDA 12.6, embedding-service meldet `device=cuda`
- Ursache: parst klassisches nvidia-smi-Output, Tegra liefert "Not Supported" in Memory/Compute-Spalten
- Fix: Fallback auf `tegrastats`, Presence-Check `/dev/nvgpu*`, `/dev/nvhost-*`

### LIVE-M02: Embedding-Service Model-Cache Permission-Denied (2GB Re-Download pro Restart!)

- `Ignored error while writing commit hash to /models/models--BAAI--bge-m3/refs/main: [Errno 13] Permission denied`
- `Model 'BAAI/bge-m3' not found in cache ... Model will be downloaded`
- Volume-Mount UID/GID falsch → 2GB BGE-M3 bei jedem Restart neu ziehen
- Für Offline-Jetson-Appliance FATAL
- Fix: `chown`/`chmod` auf `embedding-models` Named-Volume

### LIVE-M03: Document-Indexer Retry-Loop auf kaputtem PNG

- `INFO: Found failed document, will index: 1776113190000_Untitled Design Presentation (1).png`
- `WARNING: Image OCR failed: No OCR engine available`
- Alle 30s derselbe Fehlschlag seit >20min, kein Limit, kein Dead-Letter
- Fix: Retry-Limit (max 3) → `status='failed_permanent'`; tesseract ins Image (oder Image-OCR optional markieren)

### LIVE-M04: Backend Telegram-Polling ohne Tokens

- `error: Polling error for bot 1: fetch failed` (alle 5min)
- `warn: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set`
- Bot-Polling startet trotz fehlender Tokens (wahrscheinlich aktiver Eintrag in `bot_audit_log`)

### LIVE-M05: Docker Build-Cache 156.8GB + 170GB reclaimable Images

- 98% waste, Platz-Verschwendung, I/O-Risiko
- Fix: `docker system prune -a --volumes` (~270GB frei)

### LIVE-M06: LLM `num_ctx=262144 > n_ctx_train=40960`

- `WARN: requested context size too large for model` (qwen3:32b)
- Client fordert 256k, Modell trainiert auf 40k → stilles Truncate
- Fix: `num_ctx` pro Modell im Ollama-Readiness-Service

## MINORS

- LIVE-m01: ONNX-Runtime GPU-Discovery Warning (`/sys/class/drm/card1/device/vendor`) — kosmetisch, Tegra-Sysfs anders
- LIVE-m02: n8n "Error tracking disabled because this release is older than 6 weeks" — Sentry off, info only
- LIVE-m03: `alert_history` Tabelle leer — Alert-Engine läuft nie oder Regeln nicht aktiv

## Live-Status-Matrix

| Service            | State         | CPU   | MEM     | Hinweis                                     |
| ------------------ | ------------- | ----- | ------- | ------------------------------------------- |
| dashboard-frontend | healthy       | 0.00% | 14MiB   | OK                                          |
| dashboard-backend  | healthy       | 0.13% | 82MiB   | **GPU-Detect falsch**, Telegram-Poll-Errors |
| reverse-proxy      | healthy       | 0.01% | 106MiB  | OK                                          |
| postgres-db        | healthy       | 0.04% | 516MiB  | **WAL-Archive FAIL**                        |
| qdrant             | healthy       | 0.04% | 123MiB  | 1 Collection `documents`                    |
| llm-service        | healthy       | 0.03% | 194MiB  | 6 Modelle, idle                             |
| embedding-service  | healthy       | 0.05% | 1.15GiB | **Cache-Permission kaputt**                 |
| document-indexer   | healthy       | 0.01% | 491MiB  | **Retry-Loop auf PNG**                      |
| minio              | healthy       | 0.08% | 158MiB  | OK                                          |
| n8n                | healthy       | 0.56% | 267MiB  | OK                                          |
| self-healing-agent | healthy       | 0.04% | 76MiB   | **Flood-Loop**                              |
| metrics-collector  | healthy       | 0.01% | 86MiB   | sauber                                      |
| backup-service     | healthy       | 0.00% | 7MiB    | Last 21.04. 02:00 OK, 100MB                 |
| docker-proxy       | healthy       | 0.00% | 9MiB    | OK                                          |
| telegram-bot-app   | **Exited(1)** | —     | —       | **Ursache der Flut**                        |

**Host:** Disk `/` 433GB/1.8TB (25%), RAM 9.8/62.8GB, GR3D_FREQ 0% (idle), GPU 42°C.

## DB-State

- 78 Migrationen | 312 MB | `admin_users`: 1 | `active_sessions`: 1
- `documents`: 15 / `chunks`: 244
- `chat_conversations`: 108 / `chat_messages`: 160
- `alert_history`: 0

## Priorität

1. LIVE-B01 (WAL-Archive) — Kern des 5J-Autonomie-Versprechens
2. LIVE-B02 (Self-Healing-Flood) — DB-Blähung + echte Incidents verstecken sich
3. LIVE-M02 (Embedding-Cache) — Offline-Fähigkeit
4. LIVE-M03 (Indexer-Retry-Limit) — DLQ nötig
5. LIVE-M01 (Backend GPU-Detect) — UX + Model-Entscheidungen
