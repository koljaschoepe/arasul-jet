# Grundton der Bibliothek am Orin: vorher und nachher

Karte glas-grundton-bibliothek (J48, M7), 20.11.2026. Konto `probe-admin`,
aufgenommen mit `scripts/test/glas-grundton-bilder.mjs`. Vorher: Bibliothek
5.6.1 (Stand vor #951). Nachher: Bibliothek 5.7.1 (#951, #952).

Die App ist die Probe `probe-glas-1120`, eingespielt **vor** der Änderung und
danach nicht neu eingespielt: sie lädt die Bibliothek zur Laufzeit von
`/marken/5/` und zeigt das neue Aussehen ohne Neubau.

## Messung nachher (72 grün, 0 rot)

- Text hält 4,5:1 an jeder Stichprobe, Rahmen und App, hell und dunkel, 1440
  und 390 px. Schlechteste Stelle: das Abzeichen „Neu“ im Cockpit, 4,82:1
  (vor #952 waren es 4,19:1, daher das tiefere Blau).
- Inter aus der Bibliothek geladen, im Rahmen und in jeder App.
- Knopf mit Text 32 px, kein Knopf mit Verlauf, bei 390 px jede
  Trefferfläche mindestens 44 px.
- Offenes Menü ist Glas (`blur(16px) saturate(1.4)`), der Inhalt ohne Glas.
- Statisch (`scripts/test/marken.py`, Punkt 9): Text auf Glas über Seite,
  Karte, Panel und Hauptknopf mindestens 4,5:1 in beiden Themen.

## Bilder

| Ansicht       | Thema  | Breite | vorher                                          | nachher                                           |
| ------------- | ------ | ------ | ----------------------------------------------- | ------------------------------------------------- |
| start         | hell   | 1440   | ![vorher](vorher/start-hell-1440.png)           | ![nachher](nachher/start-hell-1440.png)           |
| start         | hell   | 390    | ![vorher](vorher/start-hell-390.png)            | ![nachher](nachher/start-hell-390.png)            |
| start         | dunkel | 1440   | ![vorher](vorher/start-dunkel-1440.png)         | ![nachher](nachher/start-dunkel-1440.png)         |
| start         | dunkel | 390    | ![vorher](vorher/start-dunkel-390.png)          | ![nachher](nachher/start-dunkel-390.png)          |
| app           | hell   | 1440   | ![vorher](vorher/app-hell-1440.png)             | ![nachher](nachher/app-hell-1440.png)             |
| app           | hell   | 390    | ![vorher](vorher/app-hell-390.png)              | ![nachher](nachher/app-hell-390.png)              |
| app           | dunkel | 1440   | ![vorher](vorher/app-dunkel-1440.png)           | ![nachher](nachher/app-dunkel-1440.png)           |
| app           | dunkel | 390    | ![vorher](vorher/app-dunkel-390.png)            | ![nachher](nachher/app-dunkel-390.png)            |
| cockpit       | hell   | 1440   | ![vorher](vorher/cockpit-hell-1440.png)         | ![nachher](nachher/cockpit-hell-1440.png)         |
| cockpit       | hell   | 390    | ![vorher](vorher/cockpit-hell-390.png)          | ![nachher](nachher/cockpit-hell-390.png)          |
| cockpit       | dunkel | 1440   | ![vorher](vorher/cockpit-dunkel-1440.png)       | ![nachher](nachher/cockpit-dunkel-1440.png)       |
| cockpit       | dunkel | 390    | ![vorher](vorher/cockpit-dunkel-390.png)        | ![nachher](nachher/cockpit-dunkel-390.png)        |
| verwaltung    | hell   | 1440   | ![vorher](vorher/verwaltung-hell-1440.png)      | ![nachher](nachher/verwaltung-hell-1440.png)      |
| verwaltung    | hell   | 390    | ![vorher](vorher/verwaltung-hell-390.png)       | ![nachher](nachher/verwaltung-hell-390.png)       |
| verwaltung    | dunkel | 1440   | ![vorher](vorher/verwaltung-dunkel-1440.png)    | ![nachher](nachher/verwaltung-dunkel-1440.png)    |
| verwaltung    | dunkel | 390    | ![vorher](vorher/verwaltung-dunkel-390.png)     | ![nachher](nachher/verwaltung-dunkel-390.png)     |
| einstellungen | hell   | 1440   | ![vorher](vorher/einstellungen-hell-1440.png)   | ![nachher](nachher/einstellungen-hell-1440.png)   |
| einstellungen | hell   | 390    | ![vorher](vorher/einstellungen-hell-390.png)    | ![nachher](nachher/einstellungen-hell-390.png)    |
| einstellungen | dunkel | 1440   | ![vorher](vorher/einstellungen-dunkel-1440.png) | ![nachher](nachher/einstellungen-dunkel-1440.png) |
| einstellungen | dunkel | 390    | ![vorher](vorher/einstellungen-dunkel-390.png)  | ![nachher](nachher/einstellungen-dunkel-390.png)  |

Dazu `nachher/menue-glas-hell-1440.png`: ein offenes Menü aus Glas über dem Inhalt.
