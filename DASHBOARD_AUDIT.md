# Dashboard Audit - Umfassende Analyse & Behebungsplan

**Datum:** 2026-02-23
**Scope:** Frontend Dashboard (services/dashboard-frontend/src/)
**Methode:** 12 parallele Analyse-Agents

---

## Inhaltsverzeichnis

1. [Zusammenfassung der Probleme](#1-zusammenfassung)
2. [Kategorie A: Logik- & Feature-Fehler](#2-kategorie-a-logik--feature-fehler)
3. [Kategorie B: Design-Inkonsistenzen](#3-kategorie-b-design-inkonsistenzen)
4. [Kategorie C: API & Datenfluss](#4-kategorie-c-api--datenfluss)
5. [Behebungsplan (priorisiert)](#5-behebungsplan)

---

## 1. Zusammenfassung

| Kategorie        | Kritisch | Hoch   | Mittel | Niedrig | Gesamt |
| ---------------- | -------- | ------ | ------ | ------- | ------ |
| Logik & Features | 3        | 5      | 6      | 4       | **18** |
| Design & UI      | 2        | 8      | 12     | 5       | **27** |
| API & Datenfluss | 2        | 4      | 5      | 2       | **13** |
| **Gesamt**       | **7**    | **17** | **23** | **11**  | **58** |

---

## 2. Kategorie A: Logik- & Feature-Fehler

### A1. KRITISCH: `Promise.all()` bricht Dashboard bei einzelnem API-Fehler

- **Datei:** `App.js:226-236`
- **Problem:** 7+ API-Aufrufe via `Promise.all()` - schlaegt einer fehl, wird das gesamte Dashboard nicht geladen
- **Fix:** Umstellen auf `Promise.allSettled()` mit partieller Datenanzeige

### A2. KRITISCH: Fehlende Null-Safety in `formatChartData`

- **Datei:** `App.js:327-339`
- **Problem:** `metricsHistory.timestamps.map()` crasht wenn `timestamps`, `cpu`, `ram`, `gpu` oder `temperature` fehlen
- **Fix:** Defensive Checks vor dem Mapping einfuegen

### A3. KRITISCH: Modals ohne ESC-Key-Handler

- **Dateien:**
  - `SpaceModal.js:179` - KEIN ESC-Handler
  - `BotDetailsModal.js:484` - KEIN ESC-Handler
  - `AppDetailModal.js:153` - KEIN ESC-Handler
- **Problem:** Nur `Modal.js` implementiert ESC-Key + Focus-Trap; alle Custom-Modals fehlen
- **Fix:** Custom-Modals auf `<Modal>` Komponente umstellen oder ESC-Handler nachrüsten

### A4. HOCH: Ungenutzte State-Variablen mit API-Aufrufen

- **Datei:** `App.js:129, 132, 140`
- **Problem:** `systemStatus`, `workflows`, `telegramAppData` werden per API geladen, aber nie im JSX gerendert
- **Fix:** Entweder entfernen (spart 3 API-Calls) oder Features implementieren

### A5. HOCH: App-URL-Fallback gibt `#` zurueck

- **Datei:** `App.js:823`
- **Problem:** `getAppUrl()` gibt `'#'` zurueck wenn kein Port bekannt - toter Link
- **Fix:** Fallback-UI mit "Nicht verfuegbar"-Badge statt klickbarem Link

### A6. HOCH: Fehlende Toast-Benachrichtigungen bei Aktionen

- **Dateien:**
  - `ClaudeCode.js:72-78` - Workspace erstellt: KEIN Success-Toast
  - `ClaudeCode.js:101-102` - Default-Workspace setzen: KEIN Feedback
  - `DataTable/ColumnMenu.js:61, 84, 107` - Spalten-Ops: KEIN Success-Feedback
  - `TelegramBots/CommandsEditor.js:82, 122` - Command speichern: KEIN Toast
  - `ClaudeTerminal.js:82` - Verlauf loeschen: KEIN Success-Feedback
- **Fix:** `toast.success()` nach erfolgreichen Mutationen einfuegen

### A7. HOCH: Doppelter Metrics-State (HTTP + WebSocket)

- **Datei:** `App.js:147, 239, 150-154`
- **Problem:** Metrics werden erst per HTTP geladen, dann sofort per WebSocket ueberschrieben - redundant
- **Fix:** WebSocket als primaere Quelle, HTTP nur als Fallback

### A8. HOCH: Service-Status hardcoded (nur 3 Services)

- **Datei:** `App.js:1054-1078`
- **Problem:** Nur LLM, Embeddings, Internet statisch gelistet - keine dynamische Service-Erkennung
- **Fix:** Services dynamisch aus API laden

### A9. MITTEL: Chart-Zeitraum nicht persistiert

- **Datei:** `App.js:769`
- **Problem:** `chartTimeRange` geht bei Seitenrefresh verloren
- **Fix:** In `localStorage` speichern (wie Sidebar-State)

### A10. MITTEL: Setup-Wizard Race Condition

- **Datei:** `App.js:272-290`
- **Problem:** Setup-Status nur einmal bei Login geprueft; kein Re-Check nach Wizard-Abschluss
- **Fix:** Status nach Wizard-Completion erneut pruefen

### A11. MITTEL: Keine Error-Recovery UI

- **Datei:** `App.js:383-396`
- **Problem:** Bei Fehlern nur `window.location.reload()` - kein Retry-Button
- **Fix:** Retry-Button mit `fetchData()` Aufruf

### A12. MITTEL: Fehlendes Loading-Skeleton fuer Service-Status

- **Datei:** `App.js:1049-1082`
- **Problem:** Service-Status erscheint abrupt ohne Lade-Animation
- **Fix:** Skeleton-Placeholder waehrend des Ladens

### A13. MITTEL: Mehrere ueberlappende Polling-Systeme

- **Dateien:** `App.js:261-269` (30s), `App.js:308-310` (60s), `useWebSocketMetrics.js:46-56` (5s)
- **Problem:** 3 unabhaengige Polling-Systeme ohne Koordination
- **Fix:** Zentralen Polling-Manager implementieren

### A14. MITTEL: Telegram "Verfuegbar" Typo

- **Datei:** `Store/StoreApps.js:62`
- **Problem:** "Verfuegbar" statt "Verfügbar" (fehlendes ue -> ü)
- **Fix:** Umlaut korrigieren

### A15. NIEDRIG: Chart nicht barrierefrei

- **Datei:** `App.js:978-1045`
- **Problem:** Kein `aria-label`, kein `role`, keine Textalternative fuer Screenreader
- **Fix:** `aria-label` und Datentabellen-Alternative hinzufuegen

### A16. NIEDRIG: Focus-Management nach Skip-to-Content

- **Datei:** `App.js:403-414`
- **Problem:** `tabIndex={-1}` auf Container verhindert Focus nach Skip-Navigation
- **Fix:** Focus programmatisch setzen

### A17. NIEDRIG: StoreApps Error-Status falsche Farbe

- **Datei:** `Store/StoreApps.js:68`
- **Problem:** Error-Status nutzt `--text-disabled` statt `--danger-color`
- **Fix:** Auf `--danger-color` umstellen

### A18. NIEDRIG: Conditional Rendering setzt State nicht zurueck

- **Datei:** `App.js:363-381`
- **Problem:** `error` State bleibt nach Recovery bestehen
- **Fix:** `setError(null)` bei erneutem `fetchData()`

---

## 3. Kategorie B: Design-Inkonsistenzen

### B1. KRITISCH: 5+ verschiedene Badge-Stylings

| Datei                       | Padding             | Border-Radius | Font-Size |
| --------------------------- | ------------------- | ------------- | --------- |
| `index.css:3531`            | `0.25rem 0.75rem`   | `9999px`      | `0.75rem` |
| `documents.css:477`         | `0.3rem 0.6rem`     | `6px`         | `0.75rem` |
| `appstore.css:241`          | `0.25rem 0.5rem`    | `6px`         | `0.7rem`  |
| `UpdatePage.css:606`        | `0.375rem 0.875rem` | `12px`        | `0.75rem` |
| `SelfHealingEvents.css:329` | `0.5rem 1rem`       | `16px`        | `0.75rem` |

**Fix:** Einheitliches Badge-System mit einer Basis-Klasse

### B2. KRITISCH: z-index Chaos ohne System

| z-index | Anzahl Dateien | Verwendung                    |
| ------- | -------------- | ----------------------------- |
| `1000`  | 12 Dateien     | Modals/Dropdowns (Konflikte!) |
| `9999`  | 1 (Modal.css)  | Modal Backdrop                |
| `10000` | 2 (index.css)  | Skip-to-Content               |

**Fix:** CSS-Variablen fuer z-index-Skala erstellen

### B3. HOCH: Inkonsistente Border-Radius (trotz definierter Skala)

- **Definiert:** `--radius-xs: 4px` bis `--radius-xl: 16px`
- **Gefunden:** 2px, 3px, 5px, 10px, 14px, 20px - alle NICHT in der Skala
- **Betroffene Dateien:** `chatmulti.css` (50+), `settings.css` (30+), `index.css` (40+), `documents.css` (10+)
- **Fix:** Alle Werte auf definierte `--radius-*` Variablen umstellen

### B4. HOCH: Inkonsistente Card-Stylings

| Karten-Typ      | Border-Radius | Padding        | Hover-Transform  | Transition        |
| --------------- | ------------- | -------------- | ---------------- | ----------------- |
| Stat Cards      | 16px          | 1.75rem        | translateY(-4px) | 0.3s cubic-bezier |
| Dashboard Cards | 16px          | 1.75rem        | translateY(-2px) | 0.3s cubic-bezier |
| Settings Cards  | 12px          | 1.5rem/1.75rem | translateY(-2px) | 0.25s ease        |
| Document Cards  | 12px          | 1rem/1.25rem   | translateY(-2px) | 0.15s ease        |
| Store Cards     | 16px          | 1.25rem        | translateY(-2px) | 0.25s ease        |

**Fix:** `.card-base` Klasse erstellen; border-radius auf 16px vereinheitlichen

### B5. HOCH: Inkonsistente Input-Felder

| Kontext             | Border  | Padding              | Background      | Border-Radius |
| ------------------- | ------- | -------------------- | --------------- | ------------- |
| Global              | 1px     | 0.5rem 0.875rem      | `--bg-dark`     | 8px           |
| Settings (Password) | **2px** | 0.875rem 3rem        | `--bg-elevated` | 8px           |
| Settings (Telegram) | **2px** | 0.875rem 1rem        | `--bg-elevated` | 8px           |
| Database            | 1px     | **0.625rem 0.75rem** | `--bg-dark`     | **0.5rem**    |
| Database Search     | 1px     | 0.625rem 2.5rem      | **`--bg-card`** | **0.5rem**    |

**Fix:** Alle Inputs auf `input-global` Klasse vereinheitlichen

### B6. HOCH: Inkonsistente Button-Groessen

| Kontext          | Padding          | Border-Radius    | Hover-Effekt     |
| ---------------- | ---------------- | ---------------- | ---------------- |
| Login            | 1rem             | 8px              | translateY(-2px) |
| Modal            | 0.625rem 1.25rem | 8px              | keiner           |
| Database         | 0.625rem 1rem    | **0.5rem (4px)** | keiner           |
| Settings Service | 1rem 1.5rem      | **10px**         | translateY(-2px) |
| Telegram Test    | 0.75rem 1.5rem   | 8px              | translateY(-2px) |
| Retry            | 0.875rem 2rem    | **10px**         | translateY(-2px) |

**Fix:** Button-Groessen-Skala definieren (sm, md, lg)

### B7. HOCH: Hardcoded Hex-Farben statt CSS-Variablen

- **MermaidDiagram.js:16-30** - 13 hardcoded Farben (`#45ADFF`, `#1A2330`, etc.)
- **Modal.css:170-224** - `#22C55E`, `#F59E0B`, `#EF4444`, `#000`, `#fff`
- **TelegramBots.css** - 7x `color: #000`
- **Database.css** - 2x `color: #000`
- **Login.css:103-104** - `#DC2626`
- **chatmulti.css:1147, 1169** - `#F59E0B`
  **Fix:** Alle durch `var(--*)` ersetzen

### B8. HOCH: Inkonsistente Modal-Stylings

| Modal           | Max-Width | Border-Radius | Animation        | ESC-Key  | z-index  |
| --------------- | --------- | ------------- | ---------------- | -------- | -------- |
| Modal.js        | 560px     | 12px          | slide-in 0.2s    | Ja       | 9999     |
| SpaceModal      | 550px     | **16px**      | slideUp **0.3s** | **Nein** | **1000** |
| BotDetailsModal | 700px     | 12px          | **Keine**        | **Nein** | **1000** |
| AppDetailModal  | unset     | unset         | **Keine**        | **Nein** | unset    |

**Fix:** Alle auf `<Modal>` Komponente migrieren

### B9. HOCH: Inkonsistente Tabellen-Stylings

| Tabelle         | Header-BG           | Cell-Padding | Hover-BG               | Hoehe        |
| --------------- | ------------------- | ------------ | ---------------------- | ------------ |
| DataTableEditor | `--bg-card`         | 0.75rem 1rem | rgba(69,173,255,0.03)  | auto         |
| ExcelEditor     | `--bg-card`         | 0            | rgba(69,173,255,0.03)  | **32px fix** |
| DocumentManager | `--bg-table-header` | 0.75rem 1rem | `--bg-table-row-hover` | auto         |

**Fix:** Einheitliche Tabellen-Basis-Klasse

### B10. HOCH: Box-Shadow Wildwuchs

- **80+ hardcoded Shadow-Werte** trotz definierter `--shadow-sm/md/lg/xl` Variablen
- Haeufigste: `0 4px 12px rgba(0,0,0,0.1/0.15/0.3)`, `0 8px 24px rgba(0,0,0,0.2/0.4)`
- **Fix:** Auf definierte Shadow-Variablen umstellen; ggf. `--shadow-glow-sm/lg` ergaenzen

### B11. MITTEL: Container-Padding/Max-Width inkonsistent

| Seite           | Padding                    | Max-Width  |
| --------------- | -------------------------- | ---------- |
| Dashboard       | `2rem` (fix)               | keins      |
| Settings        | `2rem` (fix)               | **900px**  |
| DocumentManager | `clamp(1rem, 2vw, 1.5rem)` | 1600px     |
| ChatMulti       | variabel                   | **1400px** |
| AppStore        | `clamp(1rem, 2vw, 1.5rem)` | 1600px     |

**Fix:** Einheitliches Container-Pattern mit responsive Padding

### B12. MITTEL: Inkonsistente Label-Styles

| Kontext  | Color                | Weight  | Size         | Margin-Bottom |
| -------- | -------------------- | ------- | ------------ | ------------- |
| Login    | `--text-secondary`   | 600     | 0.9rem       | 0.5rem        |
| Settings | **`--text-primary`** | 600     | 0.9rem       | **0.625rem**  |
| Database | `--text-secondary`   | **500** | **0.875rem** | -             |

**Fix:** Einheitliche `.form-label` Klasse

### B13. MITTEL: Spacing-Scale-Verletzungen

- **Definiert:** `--space-xs` bis `--space-2xl` (0.25rem bis 3rem)
- **Gefunden:** 100+ Werte ausserhalb der Skala (0.375rem, 0.625rem, 0.75rem, 0.875rem, 1.25rem, 1.75rem)
- **Fix:** Spacing-Scale erweitern oder Werte anpassen

### B14. MITTEL: Close-Button Styling in Modals

| Modal           | Groesse        | Hover-Farbe            | Border-Radius |
| --------------- | -------------- | ---------------------- | ------------- |
| Modal.js        | 32x32px        | rgba(255,255,255,0.1)  | 8px           |
| SpaceModal      | 0.5rem padding | **danger (rot)**       | unset         |
| BotDetailsModal | 0.5rem padding | rgba(255,255,255,0.05) | **6px**       |

**Fix:** Einheitlichen Close-Button erstellen

### B15. MITTEL: Inkonsistente Error-Message Displays

| Kontext  | Border  | Padding      | Border-Radius | Success-Farbe |
| -------- | ------- | ------------ | ------------- | ------------- |
| Login    | 1px     | 1rem         | 8px           | -             |
| Database | 1px     | **0.75rem**  | **0.5rem**    | -             |
| Password | **2px** | 1rem 1.25rem | 8px           | **Grau (!)**  |
| Telegram | **2px** | 1rem 1.25rem | 8px           | **Grau (!)**  |

**Fix:** `.form-message` Basis-Klasse; Success = Gruen, nicht Grau

### B16. MITTEL: Dokumentenstatus-Dots inkonsistent

- `.status-dot` = **8px**, `.status-indicator` = **10px** (gleicher Zweck, verschiedene Groessen)
- Shadow-Opazitaet: 0.4 vs 0.5
- **Fix:** Auf eine Groesse (10px) vereinheitlichen

### B17. MITTEL: Pagination inkonsistent

- DataTableEditor: Page-Size-Selector + Page-Input + First/Prev/Next/Last
- DocumentManager: Nur Prev/Next + Page-Indicator (kein Size-Selector!)
- **Fix:** DocumentManager-Pagination erweitern

### B18. MITTEL: Animations-Timing nicht einheitlich

- Cards: `0.15s` / `0.25s` / `0.3s` (drei verschiedene Werte)
- Modals: `0.2s` / `0.3s` / keine Animation
- Spinners: `1s linear` / `1.2s cubic-bezier`
- **Fix:** Auf definierte `--duration-*` Variablen umstellen

### B19. MITTEL: Seiten-Animationen inkonsistent

| Seite           | Animation       | Delay    |
| --------------- | --------------- | -------- |
| Container       | fadeIn 0.4s     | keine    |
| Stats Row       | fadeIn 0.5s     | keine    |
| Dashboard Cards | fadeIn 0.5s     | keine    |
| Service Links   | fadeIn **0.6s** | keine    |
| Settings        | fadeIn 0.4s     | **0.1s** |
| DocumentManager | **keine**       | -        |

**Fix:** Einheitliche Seiten-Uebergangsanimation

### B20-B27. NIEDRIG: Kleinere Inkonsistenzen

- Font-Size-Skala nicht definiert (0.65rem bis 1.25rem willkuerlich)
- Font-Weight-Skala nicht als Variablen definiert
- Hardcoded px-Werte statt rem in chatmulti.css (gap: 6px, 10px, 12px)
- Mobile Touch-Targets unter 44px Minimum
- Reduzierte-Bewegung (`prefers-reduced-motion`) nur in Modal.css
- Light-Mode nutzt anderen Primary-Farbton (#2196F3 statt #45ADFF)

---

## 4. Kategorie C: API & Datenfluss

### C1. KRITISCH: SpaceModal.js ohne Error-Handling

- **Datei:** `SpaceModal.js:105-117`
- **Problem:** fetch POST ohne try-catch, ohne auth headers - Silent Failures
- **Fix:** Error-Handling + getAuthHeaders() einfuegen

### C2. KRITISCH: Gemischte HTTP-Clients (axios + fetch)

- **15 Komponenten:** axios mit Interceptor
- **17 Komponenten:** fetch mit expliziten Headers
- **9 Komponenten:** BEIDES gemischt
- **Problem:** Inkonsistentes Error-Handling, Auth-Pattern, Response-Parsing
- **Fix:** Langfristig auf eine Strategie vereinheitlichen (fetch + API-Wrapper)

### C3. HOCH: Auth-Header-Pattern in 4 Varianten

1. Implicit via axios Interceptor (`App.js:78-87`)
2. Explicit via `getAuthHeaders()` (fetch-Komponenten)
3. Mixed (ChatMulti.js - beides)
4. Direct `localStorage` access (`DownloadContext.js:57`)

- **Fix:** Einheitlich `getAuthHeaders()` nutzen

### C4. HOCH: Over-Polling (~80+ API-Calls/Minute)

| Komponente        | Intervall | Endpoints       |
| ----------------- | --------- | --------------- |
| AppStore          | 5s        | 1               |
| ModelStore        | 5s        | 1               |
| SelfHealingEvents | 10s       | 1               |
| DocumentManager   | 30s       | **3 parallel**  |
| App.js Dashboard  | 30s       | **7+ parallel** |
| App.js Telegram   | 60s       | 1               |

- **Fix:** Intervalle erhoehen, Batch-Endpoints, Event-basiert statt Polling

### C5. HOCH: AbortController nur in 4 Komponenten

- **Problem:** Nur TelegramSettings, PasswordManagement, ClaudeTerminal, UpdatePage nutzen AbortController
- **Fix:** In allen Fetch-Komponenten implementieren

### C6. HOCH: Kein automatischer Retry

- **Problem:** Kein Exponential-Backoff, kein Error-Recovery
- **Fix:** API-Wrapper mit Retry-Logik

### C7. MITTEL: Redundante API-Aufrufe

- `/models/catalog` + `/models/status` + `/models/default` (3 statt 1)
- `/spaces` in ChatMulti UND DocumentManager (kein Cache)
- Chat-Refresh: `loadChats()` + `loadMessages()` + `checkActiveJobs()` (3 fuer 1 Aktion)
- **Fix:** Batch-Endpoints, SWR/React Query

### C8. MITTEL: Inkonsistente Error-Messages (Deutsch/Englisch)

- Manche zeigen `err.message` (Backend, Englisch)
- Manche zeigen hardcoded Deutsche Texte
- **Fix:** Immer Fallback: `err.message || 'Fehler beim Laden'`

### C9. MITTEL: Fehlende Empty-States

- ChatMulti: Kein Leer-State wenn keine Chats
- ModelStore: Kein Leer-State fuer leeren Katalog
- AppStore: Kein Leer-State nach Filterung
- DataTableEditor: Kein Leer-State ohne Zeilen
- **Fix:** Einheitliche Empty-State Komponente

### C10. MITTEL: Loading-State-Naming inkonsistent

- `loading` / `isLoading` / `dataLoading` / `actionLoading` / `activating` / `saving`
- **Fix:** Konvention: `loading` fuer Initial-Load, `saving` fuer Mutations

### C11-C13. NIEDRIG: Kleinere API-Issues

- Kein Cache-Headers (If-Modified-Since, ETags)
- Kein Request-Deduplication
- Polling ohne Jitter (Thundering Herd bei mehreren Tabs)

---

## 5. Behebungsplan (priorisiert)

### Phase 1: Kritische Fehler (Stabilitaet)

**Geschaetzte Dateien: 6 | Prioritaet: Sofort**

| #   | Task                                                                  | Dateien                      | Referenz |
| --- | --------------------------------------------------------------------- | ---------------------------- | -------- |
| 1.1 | `Promise.all()` -> `Promise.allSettled()`                             | `App.js`                     | A1       |
| 1.2 | Null-Safety in `formatChartData`                                      | `App.js`                     | A2       |
| 1.3 | ESC-Key + Focus-Trap fuer SpaceModal, BotDetailsModal, AppDetailModal | 3 Dateien                    | A3       |
| 1.4 | SpaceModal Error-Handling + Auth-Headers                              | `SpaceModal.js`              | C1       |
| 1.5 | z-index CSS-Variablen-Skala erstellen                                 | `index.css` + alle Modal-CSS | B2       |

### Phase 2: Hohe Prioritaet (UX & Konsistenz)

**Geschaetzte Dateien: 15 | Prioritaet: Naechste Woche**

| #    | Task                                                                   | Dateien                        | Referenz |
| ---- | ---------------------------------------------------------------------- | ------------------------------ | -------- |
| 2.1  | Ungenutzte States entfernen (systemStatus, workflows, telegramAppData) | `App.js`                       | A4       |
| 2.2  | App-URL-Fallback mit "Nicht verfuegbar"-Badge                          | `App.js`                       | A5       |
| 2.3  | Fehlende Toast-Benachrichtigungen einfuegen                            | 5 Dateien                      | A6       |
| 2.4  | Badge-System vereinheitlichen (`.badge-unified`)                       | `index.css` + 4 CSS            | B1       |
| 2.5  | Border-Radius auf `--radius-*` Variablen umstellen                     | 8+ CSS Dateien                 | B3       |
| 2.6  | Card-Base-Klasse erstellen                                             | `index.css` + 5 CSS            | B4       |
| 2.7  | Input-Felder vereinheitlichen                                          | `settings.css`, `Database.css` | B5       |
| 2.8  | Button-Groessen-Skala (sm/md/lg)                                       | `index.css` + 5 CSS            | B6       |
| 2.9  | Hardcoded Farben durch CSS-Variablen ersetzen                          | 7 Dateien                      | B7       |
| 2.10 | Custom-Modals auf `<Modal>` migrieren                                  | 3 JS + 3 CSS                   | B8       |
| 2.11 | AbortController in alle Fetch-Komponenten                              | 10+ Dateien                    | C5       |

### Phase 3: Mittlere Prioritaet (Polish & Optimierung)

**Geschaetzte Dateien: 20 | Prioritaet: Naechste 2 Wochen**

| #    | Task                                             | Dateien                                     | Referenz |
| ---- | ------------------------------------------------ | ------------------------------------------- | -------- |
| 3.1  | Tabellen-Basis-Klasse erstellen                  | `Database.css`, `documents.css`             | B9       |
| 3.2  | Box-Shadow auf Variablen umstellen               | 10+ CSS Dateien                             | B10      |
| 3.3  | Container-Padding/Max-Width vereinheitlichen     | 5 CSS Dateien                               | B11      |
| 3.4  | Label-Styles vereinheitlichen                    | `settings.css`, `Database.css`, `Login.css` | B12      |
| 3.5  | Error-Message-Display vereinheitlichen           | 4 CSS Dateien                               | B15      |
| 3.6  | Status-Indicator Groesse vereinheitlichen (10px) | `index.css`                                 | B16      |
| 3.7  | Pagination in DocumentManager erweitern          | `DocumentManager.js`, `documents.css`       | B17      |
| 3.8  | Chart-Zeitraum in localStorage speichern         | `App.js`                                    | A9       |
| 3.9  | Error-Recovery UI (Retry-Button)                 | `App.js`                                    | A11      |
| 3.10 | Loading-Skeletons fuer Service-Status            | `App.js`                                    | A12      |
| 3.11 | Polling-Intervalle optimieren                    | 5 Dateien                                   | C4       |
| 3.12 | Redundante API-Aufrufe konsolidieren             | 3 Dateien                                   | C7       |
| 3.13 | "Verfuegbar" -> "Verfügbar" Typo fix             | `StoreApps.js`                              | A14      |
| 3.14 | Error-Status Farbe in StoreApps                  | `StoreApps.js`                              | A17      |
| 3.15 | Animations-Timing vereinheitlichen               | 5+ CSS Dateien                              | B18      |

### Phase 4: Niedrige Prioritaet (Feinschliff)

**Geschaetzte Dateien: 10 | Prioritaet: Spaeter**

| #   | Task                                  | Dateien                | Referenz |
| --- | ------------------------------------- | ---------------------- | -------- |
| 4.1 | Chart-Barrierefreiheit (aria-label)   | `App.js`               | A15      |
| 4.2 | Focus-Management nach Skip-to-Content | `App.js`               | A16      |
| 4.3 | Font-Size-Skala als CSS-Variablen     | `index.css`            | B20      |
| 4.4 | Spacing-Scale erweitern               | `index.css`            | B13      |
| 4.5 | `prefers-reduced-motion` global       | alle Animations-CSS    | B27      |
| 4.6 | Mobile Touch-Targets >= 44px          | `index.css` responsive | B26      |
| 4.7 | Light-Mode Primary-Farbe angleichen   | `index.css:266`        | B27      |
| 4.8 | Empty-State Komponente erstellen      | Neues File             | C9       |
| 4.9 | Loading-State-Naming konsolidieren    | 10+ Dateien            | C10      |

---

## Zusammenfassung

Die Analyse hat **58 Probleme** identifiziert, davon **7 kritisch**. Die kritischen Probleme (Phase 1) betreffen hauptsaechlich:

1. **Dashboard crasht bei einzelnem API-Fehler** - Betrifft alle Nutzer
2. **Chart-Crash bei unvollstaendigen Metriken** - Betrifft alle Nutzer
3. **Modals ohne ESC-Handler** - UX-Standard verletzt
4. **SpaceModal ohne Error-Handling** - Silent Failures
5. **z-index Konflikte** - Visuelle Bugs bei geschachtelten Modals

Die Design-Inkonsistenzen (Phase 2-3) sind zahlreich, aber jeweils isoliert behebbar. Die haeufigsten Muster:

- **Border-Radius:** 8+ verschiedene Werte statt 6 definierte
- **Button-Padding:** 6+ verschiedene Groessen
- **Badge-Styling:** 5 komplett verschiedene Implementierungen
- **Box-Shadows:** 80+ hardcoded statt 4 definierte Variablen

Der empfohlene Ansatz ist Phase 1 sofort, Phase 2 als naechsten Sprint, Phase 3-4 sukzessive.
