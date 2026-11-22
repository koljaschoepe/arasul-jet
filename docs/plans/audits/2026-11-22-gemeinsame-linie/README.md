# Gemeinsame Linie im Produkt (J53, M7), Bilder vom Orin

Stand 22.11.2026, Bibliothek 5.12.2, aufgenommen am Orin mit dem Konto
`probe-admin` über `scripts/test/gemeinsame-linie-bilder.mjs`. Eine Probe-App
mit Kundennamen ist ausgeblendet, die Personenliste mit Zugang zur App ist
unscharf, und die Adresse des Geräts steht als `arasul.firma.local` im Bild.

| Ordner           | Was                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `vorher/`        | vor dem Umbau (Bibliothek 5.11.1): Start, App, Werkstatt, Verwaltung, App im Einzelnen, Einstellungen |
| `nachher/`       | dieselben Ansichten und dazu das Blatt (`*-blatt-*`: ein Flow, „Rechner verbinden“)                   |
| `nebeneinander/` | je Ansicht links vorher, rechts nachher (`scripts/test/nebeneinander.py`)                             |

Je hell und dunkel, bei 1440 und 390 px.

## Messung am Gerät (nachher)

80 grün, 0 rot: in jeder Ansicht rollt das Dokument nicht, nur was in sich
rollt; das Blatt steht am Rechner rechts daneben (8 px Abstand, 480 oder
640 px breit), am Handy unten mit Griff, Radius 20 px, Text darin 15:1 bis
16:1, Escape schließt es.

## Unbeteiligte Durchsicht (nur Bilder)

Ein zweiter Prüfer sah die Nebeneinander-Bilder, die Blätter und die Demo,
ohne Code. Erster Blick: hell knapp sichtbar, dunkel kaum. Zwölf Befunde:

| Nr. | Befund                                                           | Schwere | Ausgang                                                                  |
| --- | ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| 1   | dunkler Verlauf kaum zu sehen                                    | hoch    | behoben, 5.12.2: weiter gespreizt (Kontrast auf der Leiste bleibt 4,5:1) |
| 2   | Demo am Handy: Meldung verdeckt Kopf, Griff und Kreuz des Blatts | hoch    | behoben: Meldung steht dann über den Aktionen                            |
| 3   | Blatt am Rechner liegt über dem Inhalt                           | mittel  | so gewollt: eine schwebende Fläche daneben, leichter Schleier            |
| 4   | Freigeben/Ablehnen nicht in Daumenreichweite                     | mittel  | behoben: in der Demo unten im Fuß des Blatts                             |
| 5   | Auftrag an das Modell mit doppelten Umbrüchen                    | mittel  | behoben: Zeilen wie in der Datei, rollt in sich                          |
| 6   | Befehl bricht mitten in der Adresse um                           | mittel  | behoben: eine Zeile, rollt in sich                                       |
| 7   | Blatt „Rechner verbinden“ zu drei Vierteln leer                  | niedrig | offen gelassen, das Blatt hat feste Höhe                                 |
| 8   | App im Rahmen folgt dem dunklen Ton nicht                        | mittel  | gehört der Probe-App, nicht der Shell                                    |
| 9   | Mono für Zahlen in den Einzelheiten                              | niedrig | Vorgabe (Mono für Zahlen und Kennungen)                                  |
| 10  | Tabellen enden vor den Kopfknöpfen                               | niedrig | offen, nicht Teil dieser Karte                                           |
| 11  | Filter der Werkstatt am Handy schmaler                           | niedrig | offen, nicht Teil dieser Karte                                           |
| 12  | Ersatzschreibung einer Probe-App, Adresse des Geräts auf Bildern | niedrig | Adresse ersetzt; die Beschreibung ist Inhalt der Probe-App               |

Hell war schon vor der Durchsicht nachgebessert (5.12.1): der Verlauf begann
in Creme, dem Ton der Fläche, und war nur in einer Ecke zu sehen.
