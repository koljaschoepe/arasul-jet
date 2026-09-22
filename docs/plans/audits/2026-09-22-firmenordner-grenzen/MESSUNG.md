# Firmenordner: wegwerfen, Suchindex, RAM-Grenze

> 22.09.2026, Auftrag `firmenordner-wegwerfen-und-grenzen` (J33). Gemessen am
> Orin in einem **Nebencontainer** (`j33grenze-*`, eigenes Compose-Projekt,
> eigene Volumes unter `~/j33grenze/`, Port nur auf `127.0.0.1`,
> `restart: no`, hinterher restlos entfernt) — die Schutzregel vom 21.09.2026
> gilt: auf dem Orin läuft die Belege-App, und kein Produktdienst wird für
> eine Messung angefasst.
>
> Messhülle: [`messhuelle/`](messhuelle/) · Rohdaten:
> [`rohdaten/laeufe.txt`](rohdaten/laeufe.txt)

## Die Frage

Am 22.09.2026 hat der Überordner beim Ernten drei Dinge gefunden:

1. `DELETE /api/firmenordner/ordner` auf einen Raum mit 6.076 Dateien
   antwortete **`500 grpc error`**, im Log `context canceled`. Die Dateien
   waren danach von der Platte, die Zeile am Gerät blieb, und erst nach einem
   `docker compose restart firmenordner` ging sie weg.
2. Der Suchindex (bleve) hielt danach **Dateinamen** des Raums.
3. Der Runterlauf von 488 MB brauchte **1.750 MiB** — bei einer Grenze von
   2 GiB.

Dazu die offene Frage, was mit **Symlinks** im Baum passiert.

## Die Antworten in einem Satz

| Befund                          | Ursache                                                                                                                    | Was jetzt gilt                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `500 grpc error` beim Wegwerfen | **Die eigene Zeitgrenze von 10 s**; der Purge braucht 11,4 s für 6.000 Dateien                                             | Eigene Geduld fürs Wegwerfen (15 min), die Route hebt auch ihre Antwortfrist, und am Ende wird der **Zustand** gefragt statt der Antwort geglaubt |
| Suchindex hält die Namen        | **Dieselbe** Zeitgrenze: der abgeschnittene Purge erreicht den Suchdienst nie                                              | Mit Zeit fallen 92 % sofort; der Rest sind Leichen in einem unverschmolzenen Segment, die Suche findet nichts                                     |
| 1.750 MiB für 488 MB            | **Falsch gelesen**: `docker stats` zeigt, was der Go-Laufzeitkern hält, nicht was er braucht — die Zahl folgt der _Grenze_ | Grenze auf **4 GiB**, weil bei 2 GiB derselbe Lauf einmal `OOMKilled` war und einmal mit halbem Durchsatz durchkam                                |
| Symlinks                        | Der Ablagetreiber `posix` geht **wortlos** an ihnen vorbei                                                                 | Die Route sagt es (`nicht_abgeglichen`), die Karte sagt es                                                                                        |

---

## 1. Wegwerfen: eine Ursache, drei Symptome

Zwei Läufe, sonst gleich — 6.000 Dateien in zwanzig Ordnern, einmal mit Zeit,
einmal nach zehn Sekunden abgeschnitten (genau das, was `ordnerdienst.js` tat):

|                                | Purge mit Zeit   | Purge nach 10 s abgeschnitten  |
| ------------------------------ | ---------------- | ------------------------------ |
| Dauer                          | **11,4 s**       | abgebrochen                    |
| Dateien auf der Platte danach  | 0                | **0**                          |
| Raum in `/graph/v1.0/drives`   | weg              | **weg**                        |
| Antwort an den Aufrufer        | `204`            | **Abbruch**                    |
| Zweiter Versuch, sofort danach | —                | **`500 grpc error`** in 0,13 s |
| Namen im Suchindex (`grep`)    | 11.567 → **968** | 11.927 → **11.927**            |
| Suchtreffer für einen Menschen | 200 → **0**      | 500 → **0**                    |

**Der Dienst räumt zu Ende, auch wenn niemand mehr zuhört.** Das ist die
ganze Erklärung, und sie erklärt alle drei Symptome: das Backend schnitt ab,
der Dienst löschte weiter, und was blieb, war ein Raum ohne Dateien, eine
Zeile, die ihn weiter führte, ein Suchindex, der nichts von der Löschung
erfuhr, und ein `500` auf jeden weiteren Versuch, bis der Registry-Cache des
Dienstes ablief (nach Stunden von selbst, oder sofort mit einem Neustart).

**Das `500` ist dabei kein Zufall, sondern die Auskunft des Dienstes für
„gibt es nicht mehr"**: auch `GET /graph/v1.0/drives/<weggeworfener raum>`
antwortet `500 grpc error` statt `404`. Aus dieser Antwort ist „weg" von „ging
schief" nicht zu unterscheiden — aus der **Liste** schon.

### Was gebaut wurde

1. `FIRMENORDNER_ZEITGRENZE_LOESCHEN_MS` (15 min) neben den zehn Sekunden für
   alles andere. Bei 1,9 ms je Datei reicht das für ein paar hunderttausend.
2. `res.setTimeout` an der Route: `index.js` schneidet jede Antwort nach 60 s
   ab (TIMEOUT-001), ohne diese Zeile wäre Punkt 1 eine Behauptung.
3. `raumSteht()`: meldet der Dienst einen Fehler, wird die Liste gefragt.
   Steht der Raum nicht mehr darin, ist er weg. Kommt die Liste selbst nicht,
   heißt das „steht noch da" — wer nicht nachsehen konnte, behauptet nichts.

### Dazu gefunden: ein Ordner der Ebene 2 ließ seine Dateien liegen

Ein WebDAV-`DELETE` ist kein Wegwerfen, sondern ein **Verschieben**. Nach
`DELETE /dav/spaces/<raum>/teil04` lagen die Dateien unter
`projects/<raum>/.Trash/files/<uuid>.trashitem/` — **alle**. Die Route
verspricht „samt allem, was darin liegt"; ein Papierkorb, den niemand leert,
ist das Gegenteil, und die nächtliche Sicherung trägt ihn Nacht für Nacht mit.

Das Gerät leert jetzt genau **den einen** Eintrag nach
(`oc:trashbin-original-location` nennt, woher er kam) und nicht den
Papierkorb: darin liegt auch, was ein Mensch gelöscht hat und morgen
zurückholen will.

### Gegengemessen mit dem Code des Geräts

`ordnerdienst.js` unverändert in einem `node:22-alpine` im Netz des
Nebencontainers, gegen den echten Dienst
([`messhuelle/nodeprobe/`](messhuelle/nodeprobe/)):

| Fall                                                                | Ergebnis                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Raum mit 6.000 Dateien                                              | `loescheRaum` durch nach **11,7 s**, Raum nicht mehr in der Liste, 0 Dateien                           |
| Ordner der Ebene 2 mit 2.000 Dateien                                | `loescheOrdner` durch nach **2,9 s**, 0 im Raum, **0 im Papierkorb**                                   |
| Der Fall vom Ernten (Purge von außen abgeschnitten, dann das Gerät) | Dienst sagt `500 grpc error`, Gerät sieht in der Liste nach, meldet es als Warnung und kommt **durch** |

---

## 2. Der Suchindex: zwei Messgeräte, zwei Antworten

- **Die Suche** (`REPORT /dav/spaces` mit `oc:search-files`) findet nach dem
  Wegwerfen **nichts** — in beiden Läufen. Der Dienst kennt den Raum nicht
  mehr und gibt nichts aus ihm heraus. Gegengeprüft an einem lebenden Raum:
  dort findet dieselbe Abfrage die Dateien.
- **`grep` über `data/firmenordner/ablage/search`** sieht, was auf der Platte
  steht, und nur er sieht den Unterschied zwischen den zwei Läufen:
  968 gegen 11.927.

Die **968**, die bleiben, sind Bytes gelöschter Dokumente in einem
bleve-Segment, das noch nicht verschmolzen ist. Dass es Leichen sind und keine
lebenden Einträge, sagt der Vergleich: eine Löschung im Index ist je Dokument
ganz oder gar nicht — 92 % verschwinden nicht, wenn die Dokumente noch da
wären. Gegengemessen über sechs Minuten unter Indexlast (8.000 neue Dateien
daneben, acht statt vier Segmente): die Zahl bleibt bei 968. Einen Befehl, der
eine Verschmelzung erzwingt, gibt es nicht (`opencloud search index` kennt nur
`--space` und `--all-spaces`, also Aufbauen, nicht Wegnehmen).

**Wer wirklich null will**, nimmt den Index einmal ganz weg — er ist
abgeleitet, nicht Nutzdaten:

```bash
docker compose stop firmenordner
rm -rf data/firmenordner/ablage/search
docker compose --profile firmenordner up -d firmenordner
```

Das ist ein Neustart und deshalb kein Teil des Wegwerfens.

**Der normale Löschweg räumt den Index auf**, und das ist der Beleg dafür,
dass der Suchdienst Löschungen überhaupt verarbeitet: ein über WebDAV
gelöschter Ordner verschwindet sofort aus der Suche, und die `grep`-Treffer
für eine Datei darin gingen von 6 auf 4.

---

## 3. Die RAM-Grenze: die Zahl folgt der Grenze, nicht der Last

Sechzehn Läufe, je frischer Container, Last jeweils ein Runterlauf wie der
eines Klienten (`messhuelle/schritte/05-runterlauf.py`). Der entscheidende
Block — **immer derselbe Lauf**, 6,4 GB in 16-MB-Dateien, 64 gleichzeitige
Übertragungen:

| Grenze                  | Gipfel        | Durchsatz     | Ausgang                                     |
| ----------------------- | ------------- | ------------- | ------------------------------------------- |
| 2 GiB                   | **2.048 MiB** | —             | **`OOMKilled`, 388 Übertragungen verloren** |
| 2 GiB (Wiederholung)    | **2.048 MiB** | **79,7 MB/s** | durchgekommen, halber Durchsatz             |
| 3 GiB                   | 3.030 MiB     | 170,6 MB/s    | durch                                       |
| 4 GiB                   | 3.895 MiB     | 169,9 MB/s    | durch                                       |
| 4 GiB, **128** parallel | 3.923 MiB     | 170,0 MB/s    | durch                                       |
| 8 GiB                   | 3.079 MiB     | 175,2 MB/s    | durch (32 parallel)                         |

**Was `docker stats` meldet, ist nicht der Bedarf**, sondern der Stand, den
der Go-Laufzeitkern gerade hält: er gibt freigegebene Seiten erst unter Druck
zurück. Deshalb liegt der Gipfel in fast jedem Lauf 150–350 MiB unter der
gesetzten Grenze, egal wie groß die Last ist — und deshalb war „Gipfel
1.226 MiB" (21.09.) und „1.750 MiB für 488 MB" (22.09.) nie eine Aussage über
den Bedarf.

**Was etwas sagt, ist der Ausgang, und bei 2 GiB ist er Zufall:** zwei
identische Läufe, einmal vom Kernel erschlagen, einmal durchgekommen mit
halber Geschwindigkeit.

**Vierundsechzig gleichzeitige Übertragungen sind kein Extremfall.** Der
Klient des Herstellers nimmt sechs je Rechner — das sind zehn Menschen im
Haus, die morgens ihren Ordner abgleichen.

**Entschieden: `RAM_LIMIT_FIRMENORDNER=4G`.** Vier statt drei, weil 3 GiB an
derselben Last mit einem Prozent Luft durchkam und 4 GiB die doppelte Last
(128 parallel) bei vollem Durchsatz trägt. Der Schutz des Geräts ist ohnehin
die **CPU**-Grenze (zwei Kerne), nicht die RAM-Grenze.

**`GOMEMLIMIT` steht absichtlich nicht da.** Gemessen hilft es in einem
Bereich und in dem, der wehtut, gar nicht:

| Last                                             | ohne                 | mit `GOMEMLIMIT=1500MiB`  |
| ------------------------------------------------ | -------------------- | ------------------------- |
| 2.000 MB, 16 parallel, 1-MB-Dateien              | 2.005 MiB, 14,1 MB/s | **1.684 MiB, 15,2 MB/s**  |
| 4.000 MB, 24 parallel, 8-MB-Dateien              | 2.048 MiB, 87,7 MB/s | **1.722 MiB, 104,4 MB/s** |
| 6.400 MB, 32 parallel, 16-MB-Dateien             | 1.971 MiB            | 1.970 MiB                 |
| 6.400 MB, 64 parallel, 16-MB-Dateien (bei 4 GiB) | 3.895 MiB            | 3.756 MiB                 |

Ein zweiter Wert, der der Grenze von Hand nachgezogen werden muss, damit er
überhaupt etwas tut, ist die Sorte Doppelung, die eines Tages auseinanderläuft
— und er hätte den `OOMKilled`-Lauf nicht verhindert.

---

## 4. Symlinks: unsichtbar, und niemand sagt es

Vier Sorten im Baum, dreißig Sekunden gewartet, dann gefragt:

| Symlink                        | im `PROPFIND` | `GET` | in der Suche |
| ------------------------------ | ------------- | ----- | ------------ |
| auf eine Datei daneben         | nein          | `404` | nein         |
| auf einen Ordner daneben       | nein          | `404` | nein         |
| ins Leere                      | nein          | `404` | nein         |
| nach draußen (`/etc/hostname`) | nein          | `404` | nein         |

Zur Kontrolle standen die echte Datei und der echte Ordner daneben brav in
derselben Antwort.

**Es gibt keine Fehlermeldung**, an der jemand es merken könnte, und auf dem
Rechner des Menschen sieht der Ordner vollständig aus. Das Gerät kann das
nicht heilen — was der Dateidienst nicht kennt, kennt auch das Backend nicht,
und ein Lauf über hunderttausend Dateien je Anfrage wäre ein Preis für eine
Auskunft, die nichts ändert. Es **sagt** es deshalb: `GET /api/firmenordner`
führt `nicht_abgeglichen` mit, und das CLI am Rechner eines Menschen ist die
einzige Stelle, die beim Lauf über den Baum einen Symlink sehen kann.

---

## Was diese Messung nicht beantwortet

- **Der echte Klient.** Gemessen wurde mit parallelen WebDAV-Anfragen, nicht
  mit dem Klienten des Herstellers. Für die RAM-Frage ist das die schärfere
  Last; für die Frage, wie sich ein Abgleich anfühlt, ist es keine Messung.
- **Wann bleve verschmilzt.** Sechs Minuten unter Last haben die 968 Bytes
  nicht angefasst. Ob es Stunden oder Wochen sind, steht hier nicht.
- **Die obere Kante von 4 GiB.** 128 parallele Übertragungen trägt sie; wo sie
  bricht, wurde nicht gesucht.
