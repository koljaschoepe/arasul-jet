# Last: zwölf Personen gleichzeitig

> Gemessen am 02.10.2026 (J40) und ein zweites Mal am 14.10.2026 (KW9) am Jetson AGX Orin 64 GB, Modell
> `qwen3.8:27b-q4_K_M` (das Standardmodell). Die Zahlen gelten für dieses Gerät
> und dieses Modell; ein anderes Gerät oder Modell misst neu. Das Messskript
> liegt im Repo: [`scripts/test/last-zwoelf-personen.py`](../../scripts/test/last-zwoelf-personen.py).

## Die Antwort in einem Satz

Zwölf Personen mit üblicher Nutzung (eine KI-Anfrage je Person alle paar
Minuten) warten am Orin **typisch 16 Sekunden, in 95 von 100 Fällen unter
35 Sekunden**. Fragen alle zwölf im selben Augenblick, wartet die letzte
**175 Sekunden** (169 im ersten Lauf). Zwei Läufe, am 02.10. und am 14.10.2026,
lagen beim Alltag und beim Stoß dicht beieinander. Die Annahme „unter einer Minute" gilt also für den Alltag,
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

## Messung (12 Probe-Konten, 150 Token je Antwort), zwei Läufe nebeneinander

Lauf 1: 02.10.2026, Stand `6c6e68c7` (J40, PR 833), Konten `probe-j40-NN`.
Lauf 2: 14.10.2026, Stand `50d9b19b` (der Stand, der am Orin lief), Konten
`probe-kw9-NN`, Einstellungen unverändert (`OLLAMA_NUM_PARALLEL=1`,
`LLM_MAX_QUEUE_SIZE=20`). Je Zelle p50 / p95 in Sekunden; „n" ist die Zahl der
Anfragen im Lauf.

| Szenario                                         | Lauf 1 (02.10.) p50 / p95 | Lauf 2 (14.10.) p50 / p95 | Abweichung p50 / p95 |
| ------------------------------------------------ | ------------------------- | ------------------------- | -------------------- |
| Eine Anfrage allein (n 3)                        | 15,7 / –                  | 15,7 / –                  | 0 % / –              |
| Zwölf Chat-Anfragen im selben Augenblick         | 87,3 / 169                | 75,5 / 175                | −14 % / +4 %         |
| **Übliche Nutzung**, Pause 3 bis 8 Min., 14 Min. | **15,8** / 34,1 (n 25)    | **16,2** / 24,6 (n 18)    | +3 % / −28 %         |
| Übliche Nutzung, Flow (kurze Antwort)            | 14,7 / 24,8 (n 4)         | 10,9 / 20,1 (n 7)         | −26 % / −19 %        |
| Dichte Nutzung, Pause 20 bis 60 s, 6 Min.        | 124 / 191 (n 27)          | 157 / 211 (n 22)          | +27 % / +10 %        |
| Dichte Nutzung, Flow                             | 16,6 / 37,0 (n 9)         | 27,0 / 42,4 (n 14)        | +63 % / +15 %        |

Längste Wartezeit: übliche Nutzung 37,3 s (Lauf 1) und 24,6 s (Lauf 2), alle
zugleich 169 s und 175 s, dichte Nutzung 201 s und 219 s.

**Ob die Zahlen halten.** Die Annahme war: Abweichung unter 20 Prozent bei p50
und p95. Das gilt für das, was das Angebot nennt (eine Anfrage allein, alle
zugleich, übliche Nutzung p50), und für die längste Wartezeit beim Stoß. Es
gilt **nicht** überall: das p95 der üblichen Nutzung liegt 28 Prozent
**darunter** (besser; 18 statt 25 Anfragen, bei so wenigen ist das p95 nahe am
Höchstwert und schwankt mit den zufälligen Pausen), und die dichte Nutzung
liegt beim p50 27 Prozent **darüber**. Die dichte Nutzung ist eine Überlast,
dort wächst die Schlange, und wie weit, hängt davon ab, wie die zufälligen
Pausen fallen; sie ist keine Zahl für ein Angebot. Die Antwortdauer selbst hat
sich nicht bewegt (eine Antwort allein: 15,3 bis 19,7 s in beiden Läufen).
Zurückgenommen wird deshalb nichts; im Angebot und im Kontrakt steht die
vorsichtigere Seite (95 von 100 unter 35 Sekunden).

„Wartezeit" ist die Zeit von der Anfrage bis zur fertigen Antwort; in der
Messung fiel das erste Token mit dem Ende der Antwort zusammen (die Antwort
kam am Stück). „Dichte Nutzung" ist eine Überlast (jede Person fragt etwa jede
Minute, das Gerät schafft vier Antworten je Minute bei zwölf Personen): dort
wächst die Schlange, solange die Last anhält. Ein Flow wartet dort weniger als
ein Chat, weil er an der Sperre zwischen die wartenden Chat-Anfragen tritt; im
zweiten Lauf wartete er mit 27 Sekunden länger als im ersten.

## Warteschlange voll

Kurze Antworten (8 Token), N Anfragen im selben Augenblick (im zweiten Lauf
bestätigt: 8 bis 20 alle angenommen, 22 gleichzeitig 21 angenommen und 1
abgewiesen, 24 gleichzeitig 21 angenommen und 3 abgewiesen):

| gleichzeitig | angenommen | abgewiesen (503) |
| ------------ | ---------- | ---------------- |
| 8 bis 20     | alle       | 0                |
| 22           | 21         | 1                |
| 24           | 21         | 3                |

Die Schlange ist **voll ab der 22. gleichzeitigen Anfrage**: eine rechnet, 20
warten (`LLM_MAX_QUEUE_SIZE`), die nächste bekommt 503 „Warteschlange ist voll".
Die angenommenen 21 liefen in beiden Läufen alle durch. Bei 20
gleichzeitigen Anfragen wartete im zweiten Lauf die letzte 48 Sekunden (kurze
Antworten).

## Speicher

Der Speicher ist nicht der Engpass. Das Modell belegt 17 GB (`ollama ps`,
Kontext 32768), der Container `llm-service` 21,7 GB; das ganze Gerät belegte
zwischen 31,9 GB (Leerlauf, Modell entladen) und 33,6 GB unter Last, 28 GB
blieben frei von 62,8 GB. Backend und Datenbank bewegten sich nicht (75 MB und
180 bis 220 MB). Der Speicher wuchs während der Last nicht weiter.

Zweiter Lauf (14.10.2026, `free -m`, alle 15 Sekunden): belegt 9,3 GB mit
entladenem Modell, **29,3 bis 31,2 GB** mit geladenem Modell unter Last,
mindestens **31,6 GB verfügbar** von 62,8 GB. Modell 17 GB (Kontext 32768),
`llm-service` 20,5 bis 22,3 GiB, Backend 87 bis 89 MB, Datenbank 580 bis 593 MB.
Zwei Abweichungen vom ersten Lauf: der Gerätewert unter Last liegt 2,4 GB
niedriger (33,6 gegen 31,2 GB; der eine Modell-Platz ist eine mögliche
Erklärung, **isoliert gemessen ist das nicht**), und die Datenbank steht bei
580 MB statt 180 bis 220 MB (Seitencache einer zwölf Tage laufenden
Datenbank, während der Läufe stabil zwischen 580 und 593 MB). Der Leerlaufwert des ersten Laufs (31,9 GB) ist mit dem hier (9,3 GB)
nicht vergleichbar, dort war das Modell offenbar noch geladen.

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
ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197   # oder 100.121.244.80 (Tailscale)
LAST_STEMPEL=probe-kw9 ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
  python3 scripts/test/last-zwoelf-personen.py --ergebnis /tmp/last.json
# übliche Nutzung allein:
#   --szenarien gemischt --pause 180,480 --gemischt-minuten 14
```

Das Skript legt zwölf Konten `<Stempel>-NN` (Vorgabe `probe-j40`, einstellbar mit
`LAST_STEMPEL`; Person aus Vorname, Nachname und E-Mail `<Stempel>-NN@probe.invalid`), einen Schlüssel und einen Flow an,
legt die Passwörter über `geheim neu` ab und entfernt alles am Ende wieder. Nur
als `probe-admin`, nie als `admin`, nie während jemand am Gerät arbeitet: es
belegt die GPU für gut eine halbe Stunde. Der Arbeitsrechner darf dabei nicht
in den Ruhezustand gehen (`caffeinate -dimsu`), sonst reißt der Tunnel ab und
ein Szenario misst nur Fehler (am 14.10.2026 einmal passiert, wiederholt).
