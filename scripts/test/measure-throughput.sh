#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Inference Throughput Harness (Plan 020, Schritt 1)
#
# Purpose:
#   A *repeatable* measurement tool — not a one-off number. It measures the
#   metric that matters for the async customer workload: TOTAL PROCESSED TOKENS
#   (prompt + generated) per wall-clock second, at 1 / 4 / 16 concurrent
#   requests. From that it extrapolates the honest headline figure: tokens/day.
#
#   Tokens-per-day (not tokens-per-second) is the number the platform is sold
#   on: flows run asynchronously, so sustained aggregate throughput under
#   concurrency is what counts, not single-stream latency.
#
# Why engine-agnostic:
#   The same harness must run before AND after the engine swap (Plan 020,
#   Schritt 3: Ollama -> SGLang) and later on Thor/Spark without a rewrite.
#   It therefore speaks two dialects:
#     --api=ollama  ->  POST /api/generate      (eval_count / prompt_eval_count)
#     --api=openai  ->  POST /v1/chat/completions (usage.*_tokens)  [SGLang/vLLM]
#
# What it demonstrates today (indicative Orin run):
#   Ollama serves a fixed number of parallel slots (OLLAMA_NUM_PARALLEL, default
#   2) and does NOT do continuous batching. Aggregate throughput therefore
#   plateaus once concurrency exceeds that slot count — visible as a flat
#   tokens/s from level 4 to level 16. A continuous-batching engine (vLLM/
#   SGLang) keeps climbing. This run proves the harness works and the plateau
#   exists; the meaningful cross-engine / target-hardware comparison is the
#   Echt-Hardware follow-up plan (see docs/plans/active/020-baseline.md).
#
# Usage:
#   ./scripts/test/measure-throughput.sh \
#       [--api=ollama|openai] [--host=HOST] [--port=PORT] \
#       [--model=NAME] [--levels=1,4,16] [--num-predict=128] \
#       [--prompt-tokens=~] [--rounds=2] [--timeout=180] [--output=FILE]
#
# Defaults target the Orin's host-local Ollama (127.0.0.1:11434). Run it on the
# device:  ssh arasul@<device>  then from the repo root execute this script.
###############################################################################

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

# ── Defaults ─────────────────────────────────────────────────────────────────
API="ollama"                 # ollama | openai
HOST="127.0.0.1"
PORT=""                      # derived from API if empty
MODEL=""                     # auto-detected if empty
LEVELS="1,4,16"              # concurrency levels to sweep
NUM_PREDICT=128              # generated tokens requested per request
ROUNDS=2                     # sequential waves per level (reduces noise)
TIMEOUT=180                  # per-request curl timeout (s)
OUTPUT_FILE="data/throughput-baseline.json"
PROMPT=""                    # fixed prompt; default assigned below

# ── CLI flags ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --api=*)          API="${arg#*=}" ;;
    --host=*)         HOST="${arg#*=}" ;;
    --port=*)         PORT="${arg#*=}" ;;
    --model=*)        MODEL="${arg#*=}" ;;
    --levels=*)       LEVELS="${arg#*=}" ;;
    --num-predict=*)  NUM_PREDICT="${arg#*=}" ;;
    --rounds=*)       ROUNDS="${arg#*=}" ;;
    --timeout=*)      TIMEOUT="${arg#*=}" ;;
    --output=*)       OUTPUT_FILE="${arg#*=}" ;;
    --prompt=*)       PROMPT="${arg#*=}" ;;
    --help|-h)
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo -e "${YELLOW}Unbekanntes Argument ignoriert: ${arg}${NC}" ;;
  esac
done

# Fixed prompt: long enough that prompt_eval is non-trivial, deterministic so
# runs are comparable. Kept engine-neutral (plain text).
if [ -z "$PROMPT" ]; then
  PROMPT="Fasse in genau fünf sachlichen Sätzen zusammen, wie eine lokale KI-Appliance Dokumente verarbeitet, Wissen durchsuchbar macht und Arbeitsabläufe automatisiert. Antworte ausschließlich auf Deutsch und ohne Aufzählungszeichen."
fi

# Derive default port per API dialect.
if [ -z "$PORT" ]; then
  if [ "$API" = "openai" ]; then PORT="8000"; else PORT="11434"; fi
fi

BASE_URL="http://${HOST}:${PORT}"

command -v curl   >/dev/null || { echo -e "${RED}curl fehlt${NC}"; exit 1; }
command -v python3>/dev/null || { echo -e "${RED}python3 fehlt${NC}"; exit 1; }

# ── Endpoint + payload builders (dialect-specific) ───────────────────────────
# build_body PROMPT -> stdout JSON request body
build_body() {
  python3 - "$API" "$MODEL" "$NUM_PREDICT" "$PROMPT" <<'PY'
import json, sys
api, model, npredict, prompt = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
if api == "openai":
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": npredict,
        "temperature": 0,
        "stream": False,
    }
else:  # ollama
    body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": npredict, "temperature": 0},
    }
print(json.dumps(body))
PY
}

endpoint_path() {
  if [ "$API" = "openai" ]; then echo "/v1/chat/completions"; else echo "/api/generate"; fi
}

# parse_tokens RESPONSE_FILE -> "processed generated http_ok"
# processed = prompt + generated tokens; generated = completion tokens.
parse_tokens() {
  python3 - "$API" "$1" <<'PY'
import json, sys
api, path = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        d = json.load(f)
except Exception:
    print("0 0 0"); sys.exit(0)
prompt_t = gen_t = 0
try:
    if api == "openai":
        u = d.get("usage", {}) or {}
        prompt_t = int(u.get("prompt_tokens", 0) or 0)
        gen_t = int(u.get("completion_tokens", 0) or 0)
    else:
        prompt_t = int(d.get("prompt_eval_count", 0) or 0)
        gen_t = int(d.get("eval_count", 0) or 0)
except Exception:
    pass
ok = 1 if gen_t > 0 else 0
print(f"{prompt_t + gen_t} {gen_t} {ok}")
PY
}

# ── Model auto-detection ─────────────────────────────────────────────────────
detect_model() {
  local resp
  if [ "$API" = "openai" ]; then
    resp=$(curl -s --max-time 10 "${BASE_URL}/v1/models" 2>/dev/null || echo "")
    echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('data') or [{}])[0].get('id',''))" 2>/dev/null || echo ""
  else
    resp=$(curl -s --max-time 10 "${BASE_URL}/api/tags" 2>/dev/null || echo "")
    echo "$resp" | python3 -c "import sys,json;d=json.load(sys.stdin);m=d.get('models') or [];print(m[0].get('name','') if m else '')" 2>/dev/null || echo ""
  fi
}

# ── Header ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}Arasul — Inferenz-Durchsatz-Harness (Plan 020)${NC}"
echo -e "Ziel: ${BASE_URL}  |  API: ${API}  |  Datum: $(date -Iseconds)"

# Reachability probe.
PROBE_PATH="/api/tags"; [ "$API" = "openai" ] && PROBE_PATH="/v1/models"
if ! curl -sf --max-time 10 "${BASE_URL}${PROBE_PATH}" -o /dev/null 2>/dev/null; then
  echo -e "${RED}Engine unter ${BASE_URL}${PROBE_PATH} nicht erreichbar.${NC}"
  echo -e "${YELLOW}Läuft der Dienst? Auf dem Orin ist Ollama nur host-lokal (127.0.0.1:11434).${NC}"
  exit 1
fi

if [ -z "$MODEL" ]; then
  MODEL="$(detect_model)"
  [ -z "$MODEL" ] && { echo -e "${RED}Kein Modell gefunden (und keins via --model=… angegeben).${NC}"; exit 1; }
  echo -e "Modell (auto): ${BOLD}${MODEL}${NC}"
else
  echo -e "Modell: ${BOLD}${MODEL}${NC}"
fi

BODY="$(build_body)"
EP="$(endpoint_path)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── Single request: writes response to $1, echoes nothing ────────────────────
fire_one() {
  local out="$1"
  curl -s --max-time "$TIMEOUT" \
    -X POST "${BASE_URL}${EP}" \
    -H "Content-Type: application/json" \
    -d "$BODY" > "$out" 2>/dev/null || echo '{}' > "$out"
}

now_ns() { date +%s%N; }

# ── Sweep ────────────────────────────────────────────────────────────────────
IFS=',' read -r -a LEVEL_ARR <<< "$LEVELS"

echo ""
printf "  ${BOLD}%-8s %10s %10s %12s %14s %16s${NC}\n" \
  "Parallel" "Anfragen" "OK" "Wanduhr(s)" "Tokens/s" "Tokens/Tag"
echo "  $(printf '%.0s─' {1..76})"

RESULT_ROWS=""   # accumulated "level;requests;ok;wall;tps;perday" for JSON

for LEVEL in "${LEVEL_ARR[@]}"; do
  LEVEL="$(echo "$LEVEL" | tr -d ' ')"
  [ -z "$LEVEL" ] && continue

  # Warm the model once before the first measured wave (avoid the ~cold-load
  # penalty landing entirely on level 1 and skewing the comparison).
  if [ "$LEVEL" = "${LEVEL_ARR[0]// /}" ]; then
    fire_one "${WORK}/warmup.json"
  fi

  total_proc=0; total_gen=0; total_ok=0; total_req=0
  t0="$(now_ns)"
  for ((r=1; r<=ROUNDS; r++)); do
    pids=()
    for ((c=1; c<=LEVEL; c++)); do
      idx="${r}_${c}"
      fire_one "${WORK}/resp_${LEVEL}_${idx}.json" &
      pids+=("$!")
    done
    for pid in "${pids[@]}"; do wait "$pid"; done
  done
  t1="$(now_ns)"

  wall_ns=$(( t1 - t0 ))
  # Aggregate tokens across every response file for this level.
  for f in "${WORK}"/resp_${LEVEL}_*.json; do
    [ -e "$f" ] || continue
    read -r p g ok <<< "$(parse_tokens "$f")"
    total_proc=$(( total_proc + p ))
    total_gen=$(( total_gen + g ))
    total_ok=$(( total_ok + ok ))
    total_req=$(( total_req + 1 ))
  done

  read -r WALL TPS PERDAY <<< "$(python3 - "$wall_ns" "$total_proc" <<'PY'
import sys
wall_ns = int(sys.argv[1]); proc = int(sys.argv[2])
wall_s = wall_ns / 1e9 if wall_ns > 0 else 0.0
tps = proc / wall_s if wall_s > 0 else 0.0
per_day = tps * 86400
print(f"{wall_s:.2f} {tps:.1f} {int(per_day)}")
PY
)"

  # Thousands separator for the per-day figure (readability).
  PERDAY_H="$(python3 -c "print(f'{int('$PERDAY'):,}')" 2>/dev/null || echo "$PERDAY")"
  printf "  %-8s %10s %10s %12s %14s %16s\n" \
    "$LEVEL" "$total_req" "$total_ok" "$WALL" "$TPS" "$PERDAY_H"

  RESULT_ROWS="${RESULT_ROWS}${RESULT_ROWS:+,}{\"concurrency\":${LEVEL},\"requests\":${total_req},\"ok\":${total_ok},\"wall_s\":${WALL},\"processed_tokens\":${total_proc},\"generated_tokens\":${total_gen},\"tokens_per_s\":${TPS},\"tokens_per_day\":${PERDAY}}"
done

echo ""
echo -e "  ${BLUE}Lesehilfe:${NC} Steigt Tokens/s von 4 auf 16 Parallel kaum, fehlt echtes"
echo -e "  Continuous Batching (Ollama-Slot-Limit). Eine Batching-Engine skaliert weiter."

# ── JSON report ──────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" <<JSON
{
  "timestamp": "$(date -Iseconds)",
  "engine_api": "${API}",
  "endpoint": "${BASE_URL}${EP}",
  "model": "${MODEL}",
  "num_predict": ${NUM_PREDICT},
  "rounds_per_level": ${ROUNDS},
  "levels": [${RESULT_ROWS}]
}
JSON

echo ""
echo -e "  Bericht gespeichert: ${GREEN}${OUTPUT_FILE}${NC}"
echo -e "  ${GREEN}${BOLD}Durchsatz-Messung abgeschlossen.${NC}"
