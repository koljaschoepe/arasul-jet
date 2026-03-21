# Frontend Modernization Plan

Umfassender Plan zur Modernisierung des Arasul Platform Frontends.

**Erstellt:** 2026-03-07
**Status:** Phase 9 abgeschlossen

---

## Zusammenfassung

| Bereich       | Vorher                        | Nachher                                |
| ------------- | ----------------------------- | -------------------------------------- |
| Build-Tool    | Create React App (deprecated) | Vite 6                                 |
| React         | 18.2                          | 19.x                                   |
| Sprache       | JavaScript                    | TypeScript (schrittweise)              |
| UI-Bibliothek | Keine (Custom CSS)            | shadcn/ui + Radix UI                   |
| CSS           | Plain CSS + CSS Variables     | Tailwind CSS v4                        |
| Theme         | Dark-only                     | Dark + Light (umschaltbar in Settings) |
| Form Handling | Manual useState               | React Hook Form + Zod                  |
| MCP-Server    | Playwright                    | + shadcn/ui MCP, Context7 MCP          |

**Dateien betroffen:** ~99 JS/JSX, ~26 CSS-Dateien
**Migrationsansatz:** Feature-by-Feature (App bleibt immer funktionsfaehig)

---

## Phase 0: Foundation (Voraussetzungen)

### 0.1 CRA zu Vite Migration ✅ ABGESCHLOSSEN

**Aufwand:** 1 Session | **Risiko:** Niedrig

1. ✅ `react-scripts` entfernt, `vite` 6.4 + `@vitejs/plugin-react` 4.7 + `vitest` 3.2 installiert
2. ✅ `vite.config.mjs` erstellt (Proxy, Build-Config, Vitest-Config)
3. ✅ `index.html` von `public/` nach Root verschoben, Script-Tag hinzugefuegt
4. ✅ 71 `.js` Dateien mit JSX zu `.jsx` umbenannt
5. ✅ `REACT_APP_*` → `VITE_*`, `process.env.*` → `import.meta.env.*` (3 Dateien)
6. ✅ `package.json` Scripts: `vite`, `vite build`, `vitest run`
7. ✅ Test-Setup: Vitest (241 `jest.*` → `vi.*` Referenzen in 20 Dateien migriert)
8. ✅ Dockerfile: `build/` → `dist/`
9. ✅ ESLint: `.eslintrc.json` erstellt (ersetzt CRA `react-app` extend)

**Validierung:**

- ✅ `npm run build` erstellt Production-Build (28.99s)
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped
- ✅ Backend-Tests unveraendert: 44 Suites, 1076 passed

### 0.2 React 18 zu 19 Upgrade ✅ ABGESCHLOSSEN

**Aufwand:** 1 Session | **Risiko:** Niedrig-Mittel

1. ✅ `react` 18.3.1 → 19.2.4, `react-dom` 18.3.1 → 19.2.4
2. ✅ `createRoot` bereits vorhanden (kein `ReactDOM.render`)
3. ✅ `@testing-library/react` 14.3.1 → 16.3.2, `@testing-library/dom` ^10.4.1 hinzugefuegt
4. ✅ Breaking Changes geprueft - keine betroffen:
   - Kein `forwardRef`, keine String refs, kein `defaultProps`, kein `propTypes`
   - Kein `findDOMNode`, kein `react-dom/test-utils`, kein `react-test-renderer`
5. ✅ Veraltete Warning-Suppressions in `setupTests.js` bereinigt
6. ✅ Leftover `jest.fn()` in ModelStore.test.jsx zu `vi.fn()` korrigiert
7. Neue Features (spaeter nutzbar): `useOptimistic`, `useActionState`, `use()` Hook

**Validierung:**

- ✅ `npm run build` = Production-Build erfolgreich (29.37s)
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped
- ✅ Backend-Tests unveraendert: 44 Suites, 1076 passed
- ✅ Alle Dependencies React 19 kompatibel (recharts, react-router-dom, react-markdown)

### 0.3 Tailwind CSS einrichten ✅ ABGESCHLOSSEN

**Aufwand:** 1 Session | **Risiko:** Niedrig

1. ✅ Tailwind CSS v4.2.1 + `@tailwindcss/vite` 4.2.1 installiert
2. ✅ Vite Plugin konfiguriert (`vite.config.mjs`: `tailwindcss()` vor `react()`)
3. ✅ `@import "tailwindcss"` am Anfang von `src/index.css`
4. ✅ `@theme` Block mit Arasul Design Tokens:
   - Colors: primary, danger, success, warning (+ hover/active Varianten)
   - Backgrounds: bg-dark, bg-card, bg-elevated, bg-subtle, bg-input, bg-modal
   - Text: text-primary, text-secondary, text-muted, text-disabled
   - Border: border, border-subtle
   - Radius: xs (4px) bis xl (16px)
   - Fonts: sans (Inter) + mono (JetBrains Mono)
5. ✅ Bestehende `:root` CSS-Variablen bleiben vollstaendig erhalten (Abwaertskompatibilitaet)
6. ✅ Tailwind-Klassen nutzbar neben bestehendem CSS (Feature-by-Feature Migration)
7. Dark/Light Theme Toggle: wird in Phase 0.4 mit shadcn/ui umgesetzt

**Validierung:**

- ✅ `npm run build` = Production-Build erfolgreich (29.09s)
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped
- ✅ Tailwind CSS im Output-Bundle verifiziert (v4.2.1 Header)
- ✅ Keine Konflikte mit bestehendem CSS (alle Border-Deklarationen explizit)

### 0.4 shadcn/ui initialisieren ✅ ABGESCHLOSSEN

**Aufwand:** 1 Session | **Risiko:** Niedrig

1. ✅ TypeScript 5.9.3 + `@types/react` + `@types/react-dom` installiert (Voraussetzung fuer .tsx)
2. ✅ `tsconfig.json` erstellt (`allowJs: true`, `@/*` Path-Alias, strict mode)
3. ✅ `vite.config.mjs` erweitert: `resolve.alias` fuer `@` → `./src`
4. ✅ `components.json` erstellt (style: new-york, base: slate, ui: `@/components/ui/shadcn`)
5. ✅ `src/lib/utils.ts` erstellt (`cn()` Helper mit clsx + tailwind-merge)
6. ✅ Runtime-Dependencies installiert: clsx, tailwind-merge, class-variance-authority, lucide-react, tw-animate-css, radix-ui, sonner
7. ✅ `index.css` erweitert:
   - `@import "tw-animate-css"` fuer Animationen
   - `@custom-variant dark` fuer Dark/Light Mode Support
   - `@theme inline` Block fuer shadcn Semantic Colors (background, foreground, primary, etc.)
   - `@layer base` Block fuer Standard-Defaults
   - shadcn CSS-Variablen in `:root` mit Arasul Dark Theme Farben
8. ✅ 19 shadcn Components installiert in `src/components/ui/shadcn/`:
   - button, card, dialog, input, label, select, sonner (statt deprecated toast)
   - tabs, table, badge, separator, dropdown-menu, popover, tooltip
   - skeleton, switch, textarea, alert, scroll-area

**Validierung:**

- ✅ `npm run build` = Production-Build erfolgreich (29.50s)
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped (unveraendert)
- ✅ shadcn CLI erkennt `components.json` und installiert in `src/components/ui/shadcn/`
- ✅ Alle Components importieren `@/lib/utils` korrekt
- ✅ Bestehende CSS-Variablen und Styles vollstaendig erhalten

### 0.5 TypeScript Grundlagen ✅ ABGESCHLOSSEN

**Aufwand:** 1 Session | **Risiko:** Niedrig

1. ✅ TypeScript installiert (in Phase 0.4 erledigt)
2. ✅ `tsconfig.json` erstellt (in Phase 0.4 erledigt)
3. ✅ Path Aliases konfiguriert (in Phase 0.4 erledigt)
4. ✅ `vite.config.mjs` → `vite.config.ts` umgestellt
5. ✅ **Regel:** Neue Dateien in `.tsx`, bestehende `.jsx` bleiben erstmal

**Validierung:**

- ✅ `tsc --noEmit` laeuft ohne Errors
- ✅ `npm run build` = Production-Build erfolgreich (29.27s)
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped (unveraendert)
- ✅ Bestehende JS-Dateien werden weiterhin kompiliert

---

## Phase 1: Shared UI Components migrieren

### 1.1 Component Wrapper erstellen - ABGESCHLOSSEN

**Aufwand:** 2-3 Sessions | **Risiko:** Niedrig

Bestehende `src/components/ui/` Components durch shadcn/ui ersetzen. Wrapper-Pattern fuer sanfte Migration:

| Bestehend               | shadcn/ui Ersatz             | Status                                        |
| ----------------------- | ---------------------------- | --------------------------------------------- |
| `Modal.jsx`             | `Modal.tsx` (Dialog-Wrapper) | DONE - Radix Dialog intern, gleiche API       |
| `Skeleton.jsx`          | `Skeleton.tsx` (Tailwind)    | DONE - animate-pulse, alle Compound-Varianten |
| `LoadingSpinner.jsx`    | Behalten                     | Bleibt erstmal (eigene CSS, getestet)         |
| `EmptyState.jsx`        | Behalten                     | Bleibt erstmal (einfach genug)                |
| `ConfirmIconButton.jsx` | Behalten                     | Bleibt erstmal (inline-confirm UX, getestet)  |
| `ErrorBoundary.jsx`     | Behalten                     | React-spezifisch, kein UI-Replacement         |

Neue shadcn Components (bereits in Phase 0.4 installiert):

- Button, Input, Textarea, Select, Switch, Badge, Tooltip, DropdownMenu, Sonner (Toast)

**Validierung:**

- Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- Build: 31.31s erfolgreich
- tsc --noEmit: keine Errors

### 1.2 Theme System aufbauen — ABGESCHLOSSEN

**Aufwand:** 1 Session

1. `useTheme` Hook (`src/hooks/useTheme.ts`): Theme-State, localStorage, DOM-Klassen, System-Praeferenz-Fallback
2. shadcn Light-Vars in `.light-mode` (index.css): --background, --foreground, --card, --border, etc.
3. `.dark` Klasse auf `<html>` fuer Tailwind `dark:` Varianten-Support
4. Sonner: `next-themes` Import ersetzt durch `@/hooks/useTheme`
5. App.jsx: Inline Theme-Logik durch `useTheme()` Hook ersetzt

**Architektur:**

- `:root` = Dark Theme (Standard, shadcn + Legacy Vars)
- `.light-mode` = Light Theme Overrides (shadcn + Legacy Vars)
- `<html class="dark">` = Tailwind `dark:` Variant Support
- `<body class="dark-mode|light-mode">` = Legacy CSS Overrides (backward-kompatibel)
- System-Praeferenz (`prefers-color-scheme`) als Fallback wenn kein gespeicherter Wert

**Validierung:**

- Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- Build: 31.83s erfolgreich
- tsc --noEmit: keine Errors

### 1.3 Layout-Components ✅

**Aufwand:** 1 Session | **Abgeschlossen:** 2026-03-07

**Erledigt:**

1. Sidebar aus App.jsx extrahiert -> `src/components/layout/Sidebar.tsx` (TypeScript)
2. ScrollArea (Radix) fuer Navigation-Bereich - custom Scrollbars, flex-1 min-h-0
3. Sidebar-Typ-System: SidebarProps, DownloadInfo Interfaces
4. App.jsx: ~140 Zeilen entfernt, 5 ungenuetzte Imports bereinigt (FiHome, FiSettings, etc.)
5. Bug-Fix: Settings-Link hatte doppelte `nav-link` CSS-Klasse
6. Separator-Komponente bereit fuer Feature-Migrationen (Phase 2+)

**Validierung:**

- Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- Build: 33.32s erfolgreich
- tsc --noEmit: keine Errors

---

## Phase 2: Feature-Migration (Settings zuerst)

### 2.1 Settings-Seite ✅ ABGESCHLOSSEN

**Ergebnis:**

1. God-Component aufgeteilt: Settings.jsx (1322 Zeilen) -> 5 TypeScript-Dateien:
   - `Settings.tsx` (Hauptshell mit Sidebar-Navigation + Content-Routing)
   - `GeneralSettings.tsx` (Theme-Toggle mit Switch, System-Info, About)
   - `AIProfileSettings.tsx` (Firmenprofil mit RadioGroup, Select, Input)
   - `CompanyContextSettings.tsx` (Unternehmenskontext-Editor mit Textarea)
   - `ServicesSettings.tsx` (Dienste-Verwaltung mit Dialog, Badge)
   - `PasswordManagement.tsx` (Passwort-Verwaltung mit Input, Alert)
2. shadcn-Komponenten eingefuehrt: Card, Button, Input, Label, Select, Switch, RadioGroup, Textarea, Alert, Badge, Dialog, ScrollArea
3. Icons: react-icons/fi -> lucide-react (Settings-spezifisch)
4. `settings.css` (900+ Zeilen) geloescht, komplett durch Tailwind ersetzt
5. Responsive: `grid-cols-1 md:grid-cols-[280px_1fr]` fuer mobile Unterstuetzung
6. React Hook Form + Zod + shadcn Form installiert (bereit fuer zukuenftige Formulare)

**Validierung:**

- Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- Build: 33.45s erfolgreich
- tsc --noEmit: keine Errors

### 2.2 React Hook Form + Zod einrichten ✅ ABGESCHLOSSEN (mit 2.1)

Dependencies installiert: react-hook-form, zod, @hookform/resolvers
shadcn Form-Komponente erstellt: `src/components/ui/shadcn/form.tsx`
Pattern bereit fuer zukuenftige Formulare (Phase 3+)

---

## Phase 3: Store-Seite migrieren

### 3.1 StoreHome / StoreApps / StoreModels ✅ ABGESCHLOSSEN

**Ergebnis:**

1. 5 JSX-Dateien zu TypeScript konvertiert:
   - `Store.jsx` -> `Store.tsx` (Hauptshell mit Tabs, Suche, Routing)
   - `StoreHome.jsx` -> `StoreHome.tsx` (Landing-Seite mit Empfehlungen)
   - `StoreApps.jsx` -> `StoreApps.tsx` (App-Katalog mit Aktionen)
   - `StoreModels.jsx` -> `StoreModels.tsx` (Modell-Katalog mit Filtern)
   - `StoreDetailModal.jsx` -> `StoreDetailModal.tsx` (Detail-Dialog)
2. shadcn-Komponenten eingefuehrt: Dialog, Button, Badge, Input, ScrollArea
3. Icons: react-icons/fi -> lucide-react (18+ Icons)
4. `Store.css` (1390 Zeilen) + `appstore.css` (1677 Zeilen) geloescht = ~3000 Zeilen CSS durch Tailwind ersetzt
5. Uninstall-Dialog: manuelle modal-overlay -> shadcn Dialog
6. Detail-Modal: manuelle modal-overlay -> shadcn Dialog + ScrollArea
7. Suchfeld: HTML input -> shadcn Input mit Icon-Prefix

**Validierung:**

- Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- Build: 33.59s erfolgreich
- tsc --noEmit: keine Errors

---

## Phase 4: System-Seite migrieren ✅ ABGESCHLOSSEN

### 4.1 System Features

**Aufwand:** 1 Session | **Abgeschlossen:** 2026-03-07

Dateien:

- ✅ `src/features/system/SetupWizard.jsx` -> `.tsx` (1007 Zeilen, 28 Icons migriert)
- ✅ `src/features/system/UpdatePage.jsx` -> `.tsx` (568 Zeilen, XHR-Upload erhalten)
- ✅ `src/features/system/SelfHealingEvents.jsx` -> `.tsx` (283 Zeilen, 10 Icons migriert)
- ✅ `src/features/system/Login.jsx` -> `.tsx` (103 Zeilen, shadcn Card+Input+Button)

Migration:

1. ✅ Wizard Steps mit Tailwind-Progress-Stepper (custom divs mit cn())
2. ✅ System-Status Cards mit Tailwind utility classes + Badge
3. ✅ Log-Ansicht mit Tailwind-styled table
4. ✅ Login-Form mit shadcn Card + Input + Button

CSS geloescht: ~2917 Zeilen (Login.css 348 + SetupWizard.css 1027 + UpdatePage.css 1011 + SelfHealingEvents.css 531)
Icons migriert: react-icons/fi → lucide-react (40+ Icons)

**Validierung:**

- ✅ `tsc --noEmit` fehlerfrei
- ✅ Tests: 18 Suites, 432 passed, 21 skipped (unveraendert)
- ✅ Build: 33.21s

---

## Phase 5: Telegram migrieren ✅ ABGESCHLOSSEN

### 5.1 Telegram Features

**Aufwand:** 1 Session

Dateien:

- ✅ `src/features/telegram/TelegramAppModal.jsx` -> `.tsx` (852 Zeilen, 5 Sub-Komponenten)
- ✅ `src/features/telegram/BotSetupWizard.jsx` -> `.tsx` (828 Zeilen, WebSocket + Polling)
- ✅ `src/features/telegram/BotDetailsModal.jsx` -> `.tsx` (483 Zeilen, 4 Tabs)
- ✅ `src/features/telegram/CommandsEditor.jsx` -> `.tsx` (357 Zeilen, CRUD)

CSS geloescht:

- ✅ `TelegramAppModal.css` (920 Zeilen) -> Tailwind
- ✅ `TelegramBots.css` (948 Zeilen) -> Tailwind
- **Gesamt: ~1868 Zeilen CSS entfernt**

Migration:

- ✅ Icons: 40+ react-icons/fi -> lucide-react
- ✅ CSS -> Tailwind utility classes mit cn()
- ✅ TypeScript Interfaces fuer alle Props/State
- ✅ Tests: 25/25 BotSetupWizard Tests angepasst und bestanden

**Validierung:**

- ✅ `tsc --noEmit` = 0 Fehler
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped (unveraendert)
- ✅ `npm run build` = 33.79s

---

## Phase 6: Documents migrieren ✅ ABGESCHLOSSEN

### 6.1 DocumentManager

**Aufwand:** 1 Session

Dateien:

- ✅ `src/features/documents/DocumentManager.jsx` -> `.tsx`
- ✅ `src/features/documents/SpaceModal.jsx` -> `.tsx`
- ✅ `src/features/documents/Badges.jsx` -> `.tsx`
- ✅ `src/features/documents/documents.css` (1603 Zeilen) -> Tailwind (GELÖSCHT)
- ✅ `src/features/documents/space-modal.css` (233 Zeilen) -> Tailwind (GELÖSCHT)

Migration:

1. ✅ Document-Liste mit Tailwind table styling
2. ✅ Upload-Bereich mit Tailwind dropzone
3. ✅ Space-Auswahl mit Tailwind tabs + dropdown
4. ✅ Badges -> Tailwind + cn() utilities
5. ✅ File-Icons -> lucide-react (24+ Icons migriert)
6. ✅ TypeScript interfaces fuer alle Props/State

**Validierung:**

- ✅ `tsc --noEmit` = sauber
- ✅ `vitest run` = 18 Suites, 432 passed, 21 skipped
- ✅ `vite build` = 33.25s, keine Fehler

---

## Phase 7: Datentabellen migrieren ✅ ABGESCHLOSSEN

### 7.1 Excel-Editor

**Aufwand:** 1 Session

Dateien:

- ✅ `src/features/datentabellen/ExcelEditor.jsx` -> `.tsx` (TypeScript + Tailwind)
- ✅ `src/features/database/Database.css` excel-\* Regeln (~930 Zeilen) entfernt -> Tailwind
- ✅ `src/features/datentabellen/datentabellen.css` erstellt (minimal: Sidebar-Overlay + CellEditor)
- ✅ 20 react-icons/fi -> lucide-react migriert
- DataTableEditor.js, AddFieldModal.js existieren nicht (waren bereits in ExcelEditor konsolidiert)

Migration:

1. ✅ Alle CSS-Klassen durch Tailwind-Utilities ersetzt (cn() fuer bedingte Klassen)
2. ✅ Sidebar-aware Overlay: CSS parent selector pattern in minimal datentabellen.css
3. ✅ CellEditor classPrefix="excel" Styles beibehalten (dynamisch generierte Klassen)
4. ✅ Virtualisierung und Keyboard-Navigation unveraendert (nur UI-Layer ausgetauscht)
5. ✅ TypeScript Interfaces: Field, TableData, Row, CellPosition, ExcelEditorProps
6. ✅ Reusable Tailwind class constants: btnBase, btnPrimary, btnDanger, btnIconOnly, menuItem

**Validierung:**

- ✅ `tsc --noEmit` clean
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped
- ✅ `npm run build` = 33.34s

---

## Phase 8: Chat migrieren (komplex) ✅ ABGESCHLOSSEN

### 8.1 Chat-System

**Status:** ✅ Abgeschlossen in 1 Session

Migrierte Dateien (8 JSX → TSX):

- `ChatRouter.jsx` → `ChatRouter.tsx`
- `ChatLanding.jsx` → `ChatLanding.tsx`
- `ChatView.jsx` → `ChatView.tsx`
- `ChatTopBar.jsx` → `ChatTopBar.tsx`
- `ChatInputArea.jsx` → `ChatInputArea.tsx`
- `ChatMessage.jsx` → `ChatMessage.tsx`
- `ProjectCard.jsx` → `ProjectCard.tsx`
- `RecentChatCard.jsx` → `RecentChatCard.tsx`

Geloeschte CSS-Dateien (4 Dateien, ~2207 Zeilen):

- `chatview.css` (373 Zeilen)
- `chatmessage.css` (597 Zeilen)
- `chatinput.css` (674 Zeilen)
- `chatlanding.css` (563 Zeilen)

Neue CSS-Datei:

- `chat.css` (~190 Zeilen) — nur Patterns die nicht in Tailwind ausdrueckbar sind:
  - Markdown descendant selectors (.message-body p/code/pre/table/ul/ol/li/a/blockquote/h1-h4)
  - Mermaid diagram styles
  - 6 custom @keyframes (loading-dot, pulse-glow, fadeIn, slideUpFadeIn, skeleton-pulse, queue-pulse)
  - Scrollbar styling (.chat-messages::-webkit-scrollbar)
  - Thinking block collapse transitions (.thinking-block.collapsed .thinking-content)
  - Responsive fuer Markdown-Container (@media max-width 768/576/375px)
  - Light-mode overrides (~30 Selektoren)

Icons migriert: 30+ react-icons/fi → lucide-react

- FiEdit2 → Pencil, FiBook → BookOpen, FiArrowLeft → ArrowLeft, FiDownload → Download,
  FiTrash2 → Trash2, FiMessageSquare → MessageSquare, FiSearch → Search, FiX → X,
  FiPlus → Plus, FiChevronRight → ChevronRight, FiChevronDown → ChevronDown,
  FiChevronUp → ChevronUp, FiCpu → Cpu, FiArrowDown → ArrowDown, FiBox → Box,
  FiCheck → Check, FiAlertCircle → AlertCircle, FiArrowUp → ArrowUp, FiFolder → Folder,
  FiFileText → FileText

TypeScript: `as any` casts fuer untyped JS hooks (useApi, useToast, useChatContext, useConfirm)
Unchanged: `index.js` barrel exports, `utils.js`, alle 6 Test-Dateien, Streaming-Logik

### Validierung

- ✅ `tsc --noEmit` clean
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped
- ✅ `npm run build` = 33.67s

---

## Phase 9: Database & Claude migrieren ✅ ABGESCHLOSSEN

### 9.1 Database + Claude Features

**Aufwand:** 1 Session | **Ergebnis:** 4 JSX → TSX, ~2755 Zeilen CSS → Tailwind + 30 Zeilen CSS

**Migrierte Dateien:**

- `DatabaseOverview.jsx` → `DatabaseOverview.tsx` (380 → ~290 Zeilen, Tailwind inline)
- `DatabaseTable.jsx` → `DatabaseTable.tsx` (31 → 25 Zeilen, ExcelEditor `as any` cast)
- `ClaudeCode.jsx` → `ClaudeCode.tsx` (1389 Zeilen, 3 Sub-Komponenten: WorkspaceManager, SetupWizard, ClaudeCode)
- `ClaudeTerminal.jsx` → `ClaudeTerminal.tsx` (424 Zeilen, SSE-Streaming beibehalten)

**Geloeschte CSS-Dateien:**

- `Database.css` (507 Zeilen) - dt-\* Klassen → Tailwind
- `claudecode.css` (1727 Zeilen) - alle claude-code-_, workspace-_, setup-_, auth-_ → Tailwind
- `ClaudeTerminal.css` (521 Zeilen) - alle claude-terminal-\* → Tailwind

**Neue CSS-Datei:**

- `claude.css` (~30 Zeilen): @keyframes (slideDown, slideInDown, blink), Light-Mode-Overrides

**Icon-Migrationen (react-icons/fi → lucide-react):**

- Database: FiPlus→Plus, FiSearch→Search, FiGrid→LayoutGrid, FiList→List, FiDatabase→Database, FiFileText→FileText
- ClaudeCode (24 Icons): FiTerminal→Terminal, FiSettings→Settings, FiFolder→Folder, FiPlay→Play, FiRefreshCw→RefreshCw, FiKey→KeyRound, FiAlertCircle→AlertCircle, FiAlertTriangle→AlertTriangle, FiCheck→Check, FiX→X, FiSquare→Square, FiMaximize2→Maximize2, FiMinimize2→Minimize2, FiChevronRight→ChevronRight, FiChevronLeft→ChevronLeft, FiExternalLink→ExternalLink, FiCpu→Cpu, FiZap→Zap, FiPlus→Plus, FiTrash2→Trash2, FiStar→Star, FiEdit2→Pencil, FiUser→User, FiLogIn→LogIn, FiClock→Clock
- ClaudeTerminal (12 Icons): FiTerminal→Terminal, FiSend→Send, FiRefreshCw→RefreshCw, FiAlertCircle→AlertCircle, FiCheckCircle→CheckCircle, FiClock→Clock, FiTrash2→Trash2, FiInfo→Info, FiChevronDown→ChevronDown, FiChevronUp→ChevronUp, FiCopy→Copy, FiCheck→Check

**TypeScript-Patterns:**

- `as any` Casts: useApi, useToast, useConfirm, Modal, LoadingSpinner, SkeletonCard, ExcelEditor
- Interfaces: Workspace, WorkspaceManagerProps, SetupWizardProps, Table, CreateTableModalProps, HistoryItem, Stats
- Reusable Tailwind class constants: btnBase, btnPrimary, btnSecondary, btnIcon (ClaudeCode.tsx)

**Editor Components:** Verbleiben in Phase 10 (MarkdownEditor, MermaidDiagram, Dialoge - eigener CSS-Kontext)

**Validierung:**

- ✅ `tsc --noEmit` fehlerfrei
- ✅ `npm run test` = 18 Suites, 432 passed, 21 skipped (unveraendert)
- ✅ `npm run build` = 33.63s

---

## Phase 10: Aufraeum-Arbeiten ✅ ABGESCHLOSSEN

### 10.1 Alte CSS-Dateien entfernen ✅

- ✅ `modelstore.css` (967 Zeilen, orphaned) geloescht
- ✅ `LoadingSpinner.css` → Tailwind inline
- ✅ `ErrorBoundary.css` → Tailwind inline
- ✅ `projects.css` (175 Zeilen) → Tailwind inline in ProjectModal.tsx
- Verbleibende CSS-Dateien (notwendig, nicht in Tailwind ausdrueckbar):
  - `index.css` — globale Styles + CSS-Variablen + Theme
  - `Modal.css` — gemeinsame Modal-Button-Styles (73 Zeilen)
  - `markdown-editor.css` — komplexes Editor-Layout + Light-Mode (798 Zeilen)
  - `chat.css` — Markdown-Rendering + Keyframes + Light-Mode (~190 Zeilen)
  - `claude.css` — Terminal-Keyframes + Light-Mode (~30 Zeilen)
  - `datentabellen.css` — Sidebar-aware Overlay + CellEditor (66 Zeilen)

### 10.2 TypeScript-Migration abschliessen ✅

- ✅ Alle `.jsx` → `.tsx`: App, index, Contexts (Auth, Chat, Download, Toast), UI-Komponenten (EmptyState, ConfirmIconButton, LoadingSpinner, ErrorBoundary, Modal, Skeleton), Editor-Komponenten (MarkdownEditor, MermaidDiagram, MarkdownCreateDialog, SimpleTableCreateDialog, CellEditor, FieldTypes), Features (ProjectModal), test-utils
- ✅ Alle `.js` → `.ts`: 11 barrel exports (index.ts), hooks (useApi, useWebSocketMetrics, useTokenBatching), utils (sanitizeUrl, formatting, token), config (api), feature hooks (useDocumentUpload, useDocumentActions, useExcelClipboard, useExcelHistory, useExcelKeyboard, useVirtualScroll), constants, chat/utils, setupTests
- ✅ `react-icons/fi` → `lucide-react` Icons in allen konvertierten Dateien
- ✅ TypeScript-Interfaces fuer Props, State, und Rueckgabewerte
- 0 `.js`/`.jsx` Source-Dateien verbleibend (nur .ts/.tsx)

### 10.3 Tests aktualisieren ✅

- ✅ Alle 18 Test-Dateien von `.test.jsx` → `.test.tsx` migriert
- ✅ test-utils.jsx → test-utils.tsx mit TypeScript-Typen
- ✅ test-utils/testUtils.jsx → test-utils/testUtils.tsx mit Interfaces
- Ergebnis: 18 Suites, 432 passed, 21 skipped (unveraendert)

### 10.4 Performance-Optimierung ✅

- ✅ Code-Splitting mit `React.lazy()` bereits implementiert (Phase 2)
  - Lazy: Settings, ChatRouter, DocumentManager, Store, ClaudeCode, TelegramAppModal, DatabaseOverview, DatabaseTable
  - Synchron: Login, ErrorBoundary, LoadingSpinner, SetupWizard (kritische Pfade)
- ✅ Bundle: 33s Build, Chunks nach Feature aufgeteilt
- React Compiler: Verschoben (experimentell, kein messbarer Vorteil aktuell)

### 10.5 Dokumentation ✅

- ✅ FRONTEND_MODERNIZATION.md aktualisiert (alle Phasen dokumentiert)

---

## MCP-Server (eingerichtet)

### shadcn/ui MCP

- **Konfiguriert in:** `.mcp.json`
- **Verwendung:** Components browsen, suchen und installieren per Natural Language
- **Beispiele:**
  - "Installiere die shadcn Button und Dialog Components"
  - "Zeige mir alle verfuegbaren shadcn Form Components"
  - "Welche shadcn Components gibt es fuer Data Display?"

### Context7 MCP

- **Konfiguriert in:** `.mcp.json`
- **Verwendung:** Aktuelle Doku fuer React 19, Tailwind v4, shadcn/ui direkt im Prompt
- **Beispiele:**
  - "use context7 fuer React 19 useOptimistic Hook"
  - "use context7 fuer Tailwind CSS v4 dark mode"
  - "use context7 fuer shadcn Dialog Component"

---

## Migrations-Checkliste pro Feature

Fuer jedes Feature-Modul:

- [ ] CSS-Datei analysieren, alle verwendeten Klassen dokumentieren
- [ ] JS/JSX zu TSX konvertieren (Typen hinzufuegen)
- [ ] Custom CSS durch Tailwind-Klassen ersetzen
- [ ] Native HTML-Elemente durch shadcn Components ersetzen
- [ ] Dark + Light Theme testen
- [ ] Formulare auf React Hook Form + Zod umstellen
- [ ] Tests aktualisieren
- [ ] Alte CSS-Datei loeschen
- [ ] Visuell vergleichen (vorher/nachher)

---

## Abhaengigkeiten (neu)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.x",
    "zod": "^3.x",
    "@hookform/resolvers": "^3.x",
    "tailwind-merge": "^2.x",
    "clsx": "^2.x",
    "class-variance-authority": "^0.7.x",
    "@radix-ui/react-dialog": "^1.x",
    "@radix-ui/react-select": "^2.x",
    "@radix-ui/react-dropdown-menu": "^2.x",
    "@radix-ui/react-popover": "^1.x",
    "@radix-ui/react-tooltip": "^1.x",
    "@radix-ui/react-switch": "^1.x",
    "@radix-ui/react-tabs": "^1.x",
    "@radix-ui/react-scroll-area": "^1.x",
    "@radix-ui/react-alert-dialog": "^1.x",
    "@radix-ui/react-context-menu": "^2.x",
    "@radix-ui/react-separator": "^1.x",
    "@radix-ui/react-toggle": "^1.x",
    "@radix-ui/react-progress": "^1.x",
    "lucide-react": "^0.x"
  },
  "devDependencies": {
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^4.x",
    "@tailwindcss/vite": "^4.x",
    "typescript": "^5.x",
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "vitest": "^3.x",
    "@testing-library/react": "^16.x",
    "@testing-library/jest-dom": "^6.x",
    "@testing-library/user-event": "^14.x"
  }
}
```

**Hinweis:** Die exakten Radix-UI Pakete werden durch `npx shadcn@latest add <component>` automatisch installiert. Die obige Liste dient nur als Uebersicht.

---

## Reihenfolge (Empfohlen)

```
Phase 0.1: CRA -> Vite         (Grundlage fuer alles)
Phase 0.2: React 19             (Neue Features verfuegbar)
Phase 0.3: Tailwind CSS          (Styling-Foundation)
Phase 0.4: shadcn/ui Init        (Component-Library bereit)
Phase 0.5: TypeScript Basics     (Neue Dateien in TS)
Phase 1:   Shared UI Components  (Basis fuer Feature-Migration)
Phase 2:   Settings              (Einfachstes Feature, Patterns etablieren)
Phase 3:   Store                 (Karten, Modals - mittlere Komplexitaet)
Phase 4:   System                (Tabellen, Wizards)
Phase 5:   Telegram              (Formulare, Wizards)
Phase 6:   Documents             (Upload, Listen)
Phase 7:   Datentabellen         (Komplex: Virtualisierung)
Phase 8:   Chat                  (Komplex: Streaming, Markdown)
Phase 9:   Database + Claude     (Restliche Features)
Phase 10:  Cleanup               (Alte Dateien, volle TS-Migration)
```

---

## Quellen

- [shadcn/ui Dokumentation](https://ui.shadcn.com)
- [shadcn/ui MCP Server](https://ui.shadcn.com/docs/mcp)
- [Context7 MCP](https://context7.com/)
- [Vite Installation Guide](https://ui.shadcn.com/docs/installation/vite)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [React 19 Features](https://react.dev/blog/2024/12/05/react-19)
- [CRA zu Vite Migration](https://dev.to/solitrix02/goodbye-cra-hello-vite-a-developers-2026-survival-guide-for-migration-2a9f)
