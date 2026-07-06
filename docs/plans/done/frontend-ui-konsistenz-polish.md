# Frontend UI — Konsistenz & Polish (Foundation-first)

> Vereinheitlicht die Dashboard-UI auf einen einzigen Token-/Primitive-Layer:
> Legacy-CSS in `index.css` wird abgebaut und auf shadcn/Tailwind-Primitives
> migriert, Component-States (hover/focus/disabled/loading) werden konsistent,
> `DESIGN_SYSTEM.md` wird zum verbindlichen, resynct Vertrag.

## Ausgangslage (aus Research)

Die Komponenten-Ebene ist bereits weit migriert: shadcn `Button` in 54,
`Card` in 39 Dateien; **0** Tailwind-Arbitrary-Hex-Klassen (`bg-[#...]`); die
„keine Hex-Literale"-Regel ist in `.tsx` faktisch schon eingehalten. Die
**Inkonsistenz ist konzentriert**, nicht flächig:

- `apps/dashboard-frontend/src/index.css` (4762 Zeilen) mischt den Token-Layer
  (`@theme`/`:root`/`.light`, legitim) mit **~2000 Zeilen hand-gerolltem
  Legacy-CSS** (`.card`, `.nav-link`, `.metric-card-minimal`,
  `.service-link-card`, `.btn-*`, `.sidebar*`) — teils mehrfach/überlappend
  definiert (`.service-link-card` an 5+ Stellen).
- Legacy `.btn-*`/`.card`/`.nav-link`-Klassen leben noch in `App.tsx`,
  `DashboardHome.tsx`, `Login.tsx`, `CreateAdmin.tsx`,
  `database/components/TableCard.tsx`.
- Viele Legacy-Regeln hardcoden `transition: all 0.2s/0.3s ease` statt der
  bereits existierenden `--transition-*`-Tokens.
- `DESIGN_SYSTEM.md` (v2.0.0) ist überwiegend synchron, aber der
  CSS-Variablen-Referenzblock (Z. 903–970) listet die **alte** flache
  Spacing-Scale (`--space-1…8`) statt der aktuellen benannten Scale
  (`--space-2xs…3xl`).
- Quality-Gates sind blind: `check-code-quality.js` matcht nur `.js/.jsx`
  (→ 0 Dateien im TS-Frontend), `check-design-system.js` nur `.css`.

## Goal & Success Criteria

**Done heißt:** Die gesamte UI zieht Styling aus **einer** Quelle — Tokens +
shadcn/Tailwind-Primitives. Konkret sichtbar/prüfbar:

- Keine funktionalen `.btn-*`/`.card`/`.nav-link`-Legacy-Klassen mehr in
  produktivem Markup; betroffene Views nutzen die Primitives.
- Component-States (hover/focus-visible/disabled/loading) sind über alle
  Primitives einheitlich und via `cva()`+`cn()` definiert.
- `index.css` ist um die migrierten Legacy-Blöcke verschlankt, Duplikate
  (`.service-link-card`) konsolidiert, hardcodierte Transitions durch
  `--transition-*`-Tokens ersetzt.
- `DESIGN_SYSTEM.md` ist resynct (Spacing-Referenz aktuell) und als Vertrag gültig.
- Alle 30 Frontend-Testdateien bleiben grün; `theme.test.tsx` insb.
- Live im Browser auf dem Jetson (https://192.168.0.197) je Kern-View visuell
  verifiziert (Vorher/Nachher-Screenshots), kein sichtbarer Regress.

## Scope

**In scope:**

- Token-Layer härten + `DESIGN_SYSTEM.md`-Referenz resyncen.
- Shared Primitives (shadcn button/card/input/badge + Wrapper Modal/Skeleton/
  LoadingSpinner/DataStateRenderer) auf einheitliche States bringen.
- Migration der Legacy-Klassen in `Login.tsx`, `CreateAdmin.tsx`,
  `TableCard.tsx`, `App.tsx`, `DashboardHome.tsx` auf Primitives/Tokens.
- Konsolidierung + Verschlankung der zugehörigen Legacy-CSS-Blöcke in `index.css`.
- Quality-Gate-Schwellen nach unten ratchen, wo Legacy-CSS reduziert wurde.

**Out of scope:**

- Kein Redesign / keine neue Informationsarchitektur / keine Navigations-Umbauten.
- Keine DB-Migration (bestätigt: reine Frontend-Arbeit).
- Keine Änderung an API-Verträgen; `useApi`-Aufrufe bleiben unverändert
  (die „Datenfluss"-Freigabe wird nur genutzt, falls eine Primitive-Migration
  einen State minimal umverdrahten muss — kein spekulativer Hook-Refactor).
- xterm-Palette (`useTerminal.ts`), Mermaid-Farben bleiben (dokumentierte
  Ausnahme) — außer trivialer Token-Anbindung wo gefahrlos möglich.
- Keine neue Visual-Regression-Tooling-Einführung (nur manuelle+Playwright-Prüfung).

## Acceptance Criteria

- [ ] `grep` nach `class(Name)?=.*\b(btn-global|btn-primary|btn-secondary|btn-ghost|btn-retry|nav-link)\b` in `src/**/*.tsx` → 0 produktive Treffer.
- [ ] Jede gehärtete Primitive definiert ihre States via `cva()`+`cn()`, keine neuen hand-geschriebenen `:hover`/`:focus`-CSS-Regeln.
- [ ] `index.css` netto kleiner; `.service-link-card` nur noch an 1 Stelle (+ responsive/`.light`-Overrides); keine hardcodierten `transition: … 0.2s/0.3s ease` in den angefassten Blöcken.
- [ ] `DESIGN_SYSTEM.md` Spacing-Referenzblock zeigt `--space-2xs…3xl`.
- [ ] `./scripts/test/run-tests.sh --frontend` grün (30 Dateien), `theme.test.tsx` grün.
- [ ] `./scripts/test/run-tests.sh --quality` grün mit **gesenkten** Schwellen (nicht erhöht).
- [ ] Live-Verifikation auf dem Jetson: DashboardHome, Chat, Documents, Settings, Login je 1 Screenshot ohne sichtbaren Regress.

## Phases

Jede Phase lässt die App lauffähig. Reihenfolge = wachsender Blast-Radius:
Fundament → risikoarme Views → eager-load-Shell zuletzt.

### ✅ P0 — Token-Layer + Design-System-Vertrag resyncen

**Files:** `apps/dashboard-frontend/src/index.css` (nur `@theme`/`:root`/`.light`/`--transition-*`-Definitionsbereich), `docs/development/DESIGN_SYSTEM.md`
**Risk:** low — rein additiv/dokumentarisch; keine Selektor-Umschreibung, keine Markup-Änderung.
**Tests:** `theme.test.tsx` muss grün bleiben (Dark/Light-Tokens); voller Frontend-Lauf am Phasenende.
**Inhalt:** Sicherstellen, dass alle referenzierten `--transition-*`/Spacing/Radii-Tokens existieren und vollständig sind; `DESIGN_SYSTEM.md`-Spacing-Referenzblock (Z. 903–970) auf `--space-2xs…3xl` resyncen; State-Konventionen (hover/focus-visible/disabled/loading) als verbindlichen Abschnitt festschreiben.

### ✅ P1 — Shared Primitives härten (States vereinheitlichen)

**Files:** `apps/dashboard-frontend/src/components/ui/shadcn/{button,card,input,badge,select,tabs,dialog}.tsx`, `apps/dashboard-frontend/src/components/ui/{Modal,LoadingSpinner,Skeleton,DataStateRenderer,ErrorBoundary}.tsx`, `apps/dashboard-frontend/src/features/documents/Badges.tsx`
**Risk:** medium — breit genutzt (Button 54, Card 39 Dateien); Änderungen müssen additiv/abwärtskompatibel an den Varianten sein.
**Tests:** volle Frontend-Suite; Fokus auf Komponenten-Specs, die States/Varianten assertieren.
**Inhalt:** Einheitliche `cva()`-Achsen für States über die Primitives; `focus-visible`-Ringe, `disabled`, `loading` konsistent; `Badges.tsx` auf die kanonische `cva()`+`cn()`-Form angleichen. Keine Default-Varianten-Semantik brechen.

### ✅ P2 — Auth-/risikoarme Views migrieren (Legacy `.btn-*`/`.card`)

**Files:** `apps/dashboard-frontend/src/features/system/{Login,CreateAdmin}.tsx`, `apps/dashboard-frontend/src/features/database/components/TableCard.tsx`
**Risk:** high — Login/CreateAdmin rendern vor vollem Auth/Router-Context; Regress kann aussperren. Deshalb hier isoliert, klein, sofort live geprüft.
**Tests:** `login.test.tsx` + zugehörige Specs; danach **zwingend** manuelle Login-Prüfung im Browser (Teil von P5, aber hier vorgezogen für Auth).
**Inhalt:** `.btn-global/.btn-primary/.btn-secondary/.btn-ghost/.btn-retry`/`.card` in diesen 3 Dateien durch `<Button>`/`<Card>`-Primitives ersetzen; visuell identisch halten.

> **Abweichung (Ground-Truth vs. Research):** Diese 3 Dateien waren bereits
> vollständig auf Primitives + Tokens migriert — keine Legacy-`.btn-*`/`.card`-
> Klassen mehr (der Research-Report war veraltet). Statt eines sinnlosen,
> auf dem Auth-Pfad riskanten Refactors: die **neue `loading`-Konvention aus P1**
> auf die Submit-Buttons von Login + CreateAdmin adoptiert (Spinner + `aria-busy`
>
> - zentrales Disabled statt manuellem `isSubmitting`-Text). Verhalten identisch,
>   Live-Login-Prüfung in P5. Die einzige verbleibende Legacy-`btn-retry`-Klasse
>   lebt in `App.tsx` → in P4 abgeräumt.

### ✅ P3 — Transition-Timings auf Tokens konsolidieren (index.css)

> **Scope-Entscheidung (User, Ground-Truth-Rückfrage):** Die Dashboard-Legacy-CSS
> ist ein ~2000-Zeilen, tief verzahntes responsives System auf der eager-geladenen
> First-Paint-View. Ein Struktur-/Markup-Umbau der Tiles auf `Card`-Primitives wäre
> ein radikaler Redesign (Konflikt mit der Inkrementell-Regel). Gewählt: **sicher-
> mechanischer Pfad** — kein Tile-Umbau, First-Paint bleibt unverändert.
> **Files:** `apps/dashboard-frontend/src/index.css`
> **Risk:** low — rein mechanisch, Werte identisch (0.15/0.2/0.3s ease → `--transition-*`).
> **Tests:** `theme.test.tsx` + tsc.
> **Inhalt:** 47 hardcodierte `transition:`-Timings durch `var(--transition-fast|base|slow)`
> ersetzt (eine Quelle für Interaktions-Timings). `animation:`-Timings bewusst
> unangetastet (semantisch Animationen). **Caught+fixed:** die erste zeilen-scoped
> Ersetzung traf auch die Token-Definitionen selbst → zirkuläre `--transition-x: var(--transition-x)`;
> per Spot-Check erkannt und auf die Literalwerte zurückgesetzt.

### ✅ P4 — App.tsx btn-retry → Primitive + Quality-Gates

> **Scope:** gemäß User-Entscheidung nur der eine `btn-retry` (kein Shell-/Sidebar-Umbau).
> **Files:** `apps/dashboard-frontend/src/App.tsx`, `apps/dashboard-frontend/src/index.css`, `scripts/test/check-design-system.js`
> **Risk:** low/medium — nur der Error-Screen-Retry-Button (eager, aber winzig).
> **Tests:** volle Suite (35 Dateien / 630 Tests) + `--quality`; tsc.
> **Inhalt:**

- `App.tsx`: Legacy `<button className="btn-retry">` → `<Button variant="solid" size="lg">` mit Lift-Hover; die toten `.btn-retry`-Regeln aus `index.css` entfernt.
- **Quality-Gate repariert (pre-existing Fehler, nicht CI-blockend):** `check-design-system.js` prüfte literal `--primary-color: #45adff`/`--bg-dark: #101923`, die der Token-Refactor auf `var(--primary)`/`var(--background)` aliasiert hatte → Gate war auf `main` rot. Jetzt prüft es die echte Wertequelle (`--primary`/`--background`). Schwellen von 150/225 auf den Ist-Stand **59/49** heruntergeratcht. `run-tests.sh --quality` jetzt grün.
- **Backlog (bewusst nicht angefasst, minimaler Scope):** `check-code-quality.js` matcht nur `.js/.jsx` → scannt 0 Dateien im TS-Frontend. Erweiterung auf `.ts/.tsx` würde die Schwellen sprengen → separater Task.

### P5 — Live-Verifikation auf dem Jetson (nach Push, vor Auto-Merge)

**Files:** keine Code-Änderung (nur ggf. kleine Fixes aus Befunden)
**Risk:** low — Verifikation.
**Tests:** manuell + Playwright.
**Inhalt:** Nach dem Push den Branch auf dem Gerät safe-deployen (`git tag -f backup-<branch>`,
`git checkout`, `docker compose up -d --build dashboard-frontend`, danach Restore auf
Ausgangs-Branch — lt. Memory-Prozedur). Via Playwright gegen `https://100.121.244.80/`
den **Login-Screen** prüfen (die einzige ohne Auth sichtbare, geänderte Fläche:
Token-Konsistenz + neuer Submit-Spinner). Authentifizierte Views brauchen das
Admin-Passwort (nicht in Memory) — falls nicht verfügbar, deckt der Login-Screen

- die 636 grünen Tests + der Post-Merge-Auto-Deploy (Healthcheck + Auto-Rollback)
  die Verifikation ab. **Reihenfolge:** Commit → Push → PR → **P5 Live-Test** → Auto-Merge.
  Transitions sind wertgleich (0.2s ease ≡ var(--transition-base)), also visuell nichts Neues zu prüfen.

## Rollback

- Reiner Frontend-Diff, keine DB-Migration → Rollback = Branch verwerfen / PR
  revert. Kein Down-Script nötig.
- Phasen sind additiv-lauffähig; bei Regress in P2/P4 (Auth/Shell) genügt Revert
  des jeweiligen Phasen-Commits.
- Kein Feature-Flag nötig (kein Verhaltens-, nur Darstellungs-Change).
- Device-Restore: dokumentierter safe branch-restore-Pfad (Memory „Jetson live
  browser testing").

## Open Questions

- Keine offenen Punkte nach dem Interview. Einzige Watch-Items (im Plan bereits
  adressiert, kein Blocker): (a) Auth-View-Aussperr-Risiko → P2 isoliert + sofort
  live geprüft; (b) fehlende Visual-Regression-Tooling → durch P5-Live-Prüfung
  kompensiert, nicht neu eingeführt (out of scope).
