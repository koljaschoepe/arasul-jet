# Nachprüfung zum Rundgang 023

> Zweiter Durchgang am 19.08.2026, nachmittags. Der Rundgang selbst
> (`rundgang.html`) bleibt unverändert — er wartet auf die Rückmeldung.
> Hier steht, was der zweite Durchgang zusätzlich gefunden hat, was davon
> behoben ist und was eine Entscheidung braucht.
>
> Alles unten ist am Gerät gemessen, nicht aus der Doku abgeschrieben.
> Gerät: NVIDIA Jetson AGX Orin, `arasul.tail746d9b.ts.net`, Prüf-Benutzer
> `pruefer`.

## Was in diesem Durchgang behoben wurde

| PR   | Befund                                                                                        | Beleg vorher                                                                                                              | Beleg nachher                                                                     |
| ---- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| #397 | Der Ordner-Abgleich lud 19 Doubletten alle 20 Sekunden nach MinIO hoch und löschte sie wieder | 57 Uploads + 57 Löschungen pro Minute, 122 GB von MinIO in 6 Tagen geschrieben, 102 MB Schreiblast pro Minute im Leerlauf | 0 Uploads pro Minute, 10 MB pro Minute. Rund 132 GB Schreiblast pro Tag entfallen |
| #398 | Eine deaktivierte App-Erweiterung wurde weiter ausgeliefert                                   | Schalter aus, Symbol weg, offener Tab bedient die App weiter, `GET .../app/` antwortet 200                                | 403, im Tab steht der Weg zurück                                                  |
| #399 | Die Selbstheilung meldete jeden Deploy als gescheiterte Wiederherstellung                     | zweimal in 24 h `service_recovery_failed` CRITICAL, jeweils in der Sekunde des Deploys                                    | als INFO `service_replacement_detected` geführt, echte Fehler bleiben CRITICAL    |
| #400 | `run-tests.sh --all` meldete „ALL PASSED", ohne es zu wissen                                  | Exit 0, obwohl `tests/unit` sich nicht einsammeln ließ                                                                    | ungeprüfte Suiten werden gezählt und benannt                                      |
| #400 | `.env.bak-vor-import-2026-08-18` griff in keiner Ignorier-Regel                               | `git check-ignore`: nicht ignoriert, 16 Zeilen mit Geheimnissen                                                           | `.env.bak*` greift                                                                |
| #401 | Eine gelöschte Datei kam über den offenen Tab zurück                                          | 88 Byte gelöscht, ein Tastendruck später 52 neue Byte am selben Pfad                                                      | Tab schließt beim Löschen, Umbenennen zieht Tabs nach                             |
| #402 | Die DSGVO-Auskunft nach Art. 15 war kaputt                                                    | `500`, `column "model" does not exist`; sechs von elf Kategorien falsch, vier davon still                                 | `200`, 310 KB, alle Kategorien, Fehler werden benannt statt verschluckt           |
| #403 | Der Export riss den Verbindungspool leer                                                      | zwei Kategorien `unvollstaendig`, Grund „Database pool saturated"                                                         | drei Läufe hintereinander: 45 bis 75 ms, 0 unvollständig                          |

## Was offen ist und eine Entscheidung braucht

### E7 (neu, groß): Die Löschung nach Art. 17 löscht keine Dokumente

`DELETE /api/gdpr/me` löscht Dokumente mit `WHERE uploaded_by = $1` und
übergibt die **Id**. `documents.uploaded_by` enthält aber einen **Namen**:

```
 uploaded_by | count
-------------+-------
 ordner-sync |  1304
 admin       |    42
 nightrun    |     3
```

Der Vergleich trifft nie. Die Antwort lautet trotzdem „Account und alle
persönlichen Daten wurden gelöscht." Das ist dieselbe Ursache, die in #402
für die Auskunft behoben wurde — nur zerstört die Korrektur hier Daten,
und das gehört vor die Entscheidung, nicht in einen autonomen Lauf.

Zu entscheiden ist auch, was „persönlich" auf einer Einzelbox überhaupt
heißt: `ai_memories` und `projects` haben gar keine Besitzerspalte, und von
1349 Dokumenten tragen 16 eine `owner_id`. Die Multi-User-Isolation aus
Migration 089 existiert als Schema, aber nicht als gepflegte Wirklichkeit.
Das hängt direkt an E1 (Nutzerverwaltung bauen oder Website und AVV ändern).

### E2 (Zahlen nachgeliefert): Welches Modell steht im Auto-Modus vorne

Alle Werte am 19.08.2026 direkt gegen Ollama auf dem Gerät gemessen,
je einmal mit kurzer Frage und einmal mit rund 5200 Token Vorlauf.

| Modell                                 | Ausgabe    | Vorverarbeitung | Kaltstart | Gesamt bei 5200 Token |
| -------------------------------------- | ---------- | --------------- | --------- | --------------------- |
| Gemma 4 Kompakt (`gemma4:e4b`, 9,6 GB) | 30,9 tok/s | 1317 tok/s      | 13,1 s    | **5,3 s**             |
| Qwen 3 8B (5,2 GB)                     | 22,0 tok/s | 872 tok/s       | 6,5 s     | 7,6 s                 |
| Qwen 3 14B (9,3 GB)                    | 12,7 tok/s | 477 tok/s       | 8,2 s     | 14,0 s                |
| Qwen3.8 27B (16,6 GB, heute Standard)  | 9,7 tok/s  | 262 tok/s       | 11,2 s    | 22,5 s                |
| Qwen 3 32B (20,2 GB)                   | 6,0 tok/s  | 214 tok/s       | 14,7 s    | 30,0 s                |

Drei Dinge, die die Entscheidung schärfen:

1. **Das Produkt ist nicht langsam, das Modell ist es.** Neue Unterhaltung,
   warmes Modell, einfache Frage: 2,45 s bis zur fertigen Antwort. Der Rohwert
   desselben Aufrufs direkt gegen Ollama liegt bei 3,0 s. Der Aufsatz kostet
   also praktisch nichts.
2. **Lange Unterhaltungen sind der eigentliche Bremsklotz.** Bei 5200 Token
   Vorlauf braucht das 27B-Modell allein 20 s, bevor das erste Wort kommt.
   Das ist Vorverarbeitung, keine Denkzeit.
3. **Nach 30 Minuten Ruhe kostet die erste Frage 11 Sekunden extra**, weil
   Ollama das Modell nach `AGENT_KEEP_ALIVE=30m` entlädt. Zweimal gemessen:
   11,16 s und 11,19 s. Für eine Vorführung ist das genau der falsche Moment.

Alle fünf Modelle stehen im Chat zur Wahl, Gemma 4 Kompakt eingeschlossen.

### F-31 aus dem Rundgang ist erledigt, nicht offen

F-31 lautete, der Chat erfinde Firmenaussagen. Das stimmt nicht. Unter
Einstellungen → KI → Zusatzkontext steht ein gepflegtes Unternehmensprofil
(„Lokale KI Hardware (NVIDIA Jetson AGX Orin & Thor", „Beratung & Support").
Genau diese Punkte hat der Chat wiedergegeben. Er hat den konfigurierten
Kontext benutzt, nicht erfunden.

## Kleinere Befunde, nicht behoben

- **Der Ordner `tests/` läuft in keinem CI-Workflow.** 13 Dateien, 209
  Testfälle. Mit installierten Abhängigkeiten ausgeführt: 58 bestanden, 29
  gescheitert, 122 Fehler. Typisch `AttributeError: module 'healing_engine'
has no attribute 'docker'` — die Tests stehen gegen Module, die seither
  umgebaut wurden. Reparieren oder entfernen ist eine Entscheidung; so wie
  es ist, erzeugt der Ordner Vertrauen, das er nicht deckt.
- **Die Backend-Testsuite hält Handles offen.** `npx jest
__tests__/unit/chats.test.js` beendet sich nur mit `--forceExit`. Daher
  kippte am 19.08. ein Backend-Job mit „require a file after the Jest
  environment has been torn down", während derselbe Stand im Lauf davor grün
  war. Ein Versuch, das über `afterAll` in `jest.setup.js` zu schließen, ließ
  `chats.test.js` hängen — die offenen Handles sind die eigentliche Ursache.
- **Die KI-RAM-Anzeige geht nicht auf**: „0.0 / 32.0 GB belegt · frei 30.0 GB".
  Die fehlenden 2 GB sind `MODEL_MEMORY_SAFETY_BUFFER_MB`, das die Oberfläche
  nirgends nennt.
- **Ein falsches Passwort schreibt einen Stapelauszug in die Browserkonsole**
  (`Login error: Error: Invalid username or password`). Die Anzeige für den
  Nutzer ist korrekt und verrät nichts; die Konsolenausgabe ist Lärm.
- **Die Anmeldeseite nennt den Standard-Benutzernamen** („Standard-Benutzername:
  admin"). Hilfreich beim ersten Start, aber es steht dort dauerhaft.
- **`llm_model_catalog.is_platform_default`** ist auf drei Modellen gesetzt und
  wird von keiner Zeile Anwendungscode gelesen (nur Migration 064 schreibt sie).
- **„Liste gekürzt" im Explorer** steht an der Wurzel, obwohl die Wurzel
  vollständig ist. Gekürzt wird in der Tiefe (Budget 2000 Einträge, das aktive
  Projekt hat 2110). Ehrlich, aber am falschen Ort.
- **Der Sandbox-Stopp endet immer mit Exit 137** statt 0, weil PID 1
  (`sleep infinity`) kein SIGTERM behandelt. In der Containerliste sieht ein
  planmäßiger Leerlauf-Stopp damit aus wie ein Absturz, und jeder Stopp kostet
  die vollen 10 Sekunden Frist.

## Was ohne Befund geprüft wurde

Dateilauf vollständig: anlegen, automatisch speichern (nach 4 s auf der
Platte), Indexeintrag entsteht, Kontextmenü, Löschen mit Bestätigung, Platte
und Datenbank danach sauber. Flow `/qa-zusammenfassung` mit Dateiauswahl
gestartet und zu Ende gelaufen, Ergebnis fachlich brauchbar, „Letzte Läufe"
zeigt den Lauf live. Terminal: `claude`, `codex`, `node`, `python3` alle
vorhanden. Erweiterung an- und ausschalten mit Rückmeldung und Symbol in der
Leiste. Drei Designs sauber, Projektwechsler mit Bestätigungsdialog vor dem
Löschen, Selbstheilungs-Ansicht mit Live-Ereignissen, Systemstatus mit echten
Werten, Anmeldung mit korrekter Fehlermeldung ohne Nutzer-Ausforschung.

Backend 113 Suites mit 2203 Tests grün, Frontend 92 Dateien mit 819 Tests
grün, CI in allen sieben Läufen grün, null offene Pull Requests.
