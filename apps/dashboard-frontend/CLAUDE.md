# CLAUDE.md — Dashboard Frontend

> React 19 SPA for the Arasul Platform. This file is the contract an AI agent
> follows when writing code under `apps/dashboard-frontend/`. For a feature
> overview, read `README.md` in this folder.

## Stack

React 19 · Vite 6 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
React Router v6 · TanStack Query v5 · Vitest · ESLint.

Path aliases (both in `tsconfig.json` and `vite.config.ts`):

- `@/* → src/*`
- `@marken → ../../packages/marken/src` — **das Designsystem**, geteilt mit
  **jeder App** auf dem Gerät. Ein Pfad-Alias und **kein npm-Paket**: die
  Bibliothek wird mit der Shell übersetzt, steht in keinem Lockfile und hat
  kein `dist/`, das jemand vergessen könnte. Drei Sätze plus Tokens:
  - **Primitive** (`src/primitive/`, 46 Stück, auf Radix + Tailwind): Button,
    Input, Select, Dialog, Sheet, Tabs, Card, Table, Calendar, Chart, Command,
    Sidebar, … **Der einzige Ort dafür** — ein zweiter Button in der Shell ist
    ein Befund (`scripts/test/bausteine.py`). `Drawer` und `Sonner` gibt es
    bewusst nicht: das eine ist `Sheet side="bottom"`, das andere `Toast`.
  - **Muster** (`src/muster/`, 11 Stück): Datenliste, Suchauswahl,
    Dateiablage, Seitenleiste, Formularseite mit Feldgruppe, Leerzustand,
    Ladezustand, `Dialogform`, `Bestaetigung` (auf `AlertDialog`),
    `Kennzahl`/`Kennzahlen`, `Freigabe` (Liste, Einzelansicht, Bestätigen,
    Ablehnen mit Pflichtgrund, wer entschied, Frist — die Form, in der eine App
    eine Freigabe zeigt, J36), `Dokumentanzeige` (PDF via pdf.js als
    nachgeladener Chunk, CSP-konform ohne eval, plus Bilder mit
    Seitenblättern/Zoom/Vollbild — als einziges Muster auf reinem CSS, läuft
    auch in einer App ohne Bau). Ein Muster ist eine Zusammensetzung aus
    Primitiven, die eine Aufgabe löst und trotzdem nichts von Arasul weiß.
  - **Bausteine** (Kopf, Liste, Karte, Formular/Feld/Knopf, Meldung, Menü):
    reines CSS, laufen in einer App **ohne** Bau. `useSchmalesFenster` (die
    eine Schwelle des Produkts, 900 px) liegt hier, weil `Sidebar` und
    `Datenliste` ihn brauchen und ein Baustein der Bibliothek nicht aus der
    Shell importieren darf.
  - `cn()` — liegt bei den Primitiven; `@/lib/utils` gibt es nicht mehr.
  - `theme.css` — die Tokens (`@theme`, `@theme inline`, `:root`,
    `[data-theme='dark']`). `index.css` holt sie mit einem `@import`
    **ohne Schicht** (ein `@theme` in `layer(...)` wäre keins) und zeigt
    Tailwind mit `@source` auf `packages/marken/src`, sonst fände es die
    Klassen der Primitive nicht. `marken.css` kommt in `index.css` als
    relativer `@import … layer(components)` herein (unlayered CSS gewinnt
    gegen jede Schicht, auch gegen die Utilities).

  **Zur Laufzeit** liefert das Gerät die Bibliothek unter `/marken/<haupt>/`
  aus (alle drei Sätze, React, fertig übersetztes `marken.css`): `npm run
build` baut sie nach der Shell mit `packages/marken/laufzeit.config.mjs` nach
  `dist/marken/`, `nginx.conf` setzt die Cache-Köpfe. Eine App mit
  `"marken": "5"` lädt von dort (`docs/features/APPS.md`).

  Details, Versionsstand und wie die Bibliothek entstanden ist (Phasen
  H1 bis H7): [`packages/marken/README.md`](../../packages/marken/README.md),
  [`docs/development/DESIGN.md`](../../docs/development/DESIGN.md),
  [`docs/plans/HISTORIE.md`](../../docs/plans/HISTORIE.md).

## Folder convention

```
src/
  features/        Domain-organized UI. One folder per top-level route.
    einstellungen/ Die persönlichen Einstellungen, für alle gleich (M5, Ansicht
                   `settings`, das Zahnrad der Aktivitätsleiste): vier Abschnitte Profil (`ProfilFormular.tsx`:
                   Vorname, Nachname, Funktion, Kürzel, Bild), Passwort
                   (`PasswordManagement.tsx`), Angemeldete Rechner (die Ausweise
                   der Person, „abmelden" widerruft; erzeugt wird im Browser
                   nie einer, `useAusweise.ts`) und Erscheinungsbild (System,
                   hell, dunkel; `useTheme` löst `system` selbst auf). Kein
                   Kopf mit Logo, oben steht gleich „Profil", die vier
                   Abschnitte untereinander. Das Kontomenü (eigenes Bild
                   unten in der Aktivitätsleiste) zeigt nur Name und Abmelden.
    settings/      Die **Verwaltung** (Ansicht `verwaltung`, nur für den
                   Admin; der Ordnername ist alt). Gebaut wie eine App
                   (`Settings.tsx`): eine eigene schmale Leiste der Bereiche
                   links (`Liste dicht` aus `@marken`, unter 900 px ein
                   `Select` darüber), daneben der Bereich, ohne zweite
                   Reiterstufe. Der Bereich steht in der Ansicht des
                   Workspace-Stores und damit in der Adresse
                   (`/workspace/verwaltung/<bereich>[/<abschnitt>]`); alte
                   `?tab=`-Adressen bildet die Shell darauf ab.
                   `sections.tsx` ist die eine Liste der Bereiche:
                   - **System**: Auslastung, Dienste, Aktualisierungen,
                     Sicherung, Selbstheilung, Werksreset untereinander,
                     jeder klappt auf (`Accordion`, nur Offenes ist
                     gemountet; `/workspace/verwaltung/system/sicherung`
                     kommt aufgeklappt an).
                   - **Modelle**: `features/modelle/`, von der Shell als
                     Slot `modelle` hereingereicht.
                   - **Apps** (`AppsSettings.tsx` + `apps/`): Liste mit
                     einem Satz je App und höchstens dem Tag „(Test)"; je
                     App GENAU EINE Seite (`AppAnsicht.tsx`, M5, Adresse
                     `/workspace/verwaltung/apps/<kennung>` über
                     `abschnitt`) mit den Blöcken in fester Reihenfolge:
                     Zustand (`AppZustand.tsx`), Fassungen mit Live
                     schalten und zurück (`AppStaende.tsx`,
                     `LiveSchaltenDialog.tsx`, Technik aufgeklappt),
                     Personen mit Testpersonen (`AppPersonen.tsx`),
                     Freigabestufen (`AppStufen.tsx`), Flows mit Schalter
                     „aktiv", Art, Auslöser und Schritten
                     (`AppFlows.tsx`, Datei in `FlowAnsicht.tsx`, Modell
                     in `ModellDialog.tsx`), Verbindungen lesbar benannt
                     (`AppVerbindungen.tsx`, `useVerbindungen.ts`, rot nur
                     bei `stoerung`); darunter auf „Zeigen" Läufe
                     (`LaufAnsicht.tsx`), KI-Aufrufe, Protokoll
                     (`Aufklappen.tsx`). Abfragen/Mutationen in
                     `apps/useAppVerwaltung.ts`. Apps, Flows und
                     Verbindungen gibt es nirgends sonst in der Oberfläche
                     (die Tabelle Apps unter Personen schaltet dieselben
                     Freigaben). `features/apps/` ist die Nutzer-Sicht —
                     zwei Ordner, zwei Fragen, dasselbe Wort.
                   - **Personen** (`PersonenSettings.tsx` +
                     `personen/`, M5; ersetzt den Reiter „Mitarbeiter",
                     Tieflink bleibt `?tab=benutzer`): Liste mit Bild und
                     Namen, Anlegen mit Vorname/Nachname/E-Mail
                     (`PersonAnlegenDialog.tsx`), Startpasswort einmal als
                     Text oder Zettel (`StartpasswortDialog.tsx`), Sperren,
                     Schalter „Verwaltung" (der letzte Admin bleibt, das
                     Backend weist ab), Freigaben als zwei Tabellen mit fester
                     erster Spalte: Apps (Schalter, `FreigabeMatrix.tsx`) und
                     Ordner (Stufe, `firmenordner/RechteMatrix.tsx`).
                     `usePersonen.ts`, `useAppFreigaben.ts` — Liste nach jedem
                     Ausgang entwerten, auch nach Fehler. Das eigene Profil
                     (`features/einstellungen/`) trägt Vorname, Nachname,
                     Funktion, Kürzel, Bild; die erste Anmeldung zeigt Name
                     und Bild zum Prüfen (`PasswortWechseln`).
                   - **Firmenordner** (`FirmenordnerSettings.tsx` +
                     `firmenordner/`): Ordnerbaum (`OrdnerBaum.tsx`),
                     Anlegen/Wegwerfen (Kennung abtippen), Rechte-Matrix
                     Menschen mal Ordner (`RechteMatrix.tsx`; Wurzel und
                     Geräteordner ohne Spalte, 409 als Satz über der Matrix),
                     Änderungen je Ordner (`AenderungenDialog.tsx`).
                     `firmenordner/useFirmenordner.ts`.
    modelle/       Die Kurzliste des Geräts: `ModelleAnsicht.tsx` (der Bereich
                   „Modelle" der Verwaltung), `ModellZeile.tsx`, `useModelle.ts`
                   (Abfragen/Mutationen), `DownloadProgress.tsx`. Der Katalog
                   hat vier Einträge — kein Kartenraster, keine Facetten,
                   keine Detailseite.
    system/        Anmeldung, Systemzustand und Betrieb, darunter
                   `sicherung/` (Sicherung auslösen, Liste,
                   Wiederherstellungstest, Kopie außerhalb) und
                   `geraetezustand.ts` (speist die Auslastung).
    apps/          Die eigenen Apps: `meineApps.ts` (Hook + `zuEintraegen`,
                   eine App mit Live- UND Teststand ergibt ZWEI Einträge),
                   `Uebersicht.tsx` (die Startseite; „Für Sie" und die
                   Admin-Hinweise kommen als **Slot** herein, siehe unten) und `AppRahmen.tsx` (App
                   im iframe auf `/apps/<id>/`). **Kein `sandbox` am
                   iframe** — es nähme ihm die eigene Herkunft und damit das
                   Sitzungscookie, an dem die Forward-Auth hängt; den Rahmen
                   setzt die CSP (`frame-src 'self'`). Dieselbe Herkunft
                   trägt das **Theme** in die App: `AppRahmen` schreibt
                   `data-theme` in das Dokument (bei jedem `load` und jedem
                   Wechsel) und schickt `postMessage {typ:'arasul:theme',
                   theme}`. Das Theme steht **weder im `key` noch in der
                   Adresse** — beides tauschte das iframe-Element aus, und
                   die App finge von vorn an.
    firmenordner/  Mein Firmenordner, für jeden: ein Dialog (derzeit nirgends
                   angeschlossen, seit das Kontomenü nur Name und Abmelden
                   zeigt) — Adresse des
                   Dienstes und eigene Ordner mit Stufe aus
                   `GET /api/firmenordner`. Ein 503 heißt „hier gibt es
                   keinen" und ist eine Auskunft, kein Fehler.
    freigaben/     „Für Sie" auf der Startseite, seit M5 (04.10.2026) für
                   JEDEN: nur die Freigaben, die bei mir liegen (bei mir
                   persönlich oder, ohne Standardperson der Stufe, bei allen
                   mit Zugang; das Backend filtert). Je Freigabe EINE ZEILE:
                   Gegenstand, App, seit wann; ein Klick öffnet eine App, die im
                   Manifest `zeigt_freigaben` erklärt, beim Vorgang
                   (`oeffne({type:'app', vorgang})`, Adresse
                   `?freigabe=<nummer>`); jede andere (Rückfall, Kontrakt 12,
                   `APP-PAKET.md`) öffnet die Freigabe HIER mit dem Baustein
                   `Freigabe` und kehrt danach zur Liste zurück. Darunter bei wem
                   sie liegt und „Weitergeben an …" (nur an den Kreis), beim
                   Admin ohne Standardperson ein Hinweis auf die Verwaltung;
                   zugeklappt, was bei anderen liegt, mit „Übernehmen".
                   `OffeneFreigaben.tsx`, `frist.ts`. Abfragen und Mutationen
                   in `hooks/useOffeneFreigaben.ts` — nach JEDEM Ausgang wird
                   die Liste entwertet, auch nach Fehler: ein 409 heißt gerade,
                   dass die Liste veraltet ist. Die Zahl am Haus zählt nur „bei
                   mir". Leer steht dort eine Zeile („Keine Freigabe liegt bei
                   Ihnen.").
    entwickler/    Die Schauseite der Bibliothek: `/entwickler/bausteine`,
                   jedes Primitiv **und jedes Muster** aus `@marken` in
                   allen Zuständen, hell und dunkel. Drei Dateien:
                   `Schauseite.tsx`, `SchaustueckeH4.tsx`,
                   `SchaustueckeMuster.tsx`. In **keinem** Menü — sie ist für
                   den, der eine App baut. Gemessen von
                   `scripts/test/schauseite.mjs`.
    workspace/     Die Shell (M5, Karte rahmen-aktivitaetsleiste): links die
                   Aktivitätsleiste, daneben genau EINE Ansicht, unten die
                   StatusBar (für jeden gleich: Name, Datum, Uhrzeit,
                   minutengenau; nie Modell, Speicher, Verbindung, Fassung —
                   keine Abfrage ans Gerät). Es gibt
                   keine Kopfleiste, keine Tab-Leiste, keine rechte Spalte
                   und keine zweite Seitenleiste. **Immer aktiv** — `/`
                   landet nach Login auf `/workspace`, ohne weiteren Pfad auf
                   der **Startseite**.
                   • **ActivityBar** — oben das Haus (Startseite, mit der
                     Zahl offener Freigaben aus `useOffeneFreigaben`),
                     darunter die eigenen Apps als Symbol (`symbol` aus
                     `app.json`: Lucide-Name, nachgeladen in `AppSymbol.tsx`,
                     oder Kürzel; ohne Symbol das Kürzel aus dem Namen) mit dem
                     Namen im Tooltip (`GET /api/apps/meine`, ab etwa zehn
                     rollt der Teil). Jeder ordnet sie durch Ziehen oder mit
                     Alt+Pfeil hoch/runter; die Reihenfolge liegt am Gerät
                     (`GET/PUT /api/apps/reihenfolge`, `useAppReihenfolge`),
                     nicht im Browser, unten fest Verwaltung [admin], Zahnrad [alle] und
                     das eigene Bild (Popover: Name, Abmelden). Auswahl ist
                     eine getönte Fläche (`bg-primary/12`), kein Balken;
                     Hover blendet in 120 ms ein, `motion-reduce` gilt. Das
                     Logo des Hauses gehört über das Haus, sobald es sich
                     hinterlegen lässt.
                   • **Startseite** — Gruß mit Vorname (sonst Anzeigename),
                     „Für Sie", Kacheln (`features/apps/Uebersicht.tsx`); beim
                     Admin zuletzt `AdminHinweise` (`useAdminHinweise.ts`:
                     Sicherung fehlgeschlagen/älter als ein Tag, Update bereit,
                     App gestört, Fassung wartet auf Live, Lizenz knapp; mit
                     den Schlüsseln der Verwaltung, leer ist leer — keine
                     grünen Meldungen). Die Shell reicht beides als Slot.
                   • **AnsichtInhalt** — die Weiche (`AnsichtWeiche`) und
                     die ErrorBoundary; der Schlüssel ist `ansichtId`,
                     ein Wechsel baut neu auf, ein Bereich der Verwaltung
                     nicht. Die Apps stehen im `AppStapel`: die offene und
                     die letzten drei Apps, die man verlassen hat, bleiben
                     als `invisible inert` gemountet (Eingaben und
                     Scrollstand bleiben), die vierte fällt heraus.
                   • **Ansichten** — `dashboard`, `app`, `settings`
                     [persönlich, alle], `verwaltung` [admin, mit `bereich`
                     und `abschnitt`] (`stores/workspaceStore.ts`). Eine App
                     trägt `appId` und `stand`. **Nichts wird gespeichert**:
                     die Ansicht steht vollständig in der Adresse, die Shell
                     spiegelt beide ineinander. `/workspace/modelle` und
                     `/workspace/store` landen im Bereich Modelle.
                   • **Die Rolle blendet aus, das Backend entscheidet.**
                     `nurFuerAdmin()` (Store) ist die eine Liste dafür,
                     gelesen von der Shell (Adresse) und der Ansicht (der
                     Satz statt der Seite). `requireRole` im Backend
                     antwortet ohnehin mit 403.
                   • **Unter 900 px** bleibt es bei derselben Leiste, bis die
                     Karte handy-und-notizen-weg sie zur Leiste unten macht.
                   • **Flächenfarbe** — Leiste und Ansicht teilen
                     `--background`; Trennung nur über Borders. `--card`
                     bleibt erhabenen Elementen vorbehalten (DESIGN.md).
  components/
    ui/            NUR NOCH, WAS ÜBER DIESES GERÄT BESCHEID WEISS. Eine neue
                   Seite baut auf `@marken` auf, statt die Klassenkette neu
                   zu schreiben (Festlegungen: `docs/development/DESIGN.md`).
                   Übrig sind VIER, und jede weiß etwas über dieses Gerät:
                   `AuthCard` (Maskottchen, Produktname), `Skeleton.tsx`
                   (Form einer Zeile HIER), `NichtGefunden` (Adresse des
                   Arbeitsbereichs), `ErrorBoundary`. Der Ordner ist NICHT
                   von `bausteine.py` ausgenommen: ein `h1`, eine Tab-Leiste
                   oder ein handgebauter Dialog ist überall unter `src/` ein
                   Befund.
    mascot/        Das Maskottchen.
  hooks/           Cross-feature hooks (useApi, useTheme, …).
                   `useSchmalesFenster` steht NICHT hier, sondern in
                   `@marken` — es gibt genau eine Schwelle (900 px) im
                   Produkt, und die Bibliothek braucht sie selbst. `useTheme`
                   liest das Theme des Angemeldeten aus dem `AuthContext`
                   (`admin_users.theme`) und schreibt es über
                   `PUT /api/darstellung` — nicht in den `localStorage`.
  contexts/        Global state (Auth, Toast, Download, Activation).
  stores/          zustand stores (workspaceStore: die eine offene Ansicht).
  lib/             queryClient. `cn()` steht in `@marken` — ein Primitiv
                   dort darf nicht aus der Shell importieren.
  utils/           Pure utilities (csrf, formatting, token, lazyNachladen —
                   `React.lazy` mit zweitem und drittem Versuch: ein
                   verlorenes `import()` strandete den Menschen sonst auf
                   einer Fehlerseite, obwohl an seinem Gerät nichts ist;
                   `lazyMitVorladen` dazu mit `vorladen()` für den Leerlauf —
                   React 19 enthüllt eine frisch suspendierende Ansicht erst
                   nach rund 300 ms, die Shell lädt Einstellungen, Verwaltung
                   und Modelle deshalb vor).
  config/          api.ts (API_BASE, getAuthHeaders).
  types/           Cross-feature TypeScript types.
  index.css        Import der Tokens aus `@marken/theme.css` plus die
                   Shell-eigenen Regeln (Aliasse, Alpha-Skalen, Komponenten-CSS).
  App.tsx          Router, providers, lazy-loaded route shells. Was VOR der
                   Shell stehen kann, ist abschließend: `CreateAdmin` (das
                   Gerät hat noch keinen Administrator) und
                   `PasswortWechseln` (ein Startpasswort). Der
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

The whole color system lives in `packages/marken/src/theme.css` as Tailwind
v4 `@theme` tokens (`--color-primary-*`, `--color-bg-*`, `--color-text-*`, …)
plus shadcn's CSS variables — nicht in `index.css`, weil eine App sie genauso
braucht wie die Shell. `index.css` behält nur die Aliasse darauf, die
Alpha-Skalen, Schatten, Verläufe und die Syntaxfarben. Always reference via
Tailwind utilities (`bg-bg-card`, `text-text-primary`, `border-border-subtle`)
or `var(--…)` in `style={}`. **Never** inline `#1a2330` etc. — that bypasses
the theme and breaks light-mode / future re-skins.

Es gibt zwei Themes: `:root` ist **Hell** (die Vorgabe), `[data-theme='dark']`
auf `<html>` überschreibt. Es gibt keine Klasse `.light` mehr —
`check-design-system.js` schlägt fehl, sobald eine auftaucht. Die Klasse
`dark` bleibt, sie hält die `dark:`-Utilities am Leben. Eine neue Farbe gehört
in **beide** Blöcke. `packages/marken/src/marken.css` hat dieselbe Form,
damit eine App im iframe dem Theme folgen kann: jeder `--ara-*`-Wert dort ist
eine **Kopie** des Tokens aus `theme.css` (`var(--token, <Rückfall>)`), und in
der Shell gewinnt immer der Token — eine veraltete Kopie fällt hier nie auf,
nur in einer App ohne Bau. Wer einen Token ändert, ändert den Rückfall mit —
`scripts/test/marken.py` hält beides aneinander.

**Kein Farbliteral in einem Primitiv** — weder ein Hex noch ein `rgb()` noch
eine Klasse aus Tailwinds eingebauter Palette (`bg-black/50`, `text-red-500`),
die Palette folgt keinem Thema. Der Schleier unter jedem Dialog ist deshalb
ein Token (`bg-backdrop`). Wie es zu dieser Form kam (Phasen H1–H3):
[`docs/plans/HISTORIE.md`](../../docs/plans/HISTORIE.md).

### 5. Primitive kommen aus `@marken` — und **nur** von dort

```typescript
import { Button, Dialog, DialogContent, Input, Label } from '@marken';
```

Sie liegen in `packages/marken/src/primitive/`, nicht unter `components/ui`.
Wer einen Namen, den `@marken` schon ausgibt, in der Shell noch einmal
erklärt, wird von `scripts/test/bausteine.py` gemeldet: zwei Bausteine unter
einem Namen sind die Verwechslung selbst.

Ein neues Primitiv:

```bash
cd apps/dashboard-frontend && npx shadcn@latest add switch
```

`components.json` zeigt mit `ui: "@marken/primitive"` und
`css: "../../packages/marken/src/theme.css"` dorthin. Danach: in
`primitive/index.ts` eintragen, ein Schaustück auf `/entwickler/bausteine`
(sonst ist `bausteine.py` rot), `src/fassung.ts` heben.

App-spezifische **Zusammensetzungen** — `AuthCard`, `SkeletonList`,
`NichtGefunden`, `ErrorBoundary` — bleiben in `components/ui/`. Die Grenze ist
zweistufig: ein **Primitiv** weiß nichts von Arasul, ein **Muster** auch
nicht (es ist nur aus mehreren gemacht), und was eine Route, einen Endpunkt,
einen Benutzer oder die Marke kennt, bleibt in der Shell. Wer eine
Zusammensetzung dort einträgt, prüft zuerst, ob sie diesen Test besteht —
`Modal`, `FilterBar` und `StatTile` bestanden ihn nicht und sind seither in
`@marken` gewandert.

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

| You changed…                          | Also update                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A theme token / new color/radius/font | `packages/marken/src/theme.css` (dort stehen sie) + `docs/development/DESIGN.md`                                                                                                       |
| Ein neues Primitiv                    | `packages/marken/src/primitive/index.ts` + ein Schaustück auf `/entwickler/bausteine` + `src/fassung.ts` heben                                                                         |
| Ein neues Muster                      | `packages/marken/src/muster/index.ts` + ein Schaustück (`SchaustueckeMuster.tsx`) + `src/fassung.ts` heben                                                                             |
| A user-facing flow                    | `docs/ops/ADMIN_HANDBUCH.md`                                                                                                                                                           |
| Added a top-level route               | `App.tsx` lazy import + sidebar entry                                                                                                                                                  |
| Added a workspace view type           | `stores/workspaceStore.ts` (Typ + ansichtId/ansichtZuPfad/pfadZuAnsicht + `nurFuerAdmin`, wenn er der Verwaltung gehört) + `features/workspace/AnsichtInhalt.tsx` (Weiche/Lazy-Import) |
| Touched API typings                   | Keep the matching backend `schemas/` happy                                                                                                                                             |

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
