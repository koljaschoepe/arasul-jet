# Design

> Das Design-Dokument des Jet-Repos (Überordner-Plan vom 26.08.2026, Zeile 21:
> „shadcn und die Jet-Palette bleiben, ein knappes Design-Dokument"). Es ist
> verbindlich für jede Änderung an der Oberfläche. Werte stehen hier nur, wo
> sie eine Entscheidung tragen; die Quelle der Werte ist
> `apps/dashboard-frontend/src/index.css`.

## Grundsatz

Eine neutrale, monochrome Fläche und **ein** gedämpfter Akzent. Flächen
trennen sich durch Linien, nicht durch eine zweite Flächenfarbe. Farbe
bedeutet etwas: Akzent für die Primäraktion und den aktiven Zustand,
Statusfarben nur, wenn ein Zustand gemeint ist. Alles andere ist Graustufe.

Drei Regeln, die ein Wächter hält:

1. **Kein Farbliteral im Komponenten-Code.** Farben kommen aus Tokens
   (`bg-background`, `text-muted-foreground`, `border-border`), nie als
   `#rrggbb`. Die einzige Ausnahme ist die Diagrammpalette im `@theme`-Block.
   Wächter: `scripts/test/check-design-system.js`.
2. **Eine Flächenfarbe.** Grundflächen (Sidebar, Mitte, rechte Spalte) tragen
   `bg-background`; `bg-card` ist erhabenen Elementen darauf vorbehalten
   (Karten, Popover, Dialoge, Eingabefelder, Tabellenköpfe). Der aktive Tab
   teilt die Flächenfarbe und hebt sich nur über die Schriftstärke ab.
3. **Wiederkehrende Formen kommen aus dem Designsystem** (unten). Ein `h1`,
   eine Feldgruppen-Trennlinie oder eine Tab-Leiste außerhalb von
   `components/ui` und `packages/marken` meldet `scripts/test/bausteine.py`.

## Stack

TypeScript, React 19, Tailwind v4 (Utility-First, Tokens über `@theme`),
shadcn/ui (Radix-Primitive in `components/ui/shadcn/`, generiert),
lucide-react für Symbole, `cn()` aus `lib/utils.ts` für bedingte Klassen.
Inter als Schrift, JetBrains Mono für Code.

## Die Jet-Palette: zwei Themes

Seit **Phase H1** (29.08.2026) gibt es **Hell** und **Dunkel**, und die Wahl
gehört dem angemeldeten Menschen: sie steht in `admin_users.theme`
(Migration 180), kommt mit `GET /api/auth/session` und wird über
`PUT /api/darstellung` gesetzt. `useTheme` liest sie aus dem `AuthContext` und
setzt `data-theme="dark"` samt Klasse `dark` auf `<html>`; **Hell braucht kein
Attribut**, denn Hell IST `:root`. Ein `localStorage` ist nicht mehr die
Quelle — eine Einstellung gehört zu dem, der sie gemacht hat, nicht zu dem
Rechner, vor dem er zufällig saß.

Was mit H1 gefallen ist: das dritte Theme **»Schwarz«** (es unterschied sich
von »Dunkel« um zwei Hintergrundstufen — ein Unterschied, den auf einem Bild
niemand benennen kann, und jede Farbentscheidung gab es dreimal), die Klasse
`.light` (Hell ist die Vorgabe und braucht keinen Selektor) und das
Durchschalten `toggleTheme` (bei zwei Optionen in den Einstellungen wäre es
ein zweiter Weg in denselben Zustand).

`:root` hält die hellen Werte, `[data-theme='dark']` überschreibt **alles**,
was abweicht. Komponenten brauchen keine Theme-Zweige; wer Tokens benutzt,
folgt dem Theme.

| Token                | Hell (`:root`, Vorgabe) | Dunkel                   |
| -------------------- | ----------------------- | ------------------------ |
| `--background`       | `#F6F6F6`               | `#141414`                |
| `--card`             | `#FFFFFF`               | `#181818`                |
| `--popover`          | `#FFFFFF`               | `#1c1c1c`                |
| `--muted`            | `#ECECEC`               | `#181818`                |
| `--foreground`       | `#1a1a1a`               | `#e6e6e6`                |
| `--muted-foreground` | `#6b6b6b`               | `rgba(228,228,228,0.55)` |
| `--border`           | `rgba(16,16,16,0.10)`   | `rgba(228,228,228,0.08)` |
| `--accent` (Hover)   | `rgba(16,16,16,0.05)`   | `rgba(228,228,228,0.07)` |
| `--primary`          | `#2D8FD9` (Blau)        | `#81A1C1` (Graublau)     |
| `--ring`             | = `--primary`           | = `--primary`            |

Eine Linienfarbe mit niedriger Alpha, keine zweite „dicke" Kante. Hover ist
eine neutrale Alpha, kein eigener Farbton. Scrollbalken: Spur transparent,
Griff neutral.

**Statusfarben** nur für Zustände: `--success` (`#10B981`), `--warning`
(`#F59E0B`), `--destructive` (`#EF4444`), Info = Akzent. Für Text auf hellem
Alpha-Grund die Tripel `--status-{neutral,critical,warning,performance}` mit
`-bg` und `-border`; sie sind im hellen Theme dunkler und kontraststark.

**Diagramme** nehmen die Serienfarben in fester Reihenfolge
(`--color-chart-1` → `--primary-color` → `--text-secondary` → `--text-muted`):
Blau nach Grau. Drei Farben für drei Werte derselben Einheit behaupten eine
Bedeutung, die es nicht gibt.

## Maße

- **Radien** `--radius-xs/sm/md/lg/xl` = 4/6/8/12/16 px.
- **Dichte-Skala** für die Shell und normierte Ansichten (Systemstatus):
  Text `text-ui-xs/sm/-/lg` = 12/13/14/16 px, Abstände `*-ui-1…4` =
  5/10/14/18 px, Zeile `h-ui-row` ≈ 22 px. Karten-Innenabstand `p-ui-3`,
  Abstand zwischen Karten `gap-ui-2`.
- Die Einstellungsseiten benutzen die Tailwind-Voreinstellung; der Seitentitel
  ist `text-2xl` und das einzige `h1`.
- **Root-Hebel** `html { font-size: 106.25% }` (17 px): skaliert alle
  rem-Werte um ~6 %. Feste px-Werte (Symbole `--icon-*`) sind deshalb eine
  Stufe angehoben.
- Berührungsziele mindestens 44 px. Übergänge aus `--transition-fast/base/slow`
  (0,15/0,2/0,3 s), keine eigenen Zeiten.

## Das Designsystem für alle Apps (`packages/marken/`)

Seit **Phase D7** (28.08.2026) liegen Schrift, Farben, Abstände und sechs
Bausteine in einer Bibliothek, die die Shell **und jede App** benutzt:

| Baustein                      | Was er festlegt                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `Kopf`                        | Seitentitel als einziges `h1`, Symbol, Beschreibung, Aktionen                       |
| `Liste` / `ListenEintrag`     | eine Reihe; ein Eintrag ist ein Knopf, sobald er etwas tut                          |
| `Karte`                       | die erhabene Fläche für ein Ding, das für sich steht (`--card`)                     |
| `Formular` / `Feld` / `Knopf` | ein echtes `form` (Eingabetaste sendet ab), Felder mit `label`                      |
| `Meldung`                     | Hinweis, Erfolg, Warnung, Fehler — die Art steht auch im Text, nie nur in der Farbe |
| `Menue`                       | die Fläche über der Seite hinter dem Hamburger-Knopf (unter 900 px)                 |

**Kein neues Erscheinungsbild.** Die Werte stehen als
`var(--token-der-shell, <fester Wert>)`: in der Shell folgt die Bibliothek dem
Thema, in einer App gilt der Rückfall. Die Rückfallwerte sind die des dunklen
Themes (bei ihrer Aufnahme in D7 hieß es »Schwarz«). Eine App läuft im
`iframe` als eigenes Dokument, und CSS-Variablen reichen nicht über eine
Dokumentgrenze — **eine App folgt dem Theme des Menschen deshalb heute
nicht**, sie steht immer auf dem Rückfall. Das ist eine offene Frage aus H1
und keine Nebenwirkung: sie zu beantworten hieße, das Theme in die App
hineinzureichen.

Zwei Wege hinein, eine Quelle: die Shell übersetzt `packages/marken/src/` über
den Vite-Alias `@marken` mit (kein npm-Paket, kein Lockfile-Eintrag); eine App
ohne Bauschritt lädt `packages/marken/browser/marken.js`, in dem React
mitliegt (`scripts/util/marken-beilegen.sh` legt es beim Einspielen daneben).
`scripts/test/marken.py` hält Quelle und Bündel aneinander. Einzelheiten:
[`packages/marken/README.md`](../../packages/marken/README.md).

**Warum es das gibt:** bis D6 hatte Arasul seine Oberfläche und jede App ihre
eigene. Der Mensch sieht beides in **einem** Rahmen übereinander — zwei
Erscheinungsbilder auf einem Bildschirm sind kein Geschmack, sondern ein
Fehler.

## Das gemeinsame Baustein-Set (`components/ui/`)

| Baustein                  | Was er festlegt                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `FilterBar`               | echte Tab-Leiste (`tablist`/`tab`/`tabpanel`) mit eigener Inhaltsfläche            |
| `StatTile` / `StatGrid`   | Kennzahl ohne Symbol; Raster fest 1/2/4 Spalten, nie drei plus eins                |
| `Chart` / `Sparkline`     | recharts-Linien in Serienfarben, ohne eigene Karte                                 |
| `Section` / `SectionList` | Feldgruppe mit `h2`; die Liste setzt die Trennlinien zwischen, nicht an Abschnitte |
| `EmptyState`              | leere Liste mit Titel und Einstieg                                                 |
| `AuthCard`                | Rahmen der Seiten vor der Anmeldung; das einzige `h1`, das kein Seitentitel ist    |

Eine neue Seite baut auf diesen Bausteinen auf, statt die Klassenkette zu
kopieren. Ausnahmen stehen mit Grund in `AUSNAHMEN` von `bausteine.py`; ein
Eintrag ohne Grund ist keiner.

## Die Shell

**Ab 900 px dreispaltig**: links Apps, Mitte Übersicht oder App, rechts
Notizen (Beschluss 10 vom 26.08.2026, gebaut in Phase D1). Die ActivityBar
ganz links ist dort immer sichtbar, Sidebar und rechte Spalte lassen sich
einzeln ein- und ausblenden.

**Darunter ein eigener Aufbau, kein geschrumpfter Desktop** (Phase D7,
28.08.2026): ein **Hamburger-Menü** in der Kopfleiste — daneben der Name
dessen, was gerade dasteht —, **eine Spalte** darunter, und die Notizen sind
dort eine eigene **Ansicht**. Keine ActivityBar, keine Sidebar, keine
Tab-Leiste; das Menü führt Übersicht, die eigenen Apps, die Notizen und (für
den Administrator) Modelle und Einstellungen, und jeder Eintrag ist ein Ziel.

**Es liegt nichts übereinander.** Der Weg dahin steht in zwei Messungen am
Orin. Zuerst bekam die Mitte bei 390 px null Pixel — 48 für die ActivityBar,
160 für die Sidebar und 220 für die Notizen sind mehr, als da ist —, und alle
sieben Verwaltungsansichten zeigten die Notizen statt der Ansicht (D6). Die
Antwort darauf war ein **Blatt** über der Mitte; die zweite Messung zeigte,
dass das die halbe war: die App stand abgedunkelt dahinter, und was darunter
lag, war für niemanden anklickbar. Seit D7 steht in der einen Spalte deshalb
entweder die Ansicht oder der Zettel — nie beides. Dasselbe Prinzip gilt für
die Statusleiste: bei 390 px bleibt sie **eine Zeile** und lässt weg, was in
den Popover daneben gehört (die Fassung) oder als Zahl neben einem Symbol
genügt (die offenen Freigaben).

**Die Rolle blendet aus, das Backend entscheidet.** Ein Mitarbeiter sieht die
Apps, die Übersicht, die Notizen und sein Konto; die Verwaltung (Modelle,
Einstellungen) blendet die Oberfläche für ihn aus. Das ist keine Berechtigung:
`requireRole` im Backend antwortet ihm auf jeden dieser Wege mit `403`, ob der
Knopf da ist oder nicht. Ein Knopf, der bei jedem Klick 403 sagt, ist kein
Schutz, sondern eine Sackgasse. Umgekehrt darf nichts, was jeder braucht, hinter
einer Admin-Seite liegen — das Abmelden lag bis D1 in den Einstellungen und
sitzt seitdem im Benutzermenü der Kopfleiste.

## Wo was steht

| Frage                                 | Ort                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Wert eines Tokens                     | `apps/dashboard-frontend/src/index.css` (`@theme`, `:root`, Overrides)         |
| Neuer Token, neue Farbe, neuer Radius | dort ergänzen, hier nur, wenn es eine Regel ändert                             |
| Frontend-Konventionen                 | [`apps/dashboard-frontend/CLAUDE.md`](../../apps/dashboard-frontend/CLAUDE.md) |
| Wächter                               | `scripts/test/check-design-system.js`, `scripts/test/bausteine.py`             |
