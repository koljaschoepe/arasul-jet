# Marken — das Designsystem von Arasul

Dieses Paket ist die Bibliothek, die die Oberfläche des Geräts trägt: die
Tokens beider Themes, sechsundvierzig Primitive auf Radix und Tailwind, neun
Muster darüber und sechs Bausteine auf reinem CSS.

Was darin liegt:

| Ort                 | Was                                                                 |
| ------------------- | ------------------------------------------------------------------- |
| `marken.json`       | Fassung, Abhängigkeiten und jede Datei mit ihrem sha256             |
| `src/theme.css`     | die Tokens beider Themes — Pflicht für die Primitive und die Muster |
| `src/marken.css`    | die Regeln der sechs Bausteine (Klassen `ara-*`)                    |
| `src/primitive/`    | Button, Input, Dialog, Tabelle, Kalender … (46)                     |
| `src/muster/`       | Datenliste, Suchauswahl, Dialogform, Kennzahl … (9)                 |
| `src/*.tsx`         | die sechs Bausteine — sie laufen auch ohne Tailwind                 |
| `browser/marken.js` | dieselben sechs Bausteine samt React, für eine App **ohne** Bau     |

**Das Paket ist, was `marken.json` nennt.** Wer wissen will, ob eine Kopie
noch die ist, die ausgeliefert wurde, rechnet die Hashes nach; wer wissen
will, welche Fassung er trägt, liest `fassung`. Beides ohne Rückfrage bei dem,
der sie hingelegt hat.

## Eine App mit Bau

Sie bekommt alle drei Sätze. Vier Handgriffe:

**1. Die Quelle hineinlegen.** `src/` wird zu `src/marken/` im Frontend. Eine
Kopie und kein npm-Paket: die Bibliothek wird mit der App übersetzt, es gibt
kein `dist/`, das jemand vergisst.

**2. Die Abhängigkeiten holen.** Sie stehen in `marken.json` unter
`abhaengigkeiten`, mit der Version, die das Gerät selbst benutzt. `react` und
`react-dom` stehen unter `gleichlauf` — die stellt die App, denn zweimal React
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
seines Vite-Projekts liegen hat — innerhalb findet Tailwind sie von selbst.

**4. Importieren.** Entweder relativ (`from './marken'`) oder über einen Alias
`@marken` in `vite.config` und `tsconfig`:

```tsx
import { Button, Datenliste, Kopf } from './marken';
```

## Eine App ohne Bau

Sie bekommt die sechs Bausteine, und sie braucht dafür weder Tailwind noch
einen Bündler. Zwei Dateien neben die App legen:

```
browser/marken.js   →  marken.js
src/marken.css      →  marken.css
```

```html
<link rel="stylesheet" href="./marken.css" />
<script type="module">
  import { h, rendern, Karte, Kopf } from './marken.js';
  rendern(h(Karte, { titel: 'Hallo' }), document.getElementById('app'));
</script>
```

**Kein JSX**, sondern `h(Karte, {…})`. JSX braucht im Browser einen Übersetzer,
und der arbeitet mit `eval` — das verbietet die Content-Security-Policy des
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

Steht dort eine ältere Fassung als die des Geräts — oder gar keine —, sagt die
App-Verwaltung des Administrators das. Eine Kopie veraltet lautlos, und nichts
an einer laufenden App würde davon rot.
