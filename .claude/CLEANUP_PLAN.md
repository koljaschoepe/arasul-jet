# Arasul Platform — Cleanup & Minimalismus-Plan

**Erstellt:** 2026-04-22 aus 16 parallelen Sub-Agent-Analysen
**Quell-Reports:** `.claude/analysis-v2/01-*.md` bis `16-*.md`
**Fokus (explizit):** Toter Code, Struktur, Onboarding-Tauglichkeit, Minimalismus
**Abgrenzung:** Dieser Plan ergänzt `.claude/ANALYSIS_PLAN.md` (funktionaler Fokus) um Cleanliness.
**Ausführungsprinzip:** Jede Phase ist in frischem Kontext-Window ausführbar (self-contained).

---

## TL;DR — Was ist der Zustand?

**Gesamtnote:** B+. Solide Architektur, disziplinierte Patterns (asyncHandler, TypeScript, useApi), gute Test-Infrastruktur. Aber: ~20 tote Objekte quer durch den Stack, drei aktive Laufzeitfehler, Onboarding-Friktion durch Sprach-Mix und stale Docs.

**Das Wichtigste in einem Satz:** **4 Critical Items sind CI/Rollout-Blocker** (BUG-001 self-healing crash, husky hooks broken, 4 failing RAG tests, SQL-Injection SEC-001 in `n8nLogger.js`) — alle in wenigen Stunden fixbar.

**Cleanup-Umfang gesamt:** ~6–8 Arbeitstage für High/Medium, +5 Tage für Test-Coverage-Lücken.

---

## Scorecard pro Domain

| Domain                            | Grade | Hauptproblem                                                                                           | Report                      |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| Backend Routes                    | B     | 2 dead endpoints, 7 God-Files (6.4k LOC), envelope inconsistency                                       | `01-backend-routes.md`      |
| Backend Services                  | B-    | Circuit breakers wired aber nie benutzt, 4 shim files, MinIO quota silent-fail                         | `02-backend-services.md`    |
| Backend Infra (Middleware/Errors) | B     | 4 POSTs ohne validateBody, 6 ungenutzte Error-Klassen, 14× direktes `process.env`                      | `03-backend-infra.md`       |
| Frontend Components               | C+    | 5 raw `fetch()` (CLAUDE.md-Verstoß), 7 God-Components (>400 LOC), ConfirmIconButton unused             | `04-frontend-components.md` |
| Frontend State                    | B+    | `usePagination` tot, useTheme-Subscription leak, useApi-AuthContext-Kopplung                           | `05-frontend-state.md`      |
| Frontend Lib/Types                | B     | TelegramBot-Typ 2× (camelCase/snake_case), 5× formatDate-Duplikate                                     | `06-frontend-lib.md`        |
| Python Services                   | A-    | 7× `_resolve_secrets()` duplicate, HTTP retry 3× reimplementiert                                       | `07-python-services.md`     |
| Docker/Compose/Traefik            | B-    | Toter claude-code Traefik-Route, Telegram-Secrets orphan, DOCKER_NETWORK hardcoded                     | `08-infra.md`               |
| Scripts/CLI                       | C+    | Husky-Hooks zeigen auf nicht-existente Scripts, 13 orphan scripts, 19/62 ohne shared logging           | `09-scripts.md`             |
| Database                          | A-    | 16 tote Tabellen (~8% bloat), `telegram_rate_limits` 3× konfliktierend definiert                       | `10-database.md`            |
| Tests                             | C     | 4 failing, 89% Frontend untested, 86× redundante 401-Tests, `jwt.js`/`tokenCrypto.js` untested         | `11-tests.md`               |
| Docs                              | C     | Migration-Nummer falsch an 6 Stellen (059 statt 081), broken Telegram-link, SQL-Injection SEC-001 open | `12-docs.md`                |
| Dependencies                      | A-    | `swagger-ui-express` unused, Python-Services ohne Version-Pin                                          | `13-dependencies.md`        |
| Live Bugs                         | B-    | 3 active runtime bugs, 3 latent, 3 systemische Anti-Patterns                                           | `14-current-bugs.md`        |
| Onboarding                        | C+    | Sprach-Mix ohne Policy, kein local dev-server, CLAUDE.md AI-facing vs human-facing                     | `15-onboarding.md`          |
| Ops/Observability                 | B     | Restore-Drill nie CI-validiert, Alert-Delivery ungetestet, Health-Endpoints doppelt                    | `16-ops-services.md`        |

---

## Phase 0 — CRITICAL FIXES (heute, ~2h)

Alles in dieser Phase sind Blocker: CI bricht, Workflow scheitert, Sicherheit ist offen, Live-System crasht in Schleife. **Nicht parallelisieren — der Reihe nach.**

### 0.1 BUG-001: Self-Healing DB Type Error fixen (10 min)

- **Datei:** `services/self-healing-agent/db.py:62–76`
- **Fix:** `execute_query()` muss `cursor.fetchall()` verwenden wenn `fetch=True`, aktuell `fetchone()`. Caller `healing_engine.py:439–444` erwartet iterierbare Liste.
- **Validate:** Logs 10 min beobachten — `'int' object is not subscriptable` darf nicht mehr erscheinen.

### 0.2 Husky-Hooks reparieren (5 min)

- `.husky/pre-commit:35` → `./scripts/run-typecheck.sh` → ändern zu `./scripts/test/run-typecheck.sh`
- `.husky/pre-push:15` → `./scripts/run-tests.sh` → ändern zu `./scripts/test/run-tests.sh`
- **Validate:** `git commit --allow-empty -m test` darf nicht silent fehlschlagen.

### 0.3 SEC-001 SQL-Injection in n8nLogger fixen (30 min)

- **Datei:** `apps/dashboard-backend/src/services/n8n/n8nLogger.js` (ca. Zeilen 152, 239)
- **Fix:** Alle Query-Strings parametrisieren (`$1, $2, ...` statt Interpolation).
- Markierung in `BUGS_AND_FIXES.md` auf "BEHOBEN" setzen.

### 0.4 4 failing RAG Tests fixen (30–60 min)

- **Datei:** `apps/dashboard-backend/tests/unit/rag.test.js` → `POST /api/rag/query` describe block
- **Fix:** `mockResolvedValueOnce()` pro test statt geteilter Mock-Queue.
- Danach: `./scripts/test/run-tests.sh --backend` grün.

### 0.5 BUG-002: Document-Indexer Retry-Loop fixen (15 min)

- **Datei:** `services/document-indexer/enhanced_indexer.py:296`
- **Fix:** `retry_count += 1` statt Reset auf 0; wenn `> 3`, Status `failed_permanent` setzen.
- **Validate:** Problematische PNG darf nicht mehr in Loop-Logs auftauchen.

### 0.6 BUG-003: Telegram-Polling ohne Token stoppen (20 min)

- **Datei:** `apps/dashboard-backend/src/services/telegram/telegramIngressService.js:536`
- **Fix:** In `startPolling()` vor dem Loop `if (!token || !chatId) { logger.warn(...); return; }`.
- Bei Aktivierung via Route: 400 mit klarer Fehlermeldung.

**Phase-0-Commit-Ziel:** `fix: Phase-0 cleanup — critical runtime bugs, husky hooks, SQL-injection, failing tests`

---

## Phase 1 — KILL LIST (Tag 1, ~3h)

Alles in dieser Phase ist **unstrittig tot** — keine Refactoring-Entscheidungen, nur Löschen.

### 1.1 Migration 082: 16 tote Tabellen droppen

```sql
-- services/postgres/init/082_drop_dead_tables.sql
DROP TABLE IF EXISTS api_key_usage, component_updates, datentabellen_config,
  document_chunks, document_processing_queue, document_similarities,
  metrics_infra, model_performance_metrics, notification_rate_limits,
  service_restarts, system_snapshots,
  update_backups, update_files, update_rollbacks, update_state_snapshots;
```

- Danach `run_all_cleanups()` in Migration 081 aufräumen (Migration 083 oder Edit von 081, falls noch nicht produktiv).
- `docs/DATABASE_SCHEMA.md` regenerieren via `scripts/docs/generate-db-schema.sh`.

### 1.2 Dead Traefik-Route entfernen

- `config/traefik/routes.yml:115–123` — `claude-terminal-service` → Route löschen.
- Entweder vollständig entfernen ODER `claude-code` Service definieren (User-Entscheidung). Default: LÖSCHEN.

### 1.3 Telegram-Orphan-Konfiguration aufräumen

- `compose/compose.secrets.yaml:18–21` — orphan Telegram-Secret-Declarations löschen.
- `compose/compose.secrets.yaml:45–46` — Telegram-Secret-Mounts auf dashboard-backend löschen.
- `config/profiles/jetson.env:14` — `RAM_LIMIT_TELEGRAM=256M` löschen.
- `apps/dashboard-backend/src/utils/resolveSecrets.js` — tote telegram-Secret-Code entfernen.

### 1.4 Backend Dead Code

- `apps/dashboard-backend/src/routes/system/system.js:30–38` — `GET /api/system/heartbeat` (never called)
- `apps/dashboard-backend/src/routes/system/system.js:381–418` — `POST /api/system/reload-config` (never called + asyncHandler-Verstoß)
- `apps/dashboard-backend/src/services/telegram/telegramLLMService.js` — 2 LOC shim
- `apps/dashboard-backend/src/services/telegram/telegramPollingManager.js` — 2 LOC shim
- `apps/dashboard-backend/src/services/telegram/telegramWebSocketService.js` — 3 LOC shim
- `apps/dashboard-backend/src/services/telegram/telegramWebhookService.js` — 2 LOC shim
- 6 ungenutzte Error-Klassen in `utils/errors.js`: `UnauthorizedError`, `ConflictError`, `RateLimitError`, `ServiceUnavailableError` (+ 2 weitere) — nach `grep` entfernen wenn bestätigt.
- 3 orphan rate limiters: `webhookLimiter`, `generalAuthLimiter`, `uploadLimiter` (defined, nie angewandt).

### 1.5 Frontend Dead Code

- `apps/dashboard-frontend/src/components/ui/ConfirmIconButton.tsx` + dazugehöriger Test — nie importiert außerhalb des Tests.
- `apps/dashboard-frontend/src/hooks/usePagination.ts` — nie importiert (State lebt inline in `useTableData`).
- `apps/dashboard-frontend/src/utils/token.ts:getTokenExpiration()` — unused export.
- `apps/dashboard-frontend/src/types/index.ts`: `LoadedModelInfo` — nie direkt importiert.
- Lokale `OllamaModel` in `features/telegram/BotSetupWizard.tsx` — duplikat des globalen Typs.
- `features/projects/ProjectModal.tsx:14` — `DEFAULT_COLOR = '#45ADFF'` (hardcoded hex).
- `components/ui/Modal.tsx:31–32` — `initialFocusRef`, `returnFocusRef` (deklariert, nie genutzt).

### 1.6 Infra Klein-Cleanup

- `compose/compose.monitoring.yaml:230` — unused volume `arasul-logs` löschen.
- `docs/archive/UPDATE_PACKAGE_TOOL.md`, `docs/archive/UPDATE_PACKAGE_TEST_REPORT.md` — obsolete one-time docs löschen.
- `.gitignore`: `config/base/` over-broad → `!config/base/base.env` Ausnahme hinzufügen.

### 1.7 Dependencies

- `swagger-ui-express` aus `apps/dashboard-backend/package.json` entfernen (unused).
- Python services: `einops`, `numpy`, `python-docx` aus requirements.txt wo nicht transitiv nötig.

**Phase-1-Commit-Ziel:** `chore: Phase-1 cleanup — drop 16 tables, kill 20+ dead files/routes/configs`

**Validate:** `./scripts/test/run-tests.sh --all`, `docker compose up -d --build` → alle 14 Services healthy.

---

## Phase 2 — BACKEND REFACTOR (Tag 2–3, ~1.5 Tage)

### 2.1 validateBody-Coverage komplettieren

Routen ohne Input-Validation trotz POST + `req.body`:

- `routes/documentImages.js` — POST-Endpoints
- `routes/documentAnalysis.js` — POST-Endpoints
- `routes/admin/backup.js` — POST-Endpoints

Jede bekommt eine Zod-Schema (wie in `03-backend-infra.md` beschrieben) und `validateBody(schema)` als Middleware.

### 2.2 Circuit Breaker aktiv verdrahten

- `utils/retry.js:294–298` registriert Breaker für `qdrant|embedding|minio|ollama`, aber keiner wird je `.execute()`-wrapped.
- Wrapping hinzufügen in:
  - `services/rag/ragCore.js:852–860` (Qdrant-Calls)
  - `services/llm/embeddingClient.js` (Embedding-HTTP)
  - `services/documents/minioService.js` (MinIO-Ops)
  - `services/llm/ollamaClient.js` (Ollama)
- **Warum:** RAG-Kette hat aktuell keinen Schutz gegen Cascade-Fails.

### 2.3 Fix MinIO Quota Silent-Bypass

- `services/documents/minioService.js:137–139` — `checkBucketQuota()` darf nie `null` zurückgeben.
- Bei Fehler: entweder Exception throwen oder konservativ `{allowed: false, reason: 'check_failed'}`.

### 2.4 Promise-Chain → async/await

- `services/context/contextInjectionService.js:172–191` — `.then()`-Kette durch `await Promise.all([...])` ersetzen.

### 2.5 Env-Var-Zentralisierung

- 14 Dateien lesen `process.env.*` direkt. Alle durch `config/env.js` (oder äquivalent) routen.
- Beginnen mit High-Traffic-Routes; Low-Priority iterativ.

### 2.6 Response-Envelope vereinheitlichen

- 50 Routen haben inkonsistente Shapes (`{data, timestamp}` vs `{..., timestamp}` vs `{data: {...}, meta: {...}}`).
- Standard definieren in `utils/response.js`: `{success, data, timestamp, meta?}`.
- **Reihenfolge:** Neue Routen sofort; Alte iterativ + Frontend-Types parallel anpassen.

**Phase-2-Commit-Ziel:** `refactor: Phase-2 backend — validateBody + circuit breakers + env centralization`

---

## Phase 3 — FRONTEND REFACTOR (Tag 4–6, ~2 Tage)

### 3.1 raw `fetch()` → `useApi()` / `useApiStream()`

CLAUDE.md-Verstoß in 5 Dateien:

- `contexts/ChatContext.tsx:575, 850` (SSE-Streaming)
- `contexts/DownloadContext.tsx` (Model download)
- `contexts/ActivationContext.tsx` (Model activation)
- `contexts/AuthContext.tsx` (/auth/me, /auth/logout)
- `hooks/useWebSocketMetrics.ts` (Fallback-fetch)

**Lösung:** Neuen Hook `useApiStream()` extrahieren, der SSE/chunked responses via AbortController wraps. Drei Contexts teilen sich denselben Pattern (siehe `05-frontend-state.md #7`).

### 3.2 ProtectedRoute Wrapper (Security)

- Aktuell: nur App-Level `isAuthenticated`-Check. Token-Expiry zeigt veraltete UI.
- Neu: `<ProtectedRoute>` mit redirect + token-refresh trigger.
- Anwendung auf alle geschützten Routes (Dashboard, Documents, Chat, Settings, Admin).

### 3.3 Hardcoded Colors → CSS-Vars

- `features/projects/ProjectModal.tsx:14` — `DEFAULT_COLOR = '#45ADFF'`
- `components/markdown/MermaidDiagram.tsx` — fallback-hexes
- **Helper:** `utils/themeColors.ts` mit `getCssVar(name, fallback)`.

### 3.4 God-Components aufteilen (inkrementell, über ~1 Woche)

Nach Priorität:

1. `DocumentManager.tsx` (1550 LOC) → `DocumentUploadPanel`, `DocumentFilters`, `RagSpaceManager`, `DocumentGrid`
2. `ChatContext.tsx` (1210 LOC) → `useApiStream` extraktion + `ChatStateProvider` + `ChatSendingMutex`
3. `SetupWizard.tsx` (1289 LOC) → per-Step Components + `useSetupWizardState()` Hook
4. `ChatInputArea.tsx` (847 LOC) → `VisionUploadArea`, `CommandPalette`, `MessageComposer`

### 3.5 Duplicate Utilities konsolidieren

- 5× `formatDate` → eine Quelle in `utils/date.ts`
- 3× `formatFileSize` → eine Quelle
- `TelegramBot`-Typ camelCase vs snake_case: Team-Entscheidung, dann konsistent.

### 3.6 State-Cleanup

- `hooks/useTheme.ts:50–58` — zweiter useEffect braucht `[]` dep array (Subscription leak).
- `contexts/ChatContext.tsx:180–195` — `selectedModelRef` direkt als useRef statt mirror-pattern.
- `useApi` von AuthContext entkoppeln (logout-callback injizieren).

**Phase-3-Commit-Ziel:** `refactor: Phase-3 frontend — useApi enforcement, ProtectedRoute, god-component split (docs)`

---

## Phase 4 — INFRA CLEANUP (Tag 7, ~0.5 Tag)

### 4.1 DOCKER_NETWORK env-ify

- `compose/compose.app.yaml:70` — hardcoded `arasul-platform_arasul-backend` → `${COMPOSE_PROJECT_NAME}_arasul-backend`.

### 4.2 SERVICE_URL localhost fix

- `compose/compose.ai.yaml:115` — `http://localhost:11435` → `http://embedding-service:11435`.

### 4.3 Embedding start_period 600s → 300s

- `compose/compose.ai.yaml:154` — Blockiert First-Deploy 10 min.

### 4.4 Healthcheck-Intervalle standardisieren

- Alle auf 30s vereinheitlichen ODER Policy dokumentieren (z.B. "DB/LB: 10s, AI: 30s").

### 4.5 Python-App-Base-Image

- Drei Services (`document-indexer`, `metrics-collector`, `self-healing-agent`) haben identische Dockerfile-Präambel.
- Shared Base `services/python-app-base/Dockerfile` — copy-requirements, copy `structured_logging`, UID 1000.

### 4.6 n8n Build-Context normalisieren

- `compose/compose.app.yaml:160` — `context: ../services/n8n` → `context: ..` + `dockerfile: services/n8n/Dockerfile`.

**Phase-4-Commit-Ziel:** `chore: Phase-4 infra — compose hygiene, python base image, healthcheck standardization`

---

## Phase 5 — SCRIPTS & CLI (Tag 8, ~0.5 Tag)

### 5.1 arasul CLI setup_secrets() Write-Verify

- Nach jedem Secret-Write: `test -s "$secret_file" || exit 1`.

### 5.2 Logging konsolidieren

- Alle 43 Scripts ohne `scripts/lib/logging.sh` sourcing nachziehen.
- `log(LEVEL, msg)` Wrapper in Lib hinzufügen (backup-scripts nutzen diese Signatur).

### 5.3 Jetson Detection dedupe

- Inline-Checks in `arasul:536–590` entfernen; immer `scripts/setup/detect-jetson.sh` sourcen.

### 5.4 Orphan Scripts auditieren

13 Scripts nicht invoked. Pro Script: **integrieren ODER löschen ODER in `scripts/experimental/`**:

- `scripts/setup/setup-dev-tools.sh` (26 L) → merge in `interactive_setup.sh` oder DELETE
- `scripts/setup/setup_dev.sh` (253 L) → DELETE wenn dupliziert
- `scripts/system/deadman-switch.sh` (160 L) → prüfen ob systemd das nutzt, sonst DELETE
- `scripts/system/docker-watchdog.sh` → gleich
- `scripts/util/{auto-restart-service,setup_logrotate,start-mcp-server,claude-autonomous,telegram-notify}.sh` → DELETE
- `scripts/validate/{validate-permissions,validate_dependencies}.sh` → in `validate_config.sh` mergen
- `scripts/test/setup/*.test.sh` → in CI wiring oder DELETE

### 5.5 Test-Scripts CI-wiring

Mindestens `smoke-test.sh` und `fresh-deploy-test.sh` in `.github/workflows/test.yml` als Nightly-Job verdrahten.

### 5.6 `set -euo pipefail` Enforcement

Pre-commit-Lint-Regel: alle `.sh` müssen `set -euo pipefail` haben (oder dokumentierte Ausnahme).

**Phase-5-Commit-Ziel:** `chore: Phase-5 scripts — CLI hygiene, logging unified, 13 orphan scripts resolved`

---

## Phase 6 — TEST-COVERAGE (Tag 9–12, ~4 Tage)

### 6.1 Auth-Test-Parameterisierung

- Helper `testRequiresAuth(method, path)` in `tests/helpers/auth.js`.
- 86 duplizierte "should return 401 without authentication" Tests durch `testRequiresAuth(...)` ersetzen.

### 6.2 Security-Utility Tests (High Priority)

- `utils/jwt.js` (280 LOC) — unit tests für sign/verify/refresh/expiry
- `utils/tokenCrypto.js` — encrypt/decrypt roundtrip, failure modes
- `utils/fileValidation.js` — path traversal, file-type validation

### 6.3 Top-5 untested Routes

Integration tests (real DB, per Memory-Feedback keine Mocks):

- `routes/telegram/app.js` (907 LOC) — zero-config setup flow
- `routes/chats.js` (707 LOC) — create/list/append
- `routes/datentabellen/tables.js` (852 LOC) — CRUD
- `routes/knowledge-graph.js` (536 LOC) — query/extract
- `routes/documentAnalysis.js` (262 LOC) — upload→analyze flow

### 6.4 Coverage Thresholds anheben

- `jest.config.js`: branches 20→40, functions 30→50, lines 30→70
- Nur anheben **nach** 6.1–6.3, sonst blockiert CI.

### 6.5 Test-Factories

- `tests/factories/{user,document,bot,chat,project}.js` mit `makeUser(overrides)` etc.
- Fixtures in 50+ Test-Files schrittweise auf Factories migrieren.

### 6.6 Frontend-Test-Push

30 neue Component-Tests, priorisiert nach User-Impact:

- ChatInputArea, DocumentManager-Lifecycle, SettingsForm-Validation, auth-flows
- Ziel: 18 → 48 Test-Files bis Ende Phase 6.

**Phase-6-Commit-Ziel:** Mehrere Commits — `test: Phase-6 coverage — auth helper`, `test: jwt/tokenCrypto`, `test: 5 critical routes`, …

---

## Phase 7 — DOCS & ONBOARDING (Tag 13–14, ~2 Tage)

### 7.1 Migration-Number Fix (in 6 Dateien)

Alle auf **082** (oder aktuelles Maximum + 1) updaten:

- `CLAUDE.md:14, 31`
- `.claude/context/migration.md:7`
- `.claude/context/database.md:7`
- `.claude/context/telegram.md:115`
- `.claude/context/base.md:106`

* Pre-commit-Script `scripts/docs/check-migration-number.sh` das bei Commits validiert.

### 7.2 Language Policy

- `docs/LANGUAGE_POLICY.md` anlegen: **EN für Developer-facing, DE für Admin/Customer-facing**.
- Verweis in CLAUDE.md und README.md.

### 7.3 CLAUDE.md als AI-facing markieren

- Oben im File: Banner "⚠️ AI-facing context, see `docs/INDEX.md` for humans".
- Reduziert Verwirrung bei neuen Devs.

### 7.4 Master-Roadmap

- `docs/ROADMAP.md` erstellen, das aktuelle Phase + Status der 5 konkurrierenden Plan-Dokumente enthält.
- Obsolete Pläne mit Banner "⚠️ superseded by docs/ROADMAP.md — archived".

### 7.5 `docs/DEVELOPER_ENVIRONMENT.md`

Day-1 Checkliste: IDE, env setup, docker-compose up, test runs, debugging-workflows, logs checking.

### 7.6 BUGS_AND_FIXES.md splitten

- `BUGS_OPEN.md` (living)
- `BUGS_ARCHIVE/2025.md` + `BUGS_ARCHIVE/2026.md` (resolved, per Jahr)

### 7.7 API_REFERENCE.md cross-check

- Script das alle Routes aus `apps/dashboard-backend/src/routes/**` extrahiert und mit `docs/API_REFERENCE.md` diff't.
- Drift auflösen.

### 7.8 Env-Var-Drift

- `docs/ENVIRONMENT_VARIABLES.md` vs `.env.template` diff'en und synchronisieren.

**Phase-7-Commit-Ziel:** `docs: Phase-7 cleanup — migration numbers, language policy, dev-env guide, bugs split`

---

## Phase 8 — OPS & OBSERVABILITY (Tag 15–16, ~2 Tage)

Details siehe `16-ops-services.md`.

### 8.1 Alert-Delivery Integration-Test

- Webhook/Telegram-Notification End-to-End Test in CI (Mock-Receiver).

### 8.2 Restore-Drill CI-Job

- `scripts/test/dr-drill.sh` als Nightly-Job in `.github/workflows/`.
- Postgres-Dump → Qdrant-Backup → Restore in Throw-away-Container → Smoke-Tests.

### 8.3 Health-Endpoint-Contract

- Entscheidung: nur `/healthz` oder `/health` + `/ready` + `/live`?
- Alle Services auf einen Standard.

### 8.4 Alert-History Retention

- `alert_history` Tabelle: Retention-Policy (90 Tage default), Cleanup in `run_all_cleanups()`.

### 8.5 Self-Healing-Events Dashboard-Expose

- Logs nur auf Disk = blind. Events → DB-Tabelle + Backend-Endpoint → Frontend-Admin-View.

**Phase-8-Commit-Ziel:** `feat: Phase-8 ops — alert e2e test, restore drill in CI, healing events dashboard`

---

## Phase 9 — STRUCTURAL / NAMING (Zeitrahmen offen)

Langfristige Strukturänderungen, nicht zeitkritisch. Jede einzeln diskutabel.

### 9.1 Python Shared-Lib

- `libs/shared-python/secret_resolver.py`, `http_client.py`, `db_pool.py`, `config_manager.py`
- 7 Services adoptieren.

### 9.2 Compose-File-Naming

- `compose/compose.*.yaml` → `compose/service-*.yaml` (Konsistenz).

### 9.3 Frontend `store/` vs `stores/`, `utils/` vs `helpers/` vereinheitlichen

Team-Entscheidung pro Pair, dann projektweiter Rename.

### 9.4 Zustand-Adoption (optional)

- Client-UI-State (Filter, Preferences) → Zustand statt Context-Provider-Chain.
- Nicht notwendig — aber DX-Gewinn bei neuen Features.

### 9.5 BackendEnvelope + Frontend-Types

- Gemeinsames `libs/shared/types.ts` (TypeScript-Typen, JSON-Schema-generiert aus Zod-Schemas in backend).
- Verhindert Drift.

---

## Aufwandsübersicht

| Phase | Titel                 | Aufwand  | Abhängigkeit |
| ----- | --------------------- | -------- | ------------ |
| 0     | Critical Fixes        | 2h       | —            |
| 1     | Kill List             | 3h       | 0            |
| 2     | Backend Refactor      | 1.5 Tage | 0, 1         |
| 3     | Frontend Refactor     | 2 Tage   | 0, 1         |
| 4     | Infra Cleanup         | 0.5 Tag  | 1            |
| 5     | Scripts & CLI         | 0.5 Tag  | 0            |
| 6     | Test Coverage         | 4 Tage   | 0, 2         |
| 7     | Docs & Onboarding     | 2 Tage   | 1            |
| 8     | Ops & Observability   | 2 Tage   | 0, 6         |
| 9     | Structural (optional) | offen    | alle         |

**Gesamt bis inkl. Phase 8:** ~14 Arbeitstage.

Phasen 2, 3, 4, 5 können **parallel** starten, sobald 0 + 1 durch sind.

---

## Arbeitsweise je Phase

Jede Phase-Datei startet mit:

1. Feature-Branch `cleanup/phase-N-<titel>`
2. Checkliste aus diesem Plan in lokale TODO-Liste übernehmen
3. Pro Punkt: Änderung + Test + Commit (kleine commits, nicht ein Riesen-Squash)
4. Am Ende: `./scripts/test/run-tests.sh --all` + `docker compose up -d --build` sanity-check
5. PR auf main mit Link zu diesem Plan + erledigten Punkten abhaken

---

## Was dieser Plan NICHT tut

- **Keine funktionalen Features** — das ist in `.claude/ANALYSIS_PLAN.md` (Thor-Support, 5-Jahres-Autonomie)
- **Keine Security-Hardening** — außer bereits offene Incidents (SEC-001 SQL-Injection)
- **Kein Performance-Tuning** — Perf ist "B+" laut Analysen; kein Cleanup-Treiber
- **Keine radikalen Redesigns** (per User-Memory) — nur inkrementelle Verbesserungen

---

## Nächste Schritte

1. **User bestätigen:** Phasen-Reihenfolge ok? Oder andere Priorität (z.B. Frontend vor Backend)?
2. **Phase 0 starten** — die 6 Critical Fixes sind in 2h durch, unabhängig von der Gesamt-Plan-Zustimmung.
3. Nach Phase 0: Feature-Branch für Phase 1 (Kill List) aufmachen. Große Dropletten (Tabellen, Dead Routes) separat committen.
