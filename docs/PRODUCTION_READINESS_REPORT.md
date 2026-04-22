# Arasul Platform — Production Readiness Report

> **📜 Archived — superseded by [ROADMAP.md](ROADMAP.md).**
> Historical audit snapshot from 2026-04-10. Its findings drove Phases 0–5
> of the cleanup plan; state has moved on considerably since. Keep for
> historical context, but don't work from it.

**Datum**: 10. April 2026
**Analyse**: 13 parallele Deep-Dive Agenten, ~1.100 Dateien analysiert
**Ziel**: Produkt an ersten Kunden ausliefern, 5 Jahre autonomer Betrieb

---

## Executive Summary

| Bereich                   | Score  | Kritische Issues | Status                        |
| ------------------------- | ------ | ---------------- | ----------------------------- |
| Setup & Bootstrap         | 62%    | 5                | Braucht Hardening             |
| Backend API & Routes      | 7/10   | 2                | Solide Basis                  |
| Backend Services & Logic  | 7/10   | 3                | Stream-Cleanup noetig         |
| Frontend Architektur      | A-     | 1                | Exzellent                     |
| Frontend Features         | B+     | 2                | Kleine Fixes                  |
| Datenbank Schema          | 6.5/10 | 3                | FK-Constraints fehlen         |
| Docker/Compose/Infra      | B      | 3                | Credentials + Health Checks   |
| AI/ML Pipeline            | 5/10   | 23               | **GROESSTER HANDLUNGSBEDARF** |
| Security & Auth           | 7/10   | 3                | RBAC fehlt                    |
| Ops & Self-Healing        | 6.5/10 | 6                | Watchdog + Boot-Schutz fehlt  |
| Test Coverage             | 5/10   | 3                | 11 Service-Dirs ohne Tests    |
| Dokumentation             | 6/10   | 3                | Veraltet, unvollstaendig      |
| Cross-Service Integration | 7/10   | 2                | Upload-Race-Condition         |

**Gesamtbewertung: 6.5/10 — Solide Basis, aber nicht production-ready fuer Kunden**

Die Plattform hat eine exzellente Architektur und viele Best Practices. Die Hauptprobleme liegen in:

1. **AI/ML Resource Management** — Kein globales GPU-Memory-Budget, Jetson-spezifische Optimierungen fehlen
2. **5-Jahres-Autonomie** — Hardware Watchdog, Boot-Loop-Schutz, NVMe-Monitoring fehlen
3. **Datenintegritaet** — Fehlende FK-Constraints, Upload-Race-Conditions
4. **Test-Coverage** — Kritische Service-Layer komplett ungetestet

---

## PHASE 0: SHOWSTOPPER (Vor Kundenauslieferung, ~2-3 Wochen)

### 0.1 Hardware Watchdog & Boot-Schutz

**Prioritaet**: BLOCKER | **Aufwand**: 1-2 Tage

Ohne Hardware Watchdog haengt das Geraet bei Kernel-Panics oder I/O-Stalls fuer immer.

**Tasks**:

- [ ] Tegra Hardware Watchdog aktivieren (`tegra_wdt`)
- [ ] Systemd Watchdog konfigurieren (`RuntimeWatchdogSec=30`)
- [ ] Kernel Panic Auto-Reboot: `kernel.panic=10`, `kernel.panic_on_oops=1`
- [ ] Boot-Loop-Protection implementieren (max 5 Reboots/Stunde, dann Recovery-Mode)
- [ ] Boot-Counter in `/var/lib/arasul/boot_count` persistieren

**Dateien**:

- NEU: `/etc/systemd/system.conf.d/watchdog.conf`
- NEU: `/etc/sysctl.d/99-arasul.conf`
- NEU: `scripts/system/boot-guard.service`

---

### 0.2 GPU Memory Budget & Jetson-Optimierung

**Prioritaet**: BLOCKER | **Aufwand**: 3-5 Tage

Das groesste Problem: Kein globales GPU-Memory-Management. LLM (26B Gemma4) + Embedding (BGE-M3) + Reranker = ~28GB auf einem 32GB Jetson. OOM-Kills sind vorprogrammiert.

**Tasks**:

- [ ] Zentralen GPU Memory Allocator implementieren (Services melden Bedarf an)
- [ ] RAM_LIMIT_LLM Integer-Overflow-Schutz in `modelService.js:735-741`
- [ ] Qdrant: `always_ram=False` setzen (statt `True`) in `qdrant_manager.py:71-73`
- [ ] Qdrant: HNSW Parameter fuer ARM64 optimieren: `m=8, ef_construct=50` (statt `m=16, ef_construct=100`)
- [ ] Jetson Thermal Throttling Detection via `/sys/devices/virtual/thermal/thermal_zone*/temp`
- [ ] LLM Service: GPU Memory Query ueber `/proc/meminfo` fuer Unified Memory
- [ ] Embedding Service: FP16 Qualitaets-Validierung beim Startup
- [ ] Document Indexer: Real-Time Memory Check vor PDF-Parsing
- [ ] Aborted Streams muessen GPU-Ressourcen freigeben (`res.on('close')` → Abort Ollama Request)

**Dateien**:

- `services/document-indexer/qdrant_manager.py` Zeilen 70-73
- `services/embedding-service/embedding_server.py` Zeilen 92-97, 226-230
- `services/llm-service/api_server.py` Zeilen 446-460
- `apps/dashboard-backend/src/services/llm/modelService.js` Zeilen 735-741
- `apps/dashboard-backend/src/services/llm/llmJobProcessor.js` (Stream Cleanup)

---

### 0.3 Datenbank-Integritaet reparieren

**Prioritaet**: BLOCKER | **Aufwand**: 1-2 Tage

Fehlende Foreign Keys ermoeglichen verwaiste Datensaetze. Status-Enum-Mismatch kann Chat-Messages korrumpieren.

**Tasks (4 neue Migrationen)**:

- [ ] **Migration 066**: FK-Constraints hinzufuegen
  - `llm_installed_models(id)` → `llm_model_catalog(id) ON DELETE CASCADE`
  - `llm_model_switches(to_model/from_model)` → `llm_model_catalog(id) ON DELETE SET NULL`
  - `llm_jobs(requested_model)` → `llm_model_catalog(id) ON DELETE SET NULL`
- [ ] **Migration 067**: Status-Enum-Fix
  - `chat_messages.status` CHECK um `'cancelled'` erweitern
- [ ] **Migration 068**: Fehlende Indexes
  - `llm_jobs(status, requested_model)` Compound Index
  - `chat_attachments(message_id, extraction_status)` Compound Index
- [ ] **Migration 069**: Cascade-Deletes korrigieren
  - `telegram_*` und `claude_terminal_*` von `ON DELETE CASCADE` zu `ON DELETE RESTRICT`

**Dateien**:

- `services/postgres/init/066_add_fk_constraints.sql` (NEU)
- `services/postgres/init/067_fix_status_enum.sql` (NEU)
- `services/postgres/init/068_add_missing_indexes.sql` (NEU)
- `services/postgres/init/069_fix_cascade_deletes.sql` (NEU)
- `CLAUDE.md` Zeile 31/124: Migration-Nummer aktualisieren (64→70)

---

### 0.4 File Upload Race Condition fixen

**Prioritaet**: BLOCKER | **Aufwand**: 0.5 Tage

MinIO-Upload ist nicht in einer DB-Transaction. Wenn der DB-Insert nach dem Upload fehlschlaegt, verwaisen Dateien in MinIO.

**Task**:

- [ ] Upload-Flow umstrukturieren: DB-Insert ZUERST (status='uploading'), dann MinIO Upload, dann DB-Update (status='pending')
- [ ] Cleanup-Job fuer verwaiste MinIO-Dateien (ohne DB-Eintrag) implementieren

**Datei**: `apps/dashboard-backend/src/routes/documents.js` Zeilen 328-377

---

### 0.5 SQL Injection in n8nLogger fixen

**Prioritaet**: BLOCKER | **Aufwand**: 0.5 Tage

**Task**:

- [ ] SQL-Queries in `n8nLogger.js` parametrisieren (Zeilen 152, 239)

**Datei**: `apps/dashboard-backend/src/services/n8nLogger.js`

---

### 0.6 Docker Credentials zu Secrets migrieren

**Prioritaet**: BLOCKER | **Aufwand**: 1 Tag

Credentials als plain Environment Variables in mehreren Compose-Files statt Docker Secrets.

**Tasks**:

- [ ] `compose/compose.ai.yaml`: POSTGRES_PASSWORD → Secret
- [ ] `compose/compose.monitoring.yaml`: POSTGRES_PASSWORD, MINIO Credentials → Secrets
- [ ] Alle betroffenen Services: `_FILE` Suffix verwenden
- [ ] Testen, dass `resolveSecrets.js` Pattern ueberall funktioniert

**Dateien**:

- `compose/compose.ai.yaml` Zeilen 169-170, 186
- `compose/compose.core.yaml` Zeile 68
- `compose/compose.monitoring.yaml` Zeilen 32, 77, 142, 146

---

### 0.7 Backup-Verschluesselung

**Prioritaet**: BLOCKER | **Aufwand**: 0.5 Tage

Backups liegen unverschluesselt auf der Disk. Bei Diebstahl = kompletter Datenverlust.

**Tasks**:

- [ ] GPG-Verschluesselung in `backup.sh` einbauen
- [ ] Backup-Integritaets-Verification nach jedem Backup (`gunzip -t`, `tar -tzf`)
- [ ] Restore-Script erstellen und testen (`scripts/recovery/restore-from-backup.sh`)

**Datei**: `services/backup-service/backup.sh`

---

### 0.8 Streaming Error Handling fixen

**Prioritaet**: BLOCKER | **Aufwand**: 1 Tag

Wenn nach `initSSE(res)` ein Fehler auftritt, ist der HTTP-Status bereits 200. Der globale Error Handler greift nicht mehr.

**Tasks**:

- [ ] Alle Validierungen VOR `initSSE()` ausfuehren
- [ ] SSE-spezifischen Error Handler implementieren (Error als SSE-Event senden)
- [ ] Streaming Routes in `llm.js`, `claudeTerminal.js`, `ai/models.js` fixen
- [ ] LLM Stream Cleanup: Inactivity Timer in finally-Block verschieben
- [ ] Ollama HTTP Agent Destroy bei Shutdown sicherstellen

**Dateien**:

- `apps/dashboard-backend/src/routes/llm.js` Zeilen 28-150
- `apps/dashboard-backend/src/routes/external/claudeTerminal.js` Zeilen 150-397
- `apps/dashboard-backend/src/routes/ai/models.js` Zeilen 260-515
- `apps/dashboard-backend/src/services/llm/llmJobProcessor.js` Zeilen 528-551, 858-860

---

## PHASE 1: STABILITAET (Wochen 3-4, ~2 Wochen)

### 1.1 Self-Healing Haerten

**Aufwand**: 3-4 Tage

- [ ] Self-Healing Agent Self-Recovery: Externer Watchdog via systemd Service
- [ ] Tailscale VPN Auto-Recovery: `tailscale up` bei Verbindungsverlust
- [ ] TLS Certificate Auto-Renewal (Self-Signed 10-Jahres-Cert oder Let's Encrypt)
- [ ] NVMe Wear Monitoring via `smartctl`/`nvme-cli` (Alert bei Spare < 10%)
- [ ] System Clock Monitoring via chrony/NTP
- [ ] Disk Cleanup mit Verifikation (freien Speicher nach jeder Aktion pruefen)

### 1.2 Health Check Timings synchronisieren

**Aufwand**: 1 Tag

- [ ] Embedding Service: `start_period` von 600s auf 300s reduzieren
- [ ] LLM Service: Health Check mit `OLLAMA_STARTUP_TIMEOUT` (120s) synchronisieren
- [ ] Document Indexer: `start_period` auf 630s erhoehen (abhaengig von Embedding)
- [ ] Docker Proxy: Rate Limiting implementieren

**Dateien**: `compose/compose.ai.yaml` Zeilen 91-97, 146-152, 213-218

### 1.3 Pagination & Input Validation

**Aufwand**: 1-2 Tage

- [ ] MAX_LIMIT (500) auf allen paginierten Endpoints erzwingen
- [ ] `documents.js`, `datentabellen/rows.js` und andere: Limit/Offset validieren
- [ ] SQL Identifier Whitelist gegen DB-gespeicherte Slugs pruefen
- [ ] Update-Package Format-Validierung vor dem Schreiben auf Disk

**Dateien**: Diverse Route-Handler

### 1.4 Frontend Memory Leaks fixen

**Aufwand**: 1-2 Tage

- [ ] `ModelDashboard.tsx`: AbortController Cleanup im useEffect Return
- [ ] `UpdatePage.tsx`: CSRF Token Check vor Upload + Polling-Race-Condition fixen
- [ ] `ChatView.tsx`: Background State Leak bei Navigation verhindern (isMountedRef)
- [ ] `ChatMessage.tsx`: Array-Equality in memo fixen (images Vergleich)
- [ ] `BotSetupWizard.tsx`: Retry-Limit fuer Chat-Verification (max 3)

### 1.5 WAL Archiving aktivieren

**Aufwand**: 0.5 Tage

- [ ] `archive_mode = on` in postgresql.conf
- [ ] `archive_command` setzen fuer `/backups/wal/`
- [ ] WAL Retention Policy konfigurieren (nicht unbegrenzt wachsen lassen)

### 1.6 Multer Upgrade

**Aufwand**: 0.5 Tage

- [ ] Multer von 1.4.5-lts.1 auf ^1.5.0 upgraden (CVE-2022-24999)
- [ ] File Upload Tests ausfuehren

---

## PHASE 2: ZUVERLAESSIGKEIT (Wochen 5-8, ~4 Wochen)

### 2.1 RAG Pipeline Hardening

**Aufwand**: 5-7 Tage

- [ ] Query Embedding Failure: Graceful Fallback mit 503 (statt 500)
- [ ] Reranking als Pre-Flight Step (nicht concurrent mit LLM Response)
- [ ] Context Window Overflow Detection (400 wenn Context > num_ctx)
- [ ] Hybrid Search: User informieren wenn BM25 uebersprungen wird
- [ ] Graph Enrichment: Async ausfuehren, Partial Results erlauben
- [ ] Qdrant Search Timeout mit Degraded-Mode Fallback (BM25-only)
- [ ] Space Routing Cache Invalidierung bei Space-Create/Update
- [ ] Reranker beim Service-Start vorladen (nicht Lazy-Loading ohne Timeout)
- [ ] Per-Batch Error Recovery beim Document Indexing (nicht ganz abbrechen)
- [ ] Qdrant Upsert: Atomare Transaktions-Semantik (alle Chunks oder keine)

### 2.2 Document Indexer Robustheit

**Aufwand**: 3-4 Tage

- [ ] PDF Streaming Parser (Seite-fuer-Seite statt ganzes File in Memory)
- [ ] Memory Check vor Parse-Start (verfuegbaren RAM pruefen)
- [ ] Entity Extraction als Async Background Task (nicht blockierend)
- [ ] Adaptive Embedding Timeout: `timeout = 5 + (batch_size * 2)` Sekunden
- [ ] Sparse Vector Caching pro Parent Chunk
- [ ] Document Retention Policy implementieren
- [ ] Optimistic Locking fuer Document-Status-Updates (Version Counter)

### 2.3 Ollama Connection Resilience

**Aufwand**: 2-3 Tage

- [ ] Socket Reset bei Ollama Restart (stale Connections erkennen)
- [ ] Subscriber Memory Leak: Aggressives 5-Minuten-TTL + Metrics
- [ ] Model Download Stall Timeout auf 30+ Minuten erhoehen
- [ ] Queue Position "processing" Event senden wenn Job startet
- [ ] Thinking Mode: GPU Memory Budget pro Job, oversized Requests ablehnen

### 2.4 Logging & Monitoring vervollstaendigen

**Aufwand**: 2-3 Tage

- [ ] Logrotate von Cron auf Systemd Timer umstellen
- [ ] Log-Rotation Verifikation (pruefe ob Rotation tatsaechlich lief)
- [ ] Logging Limits reduzieren: 20MB max-size, 5 max-file (statt 50MB/10)
- [ ] tmpfs Gesamtbedarf dokumentieren (~200MB)
- [ ] Per-Container RAM Limits verifizieren und dokumentieren

### 2.5 Security Hardening

**Aufwand**: 3-5 Tage

- [ ] RBAC System implementieren (Admin, Operator, Viewer Rollen)
- [ ] SSRF Protection: URL Whitelist fuer externe Requests
- [ ] SameSite=strict fuer ALLE Environments (nicht nur Production)
- [ ] User Cache: Disabled Users sofort evicten (nicht 60s TTL warten)
- [ ] Audit Log Exclusions: Anomalie-Detection fuer Polling-Endpoints
- [ ] `npm audit` in CI/CD Pipeline integrieren

---

## PHASE 3: TESTING (Wochen 9-12, ~4 Wochen)

### 3.1 Service-Layer Tests schreiben

**Aufwand**: 8-10 Tage (WICHTIGSTE INVESTITION)

**Untested kritische Module — brauchen Tests:**

| Service-Directory                           | Prioritaet | Geschaetzte Tests |
| ------------------------------------------- | ---------- | ----------------- |
| `src/services/rag/ragCore.js`               | P0         | 15-20 Tests       |
| `src/services/llm/llmJobProcessor.js`       | P0         | 15-20 Tests       |
| `src/services/llm/llmQueueService.js`       | P0         | 10-15 Tests       |
| `src/services/documents/documentService.js` | P1         | 10-15 Tests       |
| `src/services/documents/minioService.js`    | P1         | 8-10 Tests        |
| `src/services/documents/qdrantService.js`   | P1         | 8-10 Tests        |
| `src/services/telegram/*` (13 Files)        | P1         | 20-30 Tests       |
| `src/services/context/*`                    | P2         | 8-10 Tests        |
| `src/services/core/*`                       | P2         | 10-15 Tests       |
| `src/services/auth/*`                       | P2         | 5-8 Tests         |

### 3.2 Integration Tests

**Aufwand**: 5-7 Tage

- [ ] Database Integration Tests (echtes PostgreSQL, keine Mocks)
- [ ] RAG Pipeline E2E: Upload → Index → Search → Chat
- [ ] Auth Flow E2E: Login → Token Refresh → Logout
- [ ] Telegram Setup Flow E2E
- [ ] WebSocket Reconnection Tests

### 3.3 Test-Infrastruktur verbessern

**Aufwand**: 2-3 Tage

- [ ] Coverage Threshold von 30% auf 60% erhoehen
- [ ] E2E Tests (Playwright) in CI Pipeline aufnehmen
- [ ] Skipped Tests re-enablen oder dokumentiert entfernen
- [ ] JWT_SECRET Inkonsistenz zwischen jest.setup.js und CI fixen
- [ ] Over-Mocking in `rag.test.js` und `llm.test.js` reduzieren

---

## PHASE 4: DOKUMENTATION (Woche 13, ~1 Woche)

### 4.1 Kritische Doc-Fixes

**Aufwand**: 2-3 Tage

- [ ] `ENVIRONMENT_VARIABLES.md`: SELF_HEALING_PORT 8085→9200 korrigieren
- [ ] `CLAUDE.md`: Migration-Anzahl und naechste Nummer aktualisieren
- [ ] `API_REFERENCE.md`: `/api/yaml-tables/*` → `/api/v1/datentabellen/*`
- [ ] `API_REFERENCE.md`: Fehlende Endpoints dokumentieren (`/gdpr`, `/license`, `/knowledge-graph`, `/v1/external/*`)
- [ ] `DATABASE_SCHEMA.md`: Migrationen 018-070 dokumentieren
- [ ] `.claude/context/base.md`: Default Model `qwen3` → `gemma4` aktualisieren
- [ ] `FRESH_DEPLOY_GUIDE.md`: Gemma 4 als empfohlenes Modell

### 4.2 Ops-Dokumentation

**Aufwand**: 2-3 Tage

- [ ] Restore-Prozedur schreiben und testen
- [ ] Disaster Recovery Guide vervollstaendigen
- [ ] Scaling Guide fuer verschiedene Jetson-Varianten (8GB, 32GB, 64GB, 128GB)
- [ ] Troubleshooting fuer GPU OOM, Disk Full, Service Cascade Failures

---

## PHASE 5: POLISH & LAUNCH-PREP (Wochen 14-16)

### 5.1 Performance-Optimierung

- [ ] Offsite Backup Integration (S3/SFTP)
- [ ] OTA Update Mechanismus (Device pollt zentralen Server)
- [ ] Model LRU Eviction (aelteste unbenutzte Modelle automatisch loeschen)
- [ ] Qdrant Sharding Strategie fuer >50K Dokumente
- [ ] Frontend Bundle Size nach Chunking-Removal ueberpruefen
- [ ] Hardcoded Colors in SpaceModal/CreateTableDialog → CSS Variables

### 5.2 UX Polish

- [ ] ChatMessage: Error-States anzeigen (nicht nur Loading)
- [ ] Datentabellen: Export via Backend-Streaming (nicht 10K Rows in Browser)
- [ ] ChatInputArea: Popup Keyboard-Navigation (role="button" statt div)
- [ ] Dialog/Dropdown/Select: Subtle Borders wiederherstellen (a11y)
- [ ] Error Messages: Einheitlich Deutsch oder Englisch (nicht gemischt)
- [ ] Pagination: Aktuelle Seite anzeigen

---

## Zeitplan-Uebersicht

```
Woche  1-3:  PHASE 0 — Showstopper (BLOCKER vor Auslieferung)
Woche  3-4:  PHASE 1 — Stabilitaet
Woche  5-8:  PHASE 2 — Zuverlaessigkeit
Woche  9-12: PHASE 3 — Testing
Woche   13:  PHASE 4 — Dokumentation
Woche 14-16: PHASE 5 — Polish & Launch
```

**Geschaetzter Gesamtaufwand**: ~16 Wochen (1 Entwickler Vollzeit)
**Minimum fuer ersten Kunden**: Phase 0 + Phase 1 = ~4-5 Wochen

---

## Staerken der Plattform (Was bereits exzellent ist)

Diese Punkte sollen nicht untergehen — die Plattform hat ein starkes Fundament:

- **Parameterized SQL Queries** ueberall — keine SQL Injection moeglich
- **CSRF Protection** mit Double-Submit Cookie Pattern
- **Helmet.js** Security Headers korrekt konfiguriert
- **Docker Secrets** Infrastruktur vorhanden (nur nicht ueberall genutzt)
- **Non-Root Container** mit Capability Dropping
- **Audit Logging** mit Sensitive Field Masking
- **Rate Limiting** auf mehreren Ebenen (App + Traefik)
- **WebSocket** mit Exponential Backoff und HTTP Polling Fallback
- **Token Batching** verhindert Re-Render-Storms beim Chat Streaming
- **Error Boundaries** auf App/Route/Component Level
- **Memory Leak Prevention** (LEAK-002 Annotations im ganzen Code)
- **Self-Healing Engine** mit 4-stufiger Eskalation (A→B→C→D)
- **Backup System** mit Daily/Weekly Retention und WAL-Vorbereitung
- **TLS 1.2+** mit starken Ciphers und HSTS
- **Code Splitting** und Lazy Loading fuer Performance
- **Structured JSON Logging** in allen Python Services

---

## Risiko-Matrix fuer Kundenauslieferung

| Risiko                              | Wahrscheinlichkeit | Impact                            | Mitigation |
| ----------------------------------- | ------------------ | --------------------------------- | ---------- |
| GPU OOM bei Gemma4 + Embeddings     | HOCH               | Plattform haengt                  | Phase 0.2  |
| Kernel Panic ohne Watchdog          | MITTEL             | Geraet tot bis manueller Reset    | Phase 0.1  |
| Verwaiste Dateien in MinIO          | HOCH               | Speicher fuellt sich ueber Monate | Phase 0.4  |
| Backup unbrauchbar (nicht getestet) | MITTEL             | Datenverlust bei Crash            | Phase 0.7  |
| NVMe Ausfall nach 3 Jahren          | MITTEL             | Totalverlust                      | Phase 1.1  |
| Qdrant OOM bei >50K Docs            | MITTEL             | Suche crasht                      | Phase 0.2  |
| Stream-Fehler nach SSE-Start        | HOCH               | Unvollstaendige Antworten         | Phase 0.8  |
| Chat-Message 'cancelled' Status     | NIEDRIG            | DB Constraint Violation           | Phase 0.3  |

---

_Dieser Report wurde automatisch durch 13 parallele Analyse-Agenten erstellt, die insgesamt ~1.100 Dateien analysiert haben._
