# Design

> Das Design-Dokument des Jet-Repos (Überordner-Plan vom 26.08.2026, Zeile 21:
> „shadcn und die Jet-Palette bleiben, ein knappes Design-Dokument"). Es ist
> verbindlich für jede Änderung an der Oberfläche. Werte stehen hier nur, wo
> sie eine Entscheidung tragen; die Quelle der Werte ist seit Phase H3
> `packages/marken/src/theme.css` — dort, wo die Primitive stehen, die sie
> brauchen.

## Grundsatz

Die Farben der Marke: ein warmes Creme als Grund (dunkel Navy), Tinte als
Text und **ein** Blau als Akzent. Seit der Bibliothek 5.7.0 (20.11.2026,
Karte glas-grundton-bibliothek, Vorgabe ist der Abschnitt „Produkt“ in
`company/gestaltung.md` des Überordners) liegt hinter dem Rahmen ein ruhiger
Verlauf, schwebende Bedienflächen sind aus Glas, und Inhalt bleibt deckend.
Flächen trennen sich durch Linien, nicht durch eine zweite Flächenfarbe. Farbe
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
2. **Eine Flächenfarbe.** Die Ansicht liegt als deckende Fläche
   (`bg-background`, Radius 14 px, feine Kante, weicher Schatten) mit 8 px
   Abstand auf dem Grund des Rahmens; darin stehen die Leiste der Bereiche in
   der Verwaltung und der Inhalt durchsichtig auf `--background`. `bg-card` ist
   erhabenen Elementen darauf vorbehalten (Karten, Popover, Dialoge,
   Eingabefelder, Tabellenköpfe). **Auswahl ist eine getönte Fläche, kein
   Balken** (M5): gewählt ist ein Hauch Akzent (`bg-primary/12`, in der
   Aktivitätsleiste `bg-primary/14`, in der `Liste` `color-mix` mit
   `--ara-akzent`), überfahren der neutrale Wisch (`--accent`), der in 120 ms
   einblendet; „weniger Bewegung" schaltet den Übergang ab.
   **Die einzigen Verläufe sind die Gründe.** `--verlauf-grund` (5.7.0) liegt
   ruhig unter `body`, hell von Creme nach einem Hauch Blau, dunkel von Navy
   nach Anthrazit; Text darf direkt darauf stehen (`marken.py` misst jede
   Stufe). Eine App zur Laufzeit trägt ihn seit 5.9.2 nicht mehr: im Rahmen
   steht sie deckend auf `--background` wie Verwaltung und Einstellungen. `--verlauf-rahmen` (5.8.0) liegt hinter Leiste und Ansicht der
   Shell und ist kräftiger, damit man ihn sieht: hell Creme oben links, Blau
   mit einem weichen Schein unten rechts, dunkel Tiefblau mit Schein oben links
   nach Anthrazit (`--rahmen-stufe-1` bis `-3`, `--rahmen-schein`). Auf ihm
   steht kein Text, nur Glas. Kein Bild, keine Körnung. Der Hauptknopf (`Button
variant="solid"`, `Knopf art="haupt"`) ist blau gefüllt **ohne** Verlauf;
   Überfahren nimmt `--primary-hover`, Drücken `--primary-active`, in 120 ms.
   `--gradient-primary` und `--ara-verlauf-haupt` gibt es als Namen weiter,
   einfarbig, damit eine App auf 5.6 nicht bricht. Schatten gibt es nur
   an Menüs und an der angehobenen Karte (`--ara-schatten-hoch`): eine `Karte`,
   die ein Knopf ist, hebt sich beim Überfahren um 2 px, bei „weniger
   Bewegung" nur mit Schatten. Das getönte Band der Startseite ist seit 5.9.0
   (J50) gefallen: auch die Startseite beginnt mit dem `Kopf`. Die Tokens
   `--verlauf-band` und `--kante-band` bleiben als Namen für Apps auf 5.8.
3. **Wiederkehrende Formen kommen aus dem Designsystem** (unten). Ein `h1`,
   eine Feldgruppen-Trennlinie, eine Tab-Leiste oder ein handgebauter Dialog
   außerhalb von `packages/marken` meldet `scripts/test/bausteine.py` — seit
   **H5** überall unter `src/`, ohne Ausnahmeordner.

## Stack

TypeScript, React 19, Tailwind v4 (Utility-First, Tokens über `@theme`),
shadcn/ui (Radix-Primitive seit H3 in `packages/marken/src/primitive/`, seit H4
vollständig; die Muster darüber in `packages/marken/src/muster/`),
Lucide für Symbole, **nur über die Bibliothek** (unten, Symbole), `cn()` aus
`@marken` für bedingte Klassen. Inter als Schrift, ausgeliefert mit der
Bibliothek (`packages/marken/src/schrift/`, SIL OFL 1.1, eine Datei mit
veränderlicher Stärke je Zeichensatz, `font-src 'self'`), damit Rahmen und
jede App im iframe auf jedem Rechner gleich aussehen. Mono nur für Pfade,
Befehle und Zahlen in Tabellen.

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
| `--background`       | `#F6F3ED` (Creme)       | `#0A1628` (Navy)         |
| `--card`             | `#FBF8F2` (Panel hell)  | `#0E1E38` (Panel Navy)   |
| `--popover`          | `#FBF8F2`               | `#11233F`                |
| `--muted`            | `#EFE9DF` (Panel)       | `#152A4A`                |
| `--foreground`       | `#1E1B16` (Tinte)       | `#F6F3ED` (Creme)        |
| `--muted-foreground` | `#6B6250` (Tinte weich) | `#A3ABB8`                |
| `--border`           | `#DFD6C4` (Linie)       | `rgba(246,243,237,0.10)` |
| `--accent` (Hover)   | `rgba(30,27,22,0.05)`   | `rgba(246,243,237,0.07)` |
| `--primary`          | `#2559B1` (Blau)        | `#6A9AE6`, Schrift Navy  |
| `--ring`             | = `--primary`           | = `--primary`            |

Das Blau ist hell **zwei Stufen dunkler** als das Blau der Website
(`#2E6FD6`, hier `--primary-hover`): jenes hält als Fläche mit weißer Schrift
4,8:1, als Text auf Creme aber nur 4,4:1, und `--primary` ist beides. Ein
Abzeichen steht in einer App oft mit seinem Wisch direkt auf dem Verlauf; die
erste Stufe `#2862C2` fiel dort am Orin auf 4,2:1. Dunkel ist es eine helle
Stufe mit Navy als Schrift auf dem vollen Knopf; ein Blau, das weiße Schrift
trägt, kann als Text auf Navy nicht 4,5:1 halten.

**Text hält 4,5:1, in beiden Themen und auf Glas** (seit 26.09.2026 hell, seit
5.7.0 auch dunkel und auf Glas): Blau, Rot und das Textgrau auf Seite, Karte,
`--secondary` und ihrem eigenen 10-%-Wisch, die Schrift auf dem vollen Blau
und dem vollen Rot, jede Stufe des Verlaufs als eigener Grund, und Text auf
Glas über Seite, Karte, Panel und dem Hauptknopf. Icons stehen in derselben Farbe wie Text und halten damit
mindestens 3:1. `scripts/test/marken.py` rechnet es nach (Punkt 9).

Eine Linienfarbe mit niedriger Alpha, keine zweite „dicke" Kante. Hover ist
eine neutrale Alpha, kein eigener Farbton. Scrollbalken: Spur transparent,
Griff neutral.

**Statusfarben** nur für Zustände, und es sind zwei: `--destructive`
(`#C42020` hell, `#F26D6D` mit Navy als Schrift dunkel) für einen Fehler, `--primary` für Erfolg und Hinweis. Eine
Warnung ist `--muted-foreground` mit Text. `--success` und `--warning` gibt
es seit dem 30.08.2026 nicht mehr; die Varianten `success`/`warning` an
`Badge`, `Toast`, `Button` und `Meldung` bleiben als Bedeutung und bekommen
Blau beziehungsweise Grau. Für Text auf hellem Alpha-Grund die Tripel
`--status-{neutral,critical,performance}` mit `-bg` und `-border`.

**Diagramme** nehmen die Serienfarben in fester Reihenfolge
(`--primary` → `--foreground` → `--muted-foreground`): Blau, Schwarz, Grau.
Drei Farben für drei Werte derselben Einheit behaupten eine Bedeutung, die es
nicht gibt.

## Glas

Glas sitzt **nur auf schwebenden Bedienflächen**: Menüs, Aufklappfelder
(`Select`, `Popover`, `HoverCard`, Kontextmenü, Menüleiste), kurze Meldungen
(`Toast`), das Menü der Bausteine (`ara-menue`) und der Schleier unter Dialog
und Blatt. Tabellen, Formulare, Karten und der **Inhalt** eines Dialogs
bleiben deckend. Höchstens drei Glasflächen je Ansicht.

- Die Klasse `.glas` (in `theme.css`, Schicht `components`) setzt Füllung,
  Unschärfe, Kante und Schatten; `.glas-schleier` die leichte Unschärfe des
  Schleiers. In einer App ohne Bau: `--ara-glas`, `--ara-glas-filter`,
  `--ara-glas-kante`.
- **Deckend ist der Normalfall.** `--glas-flaeche` ist `--popover`; erst wenn
  der Browser `backdrop-filter` kann, wird es `--popover` zu `--glas-anteil`
  (88 %), Unschärfe 16 px mit leichter Sättigung. Die Unschärfe wird nie
  animiert. Die Kante trägt den Eindruck: 1 px heller Rand, weicher Schatten.
- **Transparenz reduzieren** je Person in den Einstellungen (Erscheinungsbild,
  `admin_users.transparenz_reduziert`, Migration 216, `PUT /api/darstellung`):
  die Shell setzt `data-transparenz="reduziert"` an ihr `<html>` und an das
  jeder App im Rahmen, und Glas wird deckend. Die Systemwünsche
  `prefers-reduced-transparency` und `prefers-contrast: more` gelten ohne
  Zutun, „weniger Bewegung“ wie bisher.
- Glas über einem iframe sieht nur, was im Dokument des Rahmens darunter liegt,
  nicht den Inhalt der App.
- **Glas auf dem Grund** (`.glas.glas-grund`, 5.8.0): die Leiste links und die
  Leiste unten am Handy liegen nur auf `--verlauf-rahmen`, nie über Text oder
  einem Knopf. Sie sind dünner gefüllt (neutral: hell Weiß zu 62 %, dunkel Creme zu 6 %, `--glas-grund-basis`, `--glas-anteil-grund`), damit der
  Verlauf durchscheint; `marken.py` (Punkt 9) misst Text und Blau auf diesem
  Glas über jeder Stufe des Verlaufs. Die Kapsel über einer App liegt über dem
  Inhalt und bleibt beim vollen `--glas-anteil`.
- Glasflächen je Ansicht: die Leiste, über einer App die Kapsel, dazu
  höchstens ein offenes Menü.

## Symbole

Lucide, **nur über die Bibliothek**: `import { Trash2 } from '@marken/symbole'`
und gezeichnet mit `<Icon symbol={Trash2} groesse="klein|mittel|gross" />`
(14, 16, 20 px). Eine Strichstärke, 1,75 px, unabhängig von der Größe:
`theme.css` zieht jedes Lucide-Symbol darauf (`non-scaling-stroke`), auch
eines, das direkt als Komponente steht. `scripts/test/bausteine.py` (Regel 10)
meldet jeden freien Import von `lucide-react` außerhalb von
`packages/marken/`; das Entwickler-Cockpit lädt die Bibliothek zur Laufzeit,
und bindet seit 5.9.0 `@marken/symbole` an `/marken/5/symbole.js`, einen
eigenen Eingang der Laufzeit; `LUCIDE_RATSCHE` ist damit leer und bleibt es.

## Maße

| Teil               | Maß                                                          |
| ------------------ | ------------------------------------------------------------ |
| Button mit Text    | 32 px hoch, Radius 8 px, Schrift 14 px (`size` default)      |
| Icon-Button        | 28 px, ohne Rahmen, getönt beim Überfahren (`size="icon"`)   |
| Feld im Formular   | 32 px hoch (`Input`, `SelectTrigger`)                        |
| Menü, Aufklappfeld | Glas, Radius 12 px                                           |
| Dialog             | Fläche deckend, Radius 16 px, Schleier mit Unschärfe         |
| Seitenkopf         | Zeile 28 px, Titel 20 px, Satz 13 px, 20 px Abstand darunter |
| Werkzeug           | 28 px, Symbol 16 px, 2 px Abstand in der Werkzeugleiste      |
| Tabellenzeile      | 40 px, Kopfzeile 32 px, Fläche deckend, Radius 12 px         |

## Seitenkopf und kompakte Bausteine (5.9.0)

Karte bausteine-seitenkopf-und-kompakt (J50, 20.11.2026), Vorgabe ist der
Abschnitt „Neue Bausteine der Bibliothek" im Entwurf `gestaltung.md`.

- **Jede Seite beginnt gleich.** `Kopf` zeichnet eine Zeile: links Titel und
  ein Satz, rechts die Werkzeugleiste (`werkzeuge`, `role="toolbar"`) aus
  `Werkzeug`-Knöpfen, als letztes nach einem feinen Strich der Knopf der
  Seitenleiste (`KopfVorne`, gesetzt vom `Bereichsrahmen` und vom Rahmen einer
  App; seit 5.9.1 dort, damit Titel und Inhalt eine linke Kante haben).
  Ränder der Seite überall gleich: oben 10 px, seitlich 16 bis 24 px,
  höchstens 64rem breit. Daneben höchstens
  Knöpfe mit Text (`aktionen`). Keine Trennlinie, kein Symbol vor dem Titel,
  keine eigene Zeile mit einem einzelnen Icon darüber. Steht in einem Bereich
  kein Kopf, zeigt `KopfVorne` den Knopf allein, damit die Leiste am Handy
  erreichbar bleibt; nur der oberste Kopf trägt ihn.
- **Platz der Kapsel und der Leiste.** Der Kopf hält rechts
  `--ara-kapsel-platz` frei (der Rahmen setzt ihn am `<html>` der App), so
  überdecken sich Kapsel und Werkzeuge nie. Am Handy schwebt die Leiste über
  der Fläche; die Shell nennt ihren Platz als `--ara-leiste-platz`, und
  Bereichsrahmen, Startseite und der Rahmen einer App halten ihn unten frei.
- **Kompakte Tabelle.** `Table` hat Kopfzeile 32 px und Zeilen 40 px; die
  `Datenliste` liegt deckend auf `--card` (Radius 12 px, feine Kante), ihre
  Beschriftung ist nur für Vorlesewerkzeuge, unter 640 px ihres Kastens
  stehen Karten (die erste Spalte als Titel in bis zu zwei Zeilen, der Rest in
  einer Zeile darunter). Eine Zelle hat eine Zeile: was zwei braucht, wird eine
  zweite Spalte. Der `Leerzustand` sagt einen Satz und bietet eine Aktion.
- **Formular.** Felder 32 px am Rechner, bei grobem Zeiger 44 px.
- **Kennzahl und Diagramm.** `Kennzahl` liegt deckend, die Zahl 20 px, auf
  Wunsch `verlauf` als blaue Linie ohne Achsen (ohne `recharts`). `Chart`
  zeichnet Linien oder Balken (`art`) im selben Stil: nur waagrechte
  Hilfslinien, Achsen ohne Strich, Beschriftung 12 px grau, Reihen Blau,
  Schwarz, Grau, Balken oben 4 px rund.
- **Startseite.** Eine Kachel je App, wie in der Leiste; ein Klick öffnet die
  zuletzt benutzte Fassung, die Zahl offener Freigaben zählt alle Fassungen.

Höhen von Knopf und Feld stehen in **Pixeln**, nicht in rem: die Shell rechnet
mit 17 px Wurzelschrift (Root-Hebel unten), 2 rem wären dort 34 px. Bei
grobem Zeiger und am Handy ist jede **Trefferfläche** mindestens 44 px, der
sichtbare Knopf bleibt kompakt: `Button` legt ein leeres `::before` von 44 px
darüber, und die allgemeine 44-px-Regel in `index.css` lässt ihn deshalb aus.
Nichts ist kleiner als 24 px. Rot nur für Löschen.

- **Radien** `--radius-xs/sm/md/lg/2xl/xl` = 4/6/8/12/14/16 px.
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
- Übergänge aus `--transition-fast/base/slow` (0,15/0,2/0,3 s), keine eigenen
  Zeiten; Knöpfe 120 ms.

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
| `Seitenleiste`                 | Navigation aus einer Liste, auf dem Primitiv `Sidebar`; DIE Leiste von Verwaltung, Einstellungen und jeder App (Titel, 32 px, 16 px, 2 px)       |
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

| Baustein                      | Was er festlegt                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Kopf`                        | Seitentitel als einziges `h1`, ein Satz, Werkzeugleiste (`Werkzeug`), Knopf der Seitenleiste (`KopfVorne`), seit 5.9.0                 |
| `Liste` / `ListenEintrag`     | eine Reihe; ein Eintrag ist ein Knopf, sobald er etwas tut                                                                             |
| `Karte`                       | die erhabene Fläche für ein Ding, das für sich steht (`--card`); mit `symbol` eine Zeile, das Symbol auf blau getöntem Quadrat (5.6.0) |
| `Formular` / `Feld` / `Knopf` | ein echtes `form` (Eingabetaste sendet ab), Felder mit `label`                                                                         |
| `Meldung`                     | Hinweis, Erfolg, Warnung, Fehler — die Art steht auch im Text, nie nur in der Farbe                                                    |
| `Menue`                       | für eine App: die Fläche über der Seite hinter einem Hamburger-Knopf (unter 900 px)                                                    |

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

**Um die Ansicht steht nur die Aktivitätsleiste** (Karte
glas-rahmen-und-leiste, 20.11.2026; Zielbild in `gestaltung.md` des
Überordners, Abschnitt Rahmen). Sie ist ein Stück Glas, das mit 8 px Abstand
zum Rand auf `--verlauf-rahmen` schwebt, Radius 16 px, 52 px breit, Einträge
36 px, Symbole 18 px, in drei Abschnitten mit zwei feinen Trennern: oben das
Logo des Hauses (falls hinterlegt) und Start mit der Zahl offener Freigaben;
in der Mitte die freigegebenen Apps, **jede genau einmal**, als Symbol mit dem
Namen beim Überfahren (ab etwa zehn rollt dieser Teil, Ordnung durch Ziehen);
unten Terminal (nur Entwickler), Verwaltung (nur Administrator),
Einstellungen und das **Konto** als runde Fläche mit Name, Rolle und
„Abmelden“. Die Ansicht liegt daneben als deckende Fläche mit Radius 14 px.
Es gibt keine Kopfleiste, keine Tab-Leiste, keine rechte Spalte, keine zweite
Seitenleiste und **keine Statuszeile** mehr; Datum und Uhrzeit zeigt Arasul
nicht, eine Störung erscheint als Meldung.

**Über einer App schwebt oben rechts die Kapsel** (`features/apps/Kapsel.tsx`):
Glas, 32 px hoch, darin der Umschalter Live und Test (nur, wenn dieser Mensch
beide Fassungen sehen darf) und das Rückmelde-Icon. Ein Klick auf eine App in
der Leiste öffnet die Fassung, in der man sie zuletzt offen hatte
(`zuletztStand` im Store). Die Testfassung trägt einen blauen Rand um die
Fläche und das Wort Test oben in der Mitte, innen an der Kante; die App erfährt den
Platz der Kapsel als `--ara-kapsel-platz`.

Verwaltung und Einstellungen sind gebaut wie eine App (Karte
jet-rahmen-einheitlich, 07.10.2026): links das Muster `Seitenleiste`,
dasselbe, das jede App zeichnet (Titel oben, Zeilen 32 px, Symbol 16 px, 2 px
Abstand, Auswahl getönt mit Akzent zu 12 %, Gruppen mit kleiner Überschrift),
ohne zweite Reiterstufe — was lang ist, klappt auf (der Bereich System). Die
Shell setzt beide über `components/Bereichsrahmen.tsx` zusammen.

Unter 900 px schwebt die Aktivitätsleiste unten als Glas, 8 px vom Rand:
Start, bis zu vier Apps und „Mehr“ mit den übrigen Apps, Terminal,
Verwaltung, Einstellungen und „Abmelden“. Ungewählt stehen nur Symbole, der
gewählte Eintrag trägt seinen Namen auf einer blau getönten Fläche, auch
„Mehr“, wenn dort etwas offen ist; so wird kein Name abgeschnitten. Verwaltung und Einstellungen öffnen ihre Leiste dort
als Blatt über einen Knopf oben.

**Die Rolle blendet aus, das Backend entscheidet.** Ein Mitarbeiter sieht die
Startseite, seine Apps, seine Einstellungen und sein Konto; die Verwaltung
blendet die Oberfläche für ihn aus. Das ist keine Berechtigung:
`requireRole` im Backend antwortet ihm auf jeden dieser Wege mit `403`, ob der
Knopf da ist oder nicht. Ein Knopf, der bei jedem Klick 403 sagt, ist kein
Schutz, sondern eine Sackgasse. Umgekehrt darf nichts, was jeder braucht, hinter
einer Admin-Seite liegen — das Abmelden lag bis D1 in den Einstellungen und
sitzt seit der Karte glas-rahmen-und-leiste im Konto unten in der
Aktivitätsleiste, am Handy unter „Mehr“.

## Wo was steht

| Frage                                 | Ort                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Wert eines Tokens                     | `packages/marken/src/theme.css` (`@theme`, `@theme inline`, `:root`, Dunkel)   |
| Ein neues Primitiv                    | `packages/marken/src/primitive/` + Barrel + Schaustück + `fassung.ts` heben    |
| Ein neues Muster                      | `packages/marken/src/muster/` + Barrel + Schaustück + `fassung.ts` heben       |
| Neuer Token, neue Farbe, neuer Radius | dort ergänzen, hier nur, wenn es eine Regel ändert                             |
| Frontend-Konventionen                 | [`apps/dashboard-frontend/CLAUDE.md`](../../apps/dashboard-frontend/CLAUDE.md) |
| Wächter                               | `scripts/test/check-design-system.js`, `scripts/test/bausteine.py`             |
