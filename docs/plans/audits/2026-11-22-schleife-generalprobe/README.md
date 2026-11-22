# Generalprobe der Schleife am Orin, 22.11.2026

> Karte `schleife-generalprobe` (J47, M7). Zählt nicht als einer der zwei
> Abnahmeläufe der Karte `schleife-abnahme-am-orin`. Der Ablauf für den
> Betreiber: [`docs/ops/SCHLEIFE_ABNAHME.md`](../../../ops/SCHLEIFE_ABNAHME.md).

Konto `probe-admin`, App „Probe Cockpit“ (`probe-cockpit-1120`), Kit 0.87.0 aus
einem frischen Klon mit Schlüsselbund, Chromium 1440 px, Thema des Kontos dunkel.

| Zeit (Ortszeit) | Schritt                                                      | Ergebnis                        |
| --------------- | ------------------------------------------------------------ | ------------------------------- |
| 23:41           | Vorbereitung: Vorlage des Kits als 3.1.0, Test, live         | eingespielt, live               |
| 23:43           | `schleife-abnahme.mjs vorher`                                | 12 von 12 grün                  |
| 23:45           | Schalter „Bildschirmfotos an den Agenten“ an                 | an                              |
| 23:45           | Meldung 7 über das Icon, Rahmen um den leeren Zustand        | angekommen, 403 ms bis Formular |
| 23:46           | Werkstatt › Eingang, Meldung geöffnet                        | mit Bild und Rahmen; Fund Blatt |
| 23:47           | `feedback.mjs --app probe-cockpit-1120`, `--image 7`         | 1 Anliegen, Bild mit Rahmen     |
| 23:47           | `--set 7 --to angenommen`                                    | neu → angenommen                |
| 23:48           | Plan, `--build` (6 Tests grün), `--deploy` 3.1.1 in den Test | eingespielt in 15 s             |
| 23:48           | `--set 7 --to umgesetzt`                                     | angenommen → umgesetzt          |
| 23:51           | Werkstatt › Test nach Live › Live schalten                   | „Es läuft jetzt Fassung 3.1.1.“ |
| 23:52           | `schleife-abnahme.mjs nachher 7` mit Erwartung und Schlüssel | 14 von 14 grün                  |

Die Bilder zeigen den Stand vor den Behebungen dieser Karte (Blatt der Meldung
mit Lücke, alte Bestätigung). Die Kachel einer App mit Kundennamen ist mit
`ARASUL_AUSBLENDEN` ausgeblendet; in der Leiste stehen nur Symbole.

| Bild                         | Was                                 |
| ---------------------------- | ----------------------------------- |
| `00-bilder-an-agenten.png`   | Verwaltung › Apps › Rückmeldungen   |
| `01-app-mit-icon.png`        | Die App im Rahmen, Icon oben rechts |
| `02-formular-mit-stelle.png` | Formular mit Text und Rahmen        |
| `03-bestaetigung.png`        | Bestätigung nach dem Absenden       |
| `04-eingang.png`             | Werkstatt › Eingang                 |
| `04-meldung.png`             | Die Meldung im Blatt                |
| `05-testfassung.png`         | Testfassung mit der Änderung        |
| `06-test-nach-live.png`      | Werkstatt › Test nach Live          |
| `06-rueckfrage.png`          | Rückfrage vor dem Schalten          |
| `06-live-geschaltet.png`     | Nach dem Schalten                   |
| `09-live-nachher.png`        | Live nachher                        |
