# Marken — das Designsystem des Geräts

Die Tokens (`theme.css`), **sechsundvierzig Primitive** auf Radix und Tailwind,
**neun Muster** darüber und **sechs Bausteine** auf reinem CSS. Sie tragen
die Shell und jede App auf diesem Gerät.

## Drei Sätze, zwei Laufzeiten (Phasen H3 und H4)

|                   | Primitive (H3, H4)                              | Muster (H4)                            | Bausteine (D7)                              |
| ----------------- | ----------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| Was               | Button, Input, Dialog, Tabelle, Kalender … (46) | Datenliste, Dialogform, Kennzahl … (9) | Kopf, Liste, Karte, Formular, Meldung, Menü |
| Höhe              | ein Teil                                        | eine **Form**, aus Teilen gebaut       | ein Teil, ohne Tailwind                     |
| Worauf            | Radix + Tailwind-Utilities aus `theme.css`      | die Primitive                          | reines CSS, Klassen `ara-*`                 |
| Braucht einen Bau | **ja**                                          | **ja**                                 | nein                                        |
| Wer sie bekommt   | die Shell, eine App **mit** Bau (Kit-Vorlage)   | dieselben                              | zusätzlich jede App **ohne** Bau            |
| Wo                | `src/primitive/`                                | `src/muster/`                          | `src/*.tsx`                                 |

Das ist keine Doppelung, sondern erstens der Unterschied zwischen zwei
Laufzeiten und zweitens der zwischen zwei Höhen. Eine App ohne Bau hat keinen
Tailwind, der die Klassen der Primitive erzeugt — sie bekäme sechsundvierzig
Bausteine, von denen kein einziger aussieht wie etwas. `browser.ts` gibt
deshalb nur die Bausteine aus, `index.ts` alle drei Sätze. Wer die Primitive
oder die Muster will, braucht einen Bau.

### Warum es die Muster gibt (Phase H4)

Bis H3 hatte die Bibliothek nur Teile. Wer damit eine Fachanwendung baute,
schrieb für eine sortierbare Liste mit Suchfeld, Leerzustand und einer Form
für kleine Fenster rund zweihundert Zeilen — und die nächste Anwendung schrieb
zweihundert andere. Genau daraus sind vor Plan 023 die zwanzig Kopfstellen mit
derselben Klassenkette entstanden. Ein Muster ist die Antwort: **eine Form, an
einer Stelle, mit einer Liste als Eingabe.**

Sie wissen trotzdem nichts von Arasul. Kein Muster kennt eine Route, einen
Endpunkt oder einen Benutzer — `Datenliste` bekommt Zeilen, `Seitenleiste`
bekommt Einträge. Was über **dieses** Gerät Bescheid weiß (`AuthCard` mit dem
Maskottchen und dem Produktnamen, `SkeletonList` mit der Form einer Zeile
hier, `NichtGefunden`, `ErrorBoundary`), bleibt in der Shell.

**Drei Einträge dieser Liste waren falsch, und H5 hat sie geholt.** `Modal`,
`ConfirmModal` und `StatTile` standen in `components/ui/` der Shell und
wussten nichts von Arasul — ein Titel mit einem Rumpf, eine Frage mit zwei
Knöpfen, eine Zahl mit ihrer Beschriftung. Sie heißen jetzt `Dialogform`,
`Bestaetigung` und `Kennzahl`. `FilterBar` ist dabei ganz gefallen: es war
eine zweite Tab-Leiste neben dem Primitiv `Tabs`.

### Was H4 bewusst NICHT gebaut hat

shadcn führt zwei Bausteine, die dieses Gerät schon hat:

| shadcn   | hier                                                             |
| -------- | ---------------------------------------------------------------- |
| `Drawer` | `Sheet side="bottom"` — dieselbe Sache, ein Paket weniger (vaul) |
| `Sonner` | `Toast` samt der Warteschlange in `ToastContext`                 |

Zwei Bausteine unter einer Sache sind die Verwechslung selbst; das ist derselbe
Grund, aus dem `scripts/test/marken.py` (Punkt 7) keinen Namen zweimal duldet.
Und `Combobox` ist kein eigener Name, sondern das Muster **`Suchauswahl`** —
shadcn führt es ohnehin nur als Rezept aus `Popover` plus `Command`.

### Vier Abhängigkeiten von außen

`cmdk` (Suchliste), `react-day-picker` (Kalender), `embla-carousel-react`
(Karussell) und `input-otp` (Einmalcode). Sie stehen in der `package.json` der
Shell, weil die Bibliothek kein npm-Paket ist, und mit ihrem Grund in
`apps/dashboard-frontend/knip.json` — knip sieht diesen Ordner nicht.
Alles andere steht auf `radix-ui`, `react-hook-form`, `react-resizable-panels`
und `recharts`, die schon im Lockfile standen.

**`tw-animate-css` gehört dazu.** Die Bewegungen der Primitive (`animate-in`,
`animate-accordion-down`, `animate-caret-blink`) kommen von dort, nicht aus
`theme.css`; die Shell holt es in `index.css`, und eine App mit Bau braucht
dieselbe Zeile. Nur die zwei Bilder des `Ladezustand` stehen in `theme.css` —
sie gehören diesem Gerät und keinem Paket.

**Die Schauseite** liegt in der Shell unter `/entwickler/bausteine` und zeigt
jedes Primitiv **und jedes Muster** in allen seinen Zuständen, hell und dunkel.
Sie liegt seit H4 in drei Dateien (`Schauseite.tsx` als Rahmen mit den H3-Stücken,
`SchaustueckeH4.tsx`, `SchaustueckeMuster.tsx`) — dreiundfünfzig Stücke in einer
Datei findet niemand mehr. `scripts/test/schauseite.mjs` macht davon Bilder bei
390, 1024 und 1440 px. `scripts/test/bausteine.py` meldet einen Baustein ohne
Schaustück: einer, den heute niemand benutzt, sieht in einem der beiden Themes
falsch aus, und es merkt sonst erst der, der ihn in einem halben Jahr zum ersten
Mal einsetzt. Bei einem Muster ist das noch dringender — es hat mehr Zustände
als ein Primitiv, nicht weniger: leer, gefüllt, gefiltert-und-leer, ladend, und
unter 900 px eine andere Form.

## Die Tokens: `theme.css` (Phase H3)

Hier stehen die Werte — und zwar **hier und nicht in der Shell**. Bis H2 war es
umgekehrt: `apps/dashboard-frontend/src/index.css` hielt die Tokens, und diese
Bibliothek trug eine Kopie davon als Rückfall. Seit die Primitive hier liegen
und auf Tailwind geschrieben sind (`bg-secondary`, `text-muted-foreground`),
braucht **eine App** den `@theme`-Block genauso — und hätte ihn aus der Shell
abschreiben müssen.

Vier Blöcke:

| Block                 | Was darin steht                                                           |
| --------------------- | ------------------------------------------------------------------------- |
| `@theme`              | Rundungen, Schriften, Dichte-Skala → `rounded-md`, `text-ui-sm`, `p-ui-2` |
| `@theme inline`       | die Brücke `--color-background: var(--background)`                        |
| `:root`               | die Farben von **Hell**, der Vorgabe (H1)                                 |
| `[data-theme='dark']` | nur das, was im Dunkeln abweicht                                          |

`index.css` holt die Datei mit einem `@import` **ohne Schicht** — ein `@theme`
in einem `layer(...)`-Import wäre keins mehr — und sagt Tailwind mit
`@source "../../../packages/marken/src"`, wo es die Klassen der Primitive
findet. Ohne diese Zeile stünden sie in der Shell ohne jede Regel da, und
nichts an der Übersetzung wäre rot.

**Keine Farbe ohne Token.** Ein Hex-Literal gehört in `theme.css` und nirgends
sonst; ein `bg-black/50` in einem Primitiv ist derselbe Fehler mit anderer
Schreibweise, denn Tailwinds eingebaute Palette folgt keinem Thema.
`scripts/test/marken.py` (Punkt 6) meldet beides.

## Eine Variable in einem Utility steht in runden Klammern (J31)

`w-(--sidebar-breite)`, nicht `w-[--sidebar-breite]`. Tailwind 3 kannte eine
Kurzform und schenkte der eckigen Form ihr `var()`; **Tailwind 4 tut das
nicht mehr**. Dieselbe Klasse erzeugt seither

```css
.w-\[--sidebar-breite\] {
  width: --sidebar-breite;
}
```

— keine Länge, sondern ein Name. Der Browser verwirft die Deklaration
**wortlos**, die Breite fällt auf `auto` zurück, und ein leerer Platzhalter ist
damit null Pixel breit. Genau so lag die Seitenleiste im Rahmen einer App am
29.08.2026 über ihrem Inhalt: die Klasse war da, die Regel war da, nur ihr
Inhalt war kein Wert.

Das ist der gefährlichste Fehler, den diese Bibliothek machen kann, weil
**nichts** davon rot wird — keine Übersetzung, kein Test, und auch die
Oberflächen-Abnahme nicht: sie misst Farben, Konsole und Rollbreite, aber
keine Breiten. `scripts/test/check-design-system.js` meldet die alte
Schreibweise, in dieser Bibliothek und in der Shell.

Unberührt bleibt das **Setzen** einer Variablen: `[--cell-size:2rem]` ist kein
Utility mit einem Wert, sondern eine Deklaration, und die gibt es in
Tailwind 4 unverändert.

Und ein Nachtrag, der beim Nachmessen am Gerät herausfiel: **in einer
Tailwind-Quelle ist ein Kommentar kein Kommentar.** Der Scanner liest Text, kein
JavaScript. Nach der Reparatur stand im fertigen Bau weiter
`.w-\[--sidebar-breite\]{width:--sidebar-breite}`, obwohl keine Quelle die
Klasse mehr benutzte — sie kam aus dem Satz darüber, dass man sie nicht benutzen
soll. Der Wächter meldet die alte Schreibweise deshalb auch im Kommentar. Wer
sie ausschreiben will, tut das außerhalb von `src/` (hier in dieser Datei etwa,
oder unter `scripts/`); innerhalb umschreibt man sie.

## Zwei Themes, und Hell ist der Grund (Phase H2)

`marken.css` hat dieselbe Form wie `theme.css`: `:root` **ist** Hell, und
`[data-theme='dark']` trägt die Werte, die im Dunkeln abweichen. Was der
Dunkel-Block der Quelle nicht überschreibt, steht auch hier nur einmal — eine
Farbe, die es nur im Dunkeln gibt, ist eine, die im Hellen fehlt.

Eine App läuft im `iframe` als eigenes Dokument, und CSS-Variablen reichen
nicht über eine Dokumentgrenze. Das Attribut kommt deshalb von außen: die Shell
schreibt es in das Dokument des Rahmens (`AppRahmen`, gleiche Herkunft).
**Die App muss dafür nichts tun** — sie lädt `marken.css` und geht mit. Wer
mehr tut als Farben tauschen, hört zusätzlich auf
`postMessage {typ: 'arasul:theme', theme}` am eigenen Fenster.

`scripts/test/marken.py` hält **jeden** `--ara-*`-Rückfall an seinem Token in
`theme.css` fest. Ohne diesen Wächter läuft die Kopie lautlos auseinander: in
der Shell gewinnt immer der Token, also sieht man dort nichts, und in einer App
ohne Bau sieht es niemand, der gerade an den Tokens arbeitet.

## Warum es das gibt (Phase D7, 28.08.2026)

Bis D6 hatte Arasul seine Oberfläche und jede App ihre eigene. Die Beispielapp
brachte zwölf Zeilen `stil.css` mit, die Vorlage des Ara-Kits hätte die
dreizehnte gehabt, und der Mensch sieht beides in **einem** Rahmen übereinander
— zwei Erscheinungsbilder auf einem Bildschirm sind kein Geschmack, sondern ein
Fehler.

## Zwei Wege hinein, eine Quelle

| Wer                            | Wie                                                                    |
| ------------------------------ | ---------------------------------------------------------------------- |
| die Shell                      | `import { Button, Datenliste } from '@marken'` — Vite-Alias auf `src/` |
| eine App **ohne** Bau          | `import { Karte } from './marken.js'` — `browser/marken.js`            |
| eine App **mit** Bau (Kit, E5) | Spiegel dieses Ordners in die Vorlage, dann wie die Shell              |

`@marken` ist ein **Pfad-Alias** wie `@`, kein npm-Paket: die Bibliothek wird
mit der Shell übersetzt. Kein Eintrag im Wurzel-Lockfile, kein `dist/`, das
jemand vergisst. Die vier Pakete, auf denen die Primitive stehen (`radix-ui`,
`class-variance-authority`, `clsx`, `tailwind-merge`), stehen in der
`package.json` der Shell — sie übersetzt die Bibliothek mit. `knip` sieht diesen
Ordner nicht und meldet sie deshalb als ungenutzt; sie stehen mit diesem Grund
in `apps/dashboard-frontend/knip.json`.

Die Stylesheets gehören dazu und werden getrennt geladen:

| Datei        | Wer sie braucht                                                    |
| ------------ | ------------------------------------------------------------------ |
| `theme.css`  | jeder, der die **Primitive** benutzt (Shell, App mit Bau)          |
| `marken.css` | jeder, der die **Bausteine** benutzt — also auch eine App ohne Bau |

Eine Änderung nur an einem Stylesheet braucht keinen neuen Bau, aber sie
erreicht eine App am Gerät erst beim nächsten Einspielen.

## Die Auslieferung an Apps (Phase H6)

Bis H5 hatte die Bibliothek einen Ausgang nach draußen: das eingecheckte
Bündel für eine App ohne Bau. Wer eine App **mit** Bau schrieb, nahm „die
Quelle" — und das hieß: irgendein Ordner in irgendeinem Checkout. Das Ara-Kit
spiegelt sie aus dem Auslieferungsartefakt und las dort einen **flachen**
Ordner; seit H3 liegen die Primitive in `primitive/`, seit H4 die Muster in
`muster/`, und ein Spiegel, der nur die oberste Ebene mitnimmt, trägt eine
`index.ts`, die auf zwei Ordner zeigt, die es bei ihm nicht gibt.

Seit H6 gibt es das **Paket**, und es beantwortet die Frage, was dazugehört,
einmal und nachprüfbar:

```
marken.json        Fassung, Abhängigkeiten und JEDE Datei mit ihrem sha256
src/               die Quelle (ohne `__tests__/`, ohne `browser.ts`)
browser/marken.js  das Bündel für eine App ohne Bau
README.md          `EINBAU.md` — wie man es in ein Projekt einbaut
```

```bash
python3 scripts/deploy/marken-paket.py --ausgabe dist/marken   # das Paket
python3 scripts/deploy/marken-paket.py --pruefen <baum>        # trägt er es?
bash scripts/test/marken-paket-abnahme.sh                      # baut es woanders?
```

**Das Paket ist, was `marken.json` nennt.** Deshalb gibt es zwei Aufrufe und
trotzdem keine zwei Wahrheiten: `--ausgabe` legt es als eigenen Ordner hin,
`--stempel` schreibt nur die `marken.json` — so trägt das
Auslieferungsartefakt das Paket neben `packages/marken/`, ohne die Bibliothek
ein zweites Mal mitzuschleppen (`scripts/deploy/artefakt-bauen.sh`).

Die **Abhängigkeiten** sind nicht gepflegt, sondern gelesen: jeder Import aus
`src/`, der kein relativer Pfad ist, muss in der `package.json` der Shell
stehen, und von dort kommt die Version. Eine neue Abhängigkeit steht damit ohne
Zutun im Paket; eine, die niemand installieren kann, bringt den Bau zum Stehen.

Gemessen wird es **außerhalb dieses Repos**: `marken-paket-abnahme.sh` legt ein
frisches Vite-Projekt in einem Temp-Ordner an, holt die Abhängigkeiten, die der
Stempel nennt, kopiert `src/` hinein und übersetzt (`tsc --noEmit`,
`vite build`). Hier baut die Bibliothek immer — die Shell steht daneben, mit
ihrem Alias, ihrer `package.json` und ihrem `node_modules`. Ein Paket, das nur
in seinem eigenen Repo baut, ist keins.

Eine App **sagt in ihrem `app.json`**, auf welcher Fassung sie steht
(`"marken": "3.1.0"`), und die App-Verwaltung des Geräts meldet eine, die älter
ist als die Shell. `scripts/test/marken.py` (Punkt 8) hält die Angabe der
Beispielapp an dieser Bibliothek fest.

## Das Bündel für Apps ohne Bau

```bash
npm run marken          # baut packages/marken/browser/marken.js
python3 scripts/test/marken.py --wurzel .   # hält Quelle und Bündel aneinander
```

`browser/marken.js` bringt React und React-DOM mit und ist **eingecheckt** —
wie `packages/shared-schemas/dist/`. Auf dem Gerät gibt es kein `npm install`;
`scripts/test/beispielapp.sh` legt die Datei beim Einspielen neben die App.

**Kein JSX darin.** JSX braucht einen Übersetzer, und im Browser übersetzt einer
nur mit `eval` — das verbietet die Content-Security-Policy dieses Geräts, und
die Oberflächen-Abnahme fragt jedes Mal danach. Eine App ohne Bau schreibt
deshalb `h(Karte, {...})` statt `<Karte …/>`. Dieselbe Sache, eine Zeile
unbequemer.

Wer einen Baustein ändert, hebt `src/fassung.ts` und baut neu. Der Wächter
fällt sonst.

## Unter 900 px

Die Bibliothek kennt dieselbe Schwelle wie die Shell — und seit H4 **besitzt
sie den Hook dazu**: `useSchmalesFenster` ist aus `apps/dashboard-frontend/src/hooks/`
hierher gezogen, weil `Sidebar` und `Datenliste` ihn brauchen und ein Baustein
dieser Bibliothek nicht aus der Shell importieren darf (`marken.py`, Punkt 4).
Er steht bei den **Bausteinen**, nicht bei den Primitiven: er ist reines React
und braucht keinen Bau, also bekommt ihn auch eine App ohne Bau. Es gibt keinen
zweiten Schwellenwert im Produkt.

Darunter **eine Spalte** und ein Strom (`.ara-strom`), das Menü als Fläche über
der Seite; darüber die drei Spalten aus D1. Ein geschrumpfter Desktop ist kein
Telefon-Aufbau. Was das für die Muster heißt: `Datenliste` wird zur Kartenliste
(immer nur **eine** Form im Dokument — mit beiden nebeneinander stünde jede
Kennung doppelt da), `Sidebar` und `Seitenleiste` werden zu einem Blatt.
