# Abnahme: Flow-Arten autonom und Ergebnis bestätigen (M5)

Gemessen am 04.10.2026 am Orin (Stand nach PR 872), Probe-App `probe-arten-1004`
mit drei Flows (`tests/probe-arten`), Konten `probe-admin`, `probe-j36-a`,
`probe-j36-b`. Skript: `scripts/test/arten-abnahme.sh`, **46 von 46 grün**.

| Prüfung                                                                                   | Ergebnis |
| ----------------------------------------------------------------------------------------- | -------- |
| `arten` und gültige Art je Flow in `GET /api/apps/:id/flows`, Vorgabe = erste Art         | grün     |
| Art, die der Kopf nicht nennt: 400 mit Grund; unbekannte Art 400; unbekannter Flow 404    | grün     |
| Mitarbeiter schaltet: 403; abgewiesene Versuche ändern nichts                             | grün     |
| `autonom`, erzeugender Flow: Lauf `fertig`, keine Freigabe                                | grün     |
| Umgestellt auf `ergebnis_bestaetigen`: gilt im nächsten Lauf, Lauf hält am Ende an        | grün     |
| Freigabe „Ergebnis bestätigen: texte" mit Ergebnis; Einreicher 403; andere Person: fertig | grün     |
| Ablehnung beendet den Lauf als `abgebrochen`                                              | grün     |
| Erkennender Flow, `autonom`, Feld fehlt: „Erkennung unsicher: Feld datum"                 | grün     |
| Als unsicher gemeldetes Feld: „Erkennung unsicher: Feld betrag"                           | grün     |
| Alles erkannt, `autonom`: fertig ohne Freigabe                                            | grün     |
| Erkennend + `ergebnis_bestaetigen`, alles erkannt: nur die Freigabe am Ende               | grün     |
| `null` nimmt die Wahl zurück                                                              | grün     |
| `audit_logs`: `flow_art_gesetzt` (6 Zeilen) mit App, Flow, Art                            | grün     |
| Freigaben zurückgenommen, App entfernt, 404; unter `/arasul/apps` kein `probe-arten-*`    | grün     |

Bilder: `verwaltung-flows-vorher/-auswahl/-nachher.png` (Auswahl der Art je Flow,
`nur-autonom` ohne Wahl), `bestaetigen-…-startseite.png`, `erkennung-…-startseite.png`.

## Regel: erkennend oder erzeugend

Erkennend ist ein Flow mit mindestens einem `subagent`-Schritt mit
`faehigkeiten.bild: true`; alles andere erzeugt. Siehe `docs/features/FLOWS.md`,
Abschnitt Arten, und `flow_frontmatter.regeln` im Kontrakt.

## Nicht am Orin gemessen

Das Weiterlaufen einer wartenden Ergebnis-Freigabe nach einem Neustart des
Backends ist nur per Unit-Test belegt (`runFlowArt.test.js`); ein Neustart am
Arbeitsgerät gehörte nicht zum Auftrag. Die supertest-Suiten des Backends liefen
lokal nicht (Testserver-Ports), CI war grün.

## Kontrakt

Fassung bleibt 9: kein Feld kam dazu. Der Fingerabdruck ist wegen präziserer
Regeltexte nachgezogen. Für das Kit: Erkennungs-Rollen dürfen im JSON `unsicher`
(Liste von Feldnamen) nennen.
