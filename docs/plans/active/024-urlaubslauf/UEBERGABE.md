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
