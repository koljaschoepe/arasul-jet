# Verwaltung Läufe (M5), Bilder und Abnahme vom Orin, 04.10.2026

Gemessen mit `scripts/test/verwaltung-laeufe-abnahme.sh` (64 Prüfungen, alle grün)
und `scripts/test/verwaltung-laeufe-bilder.mjs` (Browser, am Orin, als probe-admin).
Probe-Apps `probe-laeufe-1004-a` und `-b`, ohne Modell; Läufe von Hand, per
Zeitplan und per Ereignis; am Ende Zeitpläne pausiert, Läufe abgebrochen, Apps entfernt.

| Bild                                                      | zeigt                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `laeufe-liste.png`                                        | Läufe aller Apps, Fehler oben                           |
| `laeufe-gefiltert-app.png`                                | Filter App, nicht übergeben und Fehler zuerst           |
| `laeufe-gefiltert-ohne-person.png`                        | „Ohne Person": Zeitplan, Ereignis, Hand                 |
| `laeufe-aufgeklappt.png`                                  | zwei Läufe zugleich offen, Schritt bis Ein- und Ausgabe |
| `lauf-seite-ereignis.png`, `-zeitplan.png`, `-fehler.png` | ein Lauf unter seiner Adresse, frisch geladen           |
| `app-seite-laeufe.png`                                    | die Seite der App verweist hierher                      |
| `laeufe-leer.png`, `laeufe-schmal.png`                    | leere Auswahl, 390 px                                   |

Der Admin bricht auch einen Lauf ohne Person ab (Zeitplan-Lauf `warten`): 200, danach 404.
