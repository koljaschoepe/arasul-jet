# Abnahme: Freigaben in Stufen mit Standardperson (M5, 04.10.2026)

Gemessen am Orin (`https://100.121.244.80`) nach dem Deploy von PR #870 (Merge
`a3d203b5`, Migration 195 angewendet), mit
`scripts/test/stufen-standardperson-abnahme.sh` und `ARASUL_BILDER=1`.

**53 von 53 grün.** Probe-App `probe-stufen-1004` mit dem Flow `zwei-stufen`
(Stufe Prüfung, dann Leitung). Konten: nur vorhandene Probekonten
`probe-admin`, `probe-j36-a` (reicht ein), `probe-j36-b`. Passwörter zur
Laufzeit aus Bitwarden.

| Abnahme                                                                      | Ergebnis                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Admin setzt je App und Stufe eine Standardperson (Seite der App, Verwaltung) | grün; ohne Zugang 400, unbekannte Stufe 404, Mitarbeiter 403                                                                |
| Zwei Stufen legen nacheinander je eine Freigabe an                           | grün (Lauf 44: Anfrage 26 Prüfung, Anfrage 27 Leitung, Lauf endet `fertig`)                                                 |
| Jede liegt zuerst bei der Standardperson ihrer Stufe                         | grün (Prüfung bei probe-j36-b, Leitung bei probe-admin)                                                                     |
| Eine andere Person mit Zugang übernimmt / gibt weiter                        | grün; Weitergeben an den Einreicher 400                                                                                     |
| Einreicher bekommt beim Entscheiden 403 (Backend)                            | grün, in beiden Stufen, auch beim Übernehmen und Ablehnen                                                                   |
| Entscheiden, solange sie bei einem anderen liegt                             | 409 mit Namen                                                                                                               |
| Ohne Standardperson: bei allen mit Zugang, Hinweis für den Admin             | grün (Lauf 45, Leitung: `liegt_bei` null, Admin und probe-j36-b sehen sie, Hinweis in Verwaltung und auf der Karte)         |
| „Für Sie" zeigt jeder Person nur, was bei ihr liegt; Zahl am Haus ebenso     | grün (Haus = Länge der Liste, bei probe-j36-b 1, beim Admin 0)                                                              |
| Aufräumen                                                                    | Freigaben zurückgenommen, App entfernt (404), kein Ordner `probe-stufen-*` unter `/arasul/apps`, kein Image, kein Container |

## Bilder

- `pruefung-probe-j36-b-startseite.png`: „Für Sie" mit der Freigabe der Stufe Prüfung, „Liegt bei Ihnen", „Weitergeben an …", Haus mit 1.
- `pruefung-probe-admin-startseite.png`: „Keine Freigabe liegt bei Ihnen", aufgeklappt „1 Freigabe liegt bei anderen" mit „Übernehmen".
- `pruefung-probe-j36-a-startseite.png`: der Einreicher liest, dass sein Vorgang bei probe-j36-b liegt.
- `verwaltung-app-seite.png`: Abschnitt Freigabestufen, Prüfung bei probe-j36-b, Leitung „alle mit Zugang" mit Hinweis.
- `alle-probe-admin-startseite.png`: Leitung ohne Standardperson, „Liegt bei allen mit Zugang" und Hinweis auf die Verwaltung.
- `alle-probe-j36-b-startseite.png`: dieselbe Freigabe beim Mitarbeiter, ohne Verwaltungshinweis.
