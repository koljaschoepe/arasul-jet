# Übergabe zu Plan 024

**Stand: 24.08.2026, 22:15.** Diese Seite trägt nur, was seit dem Abschluss von
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

| #   | Was                                           | Stand                                                                                                                                                                                   |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | 023 abschließen, 024 anlegen                  | **fertig.** 023 in `done/`, 024 ist der eine Faden                                                                                                                                      |
| V2  | Plan 024 mit Aufgabendatei                    | **fertig, alle fünfzehn Phasen.** 30 Aufgaben. Die frühere Begrenzung auf Phase 4 hätte den Lauf ab dem 03.09. in eine leere Liste laufen lassen — zehn von fünfzehn Tagen ohne Aufgabe |
| V3  | Ablaufskript bauen und trocken laufen lassen  | **fertig** (#692). `scripts/util/phasenlauf.mjs` plus `scripts/test/phasenlauf-test.mjs`, 24 Prüfpunkte, läuft bei jedem `run-tests.sh` mit                                             |
| V4  | Rollback-Gleichlauf zwischen git und Abbild   | **fertig** (#691)                                                                                                                                                                       |
| V5  | Zielbild ausformulieren                       | gehört ins Steuer-Repo, nicht hierher                                                                                                                                                   |
| V6  | Issue 602, `services/mcp-remote-bash` löschen | **fertig** (#693)                                                                                                                                                                       |
| V7  | G4-Ergebnis ablesen                           | **offen.** Die Lauscher sind am 24.08. gegen 17:15 neu gestartet worden, das Ergebnis liegt also frühestens am **25.08. gegen 17:15** vor                                               |
| V8  | G7 abnehmen und festschreiben                 | **offen**, frühestens 30.08.                                                                                                                                                            |

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

## 2e. Qdrant ist ausgebaut (24.08.2026, PR #695)

Der grösste Eingriff dieses Tages, und er berührt den Lauf an mehreren Stellen.

**Der Befund.** Plan 021 Schritt 8 hatte klassisches Vektor-RAG durch
agentisches ersetzt. Qdrant lief seitdem nicht mehr — aber der Code stand noch,
und **drei Features fielen still durch, statt ihren Ausfall zu melden**:

| Feature                                       | Zustand vor dem Ausbau                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /api/documents/search`                  | leere Trefferliste, kein Fehler                                                |
| KI-Gedächtnis, fliesst in jeden System-Prompt | speicherte nichts; `ai_memories`: **0 Zeilen** über die gesamte Gerätelaufzeit |
| Agenten-Werkzeug `rag_suche`                  | Verbindungsfehler                                                              |

Das ist G2-Stoff: eine Aktion, die schweigend nichts tut, ist schlechter als
eine, die scheitert.

**Was nicht verloren geht.** Kein heute funktionierendes Feature. Der
agentische Pfad (`dateien_suchen`, `symbol_suche`, benanntes Datei-Lesen,
`web_suche`) berührt Qdrant an keiner Stelle; der Volltext aller 1217 Dokumente
liegt als 37 638 Chunks in `document_chunks` und ist unangetastet.

**Was sich für den Lauf ändert:**

- `embedding-service` trägt **kein** Compose-Profil mehr. Er wird von sieben
  Stellen gebraucht, darunter die OpenAI-kompatible `/v1/embeddings`. Wer ihn
  auf dem Gerät stoppt, bricht das Wissensraum-Routing.
- `scripts/test/dr-drill.sh` startet nur noch `postgres-db` und `minio`. Der
  Drill ist danach **noch nicht wieder gefahren worden** — das ist der erste
  Punkt für Phase 6 (`P6-G6-01`).
- Migration **162** löscht `ai_memories`, dreizehn `rag_*`-Spalten in
  `system_settings` und `documents.qdrant_cleanup_pending`.
- `services/document-indexer/indexer.py` war toter Code (niemand importierte
  sie, Einstieg ist `api_server.py`) und ist weg. **`scripts/test/toter-code.sh`
  hatte sie nicht gefunden, weil der Prüfer nur JS/TS kennt.** Eine Lücke, die
  offen bleibt.

**Eine Rücknahme in eigener Sache:** `/api/memory/context-stats` war beim Ausbau
mitgegangen, obwohl der Endpunkt `compaction_log` und `llm_jobs` liest und mit
dem KI-Gedächtnis nie zu tun hatte. Er steht wieder, in `routes/ai/profil.js`.

**Nicht angefasst:** die `QDRANT_*`-Variablen in `.env.example` und
`.env.template`. Der Zugriff auf `.env*` war in der Sitzung gesperrt. Sie sind
ungenutzt und brechen nichts.

## 2f. Die Plan-Historie ist eingedampft (24.08.2026)

`docs/plans/` ging von 94 Dateien mit 57 474 Zeilen auf 12 mit 4913. Achtzig
abgeschlossene Plandateien sind aus dem Arbeitsbaum genommen;
[`docs/plans/HISTORIE.md`](../../HISTORIE.md) führt jede mit dem Commit, unter
dem ihr Volltext steht:

```bash
git show <commit>:docs/plans/done/<datei>
```

Die Übergabe von 023 ist geblieben. **Wer im Lauf einen alten Plan sucht und
ihn nicht findet, hat ihn nicht verloren — er steht in der Historie.**

## 2g. Der Qdrant-Ausbau ist live abgenommen (24.08.2026, 21:30 bis 22:00)

PR #695 ist gemergt, der Deploy lief in 6m17s durch. Danach auf dem Orin
gemessen, nicht abgeschrieben:

| Was                                  | Ergebnis                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Dienste                              | 15 von 15 `running (healthy)`, auch `document-indexer`                                                                  |
| Migration 162                        | `success = t` in `schema_migrations`                                                                                    |
| `ai_memories`                        | weg                                                                                                                     |
| `rag_*`-Spalten in `system_settings` | 0                                                                                                                       |
| **Textlayer**                        | **37 638 Chunks aus 1217 Dokumenten, unverändert**                                                                      |
| Backend-Fehler seit dem Deploy       | 0                                                                                                                       |
| **G4** Souveränität                  | **grün, 3 von 3**, 15 671 Verbindungszeilen, kein Container unangekündigt nach draußen                                  |
| **G6** Wiederherstellungsdrill       | **grün**, 11 kritische Tabellen, 52 s, aus dem Backup von 19:32 — also einem, das das umgebaute `backup.sh` erzeugt hat |
| **G7** Dauerlauf                     | **rot, aber nicht durch diesen Eingriff** (siehe unten)                                                                 |

**Zu G7.** Der Bericht sagt es selbst: der letzte fehlgeschlagene Heilversuch
war am **23.08. um 17:01**, achtundzwanzig Stunden vor dem Ausbau, und
„seither keiner mehr". Dazu erst **5 von 7** geforderten Tagen Laufzeit
(letzter Neustart 19.08. 17:29). Kein Dienst musste von selbst neu starten.
Das ist der bekannte Stand für den 30.08., kein neuer Befund.

**Ein Fehler ist dabei live aufgefallen und behoben worden (#696).** Die erste
Endpunkt-Messung meldete `GET /api/gdpr/categories` mit **500**:

```
relation "ai_memories" does not exist
GDPR-Export: Kategorie "ki_erinnerungen" nicht lesbar
```

Migration 162 löscht `ai_memories`, und drei Stellen fragten sie weiter ab —
darunter der **Datenexport nach Art. 15 DSGVO** und die Tabellenliste des
**Werksresets**, der als nächstes denselben Fehler gehabt hätte.

Die Ursache ist eine Sucheigenschaft, keine Unachtsamkeit im Einzelfall: der
Ausbau suchte nach `qdrant`, aber die DSGVO-Route nennt Qdrant nirgends — sie
nennt nur `ai_memories`. **Wer eine Tabelle löscht, sucht nach dem
Tabellennamen, nicht nach dem Dienst, der sie einmal befüllt hat.** Danach
gegengeprobt: von 93 Tabellen auf dem Gerät fasst keine Backend-Datei eine an,
die es nicht gibt.

Gefunden hat ihn `scripts/test/endpunkte-live.py`, **nicht** die 2675
Unit-Tests. Ein Test mit nachgebildeter Datenbank kann eine fehlende Tabelle
nicht bemerken. Das ist genau die Begründung, die in Aufgabe `P1-G1-02` steht —
sie hat sich am ersten Tag bezahlt gemacht.

**Zwei Dinge, die CI gefangen hat und die sonst auf dem Gerät gelandet wären:**

1. Die **Docker-Startprobe** des Indexers (aus #688) schlug fehl:
   `ImportError: cannot import name 'ENABLE_AI_ANALYSIS' from 'config'`. Beim
   Aufräumen hatte ein Regex die Zeile davor mitgenommen. **Der Indexer wäre
   auf dem Orin als Crash-Loop hochgekommen.** Danach nicht nur der eine Fall
   geprüft, sondern alle 24 Namen, die Indexer-Module aus `config` importieren.
2. Der **KI-Review** fand zwei Doku-Tabellen, die umformatiert, aber nicht
   inhaltlich nachgezogen waren: `API_REFERENCE.md` führte zwölf `rag_`-Felder
   weiter, die das `.strict()`-Schema heute mit `400` beantwortet, und
   `PYTHON_SERVICES.md` zwei gelöschte Indexer-Routen.

**Eine Falle für den Lauf, teuer wenn man hineinläuft:**
`scripts/test/dr-drill.sh` ist **destruktiv** — er verlangt die Eingabe
`DESTROY` und stellt die Produktionsdatenbank aus dem Backup wieder her. Der
reguläre, harmlose Drill ist ein anderer:

```bash
docker exec backup-service /usr/local/bin/restore-drill.sh
cat data/backups/restore_drill_report.json
```

Er stellt in einen **Sidecar-Postgres** wieder her. Die Aufgabe `P6-G6-01`
meint diesen, nicht `dr-drill.sh`.

## 2h. `main` ist seit dem 24.08.2026, 20:13 geschützt

Aufgefallen, weil ein Push abgelehnt wurde:

```
! [remote rejected] main -> main (push declined due to repository rule violations)
```

Das Ruleset heißt **„main geschuetzt"**, ist `active` und verlangt
`pull_request`, `required_status_checks`, `non_fast_forward` und `deletion`.
Angelegt am 24.08.2026 um 20:13, also während dieser Sitzung.

**Das kehrt Regel 5 des Plans um.** Dort stand bis heute „Kein Branch-Schutz
auf `main`… jeder Push nach `main` geht auf den Orin, und der Lauf trägt die
Folgen selbst". Der Plan ist entsprechend geändert.

**Was das für den Lauf heißt:** ein Agent, der direkt auf `main` pusht, läuft
in einen Fehlschlag. Jede Änderung braucht einen PR mit grüner CI. Der Deploy
hängt weiter am Merge — er entfällt nicht, er kommt einen Schritt später. Die
gemessenen 43 s Median gelten weiter für den Deploy selbst; dazu kommt jetzt
die CI-Zeit, am 24.08. rund fünf bis sieben Minuten.

## 2i. Der Doku-PR blockierte lautlos — und der Workflow hatte es vorhergesagt

Direkt nach dem Einschalten des Rulesets: PR #697 ändert **nur** Markdown und
ließ sich nicht mergen.

```
mergeable: MERGEABLE   state: BLOCKED
gelaufene Checks: nur claude-review
```

Das Ruleset verlangt **`CI Summary`**. `test.yml` läuft bei reiner Doku aber gar
nicht — `paths-ignore` schließt `**/*.md`, `docs/**`, `.claude/**` und `LICENSE`
aus. Der Pflicht-Check kommt also nie, und der PR wartet ewig.

**Der Kopf von `test.yml` hat genau das vorhergesagt**, wörtlich:

> „WER BRANCH-SCHUTZ EINSCHALTET, muss das vorher einmal echt ausprobieren:
> einen PR aufmachen, der nur eine .md-Datei ändert, und nachsehen, ob der
> Merge-Knopf freigegeben wird. Ein falscher Griff fällt hier nicht auf, er
> blockiert lautlos."

Die Annahme daneben ist damit **widerlegt**: dort steht, GitHub lasse einen
Pflicht-Check, dessen ganzer Workflow durch `paths-ignore` übersprungen wurde,
automatisch durchgehen. Bei der klassischen Branch Protection stimmt das; ein
**Ruleset** wartet auf einen Check, der nie kommt.

**Die Lücke ist geschlossen** mit `.github/workflows/doku-summary.yml`: er läuft
genau dann, wenn `test.yml` nicht läuft (die Pfadlisten sind komplementär und
werden gegeneinander geprüft), und meldet einen Check desselben Namens.

**Für den Urlaubslauf ist das keine Kleinigkeit.** Jede Tagesseite ist eine
reine Doku-Änderung. Ohne diesen Gegenpart hätte der Lauf ab Phase 0 keinen
einzigen seiner eigenen Berichte mergen können.

**Eine Frage bleibt offen**, und sie steht auch im Kopf des neuen Workflows: ein
PR, der Doku **und** Code ändert, löst beide Workflows aus — dann gibt es zwei
Checks namens `CI Summary`. Ob GitHub dann beide verlangt (sicher) oder einer
genügt (dann könnte der leere einen roten Testlauf verdecken), ist ungeprüft.
Der PR, der den Workflow einbringt, ist selbst so ein gemischter Fall; sein
Ergebnis steht unten.

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

| Thema                                                                                        | Warum offen                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailscale-Schlüssel läuft **22.11.2026** ab                                                  | nur in der Konsole abschaltbar, nicht auf dem Gerät                                                                                                                                                                                                                                                                                    |
| E2, serielle Warteschlange                                                                   | Umbau am Herzstück des Chats                                                                                                                                                                                                                                                                                                           |
| Der n8n-Knoten „Arasul LLM" umgeht die GPU-Sperre                                            | drei Wege, alle ändern eine ausgelieferte Integration                                                                                                                                                                                                                                                                                  |
| **Issue 686 (n8n hinter ein Profil) blockiert laut eigener Beschreibung den ersten Verkauf** | Die Vertragsanlage `drittlizenzen.md` führt n8n bereits als „nicht Bestandteil der Lieferung". Das ist unwahr, solange n8n ohne Profil startet — §444 BGB. Kolja hat am 24.08.2026 entschieden: **erst nach dem Urlaubslauf**, also nach dem 12.09. Das Risiko ist genannt, die Entscheidung steht                                     |
| Das Gerät fährt im **Entwicklungsmodus**                                                     | `arasul-platform.service` ist weder aktiv noch installiert, die Dienste laufen aus `/home/arasul/arasul/arasul-jet` statt `/opt/arasul`. Der G7-Beleg entsteht damit auf einem Gerät, das **nicht so startet wie ein Kundengerät**. Das gehört in die Formulierung des Gates, sonst belegt der Beleg etwas anderes als sein Titel sagt |
| Semantische Suche über Dokumente gibt es nicht mehr                                          | Kolja hat am 24.08.2026 „ersatzlos, der Agent sucht" gewählt. Falls ein Kunde danach fragt: der Text liegt vollständig in Postgres, ein GIN-Index auf `document_chunks.chunk_text` wäre der kurze Weg zurück                                                                                                                           |

## 5. Die eine Regel, die über allem steht

Aus 023 übernommen, weil sie sich an diesem Tag viermal bewährt hat:

> **Nichts abschreiben, was hergeleitet werden kann.** Jede Zahl auf dieser
> Seite trägt ein Datum, und daneben steht der Befehl, der sie neu holt. Eine
> von Hand gepflegte Zahl ist ab dem nächsten Zug falsch.
