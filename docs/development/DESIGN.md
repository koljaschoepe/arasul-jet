# Design

> Das Design-Dokument des Jet-Repos (Überordner-Plan vom 26.08.2026, Zeile 21:
> „shadcn und die Jet-Palette bleiben, ein knappes Design-Dokument"). Es ist
> verbindlich für jede Änderung an der Oberfläche. Werte stehen hier nur, wo
> sie eine Entscheidung tragen; die Quelle der Werte ist seit Phase H3
> `packages/marken/src/theme.css` — dort, wo die Primitive stehen, die sie
> brauchen.

## Grundsatz

Eine neutrale, monochrome Fläche und **ein** gedämpfter Akzent. Flächen
trennen sich durch Linien, nicht durch eine zweite Flächenfarbe. Farbe
bedeutet etwas: Akzent für die **Primäraktion und den Verweis**, Statusfarben
nur, wenn ein Zustand gemeint ist. Alles andere ist Graustufe.

**Der aktive Zustand ist keine Farbe** (verschärft in H5). Er ist Schriftstärke
und, wo keine Schrift da ist, eine Linie. Bis H5 stand der Akzent an beiden
Stellen — am gewählten Reiter, am aktiven Symbol der Aktivitätsleiste, an der
Zeile, auf der man steht —, und daneben bedeutete `bg-accent` „hier ist gerade
die Maus". Wer die Maus stehen ließ, sah zwei aktive Einträge. Und ein Akzent,
der zugleich „tu das hier" und „hier bist du" heißt, heißt beides nicht mehr.
Ebenso wenig trägt er einen Zustand — und ein Zustand trägt seit dem
30.08.2026 (Auftrag farben-blau-grau-rot) auch kein Grün und kein Orange mehr.
**Die Palette ist Blau, Grau, Rot.** Eine erfüllte Passwortregel ist
`text-primary`, ein gesunder Dienst ein blauer Punkt, ein Häkchen nach einer
Aktualisierung blau; eine Warnung ist `text-muted-foreground` mit einem Wort
daneben; ein Fehler ist `text-destructive`. Grund: jede weitere Farbe liest
eine App als Freibrief für eigene, und das Bild aus Shell und Apps zerfällt.

Drei Regeln, die ein Wächter hält:

1. **Kein Farbliteral im Komponenten-Code.** Farben kommen aus Tokens
   (`bg-background`, `text-muted-foreground`, `border-border`), nie als
   `#rrggbb`. Ein Hex steht in `packages/marken/src/theme.css` und sonst
   nirgends (in `index.css` und `marken.css` nur als Wert eines Tokens oder
   als Rückfall). Die Diagrammpalette ist gefallen: `Chart` nimmt Blau,
   Schwarz und Grau aus denselben Tokens.
   Seit **H3** zählt Tailwinds eingebaute Palette mit dazu: `bg-black/50` und
   `text-red-500` sind derselbe Fehler in anderer Schreibweise, denn sie
   folgen keinem Thema. Wächter: `scripts/test/check-design-system.js` (CSS),
   `scripts/test/marken.py`, Punkt 6 (die Bausteine) und
   `scripts/test/bausteine.py`, Punkt 7 (die Shell und jedes CSS — er rechnet
   den Farbton jedes Werts und lässt nur Blau, Rot und Grau durch).
2. **Eine Flächenfarbe.** Grundflächen (Aktivitätsleiste, Ansicht, die Leiste
   der Bereiche in der Verwaltung) tragen `bg-background`; `bg-card` ist
   erhabenen Elementen darauf vorbehalten (Karten, Popover, Dialoge,
   Eingabefelder, Tabellenköpfe). **Auswahl ist eine getönte Fläche, kein
   Balken** (M5): gewählt ist ein Hauch Akzent (`bg-primary/12`, in der `Liste`
   `color-mix` mit `--ara-akzent`), überfahren der neutrale Wisch
   (`--accent`), der in 120 ms einblendet; „weniger Bewegung" schaltet den
   Übergang ab.
3. **Wiederkehrende Formen kommen aus dem Designsystem** (unten). Ein `h1`,
   eine Feldgruppen-Trennlinie, eine Tab-Leiste oder ein handgebauter Dialog
   außerhalb von `packages/marken` meldet `scripts/test/bausteine.py` — seit
   **H5** überall unter `src/`, ohne Ausnahmeordner.

## Stack

TypeScript, React 19, Tailwind v4 (Utility-First, Tokens über `@theme`),
shadcn/ui (Radix-Primitive seit H3 in `packages/marken/src/primitive/`, seit H4
vollständig; die Muster darüber in `packages/marken/src/muster/`),
lucide-react für Symbole, `cn()` aus `@marken` für bedingte Klassen.
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

**Ungeschichtetes CSS gewinnt gegen jede `@layer`** — auch gegen `@layer
base`, wo `body` seine Farbe aus `var(--background)` bekommt, und damit gegen
das Theme. Der `<style>`-Block in `index.html`, der die Zehntelsekunde vor dem
Stylesheet färbt, stand bis Phase **H2** ohne Schicht da und nagelte den
Hintergrund der Seite auf `#f6f6f6` und die geerbte Textfarbe auf `#1a1a1a`:
im dunklen Theme meldete `<html>` `--background: #141414`, und `body` blieb
hell. Er steht jetzt in `@layer flackerschutz`, und weil der Block **vor** dem
`<link>` auf das Stylesheet kommt, ist das die unterste Schicht.
`check-design-system.js` lässt in `index.html` nichts Ungeschichtetes mehr
durch.

| Token                | Hell (`:root`, Vorgabe) | Dunkel                   |
| -------------------- | ----------------------- | ------------------------ |
| `--background`       | `#F6F6F6`               | `#141414`                |
| `--card`             | `#FFFFFF`               | `#181818`                |
| `--popover`          | `#FFFFFF`               | `#1c1c1c`                |
| `--muted`            | `#ECECEC`               | `#181818`                |
| `--foreground`       | `#1a1a1a`               | `#e6e6e6`                |
| `--muted-foreground` | `#666666`               | `rgba(228,228,228,0.55)` |
| `--border`           | `rgba(16,16,16,0.10)`   | `rgba(228,228,228,0.08)` |
| `--accent` (Hover)   | `rgba(16,16,16,0.05)`   | `rgba(228,228,228,0.07)` |
| `--primary`          | `#1E6AA4` (Blau)        | `#81A1C1` (Graublau)     |
| `--ring`             | = `--primary`           | = `--primary`            |

**Text in Farbe hält im hellen Thema 4,5:1** (seit 26.09.2026, J35): Blau,
Rot und das Textgrau auf Seite, Karte, `--secondary` und ihrem eigenen
10-%-Wisch, Weiß auf dem vollen Blau. Das alte Blau `#2D8FD9` hielt 3,2:1,
das alte Rot 3,5:1. `scripts/test/marken.py` rechnet es nach (Punkt 9).

Eine Linienfarbe mit niedriger Alpha, keine zweite „dicke" Kante. Hover ist
eine neutrale Alpha, kein eigener Farbton. Scrollbalken: Spur transparent,
Griff neutral.

**Statusfarben** nur für Zustände, und es sind zwei: `--destructive`
(`#C42020` hell, `#EF4444` dunkel) für einen Fehler, `--primary` für Erfolg und Hinweis. Eine
Warnung ist `--muted-foreground` mit Text. `--success` und `--warning` gibt
es seit dem 30.08.2026 nicht mehr; die Varianten `success`/`warning` an
`Badge`, `Toast`, `Button` und `Meldung` bleiben als Bedeutung und bekommen
Blau beziehungsweise Grau. Für Text auf hellem Alpha-Grund die Tripel
`--status-{neutral,critical,performance}` mit `-bg` und `-border`.

**Diagramme** nehmen die Serienfarben in fester Reihenfolge
(`--primary` → `--foreground` → `--muted-foreground`): Blau, Schwarz, Grau.
Drei Farben für drei Werte derselben Einheit behaupten eine Bedeutung, die es
nicht gibt.

## Maße

- **Radien** `--radius-xs/sm/md/lg/xl` = 4/6/8/12/16 px.
- **Dichte-Skala** für die Shell und normierte Ansichten (Systemstatus):
  Text `text-xs/sm/lg` = 12/13/16 px (drei Größen, zwei Gewichte
  `font-normal`/`font-medium`; `bausteine.py` hält das), Abstände `*-ui-1…4` =
  5/10/14/18 px, Zeile `h-ui-row` ≈ 22 px. Karten-Innenabstand `p-ui-3`,
  Abstand zwischen Karten `gap-ui-2`.
- Die Einstellungsseiten benutzen die Tailwind-Voreinstellung; der Seitentitel
  kommt aus `Kopf` und ist das einzige `h1`.
- **Root-Hebel** `html { font-size: 106.25% }` (17 px): skaliert alle
  rem-Werte um ~6 %. Feste px-Werte (Symbole `--icon-*`) sind deshalb eine
  Stufe angehoben.
- Berührungsziele mindestens 44 px. Übergänge aus `--transition-fast/base/slow`
  (0,15/0,2/0,3 s), keine eigenen Zeiten.

## Das Designsystem für alle Apps (`packages/marken/`)

Seit **Phase D7** (28.08.2026) liegen Schrift, Farben, Abstände und sechs
Bausteine in einer Bibliothek, die die Shell **und jede App** benutzt; seit
**H3** (29.08.2026) dazu die **Tokens** (`theme.css`) und die **Primitive**
(`src/primitive/`) — Button, Input, Dialog, Tabs, Badge und die übrigen. Seit
**H4** (29.08.2026) ist der Satz vollständig (**sechsundvierzig**), und über
ihm stehen die **Muster** (`src/muster/`) — seit **H5** neun.

**Drei Sätze, zwei Laufzeiten, zwei Höhen.** Die Primitive stehen auf Radix
und Tailwind und brauchen einen Bau; die Muster sind aus ihnen gebaut und
brauchen ihn auch; die sechs Bausteine darunter stehen auf reinem CSS und
laufen in einer App **ohne** Bau. Wer einen Bau hat, nimmt die Primitive. Das
Bündel `browser/marken.js` trägt deshalb weiter nur die sechs — plus, seit H4,
`useSchmalesFenster`, der reines React ist und die eine Schwelle des Produkts
(900 px) trägt.

Der Unterschied zwischen einem Primitiv und einem Muster ist die **Höhe**: ein
Primitiv ist ein Teil (`Table`), ein Muster ist eine **Form** (`Datenliste` —
Spalten-Spezifikation, Sortieren, Filtern, Leerzustand, Ladezustand, und unter
900 px Karten statt Tabelle). Beide wissen nichts von Arasul; was eine Route,
einen Endpunkt oder einen Benutzer kennt, bleibt in der Shell.

| Muster                         | Wofür                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Datenliste`                   | Zeilen zeigen, sortieren, durchsuchen; unter 900 px Karten                                                                                       |
| `Suchauswahl`                  | die Auswahl, die beim Tippen enger wird (anderswo »Combobox«)                                                                                    |
| `Dateiablage`                  | Dateien ziehen **oder** auswählen; sie lädt selbst nichts hoch                                                                                   |
| `Seitenleiste`                 | Navigation aus einer Liste, auf dem Primitiv `Sidebar`                                                                                           |
| `Formularseite` / `Feldgruppe` | Abschnitte einer Seite; die Trennlinie gehört zwischen sie                                                                                       |
| `Leerzustand`                  | was an der Stelle einer leeren Liste steht — samt Einstieg                                                                                       |
| `Ladezustand`                  | der Kreisel, wenn die Form des Ergebnisses noch offen ist                                                                                        |
| `Dialogform` / `Bestaetigung`  | der Dialog (Titel, rollender Rumpf, Fuß) und die Frage (H5)                                                                                      |
| `Kennzahl` / `Kennzahlen`      | eine Zahl mit ihrer Beschriftung; Raster 1/2/4, nie drei (H5)                                                                                    |
| `Freigabe`                     | Liste, Einzelansicht, Bestätigen, Ablehnen mit Grund, Frist (J36); erkannte Felder mit „prüfen" oben, Original links, was bisher geschah (5.4.0) |

Die **Schauseite** unter `/entwickler/bausteine` zeigt jedes Primitiv **und
jedes Muster** in allen Zuständen, hell und dunkel; sie liegt seit H4 in drei
Dateien, und `scripts/test/schauseite.mjs` macht davon Bilder bei 390, 1024
und 1440 px. Einen Baustein **ohne** Schaustück meldet
`scripts/test/bausteine.py` — einer, den heute niemand benutzt, sieht in einem
der beiden Themes falsch aus, und es merkt sonst erst der, der ihn in einem
halben Jahr zum ersten Mal einsetzt.

**Zwei Namen aus shadcns Liste fehlen mit Absicht:** `Drawer` ist
`Sheet side="bottom"`, `Sonner` ist `Toast` samt `ToastContext`. Zwei
Bausteine unter einer Sache sind die Verwechslung selbst.

Die sechs Bausteine ohne Bau:

| Baustein                      | Was er festlegt                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `Kopf`                        | Seitentitel als einziges `h1`, Symbol, Beschreibung, Aktionen                       |
| `Liste` / `ListenEintrag`     | eine Reihe; ein Eintrag ist ein Knopf, sobald er etwas tut                          |
| `Karte`                       | die erhabene Fläche für ein Ding, das für sich steht (`--card`)                     |
| `Formular` / `Feld` / `Knopf` | ein echtes `form` (Eingabetaste sendet ab), Felder mit `label`                      |
| `Meldung`                     | Hinweis, Erfolg, Warnung, Fehler — die Art steht auch im Text, nie nur in der Farbe |
| `Menue`                       | für eine App: die Fläche über der Seite hinter einem Hamburger-Knopf (unter 900 px) |

**Kein neues Erscheinungsbild.** Die Werte stehen als
`var(--token-der-shell, <fester Wert>)`: in der Shell folgt die Bibliothek dem
Thema, in einer App gilt der Rückfall.

**Und eine App folgt seit Phase H2 dem Theme des Menschen.** `marken.css`
trägt dieselbe Form wie `index.css`: `:root` ist Hell, `[data-theme='dark']`
überschreibt, was abweicht. Das Attribut schreibt `AppRahmen` in das Dokument
des `iframe` — gleiche Herkunft, deshalb geht das, und deshalb steht am Rahmen
kein `sandbox`. **Die App muss dafür nichts tun.** Wer mehr tut als Farben
tauschen, hört zusätzlich auf `postMessage`
(`{ typ: 'arasul:theme', theme: 'light' | 'dark' }`) oder liest `data-theme`
am `<html>` des Elternfensters, so wie es die Vorlage des Ara-Kits tut. Der
Wechsel lädt den Rahmen **nicht** neu: das Theme steht weder im `key` noch in
der Adresse, und der App-Tab bleibt gemountet, während der Mensch in den
Einstellungen ist.

Bis H2 waren die Rückfallwerte die des dunklen Themes (bei ihrer Aufnahme in
D7 hieß es »Schwarz«), und eine App stand immer darauf — auch in einer hellen
Shell.

Zwei Wege hinein, eine Quelle: die Shell übersetzt `packages/marken/src/` über
den Vite-Alias `@marken` mit (kein npm-Paket, kein Lockfile-Eintrag); eine App
ohne Bauschritt lädt `packages/marken/browser/marken.js`, in dem React
mitliegt (`scripts/util/marken-beilegen.sh` legt es beim Einspielen daneben).
`scripts/test/marken.py` hält Quelle und Bündel aneinander — und seit H2 auch
**jeden Rückfall an seinem Token in `theme.css`**: Hell gegen `:root`, Dunkel
gegen `[data-theme='dark']`, in beiden Richtungen der Vollständigkeit. Ein
Rückfall ist eine Kopie, und in der Shell gewinnt immer der Token; eine
veraltete Kopie fällt dort nie auf, sondern nur in einer App. Einzelheiten:
[`packages/marken/README.md`](../../packages/marken/README.md).

**Eine App auf dem Gerät bekommt die neue `marken.css` erst beim nächsten
Einspielen** — die Datei liegt neben ihr und nicht in der Shell.

**Warum es das gibt:** bis D6 hatte Arasul seine Oberfläche und jede App ihre
eigene. Der Mensch sieht beides in **einem** Rahmen übereinander — zwei
Erscheinungsbilder auf einem Bildschirm sind kein Geschmack, sondern ein
Fehler.

## Was in `components/ui/` übrig ist

Seit **H5** steht dort nur noch, was über **dieses Gerät** Bescheid weiß:

| Baustein                 | Warum er nicht in der Bibliothek steht                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| `AuthCard`               | kennt das Maskottchen und den Produktnamen; der Titel kommt aus `Kopf mittig` |
| `SkeletonText/Card/List` | Platzhalter in der Form, die eine Liste auf DIESEM Gerät hat                  |
| `NichtGefunden`          | kennt die Adresse des Arbeitsbereichs; die Form ist `Leerzustand` + `Button`  |
| `ErrorBoundary`          | React-Mechanik plus die Hilfewege dieses Produkts                             |

**Alles andere ist gegangen.** Mit **H4** `Chart`/`Sparkline` (jetzt ein
Primitiv), `Section`/`SectionList` (jetzt `Feldgruppe`/`Formularseite`),
`EmptyState` (jetzt `Leerzustand`), `LoadingSpinner` (jetzt `Ladezustand`).
Mit **H5** `Modal` und `ConfirmModal` (jetzt die Muster `Dialogform` und
`Bestaetigung`) und `StatTile`/`StatGrid` (jetzt `Kennzahl`/`Kennzahlen`) —
keines von ihnen wusste je etwas von Arasul, und die erste Fachanwendung mit
einem Dialog hätte sie noch einmal geschrieben.

**`FilterBar` ist ganz gefallen.** Es war eine zweite Tab-Leiste neben dem
Primitiv `Tabs`: dieselbe Form, dieselbe Semantik, eigene
Tastaturmechanik — und die tut Radix schon, geprüft. Zwei Dinge unter einer
Sache sind die Verwechslung selbst. `DashboardCard` desgleichen: eine zweite
Karte neben `Card`, die dort, wo sie stand, nichts tat, was `Feldgruppe`
nicht tut.

**Der Wächter ist damit scharf** (`scripts/test/bausteine.py`): bis H4 war
`components/ui/` von den Regeln ausgenommen, weil dort die Bausteine standen.
Seit H5 stehen sie nicht mehr dort, also gilt die Regel überall unter `src/` —
ein `h1`, eine Tab-Leiste, eine Feldgruppen-Trennlinie oder ein handgebauter
Dialog ist an **jeder** Stelle ein Befund. Ein Ordner, in dem die Regel nicht
gilt, ist der Ort, an dem der nächste zweite Baustein entsteht.

Eine neue Seite baut auf `@marken` auf, statt die Klassenkette zu kopieren.
Ausnahmen stehen mit Grund in `AUSNAHMEN` von `bausteine.py`; ein Eintrag ohne
Grund ist keiner.

## Die Shell

**Um die Ansicht steht nur die Aktivitätsleiste** (M5, Karte
rahmen-aktivitaetsleiste, 03.10.2026; Zielbild in `frontend.md` des
Überordners, Abschnitt Rahmen): oben das Haus zur Startseite mit der Zahl
offener Freigaben, darunter die freigegebenen Apps nur als Symbol mit dem
Namen beim Überfahren (ab etwa zehn rollt dieser Teil), unten fest Verwaltung
(nur Administrator), Zahnrad und das eigene Bild (Name und Abmelden). Offen
ist genau eine Ansicht. Es gibt keine Kopfleiste, keine Tab-Leiste, keine
rechte Spalte und keine zweite Seitenleiste mehr; jede Funktion steht an
genau einer Stelle. Die Verwaltung ist gebaut wie eine App: eine eigene
schmale Leiste der Bereiche, ohne zweite Reiterstufe — was lang ist, klappt
auf (der Bereich System).

Bis M5 stand hier ein Dreispalten-Raster (Apps, Mitte mit Tabs, Notizen) und
unter 900 px ein eigener Aufbau mit Hamburger-Menü (D7). Unter 900 px steht
die Aktivitätsleiste unten (Haus, bis zu vier Apps, „mehr“, Verwaltung,
Einstellungen, Konto); die Verwaltung zeigt ihre Bereiche dort als Auswahl über dem Bereich. Die
Statusleiste zeigt dauerhaft **nur Name, Datum und Uhrzeit** (minutengenau),
für jeden gleich, nie Modell, Speicher, Verbindung oder Fassung, und bleibt bei
390 px **eine Zeile** (der Name kürzt).

**Die Rolle blendet aus, das Backend entscheidet.** Ein Mitarbeiter sieht die
Startseite, seine Apps, seine Einstellungen und sein Konto; die Verwaltung
blendet die Oberfläche für ihn aus. Das ist keine Berechtigung:
`requireRole` im Backend antwortet ihm auf jeden dieser Wege mit `403`, ob der
Knopf da ist oder nicht. Ein Knopf, der bei jedem Klick 403 sagt, ist kein
Schutz, sondern eine Sackgasse. Umgekehrt darf nichts, was jeder braucht, hinter
einer Admin-Seite liegen — das Abmelden lag bis D1 in den Einstellungen und
sitzt seit M5 im Menü des eigenen Bildes unten in der Aktivitätsleiste.

## Wo was steht

| Frage                                 | Ort                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Wert eines Tokens                     | `packages/marken/src/theme.css` (`@theme`, `@theme inline`, `:root`, Dunkel)   |
| Ein neues Primitiv                    | `packages/marken/src/primitive/` + Barrel + Schaustück + `fassung.ts` heben    |
| Ein neues Muster                      | `packages/marken/src/muster/` + Barrel + Schaustück + `fassung.ts` heben       |
| Neuer Token, neue Farbe, neuer Radius | dort ergänzen, hier nur, wenn es eine Regel ändert                             |
| Frontend-Konventionen                 | [`apps/dashboard-frontend/CLAUDE.md`](../../apps/dashboard-frontend/CLAUDE.md) |
| Wächter                               | `scripts/test/check-design-system.js`, `scripts/test/bausteine.py`             |
