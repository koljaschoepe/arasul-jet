# Rahmen aus Glas am Orin: vorher und nachher

Karte glas-rahmen-und-leiste (J49, M7), 20.11.2026. Konto `probe-admin`,
aufgenommen mit `scripts/test/rahmen-glas-bilder.mjs`, App `abschluss` in
Live und Test. Vorher: Stand nach #953 (Bibliothek 5.7.1). Nachher: nach
#954 bis #958 (Bibliothek 5.8.3).

Kein Kundenname auf einem Bild: das Skript ersetzt ihn vor jedem Foto im
Browser durch „Probe“; in den Bildern vorher ist das Wort nachträglich
übermalt (Texterkennung mit tesseract, danach kein Treffer mehr).

## Messung nachher (252 grün, 0 rot)

Je Ansicht, Thema und Breite: keine Statuszeile; die Leiste ist Glas
(`blur(16px) saturate(1.4)`, Schatten), schwebt 8 px vom Rand mit Radius
16 px; die Ansicht ist deckend mit Radius 14 px; höchstens drei Glasflächen;
jede App genau einmal in der Leiste; am Rechner das Konto unten und zwei
Trenner, am Handy kein abgeschnittener Name und „Mehr“ ganz in der Leiste.
Über einer App die Kapsel aus Glas, 32 px hoch, mit dem Rückmelde-Icon und
dem Umschalter Live und Test nur, wo es beide Fassungen gibt; die Testfassung
mit 2 px blauem Rand und dem Wort Test ganz in der Fläche (6,37:1). „Abmelden“
unter dem Konto (1440) und unter „Mehr“ (390), beide Menüs aus Glas.

Dazu am Orin: Handy-Reihe 48 grün, Oberflächen-Reihe 76 von 76, Theme-Reihe
47 von 47 (mit dem Entwickler-Cockpit; die App `abschluss` bringt einen
eigenen Seitenhintergrund mit und wird dort nur zur Kenntnis gemessen).

## Unbeteiligte Durchsicht

Drei Runden, je ein frischer Prüfer nur mit den Bildern und dem Abschnitt
„Rahmen“ des Entwurfs. Befunde und was daraus wurde stehen in den PRs #956,
#957 und #958. Letztes Urteil: „Gegenüber dem alten Stand ein klarer
Schritt“; offen blieb, dass Glas über einem ruhigen Verlauf wenig zu
verwischen hat (siehe dritte Karte: Inhalt unter der Handyleiste,
Seitenkopf mit `--ara-kapsel-platz`).

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
| app-test      | hell   | 1440   | ![vorher](vorher/app-test-hell-1440.png)        | ![nachher](nachher/app-test-hell-1440.png)        |
| app-test      | hell   | 390    | ![vorher](vorher/app-test-hell-390.png)         | ![nachher](nachher/app-test-hell-390.png)         |
| app-test      | dunkel | 1440   | ![vorher](vorher/app-test-dunkel-1440.png)      | ![nachher](nachher/app-test-dunkel-1440.png)      |
| app-test      | dunkel | 390    | ![vorher](vorher/app-test-dunkel-390.png)       | ![nachher](nachher/app-test-dunkel-390.png)       |
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

Dazu `nachher/menue-1440.png` (Konto mit „Abmelden“) und
`nachher/menue-390.png` („Mehr“ mit „Abmelden“).
