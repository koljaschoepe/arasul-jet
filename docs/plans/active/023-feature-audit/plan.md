# Plan 023, Feature-Audit Arasul Jet: Umsetzung

> Grundlage: Rundgang vom 19.08.2026 (`rundgang.html`, 56 Befunde), Nachprüfung
> desselben Tages (`nachpruefung-2026-08-19.md`, acht Befunde behoben) und die
> Rückmeldung von Kolja vom 19.08.2026 mit 29 Anmerkungen.
>
> Stand: 2026-08-20. Umfang: elf Phasen, 61 Aufgaben, geschätzt 198 Stunden.

## Stand

| Phase                                 | Stand                                        | Belege                                                                                                                   |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A, Entscheidungen und Zusagen         | **fertig** 19.08.2026                        | Website und AVV nehmen die fünf unerfüllten Zusagen zurück, die drei fremden Projekte sind vom Gerät                     |
| S, Sicherung wiederherstellbar        | **fertig** 19.08.2026, live abgenommen       | #407 bis #410, #412, #414. Gate G6 hat als erstes einen belastbaren Nachweis                                             |
| B, Aufräumen und Auslieferungszustand | **fertig** 20.08.2026, live abgenommen       | #411, #413, #415 bis #424. `scripts/test/werksreset-abnahme.sh`, 18 von 18                                               |
| C, Fundament                          | C1 bis C5 fertig 20.08.2026, live abgenommen | #427, #428, #429, #431, #435. `scripts/test/bausteine.py` hält das Raster, seit #433 auch bei Dialogen. C6 offen, C7 neu |
| D bis K                               | offen                                        |                                                                                                                          |

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
Prüfstand mit `scripts/test/werksreset-abnahme.sh`, 18 von 18 Punkten. Drei
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

| Abnahme                                               | Ergebnis                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Der Erst-Start erscheint nach dem Löschen des Merkers | ja                                                                                                                        |
| Jeder Schritt nennt in Worten, der wievielte er ist   | „SCHRITT 1 VON 3" bis „SCHRITT 3 VON 3"                                                                                   |
| Jeder Schritt nennt sein Ergebnis                     | drei Mal „Danach: …"                                                                                                      |
| Jeder Schritt kündigt den nächsten mit Namen an       | „Als Nächstes: Ein KI-Coder ohne Konto", „Als Nächstes: Claude einmal anmelden (optional)", „Das war der letzte Schritt." |
| Der Fokus liegt beim Öffnen im Dialog                 | ja, auf dem Dialog selbst                                                                                                 |
| Das erste Shift+Tab bleibt im Dialog                  | ja, landet auf „Weiter"                                                                                                   |
| „Zurück" von Schritt 2 auf 1 verliert den Fokus nicht | ja, Fokus bleibt im Dialog                                                                                                |
| Beschreibung enthält Fortschritt und Inhalt           | „Schritt 1 von 3                                                                                                          | Arasul ist das Grundgerüst …" |
| Konsolenfehler                                        | keine                                                                                                                     |

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

---

# Phase D, Modelle

Geschätzt 20 Stunden. Zahlt auf G2 und G3.

## D1 Ein Namensregister

Heute steht im Katalog ein Name, im Chat ein anderer, in der Statusleiste ein
dritter, teilweise der rohe Dateiname aus Ollama. Künftig gibt es genau eine
Quelle für Anzeigenamen, aufgebaut nach Familie und Parameterzahl, zum Beispiel
„Qwen 3.8, 27B". `utils/modelDisplay.ts` wird diese Quelle, alle anderen Stellen
lesen daraus.

**Abnahme:** Derselbe Name im Katalog, im Chat, in der Statusleiste unten links,
in der Modellauswahl und in jeder Meldung. Ein Test hält das fest.

## D2 Modell-Detailansicht

Ein Klick auf ein Modell zeigt heute fast nichts. Künftig: wofür das Modell gut
ist, in zwei bis drei fachlichen Sätzen, Parameterzahl, Speicherbedarf,
Kontextlänge, gemessene Ausgabegeschwindigkeit auf diesem Gerät, Lizenz und ein
Link zur Modellkarte bei Hugging Face. Nichts Ausgedachtes, nur was belegbar ist.

**Abnahme:** Jedes Modell im Katalog hat alle Felder gefüllt, jeder Link führt
auf die richtige Modellkarte.

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

## D4 Speicherzahlen stimmen

„0.0 von 32.0 GB belegt, frei 30.0 GB" ist arithmetisch falsch. Bei einer Kachel
steht in der Kopfzeile 261 MB und im Text derselben Kachel 274 MB, Ursache ist
die Verwechslung von MiB und MB.

**Abnahme:** Belegt plus frei ergibt den Gesamtwert. Eine Einheit im ganzen
Produkt. Behebt F-04, F-05.

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

## D8 Zusatzkontext beschreibt das Produkt

Der Chat gibt auf die Frage, was Arasul kann, das Firmenprofil wieder, weil genau
das im Zusatzkontext steht. Das ist korrektes Verhalten bei falschem Inhalt. Der
Auslieferungszustand des Zusatzkontexts beschreibt künftig das Produkt.

**Abnahme:** Die Frage aus dem Rundgang liefert drei Stichpunkte über das Gerät,
nicht über die Beratungsleistung.

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

## E2 Abbruch beheben und Abbrechen ernst nehmen

Zwei Dinge, die zusammengehören. Der unerwünschte Abbruch aus E1 wird behoben.
Der gewünschte Abbruch, also der Klick auf Stopp, muss den Lauf wirklich beenden,
einschließlich laufender Werkzeugaufrufe und der Position in der Warteschlange.

Dazu: sehr lange Läufe und automatisch angestoßene Läufe dürfen die Warteschlange
nicht blockieren.

**Abnahme:** Ein Lauf über 30 Minuten läuft durch. Ein Klick auf Stopp beendet
ihn in unter zwei Sekunden, das Modell wird frei, die Warteschlange läuft weiter.
Zwei parallele lange Läufe blockieren einander nicht.

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

## E4 Inline-Darstellung wie im Terminal

Heute kommt ein Satz, dann eine Pause, dann der nächste Satz. Änderungen an
Dateien sind nicht sichtbar.

Künftig: Werkzeugaufrufe als aufklappbare Blöcke, Dateiänderungen als Diff
inline, Token pro Sekunde und Dauer je Antwort, Fehler als Block statt als
Fließtext. Vorbild ist die Darstellung von Claude Code.

**Abnahme:** Eine Aufgabe, die drei Dateien ändert, zeigt drei aufklappbare
Diffs, die Gesamtdauer und die Ausgabegeschwindigkeit.

## E5 Chats bekommen brauchbare Namen

Der Titel lautete während der Antwort „Arasul denkt nach" und wurde erst danach
durch die Frage ersetzt. Beim Zurückspringen findet man nichts wieder.

Künftig: nach dem ersten Austausch benennt das Modell den Chat nach dem, was
darin getan wurde, nicht nach der Frage. Bei größeren Änderungen im Verlauf wird
nachbenannt. Kein Zwischenzustand als Titel.

**Abnahme:** Zehn Chats aus verschiedenen Aufgaben tragen unterscheidbare Namen,
die die Aufgabe nennen.

## E6 Dateien und Ordner in den Chat ziehen

Gemeldet: mehrere Dateien oder Ordner nacheinander hineinzuziehen funktioniert
nicht zuverlässig.

Künftig: mehrere Dateien in einem Zug, mehrere Vorgänge nacheinander, ganze
Ordner mit Angabe der Zahl enthaltener Dateien, jede Anlage einzeln entfernbar,
sichtbare Rückmeldung beim Ziehen.

**Abnahme:** Drei Vorgänge nacheinander mit je zwei Dateien ergeben sechs
Anlagen. Ein Ordner mit 20 Dateien wird als ein Eintrag mit Zahl angezeigt.

## E7 Slash-Menü wie im Terminal

Heute öffnet Slash ein Menü, das nicht durchsuchbar ist, und das Bearbeiten von
Argumenten sieht unfertig aus.

Künftig: Slash öffnet direkt über dem Eingabefeld eine Liste, Tippen filtert,
Tab bestätigt, danach steht der Cursor beim ersten Argument. Ein Argument, das
eine Datei ist, kann per Ziehen gefüllt werden. Zusätzlich eine Suche nach
Dateien über ein eigenes Zeichen.

**Abnahme:** Slash, drei Buchstaben, Tab, Argument, Absenden funktioniert ohne
Maus. Die Liste ist bei 30 Flows noch bedienbar.

## E8 Quellen bei jeder Antwort aus Dokumenten

Der leere Chat verspricht „Antworten kommen mit Quellen aus deinen Dokumenten".
Im Rundgang kam keine Quelle. Mit einem echten Dokument funktioniert es
(bestätigt als F-53), ohne passendes Dokument fehlt der Hinweis, warum keine
Quelle da ist.

**Abnahme:** Eine Frage mit passendem Dokument nennt Datei und Stelle. Eine Frage
ohne passendes Dokument sagt, dass nichts gefunden wurde.

---

# Phase F, Terminal

Geschätzt 14 Stunden. Hier verbringt der Nutzer den Großteil seiner Zeit.

## F1 Kopfzeile responsiv

„Verbunden", „intern", „Quick Launch", „KI-Zugang" und das Wiederholen-Symbol
brechen im Standardlayout auf zwei Zeilen. Das Terminal wird ständig in der
Größe verändert.

**Abnahme:** Bei jeder Breite zwischen 400 und 1800 Pixeln bleibt die Kopfzeile
einzeilig, notfalls durch Zusammenfassen in ein Menü. Behebt F-51.

## F2 Farben

Das Grün passt nicht zum Produkt. Farbschema auf Blau und Grau, mit den
Standardfarben für Fehler und Warnung, die auch sonst gelten.

**Abnahme:** Kein Farbwert im Terminal, der nicht aus den Themenwerten stammt.

## F3 MCP-Server verwalten

Der Agent im Terminal soll MCP-Server selbst hinzufügen können, und diese sollen
über Sitzungen hinweg bestehen bleiben, nicht nur in der einen Shell.

Umfang: eine Verwaltung je Gerät, Auflisten, Hinzufügen, Entfernen, Prüfen der
Erreichbarkeit, sichtbar in der Oberfläche und über die Kommandozeile.

**Abnahme:** Ein hinzugefügter MCP-Server steht nach einem Neustart des
Containers in einer neuen Shell zur Verfügung.

## F4 Claude Code arbeitet im gewählten Projekt

Der Agent im Terminal muss im Ordner des oben gewählten Projekts stehen, dort
schreiben dürfen und Verbindungen aufbauen können.

**Abnahme:** Nach einem Projektwechsel oben steht eine neu geöffnete Shell im
richtigen Ordner. Eine dort geschriebene Datei taucht ohne Neuladen im Dateibaum
auf.

## F5 Darstellung insgesamt

Zeilenumbrüche mitten im Wort bei Pfaden, uneinheitliche Abstände, Bruch beim
Verkleinern. Das Terminal soll aussehen wie ein Terminal, nicht wie eine
Webseite mit Schrift in Festbreite.

**Abnahme:** Ein Pfad mit 120 Zeichen bricht an einer sinnvollen Stelle. Bei
jeder Größe bleibt der Inhalt lesbar.

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

## G2 Projekt anlegen aus Ordner oder GitHub

Zwei Wege, beide sichtbar: einen vorhandenen Ordner importieren oder ein
GitHub-Repository klonen.

**Abnahme:** Beide Wege führen zu einem Projekt, das oben wählbar ist, im
Dateibaum vollständig erscheint und im Terminal und Chat verfügbar ist.

## G3 GitHub-Kopplung in der Oberfläche

`routes/git.js` kann bereits koppeln, holen und schieben, je Projekt, mit
maskiertem Zugangsschlüssel. In der Oberfläche ist davon zu wenig zu sehen.

Umfang: Zustand der Kopplung, Änderungen gegenüber dem Stand auf GitHub, Holen,
Übertragen, Zweig wechseln, Konflikt sichtbar machen.

**Abnahme:** Ein Repository koppeln, im Terminal ändern, aus der Oberfläche
übertragen, die Änderung ist auf GitHub sichtbar. Alles ohne die Kommandozeile.

## G4 Indexierung beschleunigen

Eine Datei mit 739 Byte brauchte eine Minute und 53 Sekunden. Das ist kein
Durchsatzproblem, sondern Wartezeit an falscher Stelle, vermutlich Kaltstart des
Einbettungsmodells und Taktung der Warteschlange.

**Abnahme:** Eine kleine Datei ist in unter fünf Sekunden durchsuchbar. Ein
Ordner mit 100 Dateien in unter zwei Minuten. Behebt F-49.

## G5 Vektorsuche einschalten

Die Suche läuft heute auf der Textebene, die Vektorsuche ist aus. Damit ist die
Zusage „Antworten mit Quellen" nur halb eingelöst.

**Abnahme:** Eine Frage, die kein Wort aus dem Dokument enthält, findet die
richtige Stelle. Behebt F-50.

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

## H2 Ein Weg vom Terminal zur laufenden App

Heute registriert der Watcher jede Werkstatt mit `manifest.json` automatisch. Was
fehlt, ist der Weg dorthin: ein Befehl im Terminal, der ein Gerüst anlegt, und
eine sichtbare Kette von der Werkstatt über die Registrierung bis zum Tab.

**Abnahme:** Vom leeren Projekt bis zur sichtbaren, funktionierenden Anwendung
im Tab in unter zehn Minuten, ohne Wissen über den Aufbau des Manifests.

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

## H5 Erweiterungen sichtbar und schaltbar

Aktive Erweiterungen erscheinen links in der Leiste und lassen sich dort öffnen.
Der Schalter im Katalog wirkt heute sofort und schließt offene Tabs ohne
Rückfrage. Die Schalterbeschriftung ist uneinheitlich, „Im Workspace sichtbar"
gegen „Selbst gebaut".

**Abnahme:** Eine aktive Erweiterung steht links. Ausschalten fragt einmal nach,
wenn Tabs offen sind. Alle Schalter tragen dieselbe Beschriftung. Behebt F-11,
teilweise F-37.

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

## I2 Zwei Betriebsarten

Ein Flow läuft entweder mit Rückfragerunden oder vollständig autonom. Das wird
beim Anlegen gewählt und beim Start noch einmal angezeigt.

**Abnahme:** Derselbe Flow läuft in beiden Betriebsarten durch. Autonom stellt er
keine Frage, sondern trifft die Annahme und schreibt sie mit.

## I3 Rückfragen mit Auswahl

Bei Rückfragerunden bekommt der Nutzer eine Frage mit begründeten
Empfehlungen zur Auswahl und zusätzlich ein Freitextfeld. Erste Option ist die
Empfehlung.

**Abnahme:** Eine Rückfrage im laufenden Flow zeigt bis zu vier Optionen und ein
Freitextfeld, die Antwort fließt in den weiteren Lauf ein.

## I4 Vorlage nach dem Muster aus dem Entwicklungsordner

Die vorhandenen komplexen Abläufe aus dem Projekte-Development-Ordner dienen als
Maßstab: Daten zu einem Kunden auslesen, mehrere Rückfragerunden, Ergebnis als
Dokument. Mindestens eine solche Vorlage wird nachgebaut, um zu belegen, dass die
vereinfachte Oberfläche das trägt.

**Abnahme:** Der nachgebaute Flow läuft auf dem Gerät durch und erzeugt ein
brauchbares Dokument auf Deutsch.

## I5 Auf das Standardmodell abgestimmt

Der Harness muss mit Qwen3.8 27B gut laufen, nicht nur mit einem großen
Cloud-Modell. Anweisungen kurz, Werkzeugbeschreibungen knapp, Schritte klein
genug für ein Modell dieser Größe.

**Abnahme:** Jeder Vorlagen-Flow läuft mit dem Standardmodell ohne Eingriff
durch.

---

# Phase J, Einstellungen, Funktion statt Aussehen

Geschätzt 14 Stunden. Das Aussehen wurde in Phase C erledigt, hier geht es
darum, dass die Dinge tun, was sie sagen.

## J1 Passwortwechsel fehlerfrei

Ausdrücklich benannt: beim Ändern von Passwörtern darf nichts schiefgehen.
Betrifft Dashboard und MinIO.

**Abnahme:** Beide Passwörter geändert, neu angemeldet, Dateizugriff geprüft,
alter Zugang abgelehnt. Fehlerfälle mit verständlicher Meldung.

## J2 Fernzugriff belastbar

Der Zustand muss laufend ausgelesen und aktualisiert werden, auch auf anderer
Hardware wie DGX Spark. Die fünf Schritte, Installation, Verbinden, Zertifikat,
sicherer Name, fertig, laufen jeweils über die volle Breite und sind klar
getrennt.

**Abnahme:** Zustand aktualisiert sich ohne Neuladen. Schritt 5 zeigt erledigt,
wenn die Verbindung steht. Die Seite bricht bei keiner Breite.

## J3 Datenexport auf externe SSD

Der Export gibt es, das Ziel fehlt. Künftig wird eine angesteckte externe Platte
erkannt und als Ziel angeboten, daneben der Download.

**Abnahme:** Eine angesteckte SSD erscheint innerhalb von zehn Sekunden als Ziel.
Der Export landet darauf und ist wieder einlesbar.

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

## J5 Zerstörende Aktionen fragen nach

„Konto endgültig löschen" ist ohne Absicherung erreichbar, „Trennen" im
Fernzugriff kappt sofort die Verbindung, über die man gerade angemeldet ist.

**Abnahme:** Beide Aktionen fragen zweistufig nach und nennen die Folge.
„Trennen" warnt ausdrücklich, wenn die aktuelle Sitzung darüber läuft. Behebt
F-27, F-37.

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

## K3 README und Arbeitsanleitungen

Nach dem Umbau stimmt vieles nicht mehr: die Legacy-Shell ist weg, der
Auslieferungszustand ist leer, es gibt keine Nutzerverwaltung, Erweiterungen
haben Server-Fähigkeiten. Betroffen sind README, die CLAUDE.md des Repos, die
Anleitungen in `docs/` und alles, woran eine KI sich beim Mitarbeiten orientiert.

**Abnahme:** Jede Aussage in README und CLAUDE.md ist gegen den Code geprüft.
Kein Verweis auf Entferntes. Jede gespiegelte Zahl trägt Stand und Quelle.

---

# Rechnung

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

# Ablauf

Die Phasen laufen in der Reihenfolge A, S, B bis K. Phase S steht außerhalb der Buchstabenfolge, weil sie erst am 19.08.2026 aus einem Befund der Phase A entstanden ist. Innerhalb einer Phase kann die
Reihenfolge sich nach Abhängigkeiten richten, mit zwei Ausnahmen, die bindend
sind: B5 vor B4, weil ein leerer Auslieferungszustand ohne Werksreset genau
einmal existiert, und E1 vor allem anderen in Phase E, weil eine Darstellung
nicht repariert, was mitten in der Antwort abbricht.

Jede Aufgabe wird als eigener Pull Request umgesetzt, mit Zweig, Prüfung durch
die CI und Abnahme am Gerät. Eine Aufgabe gilt erst als erledigt, wenn ihre
Abnahme auf dem Orin belegt ist, nicht wenn der Pull Request gemerged wurde.
