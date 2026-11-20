# Abnahme Rückmeldung im Rahmen (J42, M7), 20.11.2026

Am Orin nach dem Deploy von #942 (`5f2a88f2`, Migration 214 angewandt),
`scripts/test/rueckmeldung-im-rahmen-abnahme.mjs` als `probe-admin` und
`probe-j36-a`, Apps Belege, Abschluss, Probe-App (`probe-faktum-belege`),
Chromium und WebKit, 1440 und 390 px. Ergebnis: **49 von 49 grün**.

| Prüfung                                                                              | Ergebnis                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Mitarbeiter ohne Kennzeichen, `GET /api/rueckmeldungen`                              | 403                                                               |
| Administrator ohne Kennzeichen, dieselbe Abfrage                                     | 403                                                               |
| Icon oben rechts über Belege, Abschluss, Probe-App, je Browser und Breite (12 Fälle) | grün, kein seitliches Rollen                                      |
| Foto bis zum Formular                                                                | Chromium 351 ms (1440) und 174 ms (390), WebKit 431 ms und 226 ms |
| Stelle markiert, Absenden, nur Bestätigung (4 Fälle)                                 | grün                                                              |
| Schnittstelle: App, Stand, Seite `/apps/belege/`, Person, Markierung, Bild           | grün, Bild PNG mit 194.501 Bytes                                  |
| Entfernen                                                                            | Meldung weg                                                       |
| Verwaltung › Rückmeldungen mit geladenem Bild, 1440 und 390 px                       | grün                                                              |

Bilder:

- `chromium-1440-belege.png`, `chromium-390-belege.png`, `chromium-390-abschluss.png`,
  `chromium-1440-probe-faktum-belege.png`: das Icon über den Apps.
- `chromium-1440-formular.png`, `chromium-390-formular.png`, `webkit-390-formular.png`:
  Formular mit Foto und markierter Stelle.
- `chromium-1440-bestaetigung.png`: was der Melder danach sieht.
- `gespeichertes-bild.png`: das Bild, wie es am Gerät liegt, mit der Markierung.
- `liste-1440.png`, `liste-390.png`: Verwaltung › Rückmeldungen.

Die vier Meldungen der Abnahme (Text beginnt mit „Abnahme J42“) stehen weiter
in der Liste am Orin; `probe-admin` trägt seither das Kennzeichen Entwickler
und hat Belege, Abschluss und die Probe-App im Teststand freigegeben.
