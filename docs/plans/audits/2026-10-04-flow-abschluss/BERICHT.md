# Abnahme: Abschluss über die App (M5, Kontrakt 11), 04.10.2026

Auftrag `flow-abschluss-ueber-app`, PR #877. Gemessen am Orin (Deploy von #877,
Migration 198 angewendet), mit `scripts/test/abschluss-abnahme.sh` und der
Probe-App `tests/probe-abschluss` (Stempel `probe-abschluss-1004`; die echte App
`abschluss` blieb unberührt). Die Flows rechnen mit der festen Antwort der
Probe-App, nicht mit dem Modell. Konten: `probe-admin`, `probe-j36-a`,
`probe-j36-b`, keine neuen.

## Ergebnis

Je Lauf mit Neustart des Backends mittendrin (`docker compose restart
dashboard-backend`):

| Lauf | Ergebnis                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 60 von 61 grün: die Prüfung „Liste filtert nach nicht_uebergeben" war rot, **Fehler im Skript** (die Lauf-Nummer steht in der Antwort als Text, `"id":"133"`); behoben |
| 2    | 59 von 59 grün (ohne Bilder)                                                                                                                                           |
| 3    | 59 von 59 grün (ohne Bilder)                                                                                                                                           |
| 4    | 61 von 61 grün (mit Bildern)                                                                                                                                           |

Drei Läufe in Folge grün (2, 3, 4). Ein erster Versuch scheiterte, bevor etwas
gemessen wurde, an einem Kopf mit Doppelpunkt in `ohne.md` (YAML); behoben.

## Was gemessen wurde

- **Kontrakt 11:** Fassung 11, die Regeln nennen `abschluss` und
  `ARASUL_ABSCHLUSS_TOKEN`; der Kopf von `buch` nennt `/abschluss/buch`, `ohne`
  nennt keine Route. Die Route der App antwortet ohne das Geheimnis des Geräts
  mit 401, mit ihm nimmt sie an.
- **Erst die Bestätigung macht fertig:** Antwortet die App erst nach 8 Sekunden,
  steht der Lauf in der Zwischenzeit auf `laeuft`, sein Ergebnis steht schon in
  der Datenbank, `uebergeben_am` fehlt. Danach `fertig`, ein Versuch, die App hat
  es genau einmal, mit `Idempotency-Key: arasul-lauf-<nr>` und derselben Nummer im Body.
- **Ohne Route wie bisher:** `ohne` wird `fertig`, die App bekommt nichts.
- **Korrekturfelder:** Bei `beleg` ändert eine Person das Datum in der Freigabe;
  die App bekommt `felder.datum` mit dem geänderten Wert und die Korrektur
  (Feld, Wert, `von` = probe-j36-b), das Ergebnis trägt den Wert. Solange die
  Freigabe offen ist, hat die App nichts bekommen.
- **Art:** Bei „Ergebnis bestätigen" kommt der Aufruf erst nach der Bestätigung.
- **Ausfall:** 503 der App: `nicht_uebergeben`, Grund mit „503" und das Ergebnis
  stehen; keine Antwort der App: nach 30 Sekunden `nicht_uebergeben` mit Grund.
  Die Liste filtert nach `nicht_uebergeben`; die App sieht den Zustand über die
  Schnittstelle.
- **Erneut:** Solange die App stört, bleibt es `nicht_uebergeben` (zweiter
  Versuch); antwortet sie, ist der Lauf `fertig`, mit gleicher Schrittzahl, die
  App hat das Ergebnis bei drei Aufrufen genau einmal angelegt. Erneut bei einem
  fertigen Lauf: 409.
- **Rechte:** `probe-j36-a` (Mitarbeiter) bekommt 403, ein Lauf einer anderen App
  404, die abgewiesenen Versuche ändern nichts.
- **Neustart:** `nicht_uebergeben` überlebt den Neustart des Backends mit
  Ergebnis und Versuchszähler; danach gelingt „erneut" ohne neue Schritte.
- **Abbrechen:** ein nicht übergebener Lauf lässt sich abbrechen, danach ist
  „erneut" 409.
- **Aufgeräumt:** Freigaben zurückgenommen, offene Läufe abgebrochen, App samt
  Ordnern entfernt (404 danach), im Backend-Container steht unter `/arasul/apps`
  kein `probe-abschluss-*`, kein Container und kein Image der Probe-App.

## Bilder

- `nicht-uebergeben-laeufe-ansicht.png`: Läufe-Ansicht der App, Lauf auf „nicht übergeben" mit „erneut".
- `nicht-uebergeben-lauf.png`: der Lauf in der Verwaltung mit Übergabe (Route, Versuche), Grund (503) und „erneut".
- `uebergeben-laeufe-ansicht.png`, `uebergeben-lauf.png`: derselbe Lauf nach „erneut", fertig, ohne Knopf, Übergabe mit Zeitpunkt.

## Offen für das Kit

Kontraktfassung 11: `KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs`
auf 11 heben und der Vorlage die Route mit Prüfung des Geheimnisses und
Idempotenz beibringen. Eine bereits laufende App bekommt
`ARASUL_ABSCHLUSS_TOKEN` erst mit dem nächsten Einspielen.
