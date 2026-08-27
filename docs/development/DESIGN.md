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
3. **Wiederkehrende Formen kommen aus dem Baustein-Set** (unten). Ein `h1`,
   eine Feldgruppen-Trennlinie oder eine Tab-Leiste außerhalb von
   `components/ui` meldet `scripts/test/bausteine.py`.

## Stack

TypeScript, React 19, Tailwind v4 (Utility-First, Tokens über `@theme`),
shadcn/ui (Radix-Primitive in `components/ui/shadcn/`, generiert),
lucide-react für Symbole, `cn()` aus `lib/utils.ts` für bedingte Klassen.
Inter als Schrift, JetBrains Mono für Code.

## Die Jet-Palette: drei Themes

Umschaltung über `useTheme` (`'black' | 'dark' | 'light'`, Voreinstellung
`black`, `localStorage` `arasul_theme`): setzt `data-theme` und die Klasse
`dark` bzw. `light` auf `<html>`. `:root` hält die Schwarz-Werte,
`[data-theme='dark']` und `.light` überschreiben nur, was abweicht.
Komponenten brauchen keine Theme-Zweige; wer Tokens benutzt, folgt dem Theme.

| Token                | Schwarz (`:root`)        | Dunkel        | Hell                  |
| -------------------- | ------------------------ | ------------- | --------------------- |
| `--background`       | `#0A0A0A`                | `#141414`     | `#F6F6F6`             |
| `--card`             | `#121212`                | `#181818`     | `#FFFFFF`             |
| `--popover`          | `#161616`                | `#1c1c1c`     | `#FFFFFF`             |
| `--muted`            | `#161616`                | `#181818`     | `#ECECEC`             |
| `--foreground`       | `#e6e6e6`                | erbt          | `#1a1a1a`             |
| `--muted-foreground` | `rgba(228,228,228,0.55)` | erbt          | `#6b6b6b`             |
| `--border`           | `rgba(228,228,228,0.08)` | erbt          | `rgba(16,16,16,0.10)` |
| `--accent` (Hover)   | `rgba(228,228,228,0.07)` | erbt          | `rgba(16,16,16,0.05)` |
| `--primary`          | `#81A1C1` (Graublau)     | erbt          | `#2D8FD9` (Blau)      |
| `--ring`             | = `--primary`            | = `--primary` | = `--primary`         |

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

## Das gemeinsame Baustein-Set (`components/ui/`)

| Baustein                  | Was er festlegt                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `PageHeader`              | Seitentitel als einziges `h1` (`text-2xl`), optionales Symbol, Beschreibung, Aktion |
| `FilterBar`               | echte Tab-Leiste (`tablist`/`tab`/`tabpanel`) mit eigener Inhaltsfläche             |
| `StatTile` / `StatGrid`   | Kennzahl ohne Symbol; Raster fest 1/2/4 Spalten, nie drei plus eins                 |
| `Chart` / `Sparkline`     | recharts-Linien in Serienfarben, ohne eigene Karte                                  |
| `Section` / `SectionList` | Feldgruppe mit `h2`; die Liste setzt die Trennlinien zwischen, nicht an Abschnitte  |
| `EmptyState`              | leere Liste mit Titel und Einstieg                                                  |
| `AuthCard`                | Rahmen der Seiten vor der Anmeldung; das einzige `h1`, das kein Seitentitel ist     |

Eine neue Seite baut auf diesen Bausteinen auf, statt die Klassenkette zu
kopieren. Ausnahmen stehen mit Grund in `AUSNAHMEN` von `bausteine.py`; ein
Eintrag ohne Grund ist keiner.

## Die Shell

Dreispaltig: links Apps, Mitte Übersicht oder App, rechts Notizen (Beschluss 10
vom 26.08.2026, gebaut in Phase D1). Die ActivityBar ganz links ist immer
sichtbar, Sidebar und rechte Spalte lassen sich einzeln ein- und ausblenden.
Unter 900 px Fensterbreite gibt es keine drei Spalten (`useSchmalesFenster`);
die ActivityBar bleibt, sie ist einen Klick entfernt.

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
