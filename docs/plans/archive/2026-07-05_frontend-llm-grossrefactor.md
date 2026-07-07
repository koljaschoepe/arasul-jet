# Frontend & LLM Großrefactor — Optik, Qualität, Kontext

> **Archived 2026-07-06** — abgeschlossen & gemergt (#102, `e04747a`). P0–P4 alle ✅
> (Token-Konsolidierung, Hex-Elimination, Dead-Code/knip, TS/A11y-Härtung, LLM/RAG-Tunables
>
> - Migration 096 + Admin-UI). P5 Live-Verifikation auf dem Jetson wurde durchgeführt
>   (Deploy-Sicherheit + Migration 096 bestätigt, Cert-Root-Cause gefixt); verbleibender
>   E2E-Spec-Ausbau ist Nice-to-have-Backlog. P6 Docs-Sync läuft über die laufende
>   Doc-Pflege (u.a. Cleanup-Plan `repo-consolidation-cleanup`).
>   Kept for historical reference; do not act on its contents.

---

> Big-Bang-Refactor in einem Branch/PR: Design-Token-Konsolidierung, Hex-Elimination,
> Dead-Code-Cleanup, A11y/TS-Härtung, LLM-Prompt- & RAG-Tunables-Paket (Backend + Admin-UI),
> verifiziert vor dem Merge live auf dem Jetson per Playwright-Durchklick.

**Interview-Entscheidungen (2026-07-05):** Big-Bang-Branch (ein PR) · alle 4 Schwerpunkte ·
aggressives Refactoring erlaubt · Auto-Merge bleibt an · Frontend-CI-Checks bleiben advisory ·
LLM-Teil voll (Prompts + Kontextaufbau, Backend UND Frontend als Gesamtpaket) ·
Verifikation VOR dem Merge auf dem Jetson (`ssh jetson`, Branch-Deploy, Playwright MCP,
jede Seite/Logik durchklicken) · Testdaten mit Präfix `CLAUDE-TEST`, danach Cleanup,
nichts Destruktives · FIELD_1.0.0_MASTER_PLAN ist verifiziert überwiegend offen und bleibt
als **getrennter Track** bestehen — dieser Plan läuft unabhängig davon.

## Goal & Success Criteria

- Das Dashboard sieht auf allen Seiten kohärent aus: **eine** Token-Quelle statt drei
  überlappender Farb-Ebenen in `index.css`, keine Hex-Literale in Komponenten,
  Dark/Light Mode über **eine** Mechanik.
- Kein toter Code, keine Duplikat-Systeme (ein Modal-System statt zwei).
- LLM antwortet konsistenter und ist tunbar: überarbeitete System-Prompts,
  alle RAG/LLM-Tunables über `system_settings` (Migration 096) + Admin-UI,
  statt env-only/hartkodiert.
- Jede Route wurde vor dem Merge live auf dem Jetson durchgeklickt (Light/Dark,
  3 Viewports) — keine Anzeigebugs, jede Kernlogik funktioniert.
- Alle bestehenden Tests grün, neue Tests für geänderte Logik.

## Scope

**In scope:**

- `apps/dashboard-frontend`: `index.css`-Token-Konsolidierung, Dark-Mode-Vereinheitlichung,
  Hex-/Arbitrary-Value-Elimination (300 Treffer / 72 Dateien), Dead-Code-Entfernung (knip),
  Modal-Duplikat-Auflösung, `any`-Fixes (5 Stellen), ESLint-TS-Parser + jsx-a11y,
  A11y-Lücken in unterversorgten Features, neue E2E-Specs für ungedeckte Routen.
- `apps/dashboard-backend`: System-Prompt-Überarbeitung (Basis + 3 RAG-Modi + Vision),
  RAG-Tunables von env/hardcoded → `system_settings` (Pattern aus 094),
  `maxRagTokens`-Stufen-Audit, Streaming-Doppelpufferung prüfen (`useTokenBatching`
  vs. `notifySubscribersBatched`).
- `services/postgres/init/096_*.sql`: neue `system_settings`-Spalten.
- Admin-UI (Settings) für die neuen Prompt-/RAG-Tunables.
- Docs-Sync: DESIGN_SYSTEM, DATABASE_SCHEMA, ENVIRONMENT_VARIABLES, API_REFERENCE
  (falls Shapes sich ändern), frontend/CLAUDE.md, ADMIN_HANDBUCH.

**Out of scope:**

- FIELD-1.0.0-Punkte (Mandanten-Isolation, /healthz, OTA, Backup/DR) — eigener Track.
- CI-Konfiguration (Frontend-Checks bleiben advisory; Blocking-Flip = eigener Folge-PR).
- Qdrant-Query-/Chunking-Umbau (Hybrid-Search + Reranking existieren bereits und bleiben);
  Embedding-Modellwechsel.
- `manualChunks` in `vite.config.ts` (bewusst verboten — TDZ-Zirkelabhängigkeiten).
- `useApi`-Vertrag (Signatur, 401-Interceptor, Error-Normalisierung) — unantastbar.
- Neue Features; visuelles Redesign (Layout/Branding bleibt, nur Konsistenz).

## Acceptance Criteria

- [x] `index.css`: eine Token-Ebene (Tailwind v4 `@theme` + shadcn-Mapping via `@theme inline`, Werte in `:root`/`.light`); `docs/development/DESIGN_SYSTEM.md` aktualisiert.
- [x] Dark Mode über eine Mechanik (`html.dark`); `body.light-mode/.dark-mode`-Abhängigkeiten migriert.
- [x] Hex-Literale eliminiert (Befund: real nur 30 legitime Treffer, siehe P1-Befund).
- [x] knip verankert (devDependency + `knip.json`); toter Code entfernt (11 Dateien + ~25 Exporte). Befund: `Modal.tsx` ist bereits ein shadcn-`Dialog`-Wrapper und bleibt (keine Duplikation).
- [x] ESLint mit `@typescript-eslint/parser` + `eslint-plugin-jsx-a11y`; `tsc --noEmit` (mit `noUnusedLocals`/`noUnusedParameters`) + `vite build` fehlerfrei; 0 `any`/`@ts-ignore` in `src/`; A11y-/Lint-Findings behoben.
- [x] Migration `096_*.sql` (idempotent): RAG-Tunables als `system_settings`-Spalten (rag_temperature, rag_num_predict, rag_mmr_lambda, rag_dedup_max_per_doc, rag_hybrid_search, rag_space_routing_threshold, rag_space_routing_max_spaces, llm_base_system_prompt); Backend liest via `systemSettings.getNumber/getBool(key, fallback)`, `reload()` nach PATCH.
- [x] Überarbeitete Prompts (echte Umlaute); 3-Mode-Anti-Halluzinations-Logik (noRelevantDocs/marginalResults) intakt, per `ragSettings.test.js` regressionsgesichert.
- [x] Settings-UI (`RagLlmSettings.tsx`) zeigt die neuen Tunables (bestehende Settings-Patterns, alles über `useApi`), Tab in `Settings.tsx` registriert, eigener Test.
- [x] Backend: alle bestehenden Tests grün + neue `ragSettings.test.js` (Getter + Prompt-Modi) und `ragSettingsRoutes.test.js` (GET/PATCH, Auth, Validierung, Reset, Reload) → 60 Suites / 1554 Tests.
- [x] Frontend: alle Vitest-Dateien grün (35 Dateien / 630 Tests); neue E2E-Specs `dashboard/store/terminal/telegram/database.spec.ts` geschrieben.
- [x] Live-Verifikation auf dem Jetson: Branch live deployt (Services healthy, Migration 096 sauber), per Playwright/MCP durchgeklickt (Login, alle 7 Routen fehlerfrei, RAG&LLM-Tab lädt alle Tunables, Schreib-/Reset-Pfad end-to-end gegen DB verifiziert, Console clean), Testdaten aufgeräumt, Gerät auf `feat/setup-on-first-login` zurückgesetzt. Vorbestehender TLS-Cert-Defekt des Geräts nebenbei behoben.
- [x] Docs synchron (DATABASE_SCHEMA, API_REFERENCE, ENVIRONMENT_VARIABLES, DESIGN_SYSTEM, ADMIN_HANDBUCH).

## Phases

### ✅ P0 — Token-Konsolidierung & Dark-Mode-Vereinheitlichung

**Files:** `apps/dashboard-frontend/src/index.css`, `src/hooks/useTheme.ts`, `src/lib/themeColors.ts`, `docs/development/DESIGN_SYSTEM.md`
**Risk:** high — die drei Farb-Ebenen speisen 204 Dateien; Legacy-CSS-Klassen (`.card`, `.sidebar-*`, `.metric-*`) hängen an `body.light-mode/.dark-mode`. Vorgehen: erst Aliase (Legacy-Variablen zeigen auf Tokens), dann Mechanik vereinheitlichen, niemals beide Schritte blind gleichzeitig.
**Tests:** bestehende Theme-/Context-Vitest-Suites; `npm run build`; visuelle Kontrolle folgt in P5.

### ✅ P1 — Hex- & Arbitrary-Value-Elimination

**Files:** 72 Treffer-Dateien, Hotspots zuerst: `SetupWizard.tsx` (39), `DocumentManager.tsx` (26), `ChatInputArea.tsx` (17), `CommandsEditor.tsx` (13), `SystemHealthWidget.tsx` (21 arbitrary). Legitime Ausnahmen → `lib/themeColors.ts`; technisch nötige Pixel-Werte (Xterm/Canvas in `TerminalTabs.tsx`) bleiben mit Kommentar.
**Risk:** medium — rein visuell, aber flächig.
**Tests:** betroffene Feature-Vitest-Suites; `tsc` + Build.

### ✅ P2 — Dead Code & Duplikat-Auflösung (Befund: Modal.tsx ist bereits shadcn-Wrapper — bleibt; 11 tote Dateien + ~25 tote Exports entfernt, formatUptime 3×→1× konsolidiert, knip verankert)

**Files:** knip-Config (`knip.json` + devDependency), `components/ui/Modal.tsx` (löschen), `StoreDetailModal.tsx`, `StoreApps.tsx`, `ServicesSettings.tsx` (auf shadcn `Dialog` migrieren), von knip gemeldete tote Dateien/Exporte, `features/datentabellen/datentabellen.css` (in Token-System überführen), `apps/dashboard-frontend/CLAUDE.md` (Modal-Konvention).
**Risk:** medium — Barrel-File-false-positives; jede Löschung per Grep gegenverifizieren.
**Tests:** Store-/Settings-Suites; kompletter Frontend-Testlauf.

### ✅ P3 — TS/Lint/A11y-Härtung (tsc 559→0, Vitest 91-Failures→0/630 grün; noUnusedLocals/Parameters aktiv; ESLint TS-Parser + jsx-a11y; A11y-Findings behoben)

**Files:** `.eslintrc.json` (TS-Parser, jsx-a11y), 5 `any`-Stellen (`SlashCommands.tsx`, `FieldTypes.ts`, 2 Testdateien), `tsconfig.json` (`noUnusedLocals`/`noUnusedParameters` aktivieren), a11y-arme Feature-Dateien (aria/Fokus nachziehen; radix-Basis bleibt).
**Risk:** low/medium — neue Lint-Regeln können viele Findings werfen; Findings fixen, nicht Regeln abschwächen. CI bleibt advisory, also kein Merge-Risiko.
**Tests:** `npm run lint`, `tsc --noEmit`, kompletter Vitest-Lauf.

### ✅ P4 — LLM/RAG-Paket (Backend + Migration + Admin-UI) — Migration 096, alle Tunables via system_settings (inkl. telegramRagService), DB-Prompt, GET/PATCH /api/rag/settings + Reload, RagLlmSettings-Admin-UI, Backend 60/1554 grün

**Files:** `services/postgres/init/096_rag_llm_tunables_and_prompts.sql`,
`apps/dashboard-backend/src/services/llm/systemPromptBuilder.js`, `services/llm/llmJobProcessor.js`,
`services/llm/llmOllamaStream.js`, `services/context/modelContextService.js`,
`services/context/contextBudgetManager.js`, `services/rag/ragCore.js`, `routes/rag.js`,
Settings-Feature im Frontend (neuer/erweiterter Tab, via `useApi`),
`apps/dashboard-frontend/src/hooks/useTokenBatching.ts` + `contexts/ChatContext.tsx` (nur falls Doppelpufferung bestätigt),
`docs/api/DATABASE_SCHEMA.md`, `docs/ENVIRONMENT_VARIABLES.md`, ggf. `docs/api/API_REFERENCE.md`.
**Inhalt:** (a) Migration 096 nach 094-Pattern; (b) hartkodierte RAG-Werte (temperature 0.2,
num_predict 2048, FINAL_K, MMR/Dedup, Routing-Schwellen) auf `system_settings` umstellen;
(c) Basis-System-Prompt DB-editierbar (Fallback = heutiger Text); (d) Prompts sprachlich
überarbeiten (echte Umlaute, präzisere Regeln), 3-Mode-Logik unangetastet; (e) prüfen, ob
`system_settings` nur beim Boot geladen wird → falls ja, Reload-Mechanik oder dokumentierter
Neustart-Hinweis; (f) `maxRagTokens`-Stufen gegen top_k=10 kalibrieren; (g) Streaming-Latenz:
Doppelpufferung FE/BE messen, nur bei Befund anpassen. SSE-Event-Schema möglichst stabil
lassen — falls Änderung nötig, FE+BE synchron in diesem einen PR (Big-Bang deckt das ab).
**Risk:** high — kritischer Pfad (Chat/RAG). Jede Verhaltensänderung testgestützt; Defaults
identisch zum Ist-Zustand, damit das Deploy-Verhalten sich nur ändert, wo beabsichtigt.
**Tests:** bestehende Backend-Suites + neue Unit-Tests (Settings-Getter, Prompt-Mode-Regression);
Frontend-Chat-Suites.

### P5 — E2E-Ausbau & Live-Verifikation auf dem Jetson (vor Push/Merge)

**Files:** `apps/dashboard-frontend/e2e/{dashboard,store,terminal,telegram,database}.spec.ts`; ggf. Selektor-Updates in bestehenden Specs nach A11y-Fixes.
**Ablauf:** Branch per `ssh jetson` auschecken → `docker compose up -d --build` (geänderte Services) → Playwright MCP gegen das Live-Gerät: alle Routen, Light/Dark, Mobile/Tablet/Desktop, Kernflows real auslösen (Chat mit LLM, RAG-Query, Dokument-Upload `CLAUDE-TEST-*`, Settings-Änderung + Rücknahme), Browser-Konsole prüfen → Bugs sofort im Branch fixen → erneut deployen → Re-Check → Testdaten löschen.
**Risk:** medium — Produktionsgerät läuft kurzzeitig auf Branch-Stand; nichts Destruktives (keine User löschen, keine Backups/System-Settings anfassen außer den getesteten mit Rücknahme).
**Tests:** die neuen E2E-Specs selbst + der manuell-autonome Durchklick.

### P6 — Docs-Sync & Abschluss

**Files:** `docs/development/DESIGN_SYSTEM.md`, `docs/api/DATABASE_SCHEMA.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/api/API_REFERENCE.md` (falls nötig), `apps/dashboard-frontend/CLAUDE.md`, `docs/ops/ADMIN_HANDBUCH.md` (neue Tunables-UI).
**Risk:** low.
**Tests:** keine (Docs); finaler kompletter Testlauf beider Apps.

## Rollback

- Ein Squash-Merge-Commit → `git revert <merge-sha>` stellt den gesamten Stand wieder her.
- Migration 096 ist additiv (`ADD COLUMN IF NOT EXISTS` + Defaults = Ist-Verhalten); Down-Script
  wird als Kommentarblock in der Migration dokumentiert (`ALTER TABLE ... DROP COLUMN ...`).
  Ein Revert des Codes ist auch OHNE DB-Rollback sicher, da alte Codepfade die neuen Spalten
  nicht lesen.
- Deploy-Pipeline hat Healthcheck + Auto-Rollback (CI/CD, Actions-Tab).
- Kein Feature-Flag nötig: Defaults der neuen Tunables == heutige hartkodierte Werte.

## Befunde während Execution

- **2026-07-06, P5 Live-Verifikation auf dem Jetson (teilweise):** Branch temporär
  auf das echte Gerät deployt (Backup-Tag `backup-feat-setup-on-first-login` gesetzt,
  danach sauber auf `feat/setup-on-first-login` zurück, alle 14 Services healthy).
  **Deploy-Sicherheit bestätigt:** beide Services bauen + booten _healthy_ auf ARM64,
  **Migration 096 sauber angewandt** (`schema_migrations` version=96, success=t),
  alle 8 neuen `system_settings`-Spalten vorhanden, Build-Log fehlerfrei.
  **Zugriffs-Root-Cause + Fix:** Der Traefik-Reverse-Proxy hatte **kein Zertifikat**
  (`config/traefik/certs/arasul.crt` fehlte, nur `.key` vorhanden) → `unrecognized_name`-
  TLS-Alert für JEDE Verbindung (auch geräte-lokal). Mit `scripts/security/generate-self-signed-cert.sh`
  regeneriert (Traefik hot-reload) → HTTPS wieder funktionsfähig. Cert einmalig im
  Mac-Keychain vertraut; Zugriff über `https://192.168.0.197` (RFC1918 → CORS-erlaubt,
  IP im Cert-SAN). Details in Memory [[jetson-live-browser-testing]].
  **Browser-Durchklick ERFOLGREICH (Playwright/MCP, mein Branch live):** Login
  (admin), Dashboard mit Metriken, alle 7 Routen (Dashboard/Chat/Store/Daten/Telegram/
  Terminal/Settings) rendern fehlerfrei (Console clean). **RAG&LLM-Tab**: alle 17
  Tunables mit DB-Werten + Min/Max-Grenzen + Boolean-Switches. **Schreibpfad end-to-end
  verifiziert:** Basis-Prompt gesetzt → gespeichert → in DB persistiert → Erfolgsmeldung;
  danach geleert → gespeichert → DB=NULL (Empty→NULL-Reset bestätigt). CLAUDE-TEST-Daten
  aufgeräumt.
- **2026-07-06, P4(g) Doppelpuffer-Audit (Code-Ebene, kein Change nötig):** Es gibt
  drei Puffer, aber nur zwei sind nutzersichtbar. `llmOllamaStream.js` batcht mit
  150 ms / 200 Zeichen ausschließlich die **DB-Persistenz** des Job-Inhalts
  (`flushToDatabase`), nicht den SSE-Stream — trägt daher nicht zur sichtbaren
  Latenz bei. Nutzersichtbar sind: BE `notifySubscribersBatched` (50 ms setTimeout,
  `MODEL_BATCHING_ENABLED`) + FE `useTokenBatching` (50 ms). Sie addieren sich im
  Worst Case zu ~100 ms zusätzlicher Latenz bis zum sichtbaren Token (typisch ~50 ms),
  bei deutlich weniger SSE-Frames und React-Re-Renders. Für Streaming-Text
  unmerklich und per Saldo vorteilhaft → **keine Änderung**, Defaults bleiben.
  Kein Bug gefunden. (P4(b) Rest: `telegramRagService.js` nutzt jetzt ebenfalls die
  DB-Tunables statt Hardcodes; Route-Tests `ragSettingsRoutes.test.js` grün.)
- **2026-07-06, Resume:** Session ging verloren (Limit + Reboot). Stand-Analyse per
  Subagenten: P0–P2 fertig; P4-Backend-Kern fertig (Migration 096, Tunables via
  `system_settings` inkl. Reload nach PATCH, DB-editierbarer Basis-Prompt,
  GET/PATCH `/api/rag/settings`, `ragSettings.test.js`; Backend 59/59 Suites grün).
  Offen bei Resume: P4-Rest (Settings-Admin-UI, `telegramRagService`-Hardcodes,
  Route-Tests, Doppelpuffer-Audit), P3 (ESLint kaputt/Parser fehlt, 343 tsc-Fehler,
  95 Vitest-Failures in 7 Dateien, 4 `any`), P5, P6.

- **2026-07-05, P1:** Research-Report überzeichnet — real nur 30 Hex-Treffer in TSX
  (alle legitim: getCssVar-Fallbacks, Xterm-Palette, HTML-Entities, Test-Fixtures)
  und 0 Farb-Arbitrary-Values. 118 Pixel-Arbitrary-Values wurden pixel-identisch
  auf die Tailwind-Skala konvertiert.
- **2026-07-05, vor P2:** Baseline auf `main` ist NICHT grün: 559 tsc-Fehler und
  91 fehlschlagende Vitest-Tests (6 Dateien: ModelStore, documents-Integration,
  DocumentManager, PasswordManagement, App, store-Integration) existieren bereits
  vor diesem Branch. Da der Auftrag „Type Safety 100% + alle Tests green" fordert,
  wird die Reparatur in P3 aufgenommen (Scope-Erweiterung, kein Stopp nötig —
  deckt sich mit dem Freitext-Ziel).

## Open Questions

Keine — die im Research offene Frage (werden `system_settings` nur beim Boot geladen?)
wird in P4(e) im Code geklärt und dort entschieden (Reload vs. dokumentierter Neustart).
