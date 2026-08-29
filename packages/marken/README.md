# Marken — das Designsystem des Geräts

Die Tokens (`theme.css`), **sechsundzwanzig Primitive** auf Radix und Tailwind
und **sechs Bausteine** auf reinem CSS. Sie tragen die Shell und jede App auf
diesem Gerät.

## Zwei Sätze, zwei Laufzeiten (Phase H3)

|                   | Primitive (H3)                                | Bausteine (D7)                              |
| ----------------- | --------------------------------------------- | ------------------------------------------- |
| Was               | Button, Input, Dialog, Tabs, Badge … (26)     | Kopf, Liste, Karte, Formular, Meldung, Menü |
| Worauf            | Radix + Tailwind-Utilities aus `theme.css`    | reines CSS, Klassen `ara-*`                 |
| Braucht einen Bau | **ja**                                        | nein                                        |
| Wer sie bekommt   | die Shell, eine App **mit** Bau (Kit-Vorlage) | zusätzlich jede App **ohne** Bau            |
| Wo                | `src/primitive/`                              | `src/*.tsx`                                 |

Das ist keine Doppelung, sondern der Unterschied zwischen zwei Laufzeiten. Eine
App ohne Bau hat keinen Tailwind, der die Klassen der Primitive erzeugt — sie
bekäme sechsundzwanzig Bausteine, von denen kein einziger aussieht wie etwas.
`browser.ts` gibt deshalb nur die Bausteine aus, `index.ts` beides. Wer die
Primitive will, braucht einen Bau.

**Die Schauseite** liegt in der Shell unter `/entwickler/bausteine` und zeigt
jedes Primitiv in allen seinen Zuständen, hell und dunkel.
`scripts/test/schauseite.mjs` macht davon Bilder bei 390, 1024 und 1440 px.
`scripts/test/bausteine.py` meldet ein Primitiv ohne Schaustück: ein Baustein,
den heute niemand benutzt, sieht in einem der beiden Themes falsch aus, und es
merkt sonst erst der, der ihn in einem halben Jahr zum ersten Mal einsetzt.

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

| Wer                            | Wie                                                               |
| ------------------------------ | ----------------------------------------------------------------- |
| die Shell                      | `import { Button, Karte } from '@marken'` — Vite-Alias auf `src/` |
| eine App **ohne** Bau          | `import { Karte } from './marken.js'` — `browser/marken.js`       |
| eine App **mit** Bau (Kit, E5) | Spiegel dieses Ordners in die Vorlage, dann wie die Shell         |

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

Die Bibliothek kennt dieselbe Schwelle wie die Shell (`useSchmalesFenster`):
darunter **eine Spalte** und ein Strom (`.ara-strom`), das Menü als Fläche über
der Seite; darüber die drei Spalten aus D1. Ein geschrumpfter Desktop ist kein
Telefon-Aufbau.
