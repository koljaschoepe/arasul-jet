# Marken — das Designsystem des Geräts

Schrift, Farben, Abstände — und die sechs Bausteine, die daraus gebaut sind:
**Kopf, Liste, Karte, Formular, Meldung, Menü**. Sie tragen die Shell und
jede App auf diesem Gerät.

Kein neues Erscheinungsbild: die Werte stehen seit Plan 002 in
`apps/dashboard-frontend/src/index.css` (Thema »Schwarz«) und sind hier als
`--ara-*` mit genau diesen Rückfällen aufgenommen.

## Warum es das gibt (Phase D7, 28.08.2026)

Bis D6 hatte Arasul seine Oberfläche und jede App ihre eigene. Die
Beispielapp brachte zwölf Zeilen `stil.css` mit, die Vorlage des Ara-Kits
hätte die dreizehnte gehabt, und der Mensch sieht beides in **einem** Rahmen
übereinander — zwei Erscheinungsbilder auf einem Bildschirm sind kein
Geschmack, sondern ein Fehler.

## Zwei Wege hinein, eine Quelle

| Wer                            | Wie                                                         |
| ------------------------------ | ----------------------------------------------------------- |
| die Shell                      | `import { Karte } from '@marken'` — Vite-Alias auf `src/`   |
| eine App **ohne** Bau          | `import { Karte } from './marken.js'` — `browser/marken.js` |
| eine App **mit** Bau (Kit, E5) | Spiegel dieses Ordners in die Vorlage, dann wie die Shell   |

`@marken` ist ein **Pfad-Alias** wie `@`, kein npm-Paket: die Bibliothek wird
mit der Shell übersetzt. Kein Eintrag im Wurzel-Lockfile, kein `dist/`, das
jemand vergisst.

Das Stylesheet gehört dazu und wird getrennt geladen — die Shell holt es in
`index.css`, eine App über ein `<link rel="stylesheet" href="marken.css">`.

## Das Bündel für Apps ohne Bau

```bash
npm run marken          # baut packages/marken/browser/marken.js
python3 scripts/test/marken.py --wurzel .   # hält Quelle und Bündel aneinander
```

`browser/marken.js` bringt React und React-DOM mit und ist **eingecheckt** —
wie `packages/shared-schemas/dist/`. Auf dem Gerät gibt es kein
`npm install`; `scripts/test/beispielapp.sh` legt die Datei beim Einspielen
neben die App.

**Kein JSX darin.** JSX braucht einen Übersetzer, und im Browser übersetzt
einer nur mit `eval` — das verbietet die Content-Security-Policy dieses
Geräts, und die Oberflächen-Abnahme fragt jedes Mal danach. Eine App ohne Bau
schreibt deshalb `h(Karte, {...})` statt `<Karte …/>`. Dieselbe Sache, eine
Zeile unbequemer.

Wer einen Baustein ändert, hebt `src/fassung.ts` und baut neu. Der Wächter
fällt sonst.

## Unter 900 px

Die Bibliothek kennt dieselbe Schwelle wie die Shell (`useSchmalesFenster`):
darunter **eine Spalte** und ein Strom (`.ara-strom`), das Menü als Fläche
über der Seite; darüber die drei Spalten aus D1. Ein geschrumpfter Desktop
ist kein Telefon-Aufbau.
