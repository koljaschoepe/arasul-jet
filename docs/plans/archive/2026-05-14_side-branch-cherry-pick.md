> **Archived 2026-07-14** — In die frische `ROADMAP.html` überführt; der offene
> Rest (DR-Drill-CI, Backend-Unit-Tests, Drift-Checker) lebt als geparktes
> Roadmap-Thema „Side-Branch-Reste". Nur noch historische Referenz.

# Side-Branch Cherry-Pick Master Plan — alle 4 Themen aus den Side-Branches

> **STATUS 2026-07-07 (Repo-Cleanup-Audit):** NICHT ausgefuehrt — keines der Ops/DR/Drift/Backend-Test/FE-Refactor-Akzeptanz-Artefakte ist auf main (Multi-Agent gegen Code auf disk verifiziert). **Quelle jetzt real gesichert** als annotierte Tags `archive/feat-telegram-bot-overhaul-2026-07-07` und `archive/cleanup-phase-6-test-coverage-2026-07-07` (gepusht). ⚠ Der frühere STATUS nannte einen Tag `archive/side-branches-superset-2026-06-28`, der **nie existierte** — ersetzt durch die zwei realen Tags. Die Branches bleiben zusätzlich als Quelle stehen. **Nicht löschen, bis dieser Plan abgearbeitet ist.**
>
> **Superseded-Hinweis:** Der Telegram-/Datentabellen-Test-Anteil von Phase 6.x ist inzwischen **durch andere main-Commits abgedeckt** (`d9d6b89` External-Integrations-Hardening inkl. Telegram Phasen 1–7, `42f62c3` 54 Telegram-Unit-Tests; `telegramApp.test.js`/`telegramBots.test.js`/`telegramWebSocket.test.js`/`datentabellen.test.js` liegen auf main). Dieser Teil ist **nicht mehr zu cherry-picken**, sondern nur gegen main zu re-verifizieren. Echt offen bleiben: Phase 8.x (Ops/Health/DR), die übrigen Phase-6.x-Backend-Unit-Tests (jwt/fileValidation/tokenCrypto/documentAnalysis/chats/factories), Phase 7.x (Drift-Checker/ROADMAP) und die Phase-1-Frontend-Chat-Optimierung.

> Branches `cleanup/phase-6-test-coverage` (39 ahead) und `feat/telegram-bot-overhaul` (40 ahead) enthalten ~40 unique Themen-Commits, die nie auf main gemerged wurden. Ziel: alle vier wertvollen Themen-Blöcke gezielt cherry-picken — nicht branch-merge (Konflikt-Risiko zu groß).

## Quellen

- `feat/telegram-bot-overhaul` = `cleanup/phase-6-test-coverage` ∪ {`eb14000` (commercial-launch squash)}.
- Branch-Point: `aa1dacf` (~9 Tage alt vor diesem Plan).
- Main hat seit Branch-Point 67 neue commits (große Cherry-Pick-Welle: `22ba112` Phase 1 Security, `8368383` Phase 2 Frontend GDPR, `c370cad` Phase 3 Mig 082-089, `0bad1a4` Phase 4-9 infra, `e8e7c2b` Audit-Followups). Diese Cherry-Picks decken die Squash-Commits `9e397f3` und `eb14000` zum großen Teil ab — nicht jedoch die Themen-Phasen 6.x / 7.x / 8.x / Frontend-Optimization.

## Goal & Success Criteria

1. **Phase 8.x (Operations / 5-Jahr-Autonomie)** — `/healthz`+`/readyz` Aliases, nightly DR-drill CI, alert-webhook-test, alert_history-Retention voll wired auf main.
2. **Phase 6.x (Test-Coverage)** — fehlende Unit- und Integration-Tests von Side-Branch auf main: jwt-lifecycle, fileValidation/tokenCrypto, documentAnalysis, knowledge-graph, chats, datentabellen tables, telegram-app, plus parametrisierte 401-Tests, coverage thresholds, domain factories, FE-Provider-Wrap-Fixes.
3. **Phase 7.x (Docs-Hygiene)** — Migration-Number-Sync, language policy, ROADMAP-Single-Source, IDE/Day-1 in DEVELOPMENT.md, BUGS_AND_FIXES split, API+ENV drift-checker.
4. **Phase 1-9 Frontend-Optimization** — Chat-UX, Dashboard-Opt, UI consistency, typed FieldValue, dead-code Daten-Truncation.

User-visible: alles aus den Side-Branches, was nicht schon auf main ist, landet auf main. Branches können danach gelöscht werden.

## Scope

**In scope:** Cherry-Picks aus `feat/telegram-bot-overhaul` (Superset), pro Phase ein Commit (Squash-Cherry-Pick wenn nötig). Konfliktauflösung händisch wenn die main-Cherry-Picks bereits Teile gepickt haben.

**Out of scope:**

- Squash-Commits `9e397f3` (LLM/RAG/n8n 0-6) und `eb14000` (commercial-launch 1-5) — zu groß, überlappend, individuelle Themen-Commits sind besser.
- Branch-Delete passiert in einer Folge-Session nach Verifikation.

## Acceptance Criteria

- [ ] Migration-Sequenz auf main durchgehend ohne Gap (082 … höchste auf disk). Hinweis (Stand 2026-07-07): höchste ist 097, nächste 098; `CLAUDE.md` verweist nicht mehr auf eine hartkodierte Nummer, sondern „read from `services/postgres/init/`".
- [ ] `GET /healthz` und `GET /readyz` antworten 200 mit dokumentiertem Body-Contract (Phase 8.3).
- [ ] CI-Workflow `.github/workflows/dr-drill.yml` läuft nightly und ruft `scripts/test/dr-drill-ci.sh` auf.
- [ ] Backend-Test-Suite hat zusätzliche `__tests__/unit/jwt.test.js`, `fileValidation.test.js`, `tokenCrypto.test.js`, `__tests__/integration/documentAnalysis.test.js`, `knowledge-graph.test.js`, `chats.test.js`, `datentabellenTables.test.js`, `telegramApp.test.js`.
- [ ] `scripts/docs/check-api-reference.sh` und `scripts/docs/check-env-vars.sh` (oder analog) existieren und laufen lokal grün.
- [ ] `apps/dashboard-frontend/src/features/chat/ChatInputArea.tsx` ist auf den Phase-1-Stand: schlankere LOC, RagMetricsCard entfernt, Vision-Bild-Anhang funktioniert wie auf Side-Branch.
- [ ] `apps/dashboard-frontend/src/features/dashboard/DashboardHome.tsx` und `Sidebar` enthalten die Phase-2/3-Cleanups.
- [ ] `./scripts/test/run-tests.sh --all` grün.
- [ ] Smoke im Browser: Chat/Documents/Dashboard funktionieren ohne Regressionen.
- [ ] Side-Branches `cleanup/phase-6-test-coverage` und `feat/telegram-bot-overhaul` können bedenkenlos gelöscht werden (Diff gegen main zeigt nur den Squash-Inhalt 9e397f3/eb14000, der auf main per Themen-Cherry-Pick replizierbar wäre).

## Phases

Reihenfolge: Tests + Docs zuerst (safe, additive), Operations als zweites (Health/CI), Frontend zuletzt (riskanteste Refactors).

---

### P1 — Phase 8.x Operations (`/healthz`, `/readyz`, DR drill CI, alert tests)

**Commits to cherry-pick** (von `feat/telegram-bot-overhaul`):

- `09a0237` test: Phase-8.1 — alert webhook delivery integration test
- `615e941` ci: Phase-8.2 — nightly DR drill (migrations + pg_dump roundtrip)
- `d361eae` feat: Phase-8.3 — health endpoint contract + /healthz /readyz aliases
- `8e73562` feat: Phase-8.4 — alert_history 90-day retention (migration 082) — **Achtung**: Mig 082 ist bereits auf main via `c370cad`. Nur Retention-Logic ggf. picken.

**Files (erwartete Inhalte aus Branch):**

- `apps/dashboard-backend/src/index.js` — `/healthz`+`/readyz` Aliase
- `docs/HEALTH_CONTRACT.md` (neu, +131 LOC)
- `docs/INDEX.md` — Link hinzu
- `apps/dashboard-backend/__tests__/integration/api.test.js` — Tests für /healthz, /readyz
- `.github/workflows/dr-drill.yml` (neu)
- `scripts/test/dr-drill-ci.sh` (neu, +144 LOC)
- Phase 8.1: alert webhook delivery test (Integration)

**Conflicts erwartet:** `api.test.js`, `index.js` haben auf main Änderungen aus 0bad1a4. Manuelle Resolution.

**Tests:** Mit-cherry-gepicktes integration test grün; manueller `curl localhost:3001/healthz`.

**Risk:** Low. Additive Code-Pfade.

---

### P2 — Phase 7.x Docs-Hygiene (Migration-Sync, drift-checker, ROADMAP)

**Commits:**

- `8be33b6` Phase-7.1 — sync migration-number references
- `4c14ce5` Phase-7.2/7.3 — language policy + AI-facing banner
- `9e2eaf4` Phase-7.4 — ROADMAP as single source of truth + archive banners
- `2ed90af` Phase-7.5 — IDE & Day-1 section in DEVELOPMENT.md
- `90f002a` Phase-7.6 — split BUGS_AND_FIXES into open + archive
- `f390b12` Phase-7.7 — API route drift checker (`scripts/docs/check-api-reference.sh`)
- `a336ecd` Phase-7.8 — env-var drift checker

**Files:**

- `docs/development/DEVELOPMENT.md`, `docs/api/API_REFERENCE.md`, `docs/ROADMAP.md` (neu/move), `docs/INDEX.md` (Hinweis: das frühere Root-`BUGS_AND_FIXES.md` wurde 2026-07-06 im Cleanup-Plan gelöscht — Known-Issues leben jetzt in `docs/ops/TROUBLESHOOTING.md`)
- `scripts/docs/check-api-reference.sh` (neu, +226 LOC)
- `scripts/docs/check-env-vars.sh` (analog)
- CLAUDE.md sprachpolitisches Banner

**Conflicts erwartet:** API_REFERENCE.md ist auf main schon mehrfach modifiziert (durch P11 dieses Vor-Plans und durch `6e73d0e`, `04ec7ad`). Hier eher Re-Apply als reines cherry-pick — Inhalte zusammenführen.

**Risk:** Low. Reine Doku + neue Scripts. Aber: Konflikt-Resolution zeitaufwändig.

---

### P3 — Phase 6.x Test-Coverage

**Commits (in Reihenfolge):**

- `c55759e` Phase-6.1 — parameterize 98 duplicated 401 auth tests
- `d6f77e7` Phase-6.2 — unit tests for fileValidation & tokenCrypto
- `1b48bbf` Phase-6.2 — unit tests for utils/jwt.js (+296 LOC test)
- `9069dd8` Phase-6.3 — integration tests for documentAnalysis routes
- `fde000c` Phase-6.3 — integration tests for knowledge-graph routes
- `7e009f8` Phase-6.3 — integration tests for chats routes
- `49218c9` Phase-6.3 — integration tests for datentabellen tables routes
- `a1d4059` Phase-6.3 — integration tests for telegram-app coverage gaps
- `0fb5e45` Phase-6.4 — ratchet backend jest coverage thresholds
- `fb7701b` Phase-6.5 — domain factories for backend tests
- `59034c3` Phase-6.6 — fix frontend test provider wrapping regressions
- `cf7efe2` Phase-6.6 — fix copy drift + SystemHealthWidget mock

**Files:**

- `apps/dashboard-backend/__tests__/unit/{jwt,fileValidation,tokenCrypto}.test.js` (neu)
- `apps/dashboard-backend/__tests__/integration/{documentAnalysis,knowledgeGraph,chats,datentabellenTables,telegramApp}.test.js` (neu)
- `apps/dashboard-backend/__tests__/factories/` (neu — domain factories)
- `apps/dashboard-backend/jest.config.js` (coverage thresholds)
- `apps/dashboard-frontend/src/__tests__/helpers/renderWithProviders.tsx`
- `apps/dashboard-frontend/src/features/.../SystemHealthWidget.test.tsx`

**Conflicts erwartet:** Frontend test helper hat seit Branch-Point Änderungen (z.B. via Phase 2 cherry-pick). Manuelle Resolution.

**Risk:** Medium. Tests sind additiv, aber 401-Parametrisierung berührt viele bestehende Tests. Falls main-Tests bereits anders parametrisiert sind → Konflikt.

---

### P4 — Frontend Phase 1-9 (Chat-UX, Dashboard, UI consistency)

**Commits (Reihenfolge wie auf Branch):**

- `dc3ddbd` feat(chat): Phase 1 — Chat-UX improvements (ChatInputArea -298/+100 LOC, RagMetricsCard delete)
- `70e34c3` feat(dashboard): Phase 2 — Dashboard optimisation
- `04bf738` refactor(ui): Phase 3 — UI consistency pass
- `e2fc375` fix(backend): Phase 4 — shipping-bug honesty pass — **Achtung**: teilweise via `0bad1a4` schon auf main, ggf. skip
- `7d7a4d8` chore(setup): Phase 5 — setup-script hardening (Memory `feedback_subagents` und `feedback_slash_commands` beachten)
- `a37e26a` refactor(backend): Phase 6 — dead code & doc-drift cleanup
- `d1851e0` refactor(frontend): Phase 7 — typed FieldValue instead of any
- `41af201` feat(frontend): execute frontend optimization plan Phases 2-9 (Sammel-Commit)
- `8553038` fix(ui): truncate long names in Daten table; simplify ModelStatusBar header
- `ea07df1` revert(ui): keep sidebar minimal — 4 tabs only (post-revert, behält den Sidebar-Stand)

**Files:** ChatInputArea.tsx, DocumentManager.tsx, DashboardHome.tsx, Sidebar.tsx, StoreModels.tsx (mit speed_tier-Konflikt zu P0-P11!), Daten-Manager, ModelStatusBar.tsx, viele weitere FE-Files.

**Conflicts erwartet:** **HOCH**.

- `StoreModels.tsx` — main hat schon P8 (Tier-Filter) drauf
- `ChatInputArea.tsx` — main hat keinen Vision-Fallback-Badge dort (der ist via `ChatContext`+`ChatMessage`), aber Side-Branch hat den Code stark refactored
- `DashboardHome.tsx` — main hat Dashboard-Änderungen aus 8368383

**Risk:** **High.** Großer FE-Refactor auf 9 commits, manche überlappend mit kürzlichen main-Commits. Sollte mit Browser-Smoke pro Commit verifiziert werden.

**Strategy:** Statt cherry-pick einzeln einen **Re-Implementation-Plan** machen. Side-Branch-Code als Referenz, aber Neu-Schreiben auf aktuellem main. Sicherer.

---

### P5 — Phase 5.x Setup/Scripts/CI + Misc

**Commits:**

- `6c755e0` Phase-5.1 — verify secret writes land on disk
- `42e480d` Phase-5.4 — delete 5 truly orphan scripts (Memory `feedback_subagents` beachten)
- `1ce0492` Phase-5.5 — scripts workflow (bats + shellcheck)
- `f8811d3` chore: remove dead schemas/common.js

**Files:**

- `scripts/setup/` modifications
- `scripts/` orphan deletions — diese 5 vorher namentlich auflisten
- `.github/workflows/scripts.yml` (bats + shellcheck CI)
- `apps/dashboard-backend/src/schemas/common.js` — delete

**Risk:** Low-Medium. Orphan-Script-Deletes sind irreversibel — vor Delete grep ob keine Caller existieren auf main.

---

### P6 — Cleanup + Branch-Delete

- [ ] `git diff main...cleanup/phase-6-test-coverage` zeigt nur noch Inhalte aus `9e397f3` (oder ist leer)?
- [ ] `git diff main...feat/telegram-bot-overhaul` zeigt nur noch `9e397f3` + `eb14000`?
- Wenn ja: beide Branches lokal **und remote** löschen (User-Bestätigung).
- Memory `regressed-features.md` final aufräumen (alle "auf Side-Branch"-Hinweise auflösen).
- Plan-File `docs/plans/active/side-branch-cherry-pick-2026-05-14.md` → `docs/plans/archive/2026-05-XX_*.md`.

## Rollback

Pro Phase:

- P1 Ops: revert der jeweiligen Cherry-Pick-Commits, /healthz Aliase bleiben ungenutzt aber nicht schädlich.
- P2 Docs: einfach revert.
- P3 Tests: revert. Tests sind additiv, kein Funktions-Risiko.
- P4 Frontend: pro Commit revert. **High blast radius** — daher mit Smoke testen.
- P5 Misc: revert + orphan-scripts wiederherstellen.

Globaler Rollback: `git revert <commit-range>` und `docker compose up -d --build dashboard-backend dashboard-frontend`.

## Reihenfolge der Ausführung

1. **P1 Ops** zuerst — neue Hebel für 5-Jahr-Autonomie (Health/DR-CI).
2. **P3 Tests** parallel/danach — schützt vor Regressionen in den späteren Phasen.
3. **P2 Docs** parallel zu P3 (kein Code-Konflikt).
4. **P5 Misc/Setup** dazwischen.
5. **P4 Frontend** zuletzt — risikoreichster Block, profitiert von Tests aus P3.
6. **P6 Cleanup** — wenn alle Cherry-Picks durch.

## Open Questions

- Squash-Commits `9e397f3` und `eb14000` — sollen Restbestände (z.B. `init-encryption-keys.sh`, `reencrypt-minio.sh`, n8n-Workflows aus `eb14000`) separat geholt werden? Liste vor P6 erstellen.
- `BUGS_AND_FIXES.md` (Phase 7.6): das Root-Dokument wurde 2026-07-06 im Cleanup-Plan gelöscht (stale Audit, Historie via git). Falls dieser Cherry-Pick-Block je ausgeführt wird, Known-Issues nach `docs/ops/TROUBLESHOOTING.md` schreiben statt die alte Datei wiederzubeleben.
- Memory `feedback_dashboard_design` ("nur inkrementelle Verbesserungen") schränkt P4 explizit ein — die größeren Layout-Änderungen in Phase 2 (Dashboard) müssen darauf geprüft werden.

---

**Generated:** 2026-05-14, im Anschluss an Commit `912a190` (LLM+RAG+Store-Routing 0-11). Vorbereitend, Implementation in Folge-Sessions.
