# Arasul Platform — Ultra-Detaillierter Multi-Phasen-Plan

**Erstellt:** 2026-04-21 aus 19 parallelen Sub-Agent-Analysen
**Quell-Reports:** `.claude/analysis/01-*.md` bis `19-*.md`
**Ziel:** Plattform ist vollständig funktional, rollout-fähig für Jetson Orin + Thor, autonomer Betrieb 5 Jahre
**Fokus (explizit):** Funktionalität, NICHT zusätzliche Security-Härtung
**Ausführung:** Jede Phase ist so dokumentiert, dass sie in frischem Kontext-Window ausgeführt werden kann.

---

## TL;DR — Was ist der Stand?

**Stabil läuft:** 14 Services healthy, 78 DB-Migrationen, 6 LLM-Modelle, Frontend+Backend+RAG+Chat+Documents+Store funktionieren. Tests sind solide (52 Backend + 35 Frontend Files).

**Was blockiert Rollout & 5J-Autonomie:**

1. 2 aktive Fehler-Loops im Live-System (WAL-Archive broken seit 5 Wochen, Self-Healing-Flood durch toten Container)
2. Embedding-Service Cache-Permission → 2GB Re-Download pro Restart (Offline-Killer!)
3. Setup nicht idempotent, kein `.env.template` → Massenrollout unmöglich
4. Thor-Unterstützung komplett ungetestet, SBSA-Stack nicht vorbereitet
5. Keine externen Alerts → Admin erfährt Incidents nicht
6. Zwei "Geister-Services": `telegram-bot-app` (Source weg + Container tot) + tote Telegram-Bot-Polling-Logik im Backend
7. Docker-Build-Cache 156GB verschwendet

**Phasierung (unten):**

- **Phase 0:** Quick-Wins (1-2 Stunden) — uncommittet Changes, docker-prune, Cleanup
- **Phase 1:** Live-System-Stabilisierung — aktuelle Fehler-Loops stoppen
- **Phase 2:** Rollout-Fähigkeit Basis — Setup-Idempotenz, .env.template
- **Phase 3:** Multi-Jetson-Support inkl. Thor
- **Phase 4:** Frontend-Funktions-Completeness (Settings-Tabs, Chat, Documents)
- **Phase 5:** Ops & Resilience für 5J-Autonomie (Alerts, Restore-Drill, DLQ)
- **Phase 6:** Test-Coverage + CI-Hardening
- **Phase 7:** Code-Qualität + Schuldenabbau (Schema-Centralization, God-Components)

---

## Phase 0 — Quick-Wins (1-2h, können parallel/sofort)

### 0.1 Uncommittete Änderungen clean reviewen & committen

**Betrifft:** `apps/dashboard-frontend/src/features/{documents,store}/*`

- `DocumentManager.tsx` — nur `Table` Icon-Import → OK, committen
- `ActivationButton.tsx`, `StoreApps.tsx`, `StoreDetailModal.tsx`, `StoreHome.tsx`, `StoreModels.tsx` — ConfirmIconButton aus Stop-Dialog entfernt, dynamische CSS-Klassen bereinigt → OK, committen
- Prüfen: `DownloadProgress.tsx:127` hat `bg-linear-to-r` (Tailwind v4-Syntax, nicht `bg-gradient-to-r`) → verifizieren dass korrekt

**Schritte:**

1. `git diff apps/dashboard-frontend/src/features/` durchgehen
2. `git add` + `git commit` mit Nachricht: `chore(frontend): cleanup Store/Documents uncommitted changes`
3. `apps/dashboard-backend/jest-results.json` und `.claude/scheduled_tasks.lock` in `.gitignore` aufnehmen

### 0.2 Docker Build-Cache aufräumen

**Gewinnt ~270 GB Platz:**

```bash
docker system prune -a --volumes --filter "label!=arasul-keep"
```

**WARNUNG:** Prüfen dass keine aktiven Named-Volumes gelöscht werden (`docker volume ls | grep arasul-` muss bleiben).

### 0.3 Tote Telegram-Bot-App entfernen

- `telegram-bot-app` Container: `Exited(1)` seit 2 Monaten
- Source fehlt (`services/telegram-bot/bot.pyc` ohne `bot.py`)
- **Entscheidung nötig (User):** Source wiederherstellen ODER Service komplett entfernen?
- Sofort-Maßnahme: Aus `compose/compose.app.yaml` raus oder unter `profiles: [telegram]` stellen → stoppt sofort den Self-Healing-Flood (LIVE-B02)

### 0.4 Dokumentation aktualisieren

- `docs/DATABASE_SCHEMA.md` mindestens anmerken "veraltet seit Migration 025" (vollständige Regeneration in Phase 7)
- `docs/JETSON_COMPATIBILITY.md` → Thor-Abschnitt einfügen (Platzhalter mit "Phase 3 pending")

---

## Phase 1 — Live-System-Stabilisierung (1-2 Tage, sofort)

**Ziel:** Alle aktiven Fehler-Loops stoppen, Live-System zurück in saubere Baseline.

### 1.1 [BLOCKER] PostgreSQL WAL-Archiving fixen

**Quelle:** `.claude/analysis/18-live-runtime.md` LIVE-B01

**Problem:** `/backups/wal/` Mtime = Mar 14, leer seit 5 Wochen. `archive_command` loggt alle 60s `exit code 1`.

**Schritte:**

1. `docker exec -it postgres-db ls -la /backups/wal/` → Ownership prüfen
2. `docker exec -it postgres-db id postgres` → UID feststellen
3. `sudo chown -R <postgres-uid>:<postgres-gid> <host-volume>/backups/wal/` auf dem Host (via Named-Volume-Pfad)
4. `docker exec -it postgres-db bash -c "test ! -f /backups/wal/TEST && cp pg_wal/<current_wal> /backups/wal/TEST"` manuell testen
5. Alternativ/zusätzlich: `postgresql.conf` — `archive_command` prüfen (`services/postgres/init/postgresql.conf`)
6. Monitoring: `SELECT pg_switch_wal();` triggern → beobachten ob `/backups/wal/` sich füllt
7. `backup-service` Volume-Mount prüfen — ist `/backups/wal/` im Container selbst derselbe Pfad wie in postgres-db?

**Erfolg:** `backup_report.json.wal_segments > 0` und wächst

### 1.2 [BLOCKER] Self-Healing-Flood stoppen (Flapping-Detector)

**Quelle:** `18-live-runtime.md` LIVE-B02, `13-ops-services.md` OPS-B01

**Schritte:**

1. Sofort: `telegram-bot-app` aus `compose/compose.app.yaml` entfernen (oder `profiles: [telegram]`)
2. `docker compose rm telegram-bot-app`
3. Self-Healing-Agent Logik erweitern:
   - Neue Tabelle/Feld: `self_healing_events.flapping_detected boolean`
   - Wenn in 24h >10 Cooldown-Hits → `status='dead_service_quarantined'` + kein Monitoring mehr
   - Admin-Notification (Vorbereitung für Phase 5)
4. `app_events` alte Flood-Einträge löschen: `DELETE FROM app_events WHERE service='telegram-bot-app' AND created_at < NOW()`
5. Code-Pfad: `services/self-healing-agent/monitor.py` (oder ähnlich)

### 1.3 [MAJOR] Embedding-Service Cache-Permission

**Quelle:** `18-live-runtime.md` LIVE-M02

**Schritte:**

1. Host-Volume finden: `docker volume inspect arasul-embeddings-models | jq '.[0].Mountpoint'`
2. UID/GID im Container: `docker exec embedding-service id`
3. `sudo chown -R <uid>:<gid> <mountpoint>`
4. Container restart: `docker compose restart embedding-service`
5. Logs verifizieren: Kein `Permission denied` + Modell aus Cache geladen (kein Download)

### 1.4 [MAJOR] Document-Indexer Retry-Limit + DLQ

**Quelle:** `18-live-runtime.md` LIVE-M03, `05-frontend-documents.md` DM-07

**Schritte:**

1. `services/document-indexer/` Code lokalisieren (Python)
2. In Retry-Logik: `retry_count >= 3` → `UPDATE documents SET status='failed_permanent' WHERE id=?`
3. Frontend `DocumentManager.tsx`: Status "failed_permanent" rendern mit ❌-Badge
4. Optional: `apt-get install tesseract-ocr tesseract-ocr-deu` ins Dockerfile, damit PNG-OCR klappt
5. Failed PNG manuell: `UPDATE documents SET status='failed_permanent' WHERE filename LIKE '%Untitled Design%'`

### 1.5 [MAJOR] Backend GPU-Detection für Jetson/Tegra

**Quelle:** `18-live-runtime.md` LIVE-M01

**Problem:** Backend parst `nvidia-smi` Output, Tegra liefert "Not Supported" → falsches "CPU only".

**Schritte:**

1. `apps/dashboard-backend/src/services/system/gpu.js` (oder ähnlich) lokalisieren
2. Detection-Reihenfolge:
   - `/dev/nvgpu*` / `/dev/nvhost-*` Präsenz → Tegra-GPU da
   - `tegrastats` parsen (wenn `/usr/bin/tegrastats` existiert)
   - `nvidia-smi` als Fallback für klassische GPUs
3. Frontend `GeneralSettings.tsx` bzw. System-Info-Widget: GPU-Status verifizieren

### 1.6 [MAJOR] Backend Telegram-Bot-Polling nur wenn konfiguriert

**Quelle:** `18-live-runtime.md` LIVE-M04

**Schritte:**

1. `apps/dashboard-backend/src/services/telegram/poller.js` (oder ähnlich)
2. Guard: `if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;`
3. Alternativ: aktive Einträge in `bot_audit_log` prüfen, nur dann Polling starten
4. `docker compose restart dashboard-backend`

### 1.7 [MAJOR] LLM num_ctx modellspezifisch

**Quelle:** `18-live-runtime.md` LIVE-M06, `16-python-services.md` PY-M03

**Schritte:**

1. `services/llm-service/` oder `apps/dashboard-backend/src/services/llm/` — wo `num_ctx` gesetzt wird
2. Model-Registry (JSON oder DB): `{ "qwen3:32b": { "n_ctx": 40960 }, "gemma2:9b": { "n_ctx": 8192 } }`
3. Auto-Clamp: `actualCtx = Math.min(userRequest, registry[model].n_ctx)`
4. Warnung an Client wenn geclampt

**Phase-1-Abschluss-Kriterium:**

- Keine BLOCKER-Loops mehr in den Logs
- `docker compose logs --tail 500 self-healing-agent | grep -c ERROR` → 0 (oder sehr wenige echte Incidents)
- `backup_report.json.wal_segments > 0`
- Embedding-Service startet ohne Modell-Download
- Document-Indexer Retry-Loop verstummt

---

## Phase 2 — Rollout-Fähigkeit Basis (2-3 Tage)

**Ziel:** Setup-Skripte idempotent + robust, `.env.template` dokumentiert, Multi-Device-Rollout reproduzierbar.

### 2.1 [BLOCKER] `scripts/interactive_setup.sh` idempotent machen

**Quelle:** `11-setup-scripts.md` SU-B01

**Schritte:**

1. Atomic-Write: Schreibe in `.env.tmp`, dann `mv .env.tmp .env`
2. Backup-Rotation: Alte `.env` als `.env.backup.<timestamp>` sichern
3. Bei Fehler >90% durch: `.env.tmp` löschen, `.env.backup.<last>` restoren
4. Re-run-freundlich: "Gefundene .env, [1] weiterverwenden [2] neu generieren [3] inspect"
5. Test: Setup zweimal hintereinander laufen lassen — muss idempotent sein

### 2.2 [BLOCKER] `.env.template` im Repo

**Quelle:** `11-setup-scripts.md` SU-B02

**Schritte:**

1. Neue Datei: `.env.template` (mit Kommentaren für jede Variable, Required/Optional markiert)
2. Alle ~20 Env-Vars auflisten: `ADMIN_USER`, `DASHBOARD_URL`, `JWT_SECRET`, `LLM_MODEL_DEFAULT`, `JETSON_PROFILE`, etc.
3. Bootstrap-Flag: `./arasul bootstrap --from .env.template` — liest Template, fragt nur fehlende Werte interaktiv
4. `docs/ENVIRONMENT_VARIABLES.md` aktualisieren (welche Defaults, welche Required)
5. CI: Prüft dass alle in Code referenzierten Env-Vars in Template stehen

### 2.3 [BLOCKER] Netzwerk-Validierung vor docker compose pull

**Quelle:** `11-setup-scripts.md` SU-B03

**Schritte:**

1. `pull_images()` Line 554-563 (`scripts/setup/preconfigure.sh` oder `arasul` CLI):
   ```bash
   timeout 5 curl -fsSL https://ghcr.io/v2/ > /dev/null || { log_error "Kein Internet — Offline-Setup braucht pre-loaded images"; return 1; }
   timeout 1800 docker compose pull || { log_error "Pull timeout"; return 2; }
   ```
2. Retry-Wrapper: `pull_with_retry` max 3x mit exponential backoff (30s, 90s, 270s)
3. Offline-Modus: `--offline` Flag skipped pull, nutzt pre-loaded images

### 2.4 [BLOCKER] ADMIN_PASSWORD-Handling härten

**Quelle:** `11-setup-scripts.md` SU-B04

**Schritte:**

1. Nach `ADMIN_HASH` Generierung: `unset ADMIN_PASSWORD` sofort (nicht erst nach admin_user creation)
2. In `.env`: NUR `ADMIN_HASH` persistieren
3. `redact_plaintext_password()` umbauen zu `ensure_only_hash_persisted()`
4. Test: Crash zwischen Hash-Gen und DB-Write — `.env` darf KEIN Plaintext-Passwort enthalten

### 2.5 Setup-Validation + Final-Check

**Quelle:** `11-setup-scripts.md` SU-M02, SU-M04

**Schritte:**

1. `setup_secrets()` — nach jedem `echo > file` ein `test -s file` check
2. `preconfigure.sh` Final-Check: Array `STEPS_COMPLETED=(docker env db minio llm embedding traefik)` — wenn <N, log_error
3. `./arasul doctor` Command → verifiziert alle Services, ausgibt Report

### 2.6 Setup-Logs persistent

**Quelle:** `11-setup-scripts.md` SU-m01

**Schritte:**

1. `logs/bootstrap_YYYY-MM-DD_HH-MM-SS.log` statt `/tmp/`
2. `exec 1> >(tee -a "$LOGFILE") 2>&1` am Anfang jedes Setup-Skripts
3. `logs/` in `.gitignore`, aber `logs/.gitkeep` tracken

### 2.7 Retry-Logic für Setup-Phasen

**Quelle:** `11-setup-scripts.md` SU-M03

**Schritte:**

1. `pull_images_with_retry()` — max 3x, exponential backoff
2. MinIO-Init: Nach Fehler explizit stoppen, nicht "silent continue"
3. DB-Init-Check nach `docker compose up`: Warte max 120s auf `pg_isready`, sonst abort

**Phase-2-Abschluss-Kriterium:**

- Fresh-Jetson: `git clone && ./arasul bootstrap --from .env.template` → funktioniert in <20 min
- Re-run auf bestehendem System: idempotent, keine Data-Loss
- Offline-Jetson: `--offline` Flag funktioniert mit pre-loaded images
- Setup-Log in `logs/` abgelegt, nachvollziehbar

---

## Phase 3 — Multi-Jetson-Support inkl. Thor (3-5 Tage)

**Ziel:** Rollout auf Orin-Varianten (32/64GB, NX, Nano) + Thor 128GB.

### 3.1 [BLOCKER] Thor-Abstraction-Layer

**Quelle:** `12-jetson-compat.md` JC-B01, JC-B03; `19-jetson-research.md` Phase A

**Schritte:**

1. `scripts/setup/detect-jetson.sh` erweitern:
   - Neue Profile: `thor_128gb` → setzt `JETPACK_VERSION=7.x`, `CUDA_VERSION=13.0`, `COMPUTE_CAP=11.0`, `IMAGE_STREAM=thor`
   - Orin bleibt: `IMAGE_STREAM=orin`, `JETPACK_VERSION=6`, `CUDA_VERSION=12.6`, `COMPUTE_CAP=8.7`
2. `.env` neue Variablen: `OLLAMA_IMAGE`, `PYTORCH_BASE_IMAGE`, `EMBEDDING_BASE_IMAGE` — vom Profile gesetzt
3. `compose/compose.ai.yaml` Line 65 `LD_LIBRARY_PATH` → `${LD_LIBRARY_PATH_JP:-/usr/local/cuda-12.6/...}` mit Profile-Default
4. `compose.override.orin.yaml` + `compose.override.thor.yaml` — GPU-Device-Binding:
   - Orin: `runtime: nvidia` + `deploy.resources.reservations.devices` ODER `--gpus=all`
   - Thor: `runtime: nvidia` NUR (kein `--gpus=all`, kein device-reservation)
5. `arasul bootstrap` wählt automatisch `compose.override.<profile>.yaml`

### 3.2 [BLOCKER] Ollama auf Thor — richtige Image-Version

**Quelle:** `12-jetson-compat.md` JC-B02

**Schritte:**

1. Thor: `ghcr.io/nvidia-ai-iot/ollama:r38.2.arm64-sbsa-cu130-24.04` (NVIDIA official)
2. Orin: bisheriges Image (dustynv oder ollama-eigenes)
3. Workaround für bestätigten Bug: Ollama 0.12.9 pinnen (nicht 0.12.10) — via Env-Var `OLLAMA_VERSION=0.12.9`
4. Testen: `ollama run qwen3:8b "hello"` auf Thor-Dev-Kit → keine graphics exceptions

### 3.3 [BLOCKER] Embedding-Service → ONNX Runtime

**Quelle:** `12-jetson-compat.md` JC-B04; `19-jetson-research.md` Phase B

**Problem:** PyTorch-Wheels für sm_110 (Thor) noch nicht released, `aapot/bge-m3-onnx` löst es.

**Schritte:**

1. Neues Embedding-Image basierend auf ONNX Runtime + CUDA-EP
2. Model: `aapot/bge-m3-onnx` (HuggingFace) — INT8/FP16 Quant prüfen
3. `services/embedding-service/server.py` umschreiben von HF Transformers auf ONNX Runtime
4. Benchmark auf Orin: muss mindestens 30 req/s (aktuell ~45ms/req = 22 req/s) erreichen
5. Compose: `embedding-service` nutzt neues Image für BEIDE Profile
6. ONNX-Runtime GPU-Discovery-Warning (`/sys/class/drm/card1/...`) unterdrücken (LIVE-m01)

### 3.4 [MAJOR] RAM-Profile-Overrides für kleine Jetsons

**Quelle:** `10-infra-docker.md` I-M04, `12-jetson-compat.md` JC-M02

**Schritte:**

1. `compose.override.nano4gb.yaml`, `compose.override.nano8gb.yaml`, `compose.override.nx16gb.yaml`
2. Mem-Limits runterskaliert:
   - Nano 4GB: LLM=2G, Embedding=1G, Qdrant=512M, Postgres=512M → aber realistisch: qwen3:8b nicht ladbar, nur kleinere Modelle
   - Nano 8GB: LLM=4G, Embedding=2G, Qdrant=1G, Postgres=1G
3. Empfohlene LLM-Modelle pro Profile: Nano → `phi3:3.8b` oder `gemma2:2b`
4. Setup-Skript: bei Nano warnt: "Nur reduzierte LLM-Funktion möglich, qwen3 nicht unterstützt"

### 3.5 [MAJOR] Multi-Arch Digest-Pinning

**Quelle:** `19-jetson-research.md` Phase C

**Schritte:**

1. `compose/*.yaml` — alle `image: foo:tag` → `image: foo@sha256:<digest>`
2. Für Multi-Arch: `docker buildx imagetools inspect` für jeden Tag → Digest pinnen
3. Build-Args für Versionen (`PYTHON_VERSION`, `L4T_PYTORCH_TAG`) in `.env` + Template (I-m05)

### 3.6 [MAJOR] Thor-Testmatrix

**Quelle:** `19-jetson-research.md` Phase D

**Schritte:**

1. Thor Dev-Kit beschaffen (USD 3,499)
2. Full-Setup-Durchlauf: `./arasul bootstrap --from .env.template`
3. Smoke-Tests aller Services (docker compose ps, health-endpoints)
4. RAG-End-to-End: Doc upload + search + chat
5. Performance-Benchmark: LLM TPS, Embedding latency, RAG-Retrieval-Zeit
6. Dokumentation: `docs/JETSON_THOR_TESTING.md` mit allen Ergebnissen

### 3.7 [MAJOR] `docs/JETSON_COMPATIBILITY.md` komplett neu schreiben

- Alle 7 Modelle dokumentiert
- RAM-Requirements pro Profile
- Empfohlene Modelle pro Profile
- Known-Issues pro Profile

### 3.8 [MINOR] MinIO-Alternative evaluieren (Phase E)

**Quelle:** `12-jetson-compat.md` JC-M04; `19-jetson-research.md` Phase E

**Schritte:**

1. Zwei Kandidaten: SeaweedFS, Garage
2. Prototyp auf Orin: ersetze MinIO, alle Features (S3-API, Bucket-Policy, Web-UI) testen
3. Migration-Pfad aus MinIO dokumentieren
4. Entscheidung: Bleiben bei MinIO-Community (Risiko) vs Migration

### 3.9 [MINOR] JetPack 7.2 Dry-Run vorbereiten (Phase F)

- Monitor NVIDIA Developer Forum für JP7.2-Release (geplant Q2 2026)
- Sobald verfügbar: Orin JP6 → JP7.2 (unified SBSA) Migration-Plan

**Phase-3-Abschluss-Kriterium:**

- Thor Dev-Kit läuft full-stack
- Alle Orin-Varianten (4-64GB) dokumentiert + getestet (mindestens Profile-Simulation)
- Embedding-Service läuft auf ONNX (verified auf Orin)
- `compose.override.<profile>.yaml` für alle 7 Profile existiert

---

## Phase 4 — Frontend-Funktions-Completeness (5-7 Tage)

**Ziel:** Jeder Tab/Feature im Frontend funktioniert optimal. Fehlende Settings-Seiten gebaut.

### 4.1 [MAJOR] Fehlende Settings-Tabs bauen

**Quelle:** `06-frontend-settings.md`

#### 4.1.1 LLM-Konfiguration-Tab (`LLMSettings.tsx`)

- Model-Liste aus `GET /services/llm/models`
- Default-Model setzen (aktuell Gemma 4)
- Download-Status je Modell (running/done/failed)
- Model entfernen/hinzufügen
- `num_ctx`-Override pro Modell (aus Phase 1.7)
- Temperature/Top-P-Defaults

#### 4.1.2 User-Management-Tab (`UserManagement.tsx`)

- `admin_users` CRUD
- Role-Assignments (admin, viewer, editor)
- Aktive Sessions anzeigen (`active_sessions` Tabelle)
- Session revoken

#### 4.1.3 Backup-Settings-Tab (`BackupSettings.tsx`)

- Schedule-Konfiguration (Cron-Expression)
- Retention-Einstellung
- Restore-UI mit File-Browser in MinIO
- Last-Backup-Report-Widget
- WAL-Archiving-Status-Widget (Phase 1.1 Folge)
- Integrity-Check-Button

#### 4.1.4 RAG-Settings-Tab (`RAGSettings.tsx`)

- Chunk-Size / Chunk-Overlap
- Top-K für Retrieval
- Rerank-Score-Threshold (aktuell hardcoded `0.1` in ChatMessage)
- Collection-Management (derzeit nur `documents`, evtl. mehrere Spaces)
- Embedding-Model-Auswahl (zukünftig: BGE-M3 vs andere)

### 4.2 [MAJOR] AIProfile-Settings transaktional

**Quelle:** `06-frontend-settings.md` S-01, S-03

**Schritte:**

1. Backend: Neuer Endpoint `PUT /api/settings/ai-profile` der beide Felder atomar merged
2. Frontend: Ein Call statt Promise.all von 2 Calls
3. Server-Response als State übernehmen (nicht lokaler State kopieren)

### 4.3 [MAJOR] Zod-Validierung in Settings

**Quelle:** `06-frontend-settings.md` S-02

**Schritte:**

1. Schemas in `packages/shared-schemas/` definieren (Tailscale-Authkey, Update-Size, Password-Rules)
2. Frontend-Forms: `@hookform/resolvers/zod` nutzen (Pattern aus FE-20)
3. Update-Upload: Client-Size-Check 500MB (S-06)

### 4.4 [MAJOR] Services-Endpoint konsolidieren

**Quelle:** `06-frontend-settings.md` S-04

**Schritte:**

1. Backend: `/services/` vs `/services/all` — eines löschen oder klar abgrenzen
2. Frontend: Alle Calls auf einen Endpoint
3. `docs/API_REFERENCE.md` aktualisieren

### 4.5 [MAJOR] Chat — System-Prompt pro Chat

**Quelle:** `07-frontend-chat.md` C-01

**Schritte:**

1. DB-Migration: `chat_conversations` neue Spalte `system_prompt TEXT`
2. Backend: GET/PUT `/api/chat/:id/settings` mit system_prompt
3. Frontend: Settings-Drawer in ChatView mit System-Prompt-Editor (Override vs Project-Level)

### 4.6 [MAJOR] Chat — Syntax-Highlighting + Code-Copy

**Quelle:** `07-frontend-chat.md` C-03, C-04

**Schritte:**

1. `react-syntax-highlighter` oder `shiki` einbinden (lightweight, Prism als Fallback)
2. Custom Code-Renderer in `react-markdown` → wraps in `<pre>` mit Copy-Button
3. Styling an shadcn/ui anpassen

### 4.7 [MAJOR] Chat — Regenerate-Button

**Quelle:** `07-frontend-chat.md` C-05

**Schritte:**

1. Pro Assistant-Message: 🔄-Icon
2. Regen = delete message + re-send letzte User-Message mit gleicher SessionID
3. Optional: neue Message als "regenerate-of:<old-id>" markieren

### 4.8 [MAJOR] Documents — TanStack Query Migration

**Quelle:** `05-frontend-documents.md` DM-01

**Schritte:**

1. `DocumentManager.tsx` — `useQuery(['documents', filters], ...)` ersetzt useState + useEffect-Fetches
2. Mutations: `useMutation` für Upload/Delete/Reindex
3. Query-Invalidation bei Mutations
4. Pattern aus FE-21 wiederverwenden

### 4.9 [MAJOR] Documents — SSE statt Polling

**Quelle:** `05-frontend-documents.md` DM-02

**Schritte:**

1. Backend: Neuer SSE-Endpoint `GET /api/documents/stream` → sendet `indexing_status_changed` Events
2. Frontend: EventSource-Subscription, invalidate React-Query bei Update
3. Fallback: Polling alle 30s wenn SSE nicht verfügbar

### 4.10 [MAJOR] Documents — Embedding-Health-Banner

**Quelle:** `05-frontend-documents.md` DM-03

**Schritte:**

1. Frontend: `useQuery(['embedding-health'])` pollt `GET /api/services/embedding-service/health`
2. Banner oben: "⚠️ Indexer offline — Uploads schlagen fehl" wenn unhealthy
3. Similar für document-indexer

### 4.11 [MAJOR] Protected Routes

**Quelle:** `08-frontend-shell.md`

**Schritte:**

1. `<ProtectedRoute>` Wrapper-Komponente in Router
2. Checks: JWT gültig, Session in DB aktiv, Role-Permission
3. Redirect auf `/login` bei Fail
4. Alle authentifizierten Routes wrappen

### 4.12 [MAJOR] God-Component-Refactoring

**Quelle:** `08-frontend-shell.md`

**Schritte:**

1. `DocumentManager.tsx` (1550 LOC) splitten:
   - `DocumentList.tsx`, `DocumentUpload.tsx`, `DocumentDetails.tsx`, `SpaceManager.tsx`
2. `ChatContext.tsx` (1210 LOC) ggf. in mehrere Contexts (Messages, Streaming, Sessions)
3. Nicht alles auf einmal — inkrementell pro Feature

### 4.13 [MINOR] WebSocket-Session-Expiry

**Quelle:** `03-auth-functional.md` F1

**Schritte:**

1. WS-Backend: Session-Check bei jeder Message
2. Bei Expiry: WS-Close mit Code 4001
3. Frontend: WS-Reconnect triggert Logout bei Code 4001

### 4.14 [MINOR] Token-Expiry-Warning-UI

**Quelle:** `03-auth-functional.md` F2

**Schritte:**

1. Event `token_expiry_warning` (dispatched, aber kein Consumer)
2. Toast/Modal: "Deine Session läuft in 5min ab — Weiter arbeiten?"
3. Refresh-Button triggert token-refresh

### 4.15 [MINOR] Sonstige Polish

- DM-06: Quota-Warning-Banner bei >80%
- C-02: Tool-Use UI (wenn Backend folgt)
- C-06: Audio I/O (falls gewünscht — separate Entscheidung)
- C-09: ARIA für Error-Banner
- S-05: SelfHealing-AutoRefresh mit Error-Count
- C-10: Keyboard-Shortcuts-Hilfe (`?`-Key)

**Phase-4-Abschluss-Kriterium:**

- Alle 11 Settings-Tabs funktionieren + haben UI (vorher 7 von 11)
- Chat-Features: System-Prompt, Syntax-Highlighting, Copy, Regenerate
- Documents: TanStack + SSE statt Polling
- Protected Routes überall
- `DocumentManager.tsx` < 500 LOC

---

## Phase 5 — Ops & Resilience für 5J-Autonomie (3-4 Tage)

**Ziel:** Appliance kann 5 Jahre unbeaufsichtigt laufen, Admin wird bei Incidents extern alarmiert.

### 5.1 [BLOCKER] Externe Alert-Auslieferung

**Quelle:** `13-ops-services.md` OPS-B02

**Schritte:**

1. DB-Migration: `alert_channels` Tabelle (email, webhook, telegram)
2. Backend: `services/alerter.js` — konsumiert `alert_history`, verteilt via Channels
3. SMTP-Integration: nodemailer, Credentials aus `.env`
4. Webhook: generisch (HTTP POST with JSON)
5. Telegram: optional (falls Bot konfiguriert)
6. Frontend: Settings-Tab "Alert-Kanäle" mit CRUD + Test-Button

### 5.2 [BLOCKER] Backup-Restore-Drill

**Quelle:** `13-ops-services.md` OPS-B03

**Schritte:**

1. Script: `scripts/ops/restore-drill.sh`
   - Pick latest backup
   - Spin up temp postgres-db (separates Netzwerk)
   - Restore basebackup + WAL-Apply
   - Verify: count(\*) on alle critical tables, kein Error in Restore-Log
2. Weekly Cron (sonntag 04:00): läuft automatisch, schreibt Report
3. Report auf Frontend sichtbar (Backup-Tab)

### 5.3 [MAJOR] Ops-Dashboard

**Quelle:** `13-ops-services.md` OPS-M05

**Schritte:**

1. Backend: `GET /api/ops/overview` — Last-Backup, WAL-Lag, Active-Alerts, Service-Health-Aggregate, Disk-Usage, GPU-Temp
2. Frontend: Neues Dashboard-Widget "System-Gesundheit"
3. Click-through: Backup → `BackupSettings`, Alerts → `AlertHistory`

### 5.4 [MAJOR] Flapping-Detector (Vertiefung aus Phase 1.2)

**Schritte:**

1. Self-Healing-Agent speichert pro Service eine "Flapping-History" (rolling 24h)
2. Wenn `recovery_attempts` > Threshold: Service in "quarantine" status
3. Admin muss manuell entquarantinieren (UI oder CLI)

### 5.5 [MAJOR] app_events Retention

**Quelle:** `13-ops-services.md` OPS-M04

**Schritte:**

1. Cron-Job (backup-service oder neuer): `DELETE FROM app_events WHERE created_at < NOW() - INTERVAL '90 days'`
2. Chat-Messages Retention: 1 Jahr (konfigurierbar)
3. Scheme-Migration mit Default-Werten

### 5.6 [MAJOR] Metrics-Collector erweitert

**Quelle:** `13-ops-services.md` OPS-M02; `16-python-services.md` PY-M06

**Schritte:**

1. pg_stat_user_tables: n_dead_tup, n_live_tup, last_autovacuum
2. Qdrant collection stats: vectors_count, indexed_vectors_count, segments_count
3. MinIO usage: bucket_size, object_count
4. GPU-Memory (aus tegrastats)
5. Alle in Postgres + optional Loki

### 5.7 [MINOR] Auto-Update-Mechanismus

- Aktuell: Manual via USB-Update (Update-Tab)
- Vorschlag: Optional `auto_check_updates` in Settings, holt Release-Info von definierter URL
- NICHT auto-install ohne User-Confirm

### 5.8 [MINOR] Backup-Export auf USB

**Quelle:** `13-ops-services.md` OPS-m04

**Schritte:**

1. Frontend: "Backup auf USB exportieren" Button (Backup-Tab)
2. Backend: rsync von backup-volume auf gemounteten USB-Pfad
3. Integrity-Check danach (SHA256 match)

**Phase-5-Abschluss-Kriterium:**

- Test-Alert: Simulate Service-Crash → Email/Webhook kommt an
- Restore-Drill läuft wöchentlich grün
- Ops-Dashboard zeigt alle kritischen Metriken
- Flapping-Detector verhindert Floods wie LIVE-B02

---

## Phase 6 — Test-Coverage + CI-Hardening (3-5 Tage)

**Ziel:** Regressionen werden früh erkannt. Coverage-Ziele erfüllt.

### 6.1 [MAJOR] Coverage-Thresholds erhöhen

**Quelle:** `14-tests.md`

**Schritte:**

1. Backend `jest.config.js`: 20→70 coverage threshold step-by-step
2. Frontend `vitest.config.ts`: 30→70
3. Phase-Plan: 20→40 (Phase 6.1), 40→60 (Phase 6.2), 60→70 (Phase 6.3)
4. Jede Erhöhung erfordert neue Tests für bisher ungecoverte Pfade

### 6.2 [MAJOR] E2E-Test-Ausbau

**Schritte:**

1. Aktuell 4 E2E-Tests → mindestens 15
2. Critical Flows: Login, Chat, Doc-Upload+RAG, Admin-User-CRUD, Settings-Änderung, Backup-Restore-UI
3. Playwright oder Cypress gegen live Docker-Compose

### 6.3 [MAJOR] Integration-Tests für Python-Services

**Quelle:** `16-python-services.md` PY-M05

**Schritte:**

1. self-healing-agent: Recovery-Logic gegen Mock-Compose testen
2. embedding-service: Request-Response gegen echte GPU
3. metrics-collector: pg_stat_reads

### 6.4 [MAJOR] CI-Pipeline (GitHub Actions?)

**Schritte:**

1. Backend-Tests on PR
2. Frontend-Tests on PR
3. Lint + Typecheck
4. Docker Build-Check (nicht Full-Run)
5. Optional: ARM64-Runner für Jetson-spezifische Tests

### 6.5 [MAJOR] Load-Tests

**Schritte:**

1. k6 oder Artillery: 100 parallel Users auf /api/chat
2. LLM-Queue-Behavior unter Last
3. Document-Upload Bulk 100 Files
4. Dashboard auf 4GB-Nano-Profil testen

### 6.6 [MINOR] Dependabot + Security-Audit

- `npm audit` + `pip-audit` in CI
- Dependabot für automatische Updates

**Phase-6-Abschluss-Kriterium:**

- Backend Coverage >= 70%
- Frontend Coverage >= 70%
- 15+ E2E-Tests grün
- CI läuft <10min

---

## Phase 7 — Code-Qualität + Schuldenabbau (laufend, priorisiert)

**Ziel:** Nachhaltigkeit. Schulden abbauen, ohne Momentum zu verlieren.

### 7.1 [MAJOR] `@arasul/shared-schemas` Vollständigkeit

**Quelle:** `17-shared-schemas.md`

**Schritte:**

1. Alle 20+ lokalen Schemas → shared-schemas migrieren
2. Schema-Tests (mindestens eine Gültigkeits- + eine Ungültigkeits-Probe)
3. Query-Key-Factory in shared-schemas für TanStack Query
4. OpenAPI-Export (Zod → OpenAPI 3.1) für `docs/API_REFERENCE.md`

### 7.2 [MAJOR] `docs/DATABASE_SCHEMA.md` regenerieren

**Quelle:** `09-database.md` DB-M01

**Schritte:**

1. Script `scripts/docs/generate-db-schema.sh`:
   ```bash
   docker exec postgres-db pg_dump -s -U arasul -d arasul_db > schema.sql
   # Transform to Markdown (tables + columns + FKs + indexes)
   ```
2. Git-Hook: Pre-Commit warnt bei Schema-Änderungen ohne Doc-Regen

### 7.3 [MAJOR] Backend Validator-Coverage

**Quelle:** `01-backend-routes.md`

**Schritte:**

1. 11 Routes ohne validateBody → alle mit Zod-Schema ausstatten
2. Error-Envelope durchgängig `{ error: { code, message, details } }`

### 7.4 [MAJOR] Backend Service-Layer

**Quelle:** `02-backend-services.md`

**Schritte:**

1. B001: Fetch-Timeouts konsistent (AbortController, 30s-Default)
2. B002: Circuit-Breaker um ragCore.js:852-860 (external embedding calls)
3. B003: Document-Indexer retry-logic (schon in Phase 1.4 gelöst)

### 7.5 [MAJOR] Frontend-Components raw `fetch()` ausmerzen

**Quelle:** `08-frontend-shell.md`

**Schritte:**

1. Grep: `fetch(` in `apps/dashboard-frontend/src/**/*.tsx`
2. Alle zu `useApi()` migrieren

### 7.6 [MAJOR] DB-Migrations mit Down-Pfad

**Quelle:** `09-database.md` DB-M04

**Schritte:**

1. Für die 4 destructive Migrations Down-Scripts schreiben
2. Neue Convention: jede Migration hat Up + Down

### 7.7 [MAJOR] DB-Partitionierung vorbereiten

**Quelle:** `09-database.md` DB-m02

**Schritte:**

1. Plan: `chat_messages`, `app_events`, `self_healing_events` → RANGE by month
2. Migration sobald Größe >1GB pro Tabelle

### 7.8 [MAJOR] Python-Base-Image konsolidieren

**Quelle:** `16-python-services.md` PY-B03

**Schritte:**

1. Neues `arasul-python-base:<version>` Image mit PyTorch + CUDA-Runtime
2. LLM/Embedding/Indexer nutzen alle dasselbe Base
3. Reduziert Image-Layer-Duplikation um >5GB

### 7.9 [MAJOR] Python-async für Embedding

**Quelle:** `16-python-services.md` PY-M02

**Schritte:**

1. Flask → FastAPI-Migration
2. Gleichzeitige Requests via async/await + thread-pool für PyTorch-GPU-Calls

### 7.10 [MAJOR] n8n-Integration vervollständigen

**Quelle:** `15-n8n.md`

**Schritte:**

1. N8N-M01: SSO mit Dashboard-JWT
2. N8N-M02: Frontend-Trigger-API `POST /api/n8n/trigger/:workflow_id`
3. N8N-M03: Workflows in `n8n-workflows/*.json` committen + Auto-Import
4. N8N-M04: Custom-Nodes-Build in `./arasul bootstrap`

### 7.11 [MINOR] Tailwind v4-Check

- DownloadProgress.tsx:127 `bg-linear-to-r` — Tailwind v4-Syntax verifizieren
- Alle Stellen durchgehen wo v3→v4 Migration unvollständig sein könnte

### 7.12 [MINOR] Dashboard-Frontend Polish

- Uncommittete Änderungen commited (Phase 0.1)
- Store-Stop-Dialog Feedback holen (User hat es entfernt — bewusst so? Memory-Eintrag)

---

## Ausführungs-Reihenfolge (empfohlen)

Jede Phase kann in frischem Kontext-Window als eigene Sub-Mission ausgeführt werden. Empfohlene Reihenfolge:

**Woche 1 (sofort):**

1. Phase 0 (Quick-Wins) — 1-2h
2. Phase 1 (Live-Stabilisierung) — 1-2 Tage
3. Phase 2 (Setup-Idempotenz) — 2-3 Tage

**Woche 2:** 4. Phase 5 (Ops & Resilience) — 3-4 Tage — zeitgleich Backup-Drill testen

**Woche 3-4:** 5. Phase 3 (Jetson Multi-Support + Thor) — 3-5 Tage — braucht Thor Dev-Kit, ab sofort bestellen 6. Phase 4 (Frontend Completeness) — 5-7 Tage

**Woche 5-6:** 7. Phase 6 (Test + CI) — 3-5 Tage 8. Phase 7 (Schulden-Abbau) — laufend, parallel zu Anderem

**Total:** ~6 Wochen zur vollständigen Rollout-Fähigkeit + 5J-Autonomie-Readiness.

---

## Anhang A — Quell-Reports (alle in `.claude/analysis/`)

| Nr  | Datei                      | Thema                                   |
| --- | -------------------------- | --------------------------------------- |
| 01  | `01-backend-routes.md`     | Backend-Routes Audit (17 KB)            |
| 02  | `02-backend-services.md`   | Backend Services + Circuit-Breaker      |
| 03  | `03-auth-functional.md`    | Auth + Sessions + WS-Expiry             |
| 04  | `04-frontend-store.md`     | Store-Feature + uncommitted Changes     |
| 05  | `05-frontend-documents.md` | DocumentManager + TanStack-Gap          |
| 06  | `06-frontend-settings.md`  | Settings-Tabs Inventar + Gaps           |
| 07  | `07-frontend-chat.md`      | Chat + Streaming + fehlende Features    |
| 08  | `08-frontend-shell.md`     | Router + God-Components (23 KB)         |
| 09  | `09-database.md`           | DB + Migrationen + Schema-Doc           |
| 10  | `10-infra-docker.md`       | Docker + Traefik + Healthchecks         |
| 11  | `11-setup-scripts.md`      | Setup-Skripte + Bootstrap               |
| 12  | `12-jetson-compat.md`      | Jetson Orin + Thor Kompatibilität       |
| 13  | `13-ops-services.md`       | Self-Healing + Metrics + Backup         |
| 14  | `14-tests.md`              | Test-Coverage (13 KB)                   |
| 15  | `15-n8n.md`                | n8n-Integration                         |
| 16  | `16-python-services.md`    | Python-Services (LLM/Embedding/Indexer) |
| 17  | `17-shared-schemas.md`     | Shared Schemas + Zod (13 KB)            |
| 18  | `18-live-runtime.md`       | Live-Runtime Snapshot (KRITISCH!)       |
| 19  | `19-jetson-research.md`    | Jetson Thor Web-Research (17 KB)        |

## Anhang B — Findings-Priorität auf einen Blick

### BLOCKERS (insgesamt 14)

- LIVE-B01: WAL-Archiving broken → Phase 1.1
- LIVE-B02: Self-Healing-Flood → Phase 1.2
- SU-B01: Setup nicht idempotent → Phase 2.1
- SU-B02: Kein .env.template → Phase 2.2
- SU-B03: Keine Netzwerk-Validierung → Phase 2.3
- SU-B04: ADMIN_PASSWORD Plaintext → Phase 2.4
- I-B01: Embedding start_period 600s → Phase 1 (Nebenfix)
- I-B02: LLM-Healthcheck hängt → Phase 1 (Nebenfix)
- JC-B01/B03: Thor SBSA + Image-Tags → Phase 3.1
- JC-B02: Ollama-Bug Thor → Phase 3.2
- JC-B04: BGE-M3 sm_110 → Phase 3.3
- OPS-B01: Kein Flapping-Detector → Phase 1.2 + 5.4
- OPS-B02: Keine externen Alerts → Phase 5.1
- OPS-B03: Backup-Restore ungetestet → Phase 5.2
- PY-B01: telegram-bot Source weg → Phase 0.3
- PY-B02: Gunicorn-Thread-Safety → Phase 7.9

### MAJORS: ~45 (verteilt auf Phasen 1, 3, 4, 5, 6, 7)

### MINORS: ~30 (meist Phase 7 oder on-the-fly)

---

**Ende des Plans.** Bei Start einer Phase: Report-Datei zur Phase lesen, dann Schritt für Schritt.
