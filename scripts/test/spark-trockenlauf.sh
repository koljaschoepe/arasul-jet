#!/bin/bash
# =============================================================================
# Trockenlauf des DGX Spark: die Installation aus dem Artefakt, ohne GPU (J41)
# =============================================================================
# Beschluss 01.10.2026, Spark-Teil von M5: ein Spark steht noch nicht da, und
# was an ihm brechen kann, soll bis auf GPU und Treiber vorher auffallen. Der
# erste Tag in Dresden ist dann Messen nach Plan (docs/ops/spark-erster-tag.md)
# und kein Portieren.
#
# WAS DAS SKRIPT TUT. Es laeuft in einem frisch ausgepackten Artefakt auf einem
# arm64-Rechner ohne GPU (CI: `ubuntu-24.04-arm`, Job "Spark-Trockenlauf") und
# fuehrt `./install.sh` wirklich aus, bis zum Ende des Bootstraps:
#
#   Erkennung (detect-platform.sh) -> Profil dgx-spark -> `.env` -> Abbilder mit
#   `Dockerfile.spark` bauen -> Datenbank, Migrationen -> alle Dienste starten
#   -> Administrator, Kit-Schluessel -> Rauchtest.
#
# Danach prueft es, was ohne GPU pruefbar ist, und sagt am Ende getrennt, was
# es NICHT geprueft hat.
#
# WAS ERSETZT IST, UND WARUM ES DAS NICHT VORTAEUSCHT
#   * `nvidia-smi`: eine Attrappe nur der ERKENNUNG (bin/nvidia-smi). Sie nennt
#     den Namen "NVIDIA GB10", rechnet nichts und erreicht keinen Container.
#   * `llm-service` und `embedding-service` laufen OHNE NVIDIA-Laufzeit
#     (compose.ohne-gpu.yaml). Ollama rechnet nicht, der Einbettungsdienst
#     laeuft auf der CPU. Gesund heisst hier: der Prozess antwortet.
#   * Das Standardmodell wird nicht geholt (17 GB, keine GPU), Plattenplatz,
#     Systemd-Einheiten und mDNS bleiben aus. Jede dieser Stellen schreibt
#     "UEBERSPRUNGEN (Trockenlauf)" in das Protokoll (`arasul`, `install.sh`).
#
# Aufruf (im ausgepackten Artefakt, als Benutzer mit Docker):
#   bash scripts/test/spark-trockenlauf.sh
#
# Rueckgabe 0, wenn die Installation durchlief und jede Pruefung gruen war.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL" || exit 1

GRUEN='\033[0;32m'; ROT='\033[0;31m'; AUS='\033[0m'
rot=0
pruefe() { # <Beschriftung> <ja|nein> [Hinweis]
  if [ "$2" = ja ]; then
    printf '%bgruen%b  %s\n' "$GRUEN" "$AUS" "$1"
  else
    rot=$((rot + 1))
    printf '%bROT%b    %s%s\n' "$ROT" "$AUS" "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }
abschnitt() { printf '\n== %s ==\n' "$1"; }

PASSWORT="${ARASUL_TROCKENLAUF_PASSWORT:-AbnahmeCi2026x}"
WARTEN_SEKUNDEN="${ARASUL_TROCKENLAUF_WARTEN:-900}"

# --- 0. Voraussetzung: dieselbe Architektur wie das Geraet, und KEINE GPU ------
abschnitt "0. Der Rechner"
pruefe "arm64 (wie der Spark)" "$(ja [ "$(uname -m)" = aarch64 ])" "$(uname -m)"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  echo "Hier ist eine echte GPU: das ist kein Trockenlauf, sondern ein Geraet. Abbruch." >&2
  exit 2
fi
pruefe "keine GPU (der Lauf sagt nichts ueber sie)" ja
[ "$rot" -eq 0 ] || exit 1

# --- 1. Die Installation, wie ein Kunde sie tippt -----------------------------
abschnitt "1. ./install.sh (Trockenlauf ohne GPU)"
export ARASUL_TROCKENLAUF=ohne-gpu
export PATH="${WURZEL}/scripts/test/spark-trockenlauf/bin:${PATH}"
export COMPOSE_FILE="${WURZEL}/docker-compose.yml:${WURZEL}/scripts/test/spark-trockenlauf/compose.ohne-gpu.yaml"
# Der Spark hat 20 Kerne, der Laeufer vier: Docker lehnt ein Limit ueber der
# Kernzahl des Rechners ab (CPU_LIMIT_LLM=12 aus dem Profil). Die Umgebung
# schlaegt die `.env`; am Geraet gilt das Profil.
export CPU_LIMIT_LLM=3
export MODELL_HOLEN=false
export INSTALL_SYSTEMD_TIMERS=false

bash ./install.sh --ssh-behalten --passwort "$PASSWORT"
install_rc=$?
pruefe "install.sh endet mit 0" "$(ja [ "$install_rc" -eq 0 ])" "Rueckgabe $install_rc"
[ -f .env ] || { echo "Keine .env: die Installation kam nicht bis dahin." >&2; exit 1; }

env_wert() { grep "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"'; }
profil_wert() { python3 -c "import json,sys; print(json.load(open('config/platforms/dgx-spark.json'))[sys.argv[1]])" "$1"; }

# --- 2. Die Erkennung hat den Spark gesehen, und die .env sagt es ---------------
abschnitt "2. Profil dgx-spark in der .env"
pruefe "JETSON_PROFILE=dgx_spark" "$(ja [ "$(env_wert JETSON_PROFILE)" = dgx_spark ])" "$(env_wert JETSON_PROFILE)"
pruefe "GPU_DOCKERFILE=Dockerfile.spark" "$(ja [ "$(env_wert GPU_DOCKERFILE)" = Dockerfile.spark ])" "$(env_wert GPU_DOCKERFILE)"
pruefe "OLLAMA_LD_LIBRARY_PATH ohne jetpack" \
  "$(ja bash -c "! grep -qi jetpack <<<\"$(env_wert OLLAMA_LD_LIBRARY_PATH)\"")" "$(env_wert OLLAMA_LD_LIBRARY_PATH)"
pruefe "OLLAMA_NUM_PARALLEL=4 (max_num_seqs des Profils)" \
  "$(ja [ "$(env_wert OLLAMA_NUM_PARALLEL)" = "$(profil_wert max_num_seqs)" ])" "$(env_wert OLLAMA_NUM_PARALLEL)"

# Der Widerspruch, den die Karte nennt: `default_model` im Profil ist der
# Standard der Kurzliste (gross), der Rueckfall in compose, entrypoint.sh und
# .env.template ist das kleine Modell, das jedes Geraet tragen kann. Das ist
# kein Widerspruch, solange die .env des Geraets den Wert des PROFILS traegt --
# der Rueckfall gilt nur, wo gar keine .env den Wert setzt. Genau das wird hier
# gemessen (und `scripts/test/kurzliste.py` haelt die Quellen daran fest).
pruefe "LLM_MODEL der .env = default_model des Profils (der Rueckfall greift nicht)" \
  "$(ja [ "$(env_wert LLM_MODEL)" = "$(profil_wert default_model)" ])" "$(env_wert LLM_MODEL)"
pruefe "LLM_MODEL ist der Standard der Kurzliste" \
  "$(ja python3 - "$(env_wert LLM_MODEL)" <<'PY'
import json, sys
liste = json.load(open('config/modelle/kurzliste.json'))['modelle']
standard = [m['id'] for m in liste if m.get('standard') and m['aufgabe'] == 'text'][0]
sys.exit(0 if sys.argv[1] == standard else 1)
PY
)"
pruefe "RAM_LIMIT_LLM = memory_budget_gb des Profils" \
  "$(ja [ "$(env_wert RAM_LIMIT_LLM)" = "$(profil_wert memory_budget_gb)G" ])" "$(env_wert RAM_LIMIT_LLM)"

# --- 3. Die Abbilder: arm64, und die GPU-Dienste aus dem Spark-Zweig ------------
abschnitt "3. Abbilder"
for dienst in llm-service embedding-service dashboard-backend dashboard-frontend; do
  behaelter="$(docker compose ps -aq "$dienst" 2>/dev/null | head -1)"
  arch="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' \
    "$(docker inspect --format '{{.Image}}' "${behaelter:-nichts}" 2>/dev/null)" 2>/dev/null || echo '?')"
  pruefe "${dienst}: linux/arm64" "$(ja [ "$arch" = linux/arm64 ])" "$arch"
done
pruefe "llm-service traegt den CUDA-13-Runner von Ollama (cuda_v13)" \
  "$(ja docker compose exec -T llm-service ls /usr/lib/ollama/cuda_v13)"
pruefe "llm-service ohne den JetPack-Runner im Suchpfad" \
  "$(ja bash -c "! docker compose exec -T llm-service printenv LD_LIBRARY_PATH | grep -qi jetpack")"

# --- 4. Jeder Container laeuft, jeder mit Healthcheck wird gesund ---------------
abschnitt "4. Container"
dienste="$(docker compose config --services 2>/dev/null)"
pruefe "Dienste laut Compose: $(echo "$dienste" | wc -w)" "$(ja [ -n "$dienste" ])"

warten_gesund() { # <Dienst>; wartet bis `healthy` oder zur Zeitgrenze
  local d="$1" start=$SECONDS id gesundheit status
  while [ $((SECONDS - start)) -lt "$WARTEN_SEKUNDEN" ]; do
    id="$(docker compose ps -aq "$d" 2>/dev/null | head -1)"
    if [ -n "$id" ]; then
      gesundheit="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}keiner{{end}}' "$id" 2>/dev/null)"
      status="$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null)"
      case "$gesundheit" in
        healthy) echo healthy; return 0 ;;
        keiner) [ "$status" = running ] && { echo "laeuft (kein Healthcheck)"; return 0; } ;;
      esac
      [ "$status" = exited ] && { echo "beendet"; return 1; }
    fi
    sleep 5
  done
  echo "${gesundheit:-unbekannt} nach ${WARTEN_SEKUNDEN}s"
  return 1
}
for d in $dienste; do
  zustand="$(warten_gesund "$d")" && ok=ja || ok=nein
  pruefe "${d}: ${zustand}" "$ok"
done

# --- 5. Was ohne GPU ueber die Oberflaeche und die Betriebsteile zu sagen ist ---
abschnitt "5. Anmeldung, Lizenz, Sicherung, Selbstheilung"
basis="https://localhost"
pruefe "/api/health antwortet (HTTPS ueber Traefik)" "$(ja curl -skf -o /dev/null "$basis/api/health")"

fp="$(bash scripts/util/lizenz-geraet.sh fingerabdruck 2>/dev/null || true)"
pruefe "Lizenz-Fingerabdruck: ein Hex-Wert" \
  "$(ja grep -Eq '"fingerabdruck":"[0-9a-f]{16,}"' <<<"$fp")" "$fp"
stufe="$(bash scripts/util/lizenz-geraet.sh status 2>/dev/null || true)"
pruefe "Lizenz ohne Schluessel: community" "$(ja grep -q '"stufe":"community"' <<<"$stufe")" "$stufe"

sicherung="$(docker compose exec -T backup-service /usr/local/bin/backup.sh 2>&1)"
sicherung_rc=$?
pruefe "Sicherung laeuft durch (backup.sh)" "$(ja [ "$sicherung_rc" -eq 0 ])" "Rueckgabe $sicherung_rc"
[ "$sicherung_rc" -eq 0 ] || echo "$sicherung" | tail -15
pruefe "Eine Datenbanksicherung liegt im Volume" \
  "$(ja docker compose exec -T backup-service sh -c 'ls /backups/postgres/*.sql.gz >/dev/null 2>&1')"

docker compose logs --no-color self-healing-agent > /tmp/selbstheilung.log 2>&1 || true
pruefe "Selbstheilung: kein Traceback im Protokoll (ohne tegrastats und sysfs der Jetsons)" \
  "$(ja bash -c "! grep -q Traceback /tmp/selbstheilung.log")"

# --- 6. Was dieser Lauf NICHT geprueft hat --------------------------------------
abschnitt "6. Nicht geprueft (kein Spark, keine GPU)"
cat <<'TEXT'
  - sm_121 und der Runner von Ollama           -> docs/ops/spark-erster-tag.md, Punkt 1
  - nvidia-smi am GB10 (Speicher, [N/A]?)      -> Punkt 2
  - das Standardmodell (Download, Digest)      -> Punkt 3
  - vier parallele Anfragen auf der GPU        -> Punkt 4
  - Lizenz-Fingerabdruck AM SPARK              -> Punkt 5 (hier nur: das Skript antwortet)
  - Sicherung und Wiederherstellung am Geraet  -> Punkt 6
  - Werksreset                                 -> Punkt 7 (zerstoerend, nur am Geraet)
  - Selbstheilung gegen echte GPU-Last         -> Punkt 8
TEXT

echo
if [ "$rot" -eq 0 ]; then
  printf '%bTrockenlauf gruen%b -- die Installation des Spark laeuft bis zu gesunden Containern.\n' "$GRUEN" "$AUS"
  exit 0
fi
printf '%bTrockenlauf ROT%b -- %s Pruefung(en).\n' "$ROT" "$AUS" "$rot"
exit 1
