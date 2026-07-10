# IDE-Workspace-Shell — Second Brain + Tab-Arbeitsfläche + LLM-Panel

> Das Dashboard-Frontend bekommt eine IDE-artige 3-Spalten-Shell (Explorer | Tab-Arbeitsfläche | LLM-Panel)
> hinter einem Feature-Flag, mit echtem verschachtelten Ordnerbaum (Second Brain), Datei-Viewer-Tabs
> und einem ordner-scopebaren RAG-Chat inkl. Kontextdateien pro Ordner.

**Interview-Entscheidungen (2026-07-10, 14 Fragen / 4 Runden):**

| Thema             | Entscheidung                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Layout            | IDE-Shell ersetzt Sidebar-Navigation, hinter Feature-Flag (alte UI = Fallback)                                           |
| Explorer          | Second Brain: **alle Dokumente** in frei strukturierbaren, **echt verschachtelten Ordnern** (kein Projekt-/Sandbox-Baum) |
| Feature-Abdeckung | **Alle 9 Feature-Bereiche sofort als Tabs**                                                                              |
| Tabs              | zustand-Store + URL-Sync (`/workspace/...`), Persistenz in localStorage                                                  |
| Mitte             | Datei-Viewer (PDF browser-nativ via iframe, MD/TXT/Bilder) + interne Inhalte; **kein** externes Web-Browsen              |
| Rechts            | Bestehender RAG-Chat als Panel, **harness-ready** (Agent-Harness = eigener Folge-Plan)                                   |
| Verzahnung        | Ordner/Datei als Chat-Scope **plus volle Kontextdateien pro Ordner jetzt** (à la CLAUDE.md)                              |
| Backend           | Migration 098 + Ordner-CRUD + Kontextdatei-Injektion erlaubt                                                             |
| Deps              | `zustand` + `react-resizable-panels` neu (Root-Lockfile!); PDF ohne neue Dependency                                      |
| Start             | Dashboard-Tab offen; Optik = bestehende Tokens, kompaktere Dichte                                                        |

---

## Goal & Success Criteria

Der Nutzer schaltet im Header auf »Workspace« um und bekommt eine IDE-Oberfläche wie Cursor/VS Code:

- **Links:** Activity-Bar + Explorer mit dem kompletten Dokumentbestand als Ordnerbaum. Ordner anlegen, umbenennen, verschieben, löschen; Dokumente in Ordner verschieben. Klick auf eine Datei öffnet sie als Tab.
- **Mitte:** Tab-Leiste mit allen Feature-Bereichen (Dashboard, Dokumente, Datenbank, Store, Sandbox, Telegram, Settings, Datei-Viewer, Chat-Verläufe). Tabs überleben Reload, aktiver Tab steht in der URL.
- **Rechts:** der RAG-Chat als andockbares Panel. »Mit diesem Ordner chatten« scoped die Suche auf den Ordner-Teilbaum; eine Kontextdatei pro Ordner wird automatisch (sanitisiert + token-budgetiert) in den Prompt injiziert.
- Die alte UI bleibt hinter dem Flag vollständig funktionsfähig (Fallback in Sekunden, ohne Redeploy).

## Scope

**In scope:**

- Neue Shell (`features/workspace/`): Activity-Bar, Explorer, Tab-Bar, Tab-Content-Router, rechtes Chat-Panel, resizable Panels.
- zustand-Workspace-Store mit URL-Sync + localStorage-Persistenz.
- Migration 098: `parent_id` auf `knowledge_spaces` (Ordner = verschachtelte Spaces) + `is_context_file` auf `documents`.
- Backend: Space-Nesting-CRUD (anlegen/umbenennen/verschieben/löschen, Subtree-Auflösung), Dokument-in-Ordner-verschieben, Kontextdatei-Endpoints.
- RAG: Ordner-Scope über bestehendes `space_ids[]`, Kontextdatei-Layer in `buildHierarchicalContext()` (Company-Context-Pattern), Indexer-Skip für Kontextdateien, Cache-Invalidierung.
- Prop-Seam für `ChatView` (`chatId`) und `DatabaseTable` (`slug`), damit sie als Tab UND als Route funktionieren.
- Datei-Viewer: PDF (iframe, Blob-URL), Markdown, Text, Bilder.
- Tests (vitest) + Doku-Sync.

**Out of scope (bewusst):**

- Agent-Harness rechts (Werkzeuge/Dateizugriff/Multi-Step) → eigener Folge-Plan; das Panel wird nur austauschbar gebaut.
- Externes Web-Browsen / iframe-Browser-Tab.
- Backend-Persistenz des Workspace-Layouts (localStorage reicht; Storage-Abstraktion macht Backend-Sync später zum Drop-in).
- Entfernen der alten UI (erst wenn der Workspace sich im Alltag bewährt hat).
- Mandanten-Modell (Masterplan Phase 2) — Ordnerbaum ist dafür aber die spätere Heimat.
- Neues Designsystem / manualChunks-Änderungen an vite.config.

## Acceptance Criteria

- Flag aus → alte UI pixelidentisch und alle bestehenden Routen funktionieren; Flag an → `/workspace` rendert die Shell.
- Explorer zeigt verschachtelte Ordner + Dokumente; Anlegen/Umbenennen/Verschieben/Löschen von Ordnern und Verschieben von Dokumenten funktioniert im Browser auf dem Jetson.
- Datei-Klick öffnet Viewer-Tab (PDF/MD/TXT/Bild); Tabs überleben Reload; aktiver Tab deep-linkbar.
- Alle 9 Feature-Bereiche als Tab öffenbar; Fehler in einem Tab crasht nicht die Shell (ErrorBoundary pro Tab).
- »Mit Ordner chatten« liefert nur Treffer aus dem Teilbaum (`space_ids`-Filter, `auto_routing: false`).
- Kontextdatei eines Ordners wird bei gescoptem Chat injiziert (sanitisiert, im Token-Budget), taucht **nicht** als RAG-Zitat auf und wird vom Indexer übersprungen; Änderung wirkt sofort (Cache-Invalidierung).
- Migration 098 läuft idempotent auf Bestands-DB durch; frische DB baut alle 98 Migrationen grün.
- `./scripts/test/run-tests.sh --backend` grün; Frontend-Tests (vitest) grün inkl. neuer Store-/Shell-Tests.
- Doku aktualisiert (API_REFERENCE, DATABASE_SCHEMA, DESIGN_SYSTEM, ARCHITECTURE, frontend CLAUDE.md).
- Live-Verifikation im echten Browser auf dem Jetson (Memory-Regel), inkl. Flag-Umschalten in beide Richtungen.

## Phases

### ✅ P0 — Fundament: Dependencies + Feature-Flag + leere Shell-Route

**Files:** `package.json` (root-Lockfile-Regel: `npm install` im Repo-Root), `apps/dashboard-frontend/package.json`, `apps/dashboard-frontend/src/App.tsx`, neu `apps/dashboard-frontend/src/features/workspace/{index.tsx,WorkspaceShell.tsx}`, `apps/dashboard-frontend/src/lib/featureFlags.ts` (neu)
**Risk:** low — additive; Flag default **aus**, alte UI unberührt.
**Tests:** bestehende `App.test.tsx`/Navigation-Tests müssen unverändert grün bleiben; neuer Test: Flag aus → Sidebar, Flag an → Shell-Skelett.

- `zustand` + `react-resizable-panels` als Dependencies (nur Root-Lockfile, Regel 7).
- Flag `workspace-shell` (localStorage, Umschalter im Header der alten UI + zurück-Umschalter in der Shell).
- Route `/workspace/`\* lazy hinter dem Flag; rendert 3-Spalten-Skelett mit Platzhaltern.

### ✅ P1 — Backend: Migration 098 + Ordner-CRUD (verschachtelte Spaces)

**Files:** `services/postgres/init/098_nested_spaces_context_files.sql` (neu), `apps/dashboard-backend/src/routes/ai/spaces.js`, `apps/dashboard-backend/src/routes/documents.js`, `apps/dashboard-backend/src/schemas/*.js`, Backend-Tests
**Risk:** medium — Schema-Änderung auf Bestands-DB; Zyklen-Schutz beim Verschieben nötig.
**Tests:** neue Jest-Tests für Nesting-CRUD (Zyklus verboten, Subtree-Auflösung, Delete-Verhalten); Migrationslauf gegen Wegwerf-DB.

- Migration 098: `knowledge_spaces.parent_id UUID NULL REFERENCES knowledge_spaces(id)` (`ON DELETE`-Strategie: Kinder auf Parent hochziehen via Trigger oder `SET NULL` + Backend-Reparenting — Entscheidung in der Umsetzung, idempotent), Index auf `parent_id`; `documents.is_context_file BOOLEAN NOT NULL DEFAULT false` + partieller Index.
- Endpoints (asyncHandler + custom errors): `PATCH /spaces/:id` erweitert um `parent_id` (Move, mit Zyklus-Check), `GET /spaces/tree` (ein Baum-Aggregat für den Explorer: Spaces + Dokumente), `PATCH /documents/:id` erweitert um `space_id` (Move).
- Subtree-Resolver (rekursives CTE) als Service-Funktion — wird in P5 vom RAG-Scope genutzt.

### ✅ P2 — Workspace-Store + Shell-Layout

**Files:** neu `apps/dashboard-frontend/src/stores/workspaceStore.ts`, `features/workspace/{WorkspaceShell,ActivityBar,TabBar,TabContent}.tsx`, `App.tsx` (URL-Sync-Routen `/workspace/:tabRef?`)
**Risk:** medium — Kern der neuen UX; kein Einfluss auf alte UI.
**Tests:** Store-Unit-Tests (open/close/activate/reorder, URL-Sync, localStorage-Restore, Dashboard-Default-Tab), Shell-Rendertest mit `renderWithProviders`.

- zustand-Store: `tabs[] {id, type, payload}`, `activeTabId`, Panel-Sizes; persist-Middleware (localStorage); aktiver Tab ↔ URL.
- `react-resizable-panels` für die 3 Spalten (Explorer/Mitte/LLM collapsible).
- Tab-Content-Router: lazy Komponenten je Tab-Typ, `ComponentErrorBoundary` pro Tab (Muster aus `App.tsx:580ff`).
- Erster Tab-Typ: Dashboard (bestehendes `DashboardHome`), als Default-Tab.

### ✅ P3 — Explorer: Second-Brain-Ordnerbaum

**Files:** `features/workspace/explorer/{ExplorerPanel,TreeNode,ContextMenu}.tsx`, nutzt `GET /spaces/tree` + Move-Endpoints aus P1
**Risk:** medium — meiste neue UI-Fläche; alles über `useApi`.
**Tests:** Explorer-Integrationstest (Baum rendern, Ordner anlegen/umbenennen, Dokument-Klick öffnet Tab) mit gemocktem `useApi`.

- Baum mit Expand/Collapse, kompakte Dichte (bestehende Tokens).
- Kontextmenü: Neuer Ordner, Umbenennen, Verschieben, Löschen, »Mit Ordner chatten« (Handler kommt in P6), »Kontextdatei bearbeiten« (P6).
- Datei-Klick → Viewer-Tab (P4-Typ) im Store öffnen.

### ✅ P4 — Datei-Viewer-Tabs

**Files:** `features/workspace/viewers/{DocumentViewerTab,PdfViewer,MarkdownViewer,TextViewer,ImageViewer}.tsx`, nutzt bestehendes `GET /documents/:id/content` bzw. Download-Endpoint
**Risk:** low — rein additiv, keine neuen Dependencies (PDF via Browser-iframe + Blob-URL).
**Tests:** Viewer-Auswahllogik (MIME → Viewer) Unit-Test; Smoke-Rendertest pro Viewer.

### ✅ P5 — Alle Features als Tabs + Prop-Seam

**Files:** `features/chat/ChatView.tsx` (+`ChatRouter`), `features/database/DatabaseTable.tsx`, `features/workspace/TabContent.tsx`, Tab-Typen für Dokumente-Manager, Datenbank(-Tabellen), Store, Sandbox, Telegram, Settings
**Risk:** medium/high — der `useParams`/`useNavigate`-Seam in ChatView/DatabaseTable ist die fehleranfälligste Stelle; beide müssen als Route (alte UI) UND als Tab (Props) funktionieren.
**Tests:** bestehende Integrationstests (chat/database/documents/store/settings) bleiben grün; je ein Tab-Mount-Test für ChatView und DatabaseTable mit Props statt Route.

- Seam-Muster: `useParams()`-Aufrufe in dünne Route-Wrapper heben (`<ChatViewRoute>` liest Params und rendert `<ChatView chatId=... />`); Tab rendert die Prop-Variante direkt.
- Übrige Features sind self-contained und werden als lazy Tab-Typen registriert.

> **Abweichung in der Umsetzung (Blocker-Protokoll, autonom entschieden):**
> Statt des Prop-Seams bekam jeder Feature-Tab einen eigenen `MemoryRouter`
> (`FeatureTabHost` in `TabContent.tsx`) mit einer Route-Tabelle, die die
> Legacy-Pfade spiegelt; fremde Pfade übersetzt eine `TabBridge` in
> Workspace-Tab-Öffnungen. Grund: `Store`, `ChatRouter` und die
> Datenbank-Views sind intern Router-gekoppelt (eigene `<Routes>`, absolute
> `Link`s) — der Prop-Seam hätte invasive Änderungen in kritischem
> Chat-/Store-Code verlangt; der MemoryRouter-Host erreicht dieselben
> Akzeptanzkriterien ohne Eingriff in Feature-Internas.

### ✅ P6 — LLM-Panel: Chat rechts + Ordner-Scope + Kontextdateien

**Files:** Frontend: `features/workspace/llm/LlmPanel.tsx`, `contexts/ChatContext.tsx` (Scope-Übergabe), Explorer-Handler; Backend: `services/rag/ragCore.js` (`buildHierarchicalContext` Layer »Folder context«, Cache + Invalidierung), `llmJobProcessor.js` (Budget), `routes/ai/spaces.js` (Kontextdatei-Get/Put), `services/document-indexer` (Skip `is_context_file`), `schemas/chats.js` (`preferred_space_ids`)
**Risk:** high — kritischer Pfad (RAG-Prompt-Assembly, Streaming). Absicherung: rein additiv hinter `space_ids`-Scope; ungescopter Chat bleibt byte-identisch.
**Tests:** Backend-Jest: Scope-Filter (Subtree → `space_ids`), Kontextdatei-Injektion (sanitisiert, budgetiert, Cache-Invalidierung), Indexer-Skip; Frontend: Scope-Pill im Panel.

- Panel = bestehender Chat (ChatContext), hinter einer schmalen `LlmPanel`-Schnittstelle (harness-ready: späterer Agent ersetzt nur das Panel-Innere).
- »Mit Ordner chatten«: Subtree-Resolver → `space_ids` + `auto_routing: false` im bestehenden `/rag/query`-Body; Scope-Pill mit [×].
- Kontextdatei = `documents`-Row mit `is_context_file` pro Space; Injektion als eigener Layer in `buildHierarchicalContext()` nach Company-Context-Muster (`sanitizePromptContent`, im Token-Budget von `contextBudgetManager` angerechnet, 5-min-Cache + Invalidierungs-Hook am Edit-Endpoint); Indexer überspringt sie (kein RAG-Zitat).

> **Umsetzungsnotizen:** (1) Indexer-Skip brauchte keinen Python-Change —
> Kontextdateien bekommen den neuen Status `context`, der Indexer pollt nur
> `pending`. (2) Token-Budget brauchte keinen `llmJobProcessor`-Change — die
> Injektion liegt im `context`-String und läuft durch die bestehende
> Budget-Kürzung; zusätzlich kappt `sanitizePromptContent` auf 6.000 Zeichen
> und `folderContextService` auf max. 3 Dateien. (3) `preferred_space_ids`
> in `schemas/chats.js` wurde bewusst weggelassen — der Ordner-Scope ist
> ephemer im `workspaceStore` (Pill mit ×); Persistenz pro Chat wäre ein
> sauberer Folge-Schritt.

### ✅ P7 — Tests, Doku, Politur

**Files:** `__tests__/` (Anpassung der Navigation-/App-Tests auf Flag-Logik), `docs/api/API_REFERENCE.md`, `docs/api/DATABASE_SCHEMA.md`, `docs/development/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`, `apps/dashboard-frontend/CLAUDE.md` (Ordner-Tabelle: `stores/`, Tab-Typ-Checkliste)
**Risk:** low.
**Tests:** volle Suite `./scripts/test/run-tests.sh --backend` + Frontend-vitest; Live-Browser-Check auf dem Jetson nach Deploy (beide Flag-Zustände).

## Rollback

- **Sofort-Fallback ohne Deploy:** Feature-Flag aus (localStorage-Umschalter) → alte UI, die den ganzen Plan über unangetastet bleibt.
- **Code:** ein Squash-Commit auf main → `git revert` + Redeploy (CI-Pipeline mit Auto-Rollback auf Healthcheck-Fail).
- **Migration 098:** Down-Script wird mitgeliefert (`ALTER TABLE knowledge_spaces DROP COLUMN parent_id`, `ALTER TABLE documents DROP COLUMN is_context_file`) — additiv-nullable, kein Datenverlust beim Drop; ungescopter RAG-Pfad funktioniert auch mit Spalten ohne Nutzung.
- Kontextdatei-Injektion ist nur aktiv, wenn eine Kontextdatei existiert UND ein Scope gesetzt ist — Nicht-Nutzung = Alt-Verhalten.

## Open Questions

- `ON DELETE`-Semantik für Ordner mit Kindern (Kinder hochziehen vs. Löschen verweigern, solange nicht leer) — wird in P1 mit »Löschen verweigern, solange nicht leer« als sicherem Default umgesetzt, falls nichts anderes gesagt wird.
