# Arasul Platform — Refactoring & Hardening Plan

> **📜 Archived — superseded by [ROADMAP.md](ROADMAP.md).**
> Snapshot from 2026-04-19. Absorbed into Phases 2 + 3 of the cleanup
> plan (`.claude/CLEANUP_PLAN.md`). Keep for historical context, but don't
> work from it.

> **Erstellt:** 2026-04-19
> **Basis:** 20-Agenten-Audit über Frontend, Backend, DB, Python-Services, Infra, Security, Tests, Dokumentation, Monorepo-Best-Practices, Edge-AI-Research
> **Ziel:** Kommerzielles Edge-AI-Produkt, das 5 Jahre autonom beim Enterprise-Kunden läuft — ohne Regressionen, mit klarer Architektur für Neuonboarding, voller Testabdeckung kritischer Pfade.
> **Status:** Phase 1 startet.

---

## 1. Executive Scorecard

**Gesamtnote: 6.4 / 10** — solide Basis, aber vor Enterprise-Verkauf müssen kritische Sicherheits-, Stabilitäts- und Strukturthemen gelöst werden.

| Bereich              | Note | Kernbefund                                                                      |
| -------------------- | ---- | ------------------------------------------------------------------------------- |
| Security             | C    | Command- und SQL-Injection in Sandbox, `NOPASSWD:ALL` in zwei Dockerfiles       |
| Backend Architektur  | B    | Gute Patterns (asyncHandler, Errors), aber 5 Services >800 LOC, DAL fehlt       |
| Frontend Architektur | B-   | Moderne Base (React 19, Vite 6, Zustand), aber 3 God-Components >1000 LOC       |
| Datenbank            | B    | 77 Migrationen, sauberes Schema, aber WAL-Archivierung/PITR fehlt               |
| LLM/RAG-Pipeline     | C+   | Aktivierung ruft Ollama evtl. nicht auf, Stream-Heartbeat-Leaks, Cache-Race     |
| Tests                | C    | ~30% Coverage, Python-Services 0 Tests, kein E2E                                |
| Dokumentation        | B+   | Umfangreich, aber Drift gegen Code (z. B. Migrationen-Count), keine Feature-Map |
| Observability        | B-   | Logs/Metrics vorhanden, Alerting fehlt komplett                                 |
| Edge-AI-Lifecycle    | C-   | Kein OTA-Update, kein Lizenz-System, keine LUKS-Encryption                      |
| Monorepo-Struktur    | B    | pnpm-Workspaces OK, Turborepo-Caching ungenutzt                                 |

---

## 2. Kritische Befunde (Top 15)

| ID      | Kategorie  | Befund                                                                | Datei                                                                  | Severity |
| ------- | ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| SEC-01  | Security   | Command Injection über Sandbox-Name in tmux-Wrapper                   | `apps/dashboard-backend/src/services/sandbox/sandboxService.js:49-56`  | CRITICAL |
| SEC-02  | Security   | `NOPASSWD:ALL` in Sandbox- & Claude-Code-Container → Container-Escape | `services/sandbox/Dockerfile:52`, `services/claude-code/Dockerfile:37` | CRITICAL |
| SEC-03  | Security   | SQL-Injection via Template-Literal in Idle-Timeout-Query              | `apps/dashboard-backend/src/services/sandbox/sandboxService.js:651`    | HIGH     |
| RAG-01  | LLM        | Model-Aktivierung ruft Ollama evtl. gar nicht auf (DB-only)           | `apps/dashboard-backend/src/routes/ai/models.js:418-533`               | CRITICAL |
| LLM-01  | LLM        | streamHeartbeat wird in Fehlerpfaden nicht gecleart → Memory-Leak     | `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:610-749`   | HIGH     |
| LLM-02  | LLM        | Model-Cache-Race während paralleler Pull-Requests                     | `services/llm-service/api_server.py:262-267`                           | HIGH     |
| TERM-01 | Backend    | `resizeTerminal` wird ohne `await` aufgerufen → Race in Dimensions    | `apps/dashboard-backend/src/services/sandbox/terminalService.js:186`   | MEDIUM   |
| FE-01   | Frontend   | God-Component `DocumentManager.tsx` (1786 LOC)                        | `apps/dashboard-frontend/src/features/documents/DocumentManager.tsx`   | HIGH     |
| FE-02   | Frontend   | God-Component `App.tsx` (1108 LOC) mit eingebetteter Dashboard-Logik  | `apps/dashboard-frontend/src/App.tsx`                                  | HIGH     |
| FE-03   | Frontend   | God-Component `TelegramBotPage.tsx` (1128 LOC)                        | `apps/dashboard-frontend/src/features/telegram/TelegramBotPage.tsx`    | MEDIUM   |
| FE-04   | Frontend   | Raw `fetch()` statt `useApi()` im Store-Flow                          | `apps/dashboard-frontend/src/features/store/StoreApps.tsx:192`         | MEDIUM   |
| FE-05   | Frontend   | setTimeout-Leak in ActivationContext (kein Cleanup)                   | `apps/dashboard-frontend/src/contexts/ActivationContext.tsx:152`       | MEDIUM   |
| FE-06   | Frontend   | Hardcoded Hex-Farben in Charts (Verstoß gegen CSS-Vars-Regel)         | `apps/dashboard-frontend/src/App.tsx:1065, 1081`                       | LOW      |
| OPS-01  | Operations | Kein Alerting (Prometheus+Alertmanager fehlen)                        | —                                                                      | HIGH     |
| OPS-02  | Operations | Kein OTA-Update-Mechanismus, kein A/B-Partition-Flow                  | —                                                                      | HIGH     |

---

## 3. Phasenplan

**Solo-Pfad:** 10 Wochen / ≈350 Story-Points.
**Team-Pfad (3 Devs):** 26 Wochen / ≈770 Story-Points inkl. Edge-AI-Lifecycle.

| Phase | Thema                               | SP  | Wochen (Solo) |
| ----- | ----------------------------------- | --- | ------------- |
| 1     | Critical Fixes (Security/LLM/Bugs)  | 45  | 1.5           |
| 2     | Architektur-Refactoring             | 80  | 2.5           |
| 3     | Struktur & Dokumentation            | 35  | 1.0           |
| 4     | API- & Frontend-Konsistenz          | 55  | 1.5           |
| 5     | Test-Coverage 30% → 65%             | 55  | 1.5           |
| 6     | 5-Jahres-Autonomie (Ops-Hardening)  | 45  | 1.0           |
| 7     | Edge-AI-Lifecycle (OTA/Lizenz/LUKS) | 35  | 1.0           |

---

## Phase 1 — Critical Fixes (45 SP, ~1.5 Wochen solo)

### 1.1 Security-Härtung (15 SP)

| Task   | Beschreibung                                                                                | Datei                                                                  | SP  |
| ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --- |
| SEC-01 | Sandbox-Name in Allowlist (`/^[a-z0-9_-]{1,64}$/`) validieren, tmux-Wrapper parametrisieren | `apps/dashboard-backend/src/services/sandbox/sandboxService.js:49-56`  | 5   |
| SEC-02 | `NOPASSWD:ALL` entfernen, nur ein Whitelist-Set (`apt-get`, `nvidia-smi`) erlauben          | `services/sandbox/Dockerfile:52`, `services/claude-code/Dockerfile:37` | 5   |
| SEC-03 | Idle-Timeout-Query parametrisieren (`$1` statt Template-Literal)                            | `apps/dashboard-backend/src/services/sandbox/sandboxService.js:651`    | 3   |
| SEC-04 | `npm audit` und `pip-audit` im CI als Blocker bei HIGH/CRITICAL                             | `.github/workflows/*` bzw. `scripts/test/run-tests.sh`                 | 2   |

**Definition of Done:**

- Reproduktions-Test für SEC-01 (Payload `"; rm -rf /"`) schlägt vor Fix fehl, nach Fix nicht mehr.
- `docker exec sandbox-<id> sudo -n ls` liefert nach SEC-02 "a password is required".
- SEC-03: Prepared-Statement-Test via `pg_stat_statements` (Query-Hash stabil).

### 1.2 LLM/RAG-Fixes (15 SP)

| Task   | Beschreibung                                                                                          | Datei                                                                | SP  |
| ------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --- |
| RAG-01 | Aktivierung ruft Ollama `/api/pull` + `/api/show` und schreibt dann DB; Integrationstest              | `apps/dashboard-backend/src/routes/ai/models.js:418-533`             | 6   |
| LLM-01 | `streamHeartbeat` mit `try/finally` und 120 s Request-Timeout, Heartbeat-Interval in `finally` clearn | `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:610-749` | 5   |
| LLM-02 | Mutex/Lock für Model-Pull (asyncio.Lock pro Model-ID)                                                 | `services/llm-service/api_server.py:262-267`                         | 4   |

**Definition of Done:**

- Integrationstest "Aktivierung → `/api/tags`": Model ist listbar.
- Lasttest: 50 parallele Streams → keine wachsenden `setInterval`-Referenzen in `process.getActiveResourcesInfo()`.
- 10 parallele Pulls derselben Model-ID → nur 1 Disk-Write.

### 1.3 Backend-Bugs (5 SP)

| Task    | Beschreibung                                  | Datei                                                                | SP  |
| ------- | --------------------------------------------- | -------------------------------------------------------------------- | --- |
| TERM-01 | `await` für `resizeTerminal`                  | `apps/dashboard-backend/src/services/sandbox/terminalService.js:186` | 2   |
| LOG-01  | Loki-Retention 50m → 20m, Dedup-Policy setzen | `config/loki/loki-config.yaml`                                       | 3   |

### 1.4 Frontend-Critical (10 SP)

| Task  | Beschreibung                                                                            | Datei                                                            | SP  |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --- |
| FE-04 | `useApi()` statt `fetch()` in Store-Flow                                                | `apps/dashboard-frontend/src/features/store/StoreApps.tsx:192`   | 2   |
| FE-05 | ActivationContext: `useEffect`-Cleanup mit `clearTimeout`                               | `apps/dashboard-frontend/src/contexts/ActivationContext.tsx:152` | 3   |
| FE-06 | Chart-Farben nach `src/styles/tokens.css` als `--chart-1..5`, Recharts via `var(--...)` | `apps/dashboard-frontend/src/App.tsx:1065, 1081`                 | 2   |
| FE-07 | CLAUDE.md-Drift: Migrations-Count korrigieren (75 → 77), Next-Migration aktualisieren   | `CLAUDE.md:31`                                                   | 1   |
| FE-08 | ESLint-Regel `no-restricted-globals: fetch` aktivieren                                  | `apps/dashboard-frontend/eslint.config.js`                       | 2   |

**Phase-1-DoD:**

- Alle Tests grün (`./scripts/test/run-tests.sh --all`).
- Smoke-Test Sandbox: Create → Connect → Exit ohne Fehler.
- Smoke-Test Chat: Stream > 2 Min bleibt stabil, Connection schließt sauber.

---

## Phase 2 — Architektur-Refactoring (80 SP, ~2.5 Wochen)

### 2.1 Backend: Data-Access-Layer & Service-Splits (30 SP)

| Task   | Beschreibung                                                           | SP  |
| ------ | ---------------------------------------------------------------------- | --- |
| DAL-01 | `src/db/repositories/` mit je Tabelle (User, Sandbox, Model, Job, App) | 10  |
| SVC-01 | `sandboxService.js` (984 LOC) → lifecycle / runtime / metrics Module   | 8   |
| SVC-02 | `llmJobProcessor.js` (850 LOC) → queue / stream / telemetry splitten   | 7   |
| SVC-03 | `installService.js` (720 LOC) → installer / registry / hooks splitten  | 5   |

### 2.2 Frontend: God-Component-Splits (35 SP)

| Task  | Beschreibung                                                                    | SP  |
| ----- | ------------------------------------------------------------------------------- | --- |
| FE-10 | `DocumentManager.tsx` → List / Upload / Preview / Search als eigene Komponenten | 13  |
| FE-11 | `App.tsx`-Dashboard-Widgets in `features/dashboard/` extrahieren                | 10  |
| FE-12 | `TelegramBotPage.tsx` in Setup / Messages / Chat / Settings aufsplitten         | 8   |
| FE-13 | Shared-UI-Layer `src/components/ui/charts/` für Recharts-Wrapper mit Tokens     | 4   |

### 2.3 Telegram-Entkopplung (15 SP)

| Task  | Beschreibung                                                                 | SP  |
| ----- | ---------------------------------------------------------------------------- | --- |
| TG-01 | Telegram-Service als eigener Container, Backend-Client kommuniziert via HTTP | 10  |
| TG-02 | Reconnect-Logik + exponential backoff                                        | 3   |
| TG-03 | Observability: Lag-Metrik, Error-Counter in Prometheus                       | 2   |

---

## Phase 3 — Struktur & Dokumentation (35 SP, ~1 Woche)

| Task   | Beschreibung                                                                                 | SP  |
| ------ | -------------------------------------------------------------------------------------------- | --- |
| DOC-01 | Root-Cleanup: `PRODUCTION_HARDENING_PLAN.md` → `docs/`, obsolete Artefakte in `docs/archive` | 3   |
| DOC-02 | `docs/FEATURES.md`: Map User-Feature → Frontend-Pfad → Backend-Route → DB-Tabelle            | 10  |
| DOC-03 | ARCHITECTURE.md: aktueller Service-Graph (auto-generiert aus docker-compose)                 | 5   |
| DOC-04 | README pro App (`apps/dashboard-backend/README.md`, `apps/dashboard-frontend/README.md`)     | 8   |
| DOC-05 | Onboarding-Guide: "Neuer Dev in 30 min produktiv" — Setup, erste Task, PR-Flow               | 5   |
| DOC-06 | DATABASE_SCHEMA.md aus `information_schema` regenerieren (CI-Job)                            | 4   |

---

## Phase 4 — API- & Frontend-Konsistenz (55 SP, ~1.5 Wochen)

### 4.1 Zod-Validation End-to-End (20 SP)

| Task   | Beschreibung                                                                | SP  |
| ------ | --------------------------------------------------------------------------- | --- |
| API-01 | `packages/shared-schemas` mit Zod-Schemas (Request + Response pro Endpoint) | 8   |
| API-02 | Backend-Middleware `validateBody(schema)` + Generator für `openapi.json`    | 7   |
| API-03 | Frontend-Types aus Zod inferieren (`z.infer<typeof Schema>`)                | 5   |

### 4.2 API-Versionierung & Discovery (15 SP)

| Task   | Beschreibung                                                                    | SP  |
| ------ | ------------------------------------------------------------------------------- | --- |
| API-04 | `/api/v1/*` Prefix, `/api/*` als Alias mit `Deprecation`-Header                 | 6   |
| API-05 | `/api/v1/_meta` mit Endpoint-Discovery (openapi.json)                           | 4   |
| API-06 | Error-Envelope standardisieren: `{ error: { code, message, details } }` überall | 5   |

### 4.3 Frontend-Form-Library & Query-State (20 SP)

| Task  | Beschreibung                                                                                           | SP  |
| ----- | ------------------------------------------------------------------------------------------------------ | --- |
| FE-20 | React-Hook-Form + Zod-Resolver in allen Settings/Form-Screens                                          | 10  |
| FE-21 | TanStack Query für Server-State (Model-List, App-Store, System-Metrics) statt Zustand für Remote-Daten | 8   |
| FE-22 | Skeleton-Loader und Error-Boundaries konsistent pro Feature                                            | 2   |

---

## Phase 5 — Test-Coverage 30% → 65% (55 SP, ~1.5 Wochen)

| Task    | Beschreibung                                                             | SP  |
| ------- | ------------------------------------------------------------------------ | --- |
| TEST-01 | Python-Services (llm, embedding, indexer) pytest-Setup + Basistests      | 15  |
| TEST-02 | Backend-Integrationstests für `/api/sandbox`, `/api/models`, `/api/jobs` | 15  |
| TEST-03 | Playwright E2E: Login → Chat → RAG-Upload → Sandbox-Create               | 15  |
| TEST-04 | CI-Gate: Coverage < 65% blockt PR; Coverage-Badge in README              | 5   |
| TEST-05 | Flaky-Tests markieren und tracken (`test.skip.each` + Issue)             | 5   |

---

## Phase 6 — 5-Jahres-Autonomie (45 SP, ~1 Woche)

| Task   | Beschreibung                                                                         | SP  |
| ------ | ------------------------------------------------------------------------------------ | --- |
| OPS-01 | Prometheus + Alertmanager deployen, Regeln: Disk>85%, GPU-OOM, LLM-Latency p99 > 30s | 10  |
| OPS-03 | Backup-Verification-Job (wöchentlich Restore in Staging-DB, Diff zählen)             | 10  |
| OPS-04 | WAL-Archivierung + PITR (`pg_receivewal` → MinIO)                                    | 8   |
| OPS-05 | Victoria Metrics als Long-Term-Storage (5 Jahre Retention)                           | 7   |
| OPS-06 | Hardware-Watchdog (tegra_wdt) aktivieren, Boot-Loop-Counter                          | 5   |
| OPS-07 | NVMe-SMART-Monitoring, Warnung bei Reallocated-Sectors > 0                           | 5   |

---

## Phase 7 — Edge-AI-Lifecycle (35 SP, ~1 Woche)

| Task  | Beschreibung                                                            | SP  |
| ----- | ----------------------------------------------------------------------- | --- |
| LC-01 | OTA-Update via Mender oder eigener Delta-Update-Flow (A/B-Partitionen)  | 15  |
| LC-02 | Lizenz-System (JWT mit Hardware-Bind an MAC/TPM, Offline-Grace 30 Tage) | 10  |
| LC-03 | LUKS-Encryption für Daten-Partition, Key-Sealing via TPM 2.0            | 5   |
| LC-04 | Factory-Reset-Flow: LED-Taster 10s gedrückt → Reset zu Werkszustand     | 5   |

---

## 4. Definition of Done (global)

- [ ] Alle Tests grün (`./scripts/test/run-tests.sh --all`)
- [ ] Keine HIGH/CRITICAL Befunde aus `npm audit` / `pip-audit`
- [ ] Coverage ≥ 65% Backend, ≥ 55% Frontend
- [ ] Doku-Drift-CI grün (Migrations-Count, API-Count stimmen)
- [ ] Smoke-Test-Matrix (Chat / RAG / Sandbox / Store) in Staging durchgelaufen
- [ ] PR hat Reviewer + Green-CI + manuelles Test-Protokoll

---

## 5. Reihenfolge & Dependencies

```
Phase 1 (Critical)   → Phase 2 (Architektur)   → Phase 5 (Tests)
                    ↘ Phase 3 (Doku)           ↗
                     Phase 4 (API-Konsistenz) ↗
Phase 6 (Ops) parallel ab Phase 2
Phase 7 (Lifecycle) erst nach Phase 1 + 6
```

---

## 6. Nächster Schritt

**Start: Phase 1.1 — SEC-01 Command-Injection in Sandbox-tmux-Wrapper.**

Schritte:

1. Reproduktions-Test schreiben (Payload `"; whoami; #`).
2. Validator + Parametrisierung einbauen.
3. Test grün.
4. Commit `fix(sec): validate sandbox names to prevent tmux command injection (SEC-01)`.
5. Danach SEC-02, SEC-03 in eigenen Commits.
