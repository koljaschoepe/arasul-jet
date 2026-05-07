# Repo-Audit + Sanierung

> 15-Layer-Audit (15 parallele Sub-Agents) hat ~16 Critical und ~25 High-Befunde quer durchs Repo identifiziert. Dieser Plan deckt Critical/High mit klar reproduzierbarem Bug **heute** (P0–P22), Medium/Low + Critical-Path-ohne-Reproduktion + Greenfield-Arbeiten als Roadmap (P23–P40).

## Goal & Success Criteria

**Done bedeutet:**

- Alle Critical-Befunde mit klar reproduzierbarem Code-Evidence-Bug sind gefixt + auf `main` committet (klein-inkrementell, je 1 Commit/Phase).
- Alle High-Befunde mit klarem Code-Edit (kein Greenfield) sind gefixt + committet.
- Alle Doku-Drift-Critical (Onboarding-blockierend, falsche API-Pfade, falsche Migration-Counter) sind gefixt.
- Restliche Befunde (Medium, Low, Critical-Path ohne klare Reproduktion, Greenfield, Operator-Aktionen) sind in **Roadmap** unten dokumentiert.

**User-visible:**

- Frischer Dev kann `docs/development/ONBOARDING.md` von Cold-Start bis laufendem Service abarbeiten ohne 404-Links.
- `docs/api/API_REFERENCE.md` ist 1:1 was der Code liefert (keine Phantom-Endpoints).
- `CLAUDE.md`-Migration-Counter stimmt (082 → 093).
- Kein 2-stündlicher `NameError` aus `_renew_tls_cert` mehr.
- Indexer-Watchdog läuft tatsächlich alle 5 min (laut MEMORY behauptet, im Code aktuell nicht vorhanden).
- LLM-Service hat eine `requirements.txt`.
- `run-tests.sh` failt bei echtem Test-Failure (statt silent zu pass-en).

## Scope

**In scope (heute, P0–P22):**

- Backend: jwt.js typed errors, settings.js ServiceUnavailableError, documentService catch-swallow fixen, n8nLogger typed errors.
- Frontend: hex literals → CSS-Tokens, ApiError-Typ-Konflikt auflösen, `--color-success/warning/danger` semantisch fixen.
- AI-Services: llm-service `requirements.txt`, indexer 5-min-Watchdog-Timer, `_llm_context_cache` bounded, `_renew_tls_cert` `os`-Import.
- Compose: `NODE_VERSION` default → 22, `claude-code` Dangling-Traefik-Route bereinigen.
- DB-Doku: CLAUDE.md migration-counter 3-fach, DATABASE_SCHEMA.md Sync mit 090–092.
- Docs: API_REFERENCE Phantom-Endpoints raus, ONBOARDING.md broken refs, TESTING.md tree+v2-Syntax, DEVELOPMENT.md migration-Beispiel, ENVIRONMENT_VARIABLES.md Sync.
- Scripts: `set -euo pipefail` in `run-tests.sh` + 3 weiteren Side-Effecting-Scripts; hardcoded `/home/arasul/...` in deadman-switch + restore-from-backup raus.

**Out of scope (heute — als Roadmap dokumentiert):**

- Critical-Path-Refactors ohne klar reproduzierbaren Bug (LLM/RAG SSE try/catch-Wrapper, Phase-3 OpenAI-Compat im LLM-Service neu bauen).
- Greenfield-Implementation: GDPR `DELETE /api/gdpr/me` (laut MEMORY existiert es, im Code fehlt es komplett).
- TLS-Cert-Auto-Renewal Implementation (nur den `os`-Import-Crash fixen, Logik bleibt wie sie ist).
- n8n Custom-Node OpenAI-Compat-Migration (Port 11434→11436 + Endpoint-Switch — eigene Phase, smoke-pending).
- Frontend-Test-Coverage erhöhen (separate Phase).
- Coverage-Threshold erhöhen, `continue-on-error: true` aus CI ziehen (separate Phase, viele Cascading-Fixes).
- Branch-Protection-Rule via `gh api` (Operator-Aktion, nicht Code).
- Docker-Proxy-Restriction für backup-service (Architektur-Entscheidung).
- Performance-Refactoring (z.B. Flask → FastAPI in llm-service).

## Acceptance Criteria

- [ ] `docker compose config` ohne Fehler.
- [ ] `./scripts/test/run-tests.sh --backend` exitet **nicht** 0 bei künstlichem Test-Fail.
- [ ] `grep -rn "throw new Error" apps/dashboard-backend/src/utils/jwt.js` liefert 0 Treffer.
- [ ] `grep -rn "throw new Error" apps/dashboard-backend/src/services/n8nLogger.js` liefert 0 Treffer.
- [ ] `find services/postgres/init -name '*.sql' | sort | tail -1 | grep -o '[0-9]*'` matcht den Counter in CLAUDE.md.
- [ ] `services/llm-service/requirements.txt` existiert.
- [ ] `grep -n "082" CLAUDE.md services/postgres/CLAUDE.md` liefert 0 Migration-Counter-Treffer.
- [ ] `grep -E "POST /api/auth/refresh|/api/yaml-tables/|GET /api/documents/.*/status" docs/api/API_REFERENCE.md` liefert 0 Treffer.
- [ ] `grep -E "DX_OVERHAUL|context/(frontend|database|python-services)\.md" docs/development/ONBOARDING.md` liefert 0 Treffer (oder die referenzierten Files existieren).
- [ ] `grep -nE "docker-compose" docs/development/TESTING.md` liefert 0 v1-Syntax-Treffer.
- [ ] `head -5 scripts/test/run-tests.sh | grep -q "set -euo pipefail"` matcht.
- [ ] `python3 -c "import services.self_healing_agent.healing_engine"` (oder Äquivalent) bricht nicht mit `NameError: name 'os' is not defined`.

## Phases

> **Konvention:** Jede Phase = 1 Commit auf main. Conventional-Commit-Style. Reihenfolge: erst die billigen Doku-Fixes (P0–P3), dann die Code-Fixes von risikoärmsten zu komplexesten.

---

### P0 — Migration-Counter in CLAUDE.md korrigieren (CRITICAL doc drift) — 10min

**Files:** `CLAUDE.md`, `services/postgres/CLAUDE.md`
**Risk:** low — pure docs.
**Tests:** none.

`082` → `093` an allen Vorkommen, die "next migration" / "Latest applied" referenzieren. `apps/dashboard-backend/CLAUDE.md` enthält den Counter nicht direkt — nur `CLAUDE.md` und `services/postgres/CLAUDE.md`.

---

### P1 — ONBOARDING.md broken refs entfernen (CRITICAL onboarding) — 15min

**Files:** `docs/development/ONBOARDING.md`
**Risk:** low — pure docs.
**Tests:** none.

- Lines 35 + 190: `docs/plans/active/DX_OVERHAUL.md` existiert nicht → entfernen oder durch verfügbare Quelle ersetzen.
- Lines 219–226: `.claude/context/frontend.md`, `database.md`, `python-services.md` existieren nicht → entfernen aus der Liste.

---

### P2 — API_REFERENCE Phantom-Endpoints entfernen (CRITICAL contract drift) — 20min

**Files:** `docs/api/API_REFERENCE.md`
**Risk:** low — docs.
**Tests:** none.

Entfernen:

- `POST /api/auth/refresh` (Line 48) — Route existiert nicht in `auth.js`.
- YAML Tables Section (Lines 418–449) — kompletter Route-Block existiert nicht.
- `GET /api/documents/:id/status` (Line 408) — Route existiert nicht.

Hinzufügen (existieren in Code, nicht dokumentiert):

- `GET /api/auth/sessions` (auth.js:281).
- `GET /api/_meta` (routes/index.js:80).

---

### P3 — TESTING.md + DEVELOPMENT.md Drift fixen (CRITICAL onboarding) — 25min

**Files:** `docs/development/TESTING.md`, `docs/development/DEVELOPMENT.md`
**Risk:** low — docs.
**Tests:** none.

- TESTING.md:46–64: Tree-Pfad `services/dashboard-backend/` → `apps/dashboard-backend/`.
- TESTING.md:64: `scripts/validate-dependencies.sh` → `scripts/validate/validate-dependencies.sh`.
- TESTING.md:175,187,191 + alle weiteren `docker-compose` v1-Vorkommen → `docker compose` v2.
- TESTING.md:357,398: Node 18 → Node 22.
- TESTING.md:890: "Last Updated" auf heute (2026-05-06).
- DEVELOPMENT.md:389: Migration-Beispiel `042_*.sql` → `093_*.sql`.

---

### P4 — ENVIRONMENT_VARIABLES.md Sync (HIGH operator gap) — 25min

**Files:** `docs/ENVIRONMENT_VARIABLES.md`
**Risk:** low — docs.
**Tests:** none.

Hinzufügen (gelesen im Code, nicht dokumentiert):

- `TELEGRAM_USER_ID_PEPPER` + `TELEGRAM_USER_ID_PEPPER_FILE` — DSGVO-relevant.
- `ADMIN_EMAIL` (`bootstrap.js:15`).
- `MEMORY_MAX_ENTRIES` (`memoryService.js:27`).
- `N8N_PROXY_HOPS` (compose hardcoded `'1'`, in N8N.md erwähnt aber nicht in ENV-Doku).

Korrigieren:

- `JWT_EXPIRY` default `24h` → `4h` (match `jwt.js:20`).
- `NODE_VERSION` default `20.19` → `22` (match `.nvmrc`).

---

### P5 — DATABASE_SCHEMA.md mit 090–092 syncen (HIGH drift) — 35min

**Files:** `docs/api/DATABASE_SCHEMA.md`
**Risk:** low — docs.
**Tests:** none.

Aus `090_n8n_audit_log.sql` ergänzen:

- Tabelle `arasul.n8n_audit_log` + Trigger.

Aus `091_telegram_bot_health.sql` ergänzen:

- Neue Spalten in `telegram_bots`: `health_status`, `last_error_at`, `last_error_message`, `last_health_check_at`.

Aus `092_telegram_dsgvo.sql` ergänzen:

- Tabelle `telegram_user_consent` mit allen Constraints.

`Last sync` Timestamp (Line 4) auf heute aktualisieren.

---

### P6 — `run-tests.sh` `set -euo pipefail` (CRITICAL silent test pass) — 10min

**Files:** `scripts/test/run-tests.sh`
**Risk:** medium — könnte vorher latent maskierte Failures aufdecken. Das ist gewollt — aber wenn echte Failures auftauchen, müssen sie in eigenen Phasen P-something gefixt werden, nicht in P6.
**Tests:** Nach Edit `./scripts/test/run-tests.sh --backend` einmal laufen lassen (wenn Backend down → ok, Backend muss separat).

Eine Zeile nach Shebang einfügen: `set -euo pipefail`.

Falls ein latentes Failure aufpoppt, in dieser Session **nicht** anfassen — neue Phase im Roadmap-Block ergänzen.

---

### P7 — `_renew_tls_cert` `os`-Import (CRITICAL NameError every 2h) — 5min

**Files:** `services/self-healing-agent/healing_engine.py`
**Risk:** low — additive Single-Line-Edit.
**Tests:** Python-syntax check (`python3 -m py_compile services/self-healing-agent/healing_engine.py`).

`import os` ergänzen (am Top des File, falls nicht vorhanden).

---

### P8 — `settings.js` ServiceUnavailableError (HIGH pattern) — 10min

**Files:** `apps/dashboard-backend/src/routes/admin/settings.js`
**Risk:** low.
**Tests:** Backend-Tests, falls vorhanden für settings (sonst keine).

Lines 93–95: `throw new Error(...)` + `.statusCode = 503` → `throw new ServiceUnavailableError(...)`.

---

### P9 — `n8nLogger` typed errors (HIGH pattern) — 15min

**Files:** `apps/dashboard-backend/src/services/n8nLogger.js`
**Risk:** low.
**Tests:** existing (n8n-route tests).

Lines 31, 35, 138, 236: `throw new Error(...)` durch typed-Error-Klassen aus `utils/errors.js` ersetzen.

---

### P10 — `documentService` catch-swallow ersetzen (HIGH silent data loss) — 15min

**Files:** `apps/dashboard-backend/src/services/documents/documentService.js`
**Risk:** low — fügt strukturiertes Logging hinzu, ändert Verhalten nur für nicht-erwartete Fehler.
**Tests:** existing.

Line 49: `catch {}` → `catch (err) { logger.warn(...); throw err if !expectedColumnError }`. Rückwärts-kompatibel: bekannte "column does not exist" weiter swallowen, sonst loggen + werfen.

---

### P11 — `jwt.js` typed errors (HIGH pattern violation, callers string-match) — 1h

**Files:** `apps/dashboard-backend/src/utils/jwt.js`, `apps/dashboard-backend/src/utils/errors.js` (falls neue Klasse nötig), Aufrufer in `apps/dashboard-backend/src/middleware/auth.js`.
**Risk:** medium — Callers in `auth.js` matchen aktuell auf `.message`. Verhaltensgleichheit muss erhalten bleiben.
**Tests:** existing auth tests **müssen** weiter passen. Falls keine Tests existieren → Phase NICHT ausführen, in Roadmap als "blockiert: Tests fehlen" listen.

Bare `throw new Error(...)` an Lines 81, 119, 129, 152, 154, 169, 193, 231, 257 → typed Errors. Aufrufer auf `.code` umstellen statt `.message`-String-Match.

---

### P12 — `compose.app.yaml` NODE_VERSION → 22 (HIGH version drift) — 5min

**Files:** `compose/compose.app.yaml`
**Risk:** low — `.nvmrc` und Dockerfile sind bereits 22; das war der Sinn von Commit `f86a527`. Compose default ist nur das Fallback wenn `NODE_VERSION` env nicht gesetzt ist.
**Tests:** `docker compose config` ok.

Lines 21 + 119: `NODE_VERSION: '20.19'` → `'22'`.

---

### P13 — `claude-code` Dangling-Traefik-Route (CRITICAL infra inconsistency) — 15min

**Files:** `config/traefik/dynamic/routes.yml` (entfernen) **oder** neue compose-Entry für claude-code.
**Risk:** low — entweder Route weg, oder Service hinzufügen. **Default-Annahme:** Service existiert in `services/claude-code/`, also Compose-Entry hinzufügen wäre richtiger Weg. Aber wenn der Service nie laufen soll (Self-Healing exclusion deutet darauf hin) → Traefik-Route entfernen.
**Tests:** `docker compose config` ok.

**Default-Aktion:** Traefik-Route entfernen (Lines 116). Wenn der User den Service tatsächlich braucht → in eine neue Phase verschieben + Compose-Entry erst dann.

---

### P14 — `--color-success/warning/danger` semantischer Fix (CRITICAL UI semantic) — 30min

**Files:** `apps/dashboard-frontend/src/index.css`
**Risk:** low — Token-Werte werden korrigiert; alle Komponenten konsumieren sie via `var(--token)`.
**Tests:** Visual smoke-test in Browser (nach Deploy).

- `--color-success: #45ADFF` (blau) → echtes Grün (z.B. `#10B981` oder shadcn `--success`).
- `--color-warning: #94A3B8` (grau) → echtes Amber (z.B. `#F59E0B`).
- `--color-danger: #F0F4F8` (fast weiß!) → echtes Rot (z.B. `#EF4444`).

`@theme {}` block entfernen oder mit `@theme inline {}` block in Sync bringen (Frontend-Hooks-Agent: einer überschreibt den anderen).

---

### P15 — `ApiError`-Typ-Konflikt auflösen (CRITICAL silent type-failure) — 30min

**Files:** `apps/dashboard-frontend/src/types/index.ts`, `apps/dashboard-frontend/src/hooks/useApi.ts`
**Risk:** medium — Type-Contract, von vielen Stellen importiert.
**Tests:** `npm run typecheck` (oder `tsc --noEmit`); Vitest.

Eine Definition wird kanonisch (empfohlen: die in `useApi.ts`, weil sie `extends Error` macht und `.code`/`.details` hat). Die andere wird gelöscht oder re-exportiert. Alle Imports auf den kanonischen Typ ziehen.

---

### P16 — `services/llm-service/requirements.txt` (HIGH dep hygiene) — 15min

**Files:** `services/llm-service/requirements.txt` (neu), `services/llm-service/Dockerfile`
**Risk:** low.
**Tests:** `docker compose build llm-service` ok.

Dockerfile Lines 32–38 enthalten pinned versions inline. Extrahieren in `requirements.txt`. Dockerfile umstellen auf `pip install --no-cache-dir -r requirements.txt`.

---

### P17 — Indexer 5-min-Watchdog-Timer (CRITICAL claimed but missing) — 1h

**Files:** `services/document-indexer/enhanced_indexer.py`
**Risk:** medium — neuer Hintergrund-Task.
**Tests:** Wenn Python-Test-Setup für Indexer existiert: Mock `time.time()`/`asyncio.sleep`, Verify `recover_stuck_processing` 2× innerhalb 6min aufgerufen. Sonst: Code-Inspektion + smoke-Test nach Deploy.

Aktuell ruft `enhanced_indexer.py:71` `recover_stuck_processing` einmal beim Start auf. Hinzufügen: periodischer Task der alle `WATCHDOG_INTERVAL_SECONDS` (default 300, env-overridable) `recover_stuck_processing` aufruft + Anzahl recovered Docs loggt.

Falls neues Env-Var `INDEXER_WATCHDOG_INTERVAL_SECONDS` → in P4 (ENVIRONMENT_VARIABLES.md) nachträglich ergänzen.

---

### P18 — `_llm_context_cache` bounded LRU (CRITICAL OOM risk) — 30min

**Files:** `services/document-indexer/document_processor.py`
**Risk:** low.
**Tests:** existing pass.

Line 191: process-globaler Dict → `cachetools.LRUCache(maxsize=N)` mit env-overridablem N (default 1000, in P4 dokumentieren). Falls `cachetools` nicht in `requirements.txt` → in selber Phase ergänzen.

---

### P19 — `deadman-switch.sh` hardcoded path (CRITICAL operator deploy) — 15min

**Files:** `scripts/system/deadman-switch.sh`
**Risk:** low.
**Tests:** Syntax-Check `bash -n scripts/system/deadman-switch.sh`.

Lines 95+107: Fallback `/home/arasul/arasul/arasul-jet` durch `${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}` ersetzen oder ähnlich relative Auflösung.

---

### P20 — `restore-from-backup.sh` hardcoded BACKUP_DIR (CRITICAL operator deploy) — 10min

**Files:** `scripts/recovery/restore-from-backup.sh`
**Risk:** low.
**Tests:** Syntax-Check.

Line 17: Default `/home/arasul/arasul/arasul-jet/data/backups` → repo-relativ resolven oder `/var/lib/arasul/backups` als Default mit Override-Hinweis.

---

### P21 — `set -euo pipefail` für 3 weitere kritische Scripts (HIGH) — 20min

**Files:** `scripts/recovery/restore-from-backup.sh`, `scripts/system/deadman-switch.sh`, `scripts/test/smoke-test.sh`
**Risk:** low — bei smoke-test.sh fehlt nur `-e` (hat schon `-uo pipefail`).
**Tests:** Syntax-Check, ein Trockenlauf wenn möglich.

Restliche 14 Scripts ohne pipefail-Guard → in Roadmap, nicht heute.

---

### P22 — Plan-Counter im Plan selbst auf "P0–P22 erledigt" updaten — 5min

**Files:** `docs/plans/active/repo-audit-sanierung.md` (dieses File)
**Risk:** none.
**Tests:** none.

Jede abgeschlossene Phase oben mit `✅` prefixen. Status-Block am Ende des Plan-Files schreiben.

---

## Roadmap (NICHT heute — für spätere /plan-Runs)

### Critical (Critical-Path / Greenfield — eigene Sessions)

- **CR-1 GDPR `DELETE /api/gdpr/me` implementieren** — laut MEMORY Phase-5-P0 live, im Code fehlt es komplett. `gdpr.js` hat nur GET-Endpoints. Greenfield + DSGVO-Audit → eigene Phase mit Datenbank-Plan + Tests.
- **CR-2 `gdpr.js` non-admin Export erlauben** — DSGVO Art. 15 erfordert dass Datensubjekte (nicht nur Admins) ihre Daten exportieren. Aktuell `requireAdmin` auf beiden Endpoints.
- **CR-3 Phase-3 OpenAI-Compat im LLM-Service** — laut MEMORY/CLAUDE.md sollten `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` im LLM-Service existieren. Sie tun es nicht. Entweder Doku korrigieren ("liegt im Backend") oder Endpoints im LLM-Service implementieren.
- **CR-4 Backup-Service docker-proxy Migration** — `compose/compose.monitoring.yaml:155` mountet raw `docker.sock`. Architektur-Entscheidung: docker-proxy erweitern oder eigenständiger backup-proxy.
- **CR-5 docker-proxy `EXEC:1`/`BUILD:1`/`COMMIT:1` reduzieren** — aktuell faktisch Full-Passthrough. Pro Konsument minimieren.
- **CR-6 LLM/RAG SSE outer try/catch entfernen** — `routes/llm.js:50–145`, `routes/rag.js:84–462`. Critical-Path; Bug-Reproduktion benötigt Live-Test.
- **CR-7 `n8n /webhook` Traefik-Route ohne Auth** — `routes.yml:164–173`. HMAC-Middleware oder Shared-Secret hinzufügen.
- **CR-8 `e2e.test.js` real HTTP statt Simulation** — komplette Re-Implementierung der LLM-Chat- und RAG-Pipeline-Tests.
- **CR-9 Frontend `continue-on-error: true` aus CI ziehen** — `.github/workflows/test.yml:80,85`. Erst Frontend-Tests grün, dann gating-Job aktivieren.
- **CR-10 Branch-Protection-Rule via `gh api`** — `DEPENDABOT_HARDENING.md` §6. Operator-Aktion, kein Code.
- **CR-11 Telegram new-style webhook secret + HMAC tests** — `telegramHmac.js` ohne Tests; pseudonymisierungs-Regression silent.
- **CR-12 Indexer-Recovery `retry_count` increment** — `database.py:334–343` recovered ohne retry_count++ → Crash-Loop möglich.
- **CR-13 `_index_to_qdrant` exception path mit `doc_id=None`** — Doc bleibt permanent in `processing`.

### High (klares Pattern, aber heute nicht im Scope)

- **H-1 Frontend hex literals** (8+ Files) — Tailwind arbitrary values + DEFAULT_COLOR-Konstanten → CSS-Variablen.
- **H-2 useWebSocketMetrics HTTP-Fallback bypasses useApi** — `useWebSocketMetrics.ts:64`.
- **H-3 useModelStatus polling no AbortController** — `useModelStatus.ts:62–79`.
- **H-4 useTokenBatching timer not cleared on unmount** — `useTokenBatching.ts:51`.
- **H-5 BotSetupWizard eslint-disable-next-line stale-closure** — `BotSetupWizard.tsx:183–204`.
- **H-6 system/services route-level try/catch** — 10 Stellen → service-layer.
- **H-7 store.js silent partial-data** — `routes/store/store.js:93–203`.
- **H-8 `cryptoService.js` reads process.env at call-time** — CLAUDE.md §Forbidden.
- **H-9 `envManager.js` non-atomic file write** — atomic-rename pattern fehlt.
- **H-10 `leakCheckInterval` not in `globalIntervals`** — Shutdown-Sequence kann es nicht clearen.
- **H-11 Qdrant calls no timeout/retry** — `qdrant_manager.py:110–116`.
- **H-12 Flask single-thread in llm-service** — `app.run(threaded=False)` blockiert /health während pull.
- **H-13 `/health` in llm-service prüft nur Ollama-tags** — verifiziert keine Token-Generierung.
- **H-14 Embedding service `--timeout=3s` healthcheck** — kürzer als gunicorn worker timeout.
- **H-15 `restart-from-backup` `--no-owner --no-acl` lässt 0-row-tables passieren** — `restore-drill.sh:209`.
- **H-16 `n8n` redundante Traefik-Labels in compose** — `compose.app.yaml:261–262`.
- **H-17 `cloudflared` dual definition** — `services/cloudflared/docker-compose.override.yml`.
- **H-18 Custom n8n LLM node hardcoded `port: 11434`** — Phase-3 OpenAI-Compat-Migration unvollständig.
- **H-19 `bots.js:666` POST /:id/webhook ohne secret** — `setWebhook(id, url)` ohne `webhookSecret`.
- **H-20 CORS `.local` regex weak** — `apps/dashboard-backend/src/index.js:144–145`.
- **H-21 `Dependabot` per-workspace + `services/telegram-bot` falscher path** — `.github/dependabot.yml`.
- **H-22 14 weitere Scripts ohne `set -euo pipefail`** — siehe Scripts-Audit-Report.
- **H-22b `run-tests.sh` PROJECT_ROOT zeigt auf `scripts/` statt Repo-Root** (durch P6 entdeckt). `PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"` mit `SCRIPT_DIR=scripts/test/` ergibt `scripts/`, also matchen `[ -f "apps/dashboard-backend/package.json" ]` & Co. nie → silent green ohne dass Tests laufen. Fix: `PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"`. Eigene Phase, weil mehrere Funktionen davon abhängen + Stop-Hook-Logik nicht mit-broken werden darf.
- **H-23 Frontend lint + vitest `continue-on-error: true`** — kollabiert effektiv das CI-Gate.
- **H-24 Coverage threshold 38%/35%/25%** — viel zu niedrig für Critical-Path-Coverage.

### Medium

- **M-Cluster Frontend Hooks-Drift**, **M-Cluster Service-Layer-Drift**, **M-Cluster Doc-Drift Low** — siehe einzelne Layer-Reports der Audit-Agents.
- `docs/plans/active/EXTERNAL_INTEGRATIONS.md` partial-Archive.
- `mcp-remote-bash` orphan service entscheiden (delete vs wire up).
- `metrics-collector` `pids` limit fehlt.
- `ADMIN_HANDBUCH.md` fehlende Erwähnung Jetson Thor.
- Connection-Pool-Konflikt: metrics + self-healing + backend = bis zu 25 PG-Connections idle.
- Backup-Service healthcheck nur `crond`-Process — kein Backup-Status-Check.

### Low

- ~30 weitere kosmetische Drift-Findings, Typo-Fixes, Dead-Code-Removals — siehe Audit-Reports.

---

## Rollback

Jede Phase = 1 Commit auf `main` = `git revert <hash>` rollt zurück.

Sonderfälle:

- **P11 jwt.js**: Aufrufer wurden ggf. mitgeändert. Revert braucht beide Commits, oder nur die jwt.js-Änderung wird isoliert ausgeliefert.
- **P14 Color tokens**: Rollback ist visuell sofort sichtbar — User benachrichtigen wenn Browser-Smoke nicht durchlaufen ist.
- **P17 Watchdog-Timer**: Background-Task; falls Memory-Leak im Timer aufploppt, Revert + neue Phase.
- **P18 LRU-Cache**: Wenn `cachetools` neue Dep ist und Build bricht, Revert + Inline-LRU stattdessen.

Keine Migration in dieser Session — kein DB-Rollback nötig.

## Open Questions

Keine — Interview hat alle Constraints geklärt:

- Plan + Critical/High-Fixes (DoD).
- Klein-inkrementell, P0..PN.
- Critical-Path nur fixen wenn Bug klar reproduzierbar (deshalb CR-1, CR-3, CR-6 etc. in Roadmap).
- Direkt auf main, kein Branch.
- 15-Layer-Audit done, alle Reports konsolidiert.
- n8n+Telegram-Hardening (gerade gelandet) mit Build/Smoke-Caveat behandelt.

Falls während Phase 5 (Execution) ein Befund nicht reproduziert werden kann oder der Fix breitere Cascading-Effekte hat als erwartet → Phase stoppen, in Roadmap verschieben, in dieser Datei dokumentieren.

---

## Status — Execution Run vom 2026-05-07

Alle 22 Phasen committet auf `main`, kleinschrittig 1 Commit/Phase:

| Phase  | Commit    | Beschreibung                                                                                                                           |
| ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ P0  | `1d66830` | Migration-Counter 082 → 093 in CLAUDE.md + postgres/CLAUDE.md                                                                          |
| ✅ P1  | `750b99d` | ONBOARDING.md broken refs (DX_OVERHAUL + 3 context files) raus                                                                         |
| ✅ P2  | `6e73d0e` | API_REFERENCE Phantom-Endpoints raus, /api/\_meta + sessions rein                                                                      |
| ✅ P3  | `c0c9bb4` | TESTING.md tree-paths + docker-compose v2 + Node 22, DEVELOPMENT.md migration-Beispiel                                                 |
| ✅ P4  | `04ec7ad` | ENVIRONMENT_VARIABLES.md: ADMIN_EMAIL, TELEGRAM_USER_ID_PEPPER, MEMORY_MAX_ENTRIES, N8N_PROXY_HOPS, JWT_EXPIRY 24h→4h, NODE_VERSION 22 |
| ✅ P5  | `6afa74d` | DATABASE_SCHEMA.md regeneriert (Generator auf public+arasul erweitert; +n8n_audit_log, +telegram_user_consent, +health_status-Spalten) |
| ✅ P6  | `8b6e69f` | `set -euo pipefail` in run-tests.sh (PROJECT_ROOT-Bug als H-22b in Roadmap)                                                            |
| ✅ P7  | `2b6d6e9` | `import os` in healing_engine.py (NameError alle 2h gestoppt)                                                                          |
| ✅ P8  | `74d93e7` | settings.js restartService nutzt ServiceUnavailableError                                                                               |
| ✅ P9  | `76c4275` | n8nLogger 4× throw new Error → ValidationError                                                                                         |
| ✅ P10 | `dc2ebf0` | documentService catch-swallow narrow auf PG `42703`                                                                                    |
| ✅ P11 | `31d5fd0` | jwt.js typed errors (TokenExpired/InvalidToken/TokenRevoked), auth middleware auf `.code`-Dispatch                                     |
| ✅ P12 | `9e1fa2b` | compose.app.yaml NODE_VERSION 20.19 → 22                                                                                               |
| ✅ P13 | `6559028` | Traefik claude-terminal Dangling-Route + Catch-all-Exclusion raus                                                                      |
| ✅ P14 | `ea206b6` | success/warning/danger Tokens → echte semantische Farben (#10B981/#F59E0B/#EF4444); +light/dark alpha                                  |
| ✅ P15 | `80ef428` | ApiError-Typ collapsed: useApi.ts kanonisch, types/index.ts re-exportiert                                                              |
| ✅ P16 | `28ebbe7` | services/llm-service/requirements.txt extrahiert + Dockerfile umgestellt                                                               |
| ✅ P17 | `5c57048` | Indexer Watchdog: Daemon-Thread, INDEXER_WATCHDOG_INTERVAL_SECONDS=300                                                                 |
| ✅ P18 | `0f25f0d` | \_llm_context_cache LRU-bounded (OrderedDict, INDEXER_LLM_CONTEXT_CACHE_MAX=1000)                                                      |
| ✅ P19 | `eea49d7` | deadman-switch.sh + restore-from-backup.sh: REPO_ROOT aus SCRIPT_DIR, hardcoded `/home/arasul/...` raus                                |
| ✅ P20 | `eea49d7` | (zusammen mit P19 committet)                                                                                                           |
| ✅ P21 | `47dddf0` | smoke-test.sh `set -uo pipefail` → `set -euo pipefail`                                                                                 |
| ✅ P22 | (this)    | Plan-Status-Block am File-Ende ergänzt                                                                                                 |

**Neue Roadmap-Einträge aus dieser Execution:**

- **H-22b** `run-tests.sh` PROJECT_ROOT zeigt auf `scripts/` statt Repo-Root — silent green ohne dass Tests laufen. Fix in eigener Phase, weil mehrere Funktionen davon abhängen + Stop-Hook-Logik nicht mit-broken werden darf.

Build & smoke-Verify steht beim User: `docker compose up -d --build dashboard-backend dashboard-frontend document-indexer self-healing-agent llm-service` + visual-Smoke der Color-Tokens im Browser (P14).
