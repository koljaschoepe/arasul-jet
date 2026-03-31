# Production Readiness Plan - Arasul Platform

> Ergebnis einer umfassenden Codebase-Analyse (15 parallele Audits) am 30.03.2026.
> Ziel: Erstes Deployment auf Jetson AGX Thor und Auslieferung an Kunden.

---

## Zusammenfassung

| Severity | Anzahl | Status                               |
| -------- | ------ | ------------------------------------ |
| CRITICAL | 38     | Muss vor Deployment behoben werden   |
| HIGH     | 52     | Sollte vor Deployment behoben werden |
| MEDIUM   | 67     | Nächste Iteration                    |
| LOW      | 41     | Backlog                              |

---

## Phase 1: CRITICAL Fixes (Blocker vor Deployment)

### 1.1 Security - Sofort beheben

| #   | Issue                             | Datei(en)                                                                           | Beschreibung                                                                                     |
| --- | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| S1  | Setup: Minimaler Kundenzugang     | `interactive_setup.sh`                                                              | Setup fragt Benutzername + Passwort (min 4 Zeichen) ab, keine Auto-Generierung. Später änderbar. |
| S2  | Bot-Token in Logs                 | `telegramBotService.js:28-43`, `telegramIngressService.js:1376,1390`, `bots.js:364` | Telegram Bot-Tokens werden in Error-Logs via fetch-URLs geleakt                                  |
| S3  | Webhook-Secret nicht timing-safe  | `bots.js:77-85`                                                                     | String-Vergleich statt `crypto.timingSafeEqual()` - Timing-Attack-Vektor                         |
| S4  | MinIO Root-Credentials in Prozess | `routes/documents.js:107-108`                                                       | Root-Credentials im Klartext in process.env, keine STS/temporary Credentials                     |
| S5  | CORS-Check zu permissiv           | `index.js:85-110`                                                                   | `origin.includes('://10.')` matcht auch `https://attacker-10.example.com`                        |
| S6  | Self-Healing Sudoers              | `self-healing-agent/Dockerfile:32-33`                                               | Passwordless sudo für reboot ohne zusätzliche Autorisierung                                      |

**Geschätzter Aufwand: 1-2 Tage**

### 1.2 Bootstrap & Setup - Deployment-Blocker

| #   | Issue                         | Datei(en)                      | Beschreibung                                                                            |
| --- | ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- | ---------------- | --------------------------- | --- | ---------------------------------------- |
| B1  | MinIO-Init nicht geprüft      | `arasul:1345`                  | `init_minio_buckets` Return-Status nicht geprüft - Bootstrap meldet Erfolg trotz Fehler |
| B2  | Service-Startup `             |                                | true`                                                                                   | `arasul:858-860` | `wait_for_healthy minio ... |     | true` verschluckt Fehler bei MinIO-Start |
| B3  | .env nicht idempotent         | `interactive_setup.sh:310-327` | Re-run nach Fehler generiert neue Passwörter, DB-Credentials passen nicht mehr          |
| B4  | DB-Init Race Condition        | `arasul:570-588`               | 60s Timeout für PostgreSQL-Init kann auf Thor zu kurz sein (56 Migrations)              |
| B5  | Docker Compose Inkonsistenz   | `arasul:832-833`               | Systemd-Timer nutzt `/usr/bin/docker compose` statt Plugin-kompatiblen Pfad             |
| B6  | pgcrypto Extension fehlt      | DB-Init                        | `gen_salt()`/`crypt()` aus TROUBLESHOOTING.md funktionieren nicht                       |
| B7  | WAL-Archive Verzeichnis fehlt | `postgresql.conf:15`           | `archive_command` referenziert `/backups/wal/` - nicht gemountet in Docker              |

**Geschätzter Aufwand: 2-3 Tage**

### 1.3 Backend - Kritische Bugs

| #   | Issue                          | Datei(en)                             | Beschreibung                                                                             |
| --- | ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| BE1 | Stream Resource Leak           | `llmJobProcessor.js:313-376`          | HTTP-Stream-Objekte leaken bei Ollama-Verbindungsfehlern                                 |
| BE2 | LLM Queue Race Condition       | `llmQueueService.js:295-296`          | Boolean-Flag `isProcessing` statt atomarer Job-ID-Vergleich - parallele GPU-Jobs möglich |
| BE3 | Promise-Chain Memory Leak      | `llmJobProcessor.js:254-309`          | Flush-Promise-Chain wächst unbegrenzt (~50MB pro 10-min Stream)                          |
| BE4 | Unhandled Rejection in Polling | `telegramIngressService.js:1598-1616` | `setInterval` mit async ohne try-catch - crasht bei DB-Ausfall                           |
| BE5 | Unbounded Map Growth           | `llmQueueService.js:69-72`            | `jobSubscribers` Map wächst unbegrenzt unter Burst-Traffic                               |
| BE6 | Ollama Agent nicht destroyed   | `llmJobProcessor.js:16-21`            | HTTP-Agent mit keepAlive wird bei Shutdown nie geschlossen                               |
| BE7 | SSE Memory Leak                | `sseHelper.js:26-52`                  | Event-Listener werden nach Auslösung nicht entfernt                                      |
| BE8 | Auth Cache FIFO statt TTL      | `auth.js:110-113`                     | Naive FIFO-Eviction kann deaktivierte User im Cache halten                               |

**Geschätzter Aufwand: 3-4 Tage**

### 1.4 Python Services - Kritische Bugs

| #   | Issue                       | Datei(en)                       | Beschreibung                                                     |
| --- | --------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| PY1 | DB-Pool nicht geschlossen   | `graph_refiner.py:57-65`        | `SimpleConnectionPool.closeall()` wird nie aufgerufen            |
| PY2 | Cursor ohne Context Manager | `healing_engine.py:188-215`     | `cursor.close()` nicht in finally-Block - Leak bei Exceptions    |
| PY3 | Hardcoded DB-Password       | `graph_refiner.py:40-46`        | Default-Password `'arasul'` im Code statt secret resolution      |
| PY4 | Model-Name erlaubt Pfade    | `llm-service/api_server.py:199` | Regex erlaubt `/` - Pfadtraversal möglich (`../../system-model`) |

**Geschätzter Aufwand: 1-2 Tage**

### 1.5 Infrastructure - Deployment-Blocker

| #   | Issue                            | Datei(en)               | Beschreibung                                                              |
| --- | -------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| I1  | Fehlende CPU-Limits              | 8 Services in compose   | dashboard-frontend, n8n, metrics-collector, etc. ohne CPU-Limits          |
| I2  | PostgreSQL zu klein konfiguriert | `postgresql.conf:19-35` | `shared_buffers=1GB` bei 32-128GB RAM - massive Unternutzung              |
| I3  | Traefik Healthcheck wget         | `compose.core.yaml:152` | `wget` möglicherweise nicht im Alpine-Image                               |
| I4  | Embedding Start-Period zu kurz   | `compose.ai.yaml:143`   | 300s kann für BGE-M3 auf ARM64 zu knapp sein                              |
| I5  | --destructive CSS-Farbe          | `index.css:134`         | `--destructive: #F0F4F8` ist hellgrau statt rot - Error-States unsichtbar |

**Geschätzter Aufwand: 1 Tag**

### 1.6 Datenbank - Kritische Schema-Issues

| #   | Issue                         | Datei(en)                                 | Beschreibung                                                |
| --- | ----------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| DB1 | Non-idempotentes Insert       | `004_update_schema.sql:174`               | `ON CONFLICT DO NOTHING` ohne Constraint-Spezifikation      |
| DB2 | Destructive DROP ohne Backup  | `032_telegram_multi_bot_schema.sql:21-24` | `DROP TABLE IF EXISTS` löscht Daten bei Re-Run              |
| DB3 | Fehlende GRANTs               | Migration 030, 031, 041                   | Tables ohne `GRANT` für `arasul` User - Permission Denied   |
| DB4 | Orphaned telegram_bot_configs | Migration 032                             | Alte Tabelle nicht gelöscht nach Migration zu telegram_bots |

**Geschätzter Aufwand: 1-2 Tage**

---

## Phase 2: HIGH Fixes (Sollte vor Deployment)

### 2.1 Backend Robustheit

| #    | Issue                              | Datei(en)                        |
| ---- | ---------------------------------- | -------------------------------- |
| BH1  | Compaction-Log Silent Failure      | `compactionService.js:98-116`    |
| BH2  | Container Inspect Race             | `containerService.js:134-152`    |
| BH3  | Model Context Cache LRU fehlt      | `modelContextService.js:117-122` |
| BH4  | Model Download ohne Transaction    | `modelService.js:62-82`          |
| BH5  | Stall-Check Interval nicht cleared | `modelService.js:100-111`        |
| BH6  | API Key Cache unbounded            | `apiKeyAuth.js:14-15`            |
| BH7  | Rate Limiter Map Iteration Race    | `rateLimit.js:132-151`           |
| BH8  | Audit Log Fire-and-Forget          | `audit.js:192-195`               |
| BH9  | JWT Token Cache Race               | `jwt.js:91-158`                  |
| BH10 | CSRF Rotation nicht atomar         | `csrf.js:103-106`                |
| BH11 | Error Handler leakt Interna        | `errorHandler.js:102-107`        |

**Geschätzter Aufwand: 3-4 Tage**

### 2.2 Frontend Qualität

| #   | Issue                          | Datei(en)                                            |
| --- | ------------------------------ | ---------------------------------------------------- |
| FH1 | Extensive `any` Types          | ChatView, ChatMessage, DocumentManager, ChatContext  |
| FH2 | Memory Leaks in Callbacks      | ChatContext messageCallbacksRef, abortControllersRef |
| FH3 | Token Batching Race Condition  | ChatContext:813                                      |
| FH4 | Missing Event Listener Cleanup | ChatInputArea:77-79                                  |
| FH5 | Direct fetch() statt useApi()  | ChatContext:636, DownloadContext:103,145,230         |
| FH6 | Missing useEffect Dependency   | ChatInputArea:66 (setSelectedModel)                  |
| FH7 | ChatContext Monolith (940 LOC) | ChatContext.tsx - sollte gesplittet werden           |
| FH8 | Reconnect Timeout zu kurz      | ChatContext:498 - 90s statt 300s für Model-Loading   |

**Geschätzter Aufwand: 3-4 Tage**

### 2.3 Python Services

| #   | Issue                          | Datei(en)                                      |
| --- | ------------------------------ | ---------------------------------------------- |
| PH1 | GPU Memory Leak bei Exception  | `embedding_server.py:224-227`                  |
| PH2 | Embedding Health Check fehlt   | `enhanced_indexer.py` - kein Check vor Nutzung |
| PH3 | Pool nicht bei Shutdown closed | `collector.py:615`                             |
| PH4 | Entity Merge Race Condition    | `graph_refiner.py:270-300`                     |
| PH5 | Model Name Regex erlaubt `/`   | `api_server.py:199`                            |
| PH6 | BM25 Rebuild ohne Pagination   | `api_server.py:567` - lädt alle Chunks in RAM  |

**Geschätzter Aufwand: 2-3 Tage**

### 2.4 Setup & Telegram

| #   | Issue                           | Datei(en)                                                      |
| --- | ------------------------------- | -------------------------------------------------------------- |
| SH1 | Tailscale ohne Offline-Fallback | `setup-tailscale.sh:80`                                        |
| SH2 | Jetson-Detection Fallback-Loop  | `detect-jetson.sh:24-91`                                       |
| SH3 | Hash-Generierung Silent Failure | `interactive_setup.sh:238-267`                                 |
| SH4 | Webhook Secret Log-Order        | `bots.js:67-85` - Content geloggt vor Validierung              |
| SH5 | Telegram API ohne Timeout       | `telegramIngressService.js:218-227` - fetch() ohne AbortSignal |
| SH6 | Bot Deaktivierung incomplete    | `telegramBotService.js:487-502` - Webhook nicht gelöscht       |

**Geschätzter Aufwand: 2-3 Tage**

### 2.5 Dokumentation & Config

| #   | Issue                         | Datei(en)                                          |
| --- | ----------------------------- | -------------------------------------------------- |
| DC1 | 26+ undokumentierte Env-Vars  | ENVIRONMENT_VARIABLES.md                           |
| DC2 | Variable Naming Inkonsistenz  | `LLM_HOST` vs `LLM_SERVICE_HOST` in Docs vs Code   |
| DC3 | DATABASE_SCHEMA.md veraltet   | 15+ Tables nach Migration 030 nicht dokumentiert   |
| DC4 | Nginx fehlt CSP-Header        | `nginx.conf`                                       |
| DC5 | ARCHITECTURE.md Service-Count | Telegram-Bot Service in Docs aber nicht in Compose |

**Geschätzter Aufwand: 2 Tage**

---

## Phase 3: Code Cleanup & Quality (Nächste Iteration)

### 3.1 Dead Code entfernen (~15 min)

| Datei                                           | Grund                                             | Status                       |
| ----------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| `services/telegram/telegramVoiceService.js`     | Toter Shim - re-exportiert nur                    | ERLEDIGT (gelöscht)          |
| `services/telegram/telegramRateLimitService.js` | Toter Shim - re-exportiert nur                    | ERLEDIGT (gelöscht)          |
| `utils/fileLogger.js`                           | Nirgends importiert, Winston wird genutzt         | ERLEDIGT (gelöscht)          |
| `components/ui/shadcn/form.tsx`                 | Nie importiert oder genutzt                       | ERLEDIGT (gelöscht)          |
| `components/ui/shadcn/sonner.tsx`               | Nie importiert oder genutzt                       | ERLEDIGT (gelöscht)          |
| `.gitignore` Update                             | `.env.backup.*` und `*.backup` Pattern hinzufügen | ERLEDIGT (bereits vorhanden) |
| `@hookform/resolvers`                           | Frontend-Dependency entfernen (unused)            |                              |

### 3.2 Dependency Updates

| Package          | Aktuell     | Empfohlen      | Grund                       |
| ---------------- | ----------- | -------------- | --------------------------- |
| axios            | ^1.6.2      | ^1.8.0+        | 2 Jahre veraltet            |
| psycopg2-binary  | 2.9.9       | >=2.9.10       | Bekannte CVEs               |
| asyncio (Python) | 3.4.3       | ENTFERNEN      | Stdlib, unnötige Dependency |
| multer           | 1.4.5-lts.1 | Evaluieren 2.x | Legacy LTS Branch           |

### 3.3 Test-Coverage erhöhen

**Untestete kritische Bereiche:**

- `datentabellen/` (rows, tables, quotes) - 0% Coverage
- `ai/knowledge-graph.js` (535 LOC) - 0% Coverage
- `telegram/bots.js`, `telegram/app.js` - 0% Coverage
- 40+ Frontend-Komponenten ohne Tests
- Coverage-Threshold von 30% auf 60%+ erhöhen

### 3.4 Datenbank-Schema Bereinigung

- Duplicate Indexes konsolidieren (content_hash)
- Orphaned Tables entfernen (telegram_bot_configs)
- Fehlende FK-Indexes hinzufügen (app_configurations.app_id)
- Cleanup-Functions batch-fähig machen (statt vollständiger Table-Lock)
- Timestamp-Trigger vereinheitlichen

---

## Phase 4: Hardening & Optimierung (Post-Launch)

### 4.1 Infrastruktur

- Qdrant Backup-Pipeline einrichten
- Docker Image Digest-Pinning
- PostgreSQL-Config dynamisch basierend auf Hardware
- GPU-Reservierungen für LLM/Embedding Services
- Circuit-Breaker Pattern für externe Services

### 4.2 Monitoring & Observability

- Structured JSON Logging in allen Python Services
- Logger File-Rotation im Backend (aktuell nur Console)
- Request-Correlation-IDs über Service-Grenzen
- npm audit / pip-compile in CI/CD

### 4.3 Frontend-Architektur

- ChatContext in 4 kleinere Contexts aufteilen
- `any` Types durch proper Interfaces ersetzen
- Accessibility (ARIA Labels, Keyboard Navigation)
- Standardisierte Error-Messages

---

## Implementierungsreihenfolge (Empfehlung)

```
Woche 1:  Phase 1.1 (Security) + Phase 1.2 (Bootstrap)
Woche 2:  Phase 1.3 (Backend Bugs) + Phase 1.4 (Python Bugs)
Woche 3:  Phase 1.5 (Infra) + Phase 1.6 (DB Schema) + Phase 3.1 (Cleanup)
Woche 4:  Phase 2.1-2.2 (Backend/Frontend HIGH)
Woche 5:  Phase 2.3-2.5 (Python/Setup/Docs HIGH)
Woche 6:  Phase 3.2-3.4 (Dependencies, Tests, DB Cleanup)
          + Erster Test-Deployment auf Jetson AGX Thor
```

**Gesamtschätzung: ~6 Wochen bei Vollzeit-Fokus**

---

## Quick Wins (Sofort machbar, hoher Impact)

1. **Setup: Minimaler Kundenzugang** - Benutzername + Passwort (min 4 Zeichen) im Setup-Wizard abfragen
2. **`--destructive` CSS-Farbe fixen** in index.css (1 min, UI CRITICAL)
3. **Dead Code entfernen** - 5 Dateien löschen (15 min, Code Quality)
4. **`.gitignore` updaten** für Backup-Dateien (2 min, Hygiene)
5. **Telegram Token Masking** in Logs (30 min, Security CRITICAL)
6. **`|| true` entfernen** bei MinIO wait_for_healthy (1 min, Bootstrap CRITICAL)
7. **pgcrypto Extension** in DB-Init hinzufügen (1 min, DB CRITICAL)
8. **CPU-Limits** für 8 Services hinzufügen (15 min, Infra CRITICAL)
9. **`asyncio` aus requirements.txt** entfernen (1 min, Dependency)
10. **Missing useEffect deps** in ChatInputArea fixen (2 min, Frontend)

---

_Erstellt am 30.03.2026 durch umfassende automatisierte Code-Analyse._
