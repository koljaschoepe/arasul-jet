# Spark, der erste Tag: ein Messplan

Stand 02.10.2026 (J41). Der DGX Spark (GB10) steht noch nicht da. Dieser Plan
ist das, was am ersten Tag in Dresden passiert: **messen, nicht portieren.**
Alles, was ohne GPU und Treiber an einem Spark brechen kann, findet vorher der
Trockenlauf in der CI; hier steht, was nur das Geraet beantwortet.

Erwartung: vier bis acht Stunden, davon die Haelfte Wartezeit (Abbilder bauen,
Modell holen). Ohne diesen Plan waeren es zwanzig bis vierzig Stunden
Portieren gewesen; das war die Rechnung hinter dem Beschluss vom 01.10.2026.

## Was vorher schon gemessen ist, und was nicht

Der Job **Spark-Trockenlauf** (`.github/workflows/test.yml`,
`scripts/test/spark-trockenlauf.sh`) fuehrt `./install.sh` aus dem Artefakt auf
einem arm64-Laeufer ohne GPU bis zum Ende des Bootstraps aus, mit dem Profil
`dgx-spark`. Er zeigt:

- die Erkennung (`detect-platform.sh`) macht aus arm64 ohne Tegra mit dem Namen
  GB10 ein `dgx_spark`, und die `.env` kommt aus `config/platforms/dgx-spark.json`;
- `Dockerfile.spark` baut beide GPU-Dienste nativ fuer linux/arm64, Ollama
  bringt `cuda_v13` mit, kein Abbild hat eine Jetson-Basis;
- Datenbank, Migrationen, Anmeldung, Backend, Frontend, Proxy, Sicherung und
  Selbstheilung kommen gesund hoch, die Sicherung laeuft durch, der
  Lizenz-Fingerabdruck antwortet.

Er zeigt **nicht**, und zwar absichtlich ohne es vorzutaeuschen:

| Ausgelassen im Trockenlauf                   | Weil                                                           | Messpunkt hier |
| -------------------------------------------- | -------------------------------------------------------------- | -------------- |
| `nvidia-smi` des GB10 (die CI hat eine Attrappe, die nur den Namen nennt) | kein Treiber | 2 |
| Ollama auf der GPU (`llm-service` laeuft ohne NVIDIA-Laufzeit)            | keine GPU    | 1, 4 |
| Standardmodell holen (17 GB)                 | kein Platz, keine GPU                                          | 3 |
| Einbettungsdienst auf CUDA (laeuft auf der CPU)                           | keine GPU    | 1 |
| Werksreset                                   | zerstoert; nur am Geraet                                       | 7 |
| Selbstheilung gegen echte GPU-Last           | keine GPU                                                      | 8 |

Jede dieser Stellen schreibt im Protokoll des Trockenlaufs
`UEBERSPRUNGEN (Trockenlauf)`. Am Geraet ist `ARASUL_TROCKENLAUF` nie gesetzt.

## Vorbereitung (vor der ersten Messung)

```bash
id -u        # Sollwert 1000, siehe unten
# Auf dem Spark, als der Benutzer, der Docker darf. Artefakt wie bei jedem Kunden:
tar xzf arasul-<Fassung>.tar.gz && cd arasul-<Fassung>
./install.sh --ssh-behalten        # der Spark ist Kolja zugaenglich, SSH bleibt wie es ist
```

**Sollwert:** `install.sh` endet mit 0, `docker compose ps` zeigt jeden Dienst
`healthy` (der Trockenlauf kennt dieselbe Zahl: `docker compose config --services`),
und die `.env` nennt `JETSON_PROFILE=dgx_spark`, `GPU_DOCKERFILE=Dockerfile.spark`.
Steht dort etwas anderes, hat die Erkennung den Spark nicht erkannt: Punkt 2
zuerst, dann der Rest. Die Zeit bis zum Ende des Bootstraps aufschreiben.

**Benutzer mit UID 1000.** Jeder Container der Plattform laeuft als UID 1000 und
liest die Geheimnisse (`config/secrets`, Rechte 600) als Bindmount. Hat der
installierende Benutzer eine andere Nummer, endet jeder Dienst mit `EACCES` auf
`/run/secrets/postgres_password`, und keiner kommt hoch. Der Trockenlauf hat das
am 02.10.2026 gefunden (arm64-Laeufer, UID 1001) und laeuft seither als 1000.
DGX OS legt den ersten Benutzer ueblicherweise mit 1000 an; **ungemessen**.
Ist es eine andere Nummer: einen Benutzer mit 1000 verwenden, bevor `install.sh`
laeuft. Das Geraet selbst darauf hinzuweisen, ist ein Befund fuer
`install.sh` (es prueft die UID heute nicht).

Danach `docker compose ps` und `cat .env | grep -E 'JETSON|GPU_|LLM_|OLLAMA_|RAM_LIMIT_LLM'`
in den Messbogen kopieren.

## Die Messpunkte

Jeder Punkt: Befehl, Sollwert, und was zu tun ist, wenn er nicht stimmt. Ein
Sollwert, der eine Annahme ist und kein Messwert, steht als **Arbeitswert**
da: er wird am Geraet festgelegt und hier nachgetragen.

### 1. sm_121 mit Ollama

Die Annahme: Ollama bringt fuer den GB10 den Runner `cuda_v13` mit, gebaut bis
`121-virtual`, also **PTX**, das der Treiber beim ersten Laden fuer sm_121
uebersetzt. `compute_capability.confirmed` im Profil ist `false`, bis das hier
bestaetigt ist.

```bash
docker compose exec llm-service ls /usr/lib/ollama
# Das Modell einmal laden (erste Anfrage, mit Zeitnahme: das ist der JIT)
time docker compose exec llm-service ollama run qwen3.8:27b-q4_K_M "Antworte mit einem Wort: hallo"
docker compose logs llm-service | grep -iE "inference compute|library=|compute=|cuda_v13|cuda_v12|cpu"
docker compose exec llm-service ollama ps
# Der Einbettungsdienst: rechnet er auf der GPU?
docker compose exec embedding-service curl -s localhost:11435/health
docker compose exec embedding-service python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_capability(0), torch.cuda.get_arch_list())"
```

**Sollwert:**

- `/usr/lib/ollama` nennt `cuda_v13`.
- Das Log nennt eine Zeile `inference compute` mit `library=CUDA`, `compute=12.1`
  und dem Namen des GB10; **kein** `library=cpu`.
- `ollama ps` zeigt `100% GPU`.
- Die erste Anfrage dauert laenger als die zweite (JIT). **Arbeitswert:** die
  erste unter zehn Minuten, die zweite im Bereich von Sekunden. Beide Zeiten
  aufschreiben; sie sind der Grund fuer das Pre-Warming im Profil.
- `/health` des Einbettungsdienstes nennt `"device":"cuda"`, und
  `torch.cuda.is_available()` ist `True` mit `(12, 1)`.

**Wenn nicht:** `library=cpu` heisst, der Runner wurde nicht geladen (zuerst
`OLLAMA_LD_LIBRARY_PATH` in der `.env` und `docker compose exec llm-service
printenv LD_LIBRARY_PATH` ansehen). `device: cpu` beim Einbettungsdienst heisst,
PyTorch kennt sm_121 nicht: dann die Zeile `torch._C._cuda_getArchFlags()` aus
dem Job `docker-build` mit dem Befund vergleichen und `TORCH_CUDA_ARCH_LIST`
pruefen. Danach `compute_capability.confirmed` im Profil auf `true`.

### 2. nvidia-smi am GB10

```bash
nvidia-smi
nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw --format=csv
```

**Sollwert:** der Name nennt `GB10`, die Treiberversion steht da, und der Aufruf
endet mit 0. Aufschreiben, **was** `memory.total` und `memory.used` melden:
eine Zahl, oder `[N/A]`. Das Profil nimmt `[N/A]` an (unified memory), und
`notes` sagt es als offene Frage.

Warum es zaehlt: `services/metrics-collector/gpu_monitor.py` liest die Felder
mit `int(...)`. Meldet der GB10 `[N/A]`, wirft das eine Ausnahme, das Werkzeug
gibt `None` zurueck und die Oberflaeche hat keine GPU-Werte. Das ist aus dem
Quelltext erwartet und **nicht gemessen**. Pruefen mit:

```bash
docker compose logs --tail 50 metrics-collector | grep -iE "gpu|nvidia"
docker compose exec metrics-collector curl -s localhost:9100/metrics | python3 -m json.tool | grep -i gpu
```

**Sollwert:** der Collector liefert Temperatur und Auslastung der GPU, kein
Fehler je Sekunde im Log. Sonst ist das ein Befund fuer die Nachbesserung
(Parser muss `[N/A]` je Feld tragen, Speicher aus `/proc/meminfo` des Hosts).

### 3. Das Standardmodell existiert

```bash
bash scripts/util/modell-holen.sh --pruefen; echo "Rueckgabe $?"
docker compose exec llm-service ollama list
grep -m1 -A4 '"standard": true' config/modelle/kurzliste.json
```

**Sollwert:** `--pruefen` endet mit 0 (der Digest stimmt mit
`config/modelle/kurzliste.json` ueberein: `sha256:25b84361...` fuer
`qwen3.8:27b-q4_K_M`), `ollama list` nennt es, und `LLM_MODEL` in der `.env` ist
genau diese Kennung. Der Bootstrap holt das Modell im Hintergrund
(`logs/modell-holen.log`); die Dauer bis zum Digest aufschreiben (am Orin rund
eine Stunde, **Arbeitswert** am Spark: kuerzer, je nach Leitung).

**Zum Widerspruch `default_model` gegen den Orin-Rueckfall (geklaert, J41):**
`default_model` im Profil ist der Standard der Kurzliste, `qwen3.8:27b-q4_K_M`,
und auf dem Spark (96 GB Budget) tragbar. Der Rueckfall `gemma4:e4b` in
`compose/compose.ai.yaml`, `entrypoint.sh`, `api_server.py` und
`.env.template` ist das kleine Modell, das **jedes** Geraet traegt; er gilt nur,
wo keine `.env` einen Wert setzt. Die `.env` eines Spark setzt ihn aus dem
Profil, also greift der Rueckfall dort nie. Das misst der Trockenlauf bei jedem
Zug (`LLM_MODEL` der `.env` gleich `default_model` des Profils, und gleich dem
Standard der Kurzliste). Ein Widerspruch waere es nur, wenn der Rueckfall
still das Standardmodell ersetzte, und das tut er nicht.

### 4. Vier parallele Anfragen

```bash
docker compose exec llm-service printenv OLLAMA_NUM_PARALLEL
bash scripts/test/measure-throughput.sh --api=ollama --model=qwen3.8:27b-q4_K_M --levels=1,4 --rounds=2 --output=/tmp/spark-durchsatz.json
# oder von Hand, vier gleichzeitig:
for i in 1 2 3 4; do
  curl -s localhost:11434/api/generate -d '{"model":"qwen3.8:27b-q4_K_M","prompt":"Zaehle bis zwanzig.","stream":false}' \
    -o /tmp/antwort-$i.json -w "Anfrage $i: HTTP %{http_code} in %{time_total}s\n" &
done; wait
```

**Sollwert:** `OLLAMA_NUM_PARALLEL` ist `4` (`max_num_seqs` des Profils), alle
vier Anfragen enden mit HTTP 200 und einer Antwort, keine mit Fehler oder
Zeitueberschreitung. **Arbeitswert** fuer den Durchsatz: bei vier gleichzeitigen
Anfragen liegt die Summe der Tokens je Sekunde ueber der eines Einzelstroms.
Die Zahlen beider Stufen aufschreiben; sie sind die ersten am Spark gemessenen
und ersetzen im Profil die Spekulation. Dabei `docker stats --no-stream` und
`nvidia-smi` beobachten: bleibt der Speicher im Budget (96 GB)?

### 5. Lizenz-Fingerabdruck

```bash
bash scripts/util/lizenz-geraet.sh fingerabdruck
docker compose up -d --force-recreate dashboard-backend && sleep 20
bash scripts/util/lizenz-geraet.sh fingerabdruck
bash scripts/util/lizenz-geraet.sh status
docker compose exec dashboard-backend cat /arasul/host/machine-id   # die machine-id des Hosts, hineingereicht
sudo reboot     # danach, wenn die Plattform wieder oben ist:
bash scripts/util/lizenz-geraet.sh fingerabdruck
```

**Sollwert:** eine Zeile `{"fingerabdruck":"<hex>"}`, **derselbe Wert** vor und
nach dem Neubau des Backend-Containers und nach dem Neustart, und er unterscheidet
sich vom Fingerabdruck des Orin. `status` nennt `community`. Der Fingerabdruck
nimmt die `machine-id` des Hosts (`mid:`) und, wo es sie gibt, CPU-Seriennummer
und Device-Tree; ein Spark hat letztere vielleicht nicht, die `machine-id` reicht.
Aendert sich der Wert beim Neubau, ist die machine-id nicht durchgereicht
(Compose-Eintrag am Backend ansehen), und eine an das Geraet gebundene Lizenz
galte nur bis zum naechsten Deploy.

### 6. Sicherung

```bash
docker compose exec backup-service /usr/local/bin/backup.sh; echo "Rueckgabe $?"
docker compose exec backup-service sh -c 'ls -l /backups/postgres/*.sql.gz | tail -3'
docker compose exec backup-service /usr/local/bin/wiederherstellen.sh --probe
bash scripts/test/dr-drill.sh      # der zerstoerende Teil von A6, nur an einem Geraet ohne Kundendaten
```

**Sollwert:** `backup.sh` endet mit 0, eine neue `.sql.gz` liegt im Volume,
`--probe` meldet den Wiederherstellungstest gegen eine Wegwerf-Datenbank als
bestanden, und der Drill sichert, loescht, stellt her und die Beispielapp
antwortet danach. Dasselbe Skript hat der Trockenlauf schon ohne GPU
durchlaufen; hier misst der Spark die **Dauer** und den Plattenpfad
(`BACKUP_PATH`, externer Datentraeger nach `docs/ops/BACKUP_SYSTEM.md`).

### 7. Werksreset

Zerstoerend, deshalb **zuletzt** und nur an einem Spark ohne Kundendaten.

```bash
sudo bash scripts/setup/factory-reset.sh      # fragt nach dem Wiederherstellungscode
docker ps -a --filter name=arasul; docker volume ls | grep -i arasul
ls ~/.ollama 2>/dev/null; docker run --rm -v arasul-platform_arasul-llm-models:/m alpine ls /m 2>/dev/null
./install.sh --ssh-behalten
bash scripts/test/werksreset-abnahme.sh
```

**Sollwert:** nach dem Reset kein Container und kein Volume des Geraets mehr
(ausser den Modellen, die der Reset bewusst sichert und zurueckstellt), danach
laeuft `./install.sh` **ohne Handgriff** durch und endet mit denselben
Ergebnissen wie in der Vorbereitung. Aufschreiben, ob das Standardmodell den
Reset uebersteht (es soll, die Modelle sind Gigabytes ohne Kundendaten).

### 8. Selbstheilung ohne Jetson-Werkzeuge

Der Agent kennt zwei Wege zur GPU: `nvidia-smi` (Drosseln mit `--power-limit=80`,
`--gpu-reset`) und, als Rueckfall, `jetson_clocks`. Der Spark hat kein
`jetson_clocks`, und im Abbild des Agenten gibt es weder das eine noch das
andere Werkzeug. **Erwartung aus dem Quelltext, nicht gemessen:** die GPU-
Drosselung tut am Spark still nichts (sie meldet `failed`, kein Absturz). Das
ist der Befund der Karte; gemessen wird, ob er stimmt und wie laut er ist.

```bash
docker compose exec self-healing-agent sh -c 'command -v nvidia-smi; command -v jetson_clocks; command -v tegrastats; echo "Ende"'
docker compose logs self-healing-agent | grep -iE "gpu|tegra|jetson|throttle|Traceback" | tail -30
docker compose ps self-healing-agent
# Die Heilung selbst: einen Dienst toeten, der Agent und restart:always bringen ihn zurueck
docker kill llm-service; sleep 90; docker compose ps llm-service
# Ein Lauf unter GPU-Last (Punkt 4 laeuft), und danach das Protokoll des Agenten
docker compose logs --since 10m self-healing-agent | grep -iE "temp|gpu|throttle"
```

**Sollwert:**

- `self-healing-agent` ist `healthy`, **kein** `Traceback` im Protokoll, auch
  nicht unter Last (der Trockenlauf prueft das ohne GPU schon).
- `llm-service` ist nach dem `docker kill` binnen zwei Minuten wieder
  `healthy`.
- Aufgeschrieben wird, was der Agent bei hoher Temperatur tut: heisst es
  `GPU throttled successfully`, funktioniert der Weg ueber `nvidia-smi`;
  heisst es `Failed to throttle GPU` oder gar nichts, bestaetigt das den Befund,
  und die Drosselung gehoert in die Nachbesserung (Punkt 2 sagt dann auch, ob
  der Collector die Temperatur ueberhaupt sieht, denn ohne sie loest die
  Schwelle nie aus).

## Messbogen

Nach dem Tag steht hier (oder in einem Journal-Eintrag in
`docs/plans/HISTORIE.md`) fuer jeden Punkt: **gruen**, **rot mit Befund**, oder
**Arbeitswert nachgetragen**, jeweils mit der gemessenen Zahl. Danach, und erst
danach: `compute_capability.confirmed` auf `true`, `verification` von
`follow-up` auf `live` in `config/platforms/dgx-spark.json`, und die offenen
Teile der `notes` streichen. Solange das nicht geschehen ist, ist der Spark
**gebaut, aber nicht gemessen**.

## Wo der Trockenlauf selbst nachzulesen ist

- Job: `Spark-Trockenlauf` in `.github/workflows/test.yml`.
- Skript, Attrappe und Compose-Ausnahme: `scripts/test/spark-trockenlauf.sh`,
  `scripts/test/spark-trockenlauf/`.
- Schalter: `ARASUL_TROCKENLAUF=ohne-gpu` (`docs/ENVIRONMENT_VARIABLES.md`).
- Profil und Engine-Routing: `config/platforms/README.md`.
