# Marken: das Designsystem von Arasul

Dieses Paket ist die Bibliothek, die die Oberfläche des Geräts trägt: die
Tokens beider Themes, sechsundvierzig Primitive auf Radix und Tailwind, zehn
Muster darüber und sechs Bausteine auf reinem CSS.

Was darin liegt:

| Ort                     | Was                                                                         |
| ----------------------- | --------------------------------------------------------------------------- |
| `marken.json`           | Fassung, Abhängigkeiten und jede Datei mit ihrem sha256                     |
| `src/theme.css`         | die Tokens beider Themes, Pflicht für die Primitive und die Muster          |
| `src/marken.css`        | die Regeln der Bausteine und der Dokumentanzeige (Klassen `ara-*`)          |
| `src/primitive/`        | Button, Input, Dialog, Tabelle, Kalender … (46)                             |
| `src/muster/`           | Datenliste, Suchauswahl, Dialogform, Dokumentanzeige … (10)                 |
| `src/*.tsx`             | die sechs Bausteine, sie laufen auch ohne Tailwind                          |
| `browser/marken.js`     | die Bausteine und die Dokumentanzeige samt React, für eine App **ohne** Bau |
| `browser/marken-pdf.js` | pdf.js als eigener Brocken, die Dokumentanzeige holt ihn per `import()`     |
| `browser/pdf-dateien/`  | Worker, WASM, Schriften, CMaps, ICC für pdf.js                              |

**Das Paket ist, was `marken.json` nennt.** Wer wissen will, ob eine Kopie
noch die ist, die ausgeliefert wurde, rechnet die Hashes nach; wer wissen
will, welche Fassung er trägt, liest `fassung`. Beides ohne Rückfrage bei dem,
der sie hingelegt hat.

## Der kürzeste Weg: vom Gerät zur Laufzeit

Ein Gerät ab Bibliothek 5.3.0 liefert diese Bibliothek selbst aus, unter
`/marken/<haupt>/` auf derselben Herkunft wie jede App. Wer von dort lädt,
legt **keine Kopie** in sein Paket, braucht **kein Tailwind** und bekommt mit
jedem Update des Geräts die neue Fassung, ohne neu zu bauen.

Im Manifest steht dann nur die Hauptzahl:

```json
{ "marken": "5" }
```

Ohne Bau:

```html
<link rel="stylesheet" href="/marken/5/marken.css" />
<script type="module">
  import { h, rendern, Seitenleiste, Datenliste, Freigabe } from '/marken/5/marken.js';
</script>
```

Mit Bau (Vite): React und die Bibliothek bleiben außerhalb des Bündels.

```js
const MARKEN = '/marken/5/';
const vomGeraet = {
  react: MARKEN + 'react.js',
  'react-dom': MARKEN + 'react-dom.js',
  'react-dom/client': MARKEN + 'react-dom-client.js',
  'react/jsx-runtime': MARKEN + 'jsx-runtime.js',
  '@marken': MARKEN + 'marken.js',
  '@marken/diagramm': MARKEN + 'diagramm.js',
};
// build.rollupOptions: { external: Object.keys(vomGeraet), output: { paths: vomGeraet } }
```

Die Typen kommen weiter aus `src/` (Alias `@marken` in der `tsconfig`),
gebündelt wird davon nichts. Welche Fassung und Hauptzahl ein Gerät
ausliefert, steht ohne Anmeldung in `/marken/marken.json`. Unter
`/marken/5/` steht immer die neueste Fassung 5.x; ein Bruch hebt die
Hauptzahl und damit die Adresse. Der Kontrakt des Geräts nennt denselben Weg
im Abschnitt `marken`.

**Eine Freigabe mit erkannten Feldern (ab 5.4.0).** Die Anfragen aus
`GET /api/freigabe-anfragen` tragen bei einer Erkennung `felder`, `original` und
`frueher`; das Muster `Freigabe` zeigt sie mit dem Original links, den Feldern
rechts und „prüfen" oben, und `beiBestaetigen(eintrag, geaendert)` bekommt die
geänderten Werte, die die App als `felder` an `…/bestaetigen` schickt:

```js
h(Freigabe, {
  eintraege: anfragen.map(a => ({
    id: a.id,
    titel: a.titel,
    frist: a.frist,
    angefragtAm: a.angefragt_am,
    felder: a.felder,
    original: a.original,
    bisher: (a.frueher || []).map(v => ({
      titel: v.titel,
      stufe: v.stufe,
      status: v.status,
      entschiedenVon: v.entschieden_von,
      entschiedenAm: v.entschieden_am,
      korrekturen: v.korrekturen,
    })),
  })),
  beiBestaetigen: (e, felder) =>
    senden(`/api/freigabe-anfragen/${e.id}/bestaetigen`, felder ? { felder } : {}),
  beiAblehnen: (e, grund) =>
    senden(`/api/freigabe-anfragen/${e.id}/ablehnen`, { begruendung: grund }),
});
```

Die zwei Wege darunter legen eine Kopie in die App. Sie laufen weiter, die
Kopie veraltet aber mit jedem Update des Geräts.

## Eine App mit Bau

Sie bekommt alle drei Sätze. Vier Handgriffe:

**1. Die Quelle hineinlegen.** `src/` wird zu `src/marken/` im Frontend. Eine
Kopie und kein npm-Paket: die Bibliothek wird mit der App übersetzt, es gibt
kein `dist/`, das jemand vergisst.

**2. Die Abhängigkeiten holen.** Sie stehen in `marken.json` unter
`abhaengigkeiten`, mit der Version, die das Gerät selbst benutzt. `react` und
`react-dom` stehen unter `gleichlauf`. Die stellt die App, denn zweimal React
in einem Baum sieht man erst an einem Hook.

```bash
npm install $(node -p "Object.entries(require('./marken.json').abhaengigkeiten).map(([n,v])=>n+'@'+v).join(' ')")
```

**3. Die Stylesheets holen**, in dieser Reihenfolge, in der CSS-Datei der App:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './marken/theme.css';
@import './marken/marken.css' layer(components);
@source './marken';
```

`theme.css` **ohne Schicht**: ein `@theme` in einem `layer(...)`-Import ist
keins mehr, und `bg-primary` gäbe es dann nicht. `marken.css` dagegen **mit**
`layer(components)`: ungeschichtetes CSS gewinnt gegen jede Schicht, auch
gegen die Utilities, und eine Tailwind-Klasse an einem Baustein wäre sonst
wirkungslos. `@source` braucht nur, wer die Bibliothek **außerhalb** der Wurzel
seines Vite-Projekts liegen hat; innerhalb findet Tailwind sie von selbst.

**4. Importieren.** Entweder relativ (`from './marken'`) oder über einen Alias
`@marken` in `vite.config` und `tsconfig`:

```tsx
import { Button, Datenliste, Kopf } from './marken';
```

**Das Diagramm hat seit 5.0.0 einen eigenen Einstieg:** `Chart`,
`Sparkline` und `SERIENFARBEN` stehen nicht im Sammelexport, sondern in
`diagramm.ts`: `recharts` hat Seiteneffekte beim Laden, und über das Barrel
baute jede App 280 kB davon mit, auch ohne ein einziges Diagramm. Mit Alias
braucht die `tsconfig` dafür den Pfad mit Stern:

```jsonc
"paths": { "@marken": ["./src/marken/index.ts"], "@marken/*": ["./src/marken/*"] }
```

```tsx
import { Chart, Sparkline } from '@marken/diagramm'; // oder './marken/diagramm'
```

**5. Nur wer die `Dokumentanzeige` benutzt:** die Stützdateien von pdf.js
(Worker, WASM, Schriften, CMaps, ICC) müssen nach dem Bau als Ordner
`pdf-dateien/` **neben den JavaScript-Chunks** liegen. Die Bibliothek löst
sie zur Laufzeit relativ zu `import.meta.url` auf, absichtlich ohne
Vite-Asset-Import (ein data:-Worker fällt an der CSP des Geräts). Das Plugin
dafür liegt neben diesem Paket (`pdf-dateien.mjs`); in der `vite.config`:

```ts
import { pdfDateienBeilegen } from './pdf-dateien.mjs';
// …
plugins: [react(), pdfDateienBeilegen(() => path.resolve(__dirname, 'dist/assets'))],
```

Ohne die Dateien zeigt die Dokumentanzeige Bilder weiterhin; ein PDF endet
im Fehlerzustand („Das Dokument ließ sich nicht öffnen").

## Eine App ohne Bau

Sie bekommt die sechs Bausteine **und die Dokumentanzeige**, und sie braucht
dafür weder Tailwind noch einen Bündler. Den Inhalt von `browser/` und das
Stylesheet neben die App legen (`scripts/util/marken-beilegen.sh` tut genau
das):

```
browser/marken.js       →  marken.js
browser/marken-pdf.js   →  marken-pdf.js      (lädt erst mit der ersten PDF-Quelle)
browser/pdf-dateien/    →  pdf-dateien/
src/marken.css          →  marken.css
```

```html
<link rel="stylesheet" href="./marken.css" />
<script type="module">
  import { h, rendern, Karte, Kopf } from './marken.js';
  rendern(h(Karte, { titel: 'Hallo' }), document.getElementById('app'));
</script>
```

**Kein JSX**, sondern `h(Karte, {…})`. JSX braucht im Browser einen Übersetzer,
und der arbeitet mit `eval`, und das verbietet die Content-Security-Policy des
Geräts. Dieselbe Sache, eine Zeile unbequemer.

`theme.css` gehört hier **nicht** dazu: es trägt die Tokens der Primitive, und
die stehen auf Tailwind. Ohne Bündler gäbe es die Klassen nicht, die die Tokens
färben würden. Die Farben der sechs Bausteine kommen stattdessen aus den
Rückfällen in `marken.css` (`var(--token, <Wert>)`).

## Die zwei Themes

Hell ist die Vorgabe und steht in `:root`; `[data-theme='dark']` trägt, was im
Dunkeln abweicht. **Eine App muss dafür nichts tun.** Läuft sie im Rahmen des
Geräts, schreibt die Shell das Attribut in ihr Dokument, bei jedem Wechsel und
bei jedem Laden. Wer mehr tut als Farben tauschen, hört zusätzlich auf
`postMessage {typ: 'arasul:theme', theme}` am eigenen Fenster.

## Welche Fassung trägt meine App?

Sie sagt es in ihrem Manifest, und das Gerät liest es:

```json
{ "marken": "3.1.0" }
```

Steht dort eine ältere Fassung als die des Geräts (oder gar keine), sagt die
App-Verwaltung des Administrators das. Eine Kopie veraltet lautlos, und nichts
an einer laufenden App würde davon rot.
