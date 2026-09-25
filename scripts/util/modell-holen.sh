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
#      an den schon geladenen Teilen wieder an.
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
trap 'wartung_aus' EXIT

# Ein Versuch: streamt `/api/pull` und macht daraus eine Zeile je fuenf
# Prozent und je neuer Schicht. Rueckgabe 0 nur bei `"status":"success"`.
ein_versuch() {
    local rumpf
    rumpf=$(printf '{"model":"%s","stream":true}' "$kennung")
    im_dienst curl -sN --max-time 14400 "${OLLAMA}/api/pull" -d "$rumpf" 2>&1 \
        | python3 -u -c '
import json, sys
schicht, stufe, ok = None, -1, False
for zeile in sys.stdin:
    zeile = zeile.strip()
    if not zeile:
        continue
    try:
        d = json.loads(zeile)
    except ValueError:
        print("  " + zeile[:200], flush=True); continue
    if "error" in d:
        print("  Fehler: " + str(d["error"]), flush=True); continue
    status = d.get("status", "")
    if status == "success":
        ok = True
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
sys.exit(0 if ok else 1)
'
}

meldung "hole '${kennung}' (erwarteter Digest ${soll:7:12}) -- das dauert, am Orin rund eine Stunde"
versuch=1
while :; do
    if ein_versuch; then
        break
    fi
    if [ "$versuch" -ge "$VERSUCHE" ]; then
        meldung "Download nach ${VERSUCHE} Versuchen gescheitert."
        meldung "Nachholen: bash scripts/util/modell-holen.sh ${kennung}"
        exit 2
    fi
    meldung "Versuch ${versuch} von ${VERSUCHE} abgebrochen, in ${PAUSE}s geht es weiter (Ollama setzt an)"
    versuch=$((versuch + 1))
    sleep "$PAUSE"
done

pruefen
exit $?
