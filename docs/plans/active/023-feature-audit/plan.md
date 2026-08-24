# Plan 023, Feature-Audit Arasul Jet: Umsetzung

> Grundlage: Rundgang vom 19.08.2026 (`rundgang.html`, 56 Befunde), Nachprüfung
> desselben Tages (`nachpruefung-2026-08-19.md`, acht Befunde behoben) und die
> Rückmeldung von Kolja vom 19.08.2026 mit 29 Anmerkungen.
>
> Stand: 2026-08-23. Umfang: elf Phasen, 66 Aufgaben, geschätzt 198 Stunden.

## Stand

| Phase                                 | Stand                                                   | Belege                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, Entscheidungen und Zusagen         | **fertig** 19.08.2026                                   | Website und AVV nehmen die fünf unerfüllten Zusagen zurück, die drei fremden Projekte sind vom Gerät                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S, Sicherung wiederherstellbar        | **fertig** 19.08.2026, live abgenommen                  | #407 bis #410, #412, #414. Gate G6 hat als erstes einen belastbaren Nachweis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B, Aufräumen und Auslieferungszustand | **fertig** 20.08.2026, live abgenommen                  | #411, #413, #415 bis #424. `scripts/test/werksreset-abnahme.sh`, 24 von 24, am 20.08. nach dem Frischgerät-Fund erneut bestanden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C, Fundament                          | **fertig** 20.08.2026, live abgenommen                  | #427, #428, #429, #431, #435, #437, #440, #442, #443. `scripts/test/bausteine.py` hält das Raster, seit #433 auch bei Dialogen, seit C7 ohne Ausnahme für den Einrichtungsassistenten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Frischgerät, dazwischengekommen       | **fertig** 20.08.2026, live abgenommen                  | `scripts/test/frischgeraet-abnahme.sh`, 12 von 12. Ein fabrikneues Gerät überlebte seinen ersten Neustart nicht: 47 verdeckte Tabellen, Kunde ausgesperrt, Konto ab Werk an seiner Stelle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D, Modelle                            | **fertig** 22.08.2026, live abgenommen                  | #444 bis #456. D7 Schritt 2: Grundvorlauf 4147 auf 3390 Token, schlimmster Verlauf 22 321 auf 6 282; die Abnahme unter 2500 Token ist nicht erfuellt, Begruendung bei D7. D9: externe Modelle ab Werk aus, Schluessel verschluesselt, Positivfall braucht Koljas eigenen Schluessel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| E, Coding-Agent und Chat              | **laeuft**, E1 und E3 bis E9 live abgenommen 22.08.2026 | #458 bis #471. Live im Browser gegen den Orin: 20 von 20 Zusagen gehalten (`scripts/test/chat-abnahme.mjs`). Groesste Funde: der Teiltext eines abgebrochenen Laufs ging verloren, das Standardmodell scheiterte an jeder Aufgabenliste, und 88 dokumentierte Stellschrauben erreichen den Container nie. Offen bei E2: die Warteschlange bleibt strikt seriell. Am 22.08. erneut gemessen, 20 von 20 gruen; drei rote Punkte aus vier Vorlaeufen waren mein Wartepunkt, nicht das Geraet (#516)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F, Terminal                           | **fertig** 22.08.2026, live abgenommen                  | #473 bis #476. F1 Kopfzeile von 44 auf 19 bis 26 Pixel bei jeder Breite, F2 und F3 waren schon erfuellt und sind jetzt gemessen, F4 Datei im Baum nach 15 Sekunden statt nie, F5 unter 900 Pixeln keine drei Spalten mehr. `scripts/test/terminal-abnahme.mjs`, 9 von 9. Offen an F3 ist nur die Prosa, nicht die Abnahme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G, Dateien und Projekte               | **laeuft**, G1 und G4 live abgenommen 22.08.2026        | #477 bis #491. G1 5000 Dateien vollstaendig durchklickbar, kein Deckel mehr. G4 in sieben Ursachen zerlegt und abgenommen: eine Datei 2,3 statt 113 Sekunden, hundert Dateien 110 statt ueber 300. Groesster Fund der Phase liegt bei G3 und war nicht die Aufgabe: Kopplung und Trennen loeschten den Projektordner des Kunden. G2 und G3 gebaut, ihre Abnahmen brauchen Koljas Repository und Schluessel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| H, Erweiterungen                      | **laeuft**, H1 H4 H5 live abgenommen, H5 am 23.08.2026  | #490, #492 bis #499. H1: alle vier Faehigkeiten da, eine gab es schon, eine halb. H2: ein Befehl legt das Geruest an, ein Waechter haelt Werkstatt und Backend zusammen. H3: ein Werkzeug entscheidet, was dasselbe Paket ist. H4 sieben von sieben im n8n-Dokument gemessen. H5 gebaut, dazu ein Punkt, der im Plan nicht stand. H1 live abgenommen 22.08.2026, und die Abnahme fand drei Fehler: zwei Faehigkeiten gaben IMMER HTTP 500 (Schemata nie exportiert), und z.record mit einem Argument brach jedes gefuellte Objekt Am 23.08.2026 aus einer echten App nachgemessen (#548, #549): der Weg IN den Rahmen war viermal verstellt, die drei neuen Faehigkeiten standen nicht in der Client-Datei, und der naechtliche Lauf starb an einer NOT-NULL-Spalte. Danach fuenf von fuenf, Modellantwort in der App und Zeitplan-Lauf unter Nutzer 1                                                                                                                                                        |
| I, Flows                              | **fertig bis auf I1** 23.08.2026, live abgenommen       | #500. I1 war groesstenteils schon gebaut, I2 zur Haelfte: die autonome Betriebsart ist das Annahmen-Protokoll und traf die Abnahme woertlich. Gebaut wurde die zweite Art samt Rueckfrage mit vier Optionen und Freitextfeld. I2 bis I4 live abgenommen 23.08.2026, elf von elf: der Flow haelt nach 125 s an, fragt auf Deutsch, und das Angebot liegt danach im Kundenordner. Die Abnahme fand dabei VIER Fehler, ohne die sie nicht haette laufen koennen (#529, #533, #534, #535). I5 erledigt: alle Fluesse gemessen, die beiden gescheiterten laufen nach den Fixes durch (erweiterung 221 s, handbuch-bau 3750 s mit 81 099 Bytes statt 373). Offen bleibt allein I1, die Fuenf-Minuten-Messung mit einem Erstnutzer. Fuenf liefen auf Anhieb, die drei anderen legten je einen Fehler frei: eine Rolle erbte das Rundenbudget je Delegation (#524), die kanonische Werkstatt bekam ihre ANLEITUNG nie (#530), und ein Zeitlimit von 120 s je Flow-Aufruf wurde als leeres Ergebnis verschluckt (#531) |
| J, Einstellungen                      | **fertig** 23.08.2026, live abgenommen                  | #501, #503, #504. J4: der Plan nennt einen Fehler, es waren drei, darunter einer, der Art. 17 auf einem Kundengeraet unmoeglich machte. J1: nach dem MinIO-Passwortwechsel scheiterte jeder Dateizugriff. J5 war zur Haelfte schon da. J2 acht von acht im Browser. J3 live abgenommen 22.08.2026. J1 und J4 live abgenommen 23.08.2026 auf dem Pruefstand, und die Abnahme fand VIER Fehler, die jedes Geraet betrafen: der Passwortwechsel endete immer mit HTTP 500 (#537), ein frisches Geraet bekam keinen Administrator (#538), und die Loeschung nach Art. 17 scheiterte in zwei weiteren Schichten (#539, #540)                                                                                                                                                                                                                                                                                                                                                                                       |
| K, Dokumentation                      | **fertig bis auf K2** 23.08.2026                        | #506 bis #508, #569, #571. K1 erfuellt: die Luecke ging von 77 ueber 35 auf NULL, und das Schliessen legte fuenf Endpunkte frei, die auf jedem Geraet HTTP 500 gaben oder ihre Daten verschwiegen — alle fuenf von gruenen Unit-Tests gedeckt. Neu `scripts/test/endpunkte-live.py`, naechtlich. K2 zur Haelfte: die Planzustaende stehen hier, die Roadmap liegt im Steuer-Repo. K3: README, CLAUDE.md und ARCHITECTURE zeigten zwei Dienste, die nicht laufen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Die Abnahme des Werksresets läuft auf dem zweiten Stack, nicht am Arbeitsgerät:
`scripts/test/pruefstand.sh hoch`, dann `scripts/test/werksreset-abnahme.sh`.
Sie hat drei Fehler gefunden, die kein Testlauf gesehen hätte, darunter zwei,
die die Stufe „Auslieferungszustand" wertlos gemacht hätten.

## Wozu dieser Plan da ist

Arasul ist keine Sammlung von Werkzeugen mehr, sondern eine Entwicklungsumgebung.
Man wählt oben ein Projekt, arbeitet darin im Terminal und im Chat, baut daraus
eigene Anwendungen und schaltet sie als Tab frei. Alles, was aus der Zeit davor
übrig ist, wird entfernt. Alles, was diese eine Geschichte nicht stützt, wird
nicht gebaut.

Der Plan ist so geschnitten, dass er von oben nach unten autonom abgearbeitet
werden kann. Jede Aufgabe hat eine Abnahme, die ohne Rückfrage prüfbar ist. Eine
Phase ist fertig, wenn jede ihrer Abnahmen erfüllt und live auf dem Gerät belegt
ist, nicht wenn der Branch gemerged ist.

## Was der Rundgang falsch behauptet hat

Zwei Befunde ziehe ich zurück, bevor jemand daran arbeitet.

**F-31 ist kein Befund.** Der Chat hat keine Firmenaussagen erfunden. Unter
Einstellungen, KI, Zusatzkontext steht ein gepflegtes Unternehmensprofil mit
genau den Sätzen, die der Chat wiedergegeben hat. Am Harness ist dafür nichts zu
tun. Wer will, dass der Chat das Produkt beschreibt statt der Firma, ändert das
Textfeld. Aufgenommen als Aufgabe D8.

**F-44 war zu hart.** „Eigene Anwendungen hosten existiert nicht" stimmt so
nicht. Es gibt die Erweiterungs-Werkstatt, den Watcher, der jedes `manifest.json`
automatisch registriert, `buildFromSandbox`, die Brücke mit Token und
freigegebenen Fähigkeiten, den iframe-Tab und die GitHub-Kopplung je Projekt.
Was fehlt, ist genau eine Sache: eine Erweiterung kann heute nur ein statisches
Frontend sein. Das ist Phase H, nicht ein Neubau.

## Entschieden am 19.08.2026

| Nr  | Entscheidung                                                                                                 | Folge                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| E1  | Keine Nutzerverwaltung, kein Scope. Alle Nutzer teilen sich einen Zugang                                     | Website und AVV müssen die Zusage zurücknehmen, Phase A2                                         |
| E2  | Qwen3.8 27B bleibt Standardmodell, umschaltbar in den Einstellungen                                          | Tempo wird über Lebenszyklus und Vorlauf geholt, nicht über einen Modellwechsel, Phase D6 und D7 |
| E3  | Die drei fremden Projekte verschwinden vom Gerät, Daten vorher sichern                                       | Phase A4                                                                                         |
| E4  | Plan 021 wird geschlossen, Plan 020 als teilgeliefert, der Hardware-Rest wird ein Roadmap-Ziel für DGX Spark | Phase K2                                                                                         |
| E5  | Mandantenisolation fällt komplett weg, Gate G4 wird neu gefasst                                              | Phase A3                                                                                         |
| E6  | Ab Werk ist nichts enthalten: keine Erweiterung, kein Flow, kein n8n-Workflow                                | Phase B4, braucht den Werksreset aus B5                                                          |
| Neu | Erweiterungen bekommen ihr Backend über die vorhandene Brücke, nicht als eigener Prozess                     | Phase H1                                                                                         |

## Was dieser Plan ausdrücklich nicht enthält

- Nutzerverwaltung, Rollen, Mandantenisolation (E1, E5)
- Transkription (Rückmeldung zu Lagebild 2)
- Eine gebaute DATEV- oder Lexware-Anbindung. Das ist ein Beispiel für eine
  eigene Anwendung, kein Produktbestandteil (Rückmeldung zu Lagebild 2)
- Der Kalkulations- und Aufmaß-Block aus der Rückmeldung. Er gehört zu einem
  anderen Projekt und ist beim Diktieren hineingeraten. Ersatzlos gestrichen.

## Regeln, die in jeder Phase gelten

1. Keine Gedankenstriche als Trenner, weder in der Oberfläche noch im Code, noch
   in der Dokumentation. Wird in B6 einmal global bereinigt und danach durch eine
   Prüfung im Testlauf gehalten.
2. Deutsch in allem, was der Nutzer liest. Englisch nur in Bezeichnern.
3. Neutrale Anrede, wo es geht. Wo nicht, wird geduzt.
4. Nur Blau und Grautöne. Orange und Violett kommen im Produkt nicht vor.
5. Jede neue Oberfläche benutzt die Bausteine aus Phase C. Keine Einzelanfertigung.
6. Ein Schritt, ein Pull Request, eine Abnahme. Kein Sammel-PR über mehrere Aufgaben.

---

# Phase A, Fundament: Entscheidungen und Zusagen (fertig)

Geschätzt 10 Stunden. Kein Produktcode. Diese Phase entfernt eine Haftung und
muss vor dem ersten Partnergespräch fertig sein.

## A1 Entscheidungen festschreiben

Die sechs Entscheidungen oben nach `company/decisions.md` im Orchestrierungs-Repo,
jeweils mit Begründung, verworfener Alternative und Folge. Risiken R17, R18, R21
schließen oder umschreiben.

**Abnahme:** `company/decisions.md` enthält sechs neue Einträge mit Datum
19.08.2026. `company/risks.md` führt R17 und R18 als geschlossen mit Verweis auf
A2.

## A2 Website und AVV sagen, was das Gerät kann

Fünf Zusagen stehen ohne Gegenstück im Code. Drei werden gestrichen, zwei
bleiben und werden geschärft.

| Zusage                                                                            | Fundstelle                       | Vorgehen                                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| „legst Nutzer an", „KI-Chat für dein Team", „3 bis 10 gleichzeitig aktive Nutzer" | arasul.de `/eigener-ki-server`   | streichen, ersetzen durch „ein Zugang je Gerät, beliebig viele Sitzungen"                                 |
| „Trennungskontrolle (Multi-User-Isolation, RBAC)"                                 | `docs/legal/AVV_TEMPLATE.md:175` | streichen, ersetzen durch die Trennung, die es gibt: ein Gerät, ein Datenbestand, kein Abfluss nach außen |
| Transkription                                                                     | drei Branchenseiten              | streichen                                                                                                 |
| Rechnungen aus dem Postfach nach Lexware oder DATEV                               | arasul.de                        | umformulieren zu einem Beispiel für eine selbst gebaute Anwendung                                         |
| Eigene Anwendungen hosten                                                         | arasul.de                        | bleibt, wird konkret: Frontend plus Server-Fähigkeiten über die Brücke, als Tab im Arbeitsbereich         |
| Externes Cloud-Modell dazuschalten                                                | arasul.de                        | bleibt, Umsetzung in D9                                                                                   |

**Abnahme:** `grep -rin "multi-user\|RBAC\|Transkription\|Nutzer anlegen"` in
`arasul-website` und `arasul-jet/docs/legal` liefert keinen Treffer mehr, der
eine Zusage darstellt. Behebt F-21, F-43, F-45, teilweise F-42.

## A3 Gate G4 neu fassen

G4 heißt heute „Mandanten-Isolation bewiesen". Bei einem Zugang je Gerät ist das
die falsche Frage. Neue Fassung: „Daten eines Geräts verlassen das Gerät nicht,
und ein Gerät sieht kein anderes." Nachweis über Netzprüfung und die
DSGVO-Auskunft.

**Abnahme:** Gate-Definition geändert, Nachweisverfahren beschrieben, Stand von
G4 neu bewertet.

## A4 Fremde Container und Projekte vom Gerät

Die sechs gerätefremden Container sind seit dem 19.08. gestoppt, die Volumes
liegen noch da. `litellm` hält Cloud-Schlüssel im Produktnetz.

Vorgehen: Volumes einmal auf die externe SSD sichern, Prüfsumme notieren, dann
Volumes, Compose-Dateien und Ordner vom Gerät entfernen. `avatar-pipeline` liest
MinIO mit Arasuls Root-Zugangsdaten, diese Zugangsdaten werden danach gewechselt.

**Abnahme:** `docker volume ls` zeigt nur Arasul-Volumes. `docker ps -a` zeigt
15 Container, alle Arasul. `/home/arasul/jarvis` und
`/home/arasul/projects/avatar-pipeline` existieren nicht mehr. Behebt F-46.

---

# Phase S, Sicherung wiederherstellbar machen (fertig)

Geschätzt 14 Stunden. Nicht im ursprünglichen Plan. Aufgenommen am 19.08.2026,
weil beim Prüfen einer einzigen AVV-Zeile in Phase A herauskam, dass Gate G6
nicht offen ist, sondern zurückgefallen. Läuft zwischen A und B, weil eine
Sicherung, die nie wiederhergestellt wurde, keine Sicherung ist und jeder
weitere Umbau darauf aufsetzt.

## Ausgangslage, gemessen am 19.08.2026 auf dem Orin

| Gemessen                 | Wert                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Täglicher Lauf           | 02:00 UTC, zuletzt 19.08., 1,4 GB Bestand                                                 |
| Aufbewahrung             | 30 Tage, 12 Wochen, 60 Monate                                                             |
| Verschlüsselung          | `"encrypted": "false"`                                                                    |
| WAL-Archivierung         | `archive_mode = off`, 0 Segmente                                                          |
| Schlüssel-Escrow         | `/backups/escrow` seit 09.05.2026 leer                                                    |
| Wiederherstellungstest   | sonntags 04:00, **am 16.08. fehlgeschlagen**, 0 geprüfte Tabellen, davor bis 02.08. mit 6 |
| Lücke im Zeitplan        | 07. bis 09.08. gar keine Sicherung, der Test am 09.08. fiel mit aus                       |
| Gesamtstatus jeder Nacht | `partial_failure`                                                                         |

## S1 Der Wiederherstellungstest wird wieder grün

Ursache steht im Protokoll: `FATAL: database "arasul_drill" does not exist`,
zwei Sekunden nach dem Start des Prüfcontainers. Die Bereitschaftsprüfung
benutzt `pg_isready`, und das antwortet bereits, während der Postgres-Einstieg
noch in seiner Startphase läuft und die Zieldatenbank noch nicht angelegt ist.
Ein Wettlauf, der lange gutging und am 16.08. kippte, vermutlich weil das Gerät
an dem Tag unter der Doublettenschleife stand, die erst am 19.08. behoben wurde.

Behebung: nicht den Server anpingen, sondern die Zieldatenbank abfragen.

**Abnahme:** Der Test läuft von Hand ausgelöst durch und meldet 6 geprüfte
Tabellen. Ein künstlich verzögerter Start des Prüfcontainers ändert daran
nichts.

## S2 Der Test kann verschlüsselte Sicherungen lesen

Muss vor S3 kommen, sonst tauscht man einen einmal gescheiterten Test gegen
einen dauerhaft gescheiterten. `encrypt_file` in `services/backup-service/backup.sh`
schreibt das Chiffrat unter demselben Namen zurück (`mv "${src}.enc" "$src"`).
Die Datei heißt weiter `.sql.gz`, ist aber keine mehr. Der Test macht `zcat` darauf.

Behebung: der Test erkennt am Magic-Byte, ob eine Datei verschlüsselt ist, und
entschlüsselt sie vor dem Einspielen. Beim Flow-Archiv gibt es diese Erkennung
schon, dort wird bisher aber nur "nicht prüfbar" gemeldet statt entschlüsselt.

**Abnahme:** Der Test besteht mit verschlüsselten und mit unverschlüsselten
Sicherungen. Bei fehlendem Schlüssel meldet er das als Fehler, nicht als Erfolg.

## S3 Sicherungen werden verschlüsselt

`BACKUP_ENCRYPT` steht auf `false`, und den Schlüssel gibt es nicht: das Secret
`backup_encryption_key` ist in `compose/compose.secrets.yaml` nicht definiert
und wird von keinem Einrichtungsskript erzeugt.

Umfang: Secret definieren, Erzeugung in die Einrichtung aufnehmen, `BACKUP_ENCRYPT`
einschalten, den Wiederherstellungsweg (`scripts/backup/restore.sh`) auf
dasselbe Verfahren bringen. Achtung, es gibt zwei Sicherungssysteme mit
verschiedenen Verfahren: der Container benutzt `openssl` und
`BACKUP_ENCRYPT`, das Skript auf dem Wirt `gpg` und `BACKUP_ENCRYPTION_ENABLED`.
Eins davon ist tot und fliegt raus, das ist gleichzeitig ein Posten für B3.

**Abnahme:** `backup_report.json` meldet `"encrypted": "true"`. Eine Sicherung
lässt sich mit dem Schlüssel wiederherstellen und ohne ihn nicht.

## S4 Der Schlüssel-Escrow füllt sich

Kein eigener Fehler, sondern eine Folge: `backup.sh` legt den n8n-Schlüssel
bewusst nur dann zur Sicherung, wenn verschlüsselt wird, sonst läge er im
Klartext neben der Sicherung. Diese Entscheidung ist richtig und bleibt. Mit S3
löst sich das von selbst, zu prüfen ist nur, dass es dann auch passiert.

**Abnahme:** Nach dem ersten verschlüsselten Lauf liegt in `/backups/escrow`
ein Schlüssel mit Prüfsumme. Ohne ihn lassen sich die n8n-Zugangsdaten aus einer
Datenbanksicherung nicht wiederherstellen, mit ihm schon. Beides geprüft.

## S5 WAL-Archivierung einschalten

`archive_mode` steht auf `off`, `/backups/wal` ist leer, und die tägliche
Sicherung packt folgerichtig nichts ein. Ohne WAL gibt es keine
Wiederherstellung auf einen Zeitpunkt, sondern nur auf 02:00 UTC des Vortags.
Bei einem Ausfall um 23:00 sind das 21 Stunden Arbeit.

**Abnahme:** `SHOW archive_mode` liefert `on`, `/backups/wal` füllt sich,
`wal_segments` im Bericht ist größer als null, und eine Wiederherstellung auf
einen Zeitpunkt zwischen zwei Sicherungen gelingt einmal nachweislich.

## S6 Der Daueralarm verschwindet

Jeder nächtliche Lauf meldet `partial_failure`, weil er Qdrant sichern will.
Qdrant liegt seit Plan 021 Schritt 8 absichtlich im Compose-Profil `classic-rag`
und läuft nicht. Ein Alarm, der immer an ist, verdeckt jeden echten.

Behebung: Qdrant wird übersprungen, wenn das Profil nicht aktiv ist, und als
`skipped` ausgewiesen statt als Fehler. `partial_failure` bedeutet danach wieder
etwas.

**Abnahme:** Der nächtliche Lauf meldet `success`, solange nichts kaputt ist.
Wird Qdrant aktiviert, wird es wieder gesichert und ein Fehlschlag zählt wieder.

## S7 Ein Fehlschlag fällt auf

Der wichtigste Posten der Phase. Der Test scheiterte am 16.08. und niemand
merkte es drei Tage lang. Vom 07. bis 09.08. gab es überhaupt keine Sicherung
und auch das fiel nicht auf. Der Container meldete durchgehend `healthy`.

Umfang: Ergebnis der Sicherung und des Wiederherstellungstests laufen in die
vorhandene Alarmierung. Zwei Zustände lösen aus: der Test ist nicht bestanden,
und seit mehr als 26 Stunden gab es keine erfolgreiche Sicherung. Sichtbar in
den Einstellungen unter System, nicht nur im Protokoll.

**Abnahme:** Ein absichtlich herbeigeführter Fehlschlag erzeugt innerhalb einer
Stunde einen sichtbaren Alarm. Der Container gilt nicht mehr als gesund, wenn
seit über 26 Stunden keine Sicherung durchlief.

## S8 Doppelte Protokollzeilen

Jede Zeile steht zweimal im Protokoll, weil die Protokollfunktion mit `tee` in
die Datei schreibt und die Crontab dieselbe Ausgabe noch einmal umleitet. Bei
28478 Zeilen ist die Hälfte Rauschen.

**Abnahme:** Jede Zeile steht einmal.

---

# Phase B, Fundament: Aufräumen und Auslieferungszustand (fertig)

Geschätzt 22 Stunden. Nichts Neues, nur weniger. Diese Phase bestimmt, wie
teuer jede spätere Phase wird.

## B1 Legacy-Shell entfernen

`components/layout/Sidebar.tsx` und die daran hängende zweite Oberfläche sind
nur über getippte URLs `/settings`, `/store`, `/terminal` erreichbar und haben
einen einzigen Menüeintrag. Das erklärt die seit dem 18.08. offene Meldung, dass
`/settings` keine Navigation zu fünf der sechs Bereiche hat.

Die Routen bleiben, sie zeigen künftig auf den Arbeitsbereich mit dem passenden
Tab. Die Shell selbst und alles, was nur sie benutzt, wird gelöscht.

**Abnahme:** `/settings`, `/store`, `/terminal` landen im Arbeitsbereich.
`grep -rn "layout/Sidebar" src` findet nichts. Behebt F-38.

## B2 404 als Komponente statt als Seite

Die eigene 404-Seite fällt weg. Was bleibt, ist eine Komponente „nicht gefunden"
mit einem Weg zurück, die überall eingesetzt werden kann.

**Abnahme:** Eine unbekannte Route zeigt die Komponente im Arbeitsbereich, nicht
eine eigene Seite. Ein Klick führt zurück.

## B3 Toter Code, systematisch

Bekannt: `ProjektAnschlussSelect.tsx` ohne Aufrufer (F-34), Facettenfilter für
Erweiterungen gebaut und nicht angeschlossen (F-35), Sidebar-Ansicht `'search'`
ohne Knopf (F-39), `APP_TAB_TYPES` und `APP_CHILD_TAB_TYPES` als leere Mengen mit
laufender Logik daran (F-40).

Dazu ein vollständiger Durchgang: Komponenten ohne Aufrufer, Routen ohne
Oberfläche, Tabellen ohne Schreiber, Umgebungsvariablen ohne Leser,
Abhängigkeiten ohne Import. Ergebnis als Liste, dann in einem Zug entfernen.

**Abnahme:** Ein wiederholbares Skript `scripts/test/toter-code.sh` liefert die
Liste und ist Teil des Testlaufs. Beim Abschluss ist sie leer.

## B4 Auslieferungszustand ist leer

Heute ab Werk enthalten: drei Erweiterungen namens „Beispiel-Tool",
„Beispiel-Flow", „Beispiel-App", ein Flow `/qa-zusammenfassung` mit der
Beschreibung „QA-Test", zwei fremde n8n-Workflows aus dem Juli, darunter ein
unbenanntes „My workflow".

Nach E6 ist ab Werk nichts davon enthalten. Kein Beispiel, kein Flow, kein
Workflow. Die Startbildschirme müssen deshalb ohne Inhalt gut aussehen und
erklären, wie man den ersten Eintrag anlegt.

**Abnahme:** Nach einem Werksreset sind Erweiterungskatalog, Flow-Liste und
n8n-Übersicht leer und zeigen jeweils einen Einstieg. Behebt F-09, F-12, F-16.

**Erledigt am 20.08.2026** (#419). Der Start legte fünf Beispiel-Flows an;
aufgefallen ist das erst in der Abnahme von B5, weil der Flow-Ordner nach dem
Reset leer war und nach dem Neustart wieder fünf Dateien enthielt.

E6 wörtlich genommen hätte den Zweck des Geräts getroffen: `erweiterung` und
`execute` treiben den Erweiterungs-Baukasten. Aufgelöst ohne Abstrich an E6:
nichts wird angelegt, alles wird angeboten. Die fünf stehen im Anlege-Dialog als
Startpunkt, angelegt wird beim Speichern.

## B5 Werksreset

Es gibt keinen. Für ein Gerät, das ausgeliefert und zurückgenommen wird, ist das
die Lücke, die B4 erst dauerhaft macht.

Umfang: Chats, Dokumente, Wissensräume, Projekte, Erweiterungen, Flows,
n8n-Workflows, Sandboxes, Modelle nach Wahl, Zugangsdaten. Zwei Stufen, einmal
Inhalte zurücksetzen und einmal auf Auslieferungszustand. Zweistufige Bestätigung
mit Eingabe des Gerätenamens.

**Abnahme:** Werksreset über die Oberfläche ausgelöst, danach entspricht der
Zustand B4. Ein Neustart überlebt das Ergebnis. Behebt F-36.

**Erledigt am 19./20.08.2026** (#417, #418, #420, #422). Nachgewiesen auf dem
Prüfstand mit `scripts/test/werksreset-abnahme.sh`, 24 von 24 Punkten, am
20.08. nach dem Frischgerät-Fund erneut bestanden. Drei
Befunde kamen erst durch die Abnahme, keiner davon aus einem Testlauf:

1. `ADMIN_PASSWORD` steht **zweimal** in der `.env`, und der Schreiber ersetzte
   nur das erste Vorkommen. dotenv nimmt das spätere.
2. Dasselbe Passwort kommt zusätzlich als Docker-Secret herein, das der Reset
   nicht anfassen kann. Gelöst über den Merker `arasul.geraet`, der den Reset
   überlebt und `bootstrap.js` davon abhält, den alten Zugang neu anzulegen.
3. Das Migrationsbuch stand je nach `search_path` mal in `public`, mal in
   `arasul`. Behoben in #421, der Rest als R29 im Register.

Ohne Punkt 1 und 2 hätte sich ein zurückgegebenes Gerät mit dem alten Passwort
weiter öffnen lassen.

## B6 Gedankenstriche raus, Anrede neutral

Ein Durchgang über Oberfläche, Fehlermeldungen, Dokumentation und Kommentare.
Gedankenstriche als Trenner werden durch Komma, Doppelpunkt oder Punkt ersetzt.
Gemischte Anrede wird neutral, im Zweifel geduzt.

Danach eine Prüfung im Testlauf, die neue Gedankenstriche in Oberflächentexten
meldet.

**Abnahme:** Die Prüfung läuft in der CI und ist grün. Behebt F-20.

**Erledigt am 20.08.2026** (#423). 273 Stellen, davon 82 in Texten, die ein
Kunde liest. `scripts/test/gedankenstriche.py` hält es. Kommentare bleiben außen
vor, ein alleinstehender Strich als Platzhalter für „kein Wert" auch. Die Anrede
ist an 16 Stellen von Sie auf neutral oder Du gezogen; das Kundenhandbuch behält
sein Sie, das ist ein eigener Durchgang und gehört in Phase K.

## B7 Englische Beschriftungen raus

Bekannt: der Tab heißt „Extensions", obwohl darin Modelle und Erweiterungen
stehen (F-03, F-08). Im System-Bereich stehen „RAM USAGE", „SWAP", „STORAGE",
„NORMAL", „Performance", „Self-Healing", „Services", „Updates" (F-23). Das
Suchfeld schneidet seinen Platzhalter ab (F-10, Ursache ist F-35).

Modelle und Erweiterungen bekommen außerdem getrennte Tabs mit eigenem Titel.

**Abnahme:** Ein Durchlauf durch alle Bildschirme findet kein englisches Wort in
der Oberfläche außer Eigennamen. Behebt F-03, F-08, F-10, F-23.

**Erledigt am 20.08.2026** (#424). Aus dem einen Tab „Extensions" sind zwei
geworden, `modelle` und `erweiterungen`, jeder mit eigenem Titel und Pfad. Ein
gespeicherter `store`-Tab wird beim Laden umgeschrieben statt verworfen.

Beim Aufteilen ist ein Fehler entstanden, den erst der Review gefunden hat: der
Routen-Schlüssel kam aus dem Tab-Typ statt aus dem Routennamen, damit wären
beide Tabs dauerhaft leer geblieben. Ursache war ein Testaufbau, der die
Verdrahtung übersprang. Der neue Test geht durch `FeatureTabHost`.

---

# Phase C, Fundament: ein Komponentenset für alles

Geschätzt 24 Stunden. Zahlt vollständig auf Gate G3. Der Grund, warum diese
Phase vor den Bildschirmen kommt: acht Bildschirme einzeln zu begradigen erzeugt
denselben Zustand wieder, nur an anderer Stelle.

## C1 Bausteine bauen

Sechs wiederverwendbare Bausteine, jeder mit festgelegten Abständen, Zuständen
und Verhalten auf schmalen Fenstern.

| Baustein                                   | Ersetzt heute                                                  |
| ------------------------------------------ | -------------------------------------------------------------- |
| Seitenkopf mit Titel, Beschreibung, Aktion | acht verschiedene Kopfvarianten in den Einstellungen           |
| Filterleiste mit Tabs                      | drei verschiedene Tab-Leisten                                  |
| Kennzahlkachel                             | die Kacheln im Systemstatus, vier je Zeile, nie drei plus eins |
| Diagramm                                   | der Performance-Chart, ohne Karte, nur Grau und Blau           |
| Abschnitt mit Überschrift und Feldern      | Firmenprofil, Kontext, Sprachmodell, Sicherheit, Datenschutz   |
| Leerzustand mit Einstieg                   | die leeren Listen aus B4                                       |

**Abnahme:** Alle sechs liegen in `src/components/ui`, haben Tests und werden
mindestens zweimal verwendet. Kein Hexwert im Code, nur Themenwerte.

**Erledigt am 20.08.2026** (#427), live auf `c7df62c`. Gemessen statt aus dem
Rundgang übernommen: zwanzig Kopfstellen in elf Dateien, nicht elf in sieben.
Der Seitenkopf trägt fünfzehn Stellen, die Filterleiste drei, der Leerzustand
fünf. Drei Fehler kamen dabei heraus, keiner aus dem Rundgang: die
Vorlese-Beschriftung des Auslastungsdiagramms nannte die falschen drei Werte,
der Fokus der Tab-Leiste sprang auf einen Reiter, der nach einer abgelehnten
Rückfrage gar nicht aktiv wurde, und der Filter `v > 0` am Temperaturverlauf
war nicht beiläufig, sondern der einzige Schutz gegen die Ausfallkennung 0.0
des Sensors.

## C2 Einstellungen auf die Bausteine umbauen

Alle sechs Bereiche: Allgemein, KI, Sicherheit, Datenschutz, System, Fernzugriff.
Gleiche Kopfzeile, gleiche Tab-Leiste, gleiche Abstände, gleiche Feldgruppen.
Der Abstand zwischen Maskottchen und Firmenprofil, die uneinheitlichen Abstände
über den Überschriften und die mehrfachen Überschriftenebenen fallen dabei weg.

**Abnahme:** Ein Bildvergleich der sechs Bereiche zeigt identische Kopfzeile,
identische Tab-Leiste und identisches Abstandsraster. Bei 1440, 1024 und 390
Pixel Breite bricht nichts.

**Erledigt am 20.08.2026** (#428). Vorher gab es fünf Arten, eine Feldgruppe zu
trennen, und eine vierte handgebaute Tab-Leiste in `KISettings`, die C1 nicht
gesehen hatte. Zwei Doppelungen sind weg: der Rahmen nannte den Bereichsnamen,
den das `h1` vierzig Pixel tiefer noch einmal trug, und zwischen dem letzten
Abschnitt von „Allgemein" und der n8n-Anleitung standen zwei Trennlinien mit
acht Pixeln dazwischen.

Der strukturelle Teil der Abnahme hält jetzt ein Wächter,
`scripts/test/bausteine.py` im Testlauf: er meldet ein `<h1>`, eine
Feldgruppen-Trennlinie oder eine Tab-Leiste außerhalb von `components/ui`.
Gegen den Stand vor Phase C findet er 39 Stellen, gegen den jetzigen keine.
Der Bildvergleich bei den drei Breiten steht noch aus und ist Handarbeit;
im Code gibt es keine feste Breite, die bei 390 Pixeln bräche.

**Dabei kam heraus, dass F-20 und F-23 nicht behoben sind, obwohl B6 und B7 sie
so führen.** B6 hat die Abnahme an eine CI-Prüfung gehängt, die es nur für
Gedankenstriche gibt, nicht für die Anrede. Allein in den Bereichen, die C2
anfasst, standen zehn Sie-Formen, darunter „Verwalten Sie die Arasul Platform
Dienste" als Beschreibung eines ganzen Bereichs. Bei B7 waren es „Platform
Version", „Hostname", „JetPack Version" und „Uptime" in den
Systeminformationen. Beides in den angefassten Dateien nachgezogen; offen
bleiben `SetupWizard` (C4) und `CreateAdmin` (C3).

## C3 Login kleiner und ohne Standardnamen

Der Standard-Benutzername steht im Klartext auf der Seite. Er wird entfernt. Der
Anmeldebereich wird spürbar kleiner. `GET /api/auth/me` schreibt vor der
Anmeldung keinen Fehler mehr in die Konsole.

**Abnahme:** Keine Nennung eines Benutzernamens auf der Seite. Konsole beim
Laden leer. Behebt F-01, F-02.

**Erledigt am 20.08.2026** (#429).

Vorher gemessen, nicht vermutet: ein Aufruf der Anmeldeseite auf dem Gerät
schrieb genau eine Zeile in die Konsole, `Failed to load resource: 401` für
`/api/auth/me`. Die schreibt der Browser selbst, kein `try/catch` im Code
fängt sie ab, weil es in JavaScript gar keine Ausnahme ist.

**Der erste Versuch war der falsche und ist im Review zweimal beanstandet
worden.** Er hat die Frage übersprungen, wenn kein Token im `localStorage`
liegt. Das tauscht einen sicheren Fehler gegen einen seltenen: das
Sitzungscookie `arasul_session` ist `httpOnly`, eine Seite sieht es nie, und ein
Browser, der den `localStorage` räumt, ohne die `httpOnly`-Cookies zu räumen,
hätte eine Sitzung verloren, die der Server noch anerkannt hätte. Der Einwand
war doppelt richtig: `middleware/auth.js:34` hat den Cookie-Weg ausdrücklich
„for LAN access support". Der Gegenvorschlag des Reviews, einfach immer zu
fragen, war aber auch falsch, denn er macht F-02 wieder auf.

**Gelöst über einen dritten Weg, den das Review selbst nennt:
`GET /api/auth/session`.** Ein öffentlicher Prüfpunkt, der in beiden Fällen mit
200 antwortet und im Rumpf sagt, welcher es ist. Damit gibt es den Handel
überhaupt nicht: die Konsole bleibt leer, und über die Sitzung entscheidet
weiter allein der Server. `/auth/me` bleibt unverändert die geschützte Route
und antwortet ohne Sitzung weiter mit 401.

**Dabei kam heraus, dass `optionalAuth` das Sitzungscookie nie gelesen hat.**
`requireAuth` hat den Cookie-Weg seit jeher, `optionalAuth` nicht. Aufgefallen
ist es nicht, weil `optionalAuth` im ganzen Backend keinen einzigen Aufrufer
hatte. Der neue Prüfpunkt ist sein erster, und ohne die Ergänzung hätte er
genau den Fall falsch beantwortet, um dessentwillen er gebaut wurde. Gegenprobe
gesehen: ohne den Cookie-Weg wird der Test rot.

**Und noch etwas hing daran, zweimal.** `jest.mock` ersetzt das ganze Modul,
nicht nur den Teil, den eine Testdatei braucht. Wer eine geteilte Middleware so
ersetzt und ihre Ausfuhren von Hand aufzählt, liefert jedem anderen Aufrufer
`undefined`, und Express bricht beim Registrieren der Route ab mit
`Route.get() requires a callback function but got a [object Undefined]`.

- Neun Dateien ersetzen die Auth-Middleware, keine kannte `optionalAuth`. Eine
  ist sofort gescheitert, die anderen acht hätten es beim nächsten Aufrufer
  getan. Alle neun nachgezogen.
- Sieben Dateien ersetzen die Rate-Limiter, keine kannte `sessionProbeLimiter`.
  Fünf Suiten auf einen Schlag. Hier war die Aufzählung in allen sieben
  identisch und ohne eigenes Verhalten, deshalb ist sie ersatzlos weg:
  `__tests__/helpers/rateLimitMock.js` antwortet über einen Proxy auf **jeden**
  Namen mit einer Middleware, die durchlässt. Der nächste Limiter braucht dort
  nichts.

Bei der Auth-Middleware ging das nicht, weil jede der neun ein eigenes
`requireAuth` braucht. Dieselbe Falle steht dort also weiter offen; als
Wiedervorlage notiert.

**Review-Runde 3 hat einen Fehler gefunden, den der neue Prüfpunkt erst
möglich gemacht hat.** `checkAuth` hat jede Antwort, die nicht `ok` war, als
„nicht angemeldet" gewertet und den Token weggeworfen. Solange `/auth/me`
gefragt wurde, ging das durch, denn dort war die 401 selbst die Aussage. Beim
Prüfpunkt ist eine 429 aus dem Rate-Limiter oder ein 5xx **keine** Aussage über
die Sitzung, und ein Serverschluckauf hätte einen angemeldeten Nutzer
abgemeldet. Jetzt räumt nur eine Antwort auf, die der Server wirklich gegeben
hat: 200 mit `authenticated: false`. Gegenprobe gesehen, drei Tests.

**Dazu ein eigener Limiter.** Der Prüfpunkt lag zuerst hinter
`generalAuthLimiter`, 30 Anfragen je Minute und IP, geteilt mit
`/auth/needs-setup` und `/auth/logout`. Ein Seitenaufruf verbraucht davon
bereits zwei, und mehrere Leute in einem Büro teilen sich hinter NAT eine IP.
Fünfzehn Seitenaufrufe je Minute hätten begonnen, einem Prüfpunkt mit 429 zu
antworten, dessen Zweck es ist, oft gefragt zu werden. Er hat jetzt
`sessionProbeLimiter` mit 120 je Minute.

Dieselbe Enge hat `/auth/needs-setup`, das ebenfalls bei jedem Seitenaufruf
gefragt wird und weiter auf `generalAuthLimiter` steht. Dort ist die Folge
milder, eine 429 landet im `catch` und zeigt die Anmeldung, es meldet also
niemanden ab. Nicht mit angefasst, weil es nicht zu C3 gehört; als Wiedervorlage
notiert.

**Beim Eintragen in `docs/api/API_REFERENCE.md` waren drei Angaben falsch.**
`logout` steht auf 30 pro Minute, nicht 30 pro 15 Minuten, und `logout-all` und
`refresh-cookie` haben überhaupt keinen Limiter. Alle Werte in der Tabelle
stammen jetzt aus dem Code, mit `Stand:` und `Quelle:`.

**Dabei kam ein stiller Fehler in den Testfixtures heraus.** `App.test.tsx`
legte `arasul_token = 'valid-token'` ab. Diese Zeichenkette hat `getValidToken`
noch nie bestanden, sie wurde also schon vorher aus dem `Authorization`-Header
geworfen; die Tests liefen unbemerkt über den Cookie-Weg. Jetzt steht dort ein
Token in der Form, die der Server ausstellt.

F-01 saß an drei Stellen, nicht an einer: in der Fußzeile der Anmeldung, als
Platzhalter `admin` im Benutzernamenfeld und als Vorschlag `z. B. admin` beim
Anlegen des ersten Kontos. Die beiden Tests, die den Hinweis vorher
festgeschrieben haben, sind zu Wächtern umgedreht.

Beide Seiten stehen jetzt auf einem gemeinsamen Baustein `AuthCard`; ihr `h1`
liegt damit in `components/ui`, und die zwei Ausnahmen, die sie in
`scripts/test/bausteine.py` hatten, sind ersatzlos weg.

Gemessen, statt behauptet, bei drei Breiten (Karte in Pixeln):

| Breite | vorher  | nachher | Fläche |
| ------ | ------- | ------- | ------ |
| 1440   | 433x725 | 363x503 | -42 %  |
| 1024   | 446x749 | 374x518 | -42 %  |
| 390    | 365x657 | 365x514 | -22 %  |

Bei 390 Pixeln begrenzt das Fenster die Breite, deshalb schrumpft dort nur die
Höhe. Kein Querlauf bei keiner der drei Breiten. Konsole bei einem vollen
Seitenaufruf gegen ein antwortendes Backend: leer.

### Live abgenommen am 20.08.2026

Gerät auf `854add85`, 0 von 15 laufenden Containern ungesund. Mit Playwright
gegen `https://arasul.tail746d9b.ts.net`:

| Schritt                                       | Konsole | Ergebnis                |
| --------------------------------------------- | ------- | ----------------------- |
| Anmeldeseite laden                            | leer    | keine Antwort mit 4xx   |
| Anmelden als `pruefer`                        | leer    | landet auf `/workspace` |
| Neu laden                                     | leer    | bleibt angemeldet       |
| `arasul_token` löschen, nur Cookie, neu laden | leer    | **bleibt angemeldet**   |

Die letzte Zeile ist der Punkt, an dem die ersten beiden Entwürfe gescheitert
wären. Dazu am Server geprüft: `/api/auth/session` ohne Sitzung antwortet mit
`200 {"authenticated":false,"user":null}`, mit reinem Cookie und ohne
`Authorization`-Kopf mit `200 {"authenticated":true,…}`, und `/api/auth/me`
antwortet ohne Sitzung unverändert mit 401.

Nebenbei gesehen, ohne Folge: der Server liefert `id` als Zeichenkette
(`"17"`), die Schnittstelle im Frontend sagt `number`. Das Feld wird im
Frontend an keiner Stelle benutzt, deshalb hier nur vermerkt.

**F-20 in `CreateAdmin` nachgezogen:** „Legen Sie Ihr Administrator-Konto an"
ist zur Du-Form geworden, und aus „dieser Box" ist „dieses Geräts" geworden.
Offen bleibt der `SetupWizard` (C4).

**`PLATFORM_DESCRIPTION` steht auf dem Erst-Start absichtlich nicht mehr.** Die
Anmeldung heißt „Arasul", dort erklärt die Zeile darunter, was das ist. Der
Erst-Start heißt „Willkommen bei Arasul", dort ist die Marke schon im Titel,
und die Zeile darunter muss sagen, was zu tun ist. Eine dritte Zeile mit dem
Untertitel der Marke wäre dieselbe Doppelung, die C2 aus den Einstellungen
entfernt hat. Auf der Anmeldung bleibt sie und wird weiter aus der Umgebung
gespeist.

## Was C3 nebenbei gefunden hat: der Erst-Start hing

Der PR-Review hat angemerkt, dass `CreateAdmin` überhaupt keine Testdatei hat.
Das stimmte, und beim Schreiben der ersten fiel ein Fehler auf, den niemand
gesucht hatte.

**Jede fehlgeschlagene Formularprüfung ließ die Seite hängen.**
`@hookform/resolvers@3.10` prüft `Array.isArray(fehler.errors)`, um eine
`ZodError` zu erkennen. `zod@4` hat diesen Alias entfernt, es gibt nur noch
`issues`. Am Objekt belegt:

```
zod 4.3.6
issues ist Array: true
errors ist Array: false
errors ist: undefined
```

Der Resolver warf die `ZodError` also weiter, statt sie in `formState.errors`
zu schreiben. `handleSubmit` blieb hängen, `isSubmitting` blieb wahr, und der
Knopf stand für immer auf „Konto wird angelegt …", ohne Meldung. Ein Kunde mit
einem sechsstelligen Passwort kam auf dem ersten Bildschirm des Geräts nicht
weiter und hätte neu laden müssen.

**Und selbst danach wäre nichts zu sehen gewesen.** Angezeigt wurde nur
`errors.confirmPassword`. Ein zu kurzes Passwort und ein leerer Benutzername
schrieben ihre Meldung in `formState` und blieben unsichtbar.

Behoben durch `@hookform/resolvers` auf `^5.9.1` (dessen Peer-Bereich `zod`
`^3.25.0 || ^4.0.0` einschließt) und durch die fehlenden Fehlerzeilen samt
`aria-invalid` an allen drei Feldern.

Die Anmeldung trifft es nicht: ihre Prüfung kann nicht fehlschlagen, weil der
Knopf bis zur Eingabe beider Felder gesperrt ist und es keine weitere Regel
gibt. Es sind die einzigen zwei Formulare im Frontend mit `zodResolver`.

**Warum das keine Suche gefunden hat.** Der Testlauf war grün, der Wächter war
grün, die CI war grün. Der Bildschirm hatte keinen einzigen Test, und ein
Formular, das nie einen Fehler zeigt, sieht von außen aus wie eines, das keine
Fehler hat. Gefunden hat es die Frage des Reviews, wo die Tests für die zweite
angefasste Datei sind.

## C4 Erst-Start neu

Drei Schritte, aber der blaue Punkt in der Mitte sagt nichts. Der Fortschritt
wird lesbar: welcher Schritt, was passiert, was danach kommt. Kein generischer
Aufbau.

**Abnahme:** Die drei Schritte sind ohne Vorwissen verständlich, jeder Schritt
nennt sein Ergebnis.

**Erledigt am 20.08.2026** (#431).

**Zuerst ein Etikettenfehler in diesem Plan.** C4 meint nicht `SetupWizard.tsx`.
Der hat sechs Schritte mit Titel und Beschreibung. Gemeint ist
`features/workspace/OnboardingWizard.tsx`, eine Überlagerung über dem
Arbeitsbereich mit genau drei Schritten und drei Punkten darunter; das Bild
`screens/B02-erststart-1.png` zeigt sie. Die Ausnahme für `SetupWizard.tsx` in
`scripts/test/bausteine.py` trug bis heute die Begründung „Plan 023 C4 baut ihn
neu". Das stimmte nie.

Geändert wurde dreierlei:

1. **Der Fortschritt steht als Text da.** „Schritt 2 von 3" und „Als Nächstes:
   Claude einmal anmelden (optional)". Die Punkte bleiben als Bild und sind für
   Vorlesegeräte unsichtbar, weil sie dasselbe noch einmal sagen.
2. **Jeder Schritt nennt sein Ergebnis.** Vorher stand dort, was Arasul kann,
   nicht, was der Leser danach hat.
3. **Die Schritte zitierten Dinge, die nirgends so heißen.** `internal` war der
   rohe Aufzählungswert; auf dem Bildschirm steht „Intern (KI-Dienste +
   Datenbank)" (`ProjektUebersichtTab.tsx`, `NETZ_LABEL`). „Claude Code und
   Codex sind optionale Beschleuniger" nannte zwei Namen, die vorher nie
   eingeführt wurden. Jedes Zitat ist jetzt gegen die Oberfläche geprüft.

Dazu eine Reparatur, die keiner Abnahme entspringt: `aria-modal` behauptete
einen Fokus, den es nicht gab. Der Tabulator lief aus dem Dialog in den
Arbeitsbereich dahinter, und die Hintergrundfläche war als Knopf die erste
Station im Tabulatorlauf, so dass die erste Taste eines Tastaturnutzers den
Erst-Start wegklicken konnte.

Elf Tests, acht davon gehen gegen den Stand davor rot.

### Live abgenommen am 20.08.2026

Am Gerät gemessen, angemeldet als `pruefer` über `https://arasul.tail746d9b.ts.net`,
Stand `510ababc`, 15 Container, keiner ungesund.

| Abnahme | Ergebnis |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Der Erst-Start erscheint nach dem Löschen des Merkers | ja |
| Jeder Schritt nennt in Worten, der wievielte er ist | „SCHRITT 1 VON 3" bis „SCHRITT 3 VON 3" |
| Jeder Schritt nennt sein Ergebnis | drei Mal „Danach: …" |
| Jeder Schritt kündigt den nächsten mit Namen an | „Als Nächstes: Ein KI-Coder ohne Konto", „Als Nächstes: Claude einmal anmelden (optional)", „Das war der letzte Schritt." |
| Der Fokus liegt beim Öffnen im Dialog | ja, auf dem Dialog selbst |
| Das erste Shift+Tab bleibt im Dialog | ja, landet auf „Weiter" |
| „Zurück" von Schritt 2 auf 1 verliert den Fokus nicht | ja, Fokus bleibt im Dialog |
| Beschreibung enthält Fortschritt und Inhalt | „Schritt 1 von 3 | Arasul ist das Grundgerüst …" |
| Konsolenfehler | keine |

Drei der vier Fehler, die diese Abnahme prüft, hat kein Testlauf gefunden,
sondern die Review: das erste Shift+Tab, der Knopf „Zurück", der sich selbst
entfernt, während er den Fokus hält, und der Fortschritt, der für ein
Vorlesegerät gar nicht vorkam. Für jeden gibt es jetzt einen Test, und jeder
dieser Tests ist gegen den Stand davor rot.

### Was dabei sichtbar wurde und nicht zu C4 gehört

**Der `SetupWizard` ist der erste Bildschirm eines ausgelieferten Geräts, und
niemand hat ihn je angesehen.** Der Rundgang konnte ihn nicht sehen: er
erscheint nur, wenn `system_settings.setup_completed` falsch ist, und auf dem
Prüfgerät war die Einrichtung längst abgeschlossen. Nach einem Werksreset ist er
wieder falsch (`werksreset.js` setzt die Zeile auf die Spalten-Vorgaben,
`038_system_settings.sql:12` hat `DEFAULT FALSE`). Ein Kunde sieht also nach dem
Anlegen des ersten Kontos 1296 Zeilen ungeprüfte Oberfläche mit sechs Schritten.
Bekannt sind dort bereits F-20, F-23 und `SetupWizard.tsx:358`
(`user?.username || 'admin'` bei der Neuanmeldung nach dem Passwortwechsel, mit
verschlucktem Fehlschlag: der Standardname steht dort nicht auf dem Bildschirm,
aber im Code, und für jeden anderen Benutzernamen schlägt die Neuanmeldung
still fehl). Das ist eine eigene Aufgabe, keine Zeile in C4. Sie ist im
Steuer-Repo zum 15.09.2026 als Wiedervorlage eingetragen; dieses Repo hat kein
`company/`, der Pfad wäre hier nicht nachprüfbar.

**Die Hälfte der Dialoge im Produkt baut die Dialogmechanik selbst.** Gefunden
in der Review dieses PRs, gemessen am 20.08.2026: fünf Dateien tragen
`role="dialog"` von Hand (`TipTapEditor`, `ArgumentPicker`, `KiZugangDialog`,
`OnboardingWizard`, `QuickOpen`), fünf weitere benutzen den gemeinsamen
`components/ui/Modal.tsx`, der Radix umschließt und Fokusfalle, Fokusrückgabe
und Portal mitbringt. **Vier der fünf behaupten `aria-modal="true"`, und zwei
davon haben keine Tabulatorfalle:** `KiZugangDialog` und `QuickOpen` tragen
damit genau den Fehler, den C4 hier gerade in vier Anläufen von Hand behoben
hat. Das ist kein Einzelfall, sondern das Muster, das Phase C bei den Seiten
schon einmal aufgelöst hat: sechs Bausteine statt 39 handgeschriebener
Klassenketten. Bei Dialogen steht dieselbe Arbeit noch aus, und der Wächter
`scripts/test/bausteine.py` kennt die Regel seit dem 20.08.2026 (#433): ein
von Hand geschriebenes `role="dialog"` ist ein Befund, die fünf bestehenden
stehen mit Grund in den Ausnahmen. Ihre Migration auf `Modal` ist eine eigene
Aufgabe.

## C5 Systemstatus lesbar machen

Zu viele Farben, Kacheln mit Icons, die nichts beitragen, Kennzahlen in drei plus
eins statt vier je Zeile, Diagrammfarben Orange und Violett.

Neu: Kennzahlkacheln aus C1, vier je Zeile, ohne Icons, Diagramm ohne Karte, nur
Grau und Blau. Die beiden widersprüchlichen Speicherangaben, 25,5 von 61 GB im
Systemstatus gegen 15,5 von 32,0 GB bei den Modellen, werden auf eine Quelle
zurückgeführt und beschriftet.

**Abnahme, wie sie hier stand:** Vier Kacheln je Zeile bei jeder Fensterbreite.
Nur Blau und Grau im Diagramm. Eine einzige Speicherangabe im ganzen Produkt.
Behebt F-24, F-25.

### Erst gemessen, dann gebaut: zwei dieser drei Abnahmen waren falsch

Am 20.08.2026 am Gerät gemessen, angemeldet als `pruefer`, bei 1440, 1024 und
390 Pixel Breite.

**Die Hälfte war schon fertig.** C1 hat den sichtbaren Teil miterledigt: vier
Kacheln ohne Symbole, das Diagramm ohne eigene Karte. Gemessene SVG-Farben:
`rgb(69,173,255)`, `rgb(129,161,193)` und Grautöne. **Kein Orange, kein
Violett.** F-25 war beim Beginn von C5 bereits eingelöst.

**„Vier Kacheln je Zeile bei jeder Fensterbreite" ist falsch.** Gemessen: vier
Spalten bei 1440 und 1024, eine bei 390. Das ist richtig so. Vier Kacheln
nebeneinander auf einem Telefon sind 97 Pixel breit und unlesbar. Die Abnahme
lautet daher: vier je Zeile ab 1024 Pixel, darunter so viele, wie lesbar
bleiben, und kein waagerechter Überlauf. Gemessen: kein Überlauf bei keiner der
drei Breiten.

**„Eine einzige Speicherangabe im ganzen Produkt" ist ebenfalls falsch, und
zwar folgenreich.** Beide Zahlen stimmen und meinen Verschiedenes:

| Zahl  | Woher                                        | Was sie bedeutet                              |
| ----- | -------------------------------------------- | --------------------------------------------- |
| 61 GB | `os.totalmem()`                              | der ganze Arbeitsspeicher des Orin            |
| 32 GB | `RAM_LIMIT_LLM=32G` in der `.env` des Geräts | der Anteil, der für KI-Modelle reserviert ist |

Beides auf eine Zahl zusammenzuziehen würde eine wahre Angabe löschen. Der
Kunde braucht beide: wie voll ist das Gerät, und wie viel vom Modellbudget ist
belegt. Der Fehler war nie die Zweizahligkeit, sondern dass **keine der beiden
sagte, worauf sie sich bezieht.** Die Statusleiste beschriftete ihre schon
richtig mit „KI-RAM", die Kachel im Systemstatus sagte nur „Arbeitsspeicher".

Gebaut wurde deshalb: die Kachel sagt „24,5 von 61 GB im ganzen Gerät" und
darunter „Davon 32 GB für KI-Modelle reserviert". Damit erklärt der eine
Bildschirm den anderen. Die Zahl kommt aus demselben Abfrageschlüssel
(`MEMORY_BUDGET_QUERY_KEY`), den die Statusleiste benutzt: ein Cache-Eintrag,
keine zweite Abfragelast auf dem Jetson, und keine zweite Quelle, die
auseinanderlaufen kann.

### Was die Messung gefunden hat und kein Befund nannte

**Die Temperatur wurde auf der Prozentachse gezeichnet.** Das Diagramm hatte
eine Y-Achse mit `yDomain={[0, 100]}` und `formatY` in Prozent, und die dritte
Reihe war die Temperatur in Grad Celsius. 52 Grad landeten damit auf der Linie,
an der „50%" steht. Wer die Seite ansah, sah eine halbvolle Maschine, wo eine
kühle stand, und die Kurve konnte sich nie bewegen, weil ein Jetson zwischen
40 und 85 Grad läuft und das auf einer Nullbisshundert-Skala eine fast gerade
Linie ist. Ausgerechnet die Kurve, die Gate G7 belegen soll, sieben Tage
unbeaufsichtigt, war die unbrauchbarste.

Der Baustein `Chart` aus C1 kann jetzt eine zweite Achse rechts. Eine Reihe
trägt dafür `achse: 'rechts'`. Das ist die Regel aus Phase C angewandt: nicht
ein zweites Diagramm danebenbauen, sondern den gemeinsamen Baustein die zweite
Einheit lernen lassen.

**Der erste Anlauf hat den Fehler nur umbenannt.** Die zweite Achse bekam
wieder die Spanne 0 bis 100, diesmal in Grad. Die Einheit stimmte damit, die
flache Linie blieb. Aufgefallen ist es in der Review, nicht mir. Danach am
Gerät gemessen, 20006 Werte aus sieben Tagen:

|                                     | Wert                     |
| ----------------------------------- | ------------------------ |
| Tiefster gemessener Wert            | 45,8 °C                  |
| Höchster                            | 72,5 °C                  |
| Mittel                              | 50,4 °C                  |
| Anteil an einer Achse von 0 bis 100 | 27 %, im Alltag rund 6 % |

Die Achse läuft jetzt von 40 bis 100 Grad. Die Untergrenze ist fest: eine
Achse, die sich den Daten anpasst, macht aus zwei Grad Schwankung ein Gebirge,
und die Frage an dieses Diagramm lautet, ob das Gerät ruhig läuft. Die
Obergrenze steht im Normalfall ebenfalls fest bei 100 und hält damit die
Alarmschwellen des Produkts im Bild (Warnung 80, kritisch 95).

**Sie wächst aber mit, sobald ein Messwert darüber liegt.** Auch das kam aus
der Review und ist wichtiger, als es aussieht: eine feste Decke schneidet genau
den Ausreißer ab, wegen dem man hinsieht. Ein Gerät, das fünf Jahre
unbeaufsichtigt laufen soll, fällt irgendwann in diesen Fall, und dann darf die
Kurve nicht am oberen Rand verschwinden. Zwei Tests halten beide Enden: die
Grenzen gegen die gemessenen Werte, und dass 104 Grad nicht abgeschnitten
werden, während die Achse im Alltag stehen bleibt.

**Nebenbei erklärt sich F-04.** „0.0 / 32.0 GB belegt · frei 30.0 GB" ist kein
Rechenfehler: `availableMb` zieht zusätzlich `safetyBufferMb` ab, hier 2 GB.
Der Puffer hat nur keinen Namen auf dem Bildschirm. Gehört zu F-04, nicht
hierher.

### Und ein eigener Fehler, den die Review gefunden hat

Der erste Entwurf holte den Abfrageschlüssel mit
`import { MEMORY_BUDGET_QUERY_KEY } from '@/features/workspace/StatusBar'`.
`apps/dashboard-frontend/CLAUDE.md` verbietet das wörtlich: „A component in
`features/X/` must not be imported from `features/Y/`". Ausgerechnet in einem
Schritt, dessen Zweck es ist, zwei Quellen auf eine zurückzuführen.

Richtig aufgelöst nach der Platzierungsregel desselben Dokuments: der Hook
liegt jetzt in `hooks/useMemoryBudget.ts`. Vier Verbraucher, eine Stelle:
Statusleiste, Modellraster, Modell-Detailseite und die Speicherkachel. Der
vierte, `ModelFitBanner` in `StoreDetailPage`, ist beim ersten Anlauf
übersehen worden und in der Review aufgefallen; er fragt einmal und ohne Takt,
weil er nur anzeigt, ob ein Modell ins Budget passt.

**Beim Zählen dabei aufgefallen:** zehn weitere Stellen importieren quer durch
Bereiche, alle aus `workspace/` heraus in `flows/`, `store/`, `sandbox/` und
`settings/`. Das ist nicht dasselbe wie der Fehler oben: `workspace` ist die
Hülle, die die anderen Bereiche einbettet, und eine Hülle darf ihren Inhalt
kennen. Ob die Regel deshalb eine Ausnahme für die Hülle braucht oder ob die
zehn Stellen umziehen müssen, ist eine Entscheidung, keine Aufräumarbeit, und
gehört nicht in C5.

**Abnahme, neu gefasst:** Vier Kacheln je Zeile ab 1024 Pixel, kein waagerechter
Überlauf bei 1440, 1024 und 390. Nur Blau und Grau im Diagramm. Jede
Speicherangabe sagt, worauf sie sich bezieht, und die Kachel im Systemstatus
nennt den KI-Anteil aus derselben Quelle wie die Statusleiste. Die Temperatur
steht auf einer Achse in Grad Celsius. Behebt F-24, F-25.

### Live abgenommen am 20.08.2026

Am Gerät gemessen, Stand `12f1105e`, angemeldet als `pruefer`, bei drei Breiten.

| Abnahme               | 1440                                                          | 1024      | 390       |
| --------------------- | ------------------------------------------------------------- | --------- | --------- |
| Kacheln je Zeile      | 4                                                             | 4         | 1         |
| Waagerechter Überlauf | nein                                                          | nein      | nein      |
| Linienfarben          | nur `rgb(69,173,255)`, `rgb(129,161,193)`, `rgb(194,194,194)` | dieselben | dieselben |

Auf dem Bildschirm steht jetzt „6,0 von 61 GB im ganzen Gerät" und darunter
„Davon 32 GB für KI-Modelle reserviert". Die Statusleiste zeigt weiter „KI-RAM
15,5/32,0 GB", und die beiden Zahlen widersprechen sich nicht mehr, sondern
erklären einander.

Das Diagramm hat zwei Achsen: links 0 %, 25 %, 50 %, 75 %, 100 %, rechts 40 °C,
55 °C, 70 °C, 85 °C, 100 °C. Die Temperaturkurve liegt bei 47 bis 51 Grad
unten im Bild, wo sie hingehört, statt auf der Linie mit der Aufschrift „50%".

**Vier Anläufe für eine Kurve.** Der erste hat die Einheit gerichtet und die
Spanne behalten, der zweite die Spanne gerichtet und die Decke festgenagelt,
der dritte die Decke wachsen lassen und `NaN` übersehen. Jeden davon hat die
Review gefunden, keinen ein Test. Das ist derselbe Verlauf wie bei C4, und beide
Male ging es um dieselbe Sorte Fehler: eine Anzeige, die plausibel aussieht und
etwas Falsches sagt.

## C6 Kleinkram in den Einstellungen

- F-19: „Platform Version 1.0.0" bei null geschlossenen Gates. Versionsnummer
  sagt künftig die Reife, nicht eine runde Zahl.
- F-22: Die Oberfläche verweist auf `scripts/security/reset-password.sh`, einen
  Pfad, den der Kunde nicht hat. Ersetzen durch den Weg, den er hat.
- F-26: Der Fernzugriff-Assistent zeigt Schritt 5 „Fertig" als offen, obwohl die
  Verbindung steht.
- F-41: „Ungespeicherte Änderungen" wird nur von den KI-Einstellungen gemeldet,
  die Passwortverwaltung hält Formularinhalt und meldet ihn nicht.

### Was jeder der vier wirklich war

**F-19 saß an siebzehn Stellen, nicht an einer.** Dieselbe Frage wurde
fünfzehnmal im Backend beantwortet und zweimal als Rückfall im Frontend, und
nicht einmal einheitlich: dreizehnmal mit `process.env.SYSTEM_VERSION ||
'1.0.0'`, zweimal mit `|| 'unknown'` in derselben Datenbankspalte
`update_events.version_from`. Jede der ersten behauptet eine fertige 1.0.0,
während von sieben Verkaufs-Gates keines geschlossen ist. Sechs der Stellen
sind mir beim ersten Anlauf durchgerutscht, darunter die in `checkForUpdates`,
also ausgerechnet die, mit der ich begründet habe, warum es zwei Werte braucht.
Gefunden hat es die Review. Neu: `utils/version.js` mit **zwei** Werten, weil zwei Dinge
gebraucht werden und sie nicht dasselbe sind. `versionFuerAnzeige()` sagt ohne
gesetzte Variable „Vorserie", also die Wahrheit über die Reife.
`versionFuerVergleich()` bleibt bei `1.0.0`, weil
`updateService.checkForUpdates` diesen Wert mit der angebotenen Fassung
vergleicht; ein Wechsel auf `0.0.0` würde auf jedem Gerät ohne gesetzte Version
plötzlich jede Fassung als neuer gelten lassen. Das ist eine Änderung am
Aktualisierungsverhalten und gehört zu Ziel J3, nicht in einen Schritt über
Beschriftungen. Die Statusleiste hat dabei ihr fest davorgeschriebenes „v"
verloren, sonst stünde dort „vVorserie".

**Und die Reparatur wäre unsichtbar geblieben.** Der Rückfall auf „Vorserie"
greift nur, wenn `SYSTEM_VERSION` gar nicht gesetzt ist. Auf einem echten Gerät
ist sie gesetzt: `.env.example`, `.env.template`, `interactive_setup.sh` und
`preconfigure.sh` schreiben alle vier `SYSTEM_VERSION=1.0.0` in die `.env`, und
am 20.08.2026 auf dem Orin nachgesehen steht die Zeile genau so drin. Der
gesamte Umbau hätte also nur im Testlauf gewirkt. Gefunden hat es die Review,
nachgeprüft habe ich es am Gerät.

Die vier Vorlagen setzen die Variable jetzt nicht mehr, sondern zeigen sie
auskommentiert. Dazu zwei Folgeänderungen, ohne die das nicht funktioniert:
`compose.app.yaml` liest sie als `${SYSTEM_VERSION:-}`, sonst warnt Docker bei
jedem Start, und `validate-config.sh` verlangt sie nicht mehr als Pflichtfeld,
sonst zwingt die Prüfung das Setup, eine Zahl zu erfinden.

**F-22 war kein falscher Pfad, sondern ein Satz ohne Ort.** Das Skript
`scripts/security/reset-password.sh` gibt es, und es wird mit ausgeliefert. Auf
dem Bildschirm stand aber nur der nackte Pfad, ohne zu sagen, auf welchem
Rechner und in welchem Ordner, und ohne den Benutzernamen, der seit C3 nicht
mehr `admin` heißen muss. Neu steht dort der ganze Weg: über SSH oder Tastatur
ans Gerät, in den Installationsordner, `./scripts/security/reset-password.sh
dein-benutzername`. Dazu, warum es kein Zurücksetzen per Mail gibt: dafür
bräuchte das Gerät einen Weg nach draußen.

**F-26 war eine Regel, die einen Schritt zu früh aufhörte.** Der Haken kam aus
`n < currentStep`. Der letzte Schritt heißt „Fertig" und ist kein Schritt, den
man noch vor sich hat, sondern der Zustand danach; also blieb er ewig offen,
während vier Haken davor standen und die Verbindung lief. Der Assistent
widersprach dem, was einen Absatz weiter unten auf demselben Bildschirm zu
lesen war. Neu als eigene Funktion `istErledigt`, damit die Regel prüfbar ist,
und die Ziffernkreise bekommen für Vorlesegeräte einen Zusatz („erledigt",
„dieser Schritt ist dran", „offen"), den sie vorher gar nicht hatten.

**F-41 war ein durchgereichter Melder, der eine Stelle ausließ.** Der Mechanismus
existierte (`onDirtyChange`), nur der Sicherheitsbereich hing nicht daran. Jetzt
meldet die Passwortverwaltung beides zusammen: ein halb ausgefülltes
MinIO-Formular ist auch dann ungespeichert, wenn gerade der Dashboard-Reiter
offen ist. Und sie meldet sich beim Verlassen wieder ab, sonst bliebe die
Meldung in der Kopfzeile stehen, nachdem der Bereich weg ist.

**Abnahme:** Alle vier live am Gerät nachgeprüft.

### Live abgenommen am 20.08.2026

Stand `0beb6897`, angemeldet als `pruefer`, alle Container gesund.

| Abnahme                                             | Ergebnis                                       |
| --------------------------------------------------- | ---------------------------------------------- |
| `GET /api/_meta` nennt die Version                  | `"version":"Vorserie"`                         |
| Einstellungen, Allgemein enthält noch „1.0.0"       | nein                                           |
| Irgendwo steht „vVorserie"                          | nein                                           |
| Sicherheit nennt den ganzen Weg zum Zurücksetzen    | ja, mit SSH, Ordner und Benutzernamen          |
| „Ungespeicherte Änderungen" vor der Eingabe         | nein                                           |
| dieselbe Meldung nach einem Zeichen im Passwortfeld | ja                                             |
| Fernzugriff, Schritt 5                              | „Fertig, erledigt", alle fünf Kreise mit Haken |

**Ein Handgriff am Gerät war nötig und ist Teil des Befunds.** Die `.env` auf
dem Orin enthielt `SYSTEM_VERSION=1.0.0`, weil die Vorlagen sie so geschrieben
hatten. Der Deploy fasst die `.env` nicht an, also musste die Zeile dort von
Hand auskommentiert und das Backend neu gestartet werden. Auf einem Gerät, das
nach diesem Stand eingerichtet wird, passiert das nicht mehr. Auf jedem Gerät,
das vorher eingerichtet wurde, muss die Zeile weg, sonst behauptet es weiter
1.0.0.

## Dazwischengekommen: das Gerät überlebt seinen ersten Neustart

Das hier stand in keinem Plan. Es kam heraus, als der Prüfstand für C7 auf
Werkszustand gefahren wurde, und es ist schwerer als alles andere in Phase C.

### Was gemessen wurde

Ein fabrikneues Gerät, aufgebaut aus diesem Stand. Der Kunde legt sein Konto an,
`POST /auth/setup` antwortet 201, alles sieht richtig aus. Dann ein Neustart des
Backends, sonst nichts. Danach:

| Probe                   | vorher       | nach einem Neustart                        |
| ----------------------- | ------------ | ------------------------------------------ |
| Anmeldung des Kunden    | 201 angelegt | **401 Invalid username or password**       |
| `needsSetup`            | true         | **false**, also keine zweite Chance        |
| Konten in der Datenbank | `kunde`      | **`admin`**, angelegt aus `ADMIN_PASSWORD` |
| gleichnamige Tabellen   | 0            | **47** in `arasul` und `public`            |

Der Kunde ist aus seinem eigenen Gerät ausgesperrt, seine Daten liegen
unerreichbar in `public`, und offen ist es nur noch mit einem Passwort, das ab
Werk bekannt ist. Das ist kein Schönheitsfehler, das ist die Auslieferung.

### Warum

Der Docker-Init wendet alle 147 Migrationen an, trug ins Migrationsbuch aber nur
die sieben Zeilen ein, die einzelne Dateien selbst schreiben. Beim nächsten
Start las der Runner das Buch, hielt 140 Migrationen für offen und wendete sie
erneut an. Migration 090 legt das Schema `arasul` an, der Datenbanknutzer heißt
ebenfalls arasul, also löst `search_path` ab da zuerst dorthin auf: aus jedem
erneuten `CREATE TABLE IF NOT EXISTS` wurde eine zweite, leere Tabelle vor der
gefüllten. Migration 006 scheiterte danach, weil ihre Existenzprüfung
schemablind ist und ihr `CREATE INDEX` nicht, und mit ihr blieben 140
Migrationen ungelaufen.

Kein Testlauf konnte das sehen. Auf einer gewachsenen Datenbank entsteht die
Doppelung nicht, und die Prüfstand-Abnahme aus B5 prüft den Werksreset, nicht
den Erstlauf. Ein Test hielt sogar das falsche Verhalten fest: „continues to
admin user creation even if migrations fail".

### Was gebaut wurde

1. `services/postgres/init/zzz_migrationsbuch_fuellen.sh` läuft als letztes
   Init-Skript und trägt jede `.sql` als angewendet ein. Keine Heuristik,
   sondern eine Aussage: erreicht das Skript seine erste Zeile, ist jede
   Migration fehlerfrei durchgelaufen, sonst hätte `ON_ERROR_STOP` abgebrochen.
2. Ein zweiter, unabhängiger Riegel im Runner: existiert das Schema `arasul`,
   steht Migration 90 aber nicht im Buch, wird nachgetragen statt erneut
   angewendet. Das alte Merkmal `tracked > 5` taugte nicht, sieben ist größer
   als fünf.
3. `schattentabellen()` bricht den Lauf ab, sobald eine Tabelle in beiden
   Schemata liegt, und prüft davor wie danach.
4. `bootstrap.js` legt bei unbelegtem Schemastand **keinen** Administrator ab
   Werk an. Ein Gerät, das nicht startet, ist ein Ruf beim Support. Ein Gerät,
   das sich mit einem werksbekannten Passwort öffnen lässt, während der
   Besitzer ausgesperrt ist, ist etwas anderes.

Der erste Anlauf hat die eigene Abnahme nicht bestanden, und zwar an genau der
Stelle, die der Fund beschreibt: das Init-Skript baute `INSERT INTO public`
statt `INSERT INTO public.schema_migrations`. Das ist der Grund für Riegel 2.

**Abnahme:** `scripts/test/frischgeraet-abnahme.sh`. Prüfstand von Null, Buch
vollständig, keine verdeckten Tabellen, Kunde legt sein Konto an, **Neustart**,
und danach dieselben Proben noch einmal, mit der Anmeldung als letzter.

---

## C7 Der Einrichtungsassistent, zum ersten Mal angesehen

Der `SetupWizard` ist der **erste Bildschirm eines ausgelieferten Geräts**, 1296
Zeilen, sechs Schritte, und bis zum 20.08.2026 hat nie jemand hingesehen. Der
Rundgang konnte ihn nicht sehen: er erscheint nur, wenn
`system_settings.setup_completed` falsch ist, und auf dem Prüfgerät war die
Einrichtung längst abgeschlossen. Nach `werksreset --stufe auslieferung` steht
er wieder an.

### Was das Codelesen am 20.08. schon gefunden hat

**Schritt 3 verlangt zwingend einen Passwortwechsel, den es nicht braucht.**
Die Auslieferung läuft immer über `CreateAdmin`: `werksreset` leert
`admin_users` und entwertet `ADMIN_PASSWORD` in der `.env`, bevor es irgendetwas
löscht (`werksreset.js`, Abschnitt „ZUERST, vor jedem Loeschen"), also legt
`bootstrap.js` keinen Zugang mehr an und `/auth/needs-setup` schickt den Kunden
auf `CreateAdmin`. Dort setzt er sein Passwort selbst. Zwei Bildschirme später
zwingt ihn der Assistent, dasselbe Passwort zu ändern, und weiter geht es nicht:
`canAdvance()` gibt bei Schritt 3 `false` zurück, solange `passwordChanged`
falsch ist. Der Schritt stammt aus einer Zeit, in der das Gerät mit einem
Standardpasswort kam.

**Und er kann die Sitzung still zerstören.** `SetupWizard.tsx:358` meldet sich
nach dem Wechsel mit `user?.username || 'admin'` neu an, weil das Backend alle
Token nach einer Passwortänderung entwertet. Schlägt die Neuanmeldung fehl,
schluckt der `catch` sie und der Assistent geht weiter. Jede folgende Anfrage
läuft dann gegen einen entwerteten Token.

**Jeder Wert wird mit `showError: false` geschrieben, jeder Fehlschlag
verschluckt.** `saveStepProgress` fängt ab und tut nichts („Non-critical,
silently ignore"), `/models/default` hängt ein `.catch(() => {})` an,
`setup-skip` ruft `onSkip()` auch dann, wenn der Aufruf scheitert. Wenn nichts
gespeichert wird, sieht der Kunde trotzdem Erfolg. Das ist dieselbe Bauart wie
R25, die Löschung nach Art. 17, die Erfolg meldet, ohne zu löschen.

**Dazu die bekannten F-20 und F-23:** Siezen mitten im geduzten Produkt
(„Ihr Edge-AI-System ist bereit für die Einrichtung. Dieser Assistent führt Sie
durch …") und handgeschriebene Klassenketten (`text-[1.75rem]`,
`text-[0.7rem]`, `max-w-180`, `bg-primary text-white` statt eines Tokens).

### Was zu tun ist

1. **Erst ansehen, dann bauen.** Am Prüfstand, nicht am Arbeitsgerät:
   `scripts/test/pruefstand.sh hoch`, dort den Werksreset auf
   „Auslieferungszustand" fahren und die sechs Schritte durchgehen. Was dabei
   auffällt, kommt hierher, bevor eine Zeile geändert wird.
2. **Kurz, minimalistisch, präzise.** Kolja hat das am 20.08. so entschieden.
   Kein Schritt, der nur bestätigt, was der vorige getan hat.
3. Der Passwortschritt entfällt auf dem Auslieferungsweg.
4. Kein verschluckter Fehlschlag mehr: was nicht gespeichert wurde, sagt der
   Assistent.
5. Auf den Bausteinen aus C1 und C3 aufbauen, damit die Ausnahme in
   `scripts/test/bausteine.py` ersatzlos entfallen kann.

**Abnahme:** Am Prüfstand nach einem Werksreset auf „Auslieferungszustand" von
der leeren Box bis zum Arbeitsbereich durchgelaufen, ohne Handgriff daneben.
Kein Schritt verlangt etwas, das schon erledigt ist. Jeder Fehlschlag beim
Speichern erscheint auf dem Bildschirm. Die Ausnahme in `bausteine.py` ist weg.
Behebt F-20 und F-23 dort, und `SetupWizard.tsx:358`.

### Was der Rundgang am 20.08.2026 gezeigt hat

Durchgelaufen am Prüfstand nach einem Werksreset auf „Auslieferungszustand",
mit Playwright, sechs Bilder. Vier Befunde, die das Codelesen nicht hatte:

1. **Schritt 3 war eine Sackgasse, live gemessen.** `Weiter` blieb gesperrt,
   der einzige Weg weiter war „Überspringen", und das überspringt den ganzen
   Assistenten samt Modellwahl. Der Text sprach vom „Standard-Passwort", das
   es nach einem Werksreset nicht gibt.
2. **`PUT /system/setup-step` antwortete 400.** Die Oberfläche zählt 1 bis 6,
   der Vertrag in `schemas/system.js` erlaubt 0 bis 5. Der letzte Schritt wurde
   nie vermerkt, und der Fehlschlag wurde verschluckt.
3. **Die Zusammenfassung zeigte eine Adresse, die niemand erreichen kann.**
   „IP-Adresse 172.31.0.69" ist die Adresse des Containers. `/system/network`
   liest `os.networkInterfaces()` im Container. Am Arbeitsgerät gegengeprüft:
   dort stehen 172.30.x.x, während das Gerät unter 192.168.0.197 erreichbar
   ist. Einziger Verbraucher dieser Angabe war der Assistent.
4. **Die Modellliste zeigte zuerst das Falsche.** Vier Kategorieüberschriften,
   und das empfohlene Modell stand so weit unten, dass es im Fenster nicht
   sichtbar war.

### Was daraus wurde

Sechs Schritte werden zwei: das Unternehmen, dann das Modell. Der Passwort-,
der Netzwerk- und der Zusammenfassungsschritt entfallen. Aus dem Netzwerkschritt
bleibt ein Satz in Schritt 2, weil ohne Internet kein Modell lädt; die falsche
Adresse verschwindet ersatzlos. Der Rahmen ist `AuthCard`, derselbe wie in
`CreateAdmin` und `Login`: die drei Bildschirme gehören zusammen. Damit fällt
die handgebaute Kopfzeile weg und mit ihr der Eintrag in `bausteine.py`.

Die drei Kachelraster liefen vorher als drei fast gleiche Klassenketten
untereinander. Jetzt ein Baustein, drei Aufrufer.

**Erledigt am 20.08.2026.** 1296 Zeilen werden 549. Zwölf Tests, die es vorher
nicht gab, darunter je einer für die Sackgasse, die verschluckten Fehlschläge
und die Container-Adresse.

### Was die Live-Abnahme danach noch fand

Der neue Assistent lief am Prüfstand von der leeren Box bis in den
Arbeitsbereich durch, ohne Handgriff daneben, ohne HTTP-Fehler, ohne Meldung in
der Konsole. Und Schritt 2 zeigte **gar kein Modell**.

`GET /models/recommended` empfiehlt auf dem Orin `gemma4:26b-q4`. Im Katalog
trägt dieses Modell den Typ `vision`, weil Gemma 4 Bilder lesen kann. Der
Assistent filterte auf `model_type === 'llm'` und warf damit seine eigene
Empfehlung aus der Liste.

**Der Fehler ist älter als der Umbau.** Im alten Assistenten war er nur
unsichtbar: die Liste zeigte zwölf andere Modelle, und dass die Auswahl auf
etwas zeigte, das nicht darin stand, sah man nur an einer Stelle. Auf dem
Zusammenfassungs-Bildschirm stand `gemma4:26b-q4` als rohe Kennung statt eines
Namens, weil `models.find(...)` nichts fand. Dieselbe Suche entscheidet, ob der
Download startet. **Auf diesem Gerät hat die Ersteinrichtung noch nie ein
Modell heruntergeladen.**

Behoben: ausgeschlossen sind nur noch Einbettungs- und Texterkennungsmodelle,
und die Auswahl fällt auf den ersten Eintrag zurück, wenn die Empfehlung nicht
im Katalog steht. Vier weitere Tests, gegengeprüft rot: mit dem alten Filter
fallen sieben von sechzehn.

---

# Phase D, Modelle

Geschätzt 20 Stunden. Zahlt auf G2 und G3.

## D1 Ein Namensregister

Heute steht im Katalog ein Name, im Chat ein anderer, in der Statusleiste ein
dritter, teilweise der rohe Dateiname aus Ollama. Künftig gibt es genau eine
Quelle für Anzeigenamen. `utils/modelDisplay.ts` wird diese Quelle, alle anderen
Stellen lesen daraus.

**Abnahme:** Derselbe Name im Katalog, im Chat, in der Statusleiste unten links,
in der Modellauswahl und in jeder Meldung. Ein Test hält das fest.

### Erst gemessen: was davon stimmte

Rundgang am Gerät am 20.08.2026, angemeldet als `pruefer`, alle vier Orte in
einem Durchlauf:

| Ort                      | zeigte                           |
| ------------------------ | -------------------------------- |
| Katalog                  | `Gemma 4 Kompakt`, `Qwen3.8 27B` |
| Statusleiste unten links | `Qwen3.8 27B · bereit`           |
| Auswahlliste im Chat     | `Gemma 4 Kompakt`, `Qwen3.8 27B` |
| **Modellknopf im Chat**  | **`Gemma`**, **`Qwen3.8`**       |

Drei von vier stimmten überein. Der vierte kürzte auf das erste Wort, mit
`?.name?.split(/[\s:]/)[0]`, drei Zeilen über der Liste, die den vollen Namen
zeigt. Die Behauptung „im Katalog ein Name, im Chat ein anderer, in der
Statusleiste ein dritter" war also zu breit; **eine** Stelle wich ab, und die
richtig.

Im Code dazu, was der Rundgang nicht sehen konnte:

- `modelName || modelId` im Download- und im Aktivierungs-Kontext. Ohne
  mitgegebenen Namen stand `hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS` im
  Fortschrittsband.
- Der Einrichtungsassistent trug die Chatmodell-Regel ein drittes Mal selbst,
  neben Statusleiste und Chat. Genau daraus entstand der Fund aus C7.
- Die Ableitung machte aus `gemma4:e4b` ein `Gemma4 4B`. E4B heißt vier
  _wirksame_ Milliarden, nicht vier.
- Ein Katalogname brach das Muster aller anderen: `Qwen3.8 27B` neben
  `Qwen 3 32B` und `Gemma 3 1B`.

### Was daraus wurde

Das Register nimmt jetzt auch eine bloße Kennung, nicht nur ein Modellobjekt.
Vorher baute sich jeder Aufrufer, der nur die Kennung hatte, sein eigenes
`{ id, name }` zusammen, und genau solche Zwischenschritte sind der Weg, auf dem
die Anzeige auseinanderläuft. Daraus lesen jetzt: Katalog, Detailseite,
Statusleiste, Chat-Knopf, Auswahlliste, Assistent, beide Kontexte, und die Suche
im Katalog, denn gesucht werden soll in dem Namen, den man sieht.

Der Assistent filtert über `istChatModell` statt über eine eigene Liste.
Migration 147 setzt `Qwen 3.8 27B`.

**Nicht gemacht:** die Namen `Gemma 4 Kompakt`, `Standard` und `Pro` durch
Parameterzahlen ersetzt. Der Plan nannte „Familie und Parameterzahl" als Muster,
aber diese drei Namen sind eine bewusste Produktstaffel, und für einen
Mittelständler sagt `Kompakt` mehr als `E4B`. Die Parameterzahl gehört in den
Steckbrief in D2, nicht in den Namen.

**Erledigt am 20.08.2026,** `arasul-jet` #444. Gehalten von
`scripts/test/modellnamen.py` mit fünf Fällen im Wächter-Selbsttest, und von
einem Test, der Katalog, Statusleiste und Chat-Knopf mit demselben Modell
rendert und dieselbe Zeichenkette verlangt. Gegenprobe gemacht: mit der alten
Kürzung fällt er um.

## D2 Modell-Detailansicht

Ein Klick auf ein Modell zeigt heute fast nichts. Künftig: wofür das Modell gut
ist, in zwei bis drei fachlichen Sätzen, Parameterzahl, Speicherbedarf,
Kontextlänge, gemessene Ausgabegeschwindigkeit auf diesem Gerät, Lizenz und ein
Link zur Modellkarte bei Hugging Face. Nichts Ausgedachtes, nur was belegbar ist.

**Abnahme:** Jedes Modell im Katalog hat alle Felder gefüllt, jeder Link führt
auf die richtige Modellkarte.

### Erst gemessen: woher die Angaben belegbar kommen

Ollamas `/api/show` liefert auf dem Orin Parametergröße, Quantisierung und
Kontextlänge für alle elf installierten Modelle, für zehn davon eine Lizenz.
Lokal, ohne Netz, aus den Gewichten selbst. Dabei kam heraus:

| Fund                                | gemessen am 20.08.2026                                           |
| ----------------------------------- | ---------------------------------------------------------------- |
| Der Katalog widerspricht dem Modell | `qwen3:14b-q8` behauptet 32768 Token, das Modell meldet 40960    |
| Neun Katalogeinträge                | haben gar keine Kontextlänge                                     |
| Ein Modellkarten-Link ist tot       | `paligemma-3b-mix` zeigt auf `ollama.com/library/paligemma`, 404 |
| Vier Einträge                       | tragen gar keinen Link, alle vier per Direkt-Pull entstanden     |
| `gemma4:e4b`                        | ist ein 8B-Modell, der Name „Gemma 4 Kompakt" sagt das nicht     |

Alle 19 hinterlegten Links wurden abgerufen, nicht überflogen.

Und die Beschreibungen selbst tragen Behauptungen, die die Messung nicht deckt:
`gemma3:4b` nennt „32K Kontext", das Modell meldet 131072. `qwen3-coder:30b`
nennt „~35 tok/s auf dem Orin", gemessen sind 6,6 über zwei Läufe. Zwei
Beschreibungen tragen außerdem einen Gedankenstrich als Trenner, den kein
Wächter sieht, weil `gedankenstriche.py` die SQL-Dateien nicht durchsucht. Das
gehört nicht in D2, es steht in D5 und in den Nacharbeiten.

### Was daraus wurde

`services/llm/modelProfile.js` liest den Steckbrief beim Modell-Abgleich nach.
Migration 148 legt `parameter_label`, `quantization`, `license` und
`profile_read_at` an. **Keine zweite Spalte für die Kontextlänge:**
`context_window` ist die Spalte dafür, und eine zweite danebenzustellen wäre
genau der Fehler, den D1 gerade beseitigt hat. Migration 149 setzt den toten
Link richtig und trägt drei fehlende nach; `paddleocr` und `tesseract` bekommen
bewusst keinen, sie sind keine Ollama-Modelle.

Die Geschwindigkeit kommt als Median aus `model_performance_metrics`, mit der
Zahl der Läufe daneben. Eine Geschwindigkeit aus zwei Läufen ist keine Aussage,
und der Leser soll das sehen können.

**Die Abnahme oben ist so nicht erfüllbar, und das aus einem guten Grund.** Elf
der 22 Modelle sind nicht installiert; ihre Parameterzahl und Lizenz stehen in
Gewichten, die nicht auf dem Gerät liegen. Sie anders zu beschaffen hieße, sie
aus einer Webseite abzuschreiben. Geliefert ist deshalb: alle Felder für jedes
installierte Modell, jeder gezeigte Link führt auf die richtige Karte, und wo
nichts steht, steht warum.

**Erledigt am 20.08.2026,** `arasul-jet` #445. Dreizehn Backend-Tests, fünf
Frontend-Tests.

## D3 Rückmeldung beim Laden und Entladen

Heute sagt der Kopfbereich „kein Modell geladen", während die Statusleiste
gleichzeitig ein bereites Modell nennt. Das Modell in der Statusleiste wechselte
im Rundgang ohne Nutzeraktion und ohne Hinweis.

Künftig: ein Zustand, überall gleich. Beim Herunterladen ein Fortschritt in
Prozent und Megabyte. Beim Laden in den Speicher und beim Entladen eine sichtbare
Rückmeldung. Wechselt das System das Modell selbst, steht dabei, warum.

**Abnahme:** Herunterladen, Laden, Entladen und automatischer Wechsel sind an
allen drei Anzeigeorten gleichzeitig sichtbar und stimmen überein. Behebt F-06,
F-13.

### Erst gemessen

Der Widerspruch entsteht nicht aus den Daten. Statusleiste und Modellraster
lesen dieselbe Antwort von `/models/memory-budget`; die Leiste unterscheidet
drei Zustände, das Raster nur zwei. Dieselbe KI-RAM-Zeile stand wortgleich in
beiden Dateien, mit zwei eigenen Kopien von `toGb` daneben.

| Fund                                  | gemessen                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bytes_completed`, `bytes_total`      | seit Migration 083 vorhanden, nie beschrieben. Ollama liefert die Werte in jeder Zeile des Pull-Stroms |
| `llm_model_switches`                  | 1024 Wechsel protokolliert, 877 automatische Entladungen, keine einzige angezeigt                      |
| `CatalogModel`                        | steht doppelt, in `types/index.ts` und im Hook, und lief bereits auseinander                           |
| Die dokumentierte Form des SSE-Stroms | falsch: `type`/`percent`/`downloaded_gb` gegen `progress`/`status`/`model_id`                          |

### Was daraus wurde

`utils/modellZustand.ts` ist die eine Herleitung für den Zustandssatz und die
KI-RAM-Zeile. Die Zahlen selbst ändert D4; wer die Einheiten anfasst, findet
sie ab jetzt an einer Stelle.

Die Übersetzung der Wechselgründe ist belegt, nicht geraten: die Kennungen
entstehen in `ollamaReadiness.unloadModelWithTracking` als
`auto_unload_adaptive_<phase>`, und die Phase entscheidet ausweislich
`modelLifecycleService` nur, wie lange ein Modell ungenutzt bleiben darf
(30/10/2 Minuten), nicht warum es geht.

**Der neue Test fand sofort einen eigenen Fehler:** die Wechselzeile zeigte
`Gemma 4` statt `Gemma 4 Kompakt`, weil `llm_model_switches` die Kennung trägt.
Genau der Namensbruch aus D1, in D3 neu entstanden.

**Und die Live-Abnahme von D2 fand einen weiteren:** dieselbe Lizenz stand an
sieben Modellen als „Apache License 2.0" und an dreien als „apache-2.0". Das
Kürzel hatte Vorrang vor dem Lizenztext. Migration 150.

**Erledigt am 21.08.2026,** `arasul-jet` #446.

### Was die Live-Abnahme danach fand: eine Lücke im eigenen Bau

Der Zustandssatz stimmt an beiden Orten, gemessen im genau strittigen Fall
(nichts im Speicher, ein Modell installiert): die Statusleiste sagt
„Qwen 3.8 27B, bereit", das Raster sagt „Qwen 3.8 27B, bereit, wird bei Bedarf
automatisch geladen". Vorher sagte das Raster „kein Modell geladen".

Der Wechselgrund ließ sich nicht abnehmen, ohne einen Wechsel auszulösen. Also
am Gerät `gemma3:1b` geladen. Das Protokoll sagt `keep_alive: 120s`, es war die
Ruhephase. Danach: `/api/ps` leer, **kein Eintrag in `llm_model_switches`,
keine Zeile im Protokoll.**

**Ollama hat das Modell selbst entladen, und Arasul hat davon nichts gemerkt.**
`checkAndUnload` schreibt nur eine Zeile, wenn es selbst entlädt; es überspringt
Modelle, deren `expires_at` noch in der Zukunft liegt, und danach ist das Modell
weg, bevor die Prüfung alle 30 Sekunden wieder greift. Da Arasul dieselbe Frist
an Ollama durchreicht, die es selbst als Schwelle benutzt, gewinnt Ollama immer.

Die 877 protokollierten Entladungen stammen also aus Pfaden, die Ollama eine
längere Frist mitgeben als die Automatik selbst ansetzt, zum Beispiel dem
Agentenpfad mit `AGENT_KEEP_ALIVE=30m`. Genau der Pfad, den D6 behandelt.

Das ist eine Lücke in D3s eigener Abnahme: „Wechselt das System das Modell
selbst, steht dabei, warum." Ollama ist das System. Nachgezogen in einem
eigenen Schritt.

## D4 Speicherzahlen stimmen

„0.0 von 32.0 GB belegt, frei 30.0 GB" ist arithmetisch falsch. Bei einer Kachel
steht in der Kopfzeile 261 MB und im Text derselben Kachel 274 MB, Ursache ist
die Verwechslung von MiB und MB.

**Abnahme:** Belegt plus frei ergibt den Gesamtwert. Eine Einheit im ganzen
Produkt. Behebt F-04, F-05.

### Erst gemessen, am 21.08.2026 am Gerät auf einem Bildschirm

| Ort                         | zeigt                                 |
| --------------------------- | ------------------------------------- |
| Kachel, Kopfzeile           | `261 MB`                              |
| Kachel, Text darunter       | `~274 MB`                             |
| Detailseite, Download-Größe | `261 MB`                              |
| KI-RAM                      | `0.0 / 32.0 GB belegt · frei 30.0 GB` |

274000000 Bytes sind 274 MB. Die 261 entstehen, weil `formatModelSize` durch
1024³ teilt und trotzdem „MB" darüberschreibt. Der Katalogtext nennt denselben
Wert richtig, weil er von Hand geschrieben ist.

Die KI-RAM-Zeile ist nicht falsch gerechnet, sie verschweigt einen Posten: das
Backend zieht `MODEL_MEMORY_SAFETY_BUFFER_MB` (Vorgabe 2048) vom Freiwert ab.
Belegt plus Reserve plus frei ergibt den Gesamtwert; die Reserve steht nirgends.

Es waren nicht drei Rechnungen, sondern **fünf**: `formatModelSize` und
`formatFileSize` in `utils/formatting.ts` (die zweite ohne jeden Aufrufer), je
eine eigene in `UpdatePage.tsx`, `SetupWizard.tsx` und `ProjectFileTab.tsx`.
Dazu die zwei Kopien von `toGb` für den KI-RAM, die D3 schon zusammengelegt hat.

### Zwei Zählweisen statt der einen, die die Abnahme verlangt

Das ist Absicht und der einzige Punkt, an dem D4 von seiner Abnahme abweicht.
Welche gilt, hängt daran, womit der Kunde die Zahl vergleicht:

- **Tausenderschritte** (`formatBytes`) für alles, was jemand anderes
  ausgedruckt hat: Modellgrößen aus dem Katalog, Downloads,
  Aktualisierungsdateien.
- **1024er-Schritte** (`formatBytesBinaer`, `zuGb`) für alles, was das
  Betriebssystem sagt: Platte, Arbeitsspeicher, Docker-Grenzwerte.

Eine wäre falsch. Mit Tausenderschritten hieße die Platte dieses Geräts 2,0 TB,
während `df -h` daneben 1,8T sagt, und `RAM_LIMIT_LLM=32G` wären 34,4 GB statt
der 32 vom Datenblatt.

**Erledigt am 21.08.2026,** `arasul-jet` #447. Gehalten von
`scripts/test/einheiten.py` mit fünf Fällen im Wächter-Selbsttest.

### Live abgenommen am 21.08.2026

| Ort                   | vorher                                | jetzt                                                  |
| --------------------- | ------------------------------------- | ------------------------------------------------------ |
| Kachel, Kopfzeile     | `261 MB`                              | `274 MB`                                               |
| Kachel, Text darunter | `~274 MB`                             | `~274 MB`                                              |
| KI-RAM                | `0.0 / 32.0 GB belegt · frei 30.0 GB` | `0,0 von 32,0 GB belegt, 2,0 GB Reserve, frei 30,0 GB` |

Null plus zwei plus dreißig ergibt zweiunddreißig.

Dabei ein eigener Fund aus D2: **der Modellkarten-Link stand zweimal auf der
Seite**, einmal im Steckbrief und dreißig Zeilen tiefer als Knopf. Ich hatte
den Steckbrief gebaut, ohne bis ans Ende der Datei zu sehen. Kein Test konnte
das melden, weil beide Stellen für sich richtig waren.

## D5 Katalog ausdünnen und Standard je Aufgabe

Der Katalog wird gegen die tatsächliche Verwendung geprüft. Jede Aufgabe bekommt
genau einen vorausgewählten Standard: Text, Coding, Sehen, Texterkennung aus Bild
und PDF, Einbettung. Was keiner Aufgabe zugeordnet ist und nicht messbar besser
ist als der jeweilige Standard, fliegt raus.

Texterkennung bleibt, weil sie gebraucht wird, auch wenn im Chat ein
Coding-Modell aktiv ist. Sie läuft dann als eigener Schritt, nicht als
Modellwechsel.

**Abnahme:** Der Katalog nennt je Aufgabe einen Standard. Ein Foto und eine PDF
werden im Chat mit aktivem Coding-Modell korrekt ausgelesen.

### Was auf dem Weg durch D1 bis D3 schon aufgefallen ist

Nicht abgearbeitet, hier notiert, damit es nicht verlorengeht:

- `gemma3:4b` nennt in der Beschreibung „32K Kontext". Das Modell meldet 131072.
- `qwen3-coder:30b` nennt „~35 tok/s auf dem Orin". Gemessen sind 6,6 über zwei
  Läufe. Eine Zahl in einer Beschreibung ist eine Behauptung, die niemand prüft.
- `paligemma-3b-mix` trägt als `ollama_name` `paligemma:3b-mix-448-q4_0`. Die
  Modellkarte dazu antwortet mit 404, der Eintrag ist vermutlich nicht ladbar.
- Zwei Beschreibungen tragen einen Gedankenstrich als Trenner. Der Wächter
  `gedankenstriche.py` durchsucht die SQL-Dateien nicht, sieht sie also nie,
  obwohl der Kunde sie auf jeder Kachel liest.
- Die beiden Platzhalter-Beschreibungen aus `importUnknownModels` („Auf diesem
  Gerät installiert, 4B. Nicht von Arasul geprüft.") stehen im Katalog neben
  gepflegten Texten.

### Und was die Messung am 21.08.2026 dazu ergab

| Fund                      | gemessen                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_platform_default`     | steht bei **drei** Modellen auf `true`, und **keine Zeile im Backend liest die Spalte**. Ein Feld namens „der Standard" mit drei Werten und ohne Leser                 |
| `paddleocr:latest`        | steht im Katalog, ist im Dokument-Indexer aber **nicht installiert** (`ModuleNotFoundError`). Tesseract 5.3.0 dagegen liegt dort                                       |
| Ausweichmodell fürs Sehen | `findVisionFallbackModel` findet auf diesem Gerät **genau ein** Modell, `gemma4:e4b-q4`. Ist das gerade das Chatmodell, schließt die Abfrage es aus und liefert nichts |
| `llava-phi3`              | trägt `model_type = 'vision'`, aber `supports_vision_input = false`. Es fällt damit aus der Ausweichsuche heraus, obwohl Ollama ihm die Fähigkeit `vision` bescheinigt |
| `speed_tier`              | vermischt Tempo (`fast`, `balanced`, `quality`) und Rolle (`vision`, `ocr`, `embed`) in einer Spalte. Genau diese Spalte müsste die Aufgabe tragen                     |
| `qwen3-coder:30b`         | trägt `speed_tier = 'fast'` und ist mit 6,6 Token/s das langsamste der drei gemessenen Modelle                                                                         |

Die Abnahme von D5 („Ein Foto und eine PDF werden im Chat mit aktivem
Coding-Modell korrekt ausgelesen") ist damit heute nicht erfüllbar: für das Foto
gibt es nur ein einziges Ausweichmodell, und das ist oft selbst das Chatmodell.

### Wo der Standard je Aufgabe heute wirklich steht

Nicht im Katalog. `utils/hardware.js` trägt eine fest verdrahtete Karte von
Gerätetyp auf Modell, mit den Rollen `model`, `fast_model`, `vision_model` und
`embedding_model`. Das ist genau die Struktur, die D5 verlangt, nur an der
falschen Stelle und ohne Abgleich mit dem Katalog. Gemessen:

**Acht von siebzehn Kennungen in dieser Karte gibt es im Katalog nicht:**
`bge-m3`, `gemma:2b`, `mistral:7b`, `phi3:mini`, `qwen3:32b-q8`, `qwen3:8b-q8`,
`qwen:0.5b`, `tinyllama:1.1b`.

Für ein Xavier NX oder einen Orin Nano empfiehlt die Karte damit `phi3:mini`,
ein Modell, das im Katalog nicht steht und also nicht geladen werden kann. Auf
einem 64-GB-Orin ist das empfohlene Einbettungsmodell `bge-m3`, ebenfalls nicht
im Katalog.

Bei `bge-m3` ist das kein Fehler, sondern eine Folge: Plan 021 Schritt 8 hat das
klassische Vektor-RAG durch agentisches ersetzt, `qdrant` und
`embedding-service` liegen seither im Compose-Profil `classic-rag` und laufen
nicht. Am Gerät bestätigt, beide Container fehlen in `docker ps`. Die Karte
zeigt noch auf die alte Welt.

**Die Architekturskizze in der Wurzel-`CLAUDE.md` ebenfalls:** sie führt
`Embedding-Service (:11435)` und `Qdrant Vector DB (:6333)` auf, als liefen sie.

### Tatsächliche Verwendung, gemessen am 21.08.2026

| Modell                                                                                              | `usage_count` | zuletzt                            |
| --------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------- |
| `qwen3:32b-q4`                                                                                      | 51            | 16.07.2026                         |
| `qwen3-coder:30b`                                                                                   | 27            | 20.08.2026                         |
| `qwen3:7b-q8`                                                                                       | 22            | 20.08.2026                         |
| `hf.co/…Qwen3.8-27B`                                                                                | 9             | 20.08.2026                         |
| `gemma3:1b`                                                                                         | 2             | 20.08.2026 (mein eigener Prüflauf) |
| `llava-phi3`, `qwen3:14b-nothink`, `gemma3:4b`, `gemma4:e4b-q4`, `nomic-embed-text`, `qwen3:14b-q8` | **0**         | nie                                |

Dazu dreizehn Katalogeinträge, die nie installiert wurden.

**Einschränkung, die dazugehört:** das ist ein Entwicklungsgerät, kein
Kundengerät. `usage_count` zählt, was dieses eine Gerät protokolliert hat. Als
Beleg dafür, dass ein Modell im Katalog überflüssig IST, reicht das nicht. Als
Beleg dafür, dass niemand geprüft hat, ob es gebraucht wird, reicht es.

### Vier von vierundzwanzig Katalogeinträgen sind nicht ladbar

Jeder Eintrag wurde gegen die Quelle abgerufen, aus der er käme: die
Ollama-Registrierung beziehungsweise Hugging Face. Kontrollprobe `qwen3:8b`
antwortet mit 200, die Methode trägt.

| Eintrag             | Befund                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paligemma-3b-mix`  | **existiert in der Ollama-Registrierung nicht**, weder mit dem hinterlegten Tag noch als `latest`. Und `getRecommendedModel` empfiehlt genau dieses Modell auf **vier** Geräteprofilen als Standard fürs Sehen |
| `paddleocr:latest`  | keine Ollama-Bibliothek, und im Dokument-Indexer nicht installiert (`ModuleNotFoundError`)                                                                                                                     |
| `tesseract:latest`  | keine Ollama-Bibliothek, aber im Dokument-Indexer vorhanden (5.3.0). Der Eintrag ist richtig, der Download-Knopf daneben nicht                                                                                 |
| `qwen3:14b-nothink` | nur lokal erzeugt (`importUnknownModels`). Auf einem frischen Gerät gibt es den Eintrag gar nicht, geprüft am Prüfstand, also kein Problem für einen Kunden                                                    |

Die zwanzig übrigen sind ladbar.

### Was daraus wurde

Migration 151 legt `task` und `is_task_default` an, mit einem **eindeutigen
Teil-Index**: je Aufgabe höchstens ein Standard. Ein Feld namens „der Standard"
mit drei Werten soll die Datenbank ablehnen, nicht ein Mensch bemerken. Am
Prüfstand gegengeprüft, der Index weist einen zweiten zurück.

`getRecommendedModel` prüft jede Kennung gegen den Katalog und fällt auf den
Standard der Aufgabe zurück. Die Ausweichsuche fürs Sehen geht über die Aufgabe
statt über `supports_vision_input`. Der Filter nennt die Aufgabe auf Deutsch.
`paligemma-3b-mix` ist raus.

**Nicht entschieden:** welche der übrigen zwanzig Modelle überflüssig sind. Nach
dieser Migration ist jedes einer Aufgabe zugeordnet, die erste Hälfte des
Kriteriums greift also nicht mehr, und die zweite („nicht messbar besser") ist
für dreizehn nie installierte Einträge nicht messbar. Ein gelöschtes Modell, das
ein Kunde geladen hat, ist nicht zurückzuholen.

**Erledigt am 21.08.2026,** `arasul-jet` #449, live abgenommen:

| Aufgabe   | Standard am Gerät  |
| --------- | ------------------ |
| text      | `gemma4:26b-q4`    |
| coding    | `qwen3-coder:30b`  |
| vision    | `minicpm-v:8b`     |
| ocr       | `tesseract:latest` |
| embedding | `nomic-embed-text` |

`paligemma-3b-mix`: null Zeilen. Am Prüfstand steht unter coding
`deepseek-coder:6.7b`, weil `qwen3-coder:30b` dort nicht existiert. Genau dafür
ist die Rangfolge da.

## D6 Der Agentenpfad benutzt den Lebenszyklus

`modelLifecycleService.js` stuft jede Stunde nach Nutzungsprofil ein und liefert
30, 10 oder 2 Minuten Haltezeit. `llmOllamaStream.js:278` benutzt das.
`chatAgentRunner.js:294` nicht, dort steht fest `agentConfig.KEEP_ALIVE`, also
`AGENT_KEEP_ALIVE=30m` aus der Umgebung. Der Pfad, der am meisten benutzt wird,
hängt nicht an der Automatik.

Zusätzlich: nach anhaltender Arbeit am Agenten wird die Haltezeit verlängert,
nach längerer Ruhe verkürzt. Der Kaltstart des 27B-Modells kostet gemessen 11,2
Sekunden, genau am Anfang einer Vorführung.

**Abnahme:** Der Agentenpfad liest die Haltezeit aus dem Lebenszyklus. Nach einer
Stunde durchgehender Arbeit ist das Modell bei der nächsten Frage warm, nach
mehreren Stunden Ruhe ist es entladen. Beides am Gerät gemessen.

## D7 Vorlauf kürzen

Bei 5200 Token Vorlauf braucht das 27B-Modell 20 Sekunden Vorverarbeitung, bevor
das erste Wort kommt, bei 262 Token pro Sekunde. Das ist keine Denkzeit und kein
Modellproblem, sondern Promptgröße.

Vorgehen: Systemprompt, Zusatzkontext, Werkzeugbeschreibungen und Verlauf messen,
größte Posten kürzen, Verlauf ab einer Schwelle zusammenfassen statt vollständig
mitzuschicken.

**Abnahme:** Bei einer Unterhaltung mit 20 Nachrichten liegt der Vorlauf unter
2500 Token. Die Zeit bis zum ersten Wort sinkt gegenüber der Messung vom 19.08.
um mindestens 8 Sekunden.

### Erst gemessen: es gibt nichts zu messen

Am 21.08.2026 auf dem Orin:

| Abfrage                                               | Ergebnis                        |
| ----------------------------------------------------- | ------------------------------- |
| `SELECT count(*), count(prompt_tokens) FROM llm_jobs` | **9 Zeilen, 0 mit Vorlauf**     |
| jüngster Job                                          | **30.07.2026**, drei Wochen alt |
| `SELECT * FROM v_llm_usage_profile`                   | **leer**                        |
| `model_performance_metrics` der letzten sieben Tage   | **0**                           |

**Der Pfad, der das Produkt trägt, schreibt seinen Vorlauf nicht auf.**
`llmOllamaStream` liest `prompt_eval_count` und speichert es; `chatAgentRunner`
nicht. D7 kann seine eigene Abnahme also gar nicht belegen, bevor das
nachgeholt ist.

**Und dasselbe Loch erklärt D6.** Die adaptive Haltezeit stuft nach dem
Nutzungsprofil ein, das Profil kommt aus `v_llm_usage_profile`, und die Sicht
ist leer. Auf diesem Gerät ist damit **jede Stunde `idle`**, die Haltezeit sind
zwei Minuten, und das ist kein theoretischer Fall, sondern der gemessene
Zustand. Die kurzfristige Aktivität aus D6 ist deshalb nicht Beiwerk, sondern
das Einzige, was heute überhaupt greift.

**Nachtrag zu D2:** die auf der Detailseite gezeigte Geschwindigkeit stammt
damit aus dem Juli. Der Filter dort steht auf 90 Tagen, und in den letzten
sieben gab es keine einzige Messung.

### Der Vorlauf, Posten für Posten gewogen

Ollama gibt bei `num_predict: 0` den `prompt_eval_count` zurück, ohne ein Wort
zu erzeugen. Damit lässt sich jeder Bestandteil einzeln wiegen, ohne dass etwas
ausgeliefert werden muss. Am 21.08.2026 auf dem Orin, Modell `qwen3-coder:30b`,
jeder Posten so aufgebaut, wie `chatAgentRunner` ihn zusammensetzt:

| Posten                              | Token | dazu      | Anteil   |
| ----------------------------------- | ----- | --------- | -------- |
| nur die Frage                       | 20    |           |          |
| Basis-Systemprompt                  | 89    | +69       | 2 %      |
| Unternehmenskontext                 | 156   | +67       | 1 %      |
| Agent-Anweisung                     | 1293  | **+1137** | 25 %     |
| Projektordner, echte Struktur       | 1847  | +554      | 12 %     |
| Werkzeuge, 12 strukturell           | 4502  | **+2655** | **59 %** |
| Verlauf, 12 gewöhnliche Nachrichten | 5126  | +624      |          |
| Verlauf an der Kappungsgrenze       | 16562 | +12060    |          |

**Der Grundvorlauf ohne Verlauf sind 4502 Token.** Die Messung vom 19.08.
nannte 5200; der Unterschied liegt am Projekt, das dabei angehängt war. Bei 262
Token je Sekunde Vorverarbeitung sind das rund 17 Sekunden, bevor das erste Wort
kommt; der Rundgang maß 20.

**Ein Posten macht die Mehrheit aus: die Werkzeugbeschreibungen mit 2655 Token,
59 Prozent.** Dahinter die Agent-Anweisung mit 1137. Systemprompt und
Unternehmenskontext zusammen sind 136 Token, also Rundung.

#### Eine eigene Fehlmessung, korrigiert

Der erste Durchgang wies der Ordnerstruktur **1947 Token** zu und machte sie zum
zweitgrößten Posten. Das war ein Artefakt: ich hatte 120 erfundene Pfade der
Form `Projekte/Development/modul-N/datei-N.ts` gewogen, die länger sind als
echte, und angenommen, die Kappung bei 120 schneide alphabetisch aus 1388
Einträgen.

Beides falsch. `listTree` läuft seit dem 18.08. in **Breitensuche**, Ebene für
Ebene, Ordner vor Dateien. Die ersten 120 Einträge sind damit Tiefe 1
vollständig (35) und Tiefe 2 fast vollständig (85). Am größten Projekt auf dem
Gerät gemessen, 1388 Einträge:

| Zuschnitt                      | Zeilen | Token   |
| ------------------------------ | ------ | ------- |
| heute: Breitensuche, erste 120 | 120    | **559** |
| Tiefe 1 und 2 vollständig      | 125    | 595     |
| Tiefe 1 bis 3                  | 450    | 3300    |

**Der bestehende Zuschnitt ist bereits der beste der drei.** Hätte ich meiner
ersten Messung geglaubt, hätte ich an der Ordnerstruktur gekürzt, also an der
Stelle, die schon in Ordnung ist, während der eigentliche Posten unberührt
geblieben wäre.

### Was das für die Abnahme heißt

Die Abnahme verlangt: „Bei einer Unterhaltung mit 20 Nachrichten liegt der
Vorlauf unter 2500 Token."

**Zwei Anmerkungen dazu, beide gemessen.** Erstens gibt es keine Unterhaltung
mit 20 Nachrichten im Vorlauf: `MAX_HISTORY_MESSAGES` ist 12, es gehen nie mehr
mit. Die Zahl im Plan beschreibt eine Unterhaltung, nicht den Vorlauf.

Zweitens: unter 2500 zu kommen heißt, die Werkzeugbeschreibungen und die
Agent-Anweisung zusammen um rund 2000 Token zu drücken, also beide etwa zu
halbieren. Der Verlauf ist dabei nicht das Problem, solange die Nachrichten
gewöhnlich lang sind (624 Token für zwölf). Er wird eins an der Kappungsgrenze:
`MAX_MESSAGE_CHARS` erlaubt 8000 Zeichen je Nachricht, zwölf davon sind 12060
Token allein für den Verlauf. Genau dort greift „Verlauf ab einer Schwelle
zusammenfassen".

**Werkzeuge wegzulassen bringt wenig**, gemessen: die drei selteneren
(`subagent`, `web_suche`, `web_lesen`) sparen zusammen 386 Token, weil ihre
Beschreibungen kurz sind. Die teuren sind die, die man immer braucht:
`dateien_suchen` (1170 Zeichen), `rag_suche` (826), `dateien_lesen` (764). Der
Hebel ist also nicht die Auswahl, sondern die Länge der Beschreibungen.

Die Reihenfolge für Schritt 2 ergibt sich damit aus der Messung: erst die
Werkzeugbeschreibungen straffen, dann die Agent-Anweisung. Die Ordnerstruktur
bleibt, wie sie ist.

**Und eine Warnung dazu:** beide Kürzungen ändern Text, an dem das Verhalten des
Agenten hängt. Ob er die Werkzeuge danach noch richtig benutzt, zeigt kein
Testlauf, sondern nur eine echte Unterhaltung am Gerät.

### Schritt 2 ausgeführt, 22.08.2026, live auf dem Orin

Gemessen mit `scripts/test/vorlauf-wiegen.js` gegen Ollama auf dem Gerät, und
danach live über `llm_jobs.prompt_tokens` in einer echten Unterhaltung.

| Posten                                    | vorher | nachher | Ersparnis |
| ----------------------------------------- | ------ | ------- | --------- |
| Agent-Anweisung                           | 1142   | 759     | 383       |
| Werkzeuge, 12 strukturell                 | 2654   | 2280    | 374       |
| Grundvorlauf ohne Verlauf und Projektbaum | 3811   | 3054    | 757       |
| **live gemessen, echte Unterhaltung**     | 4147   | 3390    | 757       |

Gekürzt wurde entlang einer Regel, nicht nach Gefühl: was strukturell schon an
einem Werkzeug hängt, steht nicht noch einmal in der Anweisung. Der Vergleich
`symbol_suche` gegen `dateien_suchen`, die `dateiname`-Regel von `rag_suche`,
die Ordnerregeln von `dateien_bearbeiten` und `dateien_anhaengen` standen in
beiden. Das Modell sieht jede Regel weiter, aber nur einmal.

**Die Warnung oben ist eingelöst.** Dieselbe Frage lief einmal gegen `main` und
einmal gegen den gekürzten Stand, beide Male am Gerät mit `qwen3-coder:30b`.
Ergebnis: der gekürzte Stand verhält sich nicht schlechter, sondern besser. Die
Antwort von `main` wiederholt sich zweimal und zählt Beispiele auf; die
gekürzte ist kurz. Ein Werkzeug ruft **keiner** von beiden auf, dazu unten.

### Der Verlauf war der eigentliche Posten, und sein Netz hatte ein Loch

Der Plan nennt oben „Verlauf ab einer Schwelle zusammenfassen". Nachgesehen,
was heute passiert: `kontextHaushalt` dampft ältere Nachrichten ein, aber erst
ab `NUM_CTX * KONTEXT_SCHWELLE`, also bei **22 937 Token**.

Der schlimmste Verlauf, den `MAX_MESSAGE_CHARS` überhaupt zulässt, sind zwölf
Nachrichten à 8000 Zeichen. Gemessen sind das **22 321 Token**.

**Das sind 616 Token unter der Schwelle, die ihn abfangen soll.** Das Netz kann
für die erste Runde gar nicht auslösen, und niemand hat es gemerkt, weil der
Kontext dabei auch nie überläuft. Es dauert nur.

Deshalb ein zweites Budget, das nur den Verlauf betrifft und nur beim
Zusammenbauen greift, `AGENT_VERLAUF_TOKEN_BUDGET`, Vorgabe 1200. Die zwei
jüngsten Nachrichten bleiben immer vollständig, ältere werden gekürzt, der Rest
fällt weg und wird durch eine Zeile ersetzt, die sagt, wie viel fehlt.

| Zwölf Nachrichten à 8000 Zeichen | Token      |
| -------------------------------- | ---------- |
| vorher                           | 22 321     |
| nachher                          | 6 282      |
| **Ersparnis**                    | **16 039** |

### Die Abnahme, ehrlich abgerechnet

Die Abnahme verlangt zwei Dinge. Eines ist erfüllt, eines nicht.

**„Der Vorlauf liegt unter 2500 Token": nicht erfüllt, live sind es 3390.** Der
Rest verteilt sich auf 2280 Token Werkzeuge, 759 Anweisung und rund 350 für
Basisprompt, Unternehmenskontext und Projektbaum. Gemessen kostet allein die
JSON-Hülle eines Werkzeugs rund 52 Token, dazu einmalig 210 Token
Werkzeug-Gerüst im Chatschema des Modells. Zwölf Werkzeuge haben damit einen
Boden von rund 834 Token, bevor ein einziges Wort Beschreibung dasteht. Unter
2500 zu kommen heißt deshalb nicht mehr kürzen, sondern **Werkzeuge weglassen
oder zusammenlegen**, etwa die vier `dateien_*` zu einem Werkzeug mit einem
`aktion`-Parameter. Das ist eine Produktentscheidung, keine Textarbeit, und
steht deshalb hier und nicht im Code.

**„Die Zeit bis zum ersten Wort sinkt um mindestens 8 Sekunden": erfüllt, aber
nicht dort, wo der Plan es erwartet hat.** Der Plan rechnet mit **262 Token je
Sekunde** Vorverarbeitung. Am 22.08.2026 nachgemessen, beide Modelle, jeweils
drei Läufe:

| Modell                          | erster Lauf | danach        |
| ------------------------------- | ----------- | ------------- |
| `qwen3-coder:30b`               | 947 Tok/s   | 1417 bis 1510 |
| `Qwen3.8-27B-IQ4_XS` (Standard) | 258 Tok/s   | 507 bis 589   |

**Die 262 aus dem Plan sind ein Kaltstart-Wert.** Warm macht das Standardmodell
gut das Doppelte. Damit ist die Rechnung „5200 Token sind 20 Sekunden" eine
Rechnung über ein Modell, das gerade erst geladen wurde, also über D6 und nicht
über D7.

Was die Kürzung des Grundvorlaufs wirklich bringt, in einem frischen Gespräch:

| Fall            | 4147 Token | 3390 Token | Ersparnis |
| --------------- | ---------- | ---------- | --------- |
| kalt, 258 Tok/s | 16,1 s     | 13,1 s     | **3,0 s** |
| warm, 550 Tok/s | 7,5 s      | 6,2 s      | **1,3 s** |

Die acht Sekunden holt nicht die Anweisung und nicht die Werkzeugliste, sondern
das Verlaufsbudget, und zwar in genau dem Gespräch, in dem eine Vorführung
stattfindet, dem langen:

| Fall            | 22 321 Token | 6 282 Token | Ersparnis  |
| --------------- | ------------ | ----------- | ---------- |
| warm, 550 Tok/s | 40,6 s       | 11,4 s      | **29,2 s** |
| kalt, 258 Tok/s | 86,5 s       | 24,3 s      | **62,2 s** |

### Zwei Funde nebenbei, beide vorher unsichtbar

**Das Messwerkzeug hätte gelogen.** `AGENT_ANWEISUNG` war nicht exportiert. Der
erste Durchgang wog damit `undefined` und meldete 15 Token statt 1142, ohne
einen Fehler. `vorlauf-wiegen.js` prüft jetzt beim Start, ob ein Bestandteil
leer ankommt, und bricht ab, statt eine schöne Zahl zu liefern.

**Zwei Nummern waren doppelt vergeben.** Die Anweisung hatte Regeln 1 bis 11,
und der Runner hängte danach `\n7. Zielordner…` und `\n8. Datei-Modus…` an,
noch dazu hinter dem Projektbaum, also weit weg von der Liste, in die sie sich
einreihen wollten. Die Zusätze tragen jetzt keine Nummer mehr, sondern stehen
unter „Für diese Anfrage".

### Ein neuer Befund, der nicht zu D7 gehört

Auf die Bitte „Suche im Projekt nach Dateien mit der Endung .md und nenne mir
die ersten drei Pfade" ruft der Agent **kein Werkzeug auf**. Er fragt zurück,
was denn gesucht werden soll. Auf `main` genauso, es liegt also nicht an der
Kürzung. Für eine Vorführung ist das schwerer als jede Wartezeit: der Kunde
stellt eine klare Aufgabe, und das Gerät stellt eine Rückfrage. Gehört zu Phase
E, nicht hierher, und ist dort als **E9** aufgenommen.

## D8 Zusatzkontext beschreibt das Produkt

Der Chat gibt auf die Frage, was Arasul kann, das Firmenprofil wieder, weil genau
das im Zusatzkontext steht. Das ist korrektes Verhalten bei falschem Inhalt. Der
Auslieferungszustand des Zusatzkontexts beschreibt künftig das Produkt.

**Abnahme:** Die Frage aus dem Rundgang liefert drei Stichpunkte über das Gerät,
nicht über die Beratungsleistung.

### Erst gemessen: es ist schlimmer als beschrieben

Am 21.08.2026 mit `qwen3-coder:30b` und derselben Prompt-Zusammensetzung wie im
Produkt, drei Fälle, dieselbe Frage „Was kann Arasul?":

| Fall                                          | Antwort                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Entwicklungsgerät (Profil = Arasul selbst)    | „ein Unternehmen, das sich auf lokale KI-Hardware sowie Beratungs- und Support-Dienstleistungen spezialisiert hat" |
| **Auslieferungszustand** (Platzhalter-Profil) | **„ein deutscher Anbieter von Softwarelösungen für die Lebensmittelindustrie … ERP-Systeme … HACCP"**              |
| **Kundengerät** (fremdes Profil)              | **„ein deutscher Hersteller spezialisiert auf Klebetechnik und Oberflächenbehandlung"**                            |

**Auf einem ausgelieferten Gerät erfindet der Chat, was Arasul ist**, und zwar
überzeugend und passend zur Branche des Kunden. Der Plan nennt das „korrektes
Verhalten bei falschem Inhalt"; das trifft nur den ersten Fall, wo im Kontext
tatsächlich Arasul als Firma steht. Bei einem Kunden ist es eine Halluzination
über das Produkt, das er gerade gekauft hat, im ersten Gespräch.

**Nachgeprüft über drei Modelle, denn ein Modell ist keine Messung.** Der
Auslieferungszustand, dieselbe Frage:

| Modell                                                    | ohne Beschreibung                                                                            | mit Beschreibung                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `qwen3-coder:30b` (Coding-Standard, läuft im Agentenpfad) | „ein deutscher Anbieter von Softwarelösungen für die Lebensmittelindustrie … ERP … HACCP"    | „ein lokaler KI-Assistent … Arasul-Gerät … NVIDIA-Jetson"                |
| `gemma4:e4b`                                              | „Da Sie nicht angegeben haben, was Arasul ist, kann ich keine spezifische Antwort geben"     | „Ich bin ein hilfreicher KI-Assistent, der auf einem Arasul-Gerät läuft" |
| `qwen3:8b`                                                | „ein KI-gestütztes Chatbot-System, das präzise und strukturierte Antworten auf Deutsch gibt" | „ein KI-System, das auf einem Arasul-Gerät läuft"                        |

**Nicht jedes Modell halluziniert.** `gemma4:e4b` fragt ehrlich nach, `qwen3:8b`
leitet aus dem Basisprompt ab. Erfunden hat nur `qwen3-coder:30b`, und das ist
ausgerechnet das Modell, das im Agentenpfad antwortet, also der Normalfall im
Chat. Der schlimmste Fall ist damit auch der wahrscheinlichste.

**Die Beschreibung wirkt bei allen dreien.** Ihr Nutzen ist deshalb nicht nur,
eine Halluzination zu verhindern, sondern dass das Gerät überhaupt weiß, was es
ist. Ohne sie war die beste der drei Antworten ein ehrliches „ich weiß es
nicht".

**Die Ursache liegt woanders als vermutet.** Nicht der Zusatzkontext ist
falsch, der gehört dem Kunden und beschreibt zu Recht dessen Firma. Es fehlt
eine Beschreibung des Produkts. Der Basisprompt waren zwei Sätze über
Höflichkeit; der einzige Eigenname weit und breit stand im Kundenprofil, und
darauf hat das Modell geantwortet.

### Was daraus wurde

Die Beschreibung steht in `GLOBAL_BASE_PROMPT`, also im Teil, der mit dem Gerät
ausgeliefert wird, nicht im Zusatzkontext. Sechs Sätze, rund 130 Token in jeder
Anfrage, also drei Prozent des Grundvorlaufs von 4502. D7 kürzt an anderer
Stelle deutlich mehr; ein erfundenes Produkt ist der teurere Posten.

Gemessen mit demselben Aufbau, dieselbe Frage:

| Fall                 | mit Beschreibung                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auslieferungszustand | „ein lokaler KI-Assistent, der auf einem speziellen Rechner namens Arasul-Gerät läuft … NVIDIA-Jetson-Prozessor … vor Ort"                       |
| Kundengerät          | „ein auf einem NVIDIA-Jetson-Prozessor laufendes Gerät … lokale Dateien, Browser-Terminal mit Coding-Agent, Abläufe, Katalog von Sprachmodellen" |

**Ein Satz wurde dabei zurückgenommen.** Der erste Entwurf sagte „keine Cloud,
keine Daten nach draußen". Das ist falsch: die Websuche geht ins Internet.
Phase A hat gerade fünf unerfüllte Zusagen von der Website genommen; eine
sechste im Systemprompt wäre der falsche Ort. Jetzt steht dort, was zutrifft:
die Antworten entstehen auf dem Gerät, und einzelne Werkzeuge gehen ins
Internet, wenn der Agent sie benutzt. Ein Test hält fest, dass die Zusage nicht
zurückkommt.

## D9 Externes Cloud-Modell dazuschalten

Die Website verspricht es, es gibt keinen Schalter. Gebraucht wird es, um mit
einem starken Cloud-Modell die Anwendungen zu bauen, die danach lokal laufen.

Umfang: Schlüssel je Anbieter in den Einstellungen hinterlegen, verschlüsselt
gespeichert, im Chat und im Flow als Modell wählbar, deutlich als extern
gekennzeichnet, standardmäßig aus. Im Terminal läuft dieser Weg bereits über
Claude Code.

**Abnahme:** Ein hinterlegter Schlüssel macht das Modell im Chat wählbar. Ohne
Schlüssel taucht nichts auf. Eine Anfrage an ein externes Modell ist im
Prüfprotokoll als solche erkennbar. Behebt F-48.

### Gebaut und live abgenommen, 22.08.2026

Anthropic und OpenAI, je ein Schlüssel, verschlüsselt (AES-256-GCM, Schlüssel
aus `JWT_SECRET`), standardmäßig aus. Migration 153, geräteweit ohne `user_id`,
weil Entscheidung E1 sagt, es gibt keine Nutzerverwaltung.

**Kein einziger Modellname steht im Code.** Die Liste kommt vom Anbieter
selbst, beide bieten `GET /v1/models`. Das ist Regel 1 aus `CLAUDE.md`, und es
hat einen praktischen Nebeneffekt: die Zusage „ohne Schlüssel taucht nichts
auf" ergibt sich von allein, statt gefiltert zu werden, denn ohne Schlüssel
gibt es niemanden zu fragen.

Am Gerät geprüft:

| Prüfung                                    | Ergebnis                                                             |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Migration 153 angewendet                   | `success = t`                                                        |
| Ab Werk                                    | beide Anbieter ohne Schlüssel, `aktiv: false`, 0 externe Modelle     |
| Liegt der Schlüssel im Klartext in der DB? | **kein Klartext**, nur der AES-Blob                                  |
| Falscher Schlüssel gegen die echte API     | `UNAUTHORIZED`, „Anthropic weist den hinterlegten Schlüssel zurück." |
| Eingeschaltet mit falschem Schlüssel       | Liste bleibt leer, Fehler steht an der Anbieter-Zeile                |

Die 401 belegt nebenbei, dass der Weg zu `api.anthropic.com` wirklich
funktioniert.

**Was NICHT live belegt ist:** der Positivfall mit einem gültigen Schlüssel.
Dafür bräuchte es einen echten API-Schlüssel, und der gehört nicht in eine
Arbeitssitzung. Der Pfad ist über Tests abgedeckt; die Abnahme „ein
hinterlegter Schlüssel macht das Modell wählbar" steht erst, wenn Kolja einmal
seinen eigenen Schlüssel einträgt. **Das ist der einzige offene Punkt an D9.**

**Ein Fehler, den nur der Live-Lauf gezeigt hat.** Auf „Prüfen" antwortete das
Produkt zuerst mit „Internal server error" statt mit der ehrlichen Meldung.
`ergebnisFesthalten` ließ Postgres den Typ von `$2` raten. Die Folge war größer
als der Fehler: der Aufruf steht in jedem catch-Zweig, sein eigener Fehler hat
also den des Anbieters ersetzt. Behoben ist beides, der Cast und die Klammer um
die Buchhaltung.

**Bewusst gezogene Grenze:** protokolliert werden Chat-Anfragen, also die, die
Nutzertext tragen. Das Abholen der Modellliste verlässt das Gerät auch, trägt
aber keine Nutzerdaten und steht nicht im Protokoll.

---

# Phase E, Coding-Agent und Chat

Geschätzt 34 Stunden. Die größte Phase, weil sie den USP trägt. Reihenfolge ist
bindend: erst der Abbruch, dann die Darstellung. Ein Chat, der mitten in der
Antwort abbricht, kostet mehr als jede Formatierung.

## E1 Den Abbruch reproduzieren

Gemeldet: „irgendwann kam einfach eine Nachricht, dass es abgebrochen ist",
mehrfach, ohne erkennbares Muster. Ohne Reproduktion wird hier nichts umgebaut.

Vorgehen: Protokollierung an den vier Stellen verdichten, an denen ein Lauf enden
kann, also Zeitüberschreitung im Stream, Fehler im Werkzeugaufruf, Ende der
Warteschlange, Verbindungsabbruch im Browser. Jeder Abbruch bekommt einen Grund
und eine Kennung. Dann eine lange Sitzung fahren, bis es auftritt.

**Abnahme:** Der Abbruch ist mindestens zweimal reproduziert, die Ursache steht
im Protokoll mit Grund und Kennung.

### Erst gemessen: fünf Orte, ein Satz

Der Plan nennt vier Stellen, an denen ein Lauf enden kann. Es sind fünf, und
keine davon hinterließ etwas, wonach man suchen könnte.

| Ort im Code                              | was der Nutzer sah                    | was die Datenbank wusste |
| ---------------------------------------- | ------------------------------------- | ------------------------ |
| `streamChatRound`, Inaktivität           | `_Abgebrochen: <Fehlertext>_`         | nichts                   |
| Nutzer-Abbruch über den Stopp-Knopf      | `_Abgebrochen._`                      | nichts                   |
| Zeitlimit des Laufs                      | `_Abgebrochen: Zeitlimit von 86400s_` | nichts                   |
| Ende der Werkzeug-Runden                 | die Antwort hörte einfach auf         | nichts                   |
| **Fortschritts-Wächter** (im Plan fehlt) | ein deutscher Satz ohne Kennung       | nichts                   |

Dazu drei Stellen außerhalb des Agentenlaufs: der Zeitlimit-Wächter der
Warteschlange, die Neustart-Rettung und der Aufräumtakt der Zuhörer. Zwei davon
schrieben ihre Meldung auf Englisch, und zwar an den Nutzer:
`Job timed out during streaming (10 minutes without update)` und
`Job was cancelled`.

**„Fehler im Werkzeugaufruf" gehört nicht dazu.** Der Plan zählt ihn zu den
vier Orten. Im Code wird er aufgefangen und dem Modell als Text zurückgegeben,
der Lauf läuft weiter. Er endet dort nie. Was wirklich passiert, wenn dasselbe
Werkzeug mehrfach gleich scheitert, sieht man erst im Fortschritts-Wächter.

### Was daraus wurde

`services/llm/abbruchGrund.js` ist die eine Stelle, an der ein Abbruch benannt
wird, und liefert immer alle drei Teile zusammen: einen **Grund** aus einer
festen Liste, nach dem sich zählen lässt, eine **Kennung** der Form
`ABB-<6 Zeichen der Job-Id>-<Grund>`, die im Chat, im Protokoll und in der
Datenbank steht, und eine **Protokollzeile** in fester Form.

Migration 154 legt `abbruch_grund`, `abbruch_kennung`, `abbruch_detail` und
`abbruch_am` an `llm_jobs` an, ausdrücklich neben `error_message`: der Grund ist
zählbar, der Freitext nicht. `scripts/util/abbrueche.sh` liest beides
nebeneinander.

**Erledigt am 22.08.2026,** `arasul-jet` #458.

### Die Wartezeit auf das erste Zeichen gibt es nicht

Der Plan geht davon aus, dass eine „Zeitüberschreitung im Stream" auch das
Warten auf das erste Wort abdeckt. Gemessen ist das Gegenteil. Vier Läufe auf
dem Orin, drei Modelle, warm und kalt:

```
[VORLAUF] job=… modell=qwen3:32b        erstes_zeichen_nach=0ms grenze=1500ms
[VORLAUF] job=… modell=qwen3-coder:30b  erstes_zeichen_nach=0ms grenze=120000ms
```

**Immer null Millisekunden.** Ollama öffnet den Strom sofort und lässt die
Vorverarbeitung danach laufen. Der Inaktivitäts-Wächter wird erst armiert,
nachdem `axios.post` die Kopfzeilen hat, und `axios` läuft mit `timeout: 0`.

Damit sind **Modellladung und Vorverarbeitung des Prompts vollständig
unbewacht**. Die 120 Sekunden messen ausschließlich den Abstand zwischen zwei
Zeichen. Ein hängender Modell-Ladevorgang läuft unbegrenzt weiter, und der
Nutzer sieht nichts. Das korrigiert auch die Rechnung aus D7: die dort
befürchtete Zeitüberschreitung durch einen zu großen Vorlauf kann so gar nicht
entstehen.

### Dreimal reproduziert, am Gerät

| #   | Grund          | wie erzeugt                                   | Kennung                   | nach  |
| --- | -------------- | --------------------------------------------- | ------------------------- | ----- |
| 1   | `nutzer`       | Stopp-Knopf während eines Schreibauftrags     | `ABB-5fc762-nutzer`       | 20 s  |
| 2   | `unbekannt`    | `docker pause llm-service`, Verbindung reißt  | `ABB-27609e-unbekannt`    | 9 s   |
| 3   | `stream_still` | `SIGSTOP` auf `ollama serve`, Strom verstummt | `ABB-6e610c-stream_still` | 122 s |

Der dritte ist der wichtigste: kein Eingriff an der Einstellung, die echte
Grenze von 120 Sekunden, und die Protokollzeile unterscheidet, was vorher gleich
aussah:

```
[ABBRUCH] kennung=ABB-6e610c-stream_still job=6e610c80-… grund=stream_still
          quelle=chatAgentRunner.streamChatRound nach=122s
          detail="mitten im Text, Modell qwen3-coder:30b, Grenze 120s"
```

Für Fall 1 steht die Kennung zugleich im Chat, in `llm_jobs` und zweimal im
Protokoll. Der Weg vom Satz auf dem Bildschirm zur Zeile im Protokoll ist damit
eine einzige Suche.

**Abnahme erfüllt am 22.08.2026.**

### Was die Reproduktion gefunden hat, und das ist der eigentliche Fund

Bei Fall 3 blieb die Antwort im Chat **leer**, obwohl der Nutzer 260 Zeichen
hatte kommen sehen. Nachgezählt:

| Ort                     | Inhalt                          |
| ----------------------- | ------------------------------- |
| `llm_jobs.content`      | **260 Zeichen**                 |
| `chat_messages.content` | **0 Zeichen**, `status = error` |

Der Text war geschrieben und wurde nicht übertragen. Die Ursache steht in einer
Bedingung, die zu prüfen glaubt, ob schon etwas geflossen ist:

```js
} else if (!fertigText && !dbPuffer) {
  throw new Error(verstaendlicherFehler(err));   // Job wird Fehler, Teiltext weg
```

Beides ist mitten in einer Runde regelmäßig leer. `fertigText` wird erst am
**Ende** einer Runde gefüllt, und `dbPuffer` leert jeder Schreibtakt. Ein
Abbruch kurz nach einem Schreibtakt sieht deshalb aus wie ein Abbruch vor dem
ersten Wort, und der Lauf wirft, statt den Teiltext zu behalten.

**Das ist die Meldung aus der Fehlermeldung, wörtlich.** Sie kommt „einfach",
sie kommt „irgendwann", und der Text, den der Nutzer gerade gelesen hat, ist
danach weg. Behoben wird das in E2.

Zwei kleinere Funde daneben:

- `aborted`, der Fehler einer gerissenen Verbindung zum KI-Dienst, fällt in
  `grundAusFehler` auf `unbekannt`. Er gehört zu `modell_weg`.
- `cleanupStaleSubscribers` verwirft die Zuhörer eines Laufs nach zehn Minuten,
  ausdrücklich „regardless of job status". Ein Lauf, der länger dauert, verliert
  seine Anzeige, während er weiterläuft. E2 verlangt einen Lauf über 30 Minuten;
  ohne diese Änderung ist die Abnahme nicht erreichbar.
- `FLOW_LLM_TIMEOUT_MS` erreichte den Container nie. Beim Beheben kamen
  **88 dokumentierte Stellschrauben** ans Licht, die auf einem ausgelieferten
  Gerät nichts bewirken. Wächter und Zahl in `scripts/test/durchreichung.py`,
  `arasul-jet` #459.

## E2 Abbruch beheben und Abbrechen ernst nehmen

Zwei Dinge, die zusammengehören. Der unerwünschte Abbruch aus E1 wird behoben.
Der gewünschte Abbruch, also der Klick auf Stopp, muss den Lauf wirklich beenden,
einschließlich laufender Werkzeugaufrufe und der Position in der Warteschlange.

Dazu: sehr lange Läufe und automatisch angestoßene Läufe dürfen die Warteschlange
nicht blockieren.

**Abnahme:** Ein Lauf über 30 Minuten läuft durch. Ein Klick auf Stopp beendet
ihn in unter zwei Sekunden, das Modell wird frei, die Warteschlange läuft weiter.
Zwei parallele lange Läufe blockieren einander nicht.

### Gebaut, in drei Schritten, jeder aus einer Messung

**Der Teiltext ging verloren.** Der Fund aus E1: `llm_jobs.content` hatte 260
Zeichen, `chat_messages` null, Status `error`. Die Bedingung `!fertigText &&
!dbPuffer` prüft nicht, was sie zu prüfen glaubt: `fertigText` wird erst am Ende
einer Runde gefüllt, `dbPuffer` leert jeder Schreibtakt nach 800 Millisekunden.
Ein Abbruch kurz nach einem Schreibtakt sah deshalb aus wie einer vor dem ersten
Wort. Neu ist ein Merkzeichen, das `onToken` setzt und niemand zurückdreht.
`arasul-jet` #462.

**Ein laufender Job verlor seine Zuhörer.** `cleanupStaleSubscribers` verwarf
sie nach zehn Minuten, ausdrücklich „regardless of job status". Ein Lauf, der
länger dauert, verlor seine Anzeige, während er weiterlief. Mit dieser Zeile war
die Abnahme „über 30 Minuten" nicht erreichbar.

**Der erste Versuch der Abnahme starb an der eigenen Größe.** Nach 15:39
Minuten, `ABB-6153f7-stream_still`, das Modell hatte 121 Sekunden nichts
geschickt. Nachgerechnet war das keine Störung:

|                        |                                   |
| ---------------------- | --------------------------------- |
| Zusammenhang der Runde | **31 267 Token** von 32 768       |
| Vorverarbeitung warm   | 507 bis 589 Token/s → 53 bis 62 s |
| Vorverarbeitung kalt   | 262 Token/s → **119 s**           |
| Modell laden           | 6 bis 30 s                        |

Die eine Grenze von 120 Sekunden lag genau auf der Kante des erlaubten Falls.
Jetzt sind es zwei: **300 Sekunden vor dem ersten Wort** einer Runde, wo
Modellladung und Vorverarbeitung laufen, und **120 zwischen zwei Wörtern**, wo
ein stiller Strom wirklich tot ist.

Dazu die zweite Ursache: der Zusammenhang hätte gar nicht auf 31 267 Token
wachsen dürfen. Der Haushalt dampft bei 22 937 ein und hielt den Lauf für
darunter, weil die Schätzung einen ganzen Posten nicht sieht: die
Werkzeugbeschreibungen gehen als eigener `tools`-Parameter an Ollama und stehen
in keiner Nachricht, gemessen rund 2200 Token in **jeder** Runde. Statt diese
Zahl abzuschreiben wird sie nach jeder Runde aus Ollamas `prompt_eval_count`
nachgemessen. `arasul-jet` #464.

### Der Stopp-Knopf

Das Abbruch-Signal geht jetzt mit an `axios`. Zwischen dem Aufruf und dem
Anhängen des Horchers lag die gesamte Anfrage, bei einem kalten Modell die
längste Spanne des Laufs, und jeder Abbruch darin ging verloren. Und das
Terminal-Werkzeug hört auf das Signal: ein Befehl darf 900 Sekunden laufen, so
lange wartete der Agent, bevor er den Abbruch bemerkte. Ehrlich benannt: beendet
wird dort das Zuhören, nicht der Prozess.

**Live gemessen am 22.08.2026:** Stopp nach 20 Sekunden, Kennung
`ABB-5fc762-nutzer` in Chat, Datenbank und zweimal im Protokoll, Status
`cancelled`, Teiltext erhalten.

### Live abgenommen: der Lauf über 30 Minuten

Am 22.08.2026, dritter Versuch, Auftrag über zwanzig Kapitel:

|                                       |                                                    |
| ------------------------------------- | -------------------------------------------------- |
| Laufzeit bis zum Stopp                | **32 Minuten**, `status = streaming`, kein Abbruch |
| Abbrüche im Protokoll                 | keine                                              |
| Wartezeit auf das erste Wort je Runde | 0 bis 1 ms                                         |

Der Lauf wurde nicht müde, er wurde beendet: mit dem Stopp-Knopf, und damit
beweist derselbe Versuch die zweite Zusage gleich mit.

|                      |                                              |
| -------------------- | -------------------------------------------- |
| DELETE-Antwort       | **68 ms**                                    |
| `status = cancelled` | **134 ms** nach dem Klick                    |
| Grund und Kennung    | `nutzer`, `ABB-f4fd66-nutzer`                |
| Teiltext             | 1356 Zeichen erhalten, Nachricht `completed` |
| Modell frei          | `/api/ps` leer                               |
| Warteschlange        | nächste Frage nach 37 Sekunden beantwortet   |

### Was der Kontext-Haushalt dabei über sich verraten hat

Die neue Nachmessung aus Ollamas `prompt_eval_count` lief mit und zeigt, wie
weit die Schätzung danebenlag:

```
[KONTEXT] Aufschlag 3167 auf 3285 (geschaetzt 3530, gemessen 6815)
[KONTEXT] Aufschlag 3735 auf 3924 (geschaetzt 4149, gemessen 8073)
```

**Die Schätzung lag um den Faktor 1,9 zu niedrig.** Rund 2200 Token davon sind
die Werkzeugbeschreibungen, die sie gar nicht sehen kann. Der Rest ist der
Zeichenfaktor selbst: `Zeichen / 3,2` trifft für deutschen Fachtext mit Markdown
nicht, gerechnet sind es eher 2,25. Wer diese Zahl fest einträgt, hat sie beim
nächsten Modell wieder falsch; deshalb wird sie gemessen.

### Und ein Defekt an der eigenen Arbeit, den erst der echte Stopp zeigte

Im Chat stand nach dem Stopp `_Abgebrochen._` **ohne Grund und ohne Kennung**,
also genau das, was E1 abgeschafft hatte. In der Datenbank stand alles richtig.

Der Grund: ein Abbruch zwischen zwei Runden verlässt die Schleife, ohne zu
werfen. Der `catch`-Zweig, der die Kennung setzt, läuft nie. Behoben an zwei
Stellen, und die zweite ist die lehrreichere: die Kennung ist aus Job-Id und
Grund **ableitbar**, also wird sie hergeleitet statt weggelassen.

### Was nicht erfüllt ist, und warum

„Zwei parallele lange Läufe blockieren einander nicht" ist mit einer strikt
seriellen Warteschlange nicht erfüllbar, und die Serialität ist gewollt: am
29.07.2026 entschieden, „strikt einer nach dem anderen, keine Priorisierung".
Gemessen am 22.08.2026: eine kurze Frage hinter einem langen Agent-Lauf wartete
**228 Sekunden** und begann in der Sekunde, in der der lange Lauf endete.

Die Umstellung wäre möglich und stünde **nicht** im Widerspruch zu dieser
Entscheidung: die GPU-Sperre bliebe der Serialisierer, nur die Warteschlange
ließe mehr als einen Auftrag zu. Sie berührt aber `processingJobId` an zwanzig
Stellen, darunter den Zeitlimit-Wächter und die Fehlerbehandlung, also genau das
Stück, das jeden Chat trägt. Unbeaufsichtigt auszuliefern ist das falsch.

Geliefert ist stattdessen, was die Wartezeit erträglich macht: der Platz steht
in der Denkzeile. Das Backend schickte ihn seit langem als `queue_position`, die
Oberfläche hat ihn nie gelesen. Jetzt steht dort „wartet, Platz 3 in der
Warteschlange". Das nimmt die Wartezeit nicht weg, es nimmt ihr das
Rätselhafte. `arasul-jet` #471.

**Entscheidung für Kolja:** soll die Warteschlange zwei Aufträge zugleich
zulassen? Kosten: ein Umbau am Herzstück. Nutzen: eine kurze Frage wartet nicht
mehr eine halbe Stunde.

## E3 Eine Denkzeile, live und auf Deutsch

Heute erscheinen beim Absenden drei Anzeigen gleichzeitig, „Plan wird erstellt",
„Denke nach" und eine dritte über Aufgaben, alle träge. Der Denktext selbst
erscheint auf Englisch.

Künftig: genau eine Zeile, die laufend zeigt, was gerade passiert, auf Deutsch,
zum Beispiel „durchsucht `services/llm`" oder „schreibt `plan.md`". Wer den
vollständigen Denkvorgang sehen will, klappt ihn auf. Dass das Modell intern
englisch denkt, ist in Ordnung, solange die Zeile und alle geschriebenen
Dokumente deutsch sind.

**Abnahme:** Nach dem Absenden erscheint innerhalb einer Sekunde eine deutsche
Statuszeile, die sich mindestens alle zwei Sekunden aktualisiert. Behebt F-30,
F-33.

### Gebaut und am Gerät gemessen

Vorher standen **drei** Anzeigen nebeneinander: die Aufgabenliste
(`AgentActivity`), der Denk-Ticker mit der letzten Zeile des englischen
Gedankengangs, und eine Statuszeile aus dem Backend. Alle drei zugleich, alle
drei träge.

Jetzt während des Laufs genau eine Zeile, die den jüngsten Schritt in derselben
deutschen Sprache nennt wie die Schrittliste danach. `agentStepLabel` zog dafür
nach `schrittText.tsx`: zwei Kopien derselben Sätze wären sicher
auseinandergelaufen.

Zwei Entscheidungen tragen die Abnahme, und beide sind bewusst unabhängig vom
Backend:

- **Die Zeile erscheint mit der Nachricht**, nicht mit dem ersten Ereignis aus
  dem Netz. Sonst hinge „innerhalb einer Sekunde" an der Warteschlange und wäre
  auf einem beschäftigten Gerät nicht erfüllbar.
- **Der Sekundenzähler tickt selbst.** Käme die Bewegung nur aus den
  Schritt-Ereignissen, stünde die Zeile während einer langen Modellrunde
  minutenlang still, und niemand könnte von außen unterscheiden, ob das Gerät
  arbeitet oder hängt. Genau das war die Klage.

**Live abgenommen am 22.08.2026** mit `scripts/test/chat-abnahme.mjs`, einem
echten Browser gegen den Orin:

| Zusage                               | gemessen                       |
| ------------------------------------ | ------------------------------ |
| erscheint innerhalb einer Sekunde    | **186 ms**                     |
| aktualisiert sich alle zwei Sekunden | `0 s` auf `2 s`                |
| deutsch                              | `„arbeitet"`                   |
| genau eine Anzeige                   | Denk-Ticker 0, Aufgabenliste 0 |

`arasul-jet` #463.

## E4 Inline-Darstellung wie im Terminal

Heute kommt ein Satz, dann eine Pause, dann der nächste Satz. Änderungen an
Dateien sind nicht sichtbar.

Künftig: Werkzeugaufrufe als aufklappbare Blöcke, Dateiänderungen als Diff
inline, Token pro Sekunde und Dauer je Antwort, Fehler als Block statt als
Fließtext. Vorbild ist die Darstellung von Claude Code.

**Abnahme:** Eine Aufgabe, die drei Dateien ändert, zeigt drei aufklappbare
Diffs, die Gesamtdauer und die Ausgabegeschwindigkeit.

### Gebaut

Vorher zeigte der Chat eine Karte mit dem Dateinamen und einem Abzeichen „Neu"
oder „Geändert". Was drinsteht, sah man erst nach dem Öffnen eines eigenen Tabs,
und was sich geändert hat, gar nicht. Bei drei Dateien heißt das dreimal Tab
öffnen, dreimal suchen, dreimal zurück.

Jede Karte trägt jetzt einen aufklappbaren Vergleich mit Zähler. Die
Vorher-Fassung kommt aus dem Schnappschuss-Dienst, der seit Plan 022 jeden
Schreibschritt sichert; `lineDiff` ist dieselbe Rechnung wie im Editor-Tab.

**Geholt wird erst beim Aufklappen.** Ein Lauf, der zehn Dateien anfasst, würde
sonst zwanzig Abfragen auslösen, von denen niemand eine angesehen hat, und zwar
auf einem Gerät, das gerade ein Modell rechnet. Eine neue Datei hat keine
Vorgeschichte; für sie entfällt die zweite Abfrage.

Dazu die **Gesamtdauer** eines Laufs, neu im `done`-Ereignis. Sie ist etwas
anderes als die Tokens je Sekunde: darin steckt nur die reine Erzeugungszeit,
nicht das Warten auf Werkzeuge, Subagenten und das Laden des Modells. Bei einem
Agent-Lauf sind das zwei Größenordnungen Unterschied.

Beide stehen an **einer** Stelle. Vorher zeigte der Denk-Ticker das Tempo, wenn
es eine Denkphase gab, und eine eigene Zeile sonst; die Gesamtdauer wäre damit
je nach Modell mal da und mal weg gewesen.

`arasul-jet` #465.

## E5 Chats bekommen brauchbare Namen

Der Titel lautete während der Antwort „Arasul denkt nach" und wurde erst danach
durch die Frage ersetzt. Beim Zurückspringen findet man nichts wieder.

Künftig: nach dem ersten Austausch benennt das Modell den Chat nach dem, was
darin getan wurde, nicht nach der Frage. Bei größeren Änderungen im Verlauf wird
nachbenannt. Kein Zwischenzustand als Titel.

**Abnahme:** Zehn Chats aus verschiedenen Aufgaben tragen unterscheidbare Namen,
die die Aufgabe nennen.

### Gebaut

Der Titel war die erste Zeile der ersten Frage. Bei zehn Chats aus zehn
Aufträgen stehen dann zehn Fragen untereinander, und wer zurückspringt, sucht
nach dem, was herauskam.

Nach einem Lauf fragt `benenneNachLauf` das Modell nach einer Überschrift von
höchstens sechs Wörtern. Drei Entscheidungen darin:

- **Dasselbe Modell wie der Lauf.** Es liegt schon im Speicher. Ein schnelleres
  zu nehmen hieße, das große zu entladen und wieder zu laden, gemessen 6 bis 30
  Sekunden für eine Zeile.
- **Nach der Antwort, nie davor, und ohne `await`.** Der Nutzer wartet nie auf
  einen Titel; scheitert er, bleibt der bisherige stehen.
- **Ein von Hand vergebener Titel bleibt.** `titel_quelle = NULL` heißt, der
  Mensch hat entschieden. Die Bedingung steht auch im `UPDATE`.

Umbenannt wird, wenn sich die Zahl der Nachrichten seit der Benennung
verdoppelt. Das benennt einen kurzen Chat früh und einen langen selten und
braucht keine Uhr. Migration 155.

### Live abgenommen am 22.08.2026

Zehn Chats aus zehn verschiedenen Aufgaben, alle mit `titel_quelle = 'lauf'`:

```
Datei netz-01.md erstellt mit drei Sätzen über Switches
Datei notiz2.md gelesen und zusammengefasst
Projekt durchsucht nach .md Dateien
Datei liste.md mit Bürorobusten erstellt
DNS übersetzt Domainnamen in IP-Adressen
Datei preise.md mit Tabelle erstellt
Lokale KI bietet Sicherheit Latenz und Offline-Nutzung
Datei readme-test.md erstellt mit Überschrift und zwei Absätzen
Verzeichnisinhalt analysiert drei letzte Änderungen ermittelt
VPN dient zur Privatsphäre Sicherheit und Inhaltszugriffsbeschränkung
```

Zehn von zehn unterscheidbar, zehn von zehn nennen die Aufgabe. Einer trägt
einen Modellfehler: aus „Büromaterialien" wurde „Bürorobusten". Das ist ein
Ausrutscher des Modells in sechs Wörtern, kein Fehler des Verfahrens, und er
steht hier, weil eine Abnahme auch das zeigt, was nicht perfekt war.

`arasul-jet` #466.

## E6 Dateien und Ordner in den Chat ziehen

Gemeldet: mehrere Dateien oder Ordner nacheinander hineinzuziehen funktioniert
nicht zuverlässig.

Künftig: mehrere Dateien in einem Zug, mehrere Vorgänge nacheinander, ganze
Ordner mit Angabe der Zahl enthaltener Dateien, jede Anlage einzeln entfernbar,
sichtbare Rückmeldung beim Ziehen.

**Abnahme:** Drei Vorgänge nacheinander mit je zwei Dateien ergeben sechs
Anlagen. Ein Ordner mit 20 Dateien wird als ein Eintrag mit Zahl angezeigt.

### Die Ursache, im Code eindeutig

```tsx
const [attachedFile, setAttachedFile] = useState<File | null>(null);   // EIN Feld
…
for (const file of Array.from(e.dataTransfer.files)) {
  pickFile(file);        // jeder Aufruf ueberschreibt den vorigen
}
```

Zwei Dateien in einem Zug ergaben **eine** Anlage, nämlich die letzte. Drei
Vorgänge nacheinander ebenfalls eine. Nichts wies darauf hin. Das gemeldete
„nicht zuverlässig" war vollständig zuverlässig, nur falsch.

### Was daraus wurde

Aus dem Feld wird eine Liste, quer durch den ganzen Weg. Der Upload läuft
nacheinander, nicht nebeneinander: er legt in denselben Ordner, und die Antwort
nennt den vergebenen Pfad; bei gleichem Namen hängt die Nummerierung davon ab,
was schon dort liegt. Dieselbe Datei zweimal ergibt eine Anlage, denn wer einen
Ordner zweimal zieht, will nicht zwanzig doppelte.

Der Ordner trägt jetzt seine Zahl: `Speichern in: berichte · 20 Dateien`. Ist
der Baum-Abzug gedeckelt, steht „mindestens" davor. Eine geschönigte Zahl wäre
schlimmer als gar keine.

### Was die Live-Abnahme sofort gefunden hat

Der Umbau heilte den **Ziehweg** und übersah die **Büroklammer**. Dort stand
weiter `e.target.files?.[0]`, und dem Feld fehlte `multiple`, der Dialog ließ
also gar keine zweite Datei zu. Am Gerät fiel es im ersten Durchlauf auf, im
Testlauf niemandem: es gab keinen Test dafür.

Genau deshalb steht im Plan, dass eine Aufgabe erst mit der Abnahme am Gerät
erledigt ist.

`arasul-jet` #467 und der Nachtrag.

## E7 Slash-Menü wie im Terminal

Heute öffnet Slash ein Menü, das nicht durchsuchbar ist, und das Bearbeiten von
Argumenten sieht unfertig aus.

Künftig: Slash öffnet direkt über dem Eingabefeld eine Liste, Tippen filtert,
Tab bestätigt, danach steht der Cursor beim ersten Argument. Ein Argument, das
eine Datei ist, kann per Ziehen gefüllt werden. Zusätzlich eine Suche nach
Dateien über ein eigenes Zeichen.

**Abnahme:** Slash, drei Buchstaben, Tab, Argument, Absenden funktioniert ohne
Maus. Die Liste ist bei 30 Flows noch bedienbar.

### Was schon ging, und was nicht

Der Tastaturweg war vollständig: `/` öffnet, Tippen filtert, Pfeiltasten wählen,
Tab und Enter übernehmen, danach springt Tab von Argument zu Argument, Enter
sendet. Die Abnahme hing nicht am Weg, sondern an zwei Stellen, an denen er
unbenutzbar wurde.

**Die Auswahl blieb nicht in Sicht.** Die Liste ist auf `max-h-64` gedeckelt und
scrollt; bei dreißig Flows passen davon rund fünf ins Bild. Ohne
`scrollIntoView` wanderte die Auswahl beim Blättern aus dem Sichtfeld, und der
Nutzer drückte Tab auf einen Eintrag, den er nicht sieht.

**Gefiltert wurde nur über den Namensanfang.** Wer `recherche-lang` sucht und
`lang` tippt, fand nichts. Ab drei Buchstaben trifft die Suche jetzt auch in der
Mitte, Anfangstreffer weiter zuerst. Die Untergrenze ist kein Geschmack: bei
einem einzigen Buchstaben trifft „enthält" fast jeden Namen, und die Liste wäre
nach dem ersten Tastendruck länger als ohne Filter.

### `@` findet Dateien

Für Dateien gab es bisher nichts. Wer eine meinen wollte, musste ihren Pfad
kennen und tippen oder sie aus dem Explorer herüberziehen, und beides setzt
voraus, dass man weiß, wo sie liegt.

`@` sucht nach dem Namen, quer durch die Ablage, und setzt den Pfad in den Text.
Was danach dort steht, ist gewöhnlicher Text; der Agent liest den Pfad und
benutzt `dateien_lesen`. Es bleibt also nichts hängen, was beim Absenden noch
aufgelöst werden müsste. Das Fragment wird an der Cursor-Position gelesen, nicht
am Zeilenende, und eine Mailadresse öffnet kein Menü.

**Live abgenommen am 22.08.2026:** Slash öffnet, Tippen filtert von zehn
Einträgen auf zwei, der aktive Eintrag ist sichtbar, Tab übernimmt ihn. Alles
ohne Maus.

**Nicht enthalten:** ein Dateiargument per Ziehen zu füllen. Das steht in der
Prosa von E7, nicht in seiner Abnahme, und es braucht einen eigenen Ziehpfad in
den ArgumentPicker.

`arasul-jet` #468.

## E8 Quellen bei jeder Antwort aus Dokumenten

Der leere Chat verspricht „Antworten kommen mit Quellen aus deinen Dokumenten".
Im Rundgang kam keine Quelle. Mit einem echten Dokument funktioniert es
(bestätigt als F-53), ohne passendes Dokument fehlt der Hinweis, warum keine
Quelle da ist.

**Abnahme:** Eine Frage mit passendem Dokument nennt Datei und Stelle. Eine Frage
ohne passendes Dokument sagt, dass nichts gefunden wurde.

### Warum keine Quelle kam

Kein Versäumnis, sondern ein Pfadwechsel: **`message.sources` füllt nur die alte
RAG-Pipeline.** Im Agent-Modus, der heute der Normalfall ist, steht dort nichts,
und die Zusage des leeren Chats hat keine Deckung.

Die Auskunft liegt aber vor, nur woanders: in den Schritten des Laufs. Jeder
Aufruf von `rag_suche` oder `dateien_lesen` steht dort mit seinen Parametern und
seinem Ergebnis. `quellenAusSchritten` liest sie zurück.

Das ist bewusst **deterministisch** und nicht dem Modell überlassen. Ein Modell
zu bitten, seine Quellen zu nennen, ist eine Bitte; eine Schrittliste ist ein
Protokoll. Und der Fall, um den es E8 eigentlich geht, ist ohnehin der, in dem
das Modell nichts zu nennen hat.

Zwei Fälle, der zweite ist der wichtigere:

|          |                                                                                             |
| -------- | ------------------------------------------------------------------------------------------- |
| gefunden | Datei und Stelle, klickbar. Die Stelle ist der Ausschnitt, auf den sich die Antwort stützt  |
| nichts   | ein Satz mit dem Suchbegriff, plus der Hinweis, dass die Antwort aus dem Modellwissen kommt |

Hat der Lauf gar nicht in Dokumenten gesucht, steht dort nichts. Ein „keine
Quellen" unter jeder Plauderei wäre Lärm. Schreiben und Auflisten zählen nicht
als Quelle: geschrieben wird kein Wissen, und eine Ordnerliste ist keine Stelle.

`arasul-jet` #469.

## E9 Eine klare Aufgabe wird ausgeführt, nicht zurückgefragt

Gefunden am 22.08.2026 beim Live-Vergleich für D7, auf `main` und auf dem
gekürzten Stand gleichermaßen, Modell `qwen3-coder:30b`.

Die Bitte „Suche im Projekt nach Dateien mit der Endung .md und nenne mir die
ersten drei Pfade" nennt das Werkzeug (`dateien_suchen`), das Muster (`*.md`)
und die gewünschte Ausgabe. Der Agent ruft trotzdem kein Werkzeug auf, sondern
antwortet mit einer Rückfrage und Beispielen, wonach man denn suchen könne.

Für eine Vorführung wiegt das schwerer als jede Wartezeit: der Kunde stellt eine
eindeutige Aufgabe, und das Gerät stellt eine Gegenfrage. Regel 9 der
Agent-Anweisung verbietet genau das („Niemals eine Aktion ankündigen, ohne sie
auszuführen"), und die erste Zeile der Antwort lautet wörtlich „Ich suche".

Zu klären ist zuerst, woran es liegt, bevor am Prompt gedreht wird: ob das
Modell die Werkzeuge im `tools`-Parameter überhaupt sieht, ob es sie sieht und
verwirft, oder ob die Plan-Runde vor der Werkzeug-Runde die Rückfrage schon als
fertige Antwort behandelt.

**Abnahme:** Drei Aufgaben, die je ein anderes Werkzeug verlangen (Datei suchen,
Datei lesen, Datei schreiben), führen zum Aufruf genau dieses Werkzeugs, ohne
Rückfrage. Am Gerät belegt, mit dem Standardmodell und mit `qwen3-coder:30b`.

### Der Befund war falsch

Der Eintrag entstand am 22.08.2026 in Eile. Nachgemessen reproduziert er sich
nicht. Mit dem exakten Systemprompt des Produkts (Basisprompt,
Produktbeschreibung, Unternehmenskontext, Agent-Anweisung, Projektstruktur) und
allen zwölf Werkzeugen ruft jedes der beiden Modelle das richtige Werkzeug auf,
direkt, ohne Rückfrage.

### Was stattdessen real war, und schlimmer

Beim Nachmessen am Gerät, Chat 222:

```
Antwort:  Ich erstelle nun die Datei `notiz.md` mit dem gewünschten Inhalt.
          <function=dateien_schreiben> <parameter=pfad> notiz.md </parameter>
          <parameter=inhalt> Hallo Arasul </parameter> </function> </tool_call>
          Die Datei `notiz.md` wurde erfolgreich im Arbeitsordner erstellt.

Schritte: ["plan", "aufgaben", "todo_liste"]      ← kein dateien_schreiben
Platte:   notiz.md existiert nicht
```

Rohes XML im Chat, ein behaupteter Erfolg, keine Datei. Für eine Vorführung
schlimmer als eine Rückfrage: das ist keine Gegenfrage, das ist eine Lüge.

Drei Ursachen:

1. **Der Nachparser lief nur bei einer leeren Runde** (`!toolCalls.length &&
…`). In derselben Runde rief das Modell `todo_liste` korrekt auf, also war
   `toolCalls.length` größer als null, und der als Text geschriebene
   Schreibaufruf verschwand.
2. **Das XML lief live an die Anzeige.** `parseTextToolCalls` räumt den Text der
   Runde auf, aber `onToken` hat jedes Stück längst durchgereicht. Neu ist ein
   Zeichenautomat zwischen Strom und Anzeige; ein Regex reicht nicht, weil eine
   Marke regelmäßig mitten durchgeschnitten ankommt.
3. **Die einzeilige Form ergab Werte mit Leerzeichen.** `<parameter=pfad>
notiz.md </parameter>` wurde zu `" notiz.md "`, und ein Pfad mit führendem
   Leerzeichen ist kein Pfad.

`arasul-jet` #460.

### Und eine vierte Ursache, gefunden bei der Abnahme

Auf dem **Standardmodell** scheiterte jeder Agent-Lauf, der eine Aufgabenliste
anlegt, also jeder größere Auftrag. `Qwen3.8-27B` lehnt eine `system`-Nachricht
ab, die nicht die erste ist:

```
Jinja Exception: System message must be at the beginning.
```

Der Agent hängt aber genau so eine ans Ende, sobald eine Aufgabenliste
existiert. Mit `qwen3-coder:30b` fiel es nicht auf, dessen Vorlage ist
nachsichtiger.

Der Fehler war dabei doppelt verdeckt: `istToolsNichtUnterstuetzt` rief
`JSON.stringify` auf einem Node-Strom, dessen Socket-Geflecht ringförmig ist,
und warf im `catch`. Was Ollama sagte, was im Protokoll stand und was der Nutzer
las, waren drei verschiedene Dinge. `arasul-jet` #462.

### Live abgenommen am 22.08.2026

| Aufgabe         | `qwen3-coder:30b`   | `Qwen3.8-27B` (Standard) |
| --------------- | ------------------- | ------------------------ |
| Datei suchen    | `dateien_suchen`    | `dateien_suchen`         |
| Datei lesen     | `dateien_lesen`     | `dateien_lesen`          |
| Datei schreiben | `dateien_schreiben` | `dateien_schreiben`      |

Sechs von sechs, kein rohes XML im Text, keine Rückfrage.

---

# Phase F, Terminal

Geschätzt 14 Stunden. Hier verbringt der Nutzer den Großteil seiner Zeit.

## F1 Kopfzeile responsiv

„Verbunden", „intern", „Quick Launch", „KI-Zugang" und das Wiederholen-Symbol
brechen im Standardlayout auf zwei Zeilen. Das Terminal wird ständig in der
Größe verändert.

**Abnahme:** Bei jeder Breite zwischen 400 und 1800 Pixeln bleibt die Kopfzeile
einzeilig, notfalls durch Zusammenfassen in ein Menü. Behebt F-51.

### Erst gemessen, am Gerät

`scripts/test/terminal-abnahme.mjs` misst die **Höhe** der Kopfzeile bei
mehreren Fensterbreiten. Ein Umbruch verdoppelt sie, das ist eindeutig. Am
22.08.2026, vor dem Umbau:

| Fenster          | Panel          | Kopfzeile                   |
| ---------------- | -------------- | --------------------------- |
| 400 px           | 123 px         | **44 px**, also zwei Zeilen |
| 500 px           | 164 px         | **44 px**                   |
| 700 px           | 246 px         | **44 px**                   |
| 900 px           | 328 px         | 26 px                       |
| 1200 bis 1800 px | 376 bis 386 px | 25 bis 26 px                |

Die Zahl, die zählt, ist die des **Panels**, nicht die des Fensters: der Nutzer
zieht das Panel schmal, während das Fenster breit bleibt. Bei 400 Pixeln Fenster
sind es 123 Pixel Panel.

### Die Ursache stand wörtlich im Markup

```tsx
<div className="flex flex-wrap items-center justify-between …">
```

`flex-wrap`, mit einem Kommentar daneben, der es als Lösung beschreibt: „bei
sehr schmalem Panel rutscht der Reconnect in die nächste Zeile, statt dass
Infrastruktur & Co. ihn überlappen". Es war der Ausweg vor einem Überlappen,
und er hat den Umbruch eingeführt, über den jetzt geklagt wird.

### Was daraus wurde

Statt umzubrechen wird zusammengefasst, in drei Stufen, gesteuert über eine
**Container-Abfrage** (nicht über die Fensterbreite, siehe oben):

| ab       | was steht da                                                       |
| -------- | ------------------------------------------------------------------ |
| 34 rem   | Zustand, Modus, „Quick Launch", „KI-Zugang", Wiederholen           |
| 30 rem   | dazu: eine Fehlermeldung schrumpft auf ihr Symbol, Text im `title` |
| 26 rem   | dazu: der Modus zeigt nur seinen Anfangsbuchstaben                 |
| 20 rem   | dazu: der Verbindungszustand zeigt nur sein Symbol                 |
| darunter | dazu: „Quick Launch" und „KI-Zugang" liegen in **einem** Menü      |

**Nichts verschwindet.** Jeder Punkt bleibt erreichbar, und was nur noch als
Symbol dasteht, trägt seinen Text im `title`.

## F2 Farben

Das Grün passt nicht zum Produkt. Farbschema auf Blau und Grau, mit den
Standardfarben für Fehler und Warnung, die auch sonst gelten.

**Abnahme:** Kein Farbwert im Terminal, der nicht aus den Themenwerten stammt.

### Gemessen, nicht behauptet: hier war nichts zu tun

`scripts/test/terminal-abnahme.mjs` liest die **gerechneten** Farben jedes
Elements im Terminalbereich, nicht die Klassennamen im Quelltext, und vergleicht
sie mit den vierzehn Grundfarben des Themas. Am 22.08.2026:

**Kein Farbwert außerhalb der Themenwerte.** Das Grün, über das F2 klagt, ist
in Phase C mitgegangen; die Kopfzeile arbeitet durchgehend mit `text-primary`,
`text-destructive`, `bg-muted` und deren halbdurchsichtigen Ableitungen.

Zwei Dinge musste die Messung dafür lernen, und beide sind der eigentliche
Ertrag dieser Aufgabe:

- **Halbdurchsichtige Ableitungen sind Themenwerte.** `bg-primary/10` steht je
  nach Farbraum als `rgba(…)` oder als `oklab(… / 0.1)` da. Erkennbar sind beide
  am Alpha-Anteil, nicht an der Schreibweise. Ohne diese Unterscheidung meldete
  die erste Messung drei Verstöße, die keine waren.
- **Die ANSI-Palette von xterm ist ausdrücklich kein Verstoß.** Sie steht in
  `lib/terminalThemes.ts` als Literale, weil xterm keine CSS-Variablen lesen
  kann, und sie ist das, was ein Programm im Terminal anfordert, wenn es grün
  schreibt. Sie auf Blau zu ziehen hieße, `git diff` die Bedeutung seiner Farben
  zu nehmen und jede TUI unlesbar zu machen. Die Messung nimmt den xterm-Bereich
  deshalb bewusst aus, mit dieser Begründung im Code.

**Erfüllt am 22.08.2026, ohne Änderung am Produkt.** Der Wert dieser Aufgabe
liegt in der Messung, die es vorher nicht gab.

## F3 MCP-Server verwalten

Der Agent im Terminal soll MCP-Server selbst hinzufügen können, und diese sollen
über Sitzungen hinweg bestehen bleiben, nicht nur in der einen Shell.

Umfang: eine Verwaltung je Gerät, Auflisten, Hinzufügen, Entfernen, Prüfen der
Erreichbarkeit, sichtbar in der Oberfläche und über die Kommandozeile.

**Abnahme:** Ein hinzugefügter MCP-Server steht nach einem Neustart des
Containers in einer neuen Shell zur Verfügung.

### Erst gemessen: die Abnahme war schon erfüllt

Plan 017, Schritt 5, hat die Verwaltung bereits gebaut: `sandbox_project_connections`
(Tabelle 136), Geheimwerte AES-256-GCM verschlüsselt, und beim **Sitzungs-Start**
schreibt `terminalService` daraus `/workspace/.mcp.json` für Claude Code plus die
Codex-Konfiguration. Die Dateien sind erzeugt, nicht gepflegt; die Verbindungen
sind die Wahrheit.

Am 22.08.2026 am Gerät nachgestellt, genau in der Reihenfolge der Abnahme:

```
1. MCP-Server anlegen      POST /sandbox/projects/…/verbindungen
                           {name: abnahme-mcp, kind: mcp, command: npx, args: […]}
2. Container neu starten   docker restart arasul-sandbox-souveraenitaet
3. neue Shell oeffnen      Terminal im Browser
4. nachsehen               cat /workspace/.mcp.json
```

```json
{ "mcpServers": { "abnahme-mcp": { "command": "npx", "args": ["-y", "…", "/workspace/projekt"] } } }
```

**Erfüllt am 22.08.2026, ohne Änderung am Produkt.**

Ein Detail, das dabei auffiel und das man wissen muss: die Konfiguration
entsteht beim **Sitzungs-Start**, nicht beim Container-Start. Ein `docker
restart` allein schreibt sie nicht; sie erscheint, sobald jemand eine Shell
öffnet. Für die Abnahme ist das richtig herum, denn ohne Shell braucht sie
niemand.

### Was in der Prosa steht und noch fehlt

Die Aufgabenbeschreibung verlangt mehr als ihre Abnahme. Offen bleibt:

| offen                       | Bemerkung                                                             |
| --------------------------- | --------------------------------------------------------------------- |
| sichtbar in der Oberfläche  | es gibt keine Fläche dafür, nur die HTTP-Schnittstelle                |
| Prüfen der Erreichbarkeit   | ein hinterlegter Server wird nie angefasst, bis ihn ein Agent startet |
| Verwaltung je Gerät         | heute je Projekt                                                      |
| der Agent fügt selbst hinzu | er kann die Schnittstelle rufen, hat aber kein Kommando dafür         |

**Zur Verwaltung je Gerät ein Widerspruch:** je Projekt ist die bessere Bauform
und sollte bleiben. Ein Sandbox-Projekt ist die Isolationsgrenze des Geräts; ein
MCP-Server, der Dateizugriff auf `/workspace/projekt` gewährt, gehört genau
dorthin und nicht in eine geräteweite Liste, aus der ihn jedes Projekt erbt. Was
fehlt, ist nicht die geräteweite Ablage, sondern eine Fläche, auf der man sie je
Projekt sieht.

## F4 Claude Code arbeitet im gewählten Projekt

Der Agent im Terminal muss im Ordner des oben gewählten Projekts stehen, dort
schreiben dürfen und Verbindungen aufbauen können.

**Abnahme:** Nach einem Projektwechsel oben steht eine neu geöffnete Shell im
richtigen Ordner. Eine dort geschriebene Datei taucht ohne Neuladen im Dateibaum
auf.

### Erst gemessen: die eine Hälfte war schon da, die andere gar nicht

**Der Ordner stimmt.** Der Sandbox-Container bindet den Ablage-Ordner des
verbundenen Projekts als `/workspace/projekt` ein, und die Shell startet dort,
sobald es ihn gibt. Am 22.08.2026 nachgesehen:

```
sandbox_projects.slug = souveraenitaet
project_id            = 4419a0db-1fde-48b8-87c0-5bb144fa000b
Bind                  = data/projects/4419a0db-…:/workspace/projekt:rw
Eingabezeile          = sandbox@sandbox-souveraenitaet:/workspace/projekt$
```

Jedes Sandbox-Projekt hat eine eigene `project_id` und damit einen eigenen
Container mit eigener Einbindung. Ein Projektwechsel wechselt den Container.

**Die Datei taucht nicht auf.** Im Terminal geschrieben, dann gewartet:

| nach                        | im Dateibaum |
| --------------------------- | ------------ |
| 5 s                         | nein         |
| 15 s                        | nein         |
| 30 s                        | nein         |
| 60 s                        | nein         |
| **90 s**                    | **nein**     |
| nach dem Neuladen der Seite | ja           |

### Warum

Der Baum kommt aus einer Abfrage, und niemand sagt ihr, dass sich auf der
Platte etwas geändert hat. Es gab genau einen Takt, und der lief nur, solange
ein Eintrag noch indexiert wurde.

Das Terminal ist die eine Stelle, an der Dateien **an der Anwendung vorbei**
entstehen. Also lädt der Baum nach, solange es offen ist, und sonst nicht: ein
Dauertakt für alle Fälle wäre auf einem Gerät, das nebenher ein Modell rechnet,
eine schlechte Voreinstellung. Ein verstecktes Fenster fragt ohnehin nicht.

Die Regel steht als eigene Funktion da und nicht als Ausdruck in der Abfrage,
damit sie sich prüfen lässt, ohne den ganzen Explorer zu zeichnen.

### Live abgenommen am 22.08.2026

Datei im Terminal geschrieben, dann gewartet, ohne die Seite neu zu laden:

| nach | im Dateibaum |
| ---- | ------------ |
| 15 s | **ja**       |

Vor der Änderung stand sie auch nach neunzig Sekunden nicht da.

## F5 Darstellung insgesamt

Zeilenumbrüche mitten im Wort bei Pfaden, uneinheitliche Abstände, Bruch beim
Verkleinern. Das Terminal soll aussehen wie ein Terminal, nicht wie eine
Webseite mit Schrift in Festbreite.

**Abnahme:** Ein Pfad mit 120 Zeichen bricht an einer sinnvollen Stelle. Bei
jeder Größe bleibt der Inhalt lesbar.

### Erst gemessen, am Gerät

Die Klage nennt drei Dinge: Umbrüche mitten im Wort bei Pfaden, uneinheitliche
Abstände, Bruch beim Verkleinern. Gemessen am 22.08.2026 gilt nur das dritte,
und es gilt deutlich.

**Pfade brechen nirgends mitten im Wort.** Bei 500 Pixeln Fenster durchsucht,
jedes Blattelement mit einem Schrägstrich und mehr als 25 Zeichen: kein einziges
umbricht. Die Flächen des Produkts kürzen mit `truncate` und zeigen den vollen
Pfad im `title`. Was der Rundgang gesehen hat, war der Inhalt **im Terminal
selbst**, und dort bricht xterm an der Spaltengrenze um. Das ist kein Fehler,
das ist ein Terminal.

**Das Verkleinern bricht wirklich.** Bei sichtbarem Terminal gemessen:

| Fenster | rechtes Panel | davon Terminal |
| ------- | ------------- | -------------- |
| 400 px  | **142 px**    | **118 px**     |
| 600 px  | 223 px        | 202 px         |
| 800 px  | 304 px        | 287 px         |
| 1000 px | 386 px        | 362 px         |

118 Pixel sind bei 14 Pixeln Schriftgröße rund **dreizehn Spalten**. Ein Pfad
mit 120 Zeichen bricht darin zehnmal um, und lesbar ist gar nichts mehr.

### Warum das Panel so schmal wird

Die Arbeitsfläche verlangt nebeneinander: Aktivitätsleiste rund 48 Pixel,
Dateibaum mindestens 160, Mitte mindestens 30 Prozent, rechtes Panel höchstens
45 Prozent. Bei 400 Pixeln Fenster sind das zusammen über 500. Die Aufteilung
kann ihre eigenen Mindestbreiten nicht einhalten und verteilt Reste.

### Was daraus wurde

Unterhalb von 900 Pixeln gibt es keine drei Spalten mehr: der Dateibaum fällt
weg (die Aktivitätsleiste bleibt, er ist einen Klick entfernt), die Mitte darf
auf null schrumpfen, und das rechte Panel darf die ganze Breite nehmen. Der
Nutzer kann weiter ziehen; nur die Grenzen sind andere.

Die 900 sind gemessen und nicht gewählt: darunter ist eine dritte Spalte nicht
mehr sinnvoll unterzubringen, darüber schon.

---

# Phase G, Dateien, Projekte, GitHub, Wissen

Geschätzt 18 Stunden.

## G1 Vollständiger Dateibaum

Der Baum endet mit „Liste gekürzt, nicht alle Einträge werden angezeigt", ohne
Weg zum Rest. Beim Import erschien zusätzlich die Meldung, nicht alle Einträge
konnten gelesen werden.

Künftig: der Baum lädt nach, wenn man aufklappt, ohne Obergrenze in der Anzeige.
Ein Eintrag, der wirklich nicht lesbar ist, wird einzeln benannt, nicht pauschal.

**Abnahme:** Ein Projekt mit 5000 Dateien ist vollständig durchklickbar. Keine
Meldung über Kürzung. Behebt F-07.

### Erst gemessen: bei 5000 Dateien war nach 2000 Schluss

Am 22.08.2026 auf dem Orin, mit einem Projekt aus 50 Ordnern zu je 100 Dateien:

|                            |                              |
| -------------------------- | ---------------------------- |
| Dateien auf der Platte     | **5000**                     |
| Einträge in der Antwort    | **2000**                     |
| Kennzeichen in der Antwort | `gekuerzt: true`             |
| in der Oberfläche          | „Liste gekürzt", ohne Ausweg |

Der Deckel saß im Backend, nicht in der Anzeige: die Antwort trug den ganzen
Baum auf einmal und kappte ihn bei 2000.

### Was daraus wurde

Der Baum lädt **je Ebene** nach (`listEbene`, Deckel 1000 Einträge je Ordner),
und die Anzeige holt die Kinder erst beim Aufklappen. Damit gibt es keine Zahl
mehr, ab der etwas verschwindet, sondern nur noch Ordner, die man noch nicht
geöffnet hat. Beide Meldungen sind weg, „Liste gekürzt" und „liegt außerhalb des
geladenen Baums".

**Live abgenommen (#477):** im Browser durchgeklickt, `gross` → `ordner-01` bis
`ordner-50` → `datei-001.md` bis `datei-100.md`. Keine Kürzungsmeldung an
keiner Stelle. Die 5000 Testdateien sind danach vom Gerät entfernt.

Ein Nebenbefund aus derselben Messung, der **kein** Fehler ist: von den 5000
Dateien bekamen nur 100 eine Zeile in `documents`. Der Testdatensatz hatte
hundert verschiedene Inhalte, fünfzigmal wiederholt, und identischer Inhalt
wird über `content_hash` bewusst nur einmal indexiert. Die Dateien bleiben
sichtbar und herunterladbar.

## G2 Projekt anlegen aus Ordner oder GitHub

Zwei Wege, beide sichtbar: einen vorhandenen Ordner importieren oder ein
GitHub-Repository klonen.

**Abnahme:** Beide Wege führen zu einem Projekt, das oben wählbar ist, im
Dateibaum vollständig erscheint und im Terminal und Chat verfügbar ist.

### Erst gemessen: es gab keinen der beiden Wege

`POST /api/projects` nahm `name`, `description`, `icon`, `color` und `vorlage`.
Kein Ordner, kein Repository. Im Anlege-Dialog stand die Vorlagen-Galerie und
sonst nichts.

### Was daraus wurde, und warum kein neuer Endpunkt

Der Dialog bekommt eine **Herkunft**: leer oder Vorlage wie bisher, einen
vorhandenen Ordner übernehmen, oder ein GitHub-Repository klonen. Beide neuen
Wege setzen nur zusammen, was es schon gibt:

| Weg    | Ablauf                                                                       |
| ------ | ---------------------------------------------------------------------------- |
| Ordner | `POST /projects` → je Datei `POST /projects/:id/dateien/upload` mit `ordner` |
| GitHub | `POST /projects` → `POST /git/:id/connect` → `POST /git/:id/sync`            |

Ein eigener Import-Endpunkt wäre eine dritte Stelle, an der dieselbe Ablage
befüllt wird. Und weil `PROJECT_GIT_DIR/<id>` und die Ablage **derselbe Ordner**
sind (siehe G3), landet der Klon direkt im Dateibaum, im Terminal unter
`/workspace/projekt` und im Chat. Die Abnahme fällt damit mit dem Weg zusammen.

Die Stelle, die still falsch wird, steht als eigene geprüfte Funktion da: der
Browser liefert bei einem Verzeichnis-Upload immer den **gewählten** Ordner als
erstes Segment. Bliebe es stehen, läge der ganze Import eine Ebene zu tief, und
das merkt niemand, bis jemand im Dateibaum nachsieht.

Beim Bauen gefunden und behoben: der Namensvorschlag setzte den Namen nach dem
**ersten Zeichen** der Adresse (`if (!name.trim())` trifft nur beim allerersten
Tastendruck zu), im Feld stand danach `h`.

**Stand (#484):** gebaut, 24 Tests. Der Ordner-Weg ist am Gerät nachzumessen.
Der GitHub-Weg braucht ein Repository und einen Zugangsschlüssel von Kolja,
genau wie D9 und G3.

## G3 GitHub-Kopplung in der Oberfläche

`routes/git.js` kann bereits koppeln, holen und schieben, je Projekt, mit
maskiertem Zugangsschlüssel. In der Oberfläche ist davon zu wenig zu sehen.

Umfang: Zustand der Kopplung, Änderungen gegenüber dem Stand auf GitHub, Holen,
Übertragen, Zweig wechseln, Konflikt sichtbar machen.

**Abnahme:** Ein Repository koppeln, im Terminal ändern, aus der Oberfläche
übertragen, die Änderung ist auf GitHub sichtbar. Alles ohne die Kommandozeile.

### Erst gemessen: vier von sechs Punkten waren da

| Punkt aus dem Umfang                      | vorher      |
| ----------------------------------------- | ----------- |
| Zustand der Kopplung                      | da          |
| Änderungen gegenüber dem Stand auf GitHub | **fehlte**  |
| Holen                                     | da, im Sync |
| Übertragen                                | da          |
| Zweig wechseln                            | **fehlte**  |
| Konflikt sichtbar machen                  | da          |

### Der Fund, der wichtiger war als die Aufgabe

Beim Lesen des Kopplungswegs fiel auf, dass `gitSyncService` seinen Arbeitsbaum
für einen container-lokalen Wegwerf-Checkout hält. Das steht so im Kopf der
Datei. Es stimmt nicht:

```js
// gitSyncService.js
const PROJECT_GIT_DIR = process.env.PROJECT_GIT_DIR || '/arasul/projects';
// ablageService.js
const ABLAGE_DIR = process.env.PROJECT_GIT_DIR || '/arasul/projects';
```

Dasselbe Verzeichnis, beide hängen die Projekt-ID an. Es ist die Ablage: was im
Dateibaum steht, was das Terminal sieht, was der Chat liest. **An drei Stellen
wurde es rekursiv gelöscht.**

| Stelle           | Bedingung                  | Wirkung                    |
| ---------------- | -------------------------- | -------------------------- |
| `synchronisiere` | kein `.git` vorhanden      | `fs.rm(cwd)`, dann `clone` |
| `synchronisiere` | Repo oder Zweig gewechselt | `fs.rm(cwd)`, dann `clone` |
| `trenne`         | immer                      | `fs.rm(checkoutPfad(id))`  |

Der erste ist der Normalfall: ein Projektordner ist kein Git-Repo, bis er
gekoppelt wird. Wer also ein bestehendes Projekt an ein Repository koppelt und
auf Synchronisieren drückt, verliert beim ersten Lauf alles, was nicht im Repo
steht. Der dritte ist noch direkter: der Knopf **Kopplung trennen** löscht alle
Dateien des Projekts.

Der Rechnungs-Schutz aus Plan 014 sitzt vor `trenne` und zeigt, dass das
jemandem schon einmal aufgefallen ist. Er schützte die Rechnungen und nicht die
Arbeit.

**Behoben (#482):** der Projektordner wird selbst zum Arbeitsbaum, statt durch
einen Klon ersetzt zu werden. `.git` neu anlegen, den Bestand als Commit
festhalten, die Ferne dazuholen; ein leerer Ordner nimmt `reset --hard`. Der
Merge bekommt `--allow-unrelated-histories`, weil lokaler Bestand und Ferne beim
ersten Sync zwei getrennte Historien sind. Gelöscht wird nur noch `cwd/.git`.
Vier Tests prüfen dabei nicht Git, sondern die Platte.

### Was aus der eigentlichen Aufgabe wurde

**Änderungen (#486):** `GET /api/git/:projectId/aenderungen` liefert die
geänderten Dateien mit Art, dazu voraus und zurück in Commits. Bewusst **ohne
Netz**: die Anzeige hängt in der Statusleiste, und ein `fetch` bei jedem Öffnen
wäre auf einem Gerät, das offline laufen können muss, der falsche Tausch.
Verglichen wird mit dem zuletzt geholten Stand, und die Anzeige schreibt
darunter, wann das war. Ein Test hält das fest.

**Zweigwechsel (#486):** keine eigene Route. Koppeln mit demselben Repository
und einem anderen Zweig **ist** der Wechsel; der gespeicherte Schlüssel bleibt.
Dass das gefahrlos ist, kommt aus #482 — vorher hätte ein Zweigwechsel den
Projektordner geleert.

**Offen:** die Abnahme selbst. Koppeln, im Terminal ändern, übertragen, auf
GitHub nachsehen — dafür braucht es ein Repository und einen persönlichen
Zugangsschlüssel von Kolja. Sie bleibt offen wie die positive Strecke bei D9.

## G4 Indexierung beschleunigen

Eine Datei mit 739 Byte brauchte eine Minute und 53 Sekunden. Das ist kein
Durchsatzproblem, sondern Wartezeit an falscher Stelle, vermutlich Kaltstart des
Einbettungsmodells und Taktung der Warteschlange.

**Abnahme:** Eine kleine Datei ist in unter fünf Sekunden durchsuchbar. Ein
Ordner mit 100 Dateien in unter zwei Minuten. Behebt F-49.

### Erst gemessen: der Indexer schläft, während die Arbeit wartet

Am 22.08.2026 auf dem Orin, mit 93 wartenden Dokumenten:

|                                       |                    |
| ------------------------------------- | ------------------ |
| `documents` auf `pending`             | **93**             |
| CPU des Indexers                      | **0,01 Prozent**   |
| Zeit für ein Dokument, laut Protokoll | rund **1 Sekunde** |

Und die Zeile, die alles erklärt:

```
Scan cycle cap reached (10 docs); remaining pending documents
will be picked up in next cycle.
```

Zwei Werte stehen dahinter: `DOCUMENT_INDEXER_INTERVAL = 30` und
`DOCUMENT_INDEXER_MAX_DOCS_PER_CYCLE = 10`. Der Indexer nimmt zehn Dokumente,
arbeitet sie in rund zehn Sekunden ab und schläft dann dreißig. Bei hundert
Dateien sind das zehn Runden, also **fünf Minuten Wartezeit für zehn Sekunden
Arbeit**.

Die gemeldeten 1:53 Minuten für eine Datei mit 739 Byte sind damit erklärt: sie
war fast vollständig Warten auf den nächsten Zyklus.

### Was daraus wurde

**Der Indexer wird geweckt.** `POST /scan` gibt es seit langem im Indexer, und
niemand hat ihn je gerufen. Der Ordner-Sync tut es jetzt, sobald er etwas Neues
oder Geändertes gespiegelt hat. Ohne `await` und ohne Fehlerbehandlung nach
außen: der Sync ist fertig, ob die Nachricht ankommt oder nicht, und wenn nicht,
greift der eigene Takt wie bisher.

**Nach einem vollen Zyklus wird kurz durchgeatmet, nicht lange geschlafen.**
Bleibt Arbeit liegen, geht es nach `DOCUMENT_INDEXER_NACHBRENNER` Sekunden
weiter (Vorgabe 2) statt nach dreißig. Der Deckel selbst bleibt: er hält einen
Zyklus überschaubar, und der Wachhund sieht regelmäßig Leben. Nur das Schlafen
danach hatte keinen Sinn.

Aus fünf Minuten für hundert Dateien werden damit rechnerisch rund zwanzig
Sekunden.

### Die zweite Ursache, gefunden beim Nachmessen: die KI-Analyse lief zuerst

Nach dem ersten Eingriff blieb der Indexer langsam. Das Protokoll sagt, warum:

```
15:26:03  Generating summary for datei-018.md
15:26:37  Categorizing datei-018.md            (34 s später)
15:26:56  Extracting topics for datei-018.md   (weitere 19 s)
```

Drei Aufrufe ans Sprachmodell, für eine Datei mit wenigen Zeilen. Und sie liefen
**vor** dem Indexieren: das Dokument wurde erst danach auf `indexed` gesetzt,
war also über eine Minute lang nicht auffindbar, obwohl der Textlayer in rund
einer Sekunde fertig gewesen wäre.

Meine erste Rechnung („ein Dokument braucht rund eine Sekunde") stammte aus
einem Protokollausschnitt, in dem die Analyse übersprungen war. Sie war zu
optimistisch, und die Reihenfolge ist der größere Posten.

**Die Anreicherung ist Beiwerk, die Auffindbarkeit ist die Zusage.** Also erst
indexieren und den Status setzen, dann zusammenfassen, einordnen und Themen
ziehen. Eine gescheiterte Anreicherung kippt den Lauf nicht mehr: der Text ist
indexiert, die Zusammenfassung fehlt eben.

### Die dritte Ursache: die Anreicherung stand in der Warteschlange

Die Reihenfolge innerhalb eines Dokuments zu drehen reichte nicht. Am
22.08.2026 nach dem Deploy gemessen:

|                                      |                      |
| ------------------------------------ | -------------------- |
| Datei über die Ablage geschrieben    | 15:35:49             |
| Status nach zehn Minuten             | `pending`            |
| Dokumente davor in der Warteschlange | **71**               |
| Modell-Arbeit je Dokument            | rund **50 Sekunden** |
| daraus folgende Wartezeit            | über **eine Stunde** |

Zum Vergleich das Indexieren selbst, aus demselben Protokoll: 0,35 Sekunden.

```
15:37:49.898  Found pending document, will index: datei-030.md
15:37:50.247  Successfully indexed document: datei-030.md (1 chunks)
15:37:50.247  Running AI analysis for datei-030.md
```

**Behoben (#481):** der Scan indexiert mit `anreichern=False`. Angereichert wird
erst danach und nur, wenn gerade nichts Neues wartet. Ein Dokument, das sich
dauerhaft nicht zusammenfassen lässt, hätte die Warteschlange dabei übernommen —
die Abfrage sortiert nach `updated_at`, und ein gescheiterter Versuch schreibt
nichts. Nach drei Versuchen wird eine leere Zusammenfassung eingetragen.

### Die vierte Ursache: zwei Zyklen liefen nebeneinander

Beim Nachmessen stand jede Zeile der Anreicherung **zweimal** im Protokoll, mit
Millisekunden Abstand, während 45 Dokumente warteten. Es gibt zwei Aufrufer von
`scan_and_index` und keinen Schutz: die eigene Schleife und der Thread aus
`POST /scan`, den der Ordner-Sync seit dem Weckruf-Umbau bei jeder Änderung
ruft. Aus einem theoretischen Rennen war der Normalfall geworden.

Zwei Folgen, beide schlecht. Erstens teilen sich beide Zyklen die wartenden
Dokumente, jeder sieht weniger als den Deckel und meldet `cap_reached = False`,
obwohl der Rückstau da ist — beide gehen daraufhin in die Nachhol-Anreicherung,
die genau dann nicht laufen soll. Zweitens holen beide dieselben Dokumente aus
der Anreicherungs-Abfrage und rechnen sie doppelt.

**Behoben (#483):** `scan_and_index` ist eine Schleuse. Ein abgewiesener
Weckruf geht nicht verloren, er verkürzt die Pause danach.

### Die fünfte Ursache: die Anreicherung wich nicht

Der Rückstau-Schutz prüfte nur **vor** der Runde. Eine Runde dauerte drei
Dokumente lang, je rund fünfzig Sekunden, und der Weckruf trifft mitten hinein.
Gemessen: hundert frisch geschriebene Dateien auf `pending`, null davon
indexiert, während der Indexer in aller Ruhe ein altes Dokument zusammenfasste.

**Behoben (#485):** die Runde prüft zwischen zwei Dokumenten und bricht ab. Der
Deckel je Runde fällt von drei auf eins — ein Weckruf kann nur zwischen zwei
Dokumenten greifen, nie mitten in einem Modellaufruf, der Deckel ist also die
Wartezeit im schlechtesten Fall.

### Die sechste Ursache lag gar nicht im Indexer

Nach alldem brauchte eine einzelne Datei immer noch **315 Sekunden**. Schuld war
der Ordner-Abgleich davor:

```
18:26:45  Failed to delete from Qdrant after retries for doc 52972b3b… : getaddrinfo EAI_AGAIN qdrant
18:26:50  Failed to delete from Qdrant after retries for doc 766a7239… : getaddrinfo EAI_AGAIN qdrant
```

Fünf Sekunden je gelöschtem Dokument. Seit Plan 021, Schritt 8 liegt `qdrant` im
Compose-Profil `classic-rag` und startet nicht mit; der Name löst gar nicht auf.
Jedes Löschen lief trotzdem in drei Versuche mit Wartezeit dazwischen, gegen
einen Dienst, den es hier nicht gibt. Für einen Ordner mit hundert Dateien sind
das über acht Minuten, in denen der Abgleich nichts anderes tut und neue Dateien
keine Zeile bekommen.

**Behoben (#487):** sagt das Netz „diesen Rechner gibt es nicht", gilt Qdrant für
`QDRANT_PAUSE_MS` als abgeschaltet und jeder Aufruf kehrt sofort zurück. Ein
geglückter Aufruf hebt die Pause auf. Kein Flag: ein Flag müsste gepflegt werden
und träfe den Fall „läuft, ist aber gerade nicht erreichbar" nicht.

### Die siebte Ursache: das Fachwörterbuch

Nach alldem blieben 134,9 Sekunden für hundert Dateien. Der Blick in eine
einzelne Indexierung zeigt, wohin sie gehen:

```
17:01:57.606  Found pending document, will index: datei-001.md
17:01:57.625  Contextualized 1 chunks for parent 1/1
17:01:57.950  Domain dictionary updated: 9 new terms, 242012 total
17:01:57.959  Successfully indexed document
```

**0,33 von 0,35 Sekunden** für das Wörterbuch. Bei jedem Dokument wurde es ganz
von der Platte gelesen, um neun Wörter ergänzt, nach Häufigkeit sortiert,
zurückgeschrieben und in SymSpell nachgeladen. Bei hundert Dateien 33 Sekunden,
und die Zahl wächst mit dem Wörterbuch.

**Behoben (#491):** es liegt jetzt im Speicher und wird gesammelt geschrieben,
spätestens in jedem Zyklus ohne Rückstau. Verloren gehen kann nur, was seit dem
letzten Schreiben dazukam, und das ist abgeleitete Information.

### Was gemessen ist

|                                    | Abnahme         | gemessen    |
| ---------------------------------- | --------------- | ----------- |
| eine Datei, leere Warteschlange    | unter 5 s       | **2,3 s**   |
| eine Datei, 5 in der Warteschlange | (keine)         | 5,5 s       |
| 100 Dateien                        | unter 2 Minuten | **110,1 s** |

Der Weg dahin, jede Zahl am Gerät gemessen:

| Stand                            | 100 Dateien                 |
| -------------------------------- | --------------------------- |
| vor Phase G                      | 1:53 min für **eine** Datei |
| nach #487, Qdrant                | 96 von 100 nach 300 s       |
| nach #489, Analyse unterbrechbar | 161 s                       |
| nach #491, Wörterbuch            | **110,1 s**                 |

**G4 ist damit live abgenommen.** Sieben Ursachen, sechs davon erst beim
Nachmessen der jeweils vorigen Behebung sichtbar geworden.

## G5 Vektorsuche einschalten

Die Suche läuft heute auf der Textebene, die Vektorsuche ist aus. Damit ist die
Zusage „Antworten mit Quellen" nur halb eingelöst.

**Abnahme:** Eine Frage, die kein Wort aus dem Dokument enthält, findet die
richtige Stelle. Behebt F-50.

### Erst gemessen: die Vektorsuche ist nicht „aus", sie ist abgebaut

Am 22.08.2026 auf dem Orin:

|                                |                                                          |
| ------------------------------ | -------------------------------------------------------- |
| Container `qdrant`             | läuft nicht                                              |
| Container `embedding-service`  | läuft nicht                                              |
| `RAG_VEKTOR_SUCHE` im Backend  | nicht gesetzt                                            |
| `EMBEDDING_ENABLED` im Indexer | nicht gesetzt                                            |
| Protokoll des Indexers         | `Textlayer-only indexed … (Embedding aus — kein Qdrant)` |

Das ist kein vergessener Schalter. **Plan 021, Schritt 8 hat das klassische
Vektor-RAG durch agentisches ersetzt**; seither liegen beide Container im
Compose-Profil `classic-rag` und starten nicht mit. Dieselbe Planseite hält das
bei D5 bereits fest.

G5 verlangt damit die Rücknahme einer Architekturentscheidung, nicht das
Umlegen eines Schalters.

### Was das Einschalten kostet, gerechnet

| Posten              |                                                                   |
| ------------------- | ----------------------------------------------------------------- |
| `embedding-service` | eigener Container, `RAM_LIMIT_EMBEDDING=8G` auf diesem Gerät      |
| `qdrant`            | eigener Container plus Plattenplatz für die Vektoren              |
| Neu-Indexierung     | rund **1100** Dokumente, jedes einmal durch das Einbettungsmodell |
| Speicherlage heute  | 27 von 61 GB belegt, davon 18,6 GB allein das Sprachmodell        |

Der `embedding-service` rechnet auf derselben GPU wie das Sprachmodell. Ein
Chat, der während einer Neu-Indexierung läuft, teilt sie sich mit ihr.

### Entscheidung für Kolja, nicht für mich

Zwei Wege, beide vertretbar:

**Bei agentischem RAG bleiben.** Dann ist G5 hinfällig und die Zusage
„Antworten mit Quellen" wird anders eingelöst: der Agent sucht mit
`dateien_suchen` und liest mit `dateien_lesen`, und seit E8 sagt die Antwort,
worauf sie sich stützt und wonach vergeblich gesucht wurde. Die Abnahme von G5
(„eine Frage, die kein Wort aus dem Dokument enthält, findet die richtige
Stelle") ist damit **nicht** erfüllbar; eine Textsuche kann das nicht.

**Zurück zur Vektorsuche.** Dann ist es kein Schalter, sondern ein Vorhaben:
Profil starten, Indexer umstellen, Bestand neu einbetten, Speicher und GPU neu
verteilen, und die Karte in `PLATFORM_COMPATIBILITY.md` und der Wurzel-
`CLAUDE.md` nachziehen (beide zeigen noch auf die alte Welt, siehe D5).

**Nicht entschieden, weil es nicht meine Entscheidung ist.** Ein Profil zu
starten, das eine frühere Architekturentscheidung umkehrt, und dabei den
Speicher eines Geräts neu zu verteilen, während niemand hinsieht, wäre der
falsche Umgang mit einem Auslieferungsgerät.

---

# Phase H, eigene Anwendungen bauen und hosten

Geschätzt 16 Stunden. Der eigentliche USP. Bauform entschieden: die Erweiterung
bleibt ein Frontend und bekommt ihr Backend über die vorhandene Brücke, nicht als
eigener Prozess. Grund: ein Gerät mit 15 Containern und begrenztem Speicher
verträgt keine unbegrenzte Zahl zusätzlicher Prozesse, und die Brücke prüft
Freigaben bereits bei jedem Aufruf.

## H1 Die Brücke bekommt Server-Fähigkeiten

Heute darf eine Erweiterung über die Brücke auf freigegebene Arasul-Funktionen
zugreifen. Dazu kommen vier Fähigkeiten, jede einzeln freizugeben, jede im
Prüfprotokoll sichtbar:

| Fähigkeit                                      | Wofür                                     |
| ---------------------------------------------- | ----------------------------------------- |
| Ausgehende Aufrufe an erlaubte Ziele           | DATEV, Lexware, jede fremde Schnittstelle |
| Eigene Datenbanktabellen im eigenen Namensraum | Zustand der Anwendung                     |
| Eigene Dateiablage                             | Anhänge, erzeugte Dokumente               |
| Zeitgesteuerte Ausführung                      | nächtliche Abgleiche                      |

Die Ziele ausgehender Aufrufe stehen im Manifest und werden vom Backend
durchgesetzt, nicht von der Anwendung.

**Abnahme:** Eine Beispielanwendung ruft eine externe Schnittstelle auf, legt
Daten in einer eigenen Tabelle ab und läuft nachts einmal von selbst. Ohne
Freigabe scheitert jeder dieser drei Aufrufe mit einer verständlichen Meldung.

### Erst gemessen: eine der vier Fähigkeiten gibt es schon

| Fähigkeit                 | Stand                    |
| ------------------------- | ------------------------ |
| Ausgehende Aufrufe        | fehlte                   |
| Eigene Datenbanktabellen  | fehlte                   |
| **Eigene Dateiablage**    | **gab es seit Plan 017** |
| Zeitgesteuerte Ausführung | fehlte, teilweise        |

Die Dateiablage ist da: `bruecke/dateien` arbeitet in
`EXTENSIONS_DATA_DIR/<id>`, also einem eigenen Topf je Erweiterung, TOCTOU-sicher
über `pathSafe`. Der Compose-Kommentar sagt es ausdrücklich: „bewusst GETRENNT
von /arasul/projects".

„Teilweise" bei der Zeitsteuerung heißt: eine **Flow-Erweiterung** wird als
n8n-Workflow ausgerollt und aktiviert (`flowDeployService.liveSchalten` ruft
`/activate`), und n8ns Schedule-Trigger kann jeden Takt. Nur eine
App-Erweiterung im iframe konnte das nicht.

### Was daraus wurde

**Ausgehende Aufrufe (#493).** Die Ziele stehen im Manifest, durchgesetzt wird
im Backend. Drei Wände: die Fähigkeit, das Ziel, die aufgelöste Adresse.

Die dritte ist die wichtigste, und sie ist der Grund für ein eigenes Modul. Ein
Name im Manifest kann auf `127.0.0.1` oder `172.17.0.1` zeigen, absichtlich oder
weil jemand den DNS-Eintrag geändert hat, nachdem die Erweiterung installiert
war. Ohne sie wäre die zweite Wand eine Empfehlung, und eine Erweiterung mit
`netz` käme an Postgres, MinIO, Ollama, den Docker-Proxy und das Dashboard
selbst. Geprüft werden **alle** aufgelösten Adressen, nicht die erste.

Nur https, keine Umleitungen (eine Umleitung ist eine zweite Adresse, die
niemand geprüft hat), kein selbst gesetzter `cookie`.

**Eigene Tabellen (#495).** Je Erweiterung ein Schema `ext_<slug>`. Die
Erweiterung schickt **niemals SQL**: sie sagt, was sie will, und das SQL entsteht
im Backend aus geprüften Bezeichnern und gebundenen Werten. Eine Brücke, die SQL
durchreicht, wäre keine Brücke, sondern ein Datenbankzugang mit Extraschritten.

Ungültige Namen werden abgewiesen, nicht bereinigt: sonst läge die Tabelle unter
einem anderen Namen als die Erweiterung glaubt.

**Nächtliche Läufe (#496).** Was läuft, ist ein Flow, kein Code der Erweiterung
— die läuft im Browser, und nachts ist kein Browser offen. `HH:MM` statt Cron:
der Cron-Parser für Flow-Zeitpläne ist am 28.07.2026 ersatzlos entfernt worden,
und wer mehr braucht, baut eine Flow-Erweiterung.

Die zwei Fälle, an denen so etwas scheitert, sind beide abgedeckt: der letzte
Lauf wird tagesgenau verglichen (sonst liefe der Flow im Nachholfenster elfmal),
und ein Nachholfenster von zehn Minuten fängt ein Gerät ab, das um 03:00 gerade
neu startet.

### Live abgenommen am 22.08.2026, und sie hat drei Fehler gefunden

Eine Beispiel-Erweiterung `beispiel-drei` mit allen drei Fähigkeiten wurde auf
dem Orin registriert und benutzt. **Zwei der drei Fähigkeiten hatten nie
funktioniert**, und niemand hätte es gemerkt, ohne sie anzufassen.

| Was die Abnahme fand                                   | Ursache                                                                                                                                                 | behoben |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `tabellen` und `zeitplan` gaben **immer** HTTP 500     | `BrueckeTabellenBody` und `BrueckeZeitplanBody` standen im Schema-Modul, wurden aber nie exportiert. `validateBody(undefined)` wirft beim ersten Aufruf | #523    |
| Ohne Freigabe kam ein Zod-Feldname statt einer Meldung | `autorisieren` stand **nach** `validateBody`                                                                                                            | #523    |
| `schreiben` in die eigene Tabelle gab HTTP 500         | `z.record` braucht in Zod 4 **zwei** Argumente. Fünf Stellen betroffen                                                                                  | #525    |

Der dritte ist der unangenehmste: mit einem Argument baut das Schema, wirft
aber beim Parsen eines **nicht leeren** Objekts. Ein leeres geht durch, also
war jeder Test grün, der die Vorgabe prüft. Betroffen waren auch die
Kopfzeilen ausgehender Aufrufe und die Argumente eines Flow-Starts, das heißt:
**eine Erweiterung konnte noch nie einen Flow mit Argumenten starten.**

Danach, am Gerät gemessen:

| Fähigkeit          | Beleg                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Ausgehende Aufrufe | `https://example.com/` gibt HTTP 200. `https://api.github.com/` gibt `FORBIDDEN` und nennt das Erlaubte |
| Eigene Tabellen    | anlegen, schreiben, lesen, gezielt suchen. Schema `ext_beispiel_drei`                                   |
| Isolation          | `lesen` auf `users` gibt `NOT_FOUND`, die Erweiterung sieht nur ihren Namensraum                        |
| Zeitplan           | Eintrag für 03:00 angelegt und gelistet. `25:99` gibt `VALIDATION_ERROR` mit erklärendem Satz           |
| Ohne Freigabe      | alle drei geben `UNAUTHORIZED`, weil ohne Freigabe kein Brücken-Token entsteht                          |

**Was daraus zu lernen ist, und es ist dasselbe wie eine Woche davor bei
`BRUECKE_FAEHIGKEITEN`:** die Tests prüften die Dienste gründlich und die
Verdrahtung gar nicht. Beide Wächter, die jetzt mitkommen, vergleichen die
Routen-Datei mit dem, was das Modul wirklich hergibt.

### Nachgemessen am 23.08.2026, diesmal AUS EINER APP (#549)

Die Messung oben lief mit einem Brücken-Token von außen, nicht aus dem
Rahmen einer laufenden Erweiterung. Die Abnahme sagt aber „eine
Beispielanwendung ruft". Nachdem #548 den Weg in den Rahmen überhaupt erst
geöffnet hat, ist das nachgeholt, und es lagen noch zwei Schichten dazwischen.

**Erstens: die drei Fähigkeiten standen nicht in `arasul-bruecke.js`.** Das ist
die Datei, mit der eine Erweiterung die Brücke benutzt, und sie kannte `netz`,
`tabellen` und `zeitplan` nicht. Einen allgemeinen Ausweg bietet sie auch
nicht, sie gibt den Token nicht heraus. Aus einer App waren die drei damit
unerreichbar. Dazu kam: die Werkstatt-Vorlagen werden nur **einmal** ausgesät
und danach nie überschrieben, die Datei hätte ein bestehendes Gerät also
ohnehin nie erreicht. Und weil ein gebautes Paket seine Kopie in sich trägt,
wäre der Fehler in jede dort gebaute App mitgewandert.

**Zweitens: der nächtliche Lauf startete nie.** Der Zeitplan feuerte pünktlich,
und der Lauf starb in derselben Sekunde an
`null value in column "user_id" of relation "flow_runs"`. `taktLauf` rief den
Flow mit `userId: null` auf, und drei Tests hielten genau das als Zusicherung
fest. Die dritte Zusage aus H1 war damit auf keinem Gerät je erfüllbar.

Danach, aus dem Rahmen einer eigens gebauten App gemessen (`erweiterung neu`,
Manifest mit `netz`, `tabellen`, `zeitplan`, Ziel `https://example.com/`):

| Zusage                           | Beleg                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------- |
| ruft eine externe Schnittstelle  | `ArasulBruecke.netz('https://example.com/')` gibt HTTP 200, 559 Zeichen       |
| fremdes Ziel                     | benannt abgewiesen, mit der Liste des Erlaubten                               |
| legt Daten in eigener Tabelle ab | anlegen, schreiben, lesen: die Zeile kommt mit `wert: "Paris"` zurück         |
| läuft von selbst                 | Zeitplan auf die nächste Minute, Lauf 105 startet unter Nutzer 1, kein Fehler |
| ohne Freigabe                    | `llm` gibt „Fähigkeit „llm" ist für „pruef-faehigkeiten" nicht freigegeben"   |

Die Prüf-App ist danach entfernt, samt Zeitplan und ihrem `ext_`-Schema. Damit
ist H1 erledigt.

## H2 Ein Weg vom Terminal zur laufenden App

Heute registriert der Watcher jede Werkstatt mit `manifest.json` automatisch. Was
fehlt, ist der Weg dorthin: ein Befehl im Terminal, der ein Gerüst anlegt, und
eine sichtbare Kette von der Werkstatt über die Registrierung bis zum Tab.

**Abnahme:** Vom leeren Projekt bis zur sichtbaren, funktionierenden Anwendung
im Tab in unter zehn Minuten, ohne Wissen über den Aufbau des Manifests.

### Die Paket-Kette, am 23.08.2026 gemessen (#554)

H3 fragt, ob ara-kit und das Terminal dasselbe Paket erzeugen. Das braucht
Koljas Repository. Was ohne ihn messbar war, ist die Kette selbst, und die ist
der Weg, den ein Partner geht: bauen, herunterladen, auf einem Kundengerät
einspielen, forken, weiterbauen, zurückrollen.

`scripts/test/paket-abnahme.mjs` läuft sie als Ganzes ab, weil ihre Glieder
einzeln grün sein können und zusammen trotzdem nichts ergeben. Elf von elf auf
dem Orin. Was zurückkommt ist dasselbe, was rausging, und `rollback` geht
genau einen Schritt zurück, nicht irgendeinen: jeder Stand trägt dafür ein
eigenes Kennzeichen im Paket.

Zwei rote Punkte im ersten Lauf waren mein Messfehler, nicht das Gerät.

### Flow-Erweiterungen: der Negativpfad ist belegt, der Positivpfad braucht dich

`N8N_API_KEY` ist auf dem Orin gesetzt, aber leer. Das Einschalten einer
`flow`-Erweiterung antwortet daraufhin mit

    503 n8n-API-Zugang fehlt oder ist ungültig (N8N_API_KEY),
        Flow-Erweiterung nicht importierbar

und `GET /:id/flow-status` bleibt lesbar (`erreichbar: true, importiert:
false, aktiv: false`), statt zu brechen. Genau das sagt H4 zu, und es hält.

Der Positivpfad braucht einen n8n-API-Schlüssel. Den lege ich nicht selbst auf
dem Gerät an: das ist eine Zugangsberechtigung, keine Messung.

## H3 ara-kit geht denselben Weg

Ein Partner baut über ara-kit, ein Unternehmen im Terminal. Beide müssen dasselbe
Ergebnis erzeugen, mit demselben Manifest und denselben Fähigkeiten.

**Abnahme:** Dieselbe Anwendung, einmal über ara-kit und einmal im Terminal
gebaut, ergibt dasselbe Paket.

## H4 n8n als Beispielerweiterung, im richtigen Design

Das eingebettete n8n ist vollständig englisch und hell mitten in einer deutschen,
schwarzen Oberfläche, mit eigener Akzentfarbe Orange. Das ist der auffälligste
Bruch des ganzen Rundgangs.

Künftig: n8n folgt dem Theme von Arasul, hell wenn hell, dunkel wenn dunkel, und
benutzt Arasuls Akzentfarbe. Gleichzeitig wird n8n zur Vorlage dafür, wie man ein
fremdes Open-Source-Projekt als Erweiterung einbindet.

Der CSP-Verstoß beim Einbetten bleibt vorerst offen, er ist folgenlos.

**Abnahme:** Ein Themenwechsel in Arasul verändert n8n mit. Kein Orange. Der Weg
„fremdes Projekt zur Erweiterung machen" ist als Anleitung belegt. Behebt F-14,
F-17.

### Wie das geht, aus der laufenden Fassung gelesen

Nicht aus n8ns Dokumentation, sondern aus dem, was auf dem Gerät liegt (n8n
**2.29.10**, `n8n-editor-ui/dist/assets/*`, gelesen am 22.08.2026):

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| Akzent | `--color--primary--h: 7`, `--s: 100%`, `--l: 68%` auf `:root` |
| Thema  | `body[data-theme]`, gemerkt unter dem Schlüssel `N8N_THEME`   |

Alles Weitere leitet n8n aus den drei HSL-Teilen ab. Bis auf die eigene
Orange-Leiter `--color--orange-50` bis `-950`, die nicht am Akzent hängt und
stehen geblieben wäre. Ersetzt wird nur der Farbton; die Helligkeit jeder Stufe
bleibt, sonst kippen die Kontraste, die n8n damit baut.

Die Arasul-Farbe wird zur Laufzeit aus dem eigenen Dokument gelesen, nicht als
Zahl hinterlegt: Arasul hat je Thema eine andere, und eine zweite Stelle mit
derselben Farbe wäre beim nächsten Umfärben falsch.

### Live abgenommen, 22.08.2026

Im Browser gegen den Orin, im n8n-Dokument selbst gemessen (#492):

```
{"thema":"dark","stilDa":true,"h":"210","s":"34%","l":"63%",
 "orange500":"hsl(210 34% 50%)","gespeichert":"dark"}
```

Sieben von sieben grün. Kein Orange mehr, weder im Akzent noch in der Leiter.

### Was bleibt: n8n ist weiter englisch

Der Befund oben nennt zwei Brüche, hell und englisch. Der erste ist behoben,
der zweite nicht, und zwar nicht aus Nachlässigkeit: die installierte Fassung
bringt **keine deutschen Texte mit**. Weder ein `i18n`-Ordner noch ein einziger
deutscher String steht im Build; `N8N_DEFAULT_LOCALE=de` änderte deshalb nichts.
n8n selbst zu übersetzen ist ein eigenes Vorhaben, keine Zeile in diesem Plan.

Die Abnahme verlangt Themenwechsel, kein Orange und die Anleitung. Alle drei
sind erfüllt.

## H5 Erweiterungen sichtbar und schaltbar

Aktive Erweiterungen erscheinen links in der Leiste und lassen sich dort öffnen.
Der Schalter im Katalog wirkt heute sofort und schließt offene Tabs ohne
Rückfrage. Die Schalterbeschriftung ist uneinheitlich, „Im Workspace sichtbar"
gegen „Selbst gebaut".

**Abnahme:** Eine aktive Erweiterung steht links. Ausschalten fragt einmal nach,
wenn Tabs offen sind. Alle Schalter tragen dieselbe Beschriftung. Behebt F-11,
teilweise F-37.

### Erst gemessen

„Eine aktive Erweiterung steht links" war schon erfüllt: die Activity-Bar zeigt
aktivierte App-Erweiterungen. Die beiden anderen Punkte nicht.

| Karte          | Text neben dem Schalter | was er beschreibt         |
| -------------- | ----------------------- | ------------------------- |
| Kern-App (n8n) | „Im Workspace sichtbar" | den Zustand des Schalters |
| Paket          | „Selbst gebaut"         | die Herkunft des Pakets   |

Derselbe Schalter, dieselbe Stelle, zweierlei daneben. Wer das liest, rät, was
der Schalter tut.

Und die Rückfrage fehlte ganz: `setAppEnabled` schloss die offenen Tabs der App
wortlos. Wer in einem n8n-Workflow mitten in einer Eingabe stand, verlor sie.

### Ein dritter Punkt, der im Plan nicht steht

Für Pakete schloss gar nichts: `setExtensionEnabled` fasst keine Tabs an. Der
Tab einer ausgeblendeten Erweiterung blieb offen stehen und zeigte etwas, das
laut Schalter nicht mehr da ist.

### Was daraus wurde (#490)

Beide Karten tragen dieselbe Beschriftung, die Herkunft steht bei den Merkmalen.
Ausschalten fragt einmal, mit der Zahl der betroffenen Tabs; einschalten fragt
nie, da geht nichts zu. Ein Paket schließt jetzt seine eigenen Tabs, ein fremdes
Paket bleibt unangetastet.

### Vierter Punkt: der Tab öffnete sich, und dahinter war nichts (#548)

Am 23.08.2026 die ganze sichtbare Kette gemessen, nicht nur den Schalter:
einschalten, Knopf links, Tab in der Mitte — und darin die KI-Brücke. Der Tab
öffnete sich, die App zeichnete ihre Oberfläche, und daneben stand:

    net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin
    /api/extensions/beispiel-app/app/arasul-bruecke.js

Ein Blick auf den Tab hätte grün gesagt. Vier Schichten lagen übereinander, und
jede musste einzeln gemessen werden, weil die darüber die darunter verdeckte:

1. **CORP.** Der Rahmen läuft absichtlich ohne `allow-same-origin`, hat also
   einen opaken Origin. Helmets Vorgabe `Cross-Origin-Resource-Policy:
same-origin` blockiert damit jede Antwort dieses Servers.
2. **Das Cookie kam gar nicht mit.** `arasul_session` ist `SameSite=Strict`,
   und jede Unteranfrage aus einem opaken Dokument zählt als cross-site — also 401. Nur die Startdatei kam an, weil ihr Abruf eine Navigation des
   Elternfensters ist. Damit konnte in einer App-Erweiterung **überhaupt keine
   Datei** nachladen, kein Stylesheet, kein Bild. Die Lösung ist ein
   kurzlebiger Lese-Token im PFAD des Rahmens; relative Verweise erben ihn von
   selbst, und `SameSite` bleibt, wie es ist.
3. **Der Vorabflug.** `brueckeCors` lässt `Origin: null` ausdrücklich zu — kam
   aber nie dran, weil der globale CORS-Wächter vor dem Router läuft und den
   OPTIONS-Aufruf mit 403 beantwortete.
4. **Traefik.** `POST .../bruecke/llm` streamt, stand aber am allgemeinen
   `/api`-Router hinter `body-limit`. Direkt am Backend kam der Strom an, über
   Traefik brach er sofort ab.

Damit steht fest: die KI-Brücke hat aus einer App-Erweiterung heraus noch nie
funktioniert, seit sie in Plan 017 gebaut wurde. Getestet war sie mit einem
Token von außen, nicht aus dem Rahmen.

Die Abnahme ist `scripts/test/erweiterung-abnahme.mjs`. Sie prüft nicht, ob
etwas erscheint, sondern den Text, den nur eine **antwortende** Brücke erzeugt,
und stellt danach eine echte Frage ans Modell. Auf dem Orin: 5/5, die App
bekommt „Paris".

---

# Phase I, Flows

Geschätzt 16 Stunden.

## I1 Bedienung vereinfachen

Rollen, Werkzeuge und Schritte gleichzeitig zu konfigurieren überfordert. Gesucht
ist eine Oberfläche, die jemand ohne tiefe Technikkenntnis bedienen kann, ohne
dass komplexe Abläufe unmöglich werden.

Vorgehen: die Anlage eines Flows läuft künftig in einer Reihenfolge statt in
einem Formular. Erst was soll herauskommen, dann welche Schritte, dann optional
Rollen und Werkzeuge je Schritt. Was nicht gesetzt wird, bekommt einen sinnvollen
Standard.

**Abnahme:** Ein Flow mit drei Schritten entsteht in unter fünf Minuten ohne
Dokumentation. Ein Flow mit Subagenten bleibt möglich.

### Erst gemessen: das Formular ist schon eine Reihenfolge

Der Flows-Umbau vom 02.08.2026 hat genau das gebaut, was hier steht: drei
nummerierte Abschnitte in Alltagssprache, plus ein eingeklappter Bereich mit dem
Technischen.

| Abschnitt           | was darin steht                            |
| ------------------- | ------------------------------------------ |
| ① Was soll er tun?  | Name, Beschreibung, Auftrag                |
| ② Welche Eingaben?  | Argumente                                  |
| ③ Was kommt heraus? | Format, Vorlage, Länge, Aufbau             |
| Erweitert (zu)      | Werkzeuge, Ordner, Ablauf, Grenzen, Modell |

Subagenten stehen unter „Erweitert" und bleiben damit möglich, ohne im Weg zu
stehen. Der zweite Teil der Abnahme ist erfüllt.

Mit I2 kommt ein vierter Abschnitt dazu: „Darf der Flow zwischendurch fragen?"
Bewusst NICHT unter „Erweitert" — das ist keine technische Stellschraube,
sondern die Frage, ob der Flow den Nutzer beim Laufen anspricht.

**Offen:** die Fünf-Minuten-Messung. Sie braucht jemanden, der die Oberfläche
zum ersten Mal sieht; ich bin dafür der falsche Prüfer.

## I2 Zwei Betriebsarten

Ein Flow läuft entweder mit Rückfragerunden oder vollständig autonom. Das wird
beim Anlegen gewählt und beim Start noch einmal angezeigt.

**Abnahme:** Derselbe Flow läuft in beiden Betriebsarten durch. Autonom stellt er
keine Frage, sondern trifft die Annahme und schreibt sie mit.

### Erst gemessen: die eine Betriebsart gibt es schon

Der zweite Satz der Abnahme beschreibt wörtlich, was Flows heute tun, und zwar
als Nutzer-Entscheidung:

```js
// services/flows/pruefung.js
// Statt Rückfragen gilt das ANNAHMEN-PROTOKOLL (Nutzer-Entscheidung §8):
// Annahmen aus der Prüfrunde + verbliebene [offene Stellen] werden
// strukturiert am Lauf gespeichert und im Ergebnis sichtbar gemacht.
```

Es fehlte also nicht die autonome Art, sondern die andere.

### Was daraus wurde (#500)

`betriebsart: autonom | rueckfragen`, Vorgabe `autonom`. **Die Vorgabe ist
Absicht:** jeder vorhandene Flow bleibt genau so, wie er war, und ein Flow, der
ungefragt anhält, wäre für einen n8n-Start oder einen nächtlichen Lauf das Ende.
Dort sieht niemand die Frage. Der Serializer schreibt die Zeile nur, wenn sie
vom Standard abweicht.

Das Werkzeug `frage_nutzer` liegt in `autonom` **gar nicht** im Werkzeugkasten.
Nicht als gesperrte Variante: ein Modell, das ein Werkzeug sieht, benutzt es
irgendwann, und die Zusage „autonom fragt nie" hält nur, wenn es die Frage nicht
geben kann.

## I3 Rückfragen mit Auswahl

Bei Rückfragerunden bekommt der Nutzer eine Frage mit begründeten
Empfehlungen zur Auswahl und zusätzlich ein Freitextfeld. Erste Option ist die
Empfehlung.

**Abnahme:** Eine Rückfrage im laufenden Flow zeigt bis zu vier Optionen und ein
Freitextfeld, die Antwort fließt in den weiteren Lauf ein.

### Gebaut (#500)

Bis zu vier Optionen, die erste ist die Empfehlung, und **immer** ein
Freitextfeld. Das Freitextfeld ist nicht das Kleingedruckte, sondern der Grund,
warum die Optionen Vorschläge heißen dürfen.

Die Karte sagt außerdem, dass der Lauf wartet. Ohne diesen Satz sieht ein
stehengebliebener Fortschritt wie ein Fehler aus.

Zwei Fragen entscheiden, ob so etwas trägt:

**Was, wenn niemand antwortet?** Nach `FLOW_RUECKFRAGE_TIMEOUT_MS` gilt die
erste Empfehlung, und der Lauf schreibt das mit. Ein hängender Lauf wäre
schlechter als eine Annahme.

**Blockiert das Warten die GPU?** Nein, und das ist geprüft: `withGpuLock`
umschließt einen einzelnen Ollama-Aufruf, nicht den ganzen Lauf. Wäre das
anders, blockierte eine unbeantwortete Frage den Chat des ganzen Geräts.

### Live abgenommen am 23.08.2026, zusammen mit I2 und I4

`scripts/test/rueckfrage-abnahme.mjs`, elf von elf grün. Der `angebot`-Flow
lief gegen einen Kundenordner mit einer Anfrage und einer Telefonnotiz.

| Was geprüft wurde                               | Ergebnis                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Ein Flow mit `betriebsart: rueckfragen` startet | HTTP 202                                                            |
| Der Lauf hält an und fragt                      | nach 125 s                                                          |
| Die Frage bietet Optionen an                    | 3                                                                   |
| Daneben ein Freitextfeld                        | 1                                                                   |
| Die Frage ist deutsch                           | „Wie ausführlich soll das Angebot werden?"                          |
| Die Antwort kommt beim Lauf an                  | `frage_nutzer: Antwort des Nutzers: Kompakt, eine Seite, Festpreis` |
| Der Lauf kommt zu Ende                          | fertig nach 137 s                                                   |
| Das Angebot liegt im Kundenordner               | 3536 Zeichen                                                        |
| Es trägt die erwarteten Teile                   | Angebot, Leistung, Preis, Gültigkeit                                |

Der Inhalt stimmt inhaltlich: Kundenname, Adresse, Ansprechpartnerin, das
Telefonat vom 18.08., die 8000 Dokumente, 12 von 40 Mitarbeitern. Alles aus
den zwei Quelldateien. Was es nicht weiß, markiert es als
`[offene Stelle: Datum]`, statt es zu erfinden.

**Diese Abnahme hat vier Fehler gefunden, und ohne sie wäre keiner
aufgefallen.**

| Fund                                      | Wirkung                                                                                                      | behoben |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| `betriebsart` fehlte im API-Schema        | die Rückfrage-Betriebsart war über den normalen Weg unerreichbar, der `angebot`-Flow ließ sich nicht anlegen | #529    |
| `frage_nutzer` fehlte im Werkzeug-Schritt | `buildTools` bekam die Betriebsart nicht durchgereicht, jeder Schritt mit diesem Werkzeug scheiterte         | #533    |
| `projekt://` als Ordnername               | die Datei landete unter `<Kunde>/projekt:/aktiv/<Kunde>/angebot.md`                                          | #534    |
| `projekt://` als relativer Pfad           | danach unter `<Kunde>/<Kunde>/angebot.md`, also eine Ebene zu tief                                           | #535    |

Die letzten beiden sind derselbe Fehler in zwei Anläufen, beide am Gerät
gemessen. Ein `projekt://`-Pfad ist **projekt-absolut**: er zählt gegen den
Projektordner, nicht gegen das Arbeitsverzeichnis des Laufs.

**Die Lehre, und es ist dieselbe wie bei E9:** geprüft wird auf der Platte,
nicht im Text der Antwort. Der Lauf meldete jedes Mal Erfolg und nannte
`angebot.md`. Wer nur das gelesen hätte, hätte drei Wochen später einen Kunden
mit einem Ordner namens `projekt:`.

## I4 Vorlage nach dem Muster aus dem Entwicklungsordner

Die vorhandenen komplexen Abläufe aus dem Projekte-Development-Ordner dienen als
Maßstab: Daten zu einem Kunden auslesen, mehrere Rückfragerunden, Ergebnis als
Dokument. Mindestens eine solche Vorlage wird nachgebaut, um zu belegen, dass die
vereinfachte Oberfläche das trägt.

**Abnahme:** Der nachgebaute Flow läuft auf dem Gerät durch und erzeugt ein
brauchbares Dokument auf Deutsch.

### Das Vorbild, nachgesehen

Im Projekte-Development-Ordner auf dem Gerät liegt unter `Wissen/Abläufe/angebot/`
ein zweiphasiger Ablauf: `phase-1-analyse.md` liest das PRD und sucht
Kundendaten im Projektordner, `phase-2-generierung.md` schreibt daraus das
Angebot.

### Der Nachbau (#511)

Drei Schritte, zwei Rollen, eine Rückfrage:

| Schritt      | Art                     | was er tut                                                |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `unterlagen` | Subagent `sichter`      | Sucht und liest im Kundenordner, trennt bekannt von offen |
| `umfang`     | Werkzeug `frage_nutzer` | Drei Optionen: kompakt, ausführlich, nur Preisrahmen      |
| `schreiben`  | Subagent `autor`        | Schreibt `{{kunde}}/angebot.md`                           |

Die Antwort geht als `{{umfang}}` in den letzten Schritt. Ohne diesen
Platzhalter wäre die Rückfrage Zierde: gefragt, gehört, nicht benutzt.

Der Flow ist zugleich der erste echte Nutzer der Betriebsart `rueckfragen` aus
I2, und er greift ins Annahmen-Protokoll: der Autor schreibt `[offene Stelle]`,
wo er nichts weiß, und genau diese Marker liest `pruefung.js` hinterher aus.

**Eine Lücke, die dabei auffiel:** Schritt-Parameter ließen nur Zeichenketten,
Zahlen und Wahrheitswerte zu. `frage_nutzer` erwartet seine `optionen` als
Liste und ließ sich damit in einer Schritt-Kette gar nicht rufen.

**Live abgenommen am 23.08.2026**, gemeinsam mit I2 und I3. Die Tabelle und
die vier Funde stehen bei I3.

## I5 Auf das Standardmodell abgestimmt

Der Harness muss mit Qwen3.8 27B gut laufen, nicht nur mit einem großen
Cloud-Modell. Anweisungen kurz, Werkzeugbeschreibungen knapp, Schritte klein
genug für ein Modell dieser Größe.

**Abnahme:** Jeder Vorlagen-Flow läuft mit dem Standardmodell ohne Eingriff
durch.

### Am Gerät gemessen, 22.08.2026

Das Standardmodell ist `Qwen3.8-27B` (Ollama-Tag
`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`, 27,3 Mrd. Parameter, live abgefragt).

**Kein einziger Flow setzt ein eigenes Modell.** Alle acht laufen auf dem
Standard, „ohne Eingriff" ist damit schon die Ausgangslage:

| Flow                    | Modell   | Werkzeuge |
| ----------------------- | -------- | --------- |
| dokument-zusammenfassen | Standard | 0         |
| erweiterung             | Standard | 3         |
| execute                 | Standard | 2         |
| handbuch-bau            | Standard | 4         |
| newsletter              | Standard | 3         |
| qa-zusammenfassung      | Standard | 0         |
| recherche               | Standard | 3         |
| wissen                  | Standard | 1         |

Live durchgelaufen:

| Flow                    | Dauer | Ergebnis                                |
| ----------------------- | ----- | --------------------------------------- |
| qa-zusammenfassung      | 45 s  | drei Stichpunkte, auf Deutsch           |
| dokument-zusammenfassen | 49 s  | Zusammenfassung der Datei, auf Deutsch  |
| wissen                  | 209 s | Antwort mit ehrlichem „nichts gefunden" |

Der `wissen`-Lauf ist der interessanteste: er suchte mehrfach, fand nichts und
sagte das, statt etwas zu erfinden. Genau das soll ein Flow dieser Größe tun.

Ein Nebenbefund, der kein Flow-Fehler ist: zwei Läufe brachen mit „Backend
wurde neu gestartet, während der Lauf lief" ab, weil währenddessen ein Deploy
lief. Die Meldung ist richtig und benennt die Ursache; die Aufräumung
verwaister Läufe arbeitet.

### Alle acht gemessen, 22. und 23.08.2026

| Flow                      | Dauer  | Ergebnis                                                  |
| ------------------------- | ------ | --------------------------------------------------------- |
| `qa-zusammenfassung`      | 45 s   | drei Stichpunkte, auf Deutsch                             |
| `dokument-zusammenfassen` | 49 s   | Zusammenfassung der Datei, auf Deutsch                    |
| `execute`                 | 101 s  | Prüfbericht in vier Schritten                             |
| `wissen`                  | 209 s  | Antwort mit ehrlichem „nichts gefunden"                   |
| `newsletter`              | 262 s  | versandfertiger Newsletter, 13 Schritte                   |
| `recherche`               | 1216 s | **Zeitlimit, keine Antwort**. Nach dem Fix: 673 s, fertig |
| `erweiterung`             | 262 s  | Abbruch nach 20 Runden, siehe unten                       |
| `handbuch-bau`            | 1800 s | **Erfolg gemeldet, Datei mit 373 Bytes**, siehe unten     |

Fünf liefen auf Anhieb durch. Die drei anderen haben je einen Fehler
freigelegt, und keiner davon steckte im Flow.

**`recherche`: eine Rolle erbt das Budget des Flows, und zwar je Delegation.**
Die Rolle `sucher` bekam zwölf Runden pro Delegation und rief `web_suche`
**26-mal** auf, obwohl ihr Prompt drei bis fünf URLs verlangt. Ein Prompt
allein reicht dafür nicht, und genau das ist die Aussage von I5: Schritte klein
genug für ein Modell dieser Größe, und zwar durchgesetzt, nicht erbeten. Eine
Rolle kann jetzt `runden: N` deklarieren (#524). Danach: 3 Suchen statt 26,
Lauf fertig in 673 s mit belegter Antwort.

**`handbuch-bau`: eine Variable mit zwei Bedeutungen, und ein verschluckter
Fehler.** `FLOW_LLM_TIMEOUT_MS` heißt im Chat-Agenten „wie lange der Strom
zwischen zwei Zeichen stumm bleiben darf", mit einem Zähler, der bei jedem
Datenstück neu beginnt. Im Flow-Pfad ist dieselbe Zahl das Zeitlimit des
**ganzen** Aufrufs, denn der läuft ohne Streaming. 120 Sekunden Stille sind
großzügig; 120 Sekunden für eine ganze Antwort sind bei rund zehn Token je
Sekunde etwa 1200 Token.

Der Flow verlangt je Abschnitt „mindestens 80 Zeilen ausführlichem
HTML-Inhalt" in **einem** Werkzeugaufruf. Acht Delegationen liefen ins
Zeitlimit. Und weil `runLoop` bei einem Fehler nicht wirft, sondern
`{ result: '', error: '…' }` zurückgibt, las niemand das `error`: acht Schritte
standen auf `fertig`, und der Lauf meldete Erfolg. Behoben in #531, mit einer
eigenen Variablen für den Flow-Pfad.

Nachgestellt mit zwei minimalen Flüssen, gleiche Rolle, gleiches Werkzeug, nur
der Auftrag verschieden:

| Auftrag              | vor #531                | nach #531                             |
| -------------------- | ----------------------- | ------------------------------------- |
| zwei Sätze           | 331 Bytes               | (lief schon)                          |
| mindestens 80 Zeilen | 28 Bytes, Ergebnis leer | **5519 Bytes**, Abschnitt vollständig |

**`erweiterung`: mein Testauftrag war schlecht, und dahinter lag trotzdem ein
Fund.** Ich hatte „eine Postleitzahl in den Ortsnamen übersetzen" gewählt, und
das Modell verbrachte fünfzehn Runden damit, einen fremden Dienst zu erreichen,
den die Sandbox nicht auflöst. Das ist kein Befund am Flow.

Der Fund lag davor: vier weitere Runden gingen für die Suche nach der
`ANLEITUNG.md` drauf, die der eigene Prompt des Flows als Erstes zu lesen
verlangt. Die kanonische Werkstatt bekommt sie nie, weil sie nicht über
`createProject` entsteht, sondern als `ordner` eines Flows. Jeder andere
Sandbox-Ordner wird bestückt, ausgerechnet der zum Bauen nicht (#530).

### Beide Nachläufe am 23.08.2026, mit den Fixes

| Flow           | vorher                           | jetzt                                  |
| -------------- | -------------------------------- | -------------------------------------- |
| `erweiterung`  | Abbruch nach 20 Runden           | **221 s, fertig**, 8 Schritte          |
| `handbuch-bau` | Erfolg gemeldet, Datei 373 Bytes | **3750 s, fertig**, Datei 81 099 Bytes |

Beim `erweiterung`-Lauf wurde nicht bei „die Dateien liegen da" aufgehört. Das
gebaute Werkzeug wurde ausgeführt:

```
echo '{"zahl":1987}' | node tool.mjs
{"ok":true,"zahl":1987,"roemisch":"MCMLXXXVII"}
```

Der Fehlerfall antwortet auf Deutsch und nennt das erwartete Feld.

**Der `handbuch-bau`-Lauf ist der interessantere, und zwar wegen dem, was er
NICHT verschweigt.** Neun von zehn Abschnitten wurden geschrieben, 9 Tabellen,
21 Listen. Abschnitt 7 lief ins Zeitlimit, und die Antwort sagt das:

> „Es wurden 9 von 10 geplanten Abschnitten erfolgreich geschrieben. Der
> Abschnitt 7 ist aufgrund eines Zeitüberschreitungsfehlers nicht enthalten."

Die Lücke steht auch im Dokument: die Überschriften laufen 1, 2, 3, 4, 5, 6,
**8**, 9, 10. Vor #531 wäre daraus ein gemeldeter Erfolg mit einer leeren Datei
geworden. Ein Flow, der neun von zehn schafft und den zehnten benennt, ist
etwas anderes als einer, der Erfolg meldet und nichts liefert.

### Was der Lieferumfang ist, und was nicht

Beim Nachmessen fiel auf, dass „acht Vorlagen-Flows" zwei verschiedene Dinge
meint. Der Katalog (`services/flows/beispiele/`) enthält **sechs**:

`angebot`, `dokument-zusammenfassen`, `erweiterung`, `execute`, `recherche`,
`wissen`.

Auf dem Arbeitsgerät liegen neun. Die drei zusätzlichen, `handbuch-bau`,
`newsletter` und `qa-zusammenfassung`, sind aus früheren Prüfungen entstanden
und **kein Lieferumfang**. Ein Gerät ab Werk hat keinen einzigen Flow
(Entscheidung E6, B4).

Das ändert die Einordnung des 62-Minuten-Laufs: `handbuch-bau` ist eine
Belastungsprobe, kein Kundenweg. Seine Forderung nach „mindestens 80 Zeilen in
einem Werkzeugaufruf" ist genau der Rand, an dem das Standardmodell steht, und
deshalb war er der nützlichste Fund der Runde.

Damit ist I5 erledigt.

---

# Phase J, Einstellungen, Funktion statt Aussehen

Geschätzt 14 Stunden. Das Aussehen wurde in Phase C erledigt, hier geht es
darum, dass die Dinge tun, was sie sagen.

## J1 Passwortwechsel fehlerfrei

Ausdrücklich benannt: beim Ändern von Passwörtern darf nichts schiefgehen.
Betrifft Dashboard und MinIO.

**Abnahme:** Beide Passwörter geändert, neu angemeldet, Dateizugriff geprüft,
alter Zugang abgelehnt. Fehlerfälle mit verständlicher Meldung.

### Gefunden: der Dateizugriff überlebte den MinIO-Wechsel nicht

Der Ablauf sah aus wie Erfolg: `.env` schreiben, MinIO neu starten, „changed
successfully" antworten. Das Backend läuft dabei weiter, und es hielt einen
zwischengespeicherten MinIO-Client mit dem **alten** Geheimnis fest:

```js
// minioService.js, beim LADEN des Moduls gelesen
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD;
```

Jeder Datei-Zugriff scheiterte danach mit `SignatureDoesNotMatch`, bis jemand
das Dashboard neu startete. Genau der Schritt, den die Abnahme nennt.

**Behoben (#504):** das Geheimnis wird beim Bauen des Clients gelesen, und die
Route setzt `process.env` sowie den zwischengespeicherten Client zurück. Ein
Test hält fest, dass **beides** nötig ist.

### Live abgenommen am 23.08.2026 auf dem Prüfstand

`scripts/test/passwort-loeschung-abnahme.sh`. Die Abnahme ist zerstörend und
läuft deshalb nur gegen Port 8443; ein Wachhund bricht bei jeder anderen
Adresse ab, bevor er etwas anfasst.

| Was geprüft wurde                                         | Ergebnis                        |
| --------------------------------------------------------- | ------------------------------- |
| Anmeldung mit dem alten Passwort                          | grün                            |
| Ein zu kurzes Passwort wird abgelehnt                     | HTTP 400                        |
| Ein falsches altes Passwort nennt den Grund               | „Current password is incorrect" |
| Dashboard-Passwort geändert                               | HTTP 200                        |
| Der alte Zugang wird abgelehnt                            | grün                            |
| Anmeldung mit dem neuen Passwort                          | grün                            |
| Dateizugriff überlebt den MinIO-Wechsel **ohne Neustart** | HTTP 200                        |

Die letzte Zeile ist die, für die #504 gebaut wurde.

**Die Abnahme hat zwei Fehler gefunden, und beide betrafen jedes Gerät.**

**Der Passwortwechsel endete immer mit HTTP 500 (#537).** `.env` ist als
einzelne Datei eingehängt; `/arasul/config` gibt es im Container nur als
Halterung dafür, gehört `root`, und das Backend läuft als `node`. Die Funktion
`backupEnvFile` wollte dort eine Nachbardatei anlegen:

```
EACCES: permission denied, copyfile
'/arasul/config/.env' -> '/arasul/config/.env.backup.…'
```

Das ist kein Rechte-Unfall, sondern ein Widerspruch zwischen einem
Einzeldatei-Mount und einer Funktion, die ein Geschwister schreiben will.
Betroffen waren Dashboard, MinIO und n8n gleichermaßen. Am Gerät nachgesehen:
die einzigen zwei `.env.backup.*` stammen vom 14.03.2026 und aus einem
Host-Skript. **Diese Funktion hat nie eine Sicherung erzeugt.** Die Sicherung
liegt jetzt im Speicher und wird im Fehlerfall auch wirklich benutzt.

**Ein frisches Gerät bekam keinen Administrator (#538).** Postgres startet bei
einer frischen Datenbank zweimal: erst ein Übergangs-Server für die
Init-Skripte, dann der richtige. Der Healthcheck wird in der ersten Phase grün,
`depends_on: service_healthy` schützt also nicht. Die Migration bekam
`ECONNREFUSED`, und der Schutz gegen ein Werkskonto auf unbelegtem Schema
griff. Zweimal in Folge reproduziert.

Auf einem Kundengerät ist das der erste Start nach dem Werksreset. Der Schutz
bleibt und ist richtig; was fehlte, ist die Unterscheidung: eine gescheiterte
Migration bleibt ein harter Halt, eine abgewiesene Verbindung bekommt zehn
Versuche. Danach am Gerät belegt:

```
Bootstrap: Datenbank noch nicht bereit (ECONNREFUSED), Versuch 1 von 10
Bootstrap: Datenbank noch nicht bereit (ECONNREFUSED), Versuch 2 von 10
Bootstrap: Datenbank noch nicht bereit (ECONNREFUSED), Versuch 3 von 10
Bootstrap: Created initial admin user "admin"
```

## J2 Fernzugriff belastbar

Der Zustand muss laufend ausgelesen und aktualisiert werden, auch auf anderer
Hardware wie DGX Spark. Die fünf Schritte, Installation, Verbinden, Zertifikat,
sicherer Name, fertig, laufen jeweils über die volle Breite und sind klar
getrennt.

**Abnahme:** Zustand aktualisiert sich ohne Neuladen. Schritt 5 zeigt erledigt,
wenn die Verbindung steht. Die Seite bricht bei keiner Breite.

### Live abgenommen, 22.08.2026

Im Browser gegen den Orin (`scripts/test/fernzugriff-abnahme.mjs`), acht von
acht:

| Zusage                            | gemessen                                                  |
| --------------------------------- | --------------------------------------------------------- |
| Zustand ohne Neuladen             | eine zweite Statusabfrage in 35 Sekunden                  |
| Schritt 5 erledigt bei Verbindung | alle fünf Schritte abgehakt, „Fertig" grün                |
| keine Breite bricht               | 400, 600, 900, 1200, 1600 Pixel, kein waagerechtes Rollen |

Die fünf Schritte stehen bei 1400 Pixeln in einer Reihe und sind klar getrennt.

**Ein Fehlalarm von mir, festgehalten, weil er lehrreich ist.** Das erste Bild
zeigte eine rechts abgeschnittene Seite, und ich hielt das für einen Befund.
Es war der Nachhall des Wechsels auf 400 Pixel im selben Durchlauf: die
Aufteilung schaltet dort auf zwei Spalten (siehe F5) und braucht länger als die
Wartezeit, bis sie wieder drei zeichnet. Ein sauberes zweites Bild ohne
Größenwechsel zeigte die Seite vollständig. Das Prüfskript nimmt das Bild
jetzt ZUERST auf.

## J3 Datenexport auf externe SSD

Der Export gibt es, das Ziel fehlt. Künftig wird eine angesteckte externe Platte
erkannt und als Ziel angeboten, daneben der Download.

**Abnahme:** Eine angesteckte SSD erscheint innerhalb von zehn Sekunden als Ziel.
Der Export landet darauf und ist wieder einlesbar.

### Was daraus wurde (#513)

Der Host hängt eine Platte unter `/media/<nutzer>/<name>` ein, das ist der
Standardweg unter Ubuntu. Dieser Ordner wird per Compose in den Container
gereicht. Der Container sieht damit **genau die eingehängten Datenträger und
sonst nichts vom Host**: kein `lsblk`, kein Docker-Socket, keine Rechte, selbst
einzuhängen. Einhängen bleibt Sache des Betriebssystems.

Die Oberfläche fragt alle zehn Sekunden nach, also genau in dem Fenster, das die
Abnahme nennt.

Zwei Wände beim Ziel, beide aus demselben Grund wie bei den Erweiterungs-Tabellen:
der Name wird **abgewiesen, nicht bereinigt**, und der aufgelöste Pfad muss
wirklich unter dem Ordner liegen — sonst zeigt ein Symlink auf der fremden
Platte zurück ins Gerät.

Geschrieben wird erst daneben, dann umbenannt. Wer die Platte mitten im
Schreiben abzieht, hätte sonst etwas, das aussieht wie ein Export.

**Der Unterschied, der in der Antwort steht:** „keine Platte angesteckt" ist
nicht dasselbe wie „der Ordner ist gar nicht eingebunden". Ohne diesen
Unterschied sucht jemand eine Stunde am falschen Ende.

### Live abgenommen am 22.08.2026

Geprüft auf dem Orin gegen einen Ordner unter `/media/arasul/TESTPLATTE`. Für
alles oberhalb des Betriebssystems verhält sich der wie eine eingehängte Platte;
der Unterschied zur echten SSD liegt allein im Einhängen, und das macht Ubuntu,
nicht Arasul.

| Was geprüft wurde                  | Ergebnis                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| Der Datenträger erscheint als Ziel | `TESTPLATTE`, 1 418 111 762 432 Bytes frei, beschreibbar  |
| Der Export landet darauf           | `arasul-gdpr-export-admin-2026-08-22.json`, 854 813 Bytes |
| Er ist wieder einlesbar            | JSON geparst, 13 Kategorien                               |
| Ein Name mit Pfad wird abgewiesen  | `../../etc` gibt HTTP 400 `VALIDATION_ERROR`              |
| Ein nicht eingehängter Name        | `GIBTSNICHT` gibt HTTP 404, mit eigenem Text              |

Damit ist J3 erledigt.

## J4 Löschung nach Art. 17

Die Löschung meldet Erfolg und löscht keine Dokumente. Ursache ist dieselbe
Verwechslung von Kennung und Name, die in der Auskunft am 19.08. behoben wurde.
Dort konnte die Korrektur höchstens mehr anzeigen, hier zerstört sie zusätzliche
Zeilen.

Mit E1, also einem Zugang je Gerät, ist die Frage einfacher als gedacht: es gibt
keinen fremden Datenbestand, den man versehentlich mitlöschen könnte.

**Abnahme:** Löschung entfernt Dokumente, Anhänge, Chats, Wissensräume und
Projekte des Zugangs. Eine anschließende Auskunft liefert leere Kategorien. Vorher
ein Export, nachher ein Vergleich.

### Der Plan nennt einen Fehler. Es sind drei.

Alle drei haben dieselbe Eigenschaft: **die Antwort meldete Erfolg.**

**Erstens der genannte.** `DELETE FROM documents WHERE uploaded_by = $1` mit der
Id. Am 22.08.2026 auf dem Orin nachgesehen: `uploaded_by` ist
`character varying` und enthält `admin`, `ordner-sync`, `nightrun`. Der
Vergleich traf nie, `rowCount: 0`, kein Fehler.

**Zweitens:** Wissensräume und Projekte wurden gar nicht gelöscht, obwohl der
Kommentar über der Route sie aufzählte. Die Begründung dort — `knowledge_spaces`
habe „kein user_id-Feld" — stimmte nicht, die Tabelle hat ein `owner_id`.

**Drittens, und das ist der schwerste:** der Letzter-Admin-Schutz machte die
Löschung auf einem Kundengerät **unmöglich**. Mit einem Zugang je Gerät
(Entscheidung E1) ist der Antragsteller immer der letzte Admin, und Art. 17 lief
grundsätzlich in einen 403.

### Was daraus wurde (#501)

Die Daten werden jetzt immer gelöscht. Nur die Zugangs-Zeile bleibt beim letzten
Admin stehen, und die Antwort sagt das ausdrücklich (`zugangBleibt: true`). Ein
gemauertes Gerät wäre die schlechtere Antwort auf einen Löschantrag.

Dazu die Bytes: Dateipfade und Projekt-Ids werden **vor** dem Löschen
eingesammelt, danach werden MinIO-Objekte und Ablage-Ordner geräumt. Der alte
Kommentar nannte das einen Follow-up und argumentierte, Objekte ohne Metadaten
seien „nicht mehr adressierbar". Das ist kein Löschen, sondern Verstecken.

Sechs neue Tests prüfen nicht das Ergebnis, sondern das **SQL** — genau weil das
Ergebnis in allen drei Fällen gut aussah.

### Live abgenommen am 23.08.2026 auf dem Prüfstand

Und sie hat gezeigt, dass die Löschung **immer noch nicht funktionierte**, in
zwei weiteren Schichten. Beide betrafen jedes Gerät, nicht einen Sonderfall.

**Erste Schicht: ein Fremdschlüssel (#539).**

```
Transaction rolled back: update or delete on table "projects" violates
foreign key constraint "knowledge_spaces_project_id_fkey"
```

Der Wissensraum „Allgemein" trägt `owner_id = NULL` und hängt an einem Projekt.
Der Filter auf `owner_id` ließ ihn stehen, und weil der Fremdschlüssel auf
`RESTRICT` steht, rollte die ganze Transaktion zurück. Das ist der
Normalzustand eines Geräts.

**Zweite Schicht: eine NOT-NULL-Spalte (#540).**

```
null value in column "username" of relation "login_attempts"
violates not-null constraint
```

Die Anonymisierung setzte `username = NULL` gegen eine `NOT NULL`-Spalte. Da
jedes Gerät Anmeldeversuche hat, scheiterte auch das immer. Anonymisiert wird
jetzt mit einem festen Platzhalter.

**Und ein Test, der das Falsche festhielt.** `gdprDelete.test.js` prüfte
`SET username = NULL` und war grün, während es am Gerät jedes Mal scheiterte.
Ein Test, der eine Zusage prüft, die es nicht gibt, ist schlimmer als kein
Test.

Danach in der Datenbank nachgesehen, statt der Antwort zu glauben:

| Tabelle                   | nach der Löschung |
| ------------------------- | ----------------- |
| `projects`                | 0                 |
| `knowledge_spaces`        | 0                 |
| `chat_conversations`      | 0                 |
| `documents`               | 0                 |
| `login_attempts.username` | `(geloescht)`     |

Damit ist J4 erledigt.

**Offen, und ausdrücklich zwei Rechtsfragen, keine Fragen an den Code:** ob der
Benutzername selbst stehen bleiben darf, wenn er der letzte ist. Und ob die
Aufbewahrungspflicht nach Art. 17 (3) (b) die Spalte `ip_address` in
`login_attempts` deckt, die ebenfalls `NOT NULL` ist und stehen bleibt. Eine
IP-Adresse ist ein personenbezogenes Datum; der Hinweis steht an der Stelle im
Code.

## J5 Zerstörende Aktionen fragen nach

„Konto endgültig löschen" ist ohne Absicherung erreichbar, „Trennen" im
Fernzugriff kappt sofort die Verbindung, über die man gerade angemeldet ist.

**Abnahme:** Beide Aktionen fragen zweistufig nach und nennen die Folge.
„Trennen" warnt ausdrücklich, wenn die aktuelle Sitzung darüber läuft. Behebt
F-27, F-37.

### Erst gemessen: eine Hälfte war schon da

„Konto endgültig löschen" ist **nicht** ungesichert. `handleDelete` hat zwei
Stufen: eine Rückfrage, die die Folge nennt, und danach ein Feld für den genauen
Bestätigungstext, den auch das Backend noch einmal prüft.

„Trennen" dagegen kappte sofort, ohne Dialog und ohne Warnung.

### Was daraus wurde (#503)

Ob die eigene Sitzung über den Fernzugriff läuft, entscheidet die **Adresse im
Browser**. Der Server weiß es nicht besser: hinter Traefik sieht er nur die
interne Adresse. Erkannt werden der MagicDNS-Name, der kurze Name, die
gemeldete IP, jeder Name auf `.ts.net` und der Bereich `100.64.0.0/10`.

Die Ränder des Bereichs sind mitgeprüft: `100.63.x` und `100.128.x` gehören
nicht dazu. Wer /8 statt /10 rechnet, warnt fälschlich, und eine Warnung, die zu
oft kommt, wird weggeklickt.

Zwei Texte, nicht einer: läuft die Sitzung darüber, steht „Du bist gerade ÜBER
diese Verbindung angemeldet" und der Knopf heißt „Trotzdem trennen". Sonst wird
bewusst nicht dramatisiert.

---

# Phase K, Dokumentation nachziehen

Geschätzt 12 Stunden. Läuft am Ende, weil sie den Stand nach allen Phasen
festhält.

## K1 Schnittstellendoku

Die ausgelieferte Doku deckt 7 von 361 Endpunkten ab. Ein Kunde, der eine eigene
Anwendung bauen soll, kann damit nichts anfangen.

Vorgehen: Erzeugung aus dem Code statt Pflege von Hand. Was nicht erzeugbar ist,
wird von Hand ergänzt und trägt Stand und Quelle.

**Abnahme:** Die Doku deckt alle Endpunkte ab, die eine Erweiterung oder ein
Partner benutzen darf. Eine Prüfung im Testlauf meldet neue Endpunkte ohne
Beschreibung. Behebt F-47.

## K2 Pläne und Roadmap schließen

Plan 021 auf abgeschlossen mit dokumentierter Abweichung, Plan 020 als
teilgeliefert. Der hardwaregebundene Rest, also 020 Schritte 5 bis 7 und 021
Schritt 7, wird das bereits bestehende Roadmap-Ziel J4 in
`roadmap/arasul-jet.md` (DGX Spark entschieden, Frist 15.09.). Die Roadmap führt beide danach nicht mehr als geplant
ohne Pull Request.

**Abnahme:** `roadmap/ROADMAP.html` neu gebaut, kein Plan mehr im falschen
Zustand, das DGX-Ziel steht mit Frist.

### Was hier ging und was nicht

Die Abnahme hat zwei Hälften in zwei Repos.

**Hier erledigt (22.08.2026):** `docs/plans/paused/README.md` sagt jetzt für
beide Pläne, was sie sind. 021 ist **abgeschlossen mit benannter Abweichung**:
der Engine-Wechsel auf SGLang (Schritt 3) hat nicht stattgefunden, Phase D
dieses Plans hat auf dem vorhandenen Ollama-Pfad gearbeitet. Was von Schritt 3
übrig ist, ist die engine-bewusste Sicht in `GET /api/llm/models` — die
Abstraktion existiert, der Wechsel wurde nie vollzogen. 020 ist
**teilgeliefert**: das Mess-Harness steht und misst auf jeder Hardware, der
Rest hängt an der DGX-Entscheidung.

Ein ruhender Plan wartet darauf, wiederaufgenommen zu werden. Diese beiden
warten nicht — deshalb der andere Zustand.

**Nicht hier:** `roadmap/ROADMAP.html` und das Ziel J4 liegen im Steuer-Repo
(`Arasul-GmbH/arasul-os`). Von dieser Sitzung aus wird dort nichts geschrieben;
das ist Sache einer Sitzung in jenem Ordner. Der Teil der Abnahme bleibt offen,
und zwar sichtbar, statt hier als erledigt zu gelten.

## K3 README und Arbeitsanleitungen

Nach dem Umbau stimmt vieles nicht mehr: die Legacy-Shell ist weg, der
Auslieferungszustand ist leer, es gibt keine Nutzerverwaltung, Erweiterungen
haben Server-Fähigkeiten. Betroffen sind README, die CLAUDE.md des Repos, die
Anleitungen in `docs/` und alles, woran eine KI sich beim Mitarbeiten orientiert.

**Abnahme:** Jede Aussage in README und CLAUDE.md ist gegen den Code geprüft.
Kein Verweis auf Entferntes. Jede gespiegelte Zahl trägt Stand und Quelle.

---

# Regressionsrunde vom 23.08.2026

Nach zwölf Fixes in einer Nacht ist die Frage nicht, ob jeder für sich stimmt,
sondern ob zusammen noch alles läuft. Alle vier Abnahmeskripte gegen den Orin,
in einem Zug:

| Abnahme                                     | Ergebnis      |
| ------------------------------------------- | ------------- |
| Chat, Phase E (`chat-abnahme.mjs`)          | **20 von 20** |
| Content-Security-Policy (`csp-abnahme.mjs`) | **14 von 14** |
| Terminal, Phase F (`terminal-abnahme.mjs`)  | **9 von 9**   |
| Fernzugriff, J2 (`fernzugriff-abnahme.mjs`) | **8 von 8**   |

**51 von 51.** Kein Fix der Nacht hat etwas anderes gebrochen.

Dazu die Prüfstand-Abnahme für J1 und J4 und die Live-Abnahme für I2 bis I4,
beide oben bei den Aufgaben beschrieben.

---

# Was noch offen ist, und wer es schließen kann

Stand 23.08.2026. Acht der dreizehn Phasen sind fertig und live abgenommen.
Was offen ist, ist es aus einem von drei Gründen, und der Grund entscheidet,
wer es schließt.

## Braucht Kolja, weil es seine Zugänge braucht

| Aufgabe | Was fehlt                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| G2, G3  | Ein GitHub-Repository und ein persönlicher Zugangsschlüssel. Koppeln, im Terminal ändern, übertragen, auf GitHub nachsehen |
| D9      | Der Positivfall braucht einen echten Schlüssel für ein externes Modell                                                     |

**In einer Sitzung wird nie nach einem Schlüssel gefragt.** Beide bleiben offen,
bis Kolja sie selbst fährt.

## Braucht einen Menschen, der es zum ersten Mal tut

| Aufgabe | Warum ich der falsche Prüfer bin                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2      | „In unter zehn Minuten, **ohne Wissen über den Aufbau des Manifests**." Ich habe das Manifest-Schema gelesen; meine Zeit wäre keine Antwort auf die Frage |
| I1      | Dieselbe Sache mit fünf Minuten und der Oberfläche                                                                                                        |

Eine Zahl, die ich hier messe, sagt nur, wie schnell jemand ist, der es schon
weiß. Das ist nicht, was die Abnahme wissen will.

## Braucht ein anderes Repository

| Aufgabe | Was fehlt                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H3      | „Dieselbe Anwendung, einmal über ara-kit und einmal im Terminal gebaut, ergibt dasselbe Paket." Das Werkzeug dafür steht und ist selbstgetestet (`paket-vergleich.py`); der ara-kit-Lauf gehört in jenes Repository |
| K2      | Die Roadmap-Hälfte liegt im Steuer-Repo, nicht hier                                                                                                                                                                 |

## Eine Entscheidung, keine Ausführung

| Punkt                                | Warum ich ihn nicht allein entscheide                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Der n8n-Knoten umgeht die GPU-Sperre | Eine Änderung an einer ausgelieferten Integration mit mehreren möglichen Wegen. Steht unten ausführlich |
| `ip_address` in `login_attempts`     | Ob die Aufbewahrungspflicht nach Art. 17 (3) (b) sie deckt, ist eine Rechtsfrage                        |
| E2, strikt serielle Warteschlange    | Eine Nutzer-Entscheidung vom 22.07.2026, bewusst ohne Priorisierung                                     |

---

# Funde außerhalb der Aufgabenliste

Der Plan hat 66 Aufgaben. Manches, was beim Abnehmen herausfällt, steht in
keiner davon und ist trotzdem zu wichtig, um in einer Commit-Nachricht zu
verschwinden. Hier steht es.

## Der Indexer rechnete gegen den Chat um dieselbe GPU (behoben, #517, #521)

`gpuQueue.js` nennt sich in seiner Kopfzeile „die **eine** Sperre für alle
lokalen Modell-Aufrufe". Das stimmte für alles im Backend-Prozess. Der
Document-Indexer ist ein eigener Container und ruft Ollama direkt auf.

Gemessen am 22.08.2026, `llm_model_switches`:

|                                        | vorher, 40 Minuten               | nachher, 18 Minuten mit einem 262-Sekunden-Flow |
| -------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Wechsel `auto_unload_ollama_keepalive` | 35                               | 6                                               |
| teure Ladevorgänge                     | 9, zwischen 11 827 und 60 066 ms | **0**                                           |

Der Nutzer wartete also bei fast jeder Chat-Runde eine halbe bis eine ganze
Minute auf ein Modell, das kurz zuvor schon im Speicher war. Auf einem
Kundengerät heißt das: wer einen Ordner Dokumente ablegt, macht sich den Chat
für die nächste Stunde langsam, ohne zu ahnen warum.

Gemeldet wird jetzt eine **Frist**, kein Schalter. Fällt das Backend aus, läuft
sie ab und der Indexer arbeitet weiter.

## Das Kernversprechen, Ende zu Ende gemessen (23.08.2026)

Nicht als Aufgabe im Plan, aber das, wofür ein Kunde das Gerät kauft. Ein
Wartungsvertrag mit erfundenen, aber eindeutigen Zahlen wurde in die
Projektablage gelegt, der Indexer nahm ihn auf (vier Abschnitte), und dann kam
die Frage im Chat, im Browser, auf dem Weg des Nutzers:

> Welche Grundpauschale steht im Wartungsvertrag mit Nordwind Anlagenbau, und
> wie lang ist die Kündigungsfrist?

Die Antwort:

> Grundpauschale: 18.400 Euro netto pro Jahr
> Kündigungsfrist: drei Monate zum Laufzeitende
> Laufzeit des Vertrags: 01.03.2026 bis 28.02.2029

Mit Aufgabenliste, einem `dateien_lesen` auf die richtige Datei, **einer
Quelle** und 1:51 Minuten. Alle Zahlen stimmen mit dem Dokument überein.

**Und ein Fehlalarm von mir, festgehalten, weil er lehrreich ist.** Der erste
Versuch lief über `POST /api/llm/chat`, und die Antwort lautete „Ich habe
keinen Zugriff auf die spezifischen Vertragsunterlagen". Das sah nach einem
schweren Mangel aus. Im Protokoll stand aber `rag: 0` und kein Agentenpfad: das
ist der EINFACHE Chat ohne Werkzeuge, nicht der Weg der Oberfläche. Gemessen
wurde am falschen Endpunkt.

## Werkzeuge, die niemand ausführt (entschieden am 23.08.2026: entfernt)

Beim Nachgehen des Fehlalarms gefunden. `apps/dashboard-backend/src/tools/`
enthält sechs Werkzeuge (`status`, `logs`, `services`, `workflows`, `alerts`,
`help`), eine Registry mit vollständigem Ausführer (`execute`,
`processToolCalls`, `executeOllamaToolCalls`) und einen Parser für
`[TOOL: name param=wert]`.

**Aufgerufen wird davon nichts.** Die einzige Verwendung im ganzen Backend ist
`generateToolsPrompt()` in `systemPromptBuilder.js`, also das BESCHREIBEN der
Werkzeuge im Systemprompt. Gesucht wurde nach jedem Aufrufer:

```
grep -rn "processToolCalls|executeOllamaToolCalls|getOllamaToolDefinitions" src/
  ausserhalb von src/tools/ -> kein Treffer
```

Wirksam wird das bei mittleren und komplexen Fragen an `/api/llm/chat`, einem
**dokumentierten** Endpunkt (`API_REFERENCE.md`, `DEVELOPMENT.md`). Das Modell
liest dort, es habe Werkzeuge, und wenn es eines aufruft, geschieht nichts. Das
ist dieselbe Klasse wie E9: eine angekündigte Handlung, die nicht stattfindet.

Die sichtbare Oberfläche ist nicht betroffen; sie geht immer über den
Agentenpfad (`isAgent` ist die Vorgabe in `ChatContext`), und dort werden
Werkzeuge wirklich ausgeführt.

### Entschieden am 23.08.2026, und warum ich es entschieden habe

Der Absatz darüber ließ die Entscheidung offen. Dazwischen kam ein Befund, den
er nicht kannte: **der einfache Pfad ist nicht nur ein dokumentierter Endpunkt,
er ist die n8n-Anbindung.** `POST /api/v1/external/llm/chat` reicht an
`llmQueueService.enqueue` durch, ohne `agent` zu setzen — also genau der Weg,
auf dem die Beschreibung ins Modell geht und der Marker unausgeführt in der
Antwort landet. Damit trifft es ein Verkaufsmerkmal, nicht nur eine Doku-Zeile.

Die zwei Wege sind nicht gleich riskant. Den Ausführer verdrahten heißt, einem
Pfad, der nie eine Werkzeugschleife hatte, unbeaufsichtigt eine zu geben — und
der Agentenpfad hat längst eine, die wirklich läuft. Die Beschreibung
wegzunehmen kostet dagegen **keine einzige Fähigkeit**, weil keine davon je
funktioniert hat.

Entfernt sind: die vierte Prompt-Schicht in `systemPromptBuilder.js`, der
Parameter `includeTools` an allen vier Aufrufstellen und `src/tools/`
(1293 Zeilen, neun Dateien). Die Werkzeuge des Agenten
(`services/flows/toolRegistry`) sind davon nicht berührt.

**Wenn Kolja den anderen Weg will**, ist er einen Revert entfernt: der Code
steht in der Historie, und die Stelle, an der er verdrahtet würde, ist im
Kommentar in `systemPromptBuilder.js` benannt.

## Der n8n-Knoten umgeht dieselbe Sperre (offen, Entscheidung)

`services/n8n/custom-nodes/n8n-nodes-arasul-llm` spricht mit
`llm-service:11434` **direkt**. Ein n8n-Workflow mit dem LLM-Knoten tut deshalb
genau das, was der Indexer tat: er lädt sein Modell und wirft das des Chats
hinaus.

**Nicht gebaut, und das ist Absicht.** Es ist eine Änderung an einer
ausgelieferten Integration mit mehreren möglichen Wegen (über das Backend
leiten, die Frist mitnehmen, oder das Modell gleich lassen). Das ist eine
Entscheidung, keine Ausführung.

## Das Dokument trug keine einzige Sicherheitskopfzeile (behoben, #519, #526)

Jeder API-Pfad hatte eine Content-Security-Policy, ausgerechnet die Seite, die
der Browser als **Dokument** lädt, nicht. Zwei voneinander unabhängige Gründe:
der Traefik-Router `dashboard-frontend` trug als einziger keine
Sicherheitskopfzeilen, und das nginx im Container verwirft seine eigene Policy,
weil `location = /index.html` einen eigenen `add_header`-Satz setzt und nginx
den geerbten damit **ersetzt**.

Erst berichtend geschaltet und gemessen (`scripts/test/csp-abnahme.mjs`, vier
Stationen plus geöffnetes PDF), dann scharf. Genau **ein** Verstoß im ganzen
Durchlauf: eine Bibliothek fragt mit `new Function("")`, ob sie kompilieren
darf, und fängt den Fehler ab. **Kein `unsafe-eval`.** Der PDF-Betrachter
zeichnet weiter, 14 von 14 grün unter der scharfen Policy.

## Ein fertiger Lauf ohne Text hinterließ eine leere Blase (behoben, #520)

Von 261 Antworten des Assistenten waren drei leer **und** abgeschlossen, alle
vom 22.08. Der Nutzer sah eine Sprechblase ohne Inhalt und ohne Hinweis. Der
Abbruchzweig kannte den Fall längst, dem normalen Ende fehlte er.

Warum das Modell bei einer trivialen Frage nichts liefert, ist damit **nicht**
beantwortet. Das bleibt offen.

---

# Rechnung

> Die Rechnung ist vom 19.08.2026 und stimmt seither nicht mehr genau: C7 ist am
> 20.08. dazugekommen (geschätzt 6 Stunden), und Phase C hat mit C1 bis C6 mehr
> gekostet als die 24, weil jeder Schritt Fehler freigelegt hat, die kein Befund
> nannte. Sie wird beim nächsten Wochenlauf neu gerechnet, nicht hier von Hand
> nachgebessert.

| Phase | Inhalt                             | Stunden |
| ----- | ---------------------------------- | ------- |
| A     | Entscheidungen und Zusagen         | 10      |
| S     | Sicherung wiederherstellbar        | 14      |
| B     | Aufräumen und Auslieferungszustand | 22      |
| C     | Komponentenset und Einstellungen   | 24      |
| D     | Modelle                            | 20      |
| E     | Coding-Agent und Chat              | 34      |
| F     | Terminal                           | 14      |
| G     | Dateien, Projekte, GitHub, Wissen  | 18      |
| H     | Eigene Anwendungen                 | 16      |
| I     | Flows                              | 16      |
| J     | Einstellungen, Funktion            | 14      |
| K     | Dokumentation                      | 12      |
|       | **Summe**                          | **214** |

Bei 12,5 Stunden Bauzeit pro Woche wären das 16 Wochen, also bis Mitte Dezember,
und M5 mit zehn Partnergesprächen ginge daneben nicht mehr auf. Der Plan wird
deshalb autonom gebaut, Koljas Zeit fließt in Abnahme statt in Bau. Bei
erfahrungsgemäß einem Drittel Prüfzeit sind das rund 65 Stunden Abnahme, also
etwa fünf Wochen der verfügbaren Kapazität. Das passt, solange die Abnahme nicht
liegen bleibt.

Der harte Termin in dieser Rechnung ist Phase A. Sie muss vor dem ersten
Partnergespräch fertig sein, weil die AVV-Vorlage mitgeht.

# Gate-Bezug

| Gate                             | Phasen                                   |
| -------------------------------- | ---------------------------------------- |
| G1, Funktionen vollständig       | B4, D5, D9, G2, G3, H1 bis H3, I1 bis I4 |
| G2, Rückmeldung bei jeder Aktion | C6, D3, E2, E3, E4, H5, J5               |
| G3, Oberfläche einheitlich       | B6, B7, C1 bis C5, F1, F2, F5, H4        |
| G4, Daten bleiben auf dem Gerät  | A3, A4, J4                               |
| G5, DSGVO                        | A2, J3, J4                               |
| G6, Sicherung                    | S1 bis S8, B5, J3                        |
| G7, sieben Tage unbeaufsichtigt  | B3, E2, G4                               |

## Die Abnahme-Reihe: ein Befehl, zehn Messungen (Stand 23.08.2026)

`bash scripts/test/abnahmen.sh` fährt alle Browser-Abnahmen nacheinander gegen
das laufende Gerät und gibt eine Tabelle aus. Nacheinander, nicht parallel:
mehrere Browser gegen dasselbe Modell wären eine Aussage über die
Warteschlange, nicht über die Funktion.

| Abnahme        | was sie belegt                                                                           |
| -------------- | ---------------------------------------------------------------------------------------- |
| `chat`         | 20 Zusagen aus Phase E, von der Denkzeile bis zum abgebrochenen Lauf                     |
| `terminal`     | Phase F, neun Punkte                                                                     |
| `csp`          | die Sicherheitskopfzeilen brechen die Anwendung nicht                                    |
| `rueckfrage`   | I2 bis I4: der Flow hält an, fragt auf Deutsch, das Angebot liegt danach im Kundenordner |
| `fernzugriff`  | J2 bei jeder Breite                                                                      |
| `erweiterung`  | die sichtbare Kette bis zur antwortenden Brücke im Tab                                   |
| `bruecke`      | alle sieben Fähigkeiten aus dem Rahmen einer echten App                                  |
| `paket`        | bauen, herunterladen, einspielen, forken, zurückrollen                                   |
| `dokument`     | die Kernzusage: neues Dokument hoch, Antwort mit Quelle                                  |
| `modell`       | der Modellwechsel wirkt, gemessen am Tempo statt am Klick                                |
| `rueckmeldung` | Gate G2: jede Aktion meldet sich, und Zerstoerendes fragt vorher                         |
| `oberflaeche`  | Gate G3: sechs Ansichten mal drei Breiten, ohne waagerechtes Rollen                      |

Am 23.08.2026 gegen `main`: über 150 Prüfpunkte, alle grün.

Dazu `souveraenitaet-abnahme.sh`, die nicht misst, was das Gerät tut, sondern
was es **nicht** tut: sie sieht während der Arbeit in jeden Container und
sammelt, wohin verbunden ist.

Drei weitere laufen auf dem Prüfstand, weil sie Daten löschen:
`werksreset-abnahme.sh` (24/24), `frischgeraet-abnahme.sh` (bestanden),
`passwort-loeschung-abnahme.sh` (11/11). Und `dauerlauf-bericht.sh` liest die
Beweislage für G7 aus dem laufenden Gerät.

**Was diese Reihe an einem Tag gefunden hat**, nachdem alle Unit-Tests grün
waren: die KI-Brücke war auf sechs Ebenen unbenutzbar, drei von sieben
Fähigkeiten tot, der nächtliche Lauf einer Erweiterung startete nie, der
Werksreset war auf jedem Gerät blockiert, die Erweiterungs-Schemata überlebten
ihn mit Kundendaten darin, und die Auskunft nach Art. 15 zeigte Wissensräume
nicht, die die Löschung nach Art. 17 entfernt.

Keiner dieser Fehler war in den Tests sichtbar. Sie waren alle an der Naht
zwischen zwei Teilen, die einzeln geprüft waren.

## Die Kernzusage hat seit dem 23.08.2026 eine Abnahme (#558)

„Ein Dokument hochladen und danach eine Frage dazu beantwortet bekommen, mit
Quelle." Das ist der Satz, mit dem Arasul verkauft wird, und er war bis dahin
nicht als dauerhafte Abnahme belegt. Belegt war er einmal von Hand, an einem
Dokument, das schon Wochen auf dem Gerät lag. Das ist etwas anderes: eine alte
Datei sagt nichts darüber, ob eine **neue** ankommt und gefunden wird.

`scripts/test/dokument-abnahme.mjs` lädt deshalb ein frisches Dokument hoch,
mit einer Zahl, die es sonst nirgends gibt. Ein Modell, das rät, trifft sie
nicht. Danach fragt es, **ohne den Dateinamen zu nennen**.

Auf dem Orin, sechs von sechs:

```
Ich lese den Wartungsvertrag.
Grundpauschale: 41.780 Euro netto pro Jahr
Kündigungsfrist: 7 Wochen zum Laufzeitende
Quelle: pruefvertrag-wv-2026-8834.md (Abschnitte „Vergütung" und „Laufzeit")
```

146 Sekunden vom Absenden bis zur fertigen Antwort. Das Dokument wird danach
wieder entfernt, sonst misst die nächste Messung in einem Feld aus
Prüfverträgen.

## Welches Gate hat welchen Beleg (Stand 23.08.2026)

Ein Gate ist nicht geschlossen, weil die Aufgaben darunter erledigt sind,
sondern wenn jemand es am Gerät nachweisen kann. Diese Spalte fehlte bis
heute.

| Gate                             | Beleg                                                       | Stand                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| G1, Funktionen vollständig       | dreizehn Abnahmen, `scripts/test/abnahmen.sh`               | über 190 Prüfpunkte, alle grün                                                                                           |
| G2, Rückmeldung bei jeder Aktion | `rueckmeldung-abnahme.mjs`                                  | 7/7, nachdem vier stumme Explorer-Aktionen nachgezogen sind                                                              |
| G3, Oberfläche einheitlich       | `oberflaeche-abnahme.mjs`, sechs Ansichten mal drei Breiten | 55/55, dazu die Wächter in der CI                                                                                        |
| G4, Daten bleiben auf dem Gerät  | `souveraenitaet-abnahme.sh`                                 | **offen seit 23.08.2026**: `llm-service` rief `ollama.com`, `embedding-service` hält eine Verbindung zu `huggingface.co` |
| G5, DSGVO                        | `passwort-loeschung-abnahme.sh` auf dem Prüfstand           | 11/11, Auskunft und Löschung stimmen seit heute überein                                                                  |
| G6, Sicherung                    | `restore-drill.sh`, nächtlich                               | sechs Tabellen geprüft, 44 s, Bericht in `data/backups/`                                                                 |
| G7, sieben Tage unbeaufsichtigt  | `dauerlauf-bericht.sh`                                      | **3 von 7 Tagen**, kein Dienst musste von selbst neu starten                                                             |

G7 ist das einzige, das nur Zeit braucht. Der Zähler läuft seit dem Neustart
am 19.08. um 17:29; jeder weitere Neustart des Geräts setzt ihn zurück. Ein
Deploy zählt nicht mit, er tauscht nur Container.

## K1 ist erfüllt, und das Erfüllen hat fünf Fehler freigelegt (23.08.2026)

Die Schuldenliste `scripts/test/endpunkte-luecke.txt` steht bei **null**. Am
22.08. waren es 35, und die Begründung damals lautete: das sind Betriebs- und
Wartungswege, nicht die Abnahme. Das stimmte und war die bequemere Hälfte der
Wahrheit — ein Partner, der ein Gerät überwacht, braucht genau diese
Endpunkte.

Beim Lesen der Quelldateien fiel der erste Fehler auf, ein Sweep über alle
GET-Endpunkte fand die übrigen. **Alle fünf antworteten auf jedem Gerät mit
HTTP 500 oder verschwiegen ihre Daten, und alle fünf waren von grünen
Unit-Tests gedeckt** — weil dort `db.query` nachgebildet ist und eine
erfundene Spalte brav mitliefert.

| Endpunkt                            | was los war                                                               | Folge                                    |
| ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `GET /api/self-healing/metrics`     | Spalte `resolved_at` gibt es in `service_failures` nicht                  | 500, ausgerechnet der G7-Nachweis        |
| `GET /api/audit/logs`               | Spalten `username` und `request_method` gibt es in `api_audit_logs` nicht | 500, das Prüfprotokoll aus G5            |
| `GET /api/llm/queue/metrics`        | `AVG(...)::INTEGER FILTER (...)` ist ein Syntaxfehler                     | 500                                      |
| `GET /api/system/diagnostics/quick` | `detected_at` statt `timestamp`, von einem stillen catch geschluckt       | zeigte `database: {}` und sah gesund aus |
| `GET /api/apps/:id/n8n-credentials` | `throw new Error` für eine ganz normale Auskunft                          | 500 statt 400 mit Grund                  |

Die Uptime in Prozent, die `/api/self-healing/metrics` versprach, ist mit
diesem Schema nicht zu rechnen: `service_failures` kennt den Zeitpunkt der
Störung, nicht den der Behebung. Statt eine Zahl zu erfinden, die niemand
prüfen kann, liefert der Endpunkt jetzt `failures_by_service`.

**Neu: `scripts/test/endpunkte-live.py`.** Sie ruft alle GET-Endpunkte auf
einem laufenden Gerät auf, holt sich echte Ids aus den Listen-Endpunkten und
ist rot bei jedem 5xx. Ein 4xx ist grün: eine fehlende Pflichtangabe ist eine
Antwort, kein Absturz. Was sie nicht messen kann, steht am Ende **mit Grund**
statt als stilles Grün. Stand nach den Fixes, live gegen den Orin: 190 von
195 gemessen, keiner rot. Sie läuft in jedem autonomen Lauf
(`scripts/util/autonom-run.sh`, Handstart) und ausdrücklich nicht in der CI — sie braucht ein Gerät mit echter Datenbank,
und genau daran sind die fünf Fehler jahrelang vorbeigekommen.

## Der Wachhund wollte das Gerät neu starten, wegen eines Deploys (23.08.2026)

Zwei Funde aus dem Ereignisprotokoll des Orin, beide treffen G7.

**Ein Deploy schickte das Gerät fast in den Neustart.** Um 09:27 UTC wurde n8n
während eines Deploys ungesund. Der Agent startete es neu, der Docker-Aufruf
riss ab, und die Nachschau sah nach 15 Sekunden **einmal** nach. Da war der
Container noch nicht wieder da, denn Compose baute gerade das Abbild.

```
09:27:31 n8n         service_restart          WARNING   n8n unhealthy, performing restart
09:27:57 n8n-runners service_recovery_failed  CRITICAL  ('Connection aborted.', RemoteDisconnected(...))
09:32:37 n8n         service_escalation       CRITICAL  n8n failed 6 times, escalating to hard recovery
09:32:59 (System)    system_reboot            EMERGENCY System reboot triggered: 3 events in 30min
```

Die Nachschau sieht jetzt bis zu zwei Minuten lang alle fünf Sekunden nach,
gedeckelt durch ein Budget von 150 Sekunden je Runde. Das Budget ist kein
Beiwerk: die Heilungsrunde ist einfädig, und während sie wartet, läuft weder
die Temperatur- noch die GPU- noch die Plattenprüfung. Ohne Deckel hätten drei
Dienste den Wachhund sieben Minuten blind gemacht.

**Der Neustart-Eintrag war eine Behauptung, keine Beobachtung.** `system_reboot`
wurde vor jeder Prüfung geschrieben, mit `success=True`, Wortlaut „Saving state
and initiating reboot". Das Gerät lief danach vier Tage ununterbrochen weiter:
`SELF_HEALING_REBOOT_ENABLED` ist ab Werk aus, es gab nie einen Neustart. Der
Satz stand in genau dem Protokoll, aus dem `dauerlauf-bericht.sh` den Nachweis
für G7 liest. Jetzt sagt jeder Ausgang, was wirklich passiert ist:
`system_reboot_abgebrochen`, `system_reboot_unterdrueckt`, `system_reboot` erst
beim echten Absetzen, `system_reboot_gescheitert`.

## Drei Abnahmen maßen etwas anderes als ihren Namen (23.08.2026)

Alle drei sind an mir selbst aufgefallen, beim Versuch, die Prüfstand-Gates
nachzumessen. Sie stehen hier, weil eine Abnahme, die das Falsche misst,
schlimmer ist als keine: sie erzeugt Vertrauen ohne Deckung.

**Die zerstörende Abnahme zielte auf das Arbeitsgerät (#583).** Der Kopf von
`passwort-loeschung-abnahme.sh` sagt seit jeher „läuft ausschließlich gegen
den Prüfstand". Die Vorgabe war aber `https://localhost:8443` — und das ist
NUR auf dem Gerät der Prüfstand. Vom Arbeitsrechner aus zeigt dieselbe Adresse
durch den SSH-Tunnel auf das echte Gerät. Der Lauf hat dort das
Administrator-Passwort zu ändern versucht; verhindert hat es die
Anmeldedrossel mit HTTP 429, also Zufall. Jetzt wird der Prüfstand
nachgewiesen (ein laufender `pruef-reverse-proxy`, der 443 nach 8443
veröffentlicht), bevor irgendetwas passiert.

**Der „Fabrikzustand" trug das Konto des Arbeitsgeräts (#584).**
`pruefstand.sh` legt `.env.pruefstand` als Kopie der echten `.env` an, und die
trägt `ADMIN_PASSWORD` und `ADMIN_HASH`. Die Frischgerät-Abnahme baute daraus
ihren Fabrikzustand und fand folgerichtig ein Konto ab Werk vor. Kein Mangel
am Gerät, sondern eine Abnahme, die etwas anderes gemessen hat als ihren
Namen. Sie legt ihre Fabrik-Umgebung jetzt selbst an, ohne Zugangsdaten.

**Der Prüfstand läuft auf dem Gerät, nicht auf dem Arbeitsrechner.** Vorher
antwortete er von dort mit `docker: command not found` — richtig, aber
unbrauchbar. Jetzt steht der fertige ssh-Aufruf daneben.

Was im selben Lauf **bestanden** hat, und zwar genau die drei Punkte, die
heute früh noch offen waren:

```
OK    Ersteinrichtung nach Neustart                  True
OK    Administratoren nach Neustart                  0
OK    Flow-Dateien nach Neustart                     0
ABNAHME BESTANDEN
```

## Das Gerät bekam je Deploy einen Commit ohne Elternkette (#585)

`deploy-local.sh` holt den neuen Stand mit `git fetch "$SRC" "$NEW_SHA"` aus
dem Checkout des Läufers. Der lief mit `fetch-depth: 1`, hatte also keine
Vorfahren. `git fsck` auf dem Orin:

```
broken link from commit f1f1e86b -> to commit dec3a5b6
missing commit dec3a5b6      (der Merge von einer Stunde vorher)
```

Der Plan nannte dieses Loch bisher „60 von über 700 Commits vorhanden" und
behandelte es als gewachsenen Schaden. Es ist keiner: es ist die Folge von
`fetch-depth: 1`, und es wächst mit jedem Deploy. Das kostet den Rollback:
`git reset --hard "$PREV_SHA"` scheitert auf einem Gerät ohne Historie, der
Rollback fällt auf das Zurückdrehen der Images zurück und meldet sich seit
#567 ehrlich als unvollständig.

## Ein hängender Dienst reichte für einen Geräteneustart (23.08.2026, behoben)

Gate G7 verspricht sieben Tage unbeaufsichtigt. Der Orin läuft seit dem
19.08.2026 durch, und das sah nach dem Nachweis aus. Es war keiner.

`SELF_HEALING_REBOOT_ENABLED` steht auf **diesem** Gerät aus. In der
Ereignistabelle stehen trotzdem drei Neustart-Entscheidungen:

```
19.08. 21:39  system_reboot              Multiple critical failures: 136 events in 30min
23.08. 01:05  system_reboot              Multiple critical failures: 3 events in 30min
23.08. 09:32  system_reboot              Multiple critical failures: 3 events in 30min
23.08. 15:01  system_reboot_unterdrueckt Neustart waere faellig gewesen
```

Beim Kunden im unbeaufsichtigten Betrieb steht der Schalter an
(`scripts/interactive_setup.sh`, `UNATTENDED_MODE`). Dort hätte sich das Gerät
in vier Tagen dreimal selbst neu gestartet.

**Ursache.** `get_critical_events_count()` zählte CRITICAL-Zeilen. Solange ein
Dienst ungesund blieb, schrieb Kategorie A bei jedem Durchlauf eine weitere
Zeile `service_escalation` für denselben unveränderten Zustand — der Cooldown
von Kategorie C stand hinter dem `log_event`. Sieben Tage rückwärts gemessen:

```
service_escalation  pruef-llm-service   311 Zeilen an 61 Minuten
service_escalation  n8n-runners         283 Zeilen an 59 Minuten
service_escalation  n8n                 279 Zeilen an 60 Minuten
alles uebrige zusammen                   24 Zeilen
```

97 Prozent Wiederholung. Bei `MAX_CRITICAL_EVENTS = 3` war der Zähler in einer
halben Minute voll.

**Behoben an zwei Stellen**, weil eine allein zu leicht wieder aufgeht:
Migration 161 zählt `DISTINCT (event_type, service_name)`, und Kategorie A
schreibt die Zeile nur noch, wenn Kategorie C auch handelt (PR #610). Dazu das
Wartungsfenster (PR #611), damit ein Deploy die Kette gar nicht erst anstößt —
die Selbstheilung startete Dienste bis dahin mitten im Deploy neu, gegen den
Deploy, viermal an einem Tag.

**Live belegt auf dem Orin**, dieselben Daten, beide Zählweisen:

```
Fenster 19.08. 21:09 bis 21:39   132 Zeilen alt  →  2 Vorfaelle neu
letzte 48 Stunden                230 Zeilen alt  →  7 Vorfaelle neu
```

**Was dabei nebenbei auffiel und ebenfalls behoben ist:** `pruef-llm-service`
gehört zum Prüfstand, nicht zum Produkt. Die Selbstheilung des Produktstacks
überwachte jeden Container des Hosts. Seit dem Projektfilter
(`SELFHEAL_COMPOSE_PROJECT`) meldet der Agent beim Start
„überwacht das Compose-Projekt: arasul-platform", und das letzte
`pruef-*`-Ereignis stammt vom 23.08. 02:32.

**Der Verdacht gegen die knappen Healthcheck-Timeouts hat sich nicht
bestätigt.** Er lag nahe — n8n hat zwei Sekunden, `minio` eine —, aber gemessen
wurde er widerlegt (`scripts/test/healthcheck-luft.sh`):

| Lastfall                                     | schlechtester Dienst | Anteil am Timeout | Fehlschläge |
| -------------------------------------------- | -------------------- | ----------------- | ----------- |
| Leerlauf, 194 Proben je Dienst               | dashboard-backend    | 7 Prozent         | 0           |
| volle Abnahme-Reihe, 13 Abnahmen, 317 Proben | dashboard-backend    | 13 Prozent        | 0           |

Deshalb wurde kein einziger Timeout angefasst. Während der gesamten
Abnahme-Reihe hat die Selbstheilung **kein einziges Mal** eingegriffen; in der
Ereignistabelle steht seit dem Neustart des Agents nur `engine_started`.

**Der Schutz war zuerst um zehn Sekunden zu kurz.** Das Fenster schliesst,
sobald `compose up` zurueckkommt, und die Dienste sind dann noch ungesund.
Dreimal angesetzt, derselbe Vorgang:

| Pruefstand-Start          | Fenster                      | Eingriffe der Selbstheilung |
| ------------------------- | ---------------------------- | --------------------------- |
| 00:05, ohne Nachlauf      | 00:05:12 bis 00:05:33        | **2** (n8n, n8n-runners)    |
| 00:32, Nachlauf 60 s      | 00:32:54 bis 00:33:05 + 60 s | **3**, ab 00:34:17          |
| ab 24.08., Nachlauf 300 s | noch nicht gemessen          | offen                       |

**Und dann war die ganze Diagnose falsch.** Der dritte Versuch mit 300
Sekunden Nachlauf endete wieder mit zwei Eingriffen, elf Sekunden nach
Fensterschluss. Erst der Blick in das n8n-Protokoll hat gezeigt, warum:

```
01:53:38 Received SIGTERM. Shutting down...
```

n8n wird beim Pruefstand-Start nicht "unter Last kurz ungesund" — er wird
**gestoppt**. Mit `docker events` beim vierten Versuch belegt:

```
1787530964 kill n8n-runners     (02:22:44)
1787530965 stop n8n-runners
1787530965 die  n8n-runners
1787530965 kill n8n
1787530965 stop n8n
1787530965 die  n8n
```

Der Neustart durch die Selbstheilung kam um 02:23:04, also **zwanzig Sekunden
danach**. Sie hat nicht zu frueh eingegriffen, sondern richtig gehandelt: sie
hat repariert, was der Pruefstand kaputt gemacht hat. Das Wartungsfenster hat
diese Heilung zweimal um Minuten verzoegert.

**Der Befund lautet damit: waehrend `pruefstand.sh hoch` laeuft, werden n8n und
n8n-runners des Produktionsstacks gestoppt.** Wer sie stoppt, ist NICHT
belegt, und die naheliegende Antwort ist die einzige, die schon ausgeschlossen
werden konnte:

| geprueft                                 | Ergebnis                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Die Selbstheilung ueber den docker-proxy | nein. Im Fenster 02:22:30 bis 02:23:10 steht dort KEIN stop und kein kill, nur zwei `restart` um 02:22:53 und 02:23:04 — also NACH dem Stop |
| Namenskollision                          | nein. `docker compose config` loest zu `pruef-n8n` und `pruef-n8n-runners` auf                                                              |
| Netzkollision                            | nein. Eigene Netze `arasul-pruefstand_*`, Subnetz 172.31 statt 172.30                                                                       |
| `--remove-orphans`                       | steht nirgends im Skript                                                                                                                    |
| Was Compose vorhat                       | `up --dry-run` meldet ausschliesslich `pruef-n8n Creating/Created/Starting/Started`, keinen Stop                                            |

**Der Lauf mit ungefiltertem `docker events` hat es aufgeloest, und die Antwort
lautet: es war der Deploy.**

```
1787531900 container start pruef-n8n
1787531903 container kill n8n-runners
1787531904 network disconnect arasul-platform_arasul-backend
1787531904 container stop n8n-runners
1787531904 container kill n8n
```

Die vierte Zeile ist der Beweis. `network disconnect` vom Netz
`arasul-platform_arasul-backend` heisst, dass der Container im
PRODUKTIONSPROJEKT neu erstellt wird. Das tut kein Compose-Aufruf mit
`-p arasul-pruefstand`. Das tut ein Deploy.

Nachgerechnet:

| Stop     | Deploy begann | Abstand    |
| -------- | ------------- | ---------- |
| 01:53:38 | 01:52:29      | 69 s       |
| 02:38:23 | 02:36:42      | 101 s      |
| 02:22:44 | kein Deploy   | ungeklaert |

Zwei von drei Stops fallen mitten in einen laufenden Deploy. Fuer den dritten
fehlt der Mitschnitt, weil damals nur nach `kill|stop|die` gefiltert wurde.

**Der Fehler war meiner.** Ich habe Pruefstand-Starts angesetzt, waehrend meine
eigenen PRs deployt wurden, und die Wirkungen vermischt. Die Regel "keine
Abnahme waehrend eines Deploys" steht seit Tagen in der UEBERGABE; sie gilt
auch fuer Versuche, die einen Befund einkreisen sollen.

**Was davon bleibt:** ein Deploy erstellt n8n neu, und das ist richtig so. Das
Wartungsfenster deckt genau diesen Fall ab — es war nur zu kurz und wurde bei
sehr kurzen Laeufen gar nicht erst gesehen (siehe oben). Die Zusicherung der
sieben Trennungen ist NICHT widerlegt: keine Namenskollision, keine
Netzkollision, getrennte Images, und `up --dry-run` plant keinen Stop.

**Ein zweiter, kleinerer Fehler steckt in meinem eigenen Nachlauf.** Beim
vierten Versuch hat der Agent das Fenster nie gesehen: der ganze Lauf dauerte
27 Sekunden, das Fenster davon nur wenige, und der Takt betraegt zehn. Der
Nachlauf startet aber nur, wenn das Fenster vorher gemeldet wurde — kurze
Wartungen sind damit ungeschuetzt. Behoben ist das noch nicht; es waere ein
Eingriff in die Selbstheilung, und solange der Pruefstand Dienste stoppt,
waere er ohnehin nur Symptombehandlung.

**Die mittlere Zeile stand hier zuerst mit einer Null.** Ich hatte um 00:34
gemessen und den Erfolg gemeldet; der erste Eingriff kam um 00:34:17, zwoelf
Sekunden nach Ablauf des Nachlaufs, und loeste die Kaskade um 00:41 und 00:42
aus. Ein Beleg, der zu frueh genommen wird, ist keiner. Der Nachlauf steht
seither auf 300 Sekunden.

Die Ursache dahinter ist eingegrenzt, aber nicht geklaert. n8n wird kurz
ungesund, und zwar nicht durch Zeitueberschreitung: der Healthcheck brauchte
34 Millisekunden von 2000 erlaubten und meldete trotzdem einen Fehler, fuenf
Sekunden vor dem Neustart. Vier Versuche mit demselben Befehl:

| Versuch | Was lief                                                       | Fehler am Healthendpoint |
| ------- | -------------------------------------------------------------- | ------------------------ |
| 23:41   | Pruefstand, Images wurden gebaut                               | ja                       |
| 00:05   | Pruefstand, Images wurden gebaut                               | ja                       |
| 00:32   | Pruefstand, Images aus dem Cache                               | nein                     |
| 00:39   | Pruefstand, Images aus dem Cache, dazu ein Beobachter alle 2 s | nein                     |

Es liegt also am **Bauen**, nicht am Hochfahren. Das passt zu der Vermutung,
dass eine gesaettigte CPU den Container kurz nicht zum Zug kommen laesst — und
es erklaert, warum die Timeout-Messung nichts fand: die Antwortzeit steigt
nicht, die Verbindung kommt gar nicht erst zustande.

Belegen liesse sich das mit einem Bau ohne Cache, der eine halbe Stunde
Volllast erzeugt. Das ist es nicht wert, solange der Nachlauf die Folge
abfaengt. Wer die Frage doch schliessen will, findet in
`logs/n8n-healthz.log` den Beobachter dafuer beschrieben.

**Gegenprobe am 24.08.2026, 07:08:** die volle Abnahme-Reihe unter den neuen
Regeln. Dreizehn Abnahmen, 201 Pruefpunkte, alles gruen — darunter `chat`
20/20 und `modell-link` 10/10, also genau die beiden, die `OLLAMA_NO_CLOUD`
haette brechen koennen. Waehrend der 25 Minuten voller Last (GPU-Chat,
Dokumente, Modelle, Browser) hat die Selbstheilung **kein einziges Mal**
eingegriffen, und kein Dienst wurde ungesund.

Das ist die andere Haelfte des Nachweises: das Wartungsfenster setzt nicht zu
viel aus. Ein Schutz, der auch echte Ausfaelle verschluckt, waere schlimmer
als keiner.

**Was das fuer den G7-Zaehler heisst.** Der Dauerlauf-Bericht misst nicht nur
Laufzeit, sondern auch, ob seit dem letzten Neustart eine Selbstheilung
fehlgeschlagen ist. Am 23.08.2026 um 17:01 gab es den letzten solchen
Fehlschlag, und er zaehlt: das Urteil steht auf ROT, obwohl der Orin seit dem
19.08. durchlaeuft.

Das ist richtig gemessen und unbequem zugleich. Sieben Tage unbeaufsichtigt
heisst sieben Tage OHNE Eingriff, nicht sieben Tage Betriebszeit mit
Eingriffen dazwischen. Der Zaehler laeuft also faktisch ab dem letzten
Fehlschlag: **frueheste Erfuellung von G7 ist der 30.08.2026**, sofern ab
jetzt nichts mehr passiert.

Und genau daran haengt der Wert der heutigen Zuege. Bis heute hat jeder Deploy
und jeder Pruefstand-Bau die Selbstheilung ausgeloest, also hat jede eigene
Arbeit den G7-Zaehler zurueckgesetzt. Solange das so blieb, war G7 waehrend
der Entwicklung gar nicht erreichbar. Mit dem Wartungsfenster finden diese
Eingriffe nicht mehr statt — der Zaehler kann ab jetzt laufen, auch waehrend
gebaut wird.

**Was weiter offen ist:** Abnahmelast ist GPU- und I/O-Last, kein
Docker-Build. Ein Build sättigt alle CPU-Kerne, und genau das war der Fall vom
00:59. Gemessen ist dieses Profil nicht — aber es ist ab jetzt abgedeckt, weil
`pruefstand.sh` dasselbe Wartungsfenster setzt wie der Deploy.

---

## Fuellen die Protokolle die Platte? (24.08.2026, nachgerechnet, nein)

Die Vision nennt fuenf Jahre unbeaufsichtigten Betrieb, und `setup-logrotate.sh`
liegt im Repo, ist aber nirgends eingerichtet: weder ein Job in
`/etc/cron.hourly/` noch etwas in `/etc/logrotate.d/`. Das klang nach einem
Befund und ist keiner.

**Container-Protokolle rotiert Docker selbst.** In `compose.app.yaml` steht
`max-size: 50m, max-file: 10`, und am Container bestaetigt:
`json-file max-file=10 max-size=50m`. Deckel je Dienst also 500 MB, gemessen
belegt sind 478 MB fuer alle fuenfzehn zusammen.

**Der einzige Kandidat ist `logs/traefik-access.log`**, denn Traefik rotiert
nicht von selbst. Gemessen statt geschaetzt:

|                 |                                         |
| --------------- | --------------------------------------- |
| Zeitraum        | 09.06.2026 bis 24.08.2026, also 76 Tage |
| Groesse         | 59 MB, 64 584 Zeilen                    |
| Zuwachs         | 0,78 MB pro Tag                         |
| in fuenf Jahren | rund 1,4 GB                             |

Frei sind 1,3 TB. Selbst zehnfache Last beim Kunden bliebe unter 15 GB. Es
wird also nichts eingerichtet, was niemand braucht.

**Was diese Zahl NICHT sagt:** auf diesem Geraet sind fast alle Zeilen interne
Healthchecks. Ein Kundengeraet mit vielen Nutzern schreibt anderes Zeug, und
die 0,78 MB sind dann eine Untergrenze, keine Vorhersage.

---

## Zwei KI-Dienste rufen nach draußen (23.08.2026, offen)

Das ist der schwerste Befund des Tages. Gate G4 heißt „Daten bleiben auf dem
Gerät", und die Souveränitäts-Abnahme meldete zum ersten Mal einen Verstoß.

**`llm-service` → `ollama.com`.** Am 23.08.2026 um 17:01 UTC, während die
Kernkette lief:

```
ROT  kein Container hat unangekuendigt nach draussen verbunden
     nein|DRAUSSEN|llm-service 34.36.133.15|31|31
```

`34.36.133.15` ist `ollama.com`, auf dem Gerät aufgelöst. 31 Proben im
Zwei-Sekunden-Takt sind rund eine Minute offene Verbindung. Vier Versuche,
es zu reproduzieren, blieben leer: im Leerlauf (zweimal, zusammen über eine
Stunde) verbindet der Dienst nicht, `api/tags`, `api/ps` und `api/show` lösen
es nicht aus, und ein zweiter vollständiger Lauf der Kernkette auch nicht. Die
Ollama-Binärdatei (0.32.12) enthält zwei Adressen, die dafür infrage kommen:
`https://ollama.com/api/web_search` und
`https://ollama.com/api/experimental/model-recommendations`.

### Der Lauscher hat es gefangen (24.08.2026, 00:21)

Nach zweieinhalb Stunden Beobachtung stand es im Protokoll:

```
24.08. 00:21:22 ESTAB     34.36.133.15:443
24.08. 00:22:22 ESTAB     34.36.133.15:443
24.08. 00:22:42 TIME-WAIT 34.36.133.15:443
24.08. 00:23:42 TIME-WAIT 34.36.133.15:443
```

`getent ahostsv4 ollama.com` liefert genau diese Adresse. Die Verbindung stand
rund eine Minute offen, wie beim ersten Mal am 23.08. um 17:01. Damit ist der
Befund reproduziert, und zwar mit einem Beobachter, dessen Sehfaehigkeit im
selben Zeitraum belegt ist: der Kanarienvogel auf `searxng` zaehlte 3470
Zeilen, waehrend `llm-service` bei acht stand.

**Was es nicht ist.** `llama-server` laeuft mit `--offline`, das Modell selbst
spricht also nicht. Die 127.0.0.1-Aufrufe kurz davor sind eine falsche Spur:
davon gibt es 1498 in sechs Stunden, das ist der normale interne Verkehr.
Bleibt `ollama serve`.

**Die Schalter, die es dafuer gibt**, aus der Binaerdatei gelesen und nicht
erinnert (`grep -aoE 'OLLAMA_[A-Z_]{3,30}' /usr/bin/ollama`):

| Schalter                         | was er abschaltet                   |
| -------------------------------- | ----------------------------------- |
| `OLLAMA_NO_CLOUD`                | alle Cloud-Verbindungen             |
| `OLLAMA_AGENT_DISABLE_WEBSEARCH` | die eingebaute Websuche des Agenten |
| `OLLAMA_CLOUD_BASE_URL`          | die Zieladresse selbst              |
| `OLLAMA_REMOTES`                 | entfernte Modellquellen             |

Keiner davon ist gesetzt. Am ehesten passt `OLLAMA_NO_CLOUD`, und das Geraet
braucht nichts davon: die Websuche der Agenten laeuft ueber `searxng`, und
Modelle kommen ueber das Praefix `hf.co/` direkt von HuggingFace.

**Der Schalter ist seit dem 24.08.2026 gesetzt** (`OLLAMA_NO_CLOUD=1`, PR
#628). Vorher war zu klaeren, ob er auch den Weg zu HuggingFace zuzieht — ein
Kunde haette sonst das Hinzufuegen eigener Modelle verloren. Gemessen mit zwei
Wegwerf-Containern aus demselben Image, gleicher Pull-Versuch:

    mit OLLAMA_NO_CLOUD=1   Error: pull model manifest: realm host
                            "huggingface.co" does not match original host "hf.co"
    ohne den Schalter       dieselbe Meldung

Beide Male wurde huggingface.co erreicht. Am Geraet nachgeprueft, nachdem der
Schalter live war: `llm-service` ist healthy, und das Standardmodell
`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS` laedt und antwortet (27 s, davon 26 s
Ladezeit nach dem Neustart).

**Was damit NICHT belegt ist:** dass der Schalter die ollama.com-Verbindung
wirklich verhindert. Das sagt erst der Lauscher, der bis zum Abend des
24.08.2026 laeuft. Keine neue Zeile heisst belegt; eine neue Zeile heisst, der
Schalter war der falsche.

**`embedding-service` → `huggingface.co`.** Beim Nachsehen im selben
Netz-Namensraum gefunden, und dieser ist eindeutig:

```
CLOSE-WAIT 25 0  172.30.0.74:45468  3.160.39.100:443
$ getent hosts 3.160.39.100
server-3-160-39-100.txl50.r.cloudfront.net
$ getent ahostsv4 huggingface.co
3.160.39.100 3.160.39.15 3.160.39.87 3.160.39.99
```

Der Dienst setzt weder `HF_HUB_OFFLINE` noch `TRANSFORMERS_OFFLINE`.
sentence-transformers fragt deshalb beim Laden eines Modells bei
huggingface.co nach. Im Bild liegt nur `models--BAAI--bge-m3`; die beiden
Reranker (`ms-marco-MiniLM-L-12-v2`, `BAAI/bge-reranker-v2-m3`) liegen weder
dort noch im HF-Zwischenspeicher des Containers (12 KB, leer).

**Dazu ein Zustand, der nicht zur Konfiguration passt.** `embedding-service`
läuft auf dem Orin, obwohl sein Compose-Profil `classic-rag` ihn ausschaltet.
Er hält 3,9 GiB und arbeitet alle 13 bis 17 Sekunden einen Embedding-Stapel
ab. Der Indexer ist es nicht: der protokolliert ausdrücklich
„Textlayer-only indexed 2 chunks (Embedding aus — kein Qdrant)".

### Entschieden von Kolja am 23.08.2026: huggingface.co bleibt erlaubt

Der Weg des Einbettungsdienstes nach huggingface.co wird **nicht** gesperrt.
Die Begründung ist nicht Bequemlichkeit, sondern das Gegenteil: der Kunde soll
neue Modelle selbst nachladen können, auch wenn sein Gerät nie wieder eine
Software-Aktualisierung sieht. Ein Gerät, das keine Modelle mehr bekommt,
altert schneller als eines, das einmal telefoniert.

Damit ist `embedding-service` in `souveraenitaet-abnahme.sh` ein **deklariertes
Ziel**, so wie `searxng`. Was hinausgeht, ist der Name eines Modells, nicht
Kundenmaterial. Der Unterschied gehört in die Datenschutz-Unterlagen.

**Daraus folgt eine Aufgabe, und die ist neu:** die Quellen müssen einstellbar
sein. Heute kann ein Kunde nur laden, was im Katalog steht, und der Katalog
kommt aus Migrationen — also aus einer Software-Aktualisierung. Genau das darf
nicht die Bedingung sein. Siehe „Modelle über einen Link hinzufügen".

**Offen bleibt `llm-service` → `ollama.com`.** Einmal beobachtet, am
23.08.2026 um 17:01 UTC, rund eine Minute lang. Danach:

| Versuch                                                 | Ergebnis |
| ------------------------------------------------------- | -------- |
| Leerlauf, 4 Minuten im Zwei-Sekunden-Takt               | nichts   |
| `api/tags`, `api/ps`, `api/show`                        | nichts   |
| zweiter vollständiger Lauf der Kernkette                | nichts   |
| Beobachtung über **zwei Stunden** im Fünf-Sekunden-Takt | nichts   |

Vier negative Ergebnisse sind kein Beweis, dass es nicht passiert; sie zeigen
nur, dass es selten ist. Ein seltener Fall braucht einen langen Atem, deshalb
läuft seit dem 23.08. 19:51 ein Lauscher über **24 Stunden** im
Zwanzig-Sekunden-Takt (`/tmp/llm-draussen.log` auf dem Gerät). Er schreibt
Zeitpunkt, Zustand und Ziel mit — genau das, was beim ersten Fund fehlte.

Was bekannt ist: die Ollama-Binärdatei (0.32.12) enthält zwei Adressen, die
infrage kommen, `https://ollama.com/api/web_search` und
`https://ollama.com/api/experimental/model-recommendations`. Welche es war,
ist offen.

**Was heute getan ist:** die Messung wirft ihren Beleg nicht mehr weg (#587).
Beim ersten Fund war die Rohprobendatei schon gelöscht, und Port und
Zeitpunkt waren nicht mehr feststellbar. Das hat den halben Nachmittag
gekostet.

## Modelle über einen Link hinzufügen (23.08.2026, gebaut und abgenommen)

Kommt aus der Entscheidung zu G4: wenn huggingface.co erlaubt bleibt, damit
der Kunde neue Modelle bekommt, dann muss er sie auch hinzufügen können. Bis
dahin konnte er nur laden, was im Katalog steht, und der Katalog kommt aus
Migrationen — also aus einer Software-Aktualisierung. Ein Gerät ohne
Aktualisierungen hätte für immer die Modelle seines Auslieferungstages.

**Der Weg dahinter war nicht neu, nur nie erreichbar.** Ollama lädt direkt von
HuggingFace, wenn der Name mit `hf.co/` beginnt; das Standardmodell dieses
Geräts ist genau so eines. Es fehlte die Tür, nicht der Raum dahinter.

Zweistufig, und der erste Schritt ist der Punkt. Eine GGUF-Ablage trägt ein
Dutzend Quantisierungen zwischen 11 und 50 GB. Live am Orin:

```
Ablage: unsloth/Qwen3-30B-A3B-GGUF | frei: 14.9 GB
  IQ1_S          9 GB  braucht  12 GB  passt
  IQ2_M       10.9 GB  braucht  15 GB  passt NICHT
  ... insgesamt 25 Varianten
```

Ohne diesen Schritt müsste der Kunde raten und danach zweistellige Gigabyte
laden, um zu merken, dass es nicht hineinpasst.

**Was der Live-Lauf gefunden hat, und kein Unit-Test finden konnte.** Zwei
Fehler in genau diesen Zeilen, beide erst am Gerät sichtbar:

| Fund                                                                | Wirkung                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| HuggingFace antwortet auf einen Tippfehler mit **401**, nicht 404   | Meldung sagte „der Dienst ist kaputt" statt „der Name stimmt nicht" (#596) |
| `category` ist eine **Größenklasse**, kein Typ (CHECK small…xlarge) | jeder Aufruf endete mit HTTP 500 (#597)                                    |

Der zweite ist dieselbe Klasse wie die fünf Endpunkte vom selben Tag: im Test
ist die Datenbank nachgebildet und nimmt jeden Wert an.

**Und die Kehrseite, beim Nachweisen aufgefallen:** hinzufügen ging, entfernen
nicht. `DELETE /api/models/:id` räumt nur `llm_installed_models`, die
Katalogzeile bleibt — ein Tippfehler stünde für immer im Katalog des Kunden.
Migration 160 trägt dafür `selbst_hinzugefuegt`; die Spalte steht dort und
nicht als Text in `description`, weil eine Berechtigung nicht davon abhängen
darf, wie ein Satz formuliert ist (#598).

**Abnahme:** `scripts/test/modell-link-abnahme.mjs`, zehn von zehn im Browser.
Sie misst die Kette, nicht die Endpunkte: Varianten vor dem Laden, Größe UND
Speicherbedarf, Eintrag im Katalog, „Nicht von Arasul geprüft", Entfernen, und
dass ein kuratiertes Modell sich nicht entfernen lässt. Geladen wird nichts —
ein GGUF-Pull misst Ollama, nicht diese Funktion.

## G7 hat seit dem 23.08.2026 einen Bericht (#555)

G7 fragt nicht „läuft es gerade", sondern „lief es sieben Tage, ohne dass
jemand eingreifen musste". Das ist eine Zeitreihe, und sie entsteht nur, wenn
rechtzeitig gemessen wird. `scripts/test/dauerlauf-bericht.sh` liest sie aus
dem laufenden Gerät: Neustarts (Dockers `RestartCount`, ein Deploy zählt also
nicht mit), Selbstheilungen, Sicherungen und Lücken in der Messreihe.

Der erste Lauf über sieben Tage war rot, und zwei der drei Gründe waren
Buchhaltung, nicht Instabilität:

| Befund                                   | was dahinter steckte                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 802 Selbstheilungen, 91 „fehlgeschlagen" | 311 galten `pruef-llm-service`, also dem Prüfstand. `containers.list(all=True)` liefert jeden Container des Hosts, auch fremde Stacks und die Sandbox-Terminals der Nutzer |
| 74 der 91 Fehlschläge                    | Beobachtungen ohne Eingriff („consider restart if trend continues"), die als gescheiterte Heilung gebucht wurden                                                           |
| Lücke von 1031 s in der Messreihe        | steht noch offen, siehe unten                                                                                                                                              |
| kein Dienst startete von selbst neu      | das ist die gute Antwort, und sie gilt                                                                                                                                     |

Nach dem Fix überwacht der Agent nur sein eigenes Compose-Projekt, gelesen aus
seinem eigenen Container. Live nachgesehen: „Selbstheilung ueberwacht das
Compose-Projekt: arasul-platform", und seit dem Neustart ein Ereignis statt
hunderter.

**Offen bleibt die Lücke von 1031 Sekunden** in `metrics_cpu`. Über 17 Minuten
ohne Messwert heißt: entweder war das Gerät weg oder der Sammler. Beides zählt
gegen G7, und welches von beidem es war, ist noch nicht gemessen.

**Der Prüfstand lief mit.** Seit 02:32 desselben Tages, ein Überbleibsel der
Passwort-Abnahme. Er ist weg. Wer ihn hochfährt, nimmt ihn danach wieder
herunter, sonst misst die nächste Messung ihn mit.

# Ablauf

Die Phasen laufen in der Reihenfolge A, S, B bis K. Phase S steht außerhalb der Buchstabenfolge, weil sie erst am 19.08.2026 aus einem Befund der Phase A entstanden ist. Innerhalb einer Phase kann die
Reihenfolge sich nach Abhängigkeiten richten, mit zwei Ausnahmen, die bindend
sind: B5 vor B4, weil ein leerer Auslieferungszustand ohne Werksreset genau
einmal existiert, und E1 vor allem anderen in Phase E, weil eine Darstellung
nicht repariert, was mitten in der Antwort abbricht.

Jede Aufgabe wird als eigener Pull Request umgesetzt, mit Zweig, Prüfung durch
die CI und Abnahme am Gerät. Eine Aufgabe gilt erst als erledigt, wenn ihre
Abnahme auf dem Orin belegt ist, nicht wenn der Pull Request gemerged wurde.
