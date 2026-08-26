# CLAUDE.md — Dashboard Frontend

> React 19 SPA for the Arasul Platform. This file is the contract an AI agent
> follows when writing code under `apps/dashboard-frontend/`. For a feature
> overview, read `README.md` in this folder.

## Stack

React 19 · Vite 6 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
React Router v6 · TanStack Query v5 · Vitest · ESLint.

Path alias: `@/* → src/*` (configured in `tsconfig.json` and `vite.config.ts`).

## Folder convention

```
src/
  features/        Domain-organized UI. One folder per top-level route.
    settings/  store/  system/
    workspace/     Die Shell (Dreispalten-Raster, **immer aktiv** — `/` landet
                   nach Login stets auf `/workspace`; es gibt keinen Fallback-Flag
                   mehr). Seit Phase B2 (26.08.2026) sind Editor, Datei-Explorer,
                   Agent-Chat, Terminal und Sandbox aus der Oberfläche gefallen,
                   seit Phase B3 auch Flow-Editor, Erweiterungs-Store und der Tab
                   einer installierten Erweiterung; die linke Spalte ist ohne
                   gewählte Ansicht leer, die rechte Spalte ganz. Das Raster
                   bleibt, D1/D2 füllen die Spalten neu.
                   WorkspaceMenuBar (Marke + **zwei** Layout-Toggles [Sidebar,
                   rechte Spalte] + Settings oben rechts), ActivityBar (eigene,
                   **immer sichtbare** schmale Spalte ganz links — außerhalb des
                   einklappbaren Panels — mit der Ansicht **Modelle** und dem
                   Einstellungen-Zahnrad unten — Plan 012 Phase B; die
                   Kern-App-Einträge, zuletzt n8n, sind mit Phase B5 gefallen),
                   SidebarHost
                   (Sidebar), Tab-Bar/-Content (Mitte), RightPanel (rechts,
                   leer), StatusBar (Modell + KI-RAM). Feature-Tabs laufen je in
                   einem eigenen IsolatedMemoryRouter (FeatureTabHost);
                   Cross-Feature-Links übersetzt die TabBridge in Tab-Öffnungen.
                   • **Tab-Typen** — `settings`, `modelle`
                     (`stores/workspaceStore.ts`, v9). Jeder Typ ist ein
                     Singleton, `tabId()` ist der Typ. Alte Stände mit
                     `erweiterungen`/`flow`/`extension` (v7) und `automationen`
                     (v8) fallen in der Migration, ein alter `store`-Tab wird
                     zu `modelle`.
                   • **RightPanel** — leere Fläche mit Schließen-Knopf; die Shell
                     versteckt sie per `data-shell-hidden` (nie unmounten).
                     Zustand im Store: `rightPanelVisible`.
                   • **SidebarHost** — der Inhalt richtet sich nach der aktiven
                     Activity-Bar-Ansicht (`activeView`, Store): models → Modell-
                     Filter, settings → Bereiche der Einstellungen
                     (`features/workspace/sidebar/*Panel.tsx`); `null` (kein
                     Klick, alte Werte wie 'files'/'extensions'/'flows') → leere
                     Spalte. Die Bar wählt die Ansicht, `sidebarVisible` steuert
                     nur das Auf/Zu (⌘B / erneuter Klick).
                   • **Modelle** — EIN Mitte-Tab (`modelle`, innerer Pfad
                     `/store`), Full-Width-Kartenraster (StoreModelsGrid); ein
                     Klick auf eine Karte öffnet die Detailseite (StoreDetailPage)
                     mit „← Zurück". Katalog (Laden/Aktivieren/Standard/Löschen)
                     aus `useStoreCatalog`. Die Filter leben in der linken
                     Sidebar (StoreModelsFilterPanel), das Raster liest sie aus
                     dem `storeFilterStore` (Plan 012 Phase C); die Auswahl
                     (Karte oder Deep-Link `/store/models?highlight=…`) läuft
                     über den ephemeren `extensionStore` (`kind:'model'`). Der
                     alte `/store/apps`-Link landet wie jeder unbekannte Pfad
                     auf dem Raster.
                   • **Kern-Apps** — gibt es seit Phase B5 nicht mehr
                     (`useWorkspaceApps`, `/workspace-apps`, Tabelle
                     `platform_apps` sind weg); D1 baut die App-Liste auf dem
                     App-Modell aus C3 neu.
                   • **Flächenfarbe** — alle Grundflächen (Sidebar, Mitte,
                     RightPanel) teilen `--background` (`bg-background`); Trennung
                     nur über Borders. `--card` bleibt erhabenen Elementen
                     vorbehalten (siehe DESIGN_SYSTEM.md, Regel „eine
                     Flächenfarbe").
  components/
    ui/            App-wide primitives (Modal, ErrorBoundary, …). Darunter das
                   Baustein-Set aus Plan 023 C1, das die wiederkehrenden Formen
                   traegt: PageHeader (Seitenkopf), FilterBar (Tab-Leiste mit
                   eigener Inhaltsflaeche), StatTile/StatGrid (Kennzahl, festes
                   1/2/4-Raster), Chart/Sparkline (nur Blau nach Grau, ohne
                   Karte), Section (Feldgruppe), EmptyState (leere Liste mit
                   Einstieg) und AuthCard (Rahmen der beiden Seiten vor der
                   Anmeldung, C3). Eine neue Seite baut auf diesen sieben auf,
                   statt die Klassenkette erneut zu schreiben; Festlegungen in
                   `docs/development/DESIGN_SYSTEM.md`, Abschnitt
                   „Das gemeinsame Baustein-Set".
      shadcn/      shadcn/ui primitives (button, input, …) — generated.
    mascot/        Das Maskottchen.
  hooks/           Cross-feature hooks (useApi, useTheme, …).
  contexts/        Global state (Auth, Toast, Download, Activation).
  stores/          zustand stores (workspaceStore: Tabs, Sidebar-Ansicht, Spalten).
  lib/             queryClient, cn() helper.
  utils/           Pure utilities (csrf, formatting, sanitizeUrl, token).
  config/          api.ts (API_BASE, getAuthHeaders).
  types/           Cross-feature TypeScript types.
  index.css        Tailwind v4 theme + Arasul design tokens (@theme block).
  App.tsx          Router, providers, lazy-loaded route shells.
```

**Rule of placement:** if it's used by exactly one feature → live there.
If it's used by ≥2 features → promote to `components/ui/` or `hooks/`.
A component in `features/X/` must not be imported from `features/Y/`.

## Non-negotiable patterns

### 1. Every API call goes through `useApi`

```typescript
import { useApi } from '@/hooks/useApi';
import type { Flow } from '@/types/flows';

function FlowList() {
  const api = useApi();
  const load = async () => {
    const res = await api.get<{ flows: Flow[] }>('/flows');
    // ...
  };
}
```

`useApi` provides `get / post / put / patch / del / request`, auto-handles
auth headers, CSRF token, JSON parsing, 30 s timeout, 401-redirect, and
toast errors. It also normalizes the backend error envelope
(`{ error: { code, message, details } }`) into a flat `ApiError` with
`.status`, `.code`, `.details`. **Never call `fetch()` directly.**

### 2. TypeScript only — `.tsx` / `.ts`

`tsconfig.json` runs `strict: true` and `noUncheckedIndexedAccess`. New code
must be TypeScript. Don't add `.js` files; if you find one, prefer migrating
it as part of your task only when it's the file you need to edit.

### 3. Server state → React Query, client state → Context or local

- **Server data** that you read across re-renders: `useQuery` /
  `useMutation` against `lib/queryClient.ts`. Cache key = the API path.
- **Cross-page session state** (auth, toasts, downloads):
  one of the contexts in `src/contexts/`.
- **Page-local state**: `useState` / `useReducer`. Don't reach for context.

### 4. Theming — CSS variables, never hex literals

The whole color system lives in `src/index.css` as Tailwind v4 `@theme`
tokens (`--color-primary-*`, `--color-bg-*`, `--color-text-*`, …) plus
shadcn's CSS variables. Always reference via Tailwind utilities
(`bg-bg-card`, `text-text-primary`, `border-border-subtle`) or
`var(--…)` in `style={}`. **Never** inline `#1a2330` etc. — that bypasses
the theme and breaks light-mode / future re-skins.

### 5. shadcn/ui via `@/components/ui/shadcn/<name>`

Add components with the official CLI (do not paste the code by hand):

```bash
cd apps/dashboard-frontend && npx shadcn@latest add dialog
```

`components.json` already pins `style: new-york`, `tsx: true`, `iconLibrary:
lucide`. App-specific wrappers live in `components/ui/` (one level up).

### 6. Code-splitting for non-critical routes

`App.tsx` lazy-loads every secondary route via `React.lazy(() => import(...))`
inside a `<Suspense fallback={...}>` boundary. New top-level features should
follow that pattern; the Login and the shell are eagerly imported.

### 7. Errors — wrap routes with `RouteErrorBoundary`, components with `ComponentErrorBoundary`

Both come from `components/ui/ErrorBoundary`. Never let a thrown render
error crash the SPA — at minimum wrap each route element.

## Forbidden

- ❌ `fetch(...)` outside `useApi.ts` — every call goes through the hook.
- ❌ New `.js` files; don't write JSX without TypeScript.
- ❌ Hardcoded hex colors / pixel values when a theme token exists.
- ❌ Importing from `features/<other>/` — promote shared code first.
- ❌ Mutating data via `useEffect` chains when React Query covers it.
- ❌ `any` for return types from `api.get|post|...` — pass a type parameter.
- ❌ `console.log` left in shipping code.

## Testing

```bash
cd apps/dashboard-frontend
npm test                      # Vitest, src/__tests__/ + co-located *.test.tsx
npm run test:ci               # with coverage
npm run lint                  # ESLint (.ts/.tsx)
npm run knip                  # toter Code: Dateien, Exporte, Abhängigkeiten (CI-Job „Dead code")
```

Test setup: `src/setupTests.ts` (Vitest + jest-dom). Mock `useApi` via
`vi.mock('@/hooks/useApi', ...)`.

## When you change something

| You changed…                          | Also update                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A theme token / new color/radius/font | `docs/development/DESIGN_SYSTEM.md`                                                                                        |
| A user-facing flow                    | `docs/ops/ADMIN_HANDBUCH.md`                                                                                               |
| Added a top-level route               | `App.tsx` lazy import + sidebar entry                                                                                      |
| Added a workspace tab type            | `stores/workspaceStore.ts` (Typ + tabId/tabToPath/pathToTabSpec) + `features/workspace/TabContent.tsx` (Route/Lazy-Import) |
| Touched API typings                   | Keep the matching backend `schemas/` happy                                                                                 |

## Deploy

```bash
docker compose up -d --build dashboard-frontend
```

Build runs `vite build` in the container; nginx serves the result. No local
dev server — the user tests in the browser after each rebuild.

**Lockfile:** root-only (see root `CLAUDE.md` rule 7). There is no
`apps/dashboard-frontend/package-lock.json`. The Dockerfile installs from the
single root lock via `npm ci --workspace=arasul-dashboard-frontend --include-workspace-root`.
To add/upgrade a dependency, edit this `package.json` then run `npm install`
from the **repo root** so the root lock regenerates.
