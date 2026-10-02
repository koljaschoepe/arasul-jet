# Last: zwölf Personen gleichzeitig

> Gemessen am 02.10.2026 (J40) am Jetson AGX Orin 64 GB, Modell
> `qwen3.8:27b-q4_K_M` (das Standardmodell). Die Zahlen gelten für dieses Gerät
> und dieses Modell; ein anderes Gerät oder Modell misst neu. Das Messskript
> liegt im Repo: [`scripts/test/last-zwoelf-personen.py`](../../scripts/test/last-zwoelf-personen.py).

## Die Antwort in einem Satz

Zwölf Personen mit üblicher Nutzung (eine KI-Anfrage je Person alle paar
Minuten) warten am Orin **typisch 16 Sekunden, in 95 von 100 Fällen unter
35 Sekunden**. Fragen alle zwölf im selben Augenblick, wartet die letzte
**169 Sekunden**. Die Annahme „unter einer Minute" gilt also für den Alltag,
nicht für den Stoß.

## Wie das Gerät rechnet

Eine lokale KI-Anfrage nach der anderen. Chat (`/v1/chat/completions`,
`llm/chat`) geht durch die Warteschlange des Backends
(`llmQueueService`, ein Auftrag zur Zeit), und der eigentliche Modellaufruf
von Chat **und** Flow-Schritten geht durch dieselbe Sperre
(`services/flows/gpuQueue.js`). Das ist Absicht: eine GPU, ein Lauf, sonst
GPU-OOM.

Eine Antwort von rund 110 Token dauert **etwa 14 Sekunden** (12 bis 18 in der
Messung). Daraus folgt die Faustformel:

> Wartezeit ≈ (Anfragen vor mir + 1) × 14 Sekunden.

Unter einer Minute bleibt sie, solange höchstens drei Anfragen vor einer
stehen. Das Gerät schafft rund vier solcher Antworten je Minute.

## Messung (12 Probe-Konten, 150 Token je Antwort)

| Szenario                                             | Anfragen | Wartezeit p50 | p95    | längste |
| ---------------------------------------------------- | -------- | ------------- | ------ | ------- |
| Eine Anfrage allein                                  | 3        | 15,7 s        | –      | 17,5 s  |
| Zwölf Chat-Anfragen im selben Augenblick             | 12       | 87,3 s        | 169 s  | 169 s   |
| **Übliche Nutzung**, Pause 3 bis 8 Minuten, 14 Min.  | 25 Chat  | **15,8 s**    | 34,1 s | 37,3 s  |
| Übliche Nutzung, Flow (kurze Antwort)                | 4 Flows  | 14,7 s        | 24,8 s | 24,8 s  |
| Dichte Nutzung, Pause 20 bis 60 s, 6 Min. (Überlast) | 27 Chat  | 124 s         | 191 s  | 201 s   |
| Dichte Nutzung, Flow                                 | 9 Flows  | 16,6 s        | 37,0 s | 37,0 s  |

„Wartezeit" ist die Zeit von der Anfrage bis zur fertigen Antwort; in der
Messung fiel das erste Token mit dem Ende der Antwort zusammen (die Antwort
kam am Stück). „Dichte Nutzung" ist eine Überlast (jede Person fragt etwa jede
Minute, das Gerät schafft vier Antworten je Minute bei zwölf Personen): dort
wächst die Schlange, solange die Last anhält. Ein Flow wartete dort kaum, weil
er an der Sperre zwischen die wartenden Chat-Anfragen tritt.

## Warteschlange voll

Kurze Antworten (8 Token), N Anfragen im selben Augenblick:

| gleichzeitig | angenommen | abgewiesen (503) |
| ------------ | ---------- | ---------------- |
| 8 bis 20     | alle       | 0                |
| 22           | 21         | 1                |
| 24           | 21         | 3                |

Die Schlange ist **voll ab der 22. gleichzeitigen Anfrage**: eine rechnet, 20
warten (`LLM_MAX_QUEUE_SIZE`), die nächste bekommt 503 „Warteschlange ist voll".
Die angenommenen 21 liefen alle durch.

## Speicher

Der Speicher ist nicht der Engpass. Das Modell belegt 17 GB (`ollama ps`,
Kontext 32768), der Container `llm-service` 21,7 GB; das ganze Gerät belegte
zwischen 31,9 GB (Leerlauf, Modell entladen) und 33,6 GB unter Last, 28 GB
blieben frei von 62,8 GB. Backend und Datenbank bewegten sich nicht (75 MB und
180 bis 220 MB). Der Speicher wuchs während der Last nicht weiter.

## Einstellungen und warum

**`OLLAMA_NUM_PARALLEL`: 1** (vorher 2). Direkt an Ollama gemessen
(`scripts/test/measure-throughput.sh`, 100 Token je Anfrage):

| parallel | Wanduhr | Token/s |
| -------- | ------- | ------- |
| 1        | 13,4 s  | 11,7    |
| 2        | 26,2 s  | 12,0    |
| 4        | 52,0 s  | 12,1    |

Ein zweiter Platz kürzt keine Wartezeit: das 27B-Modell ist am Speicher
gebunden, die Wanduhr wächst linear mit der Zahl der Anfragen. Dazu schickt das
Backend ohnehin nur einen Aufruf zur Zeit. Jeder Platz hält einen eigenen
Kontext im Speicher, den spart der eine. Das Profil `orin-64` und der
Compose-Standard stehen jetzt auf 1. Was der eine Platz im Speicher
tatsächlich spart, ist **nicht gemessen** (die Einstellung durfte am Gerät nicht
von Hand geändert werden); die Wartezeit ändert er nicht.

**`LLM_MAX_QUEUE_SIZE`: 20, unverändert, jetzt über `.env` einstellbar.** Zwölf
Personen mit je einer offenen Anfrage füllen die Schlange nur bis 12; 20 lässt
Platz für Apps, die je Person zwei Anfragen schicken, und eine Wiederholung nach
einem Abbruch. Ein kleinerer Wert (etwa 4, damit die Wartezeit unter einer
Minute bleibt) würde schon einen Stoß von fünf Anfragen abweisen, also genau
den Fall, den der Alltag hat. Ein größerer Wert nützt nicht: 20 Wartende sind
fünf Minuten Wartezeit.

## Was das für ein Angebot heißt

- „Zwölf Personen" ist für **übliche Nutzung** belegt: die Wartezeit liegt am
  Orin unter 40 Sekunden. Das ist die Zahl, die man nennen kann.
- Die Last, bei der es kippt, ist rund **vier Antworten je Minute**
  (110 Token). Eine App, die in Stößen arbeitet (Stapelverarbeitung, alle
  zwölf um 8 Uhr), braucht entweder `timeout_seconds` und Abholen
  ([APP-PAKET.md](APP-PAKET.md#der-kontrakt-woran-ein-kit-merkt-dass-es-nicht-passt))
  oder ein größeres Gerät (für den Spark liegt der Messplan unter
  [`docs/ops/spark-erster-tag.md`](../ops/spark-erster-tag.md)).
- Der Kontrakt (`GET /api/v1/external/contract`, Abschnitt `last`) nennt
  dem Kit dieselben Zahlen.

## Wiederholen

```bash
ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
  python3 scripts/test/last-zwoelf-personen.py --ergebnis /tmp/last.json
# übliche Nutzung allein:
#   --szenarien gemischt --pause 180,480 --gemischt-minuten 14
```

Das Skript legt zwölf Konten `probe-j40-NN`, einen Schlüssel und einen Flow an,
legt die Passwörter über `geheim neu` ab und entfernt alles am Ende wieder. Nur
als `probe-admin`, nie als `admin`, nie während jemand am Gerät arbeitet: es
belegt die GPU für gut eine halbe Stunde.
