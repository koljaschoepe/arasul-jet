# Abnahme: Korrekturfelder in der Freigabe (M5)

Gemessen am 04.10.2026 am Orin, Stand `20261004-76cf3a4` (nach PR 874 und 875),
Probe-App `probe-korrektur-1004` (`tests/probe-korrektur`), Konten `probe-admin`,
`probe-j36-a`, `probe-j36-b`. Skript: `scripts/test/korrektur-abnahme.sh` mit
`ARASUL_BILDER=1`.

| Lauf | `korrektur-abnahme.sh` | `arten-abnahme.sh` |
| ---- | ---------------------- | ------------------ |
| 1    | 44 von 44 grün         | 47 von 47 grün     |
| 2    | 44 von 44 grün         | 47 von 47 grün     |
| 3    | 44 von 44 grün         | 47 von 47 grün     |

Beide Abnahmen rechnen mit der festen Antwort der Probe-App
(`/v1/chat/completions`, als externes Modell je Flow eingestellt), nicht mit
dem echten Modell. Vorher schwankte `arten-abnahme.sh` (zweimal 42 von 43 mit
verschiedenen roten Prüfungen).

| Prüfung                                                                                         | Ergebnis |
| ----------------------------------------------------------------------------------------------- | -------- |
| Kontrakt Fassung 10, Regeln nennen `ergebnis.aenderbar` und `original`                          | grün     |
| Datum nicht erkannt: Lauf hält an, Freigabe „Erkennung unsicher: Feld datum" in Stufe Prüfung   | grün     |
| Felder: `datum` zu prüfen und änderbar, oben; `betrag` 12,50 nur zum Lesen; keine Prozentzahl   | grün     |
| Original als Adresse der App, lädt mit der Sitzung der entscheidenden Person                    | grün     |
| Nicht freigegebenes Feld (`betrag`): 400 mit Grund, Freigabe bleibt offen                       | grün     |
| Ablehnung mit Feldern: 400; Einreicher bestätigt: 403                                           | grün     |
| `probe-j36-b` ändert `datum` und bestätigt: Vorschlag, Änderung, wer, wann                      | grün     |
| Der Schritt danach bucht mit 01.10.2026; die Stufe Leitung sieht ihn und was bisher geschah     | grün     |
| Lauf endet `fertig`, sein Ergebnis trägt den geänderten Wert                                    | grün     |
| App liest Vorschlag und Änderung (`GET /freigaben`), Läufe-Ansicht der Verwaltung ebenso        | grün     |
| Arasul und App (Muster von `/marken/5/`, Bibliothek 5.4.0): prüfen oben, Original links zoombar | grün     |
| Im Baustein korrigiert und bestätigt, danach wieder die Liste                                   | grün     |
| `audit_logs`: `freigabe_bestaetigt` nennt das geänderte Feld, nicht seinen Inhalt               | grün     |
| Freigaben zurückgenommen, App entfernt, 404; unter `/arasul/apps` kein `probe-*` dieser Abnahme | grün     |

## Bilder

- `vorher-probe-j36-b-fuer-sie.png`, `vorher-probe-j36-b-einzeln.png`: „Für Sie" in
  Arasul, Einzelansicht mit Original links, `datum` mit „prüfen" oben
- `vorher-probe-j36-b-app-liste.png`, `vorher-probe-j36-b-app-einzeln.png`:
  dieselbe Freigabe in der App mit dem Muster `Freigabe` von `/marken/5/`
- `leitung-einzeln.png`: Stufe Leitung, oben der Satz „Bisher: Prüfung bestätigt
  von probe-j36-b, 1 Feld geändert.", frühere Stufe aufgeklappt
- `lauf-laeufe-ansicht.png`: Läufe-Ansicht der Verwaltung, Tabelle Feld /
  Vorschlag der KI / Geändert (wer, wann)
- `baustein-korrigiert.png`, `baustein-danach-liste.png`: in der App korrigiert,
  nach der Entscheidung wieder die Liste

## Was die erste Messung fand (behoben in PR 875)

1. **Läufe-Ansicht ohne Korrekturen.** `GET /api/apps/:id/laeufe/:runId` ging über
   `runStore.getRunFuerApp`, das keine `freigaben` lud. `getRun` hatte sie, die
   API-Referenz versprach sie. Beide nehmen jetzt dieselbe Abfrage.
2. **Probe-Flows mit leeren Argumenten.** Ein leeres optionales Argument ohne
   `standard` lässt seinen Platzhalter stehen (gewollt). Aus `"{{datum}}"` wurde
   so kein JSON, beide Felder galten als fehlend. `standard: ''` in
   `tests/probe-korrektur` und `tests/probe-arten`.

Die roten Läufe vor dem Fix hinterließen offene Freigaben der schon entfernten
App (sieben, davon eine aus einer früheren Arten-Messung). Sie sind über
`POST /api/flows/laeufe/:id/abbrechen` als `probe-admin` geschlossen
(`verfallen`, Läufe `abgebrochen`); danach ist am Gerät keine Freigabe offen.
Dass das Entfernen einer App ihre offenen Freigaben nicht selbst schließt, ist
ein eigener Befund außerhalb dieser Karte.

## Kontrakt

Fassung 10 (seit PR 874): `rollen[].ergebnis.aenderbar` und `original` am
erkennenden Schritt. Das Kit muss `KIT_CONTRACT_VERSIONS` auf 10 heben.
