# Übergabe zu Plan 024

**Stand: 24.08.2026, 14:50.** Diese Seite trägt nur, was seit dem Abschluss von
023 dazugekommen ist. Alles Ältere steht in
[`docs/plans/done/023-feature-audit/UEBERGABE.md`](../../done/023-feature-audit/UEBERGABE.md)
— besonders die **acht Fallen**, die dort einen halben Tag gekostet haben. Sie
gelten weiter.

---

## 1. Was ohne Sitzung weiterläuft

| Was                                      | Wo                                                | Bis wann             |
| ---------------------------------------- | ------------------------------------------------- | -------------------- |
| Ausgang-Lauscher auf `llm-service`       | auf dem **Gerät**, `logs/ausgang-llm-service.log` | 24.08. 21:43         |
| Derselbe auf `searxng` als Kanarienvogel | `logs/ausgang-searxng.log`                        | dasselbe             |
| Der Dauerlauf für G7                     | das Gerät selbst                                  | fortlaufend          |
| Wiederherstellungs-Drill                 | `backup-service`, **sonntags 04:00**              | nächster Lauf 30.08. |

```bash
bash scripts/test/ausgang-lauscher.sh stand llm-service   # G4, siehe V7
bash scripts/test/ausgang-lauscher.sh stand searxng       # die Gegenprobe dazu
bash scripts/test/dauerlauf-bericht.sh                    # G7, siehe V8
```

**Zwischenstand des Lauschers am 24.08. 13:00:** letzte Zeile bei `llm-service`
um **00:23:42**, seitdem nichts. Der Kanarienvogel zählte in derselben Minute
weiter — die Null ist also gemessen und nicht blind.

## 2. Stand der Vorbereitung (V1 bis V8)

Die Liste stammt aus der Firmensicht `plans/aktiv/2026-08-24-urlaubslauf.md` im
Steuer-Repo. Was in diesem Repo lag, ist am 24.08.2026 erledigt.

| #   | Was                                           | Stand                                                                                                                                          |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | 023 abschließen, 024 anlegen                  | **fertig.** 023 in `done/`, 024 ist der eine Faden                                                                                             |
| V2  | Plan 024 mit Aufgabendatei                    | **fertig bis Phase 4** (#694). Bewusst nicht weiter: der Phasenschnitt ist ein Vorschlag, und Aufgaben für den 07.09. wären am 30.08. veraltet |
| V3  | Ablaufskript bauen und trocken laufen lassen  | **fertig** (#692). `scripts/util/phasenlauf.mjs` plus `scripts/test/phasenlauf-test.mjs`, 24 Prüfpunkte, läuft bei jedem `run-tests.sh` mit    |
| V4  | Rollback-Gleichlauf zwischen git und Abbild   | **fertig** (#691)                                                                                                                              |
| V5  | Zielbild ausformulieren                       | gehört ins Steuer-Repo, nicht hierher                                                                                                          |
| V6  | Issue 602, `services/mcp-remote-bash` löschen | **fertig** (#693)                                                                                                                              |
| V7  | G4-Ergebnis ablesen                           | **offen**, geht erst nach 24.08. 21:43                                                                                                         |
| V8  | G7 abnehmen und festschreiben                 | **offen**, frühestens 30.08.                                                                                                                   |

## 2b. Welche Gates die Abnahme-Reihe misst — und welche nicht

Am 24.08.2026 nachgesehen, weil es für den Lauf entscheidend ist:
`scripts/test/abnahmen.sh` führt **dreizehn** Abnahmen aus (`ALLE=(...)` in
Zeile 24). Darin sind `rueckmeldung` und `oberflaeche`, also G2 und G3.

**Drei Gates laufen dort nicht mit:**

| Gate | Messverfahren                                  | wird von `abnahmen.sh` gemessen     |
| ---- | ---------------------------------------------- | ----------------------------------- |
| G1   | die Reihe selbst                               | ja                                  |
| G2   | `rueckmeldung-abnahme.mjs`                     | ja, als Teil der Reihe              |
| G3   | `oberflaeche-abnahme.mjs`                      | ja, als Teil der Reihe              |
| G4   | `souveraenitaet-abnahme.sh` + Ausgang-Lauscher | **nein**                            |
| G6   | Wiederherstellungs-Drill im `backup-service`   | **nein**, läuft sonntags von selbst |
| G7   | `dauerlauf-bericht.sh`                         | **nein**                            |

Das ist kein Fehler der Reihe: `souveraenitaet` braucht eine SSH-Verbindung und
misst, während parallel gearbeitet wird; der Drill läuft im Container. Aber es
hat eine Folge für einen unbeaufsichtigten Lauf: **wer nur die volle Reihe
fährt, misst G4, G6 und G7 nie.** Die Aufgabendatei muss sie einzeln nennen,
sonst steht am 12.09. ein Gate auf einem Beleg vom 30.08.

In `aufgaben.json` ist G7 als `P0-G7-01` drin. G4 und G6 gehören in die Phasen,
die noch nicht gefüllt sind (nach dem Vorschlag 8 und 6).

---

## 2c. G4 ist belegt — und dabei fiel ein Rest auf

**Der Beleg.** `souveraenitaet-abnahme.sh` am 24.08.2026 um 15:00, **3 von 3
grün**:

```
gruen  die Kernkette lief waehrend der Messung        6 von 6 gruen
gruen  es wurde ueberhaupt beobachtet                 13668 Verbindungszeilen
gruen  kein Container hat unangekuendigt nach draussen verbunden   keine einzige
```

Derselbe Lauf belegt nebenbei, dass die vier Reparaturen vom 23./24.08. wirken
— jede an einer Stelle, an der die Messung vorher gelogen hätte:

| Reparatur                             | im Lauf sichtbar als                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `state connected` statt `established` | alle sechs Funde stehen auf **CLOSE-WAIT**; vorher wäre keiner davon gesehen worden |
| IPv6 richtig zerlegt                  | keine Rückschleife in der Liste                                                     |
| Adresse statt Anzahl                  | `185.15.59.224` mit Namen `text-lb.esams.wikimedia.org`, nicht `\|53\|53`           |
| `ssh -n`                              | **sechs** Ziele in der Meldung. Vorher stand dort genau eines                       |

Damit ist die Aufgabe, die der Phasenvorschlag auf Phase 8 legt, erledigt,
bevor der Lauf beginnt.

**Der Rest, der dabei auffiel.** `embedding-service` läuft auf dem Arbeitsgerät
seit **23.08. 16:21** (`RestartCount=0`), obwohl er im Compose unter
`profiles: ['classic-rag']` steht.

**`CLAUDE.md` hat trotzdem recht, und das ist nachgemessen.** Der Satz dort
lautet „läuft NICHT von selbst" — er tut es auch nicht. Gefragt wurde Docker
selbst, ohne irgendetwas zu starten:

```
docker compose config --services
  → backup-service dashboard-backend dashboard-frontend docker-proxy
    document-indexer llm-service metrics-collector minio n8n n8n-runners
    postgres-db reverse-proxy searxng self-healing-agent          (14, ohne ihn)

docker compose --profile classic-rag config --services
  → dieselben plus embedding-service und qdrant                   (16)
```

`docker compose config` ist genau die Auflösung, die `up -d` benutzt. Ein
blankes `up -d` startet ihn also **nicht** — er wurde am 23.08. ausdrücklich
mit `--profile classic-rag` gestartet und seither nicht gestoppt. Das ist die
Handlung eines Menschen, kein Versagen des Mechanismus.

**Zurückgenommen: `profiles:` allein trägt NICHT als Beleg dafür, dass eine
Komponente nicht ausgeliefert wird.** Hier stand am 24.08. zuerst das Gegenteil,
gestützt auf die Messung oben. Sie ist richtig, beantwortet aber die falsche
Frage: **ein Kundengerät startet nicht mit `docker compose up -d`.** Es startet
über `packaging/arasul-platform/etc/systemd/system/arasul-platform.service`,
das `scripts/system/ordered-startup.sh` aufruft — und dieses Skript nennt
Dienste **namentlich**:

```
PHASE2_SERVICES="qdrant llm-service embedding-service"
PHASE3_SERVICES="dashboard-backend dashboard-frontend n8n reverse-proxy"
```

Ein namentlich genannter Dienst aktiviert sein Profil **implizit**. Am
24.08.2026 auf dem Orin gegen Compose 5.0.1 nachgemessen, mit `qdrant`, weil er
nicht läuft und der Fall damit sauber ist:

```
docker compose config --services | grep -c '^qdrant$'   → 0     (nicht in der Liste)
docker compose --dry-run up -d qdrant                   → Container qdrant Creating
                                                          Container qdrant Created
                                                          Container qdrant Starting
```

**Folge für Issue 686:** ein `profiles:` am n8n-Dienst allein ändert am
Auslieferungszustand nichts, solange `n8n` in `PHASE3_SERVICES` steht. Der
Auftrag braucht **beides** — das Profil **und** die Streichung aus
`PHASE3_SERVICES`. Wer nur das Profil setzt und die Zusage in der Vertragsanlage
für eingelöst hält, irrt.

**Und ein Befund, der schwerer wiegt als der Anlass:** auf dem Orin ist
`arasul-platform.service` **weder aktiv noch installiert**.

```
systemctl list-unit-files arasul-platform.service   → 0 unit files listed
/etc/systemd/system/arasul-platform.service         → existiert nicht
/opt/arasul                                          → existiert
laufende Dienste kommen aus                          → /home/arasul/arasul/arasul-jet/docker-compose.yml
```

Der vorgesehene Auslieferungs-Startweg ist auf dem einzigen physisch
vorhandenen Gerät **nie gelaufen**. Das ist eine M1-Frage, keine Lizenzfrage —
und sie betrifft G7: der Dauerlauf-Nachweis entsteht auf einem Gerät, das nicht
so startet, wie ein Kundengerät starten würde.

Er ist damit auch der Grund für eine der sechs Außenverbindungen oben
(cloudfront, also huggingface). Die Abnahme führt ihn korrekt als deklariertes
Ziel, das Gate bleibt grün — aber:

> Ein Kundengerät hätte diesen Dienst gar nicht laufen. Was hier gemessen wird,
> ist damit an einer Stelle **strenger** als der Auslieferungszustand, nicht
> lockerer. Das ist die gute Richtung, gehört aber gewusst.

**Nicht gestoppt.** Ein laufender Dienst auf dem Produktionsgerät wird nicht
nebenbei angehalten; wer ihn am 23.08. gestartet hat, hatte einen Grund, und
der steht nirgends. Ein Zustand, dessen Grund nirgends steht, wird
aufgeschrieben und nicht weggeräumt.

Zu entscheiden bleibt nur, ob er vor dem 30.08. aus soll — sonst misst Phase 0
auf einem Gerät, auf dem ein Dienst läuft, den ein Kundengerät nicht hätte.

---

## 2d. G6 ist belegt, mit einer klar benannten Grenze

Der Wiederherstellungs-Drill läuft **sonntags 04:00**. Der nächste Lauf wäre der
30.08. gewesen — also genau der Tag, an dem Phase 0 startet. Die Reparaturen an
ihm stammen vom 24.08. nachts (#625, #627) und wären dort **zum ersten Mal**
gelaufen. Das ist der schlechteste denkbare Zeitpunkt für einen ersten Lauf,
deshalb am 24.08. 15:16 von Hand ausgelöst:

```
OK:   documents = 2222 rows
OK:   document_chunks = 37586 rows
OK:   n8n.workflow_entity = 2 rows
OK:   arasul.flow_runs = 119 rows
Schemas im Betrieb: arasul n8n public
Schemas im Abzug:   arasul n8n public
OK:   Flow-Archiv lesbar (9 Flow-Dateien)
Drill OK in 49s (verified=11, flows=ok)
```

Der Schemavergleich in den letzten beiden Zeilen **ist** die Reparatur: vorher
hätte der Drill ein im Abzug fehlendes Schema nicht bemerkt. Er läuft, und die
Sicherung von heute 02:00 ist wiederherstellbar.

Gefahrlos, weil der Drill in einem **eigenen** Postgres-Container mit eigenem
Namen und zufälligem Port arbeitet (`DRILL_DB=arasul_drill`) und die
Produktions-Datenbank nur lesend anfasst — für den Schemavergleich.

**Die Grenze, und sie gehört zum Beleg:** verifiziert werden **11 kritische
Tabellen**, nicht alle. Der Phasenvorschlag legt „über alle 206 Tabellen" auf
Phase 6 — das bleibt dort und wird hier nicht vorweggenommen. Was jetzt belegt
ist: der Drill läuft, findet ein fehlendes Schema, und die letzte Sicherung
trägt.

---

## 3. Was der Trockenlauf gleich gefunden hat

Erwähnenswert, weil es die Mechanik rechtfertigt: `phasenlauf-test.mjs` hat beim
**ersten** Lauf einen Fehler im Ablauf gefunden, den ich selbst geschrieben
hatte. Die volle Reihe „zur Mitte" startete, obwohl bereits zwei Abnahmen rot
waren und die Notbremse unmittelbar danach griff — zwanzig Minuten Messung auf
einem Stand, von dem schon bekannt war, dass er kaputt ist.

Ein zweiter Fehler fiel beim Schreiben auf: im ersten Entwurf standen beide
vollen Reihen hintereinander am Ende der Phase. Vierzig Minuten für eine
Aussage.

Beide sind behoben. Beide wären in einem unbeaufsichtigten Lauf teuer geworden,
und beide hat kein Mensch gefunden, sondern ein Test mit Attrappen.

## 4. Was bei Kolja liegt

Unverändert aus 023, plus eines:

| Thema                                             | Warum offen                                                                                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailscale-Schlüssel läuft **22.11.2026** ab       | nur in der Konsole abschaltbar, nicht auf dem Gerät                                                                                                                                                       |
| E2, serielle Warteschlange                        | Umbau am Herzstück des Chats                                                                                                                                                                              |
| Der n8n-Knoten „Arasul LLM" umgeht die GPU-Sperre | drei Wege, alle ändern eine ausgelieferte Integration                                                                                                                                                     |
| **Phase 5 des Laufs steht leer**                  | n8n fällt aus dem Auslieferungsumfang (W-2026-08-173), aber solange es ohne Profil im Standardstack steht, läuft es mit. Ob Phase 5 wegfällt, entscheidet Kolja. Der Widerspruch steht in der Firmensicht |

## 5. Die eine Regel, die über allem steht

Aus 023 übernommen, weil sie sich an diesem Tag viermal bewährt hat:

> **Nichts abschreiben, was hergeleitet werden kann.** Jede Zahl auf dieser
> Seite trägt ein Datum, und daneben steht der Befehl, der sie neu holt. Eine
> von Hand gepflegte Zahl ist ab dem nächsten Zug falsch.
