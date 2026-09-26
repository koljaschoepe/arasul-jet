#!/bin/bash
# =============================================================================
# Das Standardmodell auf das Geraet holen, und nur das gepinnte (J35, 25.09.2026)
# =============================================================================
# Bis zum 25.09.2026 holte die Installation KEIN Modell. Der Bootstrap gab
# einen Hinweis aus ("Modell laden: docker compose exec llm-service ollama pull
# ..."), und ein Kunde, der das Geraet einschaltet, hatte ein Geraet ohne
# antwortendes Modell. Wer den Hinweis befolgte, lief in den zweiten Fehler:
# der Healthcheck von llm-service verlangte ein geladenes Modell, die
# Selbstheilung startete den Dienst alle fuenf Minuten neu -- mitten im
# Download --, die Teildatei blieb leer, und jeder weitere Pull endete mit EOF.
#
# Dieses Skript ist der eine Weg, auf dem ein Modell der Kurzliste auf das
# Geraet kommt, ohne dass ein Mensch dabeisitzt:
#
#   1. Die Kennung kommt aus dem Aufruf, sonst aus `LLM_MODEL` der `.env`,
#      sonst aus dem Standard der Kurzliste (`config/modelle/kurzliste.json`).
#   2. Der Digest kommt aus der Kurzliste. Ein Modell, das dort nicht steht,
#      holt dieses Skript nicht -- geladen wird nur, was in der Liste steht
#      (C8), und nur so ist der Pull wiederholbar.
#   3. Waehrend des Downloads steht das Wartungsfenster
#      (`scripts/lib/wartungsfenster.sh`, Grund `modell-holen <kennung>`): die
#      Selbstheilung startet keinen Dienst neu. Der Healthcheck meldet ein
#      Geraet ohne Modell inzwischen selbst als gesund; das Fenster ist die
#      zweite Wand, falls der Dienst unter der Last des Downloads langsam
#      antwortet.
#   4. Geholt wird ueber `/api/pull` im Container und nicht mit `ollama pull`:
#      die CLI schreibt ihren Fortschrittsbalken auch ohne Terminal mit
#      Steuerzeichen, und im Log der Installation stand danach je Sekunde eine
#      Zeile voller `ESC[K`. Hier kommt eine Zeile je fuenf Prozent.
#   5. Bricht der Download ab (EOF, Netz weg), wird wiederholt; Ollama setzt
#      an den schon geladenen Teilen wieder an. STEHT er (kein Fortschritt seit
#      MODELL_HOLEN_STILLSTAND_SEKUNDEN, Vorgabe fuenf Minuten), wird der
#      Versuch beendet, llm-service neu gestartet und wiederholt.
#   6. Danach wird der Digest geprueft, den `/api/tags` meldet. Das ist der
#      sha256 des Manifests aus der Registry -- stimmt er nicht, hat die
#      Registry unter derselben Kennung etwas anderes geliefert, und das wird
#      gesagt, statt es als Erfolg durchzuwinken.
#
# Aufruf:
#   bash scripts/util/modell-holen.sh                  # LLM_MODEL aus der .env
#   bash scripts/util/modell-holen.sh gemma4:e4b       # ein Modell der Kurzliste
#   bash scripts/util/modell-holen.sh --pruefen        # nur den Digest pruefen
#   bash scripts/util/modell-holen.sh --nur-env        # nur die .env nachziehen
#   bash scripts/util/modell-holen.sh --env-nachziehen # nachziehen und holen
#
# `--env-nachziehen`: steht in `LLM_MODEL` eine Kennung, die die Kurzliste
# nicht mehr fuehrt, wird sie in der `.env` durch den Standard der Kurzliste
# ersetzt. Der Fall ist kein theoretischer: jedes Geraet vor J35 traegt
# `hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`, und eine Aktualisierung behaelt die
# `.env`. Ohne das holte das Skript auf genau diesen Geraeten nichts, und das
# Backend naehme eine Kennung als Rueckfall, die es nicht mehr gibt.
# `--nur-env` tut nur das und fragt Docker nicht: der Bootstrap ruft es VOR dem
# Start der Dienste, denn die Container lesen `LLM_MODEL` beim Anlegen.
#
# Rueckgabe: 0 geholt und geprueft (oder lag schon, mit richtigem Digest),
#            1 Aufruf/Umgebung falsch, 2 Download gescheitert,
#            3 Digest weicht ab.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL" || exit 1

KURZLISTE="${ARASUL_KURZLISTE:-${WURZEL}/config/modelle/kurzliste.json}"
VERSUCHE="${MODELL_HOLEN_VERSUCHE:-5}"
PAUSE="${MODELL_HOLEN_PAUSE_SEKUNDEN:-20}"
OLLAMA="http://localhost:11434"

nur_pruefen=false
env_nachziehen=false
nur_env=false
kennung=""
for arg in "$@"; do
    case "$arg" in
        --pruefen) nur_pruefen=true ;;
        --env-nachziehen) env_nachziehen=true ;;
        --nur-env) env_nachziehen=true; nur_env=true ;;
        -h|--help) sed -n '2,50p' "$0"; exit 0 ;;
        -*) echo "Unbekannte Option: $arg" >&2; exit 1 ;;
        *) kennung="$arg" ;;
    esac
done

meldung() { printf '[%s] modell-holen: %s\n' "$(date '+%H:%M:%S')" "$*"; }

env_wert() {
    local wert=""
    [ -f .env ] && wert=$(grep "^$1=" .env 2>/dev/null | tail -1 | cut -d'=' -f2- || true)
    case "$wert" in
        "'"*"'") wert="${wert#\'}"; wert="${wert%\'}" ;;
        '"'*'"') wert="${wert#\"}"; wert="${wert%\"}" ;;
    esac
    printf '%s' "$wert"
}

if ! command -v python3 >/dev/null 2>&1; then
    meldung "python3 fehlt -- ohne kann die Kurzliste nicht gelesen werden"
    exit 1
fi

# Liest aus der Kurzliste: `standard` (die Kennung des Textstandards) oder
# `digest <kennung>`. `name` und `name:latest` sind fuer Ollama dasselbe.
kurzliste() {
    python3 - "$KURZLISTE" "$@" <<'PY'
import json, sys
datei, frage = sys.argv[1], sys.argv[2]
modelle = json.load(open(datei, encoding='utf-8'))['modelle']
def gleich(a, b):
    norm = lambda n: n if ':' in n else n + ':latest'
    return norm(a) == norm(b)
if frage == 'standard':
    for m in modelle:
        if m.get('aufgabe') == 'text' and m.get('standard'):
            print(m['id']); break
elif frage == 'digest':
    for m in modelle:
        if gleich(m['id'], sys.argv[3]):
            print(m.get('digest', '')); break
PY
}

[ -n "$kennung" ] || kennung="$(env_wert LLM_MODEL)"
[ -n "$kennung" ] || kennung="$(kurzliste standard)"
if [ -z "$kennung" ]; then
    meldung "keine Kennung: weder Aufruf noch LLM_MODEL noch ein Standard in ${KURZLISTE}"
    exit 1
fi

soll="$(kurzliste digest "$kennung")"
if [ -z "$soll" ] && [ "$env_nachziehen" = true ] && [ -f .env ] \
        && [ "$kennung" = "$(env_wert LLM_MODEL)" ]; then
    standard="$(kurzliste standard)"
    meldung "LLM_MODEL=${kennung} steht nicht mehr in der Kurzliste -- die .env bekommt den Standard ${standard}"
    # Nur die eine Zeile, und ueber eine Kopie: `sed -i` auf einer Datei mit
    # Geheimnissen soll ihre Rechte nicht aendern, und `cp` behaelt sie.
    cp -p .env .env.modell-tmp \
        && awk -v neu="LLM_MODEL=${standard}" '/^LLM_MODEL=/{print neu; next} {print}' .env > .env.modell-tmp \
        && cat .env.modell-tmp > .env
    rm -f .env.modell-tmp
    kennung="$standard"
    soll="$(kurzliste digest "$kennung")"
fi
if [ "$nur_env" = true ]; then
    exit 0
fi
if [ -z "$soll" ]; then
    meldung "'${kennung}' steht nicht in der Kurzliste (${KURZLISTE}) oder hat keinen digest."
    meldung "Geladen wird nur, was dort steht -- LLM_MODEL in der .env pruefen."
    exit 1
fi

if ! grep -qx llm-service <<<"$(docker compose ps --status running --services 2>/dev/null)"; then
    meldung "llm-service laeuft nicht -- erst './arasul start', dann erneut"
    exit 1
fi

im_dienst() { docker compose exec -T llm-service "$@"; }

# Der Digest, den Ollama fuer diese Kennung meldet, oder leer.
ist_digest() {
    im_dienst curl -sf --max-time 10 "${OLLAMA}/api/tags" 2>/dev/null \
        | digest_aus_tags "$1"
}
digest_aus_tags() {
    local n="$1"
    case "$n" in *:*) ;; *) n="${n}:latest" ;; esac
    python3 -c '
import json, sys
n = sys.argv[1]
try:
    for m in json.load(sys.stdin).get("models", []):
        if m.get("name") == n or m.get("model") == n:
            d = m.get("digest", "")
            print(d if d.startswith("sha256:") else "sha256:" + d); break
except Exception:
    pass
' "$n"
}

pruefen() {
    local ist
    ist="$(ist_digest "$kennung")"
    if [ -z "$ist" ]; then
        meldung "'${kennung}' liegt nicht auf dem Geraet"
        return 2
    fi
    if [ "$ist" != "$soll" ]; then
        meldung "DIGEST WEICHT AB fuer '${kennung}':"
        meldung "  erwartet ${soll} (config/modelle/kurzliste.json)"
        meldung "  am Geraet ${ist}"
        meldung "Die Registry hat unter dieser Kennung etwas anderes geliefert."
        meldung "Nicht benutzen, bevor die Kurzliste bewusst nachgezogen ist."
        return 3
    fi
    meldung "'${kennung}' liegt am Geraet, Digest stimmt (${soll:7:12})"
    return 0
}

if [ "$nur_pruefen" = true ]; then
    pruefen
    exit $?
fi

if pruefen >/dev/null 2>&1; then
    pruefen
    exit 0
fi

# Das Wartungsfenster: der Download dauert am Orin rund eine Stunde, und der
# Herzschlag haelt die Datei frisch, solange dieses Skript lebt.
if ! source "${WURZEL}/scripts/lib/wartungsfenster.sh"; then
    meldung "scripts/lib/wartungsfenster.sh nicht ladbar -- ohne Fenster wird nicht geholt"
    exit 1
fi
WARTUNG_GRUND="modell-holen ${kennung}"
WARTUNG_FALLBACK_DIR="${WURZEL}/logs"
wartung_herzschlag_an

# Das Fenster schliesst auf JEDEM Weg hinaus, auch nach SIGTERM, SIGINT und
# SIGHUP (J35, Durchlauf 3). Ein EXIT-Trap allein raeumte den Versuch nicht
# weg: der Pull im Container und die Wache davor liefen als Waisen weiter, und
# ein zweiter Aufruf haengte sich an denselben Download. Der Handler beendet
# den laufenden Versuch (die Wache beendet den Pull im Container selbst),
# schliesst das Fenster und endet mit dem ueblichen Code 128+Signal.
VERSUCH_PID=""
abbruch() {
    local signal="$1" code="$2"
    trap - EXIT TERM INT HUP
    if [ -n "$VERSUCH_PID" ]; then
        kill -TERM "$VERSUCH_PID" 2>/dev/null
        wait "$VERSUCH_PID" 2>/dev/null
    fi
    wartung_aus
    meldung "abgebrochen (${signal}) -- Wartungsfenster geschlossen. Nachholen: ./arasul modell"
    exit "$code"
}
trap 'wartung_aus' EXIT
trap 'abbruch TERM 143' TERM
trap 'abbruch INT 130' INT
trap 'abbruch HUP 129' HUP

# Nach wie vielen Sekunden ohne Fortschritt ein Versuch als stehend gilt.
# Fortschritt heisst: eine Zeile, die etwas NEUES sagt (andere Schicht, mehr
# Bytes, ein anderer Status). Die Zahl der Zeilen sagt nichts -- Ollama
# schickt waehrend eines Pulls laufend Zeilen, auch wenn nichts mehr ankommt.
# Fuenf Minuten reichen fuer die stillen Abschnitte eines gesunden Pulls
# (sha256 ueber 17 GB am Orin: unter einer Minute).
STILLSTAND="${MODELL_HOLEN_STILLSTAND_SEKUNDEN:-300}"

# Ein Versuch. Python startet den Pull selbst (`/api/pull` ueber `curl` im
# Container) und wacht ueber ihn: eine Zeile je fuenf Prozent und je neuer
# Schicht, und steht der Stand STILLSTAND Sekunden lang, beendet es den Pull
# -- IM Container ueber seine PID (ein beendeter `docker exec`-Klient beendet
# den Prozess darin nicht) und dann den Klienten. Bis J35 lief hier ein
# `curl --max-time 14400` in einer Pipeline: ein Versuch durfte vier Stunden
# dauern, und ein Download mit DNS-Fehler im Container stand am Orin bei 15 %,
# ohne dass es jemand merkte.
#
# Im Hintergrund gestartet und mit `wait` abgewartet, damit ein Signal an
# dieses Skript sofort den Trap ausloest statt erst nach dem Versuch.
# Rueckgabe: 0 bei `"status":"success"`, 1 bei Fehler, 4 bei Stillstand.
WACHE="$(cat <<'PY'
import json, queue, signal, subprocess, sys, threading, time

stillstand, rumpf, ollama = float(sys.argv[1]), sys.argv[2], sys.argv[3]
# `echo $$` und dann `exec curl`: die erste Zeile ist die PID des curl im
# Container, und nur ueber sie ist er dort zu beenden.
innen = 'echo "$$"; exec curl -sN "$1/api/pull" -d "$2"'
proc = subprocess.Popen(
    ['docker', 'compose', 'exec', '-T', 'llm-service', 'sh', '-c', innen, 'pull', ollama, rumpf],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
)
zeilen = queue.Queue()
def lesen():
    for z in proc.stdout:
        zeilen.put(z)
    zeilen.put(None)
threading.Thread(target=lesen, daemon=True).start()

innen_pid = None
def beenden():
    if innen_pid:
        try:
            subprocess.run(
                ['docker', 'compose', 'exec', '-T', 'llm-service', 'kill', '-TERM', innen_pid],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
        except Exception:
            pass
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()

def signal_ende(*_):
    beenden()
    sys.exit(1)
signal.signal(signal.SIGTERM, signal_ende)

schicht, stufe, ok = None, -1, False
letzter_stand, seit = None, time.monotonic()
while True:
    try:
        zeile = zeilen.get(timeout=1)
    except queue.Empty:
        zeile = ''
    if zeile is None:
        break
    zeile = zeile.strip()
    if zeile and innen_pid is None and zeile.isdigit():
        innen_pid = zeile
        continue
    if zeile:
        try:
            d = json.loads(zeile)
        except ValueError:
            print("  " + zeile[:200], flush=True)
            d = None
        if isinstance(d, dict):
            if "error" in d:
                print("  Fehler: " + str(d["error"]), flush=True)
            status = d.get("status", "")
            if status == "success":
                ok = True
            stand = (status, d.get("digest"), d.get("completed"))
            if stand != letzter_stand:
                letzter_stand, seit = stand, time.monotonic()
            total, done = d.get("total"), d.get("completed")
            if total and d.get("digest"):
                if d["digest"] != schicht:
                    schicht, stufe = d["digest"], -1
                    print("  Schicht %s, %.2f GB" % (d["digest"][7:19], total / 1e9), flush=True)
                p = int((done or 0) * 100 / total) // 5 * 5
                if p > stufe:
                    stufe = p
                    print("  %3d %%  %.2f / %.2f GB" % (p, (done or 0) / 1e9, total / 1e9), flush=True)
            elif status and not status.startswith("pulling "):
                print("  " + status, flush=True)
    if not ok and time.monotonic() - seit > stillstand:
        print("  Kein Fortschritt seit %d s -- der Download steht, dieser Versuch wird beendet" % stillstand, flush=True)
        beenden()
        sys.exit(4)
proc.wait()
sys.exit(0 if ok else 1)
PY
)"

ein_versuch() {
    local rumpf rc=0
    rumpf=$(printf '{"model":"%s","stream":true}' "$kennung")
    python3 -u -c "$WACHE" "$STILLSTAND" "$rumpf" "$OLLAMA" &
    VERSUCH_PID=$!
    wait "$VERSUCH_PID" || rc=$?
    VERSUCH_PID=""
    return "$rc"
}

# Nach einem Stillstand wird llm-service neu gestartet, bevor es weitergeht.
# Ollama laedt eine Schicht im Hintergrund weiter, auch wenn niemand mehr
# zusieht, und ein neuer Pull haengt sich an DENSELBEN Download -- einen, der
# steht, erbte der naechste Versuch. Ein Neustart wirft ihn weg; die schon
# geladenen Teile liegen auf der Platte, und Ollama setzt dort wieder an. Das
# Wartungsfenster steht, die Selbstheilung haelt still.
llm_neu_starten() {
    meldung "starte llm-service neu, damit der stehende Download verworfen wird"
    docker compose restart llm-service >/dev/null 2>&1 || true
    local _
    for _ in $(seq 1 "${MODELL_HOLEN_NEUSTART_PROBEN:-60}"); do
        if im_dienst curl -sf --max-time 5 "${OLLAMA}/api/version" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    meldung "llm-service antwortet nach dem Neustart noch nicht -- der naechste Versuch probiert es trotzdem"
}

meldung "hole '${kennung}' (erwarteter Digest ${soll:7:12}) -- das dauert, am Orin rund eine Stunde"
versuch=1
while :; do
    rc=0
    ein_versuch || rc=$?
    if [ "$rc" = 0 ]; then
        break
    fi
    if [ "$versuch" -ge "$VERSUCHE" ]; then
        meldung "Download nach ${VERSUCHE} Versuchen gescheitert."
        meldung "Nachholen: ./arasul modell ${kennung}"
        exit 2
    fi
    if [ "$rc" = 4 ]; then
        meldung "Versuch ${versuch} von ${VERSUCHE} stand still"
        llm_neu_starten
    else
        meldung "Versuch ${versuch} von ${VERSUCHE} abgebrochen, in ${PAUSE}s geht es weiter (Ollama setzt an)"
        sleep "$PAUSE"
    fi
    versuch=$((versuch + 1))
done

pruefen
exit $?
