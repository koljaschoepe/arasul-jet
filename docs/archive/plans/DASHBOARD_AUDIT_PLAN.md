# Dashboard Audit - Detaillierter Fix-Plan

**Datum:** 2026-02-23
**Analysiert von:** 12 parallele Agents (Pages, CSS, Sidebar, Tables, Buttons, Modals, Cards, Error/Loading, Responsive, API-Calls, Typography, Backend)

---

## Zusammenfassung der Analyse

| Kategorie                        | Gefundene Probleme                                          | Schweregrad |
| -------------------------------- | ----------------------------------------------------------- | ----------- |
| CSS-Variablen & Hardcoded Values | 1.900+ hardcodierte Werte                                   | KRITISCH    |
| Button/Form-Inkonsistenz         | 6+ verschiedene Button-Systeme                              | HOCH        |
| Tabellen/Listen-Inkonsistenz     | 4 verschiedene Badge-Systeme, 3 Pagination-Muster           | HOCH        |
| Card-Styling-Inkonsistenz        | Verschiedene Backgrounds, Radii, Padding, Shadows           | MITTEL      |
| Modal/Dialog-Inkonsistenz        | MarkdownEditor ohne Modal-Component, dupliziertes CSS       | MITTEL      |
| Error/Loading-States             | 8 Components zeigen rohe err.message, Skeletons ungenutzt   | HOCH        |
| Responsive Design                | Inkonsistente Breakpoints, Settings-Sidebar bricht nicht um | MITTEL      |
| API-Call-Muster                  | Gemischtes axios/fetch, fehlende AbortController            | HOCH        |
| Typografie                       | 895 hardcodierte font-size-Werte, doppelte Naming-Systeme   | MITTEL      |
| Backend-API                      | Fehlende Auth auf Endpoints, fehlende Telegram-Routen       | KRITISCH    |
| Navigation                       | Versteckte Routen (Database, Claude Code) nicht in Sidebar  | NIEDRIG     |
| Dead Code                        | Ungenutzte States in ChatMulti                              | NIEDRIG     |

---

## Phase 1: Backend-API-Fixes (Sicherheit & Funktionalitat)

### 1.1 Fehlende Auth-Middleware auf Endpoints

**Schweregrad:** KRITISCH
**Dateien:**

- `apps/dashboard-backend/src/routes/services.js`
- `apps/dashboard-backend/src/routes/workflows.js`

**Problem:** Folgende Endpoints sind ohne `requireAuth` zuganglich:

- `GET /api/services` - Listet Service-Status ohne Auth
- `GET /api/services/ai` - AI/GPU-Info ohne Auth
- `GET /api/services/llm/models` - Modell-Liste ohne Auth
- `GET /api/services/llm/models/:name` - Modell-Details ohne Auth
- `ALL /api/workflows/*` - Alle Workflow-Routen ohne Auth

**Fix:** `requireAuth` Middleware zu allen oben genannten Routen hinzufugen.

### 1.2 Fehlende Telegram-Bot Model-Endpoints

**Schweregrad:** HOCH
**Dateien:**

- `apps/dashboard-backend/src/routes/telegramBots.js`
- Frontend: `components/TelegramBots/BotSetupWizard.js` (Zeilen 441-442)

**Problem:** Frontend ruft `/api/telegram-bots/models/ollama` und `/api/telegram-bots/models/claude` auf, aber diese Routen existieren nicht im Backend (404).

**Fix:** Endpoints in `telegramBots.js` implementieren, die verfugbare Modelle aus Ollama/Claude zuruckgeben.

### 1.3 Duplizierte Password-Requirements-Endpoints

**Schweregrad:** NIEDRIG
**Dateien:**

- `routes/auth.js` (Zeile 305)
- `routes/settings.js`

**Problem:** Gleiche Funktionalitat unter `/api/auth/password-requirements` und `/api/settings/password-requirements`.

**Fix:** Einen Endpoint entfernen, den anderen als Redirect behalten.

### 1.4 Inkonsistente HTTP-Statuscodes

**Schweregrad:** NIEDRIG
**Datei:** `routes/telegramBots.js`

**Problem:** POST-Endpoints mischen 200 und 201 fur Erstellungsoperationen.

**Fix:** Alle POST-Create-Endpoints auf `res.status(201)` umstellen.

---

## Phase 2: Frontend Error/Loading-State-Vereinheitlichung

### 2.1 Rohe Error-Messages ersetzen

**Schweregrad:** HOCH
**Betroffene Dateien (8 Components):**

- `components/TelegramBots/CommandsEditor.js` (Zeilen 86, 127, 150, 172)
- `components/TelegramBots/BotDetailsModal.js` (Zeilen 160, 186)
- `components/ModelStore.js` (Zeilen 91, 192, 222, 241)
- `components/Store/StoreModels.js` (Zeilen 103, 195)
- `components/TelegramAppModal.js` (Zeilen 99, 129)
- `components/Store/StoreHome.js` (Zeile 117)

**Problem:** `toast.error(err.message)` zeigt technische Fehlermeldungen (z.B. "Network timeout", "CORS error") statt benutzerfreundlicher deutscher Texte.

**Fix:** Jedes `err.message` durch freundliche deutsche Fehlermeldungen ersetzen:

```js
// Vorher
catch (err) { toast.error(err.message); }

// Nachher
catch (err) {
  console.error('Laden fehlgeschlagen:', err);
  toast.error('Fehler beim Laden der Daten. Bitte versuchen Sie es spater erneut.');
}
```

### 2.2 Fehlende Error-UI in Components

**Schweregrad:** MITTEL
**Betroffene Dateien (12 Components):**

- `components/ClaudeCode.js` - Error-State deklariert aber kein sichtbares Error-UI
- `components/ClaudeTerminal.js` - Stille Fehler
- `components/ChatMulti.js` - Error-State (Zeile 32) nicht sichtbar gerendert
- `components/Database/DatabaseOverview.js` - Custom `dt-error-message` statt Design-System
- `components/SelfHealingEvents.js` - Error-State mit eingeschranktem UI-Feedback
- `components/TelegramBots/BotSetupWizard.js` - Custom Error-Rendering
- `components/PasswordManagement.js` - Custom message-State statt error-State
- `components/Store/StoreModels.js` - Unklares Error-Rendering
- `components/ExcelEditor.js` - Mehrere Error-States ohne klares UI

**Fix:** Alle Components sollten entweder `toast.error()` oder ein gestyltes inline Error-Element verwenden. Einheitliches Muster:

```jsx
{
  error && (
    <div className="error-banner">
      <FiAlertCircle />
      <span>{error}</span>
      <button onClick={() => setError(null)}>
        <FiX />
      </button>
    </div>
  );
}
```

### 2.3 Skeleton-Components nutzen

**Schweregrad:** MITTEL
**Betroffene Dateien:**

- `components/Skeleton.js` - Existiert mit 13 Skeleton-Varianten, aber kaum genutzt
- `components/ContentTransition.js` - Nur 1 Component nutzt es (UpdatePage)
- `hooks/useMinLoadingTime.js` - Nur 1 Component nutzt es

**Problem:** Umfangreiches Skeleton-System existiert, wird aber in nur 2 von 53 Components verwendet.

**Fix:** Skeleton-Loading in folgende Components einbauen:

- `DocumentManager.js` -> `SkeletonDocumentList`
- `ChatMulti.js` -> `SkeletonChat`
- `DatabaseOverview.js` -> `SkeletonCard` Grid
- `Settings.js` -> `SkeletonCard` fur Sections
- `AppStore.js` -> `SkeletonCard` Grid
- `SelfHealingEvents.js` -> `SkeletonList`

### 2.4 EmptyState-Component nutzen

**Schweregrad:** NIEDRIG
**Problem:** `EmptyState` Component existiert, wird aber nur in 3 von 53 Components verwendet.

**Fix:** EmptyState in alle daten-ladenden Components einbauen, die leere Listen anzeigen konnen.

---

## Phase 3: API-Call-Standardisierung

### 3.1 axios durch fetch ersetzen

**Schweregrad:** HOCH
**Betroffene Dateien (15 Files mit axios):**

- `components/ChatMulti.js` - Verwendet BEIDES (axios + fetch)!
- `components/DocumentManager.js`
- `components/Login.js`
- `contexts/AuthContext.js`
- `components/ClaudeCode.js`
- `App.js`
- `components/SelfHealingEvents.js`
- `components/AppDetailModal.js`
- `components/AppStore.js`
- `components/MarkdownCreateDialog.js`
- `components/Store/Store.js`
- `components/Store/StoreApps.js`
- `components/DataTableEditor.js`
- `components/Database/DatabaseOverview.js`
- `components/Database/ExcelEditor.js`

**Problem:** Projekt-Standard ist `fetch` (laut CLAUDE.md), aber 15 Files nutzen `axios`. ChatMulti.js mischt sogar beide im selben Component.

**Fix:** Schrittweise axios-Aufrufe durch fetch + `getAuthHeaders()` ersetzen. Prioritat:

1. `ChatMulti.js` (mischt beide)
2. `Login.js` / `AuthContext.js` (Auth-kritisch)
3. Rest alphabetisch

### 3.2 Fehlende AbortController

**Schweregrad:** MITTEL
**Betroffene Dateien (6 Components):**

- `contexts/AuthContext.js` - `checkAuth()` nicht abbrechbar
- `components/PasswordManagement.js` - `changePassword()` ohne Signal
- `components/TelegramAppModal.js` - useEffect ohne AbortController
- `components/AppDetailModal.js` - Logs laden ohne AbortController
- `components/ClaudeCode.js` - Workspace-Operationen ohne AbortController
- `components/SimpleTableCreateDialog.js` - Fetch ohne Cleanup

**Fix:** AbortController mit Cleanup in useEffect fur alle async-Operationen:

```js
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  return () => controller.abort();
}, [deps]);
```

### 3.3 Dead Code in ChatMulti entfernen

**Schweregrad:** NIEDRIG
**Datei:** `components/ChatMulti.js`

**Problem:**

- `favoriteModels` State (Zeilen 44-50) - Geladen aus localStorage, nie im UI gerendert
- `matchedSpaces` State (Zeile 56) - Gesetzt aber nie im JSX verwendet

**Fix:** Beide States und zugehorige Logik entfernen.

---

## Phase 4: Button/Form-Vereinheitlichung

### 4.1 Button-Klassen konsolidieren

**Schweregrad:** HOCH
**Problem:** 6+ verschiedene Button-Naming-Systeme:

- `.btn .btn-primary` (AppStore, Modal)
- `.claude-btn .claude-btn-primary` (ClaudeCode)
- `.yaml-btn .yaml-btn-primary` (DataTableEditor)
- `.setup-btn .setup-btn-primary` (SetupWizard)
- `.submit-button` (PasswordManagement, Settings)
- `.login-button` (Login)

**Fix:** Alle auf das `.btn .btn-primary/.btn-secondary/.btn-danger` System standardisieren. Component-spezifische Klassen als Zusatz erlaubt, aber Basis-Styling muss von `.btn` kommen.

**Betroffene CSS-Dateien:**

- `appstore.css` (Zeilen 349-376) - Bereits korrekt
- `claudecode.css` (Zeilen 121-164) - `.claude-btn` -> `.btn`
- `components/Login.css` (Zeilen 107-145) - `.login-button` -> `.btn .btn-primary`
- `settings.css` (Zeilen 599-639) - `.submit-button` -> `.btn .btn-primary`
- `components/Database/Database.css` - `.yaml-btn` -> `.btn`

### 4.2 Fehlende type="button" Attribute

**Schweregrad:** MITTEL
**Betroffene Dateien:**

- `components/AppDetailModal.js` (20+ Buttons ohne type)
- `components/AppStore.js` (Zeilen 253, 265, 273, 315)
- `components/ErrorBoundary.js`
- `components/MarkdownCreateDialog.js` (Zeile 120)

**Fix:** Alle `<button>` ohne `type` Attribut mit `type="button"` versehen (ausser Submit-Buttons in Forms).

### 4.3 Fehlende Form-Labels

**Schweregrad:** MITTEL
**Betroffene Dateien (37+ Inputs ohne Labels):**

- `AppStore.js` Zeile 377 - Search-Input ohne Label
- `ChatMulti.js` Zeile 1317 - Input ohne Label
- `ClaudeCode.js` Zeilen 183, 195, 209 - Inputs ohne Labels
- `DocumentManager.js` Zeilen 784, 848 - Inputs ohne Labels

**Fix:** Zu jedem `<input>` ein zugehoriges `<label>` oder `aria-label` hinzufugen.

### 4.4 Button-Hover/Active-States vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:** Verschiedene Hover-Effekte (scale, translateY, shadow, background-change) pro Component.

**Fix:** Einheitliches Hover-Pattern in `index.css` definieren:

```css
.btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.btn:active {
  transform: translateY(0);
}
```

---

## Phase 5: Card-Styling-Vereinheitlichung

### 5.1 Card-Backgrounds standardisieren

**Schweregrad:** MITTEL
**Problem:**

- Dashboard/Settings Cards: `var(--gradient-card)`
- Store Cards: `var(--bg-card)` (solid statt Gradient)
- Service Items: `var(--primary-alpha-5)` (abweichend)

**Fix:** Alle Cards auf `var(--gradient-card)` umstellen:

- `components/Store/Store.css` - `.model-card`, `.app-card`, `.store-home-card`
- `index.css` - `.service-item-modern`

### 5.2 Card Border-Radius vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:**

- Die meisten Cards: `var(--radius-xl)` (16px)
- Service Items: `var(--radius-md)` (8px)
- Settings Cards: `var(--radius-lg)` (12px)

**Fix:** Alle auf `var(--radius-xl)` standardisieren.

### 5.3 Card-Padding vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:** Padding variiert von `0.875rem` bis `1.75rem` je nach Card-Typ.

**Fix:** Einheitliches Padding: `1.5rem` fur Standard-Cards, `1.75rem` fur grosse Dashboard-Cards.

### 5.4 Card-Shadow vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:**

- Dashboard Cards: `var(--shadow-md)` -> `var(--shadow-lg)` on hover
- Settings Cards: `var(--shadow-sm)` -> `var(--shadow-md)`
- Store Cards: Kein Base-Shadow

**Fix:** Einheitlich `var(--shadow-sm)` Base, `var(--shadow-lg)` Hover.

---

## Phase 6: Tabellen/Listen-Vereinheitlichung

### 6.1 Status-Badge-System konsolidieren

**Schweregrad:** HOCH
**Problem:** 4 verschiedene Badge-Implementierungen:

- `.status-badge` + `.status-pending/.status-indexed/.status-failed` (DocumentManager)
- `.severity-badge` + `.severity-info/.severity-warning/.severity-critical` (SelfHealingEvents)
- `.badge-status` + `.badge-${status}` (AppStore)
- Inline-Badges (diverse Components)

**Fix:** Einheitliches Badge-System in `index.css`:

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
}
.badge-success {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success-color);
}
.badge-warning {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning-color);
}
.badge-danger {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger-color);
}
.badge-info {
  background: var(--primary-alpha-12);
  color: var(--primary-color);
}
.badge-neutral {
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-muted);
}
```

Alle Components auf dieses System migrieren.

### 6.2 Loading-State-Pattern vereinheitlichen

**Schweregrad:** MITTEL
**Problem:** 3 verschiedene Loading-Strukturen:

- `.dm-loading` (DocumentManager)
- `.excel-loading` (ExcelEditor)
- `.loading-spinner` (SelfHealingEvents)

**Fix:** Alle auf `<LoadingSpinner />` oder `<SkeletonXxx />` Component umstellen.

### 6.3 Empty-State-Pattern vereinheitlichen

**Schweregrad:** MITTEL
**Problem:** 3 verschiedene Empty-State-Ansatze (Component, div, table-cell).

**Fix:** Alle auf `<EmptyState icon={} title="" description="" />` Component umstellen.

### 6.4 Pagination vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:** 3 verschiedene Pagination-Layouts (`.dm-pagination`, `.excel-pagination-controls`, `.yaml-pagination`).

**Fix:** Einheitliches Pagination-CSS erstellen, alle Components darauf umstellen.

### 6.5 Table-Header-Styling vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:** Verschiedene Header-Backgrounds: `var(--bg-table-header)` vs `var(--primary-alpha-5)` vs `transparent`.

**Fix:** Alle auf `var(--bg-table-header)` standardisieren.

---

## Phase 7: CSS-Variable-Migration (Grosstes Volumen)

### 7.1 Doppeltes Font-Size-Naming-System auflosen

**Schweregrad:** HOCH
**Datei:** `index.css`

**Problem:** Zwei parallele Font-Size-Systeme definiert:

- `--text-2xs` bis `--text-4xl` (Zeilen 66-76)
- `--font-xs` bis `--font-3xl` (Zeilen 234-241)

**Fix:** `--font-*` Variablen entfernen, ausschliesslich `--text-*` verwenden. Alle Referenzen aktualisieren.

### 7.2 Fehlende Alpha-Variablen erstellen

**Schweregrad:** MITTEL
**Datei:** `index.css`

**Problem:** `--primary-alpha-*` existiert, aber fur Danger/Warning/Success fehlen Alpha-Varianten. Deshalb werden 242+ `rgba(...)` Werte hardcodiert.

**Fix:** Neue Variablen hinzufugen:

```css
--danger-alpha-10: rgba(239, 68, 68, 0.1);
--danger-alpha-15: rgba(239, 68, 68, 0.15);
--warning-alpha-10: rgba(245, 158, 11, 0.1);
--warning-alpha-15: rgba(245, 158, 11, 0.15);
--success-alpha-10: rgba(34, 197, 94, 0.1);
--success-alpha-15: rgba(34, 197, 94, 0.15);
```

### 7.3 Hardcodierte RGBA-Farben migrieren

**Schweregrad:** MITTEL (grosses Volumen - 242+ Stellen)
**Betroffene Dateien (nach Prioritat):**

1. `documents.css` - 70+ hardcodierte RGBA-Farben
2. `chatmulti.css` - 80+ hardcodierte RGBA-Farben
3. `claudecode.css` - 100+ hardcodierte RGBA-Farben
4. `appstore.css` - 20+ hardcodierte RGBA-Farben
5. `settings.css` - 15+ hardcodierte RGBA-Farben

**Fix:** Schrittweise `rgba(239, 68, 68, 0.1)` -> `var(--danger-alpha-10)` etc. ersetzen.

### 7.4 Hardcodierte Padding/Margin auf CSS-Variablen umstellen

**Schweregrad:** NIEDRIG (958 Stellen - langfristiges Ziel)
**Problem:** 783 hardcodierte Padding- und 175 hardcodierte Margin-Werte.

**Fix:** Dies ist ein langfristiges Refactoring-Ziel. Schrittweise die haufigsten Werte ersetzen:

- `0.5rem` -> `var(--space-sm)`
- `1rem` -> `var(--space-md)`
- `1.5rem` -> `var(--space-lg)`
- `2rem` -> `var(--space-xl)`

### 7.5 Hardcodierte Font-Sizes migrieren

**Schweregrad:** NIEDRIG (895 Stellen - langfristiges Ziel)
**Problem:** 895 hardcodierte font-size-Werte statt CSS-Variablen.

**Fix:** Wie 7.4, schrittweise die haufigsten Werte ersetzen.

---

## Phase 8: Modal/Dialog-Vereinheitlichung

### 8.1 SpaceModal CSS-Duplikate entfernen

**Schweregrad:** MITTEL
**Datei:** `space-modal.css` (382 Zeilen)

**Problem:** `space-modal.css` dupliziert viele Styles aus `Modal.css`. `.space-modal-overlay`, `.space-modal-header`, `.space-modal-body`, `.space-modal-footer` sind Kopien der Modal-Basis-Klassen.

**Fix:** SpaceModal auf Modal.css Basis-Klassen umstellen, nur Overrides in space-modal.css behalten.

### 8.2 MarkdownEditor Accessibility

**Schweregrad:** MITTEL
**Datei:** `components/MarkdownEditor.js`

**Problem:** Nutzt NICHT die Modal-Component. Fehlt:

- Kein Focus-Trap
- Keine ARIA-Attribute
- Kein ESC-Key-Handler
- Keine Scroll-Prevention

**Fix:** MarkdownEditor auf Modal-Component umstellen oder Accessibility-Features manuell hinzufugen.

### 8.3 AppDetailModal Styles extrahieren

**Schweregrad:** NIEDRIG
**Datei:** `appstore.css` (1836 Zeilen)

**Problem:** AppDetailModal-Styles sind in `appstore.css` statt in einer eigenen CSS-Datei.

**Fix:** Modal-spezifische Styles in `AppDetailModal.css` auslagern.

---

## Phase 9: Responsive-Design-Fixes

### 9.1 Settings-Sidebar Tablet-Breakpoint

**Schweregrad:** MITTEL
**Datei:** `settings.css`

**Problem:** Settings-Sidebar (280px) kollapiert erst bei 1024px. Bei 769-1024px (Tablet) bleiben nur ~450px fur Content.

**Fix:** Breakpoint bei 900px hinzufugen, der die Sidebar uber den Content legt oder kollapiert.

### 9.2 Form-Input-Overflow auf kleinen Screens

**Schweregrad:** MITTEL
**Datei:** `components/Database/Database.css`

**Problem:** Search-Input `max-width: 400px` kann auf 375px-Screens uberlaufen.

**Fix:** Media-Query bei 576px hinzufugen: `max-width: 100%`.

### 9.3 Statische Grid-Spalten durch auto-fit ersetzen

**Schweregrad:** NIEDRIG
**Betroffene Dateien:**

- `index.css` Zeile 2751 - `.resources-grid` hat statisch 4 Spalten
- `documents.css` Zeile 20 - `.dm-stats-row` hat statisch 4 Spalten

**Fix:** `repeat(4, 1fr)` durch `repeat(auto-fit, minmax(240px, 1fr))` ersetzen.

### 9.4 Nav-Bar Scroll-Indikator bei 1024px

**Schweregrad:** NIEDRIG
**Datei:** `index.css`

**Problem:** Bei <=1024px wird Sidebar zur horizontalen Nav-Bar, Scrollbar ist versteckt. User wissen nicht, dass gescrollt werden kann.

**Fix:** Scroll-Indicator (Gradient-Fade am Rand) oder sichtbare Scroll-Hints hinzufugen.

---

## Phase 10: Typografie-Vereinheitlichung

### 10.1 Icon-Size-System definieren

**Schweregrad:** NIEDRIG
**Problem:** Keine standardisierten Icon-Grossen. Mixed: `size={32}`, `size={48}`, CSS `width: 14px/18px`, `font-size: 1.25rem/1.75rem/2.5rem`.

**Fix:** Icon-Size-Scale in CSS-Variablen definieren:

```css
--icon-xs: 14px;
--icon-sm: 16px;
--icon-md: 20px;
--icon-lg: 24px;
--icon-xl: 32px;
--icon-2xl: 48px;
```

### 10.2 Page-Title-Styling vereinheitlichen

**Schweregrad:** NIEDRIG
**Problem:** Jede Seite implementiert ihren eigenen Page-Header:

- Dashboard: `.dashboard-card-title`
- Settings: `.settings-section-title` (2rem)
- Documents: `.dm-stat-card`
- AppStore: `.appstore-title h1` (1.75rem)
- ClaudeCode: `.claude-code-title` (2rem)

**Fix:** Einheitliches `.page-header` / `.page-title` CSS erstellen und uber alle Seiten anwenden.

---

## Priorisierte Reihenfolge

| Phase                            | Aufwand | Impact   | Empfehlung          |
| -------------------------------- | ------- | -------- | ------------------- |
| **Phase 1** (Backend-Sicherheit) | Klein   | KRITISCH | Sofort umsetzen     |
| **Phase 2** (Error/Loading)      | Mittel  | HOCH     | Diese Woche         |
| **Phase 3** (API-Calls)          | Mittel  | HOCH     | Diese Woche         |
| **Phase 4** (Buttons/Forms)      | Mittel  | HOCH     | Nachste Woche       |
| **Phase 5** (Cards)              | Klein   | MITTEL   | Nachste Woche       |
| **Phase 6** (Tabellen/Listen)    | Mittel  | HOCH     | Nachste Woche       |
| **Phase 7** (CSS-Variablen)      | Gross   | MITTEL   | Sprint 2 (iterativ) |
| **Phase 8** (Modals)             | Klein   | MITTEL   | Sprint 2            |
| **Phase 9** (Responsive)         | Klein   | MITTEL   | Sprint 2            |
| **Phase 10** (Typografie)        | Klein   | NIEDRIG  | Sprint 3            |

---

## Betroffene Dateien (Gesamtubersicht)

### Frontend (40+ Dateien)

**CSS-Dateien (Hauptarbeit):**

- `src/index.css` - Design-System-Variablen, Light-Mode, Layouts
- `src/chatmulti.css` - 2.100+ Zeilen, 80+ hardcodierte RGBA
- `src/documents.css` - 1.630 Zeilen, 70+ hardcodierte RGBA
- `src/claudecode.css` - 1.700+ Zeilen, 100+ hardcodierte RGBA
- `src/appstore.css` - 900+ Zeilen
- `src/settings.css` - 600+ Zeilen
- `src/space-modal.css` - 382 Zeilen (Duplikate)
- `src/markdown-editor.css` - Modal-Styling
- `src/components/Modal.css`
- `src/components/Login.css`
- `src/components/SelfHealingEvents.css`
- `src/components/UpdatePage.css`
- `src/components/Database/Database.css`
- `src/components/Store/Store.css`
- `src/components/TelegramAppModal.css`
- `src/components/TelegramBots/TelegramBots.css`

**JS/JSX-Dateien (Logic-Fixes):**

- `src/App.js` - DashboardHome, Sidebar
- `src/components/ChatMulti.js` - Dead Code, axios->fetch
- `src/components/DocumentManager.js` - axios->fetch
- `src/components/Login.js` - axios->fetch
- `src/components/ClaudeCode.js` - AbortController, axios->fetch
- `src/components/Settings.js` - Error-UI
- `src/components/ModelStore.js` - Error-Messages
- `src/components/AppStore.js` - axios->fetch
- `src/components/AppDetailModal.js` - type Attribute, AbortController
- `src/components/MarkdownEditor.js` - Accessibility
- `src/components/MarkdownCreateDialog.js` - axios->fetch
- `src/components/SelfHealingEvents.js` - axios->fetch
- `src/components/PasswordManagement.js` - AbortController
- `src/components/SimpleTableCreateDialog.js` - AbortController
- `src/components/DataTableEditor.js` - axios->fetch
- `src/components/Database/DatabaseOverview.js` - axios->fetch
- `src/components/Database/ExcelEditor.js` - axios->fetch
- `src/components/Store/Store.js` - axios->fetch
- `src/components/Store/StoreApps.js` - axios->fetch
- `src/components/Store/StoreModels.js` - Error-Messages
- `src/components/Store/StoreHome.js` - Error-Messages
- `src/components/TelegramAppModal.js` - AbortController, Error-Messages
- `src/components/TelegramBots/CommandsEditor.js` - Error-Messages
- `src/components/TelegramBots/BotDetailsModal.js` - Error-Messages
- `src/components/TelegramBots/BotSetupWizard.js`
- `src/components/SpaceModal.js`
- `src/contexts/AuthContext.js` - AbortController, axios->fetch
- `src/components/ErrorBoundary.js` - type Attribute

### Backend (5 Dateien)

- `src/routes/services.js` - Auth-Middleware
- `src/routes/workflows.js` - Auth-Middleware
- `src/routes/telegramBots.js` - Fehlende Endpoints, Status-Codes
- `src/routes/auth.js` - Duplizierter Endpoint
- `src/routes/settings.js` - Duplizierter Endpoint
