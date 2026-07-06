# Repo-Konsolidierung & Cleanup — saubere Produktionsbasis

> Toten Code entfernen, Doku/Root vereinheitlichen, Context-Engineering schlank & korrekt machen,
> den FIELD-Masterplan ehrlich auditieren, die 3 sicheren Verhaltens-Fixes zu Ende bringen und
> Branches/Dependabot aufräumen — damit das Repo eine saubere, produktionsfähige Basis für das
> nächste Feature ist. **Keine** Infra-/Live-Risiko-Änderungen (Ports, Netz, LUKS, WAL, Key-Rotation).

---

## Goal & Success Criteria

**Done heißt:**

- Root ist schlank: nur `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE`, `VERSION` (+ `arasul`, `Makefile`, Configs). Keine Stray-/Junk-/Duplikat-Doku mehr.
- Es gibt **genau eine** Architektur-Doku: `docs/ARCHITECTURE.md` (Root-Version gemerged & gelöscht, kein Content-Verlust).
- Alle internen Doc-Links lösen auf (`scripts/validate/validate-doc-links.sh` grün).
- Context-Engineering (`CLAUDE.md`-Hierarchie + `.claude/context/`) ist entdoppelt, faktisch korrekt (Migrations-Zähler stimmen), und dokumentiert **einen** klaren Feature-Workflow.
- Der FIELD-Masterplan ist auditiert: Erledigtes mit ✅ markiert, Obsoletes gestrichen, bleibt als Feature-Roadmap in `active/`.
- Die 3 sicheren Verhaltens-Fixes (RAG-Fehlermeldung, Teil-Index-Status, n8n-Auto-Restart) sind sauber implementiert **inkl. Tests**.
- Toter Code ist konservativ (nur beweisbar unreferenziert) entfernt; Grenzfälle sind gelistet, nicht gelöscht.
- Branches sind aufgeräumt; grüne Dependabot-Minor/Patch-PRs gemergt, Majors als Backlog notiert.
- CI grün, PR gemergt, Feld-Deploy automatisch durchgelaufen (voll autonom).

## Scope

**In scope:** Repo-Hygiene (Stray-Dateien, tote Doku, `.gitignore`), Doku-Konsolidierung, Context-Engineering-Slim + Fakten-Fix, FIELD-Audit (nur Plan-Datei aktualisieren), die 3 code-only Verhaltens-Fixes + Tests, konservativer Dead-Code-Sweep, Branch-/Dependabot-Hygiene.

**Out of scope (bewusst):**

- Alle Infra-/Live-Risiko-Themen aus FIELD: Ollama-Port schließen, MinIO-Route, Netz-Trennung, docker-proxy-Rechte, Key-Rotation, Backup-Verschlüsselung, WAL, LUKS, Kernel-Panic-Reboot.
- FIELD-Feature-Blöcke (Tenant-Isolation P2, externe LLM-Provider/Egress P6-1..8, OTA-Signing P4, `/healthz`/`/readyz` P7 — bleiben Roadmap).
- **P9-2 (CI-Gates auf blocking flippen)** — widerspricht der Memory `frontend-ci-advisory-backlog` (advisory ist Absicht, blocking bricht Auto-Merge). Nur als Konflikt im Roadmap-Audit vermerken, **nicht** ausführen.
- Major-Dependabot-Bumps blind mergen (multer 2, uuid 14, express-Gruppe).
- Lokale Disk-Clutter außerhalb git (`.venv/`, `services/self-healing-agent/venv/` — self-ignored).

## Acceptance Criteria

- [ ] `git ls-files '*.md'` im Root zeigt nur README/CLAUDE/CONTRIBUTING; `ARCHITECTURE.md`, `BUGS_AND_FIXES.md`, `CHANGELOG.md`, `ragllm-after-save.md` sind weg.
- [ ] `docs/ARCHITECTURE.md` enthält den „Design priorities"-Abschnitt aus der alten Root-Datei + „canonical single doc"-Framing.
- [ ] `.playwright-mcp/` steht in `.gitignore`, ist nicht getrackt.
- [ ] `scripts/validate/validate-doc-links.sh` läuft ohne Broken-Link-Fehler.
- [ ] Kein hardcodierter „nächste Migration = NNN"-Literal mehr; alle Stellen verweisen auf „read from `services/postgres/init/`" (aktuell 096 latest → 097 next).
- [ ] `docs/plans/README.md` dokumentiert die `done/`-Ordner und die (vereinheitlichte) Namenskonvention.
- [ ] `frontend-llm-grossrefactor.md` ehrlich abgeschlossen und nach `docs/plans/archive/` verschoben.
- [ ] FIELD-Masterplan: alle verifizierten DONE-Tasks mit ✅, P9-2-Konflikt vermerkt.
- [ ] RAG liefert bei Qdrant-Ausfall „vorübergehend nicht verfügbar" (nicht „keine Dokumente") — Test grün.
- [ ] Teil-indizierte Dokumente bekommen Status `partial` statt `indexed` — Test grün.
- [ ] Self-Healing startet n8n nach RAM-Entlastung wieder (`container.start()`) — Test grün.
- [ ] Backend-Jest + Frontend-Vitest + Self-Healing-Pytest bleiben grün.
- [ ] Stale + gemergte Branches gelöscht; grüne Minor/Patch-Dependabot-PRs gemergt, Majors als Backlog notiert.

## Vorstufe (vor Branch-Cut) — In-flight-Arbeit sauber landen

**S0.** Die 3 unmerged Commits auf `fix/setup-login-and-update-history` (setup-on-first-login, update-history-Fix, CreateAdmin-Refactor) zuerst als eigenen PR nach `main` bringen:

```bash
git push -u origin fix/setup-login-and-update-history   # bereits gepusht, ggf. no-op
gh pr create --base main --head fix/setup-login-and-update-history \
  --title "feat(auth): setup-on-first-login + update-history-Fix" --body "…"
gh pr merge --auto --squash --delete-branch
```

Auf grünen Merge warten, dann `git fetch origin main`. **Erst danach** den Cleanup-Branch frisch von `origin/main` schneiden (Phase-5 Step 0 des /plan-Flows). So bleibt Feature- und Hygiene-Historie getrennt.

## Phases

### ✅ P0 — Junk-Removal & .gitignore

**Files:** `ragllm-after-save.md` (delete), `.gitignore` (edit)
**Risk:** low — reine Entfernung von untracked/ephemerem Müll, kein Code.
**Steps:** `ragllm-after-save.md` löschen (Playwright-a11y-Dump, 0 Referenzen); `.gitignore` um `.playwright-mcp/` ergänzen (IDE/Tool-Cruft-Block).
**Tests:** keine (kein Code); Repo baut/startet unverändert.

### ✅ P1 — Doku-Konsolidierung & Link-Integrität

**Files:** `ARCHITECTURE.md` (merge→delete), `docs/ARCHITECTURE.md` (edit), `BUGS_AND_FIXES.md` (delete), `CHANGELOG.md` (delete), `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `docs/INDEX.md`, `docs/ops/DEPLOYMENT.md`, `docs/development/ONBOARDING.md`, `docs/development/DEVELOPMENT.md`, `.claude/context/debug.md`, `docs/plans/active/side-branch-cherry-pick-2026-05-14.md`, `docs/plans/README.md`
**Risk:** medium — viele Link-Fixes; Reihenfolge: erst mergen/Links fixen, dann löschen.
**Steps:**

1. „Design priorities (in order)"-Abschnitt aus `ARCHITECTURE.md:43-49` in `docs/ARCHITECTURE.md` übernehmen + „canonical single doc"-Framing an den Kopf.
2. Root `ARCHITECTURE.md`, `BUGS_AND_FIXES.md`, `CHANGELOG.md` löschen.
3. Alle Inbound-Links auf diese 3 Dateien fixen (Liste aus Research: README 37/59/73/111, CONTRIBUTING 171, CLAUDE.md 109, docs/INDEX 23, DEPLOYMENT 486, ONBOARDING 86/263, DEVELOPMENT 23/24/373/389/423, debug.md 139/230, side-branch-plan 91/215). ONBOARDING:263 (mislabeled) auf `docs/ARCHITECTURE.md` korrigieren.
4. `docs/plans/README.md`: `done/`-Ordner dokumentieren; Namenskonvention vereinheitlichen (lowercase-hyphenated für alle Ordner; die zwei bestehenden lowercase-Dateien in `active/` sind damit konform).
5. `scripts/validate/validate-doc-links.sh` ausführen → grün.
   **Tests:** `validate-doc-links.sh` (Doc-Link-Walker).

### ✅ P2 — Context-Engineering: slim + Fakten-Fix

**Files:** `CLAUDE.md`, `services/postgres/CLAUDE.md`, `docs/development/DEVELOPMENT.md`, `.claude/context/telegram.md`, `.claude/context/testing.md`, `.claude/context/debug.md`, `.claude/context/security.md`, `.claude/context/backend.md`
**Risk:** low-medium — nur Doku/Kontext, kein Produktionscode.
**Steps:**

1. **Migrations-Zähler-Fix (Kern):** Alle hardcodierten „nächste Migration = NNN"-Literale durch die Pointer-Formulierung aus `.claude/README.md:89-90` ersetzen („read from `services/postgres/init/` — latest is highest NNN on disk"). Betroffen: `CLAUDE.md:14,31,78`; `services/postgres/CLAUDE.md:16,53,57`; `DEVELOPMENT.md:389`; `telegram.md:115` (059→pointer). Faktenstand: latest 096, next 097.
2. Architektur-Diagramm-Triplikat in `CLAUDE.md:11-22` auf einen Ein-Zeilen-Pointer zu `docs/ARCHITECTURE.md` reduzieren.
3. `.claude/context/security.md`: Auth-/Rate-Limit-Abschnitte auf `apps/dashboard-backend/CLAUDE.md` verlinken statt duplizieren; Container-Hardening/Traefik-Teil behalten (unique).
4. `.claude/context/debug.md`: `docker`-Command-Overlap mit `docs/ops/TROUBLESHOOTING.md` verschlanken; Referenzen auf gelöschtes `BUGS_AND_FIXES.md` entfernen (auf TROUBLESHOOTING zeigen).
5. `.claude/context/testing.md:171-176`: stale „Coverage gaps (April 2026)"-Abschnitt entfernen/aktualisieren.
6. Feature-Workflow: eine klare Zeile in `CLAUDE.md`/`docs/plans/README.md`, dass `/plan` der kanonische Feature-Flow ist (Plan in `docs/plans/`, Ausführung → PR → Auto-Merge → Deploy).
   **Tests:** `validate-doc-links.sh`; manuelle Sichtprüfung dass keine neuen Literale eingeführt wurden.

### ✅ P3 — Dead-Code-Sweep (konservativ) — Befund: Repo ist bereits sauber

**Ergebnis:** `knip` findet **keine toten Dateien und keine toten Funktionen** (der frontend-llm-grossrefactor P2 hatte das bereits erledigt: 11 tote Dateien + ~25 tote Exports). Backend: keine verwaisten Route-Files (Research bestätigt). **Nichts konservativ zu löschen.**

**knip-Findings bewusst NICHT entfernt (begründet):**

- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-jsx-a11y` als „unused devDependencies" → **False Positives**: von der ESLint-Config referenziert (nicht importiert), im vorigen Refactor absichtlich hinzugefügt. Entfernen würde Linting brechen.
- „Unlisted binaries" (vite/eslint/knip) → transitiv bereitgestellt, Rauschen.
- 7 „unused exported types" (FieldValue, FileUploadStatus, ModelStatusData, Metrics, ApiError, SSEData, QueueState) → alle **lokal genutzt** (nur das `export`-Keyword ist cross-file redundant); `SSEData` sitzt im dokumentierten zentralen Typ-Barrel `types/index.ts` (siehe `ApiError`-Re-Export-Kommentar) → absichtliche API-Fläche, kein toter Code. Type-only, kein Runtime-/Bundle-Effekt → belassen.

**Unsichere Scripts gelistet, NICHT gelöscht:** `scripts/util/start-mcp-server.sh`, `scripts/util/auto-restart-service.sh` (evtl. host-/hook-invoked, nicht code-referenziert).

### ✅ P4 — FIELD-Audit & Plan-Konsolidierung (nur Plan-Dateien)

**Files:** `docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md`, `docs/plans/active/frontend-llm-grossrefactor.md` → `docs/plans/archive/2026-07-06_frontend-llm-grossrefactor.md`, `docs/plans/active/side-branch-cherry-pick-2026-05-14.md`
**Risk:** low — nur Doku.
**Steps:**

1. FIELD: verifizierte DONE-Tasks mit ✅ markieren (P1-1, P4-4/4-5/4-6, P6-12/6-14/6-15/6-19). Die 3 Verhaltens-Fixes (P6-13/6-16/6-17) als „in Cleanup-Plan erledigt" verlinken. **P9-2-Konflikt** mit Memory explizit als „NICHT umsetzen — advisory ist Absicht" vermerken. Obsoletes/erledigt-durch-096 streichen.
2. `frontend-llm-grossrefactor`: P5/P6 ehrlich bewerten (Acceptance-Criteria erfüllt; P5 E2E „teilweise", P6 Docs-Sync durch diesen Plan) → mit Archiv-Header nach `archive/` verschieben (Konvention `YYYY-MM-DD_slug`).
3. `side-branch-cherry-pick`: bleibt Backlog; interne stale Referenzen (BUGS_AND_FIXES, „next 095") korrigieren/annotieren.
   **Tests:** `validate-doc-links.sh`.

### ✅ P5 — Sichere Verhaltens-Fixes + Tests (P6-17 nun MIT Migration 097, siehe Open Questions)

**Umgesetzt:** P6-16 (rag.js `searchFailed`-Flag + distinkte Meldung) + Jest-Test (grün). P6-17 (Migration 097 additiv `ADD VALUE 'partial'` + document_processor `stats`-Out-Param + database.py `partial`-Branch + Backend-statusMap + Frontend Badges/DocumentManager/DetailsModal). P6-13 (recovery_actions `resume_n8n_workflows` + category_handlers RAM-Relief-Hysterese) + 2 neue Self-Healing-Tests (grün). **Test-Lücke ehrlich:** document-indexer hat keine Test-Infra + keinen CI-Job → P6-17 per Code-Inspektion + DB/Backend/Frontend-Ebene verifiziert, kein lauffähiger Indexer-Unit-Test hinzugefügt (wäre Theater).
**Files:** `apps/dashboard-backend/src/routes/rag.js`, `services/document-indexer/document_processor.py`, `services/self-healing-agent/recovery_actions.py`, `services/self-healing-agent/category_handlers.py`, `services/self-healing-agent/tests/test_healing_mock.py`, neue Backend-/Indexer-Tests
**Risk:** medium — Produktionscode in 3 Services; jeweils mit Test abgesichert; auf bestehende Teil-Fixes aufbauen (self-dokumentierende Kommentar-Konvention `P6-x:`).
**Steps:**

1. **P6-16 RAG-Fehlermeldung:** In `rag.js` Catch-Block (~208-221) `searchFailed`-Flag setzen; Message-Bau (~313-316) verzweigen → bei Suchfehler „Suche vorübergehend nicht verfügbar" statt „keine Dokumente … hochladen". Neuer Jest-Test: `hybridSearch` wirft → distinkte Message.
2. **P6-17 Teil-Index-Status:** In `document_processor.py` `skipped_chunks` aus (~651-661) bis zum Status-Setter (~442-463) propagieren; bei `skipped_chunks > 0` → Status `partial` statt `indexed` (keine Migration nötig, `documents.status` hat keinen CHECK-Constraint). Neuer Indexer-Test mit gemocktem Teil-Embedding-Fehler.
3. **P6-13 n8n-Auto-Restart:** In self-healing eine „RAM-Entlastung"-Recheck-Logik ergänzen, die n8n via `container.start()` wieder hochfährt, sobald RAM N Zyklen unter Threshold ist (Cooldown-Muster aus `category_handlers.py:224/239/254` spiegeln). `test_healing_mock.py` erweitern: Overload→stop, Relief→start.
   **Tests:** neue + bestehende Backend-Jest, Indexer-Pytest, `test_healing_mock.py` — alle grün.

### ✅ P6 — Branch- & Dependabot-Hygiene

**Ergebnis:**

- **Gemergt (Minor + grün, CI-Summary=SUCCESS):** PR #93 `axios 1.13.6→1.18.1`, PR #87 `@tiptap/pm 3.22.1→3.27.2`. (Nur diese zwei hatten grünes CI-Summary; das failende `claude-review` ist advisory.)
- **Branches gelöscht:** 2 gemergte Remote-Branches (`add-claude-github-actions-*`, `claude/audit-codebase-bugs-*`, je 0 unique commits) + 3 stale lokale (`fix/setup-login-and-update-history` nach #104, `001-frontend-llm-grossrefactor` nach #102, `001-full-audit-fresh-install-reliability`). `001-*`-Remotes waren bereits gepruned.
- **Behalten:** `feat/telegram-bot-overhaul`, `cleanup/phase-6-test-coverage` (Backlog laut side-branch-Plan), Tag `archive/side-branches-superset-2026-06-28`.
- **Backlog (nicht gemergt — CI-Summary=FAILURE, echte Docker-Build/Test-Fehler):** 13 Dependabot-PRs. Darunter die **Majors** #99 `multer 1→2`, #88 `uuid 9→14` (per Policy sowieso einzeln) sowie diverse tiptap/react/express/security/visualization-Gruppen mit failendem Frontend-Docker-Build. Diese brauchen einzelne Prüfung in einer dedizierten Dependency-Session — kein blindes Mergen.
  **Tests:** n/a (CI der jeweiligen Dep-PRs ist der Gate).

## Rollback

- P0–P4 sind reine Datei-/Doku-Änderungen → `git revert` des Squash-Commits stellt alles her; gelöschte Dateien sind in der Historie erhalten.
- P5 (Code) ist der einzige laufzeitrelevante Teil: pro Fix isoliert revertierbar; keine Migration, kein Schema-Change → kein Down-Script nötig. Feld-Deploy hat Healthcheck + Auto-Rollback.
- P6 (Branches/Dependabot): Branch-Löschungen sind über Reflog/Remote wiederherstellbar; gemergte Dep-PRs einzeln revertierbar.

## Open Questions

**GELÖST während Execution (2026-07-06):** P6-17 brauchte wider Plan-Annahme eine Migration.
`document_status` ist ein strikter Postgres-ENUM (`pending/processing/indexed/failed/deleted`),
nicht ein CHECK-freies Textfeld (Research-Agent hatte nur nach CHECK gegrept, den ENUM übersehen).
Ein neuer Status `'partial'` erfordert daher **Migration 097** (`ALTER TYPE … ADD VALUE IF NOT EXISTS 'partial'`,
additiv/idempotent, kein Datenrisiko auf PG16) **plus** Handling in Backend-`statusMap` + Frontend-Badges/Modal
(~5 Dateien, 3 Schichten). User-Entscheidung: **sauber mit Migration 097 umsetzen** (Option A).

Ursprünglich:
Scope durch Interview vollständig festgelegt. Einzige bewusste Abweichung von einer Empfehlung: **Deploy läuft voll automatisch bis zur Feld-Box** (User-Entscheidung), obwohl der Merk-Grundsatz sonst manuelles Live-Testen nahelegt — Healthcheck + Auto-Rollback deckt das Risiko ab.
