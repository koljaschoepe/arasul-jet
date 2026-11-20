# Seitenkopf und kompakte Bausteine am Orin: vorher und nachher

Karte bausteine-seitenkopf-und-kompakt (J50, M7), 20./21.11.2026. Konto
`probe-admin`, aufgenommen mit `scripts/test/seitenkopf-bilder.mjs`. Vorher:
Bibliothek 5.8.3 (Stand nach #959). Nachher: Bibliothek 5.9.3 (#960 bis #963).
Kein Kundenname auf einem Bild: das Skript ersetzt ihn vor jedem Foto im
Browser durch „Probe“ (Texterkennung mit tesseract, kein Treffer).

## Messung nachher (118 grün, 0 rot)

Je Seite, Thema und Breite: genau ein Seitenkopf mit genau einem `h1`, ohne
Trennlinie, mit einem Satz; kein Knopf der Seitenleiste außerhalb des Kopfs
(die Zeile mit dem einzelnen Icon ist weg); Werkzeuge 28 px; über einer App
überdeckt die Kapsel kein Werkzeug; Tabellen mit Zeile 40 px und Kopfzeile
32 px, deckend; die Startseite zeigt jede App einmal, ohne „(Test)“.

Dazu am Orin: Handy-Reihe (`handy-abnahme.mjs`) 48 grün. Theme- und
Oberflächen-Reihe sind nicht gelaufen: sie setzen und löschen Freigaben, und
die bestehenden am Gerät bleiben unangetastet.

## Unbeteiligte Durchsicht

Drei Runden, je ein frischer Prüfer nur mit den Bildern und dem Abschnitt
„Produkt“ des Entwurfs. Befunde und was daraus wurde stehen in #961, #962
und #963.

1. „Sauberer als vorher, aber noch nicht so hochwertig wie der Rahmen“:
   zwei linke Kanten im Kopf, Ränder und Breiten je Seite anders, Karten am
   Handy aufgebläht, Kennzahlen leer. Umgesetzt in #961.
2. „Ordentlich, aber nicht so hochwertig wie der Rahmen“: eigener Verlauf
   hinter Apps, Startseite mittig, Handykarten ohne Beschriftung. Umgesetzt
   in #962.
3. „Fast so hochwertig wie der Rahmen“. Behoben in #963, weil von dieser
   Karte eingeschleppt: breiter Bindestrich in Tabellen, abgeschnittene
   Beschreibung in Handykarten, „Einstellung/en“ in der Handyleiste.

Offen aus der dritten Runde, nicht Teil dieser Karte:

- Startseite höchstens 64rem breit wie alle Seiten; bei 1440 px bleibt
  rechts Fläche frei (eine Regel für alle Seiten war Befund der Runden 1
  und 2).
- Mono für Fassung und Datum in Tabellen (Entwurf) gegen Inter mit Ziffern
  gleicher Breite (Befund der ersten Runde); die Seiten nutzen jetzt Inter.
- Kennzahlen im Cockpit ohne Verlauf: das Cockpit hat keine Zeitreihe; die
  Kachel kann ihn (`verlauf`, Schauseite).
- Einstellungen › Erscheinungsbild wirkt karg (Radios und Schalter ohne
  Gruppe), der ausgeschaltete Schalter hat wenig Kontrast (Primitiv `Switch`).
- Am Handy bricht der Satz neben der Werkzeugleiste in schmale Zeilen.
- Beschreibungen der Probe-Apps mit Ersatzschreibung kommen aus deren
  `app.json` am Gerät.

## Bilder

| Ansicht         | Thema  | Breite | vorher                                            | nachher                                             |
| --------------- | ------ | ------ | ------------------------------------------------- | --------------------------------------------------- |
| start           | hell   | 1440   | ![vorher](vorher/start-hell-1440.png)             | ![nachher](nachher/start-hell-1440.png)             |
| start           | hell   | 390    | ![vorher](vorher/start-hell-390.png)              | ![nachher](nachher/start-hell-390.png)              |
| start           | dunkel | 1440   | ![vorher](vorher/start-dunkel-1440.png)           | ![nachher](nachher/start-dunkel-1440.png)           |
| start           | dunkel | 390    | ![vorher](vorher/start-dunkel-390.png)            | ![nachher](nachher/start-dunkel-390.png)            |
| cockpit-eingang | hell   | 1440   | ![vorher](vorher/cockpit-eingang-hell-1440.png)   | ![nachher](nachher/cockpit-eingang-hell-1440.png)   |
| cockpit-eingang | hell   | 390    | ![vorher](vorher/cockpit-eingang-hell-390.png)    | ![nachher](nachher/cockpit-eingang-hell-390.png)    |
| cockpit-eingang | dunkel | 1440   | ![vorher](vorher/cockpit-eingang-dunkel-1440.png) | ![nachher](nachher/cockpit-eingang-dunkel-1440.png) |
| cockpit-eingang | dunkel | 390    | ![vorher](vorher/cockpit-eingang-dunkel-390.png)  | ![nachher](nachher/cockpit-eingang-dunkel-390.png)  |
| cockpit-apps    | hell   | 1440   | ![vorher](vorher/cockpit-apps-hell-1440.png)      | ![nachher](nachher/cockpit-apps-hell-1440.png)      |
| cockpit-apps    | hell   | 390    | ![vorher](vorher/cockpit-apps-hell-390.png)       | ![nachher](nachher/cockpit-apps-hell-390.png)       |
| cockpit-apps    | dunkel | 1440   | ![vorher](vorher/cockpit-apps-dunkel-1440.png)    | ![nachher](nachher/cockpit-apps-dunkel-1440.png)    |
| cockpit-apps    | dunkel | 390    | ![vorher](vorher/cockpit-apps-dunkel-390.png)     | ![nachher](nachher/cockpit-apps-dunkel-390.png)     |
| verwaltung      | hell   | 1440   | ![vorher](vorher/verwaltung-hell-1440.png)        | ![nachher](nachher/verwaltung-hell-1440.png)        |
| verwaltung      | hell   | 390    | ![vorher](vorher/verwaltung-hell-390.png)         | ![nachher](nachher/verwaltung-hell-390.png)         |
| verwaltung      | dunkel | 1440   | ![vorher](vorher/verwaltung-dunkel-1440.png)      | ![nachher](nachher/verwaltung-dunkel-1440.png)      |
| verwaltung      | dunkel | 390    | ![vorher](vorher/verwaltung-dunkel-390.png)       | ![nachher](nachher/verwaltung-dunkel-390.png)       |
| einstellungen   | hell   | 1440   | ![vorher](vorher/einstellungen-hell-1440.png)     | ![nachher](nachher/einstellungen-hell-1440.png)     |
| einstellungen   | hell   | 390    | ![vorher](vorher/einstellungen-hell-390.png)      | ![nachher](nachher/einstellungen-hell-390.png)      |
| einstellungen   | dunkel | 1440   | ![vorher](vorher/einstellungen-dunkel-1440.png)   | ![nachher](nachher/einstellungen-dunkel-1440.png)   |
| einstellungen   | dunkel | 390    | ![vorher](vorher/einstellungen-dunkel-390.png)    | ![nachher](nachher/einstellungen-dunkel-390.png)    |
