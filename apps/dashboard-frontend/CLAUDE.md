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
    settings/      Die Einstellungen als Sektionen (`sections.tsx` ist die eine
                   Quelle, geteilt von Sidebar-Panel und Mitte-Tab). Die
                   Sektion **System** trägt seit D5 sechs Unterbereiche
                   (Auslastung, Dienste, Aktualisierungen, **Sicherung**,
                   Selbstheilung, Werksreset); `?tab=sicherung` und
                   `?tab=updates` sind Tieflinks darauf. Seit D4
                   gehört die Sektion **Apps** dazu (`AppsSettings.tsx` plus
                   `apps/`): die Liste der Apps am Gerät, und je App die
                   Stände mit Schalter (`AppStaende.tsx`), die Tester
                   (`AppTester.tsx`, dieselben Hooks wie die Matrix), die Flows
                   mit ihrem Modell (`FlowAnsicht.tsx`, `ModellDialog.tsx`),
                   die Läufe mit Schritten und Gedankengang
                   (`LaufAnsicht.tsx`) und die Logs. Abfragen und Mutationen
                   stehen zusammen in `apps/useAppVerwaltung.ts`. Sie ist die
                   Verwaltungs-Sicht auf eine App; `features/apps/` ist die
                   Sicht dessen, der sie BENUTZT (D1). Zwei Ordner, zwei
                   Fragen, dasselbe Wort. Seit D3
                   gehört die Sektion **Mitarbeiter** dazu
                   (`MitarbeiterSettings.tsx` plus `mitarbeiter/`): die Liste
                   der Menschen am Gerät, die zwei Dialoge (anlegen,
                   Startpasswort setzen) und die **Freigabe-Matrix** Menschen
                   mal Apps. Abfragen und Mutationen stehen je Adresse
                   zusammen (`useMitarbeiter.ts`, `useAppFreigaben.ts`) — nach
                   jedem Ausgang wird die Liste entwertet, auch nach einem
                   Fehler. Die Verwaltung liegt hier und nicht als eigene
                   Ansicht in der ActivityBar: deren Einträge tragen die Arbeit
                   (Apps, Modelle), das Zahnrad darunter das Einrichten.
    modelle/       Die Kurzliste des Geräts (D5): `ModelleAnsicht.tsx` (die
                   Seite des `modelle`-Tabs), `ModellZeile.tsx` (ein Modell mit
                   seinen Handgriffen), `useModelle.ts` (Abfragen und
                   Mutationen) und `DownloadProgress.tsx`. Der frühere
                   `features/store/` mit Kartenraster, Facetten, Filterleiste
                   und Detailseite ist mit D5 gefallen: seit C8 hat der Katalog
                   vier Einträge, und über vier Zeilen sucht niemand.
    system/        Anmeldung, Systemzustand und Betrieb. Seit D5 gehört
                   `sicherung/` dazu (Sicherung auslösen, Liste,
                   Wiederherstellungstest, Kopie außerhalb) und
                   `geraetezustand.ts` — der Hook, der die Auslastung speist
                   (hieß `hooks/useDashboardData` und holte vier Wege, die
                   niemand las).
    apps/          Die eigenen Apps (D1): `meineApps.ts` (Hook + `zuEintraegen`,
                   eine App mit Live- UND Teststand ergibt ZWEI Einträge),
                   `Uebersicht.tsx` (die Mitte ohne offene App; die Freigaben
                   kommen als **Slot** herein, siehe unten) und
                   `AppRahmen.tsx` (die App im iframe auf `/apps/<id>/`).
                   **Kein `sandbox` am iframe** — es nähme ihm die eigene
                   Herkunft und damit das Sitzungscookie, an dem die
                   Forward-Auth aus C4 hängt. Den Rahmen setzt die CSP des
                   Geräts (`frame-src 'self'`).
    freigaben/     Die offenen Freigaben aus C7, entschieden in der Übersicht
                   (D2): `OffeneFreigaben.tsx` (Liste mit Titel, Zusammenhang,
                   Restzeit, Bestätigen und Ablehnen-mit-Begründung) und
                   `frist.ts` (die Restzeit in Worten, reine Funktion).
                   Abfrage und Mutationen stehen zusammen in
                   `hooks/useOffeneFreigaben.ts` — nach JEDEM Ausgang wird die
                   Liste entwertet, auch nach einem Fehler: ein 409 heißt
                   gerade, dass die Liste im Browser veraltet ist. Steht die
                   Liste leer, steht sie **gar nicht** da; ein Leerzustand wäre
                   auf der Übersicht eine Dauermeldung über etwas, das es nicht
                   gibt.
    notizen/       Der Zettel der rechten Spalte (D1). Ein Textfeld, speichert
                   nach einer Sekunde Ruhe gegen `PUT /api/notizen`.
    workspace/     Die Shell (Dreispalten-Raster, **immer aktiv** — `/` landet
                   nach Login stets auf `/workspace`, und `/workspace` ohne
                   weiteren Pfad auf der **Übersicht**). Seit D1 steht das
                   Zielbild: links Apps, Mitte Übersicht oder App, rechts
                   Notizen.
                   WorkspaceMenuBar (Marke + **zwei** Layout-Toggles [Sidebar,
                   Notizen] + Benutzermenü + Settings oben rechts — Settings
                   **nur für `admin`**), ActivityBar (eigene, **immer
                   sichtbare** schmale Spalte ganz links — außerhalb des
                   einklappbaren Panels — mit **Apps** oben, **Modelle**
                   [admin] darunter und dem Einstellungen-Zahnrad [admin]
                   unten),
                   SidebarHost
                   (Sidebar), Tab-Bar/-Content (Mitte), RightPanel (rechts,
                   Notizen), StatusBar (Modell + KI-RAM + Zahl der offenen
                   Freigaben). Feature-Tabs laufen je in
                   einem eigenen IsolatedMemoryRouter (FeatureTabHost) — seit
                   D5 gilt das nur noch für die Einstellungen, die drei
                   anderen rendern direkt. Cross-Feature-Links übersetzt die
                   TabBridge in Tab-Öffnungen.
                   • **Tab-Typen** — `dashboard`, `app`, `settings`, `modelle`
                     (`stores/workspaceStore.ts`, v10). Alle bis auf `app` sind
                     Singletons, `tabId()` ist dann der Typ; eine App trägt
                     `appId` und `stand` (`app:<id>:<stand>`), damit zwei Apps
                     nebeneinander offen sein können. Unbekannte Typen aus
                     alten Ständen (v7/v8) fallen in der Store-Migration, ein
                     alter `store`-Tab wird zu `modelle`, ein `app`-Tab ohne
                     Kennung fällt.
                   • **Die Rolle blendet aus, das Backend entscheidet.**
                     `nurFuerAdmin()` (Store) ist die eine Liste dafür; sie wird
                     an drei Stellen gelesen — ActivityBar (kein Knopf),
                     WorkspaceShell (eine getippte Admin-Adresse landet auf der
                     Übersicht) und TabContent (ein Alt-Tab zeigt einen Satz).
                     Keine davon ist eine Berechtigung: `requireRole` im
                     Backend antwortet ohnehin mit 403.
                   • **RightPanel** — die Notizen mit Schließen-Knopf; die Shell
                     versteckt sie per `data-shell-hidden` (nie unmounten —
                     ein Unmount während der Schreibpause verlöre den Text).
                     Zustand im Store: `rightPanelVisible`. **Unter 900 px ist
                     dasselbe Panel ein BLATT über der Mitte** und keine
                     Spalte daneben (D6, `data-shell-blatt` in `index.css`;
                     `data-shell-voll` gibt der Mitte die freie Breite).
                     Zustand dafür: `notizenBlattOffen` — **nicht
                     persistiert**, das Blatt fängt immer zu an, und jede
                     Ansicht, die kommt, schließt es. Zwei Felder, zwei
                     Fragen: gehört die Spalte zu meinem Arbeitsplatz (bleibt)
                     gegen liegt das Blatt jetzt gerade oben (nicht). Der eine
                     Knopf in der `WorkspaceMenuBar` schaltet je nach Breite
                     das eine oder das andere.
                   • **SidebarHost** — der Inhalt richtet sich nach der aktiven
                     Activity-Bar-Ansicht (`activeView`, Store): apps → die
                     eigenen Apps (Voreinstellung), models → die Kurzliste
                     (D5, vorher die Modell-Filter),
                     settings → Bereiche der Einstellungen
                     (`features/workspace/sidebar/*Panel.tsx`). Einen
                     Leerzustand gibt es seit D1 nicht mehr; ein Mitarbeiter mit
                     gespeicherter Admin-Ansicht sieht die Apps. Die Bar wählt
                     die Ansicht, `sidebarVisible` steuert
                     nur das Auf/Zu (⌘B / erneuter Klick).
                   • **Modelle** — EIN Mitte-Tab (`modelle`), seit D5 OHNE
                     eigenen MemoryRouter: er rendert `features/modelle/`
                     direkt, wie Übersicht und App. Die Seite ist die
                     Kurzliste aus C8 (vier Zeilen mit Laden, Standard,
                     Speicher, Entfernen) über `useStoreCatalog` und
                     `useMemoryBudget`; die linke Sidebar zeigt dieselben vier
                     als Liste (ModelsPanel). Der alte innere Pfad `/store`
                     führt aus dem Einstellungen-Tab über die TabBridge auf
                     den Modelle-Tab; `/workspace/store` bleibt als
                     Lesezeichen gültig (`pathToTabSpec`).
                   • **Apps** — die Liste der linken Spalte kommt aus
                     `GET /api/apps/meine` (siebt über `app_members`, C2) und
                     ist für beide Rollen dieselbe Abfrage: ein Administrator
                     sieht hier NICHT alle Apps des Geräts, sondern die, die
                     auch ihm freigegeben sind. Alle sieht `GET /api/apps`, ein
                     Verwaltungsweg.
                   • **Flächenfarbe** — alle Grundflächen (Sidebar, Mitte,
                     RightPanel) teilen `--background` (`bg-background`); Trennung
                     nur über Borders. `--card` bleibt erhabenen Elementen
                     vorbehalten (siehe DESIGN.md, Regel „eine
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
                   `docs/development/DESIGN.md`, Abschnitt
                   „Das gemeinsame Baustein-Set".
      shadcn/      shadcn/ui primitives (button, input, …) — generated.
    mascot/        Das Maskottchen.
  hooks/           Cross-feature hooks (useApi, useTheme, …).
  contexts/        Global state (Auth, Toast, Download, Activation).
  stores/          zustand stores (workspaceStore: Tabs, Sidebar-Ansicht, Spalten).
  lib/             queryClient, cn() helper.
  utils/           Pure utilities (csrf, formatting, token, lazyNachladen —
                   `React.lazy` mit zweitem und drittem Versuch, D6: ein
                   verlorenes `import()` strandete den Menschen sonst auf
                   einer Fehlerseite, obwohl an seinem Gerät nichts ist).
  config/          api.ts (API_BASE, getAuthHeaders).
  types/           Cross-feature TypeScript types.
  index.css        Tailwind v4 theme + Arasul design tokens (@theme block).
  App.tsx          Router, providers, lazy-loaded route shells. Was VOR der
                   Shell stehen kann, ist seit D4 abschließend: `CreateAdmin`
                   (das Gerät hat noch keinen Administrator) und
                   `PasswortWechseln` (ein Startpasswort, D1). Der
                   Einrichtungsassistent ist gestrichen — Begründung in
                   Migration 179.
```

**Rule of placement:** if it's used by exactly one feature → live there.
If it's used by ≥2 features → promote to `components/ui/` or `hooks/`.
A component in `features/X/` must not be imported from `features/Y/`.

Die **einzige** Stelle, die quer zusammensetzt, ist `features/workspace/` — die
Shell. Wenn zwei Features auf einer Seite stehen sollen (D2: Übersicht plus
offene Freigaben), reicht die Shell das eine als **Prop** in das andere hinein
(`<Uebersicht freigaben={<OffeneFreigaben />} />`), statt einen Querimport
aufzumachen. Ein Slot kostet eine Zeile und hält die Regel; ein Querimport
kostet nichts und hebt sie auf.

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

| You changed…                          | Also update                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A theme token / new color/radius/font | `docs/development/DESIGN.md`                                                                                                                                            |
| A user-facing flow                    | `docs/ops/ADMIN_HANDBUCH.md`                                                                                                                                            |
| Added a top-level route               | `App.tsx` lazy import + sidebar entry                                                                                                                                   |
| Added a workspace tab type            | `stores/workspaceStore.ts` (Typ + tabId/tabToPath/pathToTabSpec + `NUR_ADMIN`, wenn er der Verwaltung gehört) + `features/workspace/TabContent.tsx` (Route/Lazy-Import) |
| Touched API typings                   | Keep the matching backend `schemas/` happy                                                                                                                              |

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
