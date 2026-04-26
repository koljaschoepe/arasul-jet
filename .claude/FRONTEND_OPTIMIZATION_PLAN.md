# Arasul Frontend & Plattform — Ultra-Detaillierter Optimierungsplan

> **Erstellt:** 2026-04-26
> **Methode:** 18 parallele Spezial-Agents haben die gesamte Codebase analysiert
> **Scope:** Frontend (Architektur, Design, UX, Performance) + Backend-Integration + LLM + n8n
> **Zielhardware:** Jetson AGX Orin/Thor (ARM64, limitierte Ressourcen)
> **Produktziel:** 5 Jahre autonomer Betrieb als verkaufbare Edge-AI-Appliance

---

## Executive Summary

**Aktuelle Gesamteinschätzung (gewichtet):**

| Bereich                 | Score      | Notiz                                             |
| ----------------------- | ---------- | ------------------------------------------------- |
| Backend-Qualität        | 8.0/10     | Sehr solide, asyncHandler 100%                    |
| API-Integration         | 8.5/10     | useApi-Hook exzellent, Retry fehlt                |
| Auth/Security           | 7.5/10     | Bcrypt+JWT+CSRF gut, UX rauh                      |
| Settings-Funktionalität | 9.0/10     | **Alle 7 Tabs funktionieren!**                    |
| LLM-Integration         | 7.0/10     | Streaming gut, Cancellation fehlt                 |
| n8n-Integration         | 5.0/10     | Custom Nodes da, RAG/SSO/Marketplace fehlen       |
| Realtime (WS/SSE)       | 7.0/10     | Robust, aber 3 Server unkonsolidiert              |
| TypeScript-Qualität     | 7.5/10     | strict an, 27% API ungetypt                       |
| Frontend-Architektur    | 5.5/10     | Inkonsistent, Monster-Komponenten                 |
| Component Library       | 6.8/10     | shadcn 68% genutzt, Modal-Boilerplate             |
| Design-System           | 7.0/10     | Tokens da, arbitrary sizes, Dark Mode dormant     |
| State-Management        | 5.0/10     | **TanStack Query installiert aber NICHT genutzt** |
| Forms/Validation        | 7.0/10     | Hybrid: 1 Form mit RHF+Zod, Rest manuell          |
| A11y                    | 6.5/10     | Keine Skip-Links, Modal-Overlays kaputt           |
| Mobile/Responsive       | 7.0/10     | OK für Admin-Tool, Sidebar-Mobile schlecht        |
| **Performance (Edge!)** | **4.0/10** | **6.1MB Bundle — viel zu schwer für Jetson**      |
| E2E-Funktionalität      | 7.5/10     | 6/11 Features voll, 3 Stubs, 2 toter Code         |

**Top 5 kritische Erkenntnisse:**

1. **Performance ist nicht Edge-tauglich:** 6.1MB JS-Bundle, Mermaid 1.4MB nicht lazy. Auf Jetson zu schwer.
2. **TanStack Query installiert, aber NIE benutzt** — `/src/lib/queryClient.ts` existiert, alle Features fetchen manuell mit useEffect.
3. **3 Features sind in Sidebar unsichtbar:** Database, Terminal, Telegram-Bot. User finden sie nicht.
4. **ChatContext.tsx hat 1210 Zeilen** + DocumentManager.tsx 1559 + App.tsx 600 → Monster-Komponenten.
5. **n8n-Integration ist nur 50%:** Custom Nodes existieren, aber RAG-Node, MinIO-Node, Marketplace-UI und SSO fehlen komplett.

**Positive Highlights:**

- **Alle 7 Settings-Tabs funktionieren end-to-end** (laden, speichern, validieren)
- **6 von 11 Hauptfeatures sind voll produktionsreif** (Chat, Documents, Telegram, Datentabellen, Sandbox, Settings)
- Backend-asyncHandler-Coverage **100%** — keine unhandled async errors
- React-Hook-Form + Zod sind **bereits installiert** — nur Migration nötig

---

## Architektur-Vision: Wo wir hinwollen

**Design-Philosophie:** "Industrial Swiss Minimalism" für Edge-AI-Appliance

- **Premium, ruhig, professionell** — wie ein Synology DSM oder Linear/Vercel-Dashboard, nicht bunt/spielerisch
- **Eine Akzentfarbe** + neutrale Palette + ein semantisches Set (success/warn/error)
- **Information-density hoch** ohne erschlagend (Dashboard-Charakter, keine Marketing-Page)
- **Tastatur-First** mit Command-Palette (Cmd+K) als Power-User-Feature
- **Dark/Light Mode** beide voll unterstützt
- **0ms perceived latency** durch optimistic updates + skeletons
- **5-Jahre-Update-Pfad** — Komponenten-Library und Patterns die altern können

**Code-Philosophie:**

- **Feature-Folder-Struktur einheitlich** (datentabellen/ als Vorbild für alle Features)
- **TanStack Query überall** für Server-State (kein useState+useEffect-Spam mehr)
- **React-Hook-Form + Zod überall** für Forms (Login als Vorbild)
- **shadcn/ui für alles UI-Generische** (statt Custom-Modals/Toasts/Forms)
- **Type-Safety 100%** für API-Responses

---

## Phasen-Übersicht

| Phase | Titel                                       | Aufwand   | Priorität | Abhängigkeit |
| ----- | ------------------------------------------- | --------- | --------- | ------------ |
| 0     | Fundament & Tooling                         | 1-2 Tage  | P0        | —            |
| 1     | Performance-Critical für Edge               | 3-5 Tage  | **P0**    | Phase 0      |
| 2     | Code-Architektur Aufräumen                  | 5-7 Tage  | P0        | Phase 0      |
| 3     | Component Library & Modal-Konsolidierung    | 5-7 Tage  | P0        | Phase 2      |
| 4     | State Management Migration (TanStack Query) | 5-7 Tage  | P0        | Phase 0      |
| 5     | Settings & Navigation Polish                | 3-4 Tage  | P1        | Phase 3      |
| 6     | Design-System & Dark/Light Mode             | 4-5 Tage  | P1        | Phase 3      |
| 7     | Forms-Standardisierung (RHF + Zod)          | 4-6 Tage  | P1        | Phase 3      |
| 8     | A11y & Keyboard-First                       | 3-4 Tage  | P1        | Phase 3      |
| 9     | LLM-UX & Chat-Polish                        | 5-7 Tage  | P1        | Phase 4      |
| 10    | n8n-Integration Vollendung                  | 8-10 Tage | P1        | —            |
| 11    | Realtime-Konsolidierung                     | 3-4 Tage  | P2        | Phase 4      |
| 12    | Backend-Cleanup & Refactor                  | 5-7 Tage  | P2        | —            |
| 13    | Auth-UX & Multi-User                        | 3-5 Tage  | P2        | —            |
| 14    | Mobile/Tablet-Polish                        | 2-3 Tage  | P3        | Phase 6      |

**Gesamt-Aufwand:** ~10-14 Wochen für eine Person, parallelisierbar in ~7-9 Wochen mit Fokus

---

## Phase 0 — Fundament & Tooling

**Ziel:** Voraussetzungen für alle weiteren Phasen schaffen — ohne Implementierungs-Risiko.

### 0.1 Bundle-Analyzer einrichten

- **Datei:** `apps/dashboard-frontend/vite.config.ts`
- Hinzufügen: `rollup-plugin-visualizer`
- `npm run build` produziert `dist/stats.html`
- **Ziel:** Sichtbar machen, was 6.1 MB ausmacht

### 0.2 TanStack Query QueryClientProvider in App.tsx mounten

- **Datei:** `apps/dashboard-frontend/src/App.tsx`
- Bereits installiert (`/src/lib/queryClient.ts` existiert mit `staleTime: 30s, gcTime: 5min`)
- Aber **nirgends gemounted**! Aktuell wird er nur in Tests benutzt
- **Wirkung:** Schaltet TanStack Query frei (Phase 4 startet hier)

### 0.3 TypeScript-Strictness verifizieren & loggen

- `tsc --noEmit --strict` durchlaufen lassen
- Liste der `any`-Vorkommen und ungetypten API-Calls erstellen
- Als Backlog für Phase 4 / Tagesarbeit

### 0.4 Tailwind PurgeCSS verifizieren

- `vite.config.ts`: `tailwindcss({ content: ['./src/**/*.{tsx,ts}'] })` prüfen
- index.css ist 100KB → mindestens 30% sollten gepurgt werden
- Build mit/ohne Purge vergleichen

### 0.5 Storybook (optional aber empfohlen)

- Komponenten visuell isoliert entwickeln
- Hilft enorm bei Phase 3 (shadcn-Adoption) und Phase 6 (Design-System)
- **Aufwand:** 4h Setup

**Acceptance Criteria Phase 0:**

- [ ] `dist/stats.html` zeigt Bundle-Aufteilung
- [ ] `<QueryClientProvider>` umschließt `<App>`
- [ ] CI-Pipeline schlägt bei `tsc --strict`-Fehlern an
- [ ] Tailwind purgt nachweislich

---

## Phase 1 — Performance-Critical für Edge (P0)

**Ziel:** Bundle von 6.1 MB → unter 2.5 MB. Kritisch für Jetson-Tauglichkeit.

### 1.1 Mermaid lazy-load (–800 KB sofort)

- **Problem:** `flowchart-elk-definition` (1.4 MB) und `mindmap-definition` (532 KB) sind im Main-Chunk
- **Lösung:** Vite `manualChunks` + dynamic imports nur in Markdown-Renderer
- **Datei:** `vite.config.ts` + `components/markdown/MermaidBlock.tsx` (neu, mit React.lazy)

### 1.2 @xterm/xterm lazy-load (–180 KB)

- Nur auf `/terminal` Route laden
- **Datei:** `features/sandbox/` (lazy-import in SandboxApp)

### 1.3 Tailwind PurgeCSS aktivieren / verifizieren (–50 KB CSS)

- index.css 100KB → ~50KB Ziel
- `vite.config.ts` content-paths korrekt setzen

### 1.4 ExcelEditor virtualisieren (Render-Performance)

- **Problem:** `.map()` über alle Zeilen → 60fps-Killer auf ARM
- **Lösung:** `@tanstack/react-virtual` oder `virtua` einbauen
- **Datei:** `features/datentabellen/ExcelEditor.tsx` + `RecordList.tsx`

### 1.5 useWebSocketMetrics: 200ms Debounce

- **Problem:** Jedes Metrics-Update re-rendert 10+ Komponenten
- **Lösung:** Debounce + nur bei echten Änderungen state setzen
- **Datei:** `hooks/useWebSocketMetrics.ts`

### 1.6 React.memo auf render-heavy Listen-Items

- ChatMessage, GridCell, BotCard, DocumentRow
- Nur dort wo Profiler tatsächlich Re-Renders zeigt

### 1.7 Lazy-Load alle Routes außer Dashboard + Chat

- Dashboard und Chat eager (80% Use)
- Settings, Store, Documents, Database, Terminal, Telegram → lazy
- **Datei:** `App.tsx` (bereits 7 lazy, einige fehlen)

### 1.8 Image-Optimierung

- Alle Bilder in `public/` zu WebP/AVIF konvertieren
- `<img loading="lazy">` Standard

### 1.9 Vite manualChunks für Vendor-Splitting

```ts
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'tiptap': ['@tiptap/react', '@tiptap/core', '@tiptap/starter-kit'],
  'mermaid': ['mermaid'],
  'recharts': ['recharts'],
  'xterm': ['@xterm/xterm', '@xterm/addon-fit'],
}
```

**Erwartetes Ergebnis:**

- Initial Bundle: 6.1 MB → ~2.0-2.5 MB
- TTI auf Jetson: 30-50% schneller
- index.css: 100 KB → ~50 KB

**Acceptance Criteria Phase 1:**

- [ ] `dist/` Initial-Bundle < 2.5 MB
- [ ] Mermaid lädt nur wenn Chat eine Mermaid-Block rendert
- [ ] Lighthouse Performance Score > 80 auf Jetson

---

## Phase 2 — Code-Architektur Aufräumen (P0)

**Ziel:** Maintainability — keine Monster-Komponenten, einheitliche Feature-Struktur.

### 2.1 App.tsx aufteilen (600 → 3 Dateien à ~150 Zeilen)

- **Datei:** `App.tsx`
- Aufteilen in:
  - `App.tsx` (Provider + Router only)
  - `AppShell.tsx` (Auth-Check + ErrorBoundary + Layout)
  - `hooks/useDashboardState.ts` (Metrics, Setup, Version-Check, Sidebar-State)

### 2.2 DocumentManager.tsx aufteilen (1559 → ~8 Dateien)

- **Datei:** `features/documents/DocumentManager.tsx`
- Struktur danach:
  ```
  features/documents/
    DocumentManager.tsx           (Container, ~200 Zeilen)
    components/
      DocumentList.tsx
      SpaceSidebar.tsx
      SpaceModal.tsx
      DocumentDetailModal.tsx
      UploadButton.tsx
      DocumentBadge.tsx
    hooks/
      useDocumentActions.ts
      useDocumentUpload.ts
    types.ts
    utils.ts
  ```

### 2.3 ChatContext.tsx splitten (1210 → 3 Contexts)

- **Datei:** `contexts/ChatContext.tsx`
- Aufteilen in:
  - `JobQueueContext.tsx` (activeJobIds, globalQueue, prioritization)
  - `ModelContext.tsx` (selectedModel, installedModels, defaultModel)
  - `SpacesContext.tsx` (spaces, currentSpace)
- ChatContext bleibt schlanker für nur Chat-spezifischen State

### 2.4 Feature-Folder-Standard etablieren

- **Vorbild:** `features/datentabellen/` (hat components/, hooks/, types.ts, utils.ts, constants.ts)
- **Anwenden auf:**
  - `features/chat/` → 16 Files flach → Sub-Strukturen
  - `features/sandbox/` → Root-only → components/, hooks/
  - `features/settings/` → 8 Files Root → sections/ standardisieren
  - `features/store/` → 7 Files Root → components/
  - `features/documents/` → "sections/" → "components/"
  - `features/telegram/` → "sections/" → "components/"

### 2.5 Hooks-Platzierung vereinheitlichen

- `documents/useDocumentUpload.ts` → `documents/hooks/useDocumentUpload.ts`
- `sandbox/useTerminal.ts` → `sandbox/hooks/useTerminal.ts`
- Inline-Hooks in chat-Komponenten extrahieren

### 2.6 Types-Strategie definieren

- **Regel:** Domain-Types feature-lokal (`features/x/types.ts`), Shared-Types in `src/types/`
- Aktuell hybrid und unklar, klären und dokumentieren in `docs/FRONTEND_CONVENTIONS.md`

### 2.7 Naming: "sections/" oder "components/" — eines wählen

- Empfehlung: `components/` für alle (Standard in React-Welt)
- "sections/" macht zusätzliche Verwirrung

### 2.8 Test-Folder-Struktur

- `__tests__/` einheitlich in jedem Feature
- Aktuell uneinheitlich (manche Features haben es, andere nicht)

**Acceptance Criteria Phase 2:**

- [ ] Keine Datei mehr > 500 Zeilen (außer generierten)
- [ ] Jedes Feature hat: components/, hooks/ (wenn Hooks), types.ts, index.ts
- [ ] App.tsx < 150 Zeilen
- [ ] `docs/FRONTEND_CONVENTIONS.md` dokumentiert die Struktur

---

## Phase 3 — Component Library & Modal-Konsolidierung (P0)

**Ziel:** ~1000 LoC Modal-Boilerplate eliminieren, shadcn-Coverage auf 90%.

### 3.1 Fehlende shadcn-Komponenten installieren

```bash
npx shadcn@latest add sheet form command accordion sonner checkbox
```

- **Sheet:** Mobile-Sidebar, Detail-Sheets (RecordDetailSheet ablösen)
- **Form:** Native Integration mit React-Hook-Form
- **Command:** Cmd+K-Palette (Phase 5)
- **Accordion:** N8nIntegrationGuide (custom Toggle ersetzen)
- **Sonner:** ToastContext-Replacement (besser, mit Queue)
- **Checkbox:** Raw `<input type="checkbox">` ersetzen (3 Stellen in Telegram)

### 3.2 `<StatusMessage />` Komponente extrahieren

- Heute dupliziert in: ProjectModal, BotDetailsModal, etc. (Success/Error-Inline-Boxes)
- **Datei:** `components/ui/StatusMessage.tsx` (variant: success | error | warning | info)
- Refactor 7+ Modals

### 3.3 `useModalForm` Hook generalisieren

- Existiert in `components/editor/CreateDocumentDialog.tsx:66`
- In `hooks/useModalForm.ts` extrahieren
- Anwenden auf alle 7 Modals

### 3.4 Modal-Wrapper standardisieren

- Eine `<DialogModal>`-Komponente die Dialog + Header + Footer + Tabs (optional) bündelt
- **Eliminiert:** Manuelle Tab-Implementierungen (z.B. BotDetailsModal Zeile 753)

### 3.5 `<PageLayout>`-Komponente einführen

- Heute: jede Page setzt `className="px-4 py-3"` selbst
- **Datei:** `components/layout/PageLayout.tsx` (Header + Padding + Footer-Slot)
- Anwenden auf alle 11 Page-Komponenten

### 3.6 Sonner statt ToastContext

- Custom ToastContext.tsx (~250 Zeilen) → Sonner (1 Zeile Setup)
- Toast-Queue, Action-Buttons, Dismissable — alles built-in
- Migration: `useToast()` API behalten, intern Sonner

### 3.7 RecordDetailSheet → shadcn Sheet

- `features/datentabellen/components/RecordDetailSheet.tsx` ist Custom div
- Tausch zu shadcn Sheet (Animation, Backdrop, Mobile-friendly)

### 3.8 N8nIntegrationGuide → Accordion

- **Datei:** `features/telegram/N8nIntegrationGuide.tsx:55-84`
- Custom Toggle → shadcn Accordion

**Acceptance Criteria Phase 3:**

- [ ] shadcn-Coverage > 85% (aktuell 68%)
- [ ] Kein Modal länger als 200 Zeilen
- [ ] StatusMessage in allen Modals statt Custom-Inline
- [ ] Sonner statt ToastContext
- [ ] PageLayout-Komponente in allen Pages

---

## Phase 4 — State Management Migration (TanStack Query) (P0)

**Ziel:** Server-State zentral cached, optimistic updates, 50% weniger useState-Code.

### 4.1 Migration-Reihenfolge (Risiko aufsteigend)

1. **TelegramBotPage** (höchste useState-Dichte: 12!)
   - `bots`, `loading`, `appStatus`, `systemConfig`, `auditLogs` → useQuery
   - `toggle`, `delete`, `save` → useMutation mit invalidation
2. **Settings-Pages** (mehrere parallele Loads)
3. **DocumentManager** (Spaces, Documents, Filter)
4. **Store** (Models, Apps, Activations)
5. **ChatContext** (zuletzt — komplex)

### 4.2 Pattern-Vorlage etablieren

```ts
// hooks/queries/useBots.ts
export const useBots = () =>
  useQuery({
    queryKey: ['telegram', 'bots'],
    queryFn: () => api.get<Bot[]>('/telegram-bots'),
    staleTime: 30_000,
  });

// hooks/mutations/useToggleBot.ts
export const useToggleBot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (botId: string) => api.post(`/telegram-bots/${botId}/toggle`),
    onMutate: async botId => {
      /* optimistic */
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram', 'bots'] }),
  });
};
```

### 4.3 Retry-Logic im useApi-Hook (P0!)

- **Datei:** `hooks/useApi.ts`
- Exponential Backoff für 5xx und Network-Errors
- 3 Versuche: 100ms → 500ms → 2500ms
- Skip für 4xx-Fehler (User-Fehler, kein Retry)

### 4.4 `showError: false` Audit

- 20+ Stellen nutzen das → silent fail
- **Empfehlung:** `onError`-Callback statt `.catch(() => {})` swallow
- Wenn Fehler erwartet ist (z.B. 404 bei optional resource): explizit nicht-Toast aber loggen

### 4.5 API-Response-Types (von 73% → 100%)

- 35-40 ungetypte useApi-Calls
- Pro Feature: `features/x/api/types.ts` mit allen Response-Schemas
- Optional: Zod-Schemas zum Runtime-Parsing

### 4.6 useWebSocketMetrics → in TanStack Query integrieren

- WS-Updates schreiben in QueryCache via `setQueryData`
- Pages konsumieren über `useQuery` als wäre es Polling — TanStack handled stale/dedup

**Acceptance Criteria Phase 4:**

- [ ] Mindestens 5 Features auf TanStack Query migriert
- [ ] Retry-Logic im useApi (mit Tests)
- [ ] Optimistic Updates für mind. 3 Mutations (Bot-Toggle, Doc-Delete, Project-Rename)
- [ ] React DevTools zeigt aktive Query-Cache
- [ ] 0 silent-swallow-Stellen ohne `onError` oder Logging

---

## Phase 5 — Settings & Navigation Polish (P1)

**Ziel:** Versteckte Features sichtbar, Command-Palette, URL-basierte Settings-Tabs.

### 5.1 Sidebar: 3 versteckte Routes hinzufügen

- **Datei:** `components/layout/Sidebar.tsx`
- Hinzufügen: Database, Terminal, Telegram-Bot
- Mit Icons (Lucide), korrekte aktive States

### 5.2 Command-Palette mit cmdk (Cmd+K)

- **Library:** `cmdk` (oder shadcn Command, das es wrappt)
- Features:
  - Schnellnavigation zu allen Routes
  - Recent items (letzter Chat, letzte Datentabelle)
  - Aktionen (Logout, Theme Toggle, Sidebar Toggle)
  - Search in Documents/Datentabellen (RAG-powered, Phase 9)
- **Datei:** `components/CommandPalette.tsx` (neu)

### 5.3 Settings: URL-basierte Tabs

- Heute: `activeSection` State → User kann Tab nicht teilen
- Ziel: `/settings/general`, `/settings/security`, `/settings/services` etc.
- React Router NestedRoutes
- **Datei:** `features/settings/Settings.tsx`

### 5.4 Unsaved-Changes-Warning

- TODO-Kommentar in Settings.tsx:84 aktiv adressieren
- `useBeforeUnload` + `useBlocker` (React Router v6)
- Confirm-Dialog vor Tab-Wechsel mit ungespeicherten Änderungen

### 5.5 Breadcrumbs systemweit

- Heute nur in Datentabellen
- **Datei:** `components/layout/Breadcrumbs.tsx` (mit React Router useMatches)
- In Header oder unter Title

### 5.6 console.error-Cleanup in Settings

- GeneralSettings.tsx:45, AIProfileSettings.tsx:155, PasswordManagement.tsx:88, ServicesSettings.tsx:87
- Ersetzen durch zentrales `logger.error()` (oder einfach entfernen)

### 5.7 Database-Feature aufklären

- Aktuell verwirrend: `/database` ist Alias für Datentabellen
- **Option A:** Database-Feature komplett entfernen (Datentabellen reicht)
- **Option B:** Database als reine "PostgreSQL-Schema-Sicht" positionieren (read-only Tabellen-Liste, nicht editierbar)
- **Empfehlung:** Option A (weniger Verwirrung)

**Acceptance Criteria Phase 5:**

- [ ] Cmd+K öffnet Command-Palette mit > 20 Items
- [ ] Sidebar zeigt alle 11 Hauptfeatures
- [ ] Settings-URLs sind shareable
- [ ] Unsaved-Changes warnt vor Tab-Switch
- [ ] Breadcrumbs in mind. 5 Pages

---

## Phase 6 — Design-System & Dark/Light Mode (P1)

**Ziel:** Eine konsistente, minimalistische Design-Sprache.

### 6.1 Design-Tokens konsolidieren

- **Datei:** `src/index.css` (100KB → ~50KB Ziel)
- 31 CSS-Variablen prüfen, Duplikate (--color-danger vs --destructive) auflösen
- Alle 10+ arbitrary text-sizes (`text-[0.725rem]`) ersetzen durch Token

### 6.2 Typografie-Skala definieren

```
text-display:  28px / 36px / 600 (Headlines)
text-h1:       20px / 28px / 600
text-h2:       16px / 24px / 600
text-base:     14px / 20px / 400 (Default Body)
text-small:    12px / 16px / 400 (Secondary)
text-tiny:     10px / 14px / 500 (Labels, Badges)
```

Nur diese 6, keine arbitrary-Werte mehr

### 6.3 Spacing-Grid auf 4px-System

- Erlaubt: 0, 1, 2, 3, 4, 6, 8, 12, 16 (Tailwind-Skala)
- Verboten: `p-[13px]`, `m-[calc(100%+4px)]`
- ESLint-Regel: `tailwindcss/no-custom-classname` mit Allowlist

### 6.4 Color-Palette finalisieren

```
Primary:     #3B82F6 (Slate Blue, weniger schreiend als #45ADFF)
Accent:      #10B981 (Emerald — Success/Active)
Destructive: #EF4444 (Red)
Warning:     #F59E0B (Amber)
Neutral:     50, 100, 200, 300, 500, 700, 900 (Grayscale)
BG-Light:    #FFFFFF / #F9FAFB
BG-Dark:     #0B0F19 / #111827 (Charcoal)
```

- Alle Hex-Hardcodes (z.B. `#45ADFF` in ProjectModal) durch Token ersetzen
- WCAG AA Kontrast für alle Text/BG-Kombinationen verifizieren

### 6.5 Dark/Light Mode aktivieren

- `.dark` CSS bereits vorhanden, aber Toggle nicht funktional
- **Datei:** neue `hooks/useTheme.ts` mit System-Preference + localStorage Override
- Toggle in Sidebar oder Settings/Allgemein
- Storybook-Komponenten in beiden Modes testen

### 6.6 Border-Radius standardisieren

- Token: `--radius-sm: 4px, -md: 8px, -lg: 12px, -xl: 16px`
- Verbieten: `rounded-[14px]` (magic value)

### 6.7 Shadow-System

- 3 Stufen: `shadow-sm` (Cards), `shadow-md` (Dropdowns), `shadow-lg` (Modals)
- Glassmorphism für Floating Elements: `bg-background/80 backdrop-blur-md border border-border`

### 6.8 Animation-System

- 4 keyframes statt 8 (merge fade-in/scale-up etc.)
- Standard-Transition: `transition-all duration-200 ease-out`
- Optional: framer-motion für komplexere Sequenzen (Page-Transitions)

### 6.9 index.css Cleanup

- Dead-Code identifizieren (PurgeCSS aktiv testen)
- Redundante shadcn-Variable-Mappings entfernen
- Ziel: < 50 KB

**Acceptance Criteria Phase 6:**

- [ ] index.css < 50 KB
- [ ] 0 arbitrary text-sizes (`text-[...]`)
- [ ] 0 Hex-Hardcodes in JSX
- [ ] Dark/Light Mode Toggle funktioniert in allen Pages
- [ ] WCAG AA-Kontrast für alle Text-Varianten verifiziert

---

## Phase 7 — Forms-Standardisierung (RHF + Zod) (P1)

**Ziel:** Boilerplate eliminieren, Validation einheitlich, bessere UX.

### 7.1 Zod-Schemas zentral

- **Datei:** `src/schemas/forms/`
  - `auth.ts` (Login, Password-Change)
  - `bot.ts` (Bot-Creation, Token, Webhook)
  - `project.ts`, `space.ts`, `document.ts`
- Wenn möglich: Backend-Schemas teilen (Monorepo-Package `@arasul/schemas`)

### 7.2 FormField-Wrapper-Komponente

- **Datei:** `components/ui/FormField.tsx`
- Wrapped: Label + Input + Error-Message + Required-Indicator
- Anwenden in allen Forms

### 7.3 Migration-Reihenfolge

1. PasswordManagement (435 Zeilen, höchste Boilerplate)
2. EditProjectDialog
3. CreateTableDialog
4. SpaceModal
5. BotSetupWizard
6. AIProfileSettings
7. CommandsEditor

### 7.4 Required-Field-Indicators (P0 UX)

- Rotes `*` neben allen Pflicht-Labels
- ARIA: `aria-required="true"` auf Inputs
- ESLint-Regel: `<input required>` muss `<Label required>` haben

### 7.5 Keyboard-UX vereinheitlichen

- **Enter** = Submit (in allen Single-Field-Forms)
- **Esc** = Cancel/Close (in allen Modals)
- **Tab/Shift+Tab** = korrekte Reihenfolge

### 7.6 Loading/Disabled-Pattern

```tsx
<Button type="submit" disabled={isSubmitting || !isValid}>
  {isSubmitting ? <Spinner /> : 'Speichern'}
</Button>
```

Standardisieren in allen Forms

**Acceptance Criteria Phase 7:**

- [ ] Mindestens 6 Forms migriert auf RHF + Zod
- [ ] Alle Pflichtfelder mit visuellem `*`-Indicator
- [ ] Esc schließt jeden Modal, Enter submitted
- [ ] FormField-Komponente ist die einzige Form-Element-Wrapper

---

## Phase 8 — A11y & Keyboard-First (P1)

**Ziel:** WCAG 2.1 AA-Compliance, vollständige Keyboard-Bedienbarkeit.

### 8.1 Skip-Links (5 min Quick Win!)

- **Datei:** `App.tsx` + `index.css`
- `<a href="#main-content" class="sr-only focus:not-sr-only">Zum Inhalt springen</a>`
- `<main id="main-content">` als Anchor

### 8.2 Modal-Overlay-Divs ersetzen

- 6+ Stellen mit `<div onClick={close}>` als Overlay
- Ersetzen durch shadcn Dialog (hat Focus-Trap, Esc-Handling, ARIA)
- Spezifisch: ExcelEditor.tsx:319, RecordDetailSheet.tsx:46

### 8.3 Sidebar Roving Tabindex

- **Datei:** `components/layout/Sidebar.tsx`
- `role="menubar"` + Arrow-Key-Navigation
- Aktuell: Tab verlässt Menü nach erstem Item

### 8.4 Color-Contrast-Audit (WCAG AA)

- **Verdächtig:** `--muted-foreground: #94A3B8` auf `--accent: #222d3d` (4.2:1, FAIL)
- WebAIM Contrast Checker für alle Text/BG-Kombos
- Token-Werte anpassen wo nötig

### 8.5 Form-ARIA verbessern

- `aria-invalid="true"` bei Fehler
- `aria-describedby` für Error-Messages
- `aria-required` bei Pflichtfeldern

### 8.6 Focus-Restore nach Modal-Close

- shadcn Dialog hat das built-in
- Bei Custom-Modals: useRef speichert vorherigen Focus

### 8.7 Keyboard-Shortcuts-Legend

- Cmd+? öffnet Modal mit allen Shortcuts
- Anbindung an Command-Palette

### 8.8 Touch-Target-Audit

- Alle Buttons mind. 44x44px (WCAG)
- `@media (pointer: coarse)` bereits da, aber inkonsequent

**Acceptance Criteria Phase 8:**

- [ ] axe-core (oder Lighthouse) A11y-Score > 95
- [ ] 0 Modal-Overlays als Div ohne Role
- [ ] Skip-Link funktioniert
- [ ] Sidebar mit Arrow-Keys navigierbar

---

## Phase 9 — LLM-UX & Chat-Polish (P1)

**Ziel:** LLM-Features sichtbar machen, Cancellation, Modell-Switcher.

### 9.1 LLM-Cancellation-Endpoint (P0!)

- **Backend:** `POST /api/llm/jobs/:jobId/cancel`
  - AbortController-Signal an Stream
  - Job-Status auf `cancelled` setzen
- **Frontend:** Cancel-Button im ChatInput während Streaming
- **Datei:** `apps/dashboard-backend/src/routes/llm.js` + `features/chat/`

### 9.2 Model-Switcher in ChatTopBar

- **Datei:** `features/chat/ChatTopBar.tsx`
- Dropdown: alle installierten Modelle
- Pro Modell anzeigen: Name, Größe (VRAM), durchschnittliche TTFB
- "Modell laden"-Button (pre-warm)

### 9.3 Token-Speed Meter

- Nach dem Streaming: "2.3 tokens/sec" als Badge
- Hilft User Performance einschätzen

### 9.4 Token-Budget-Visualizer

- Im Chat: horizontale Bar
- "System: 200 | History: 1200 | Current: 800 | Available: 5800 / 8000"
- Warnt wenn > 85% genutzt

### 9.5 GPU-Widget im Dashboard

- **Datei:** `components/GpuMonitor.tsx` (neu)
- Real-time VRAM-Gauge
- Loaded Models List
- Tegrastats-Daten konsumieren

### 9.6 Context-Length im Model-Catalog

- **DB-Migration:** `083_add_model_context_length.sql`
  - `ALTER TABLE llm_model_catalog ADD COLUMN context_length INT DEFAULT 4096`
- ContextBudgetManager nutzt das statt Hardcoded 4096

### 9.7 Strukturierte Error-Codes

- Statt "Stream timeout" → `ERR_MODEL_NOT_LOADED`, `ERR_CUDA_OOM`, `ERR_CONTEXT_TRUNCATED`
- Frontend zeigt User-friendly Message + Retry-Option

### 9.8 Streaming Indicators

- "⏳ Warte in Queue (2/5)"
- "🧠 Denke nach..." mit Timer
- "💬 Generiere Antwort..."
- Visueller Übergang zwischen States

### 9.9 Job-Result-Endpoint für n8n

- `GET /api/llm/jobs/:jobId/result` für n8n-Polling
- (Verbindet zu Phase 10)

**Acceptance Criteria Phase 9:**

- [ ] User kann LLM-Generation cancellen
- [ ] Model-Switcher sichtbar in ChatTopBar
- [ ] GPU-Widget zeigt Live-VRAM
- [ ] Strukturierte Error-Codes statt generischer Messages

---

## Phase 10 — n8n-Integration Vollendung (P1)

**Ziel:** Vollwertige Workflow-Plattform — RAG, Marketplace, SSO.

### 10.1 RAG Custom Node (P0)

- **Datei:** `services/n8n/custom-nodes/n8n-nodes-arasul-rag/`
- Operationen: Search (Qdrant), Rerank, Hybrid-Search
- Input: Query-String → Output: Top-K Results mit Scores
- Vorlage: existierende LLM-Node

### 10.2 MinIO S3 Custom Node (P0)

- **Datei:** `services/n8n/custom-nodes/n8n-nodes-arasul-s3/`
- Operationen: Upload, Download, List, Delete
- Credentials: MinIO Access Key/Secret aus Docker secret

### 10.3 Workflow-Marketplace im Store

- **Datei:** `apps/dashboard-frontend/src/features/store/StoreWorkflows.tsx` (neu)
- Tab im Store neben Models/Apps
- Workflows als JSON aus `services/n8n/workflows/` listen
- One-Click-Install via n8n REST API (`POST /workflows/import`)
- 4-5 Pre-Built-Templates:
  - Document → RAG → Summary
  - Telegram → LLM → Reply
  - Daten-Extraktion (Excel → DB)
  - System-Health → Email
  - Scheduled Cleanup

### 10.4 SSO Dashboard ↔ n8n

- Heute: separate Logins
- Lösung: Traefik-Middleware setzt `X-User-Id`-Header für n8n
- Oder: n8n User-Sync via API
- **Datei:** `config/traefik/middleware.yml` + `services/n8n/setup.sh`

### 10.5 REST API Gateway für n8n-Trigger

```
POST /api/v1/workflows/:id/trigger
GET  /api/v1/workflows/:id/status/:executionId
POST /api/v1/workflows/execute-sync (mit Timeout)
```

- **Datei:** `apps/dashboard-backend/src/routes/external/workflows.js` (neu)
- Auth via API-Key oder JWT
- Audit-Logging zentral

### 10.6 Frontend n8n-Embed

- Iframe in `/workflows` Route
- Mit SSO automatisch eingeloggt
- Oder: Deep-Link "Workflow X bearbeiten" öffnet n8n in neuem Tab

### 10.7 Webhook-Templates

- Pre-konfigurierte Webhook-URLs zum Kopieren
- "Trigger this workflow when document uploaded"
- "Trigger when LLM job completes"

**Acceptance Criteria Phase 10:**

- [ ] RAG-Node + S3-Node installiert
- [ ] Workflow-Marketplace im Store sichtbar
- [ ] SSO funktioniert (1x einloggen, n8n eingeloggt)
- [ ] User kann Workflow aus Dashboard heraus triggern
- [ ] 4+ Pre-Built-Templates verfügbar

---

## Phase 11 — Realtime-Konsolidierung (P2)

**Ziel:** Eine WebSocket-Architektur, weniger Connections, sichtbarer Status.

### 11.1 Unified Realtime Gateway

- **Backend:** Ein WS-Server unter `/api/realtime/*`
- Channels: `metrics`, `telegram-setup`, `terminal`, `jobs`, ...
- Auth via JWT in Subprotocol-Header (statt Query-Param)

### 11.2 `useRealtime(channel)`-Hook

- **Datei:** `hooks/useRealtime.ts`
- Abstrahiert WS/SSE/Polling — Komponente kümmert sich nicht
- Mit TanStack Query integriert (Updates schreiben in QueryCache)

### 11.3 Multi-Tab Coordination

- SharedWorker oder BroadcastChannel API
- Eine WS-Connection pro User, alle Tabs teilen
- Spart 60% WS-Connections bei aktiven Power-Usern

### 11.4 Connection-Status-Badge

- **Datei:** `components/RealtimeStatus.tsx`
- "🟢 Connected" / "🟡 Reconnecting (3s)" / "🔴 Offline (HTTP-Fallback)"
- In Sidebar oder Header

### 11.5 Terminal-Reconnect implementieren

- Terminal hat aktuell keine Reconnect-Logic
- Bei Connection-Loss: visuelle Anzeige + Auto-Reconnect

### 11.6 Telegram WS+Polling-Dedup

- Aktuell startet Polling parallel zu WS bei Error → doppelte Last
- Polling nur als Fallback wenn WS dauerhaft fails

**Acceptance Criteria Phase 11:**

- [ ] Ein einziger WS-Server für alle Channels
- [ ] `useRealtime` ersetzt `useWebSocketMetrics`/`useTerminal`/etc.
- [ ] RealtimeStatus-Badge sichtbar
- [ ] Multi-Tab teilt Connections (testbar via DevTools Network)

---

## Phase 12 — Backend-Cleanup & Refactor (P2)

**Ziel:** Wartbare Routes, Validation überall, toter Code weg.

### 12.1 Toter Code entfernen

- **Datei:** `apps/dashboard-backend/src/routes/ai/knowledge-graph.js`
  - 0 Frontend-Calls, kein Test, vermutlich Legacy
  - Löschen oder explizit als experimental markieren
- **Datei:** `apps/dashboard-backend/src/routes/external/alerts.js`
  - Falls ungenutzt: weg

### 12.2 Giant Routes splitten

- `documents.js` (1123 Zeilen) → `documents/` Ordner mit `documents.js`, `search.js`, `categories.js`
- `telegram/app.js` (907 Zeilen) → `app/` mit `webhook.js`, `commands.js`, `setup.js`
- `datentabellen/tables.js` (852) und `rows.js` (400+) → modularisieren
- `system/system.js` (699) → `hardware.js` + `config.js`

### 12.3 Zod-Validation auf alle POST/PUT/PATCH

- 224/355 Routes ohne Validation aktuell
- Pro Route: Zod-Schema + `validateBody()`-Middleware
- Schemas in `apps/dashboard-backend/src/schemas/`

### 12.4 Query-Builder-Duplikation

- 10+ Routes mit `conditions.push(...)` Pattern
- Generische Filter-Builder-Utility in `utils/queryFilters.js`

### 12.5 Rate-Limiter konsolidieren

- 5 separate Limiters → `middleware/rateLimit.js` mit Konfig
- Beispiel: `rateLimit('upload', { windowMs: 60_000, max: 10 })`

### 12.6 Dashboard-Backend-Routes bauen

- Aktuell: `/api/dashboard` existiert nicht
- Nötig für: Widget-Konfiguration, Custom-Layouts, Notifications-Dashboard
- **Optional:** wenn Dashboard nur Read-only bleiben soll, dokumentieren

### 12.7 Integration-Tests für Routes

- 50 Test-Files vorhanden, aber nur Service-Layer
- **Ziel:** Mind. Smoke-Tests für jede Route (200 OK, Auth required, Validation triggers)
- Library: supertest

**Acceptance Criteria Phase 12:**

- [ ] Keine Route-Datei > 500 Zeilen
- [ ] 80%+ Routes mit Zod-Validation
- [ ] Toter Code (knowledge-graph) entfernt
- [ ] Smoke-Tests für alle Routes
- [ ] Database/Datentabellen-Overlap aufgelöst

---

## Phase 13 — Auth-UX & Multi-User (P2, optional)

**Ziel:** Production-Polish für Multi-User-Szenarien (wenn Plattform an Teams verkauft wird).

### 13.1 Login-UX Quick-Wins (1h)

- Placeholder "admin" entfernen → "Benutzername"
- Show/Hide-Password Toggle
- Bessere Error-Messages: "Account locked (10 min)" statt generic
- Token-Expiry Toast: "Session endet in 5:00"

### 13.2 Session-Management UI

- **Backend:** `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`
- **Frontend:** Settings → Security → "Aktive Sitzungen"
- Liste: IP, Device, Last Activity, "Abmelden"-Button
- "Auf allen Geräten abmelden"

### 13.3 Multi-User aktivieren (RBAC)

- Schema bereits ready: `admin_users.role` (Default 'admin')
- **Backend:** `/api/admin/users` (Create, List, Update, Delete)
- **Frontend:** Settings → Users & Roles
- Rollen: `admin`, `editor`, `viewer`
- Permission-Middleware: `requireRole('admin')`

### 13.4 2FA (optional, P3)

- TOTP via authenticator app (Google Authenticator etc.)
- Recovery-Codes
- Library: `speakeasy` + `qrcode`

### 13.5 Audit-Log-UI

- Settings → Security → Audit-Log
- Filterbar: User, Aktion, Datum
- Bereits in DB (`api_audit_logs`), nur UI fehlt

**Acceptance Criteria Phase 13:**

- [ ] Session-Management UI funktional
- [ ] Multi-User mit RBAC funktioniert
- [ ] Audit-Log-UI in Settings sichtbar
- [ ] (Optional) 2FA aktivierbar

---

## Phase 14 — Mobile/Tablet-Polish (P3)

**Ziel:** Plattform auch auf Tablets gut bedienbar (nicht primärer Use-Case, aber soll nicht kaputt sein).

### 14.1 Sidebar-Hamburger für < 1024px

- **Datei:** `components/layout/Sidebar.tsx` + `index.css:2415-2453`
- Aktuell: horizontaler Scroll (schlecht)
- Lösung: Sheet von links bei Klick auf Hamburger
- Verwendet shadcn Sheet (Phase 3)

### 14.2 Hardcoded Max-Widths responsiv machen

- `Settings.tsx:232`: `max-w-[900px]` → `max-w-[900px] max-md:max-w-full`
- `TelegramBotPage.tsx:350`: analog
- Suche `max-w-\[` und audit alle

### 14.3 Modal-Sizing auf Mobile

- `sm:max-w-[800px]` → `max-md:max-w-[calc(100vw-1rem)] max-md:max-h-[95vh]`
- Apply zu Modal-Komponente standardmäßig

### 14.4 Tabellen Card-Mode auf Mobile

- ExcelEditor hat das bereits (MobileRecordList)
- Anwenden auf alle Tabellen in Database, Documents, Telegram-Bots

**Acceptance Criteria Phase 14:**

- [ ] Sidebar funktioniert als Sheet auf < 1024px
- [ ] Alle Modals fit auf 375px Breite
- [ ] Keine horizontalen Scrollbars auf Tablet

---

## Risiko-Management & Reihenfolge-Empfehlungen

### Empfohlene Reihenfolge (MVP-First-Approach)

**Sprint 1 (2 Wochen):**

- Phase 0 (Tooling)
- Phase 1 (Performance) ← **kritisch für Edge**
- Phase 2 (Architektur)

**Sprint 2 (2 Wochen):**

- Phase 4 (TanStack Query) ← höchster Code-Quality-Hebel
- Phase 3 (Component Library)

**Sprint 3 (2 Wochen):**

- Phase 5 (Settings/Navigation Polish)
- Phase 6 (Design-System)
- Phase 8 (A11y)

**Sprint 4 (2 Wochen):**

- Phase 7 (Forms)
- Phase 9 (LLM-UX)

**Sprint 5 (3 Wochen):**

- Phase 10 (n8n) — größter Aufwand, höchster Produktwert
- Phase 12 (Backend-Cleanup)

**Sprint 6 (1-2 Wochen, optional):**

- Phase 11 (Realtime), Phase 13 (Auth), Phase 14 (Mobile)

### Was vermeiden

- **Nicht parallel:** Phase 2 (Architektur) und Phase 3 (Library) — beide editieren viele Files, Merge-Konflikte
- **Nicht zuerst:** Phase 6 (Design-System) vor Phase 3 (Component Library) — sonst doppelte Arbeit
- **Nicht überspringen:** Phase 0 — ohne Bundle-Analyzer und TanStack-Provider blind

### Reversibilität

Alle Phasen sind **inkrementell reversierbar** — Migration-Branches pro Phase, Tests bleiben grün, Docker-Rebuild nach jeder Phase. Bei einem 5-Jahre-Produkt-Horizont keine "Big Bang"-Refactors.

---

## Metriken zur Erfolgsmessung

| Metrik                            | Heute                | Ziel nach allen Phasen     |
| --------------------------------- | -------------------- | -------------------------- |
| Initial Bundle Size               | 6.1 MB               | < 2.0 MB                   |
| index.css Size                    | 100 KB               | < 50 KB                    |
| TTI auf Jetson                    | ? (zu messen)        | < 2s                       |
| Lighthouse Performance            | ?                    | > 90                       |
| Lighthouse A11y                   | ?                    | > 95                       |
| TypeScript any-Count              | 15+                  | < 5                        |
| API-Calls untypisiert             | 27%                  | 0%                         |
| asyncHandler-Coverage Backend     | 100%                 | 100% (halten)              |
| Routes mit Validation             | 37%                  | > 80%                      |
| shadcn-Coverage                   | 68%                  | > 85%                      |
| Größte Komponente (Zeilen)        | 1559                 | < 500                      |
| Modal-Boilerplate (LoC)           | ~2664                | < 1500                     |
| Anzahl useState in Top-Komponente | 12 (TelegramBotPage) | < 5 (durch TanStack Query) |
| n8n Custom Nodes                  | 3                    | 5+ (mit RAG, S3)           |
| Settings-Tabs funktional          | 7/7 ✅               | 7/7 (halten)               |
| Hauptfeatures voll E2E            | 6/11                 | 9/11                       |
| Sidebar-sichtbare Routes          | 5                    | 11                         |
| Color-Contrast WCAG AA            | unklar               | 100%                       |

---

## Anhang A — Referenz-Dateien für jede Phase

### Frontend

- `apps/dashboard-frontend/src/App.tsx` (Router)
- `apps/dashboard-frontend/src/components/layout/Sidebar.tsx`
- `apps/dashboard-frontend/src/contexts/ChatContext.tsx` (1210 Zeilen!)
- `apps/dashboard-frontend/src/features/documents/DocumentManager.tsx` (1559 Zeilen!)
- `apps/dashboard-frontend/src/features/datentabellen/` (Vorbild für Feature-Struktur)
- `apps/dashboard-frontend/src/hooks/useApi.ts` (Retry-Logic Phase 4)
- `apps/dashboard-frontend/src/lib/queryClient.ts` (TanStack-Setup, dormant)
- `apps/dashboard-frontend/src/index.css` (100 KB → 50 KB)
- `apps/dashboard-frontend/vite.config.ts` (Bundle-Splitting Phase 1)

### Backend

- `apps/dashboard-backend/src/routes/llm.js` (Cancellation Phase 9)
- `apps/dashboard-backend/src/routes/documents.js` (1123 Zeilen, Phase 12)
- `apps/dashboard-backend/src/routes/telegram/app.js` (907 Zeilen, Phase 12)
- `apps/dashboard-backend/src/middleware/errorHandler.js` (asyncHandler — Vorbild)
- `apps/dashboard-backend/src/services/llm/llmOllamaStream.js` (Streaming)

### n8n

- `services/n8n/custom-nodes/n8n-nodes-arasul-llm/` (Vorbild)
- `services/n8n/custom-nodes/n8n-nodes-arasul-rag/` (Phase 10, neu)
- `services/n8n/custom-nodes/n8n-nodes-arasul-s3/` (Phase 10, neu)
- `services/n8n/workflows/` (4 Templates, Phase 10 erweitern)

### Config

- `compose/compose.app.yaml` (n8n + Services)
- `config/traefik/` (SSO Phase 10)
- `services/postgres/init/` (Migration 083 für Phase 9.6)

---

## Anhang B — Quick-Wins (1-Tag-Tasks ohne Risiko)

Diese können sofort gemacht werden, brauchen keine Phase:

1. **Skip-Link einbauen** (15 min) — sofortige A11y-Verbesserung
2. **Sidebar: 3 versteckte Routes hinzufügen** (30 min) — Discoverability +50%
3. **console.error Cleanup in Settings** (20 min) — keine Production-Logs mehr
4. **`#45ADFF` Hex in ProjectModal durch CSS-Var ersetzen** (10 min)
5. **Required-Field-Indicators (`*`)** in Login (5 min) — Vorbild für andere
6. **Database/Datentabellen-Overlap** — Database-Feature deprecaten (1h Diskussion + 30 min Code)
7. **Knowledge-Graph-Routes löschen** (15 min, falls confirmed dead)
8. **Tailwind PurgeCSS verifizieren** (30 min)
9. **`<QueryClientProvider>` in App.tsx mounten** (5 min!) — schaltet TanStack Query frei

---

**Ende des Plans.**

Bei Fragen oder zum Start einer Phase: Direkt aufrufen, ich navigiere durch die Implementierung.
