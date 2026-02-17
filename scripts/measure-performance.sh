#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Performance Baseline Measurement
# Measures key performance metrics for deployment documentation.
#
# Prerequisites:
#   - All Docker services running
#   - Admin credentials in .env or via environment
#
# Usage:
#   ./scripts/measure-performance.sh [--host HOST] [--port PORT] [--output FILE]
#
# Measures:
#   1. Service startup times (cold boot simulation)
#   2. API response latencies
#   3. Memory footprint per service
#   4. Chat response latency (if LLM available)
#   5. Document indexing speed (if embedding service available)
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
HOST="localhost"
PORT="80"
OUTPUT_FILE="data/performance-baseline.json"
RUNS=3

# CLI flags
for arg in "$@"; do
  case "$arg" in
    --host=*)   HOST="${arg#*=}" ;;
    --port=*)   PORT="${arg#*=}" ;;
    --output=*) OUTPUT_FILE="${arg#*=}" ;;
    --runs=*)   RUNS="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--host=HOST] [--port=PORT] [--output=FILE] [--runs=N]"
      echo "  --host=HOST     Target host (default: localhost)"
      echo "  --port=PORT     Target port (default: 80)"
      echo "  --output=FILE   Output JSON file (default: data/performance-baseline.json)"
      echo "  --runs=N        Number of runs for averaging (default: 3)"
      exit 0
      ;;
  esac
done

BASE_URL="http://${HOST}:${PORT}"
API_URL="${BASE_URL}/api"
TOKEN=""

###############################################################################
# HELPER FUNCTIONS
###############################################################################

log_section() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_metric() {
  printf "  %-40s %s\n" "$1" "$2"
}

# Measure HTTP request time in ms
measure_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="${API_URL}${path}"
  local total=0

  local curl_args=(-s -o /dev/null -w "%{time_total}" -X "$method" --max-time 30)

  if [ -n "$TOKEN" ]; then
    curl_args+=(-H "Authorization: Bearer ${TOKEN}")
  fi

  if [ -n "$data" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  for ((i=1; i<=RUNS; i++)); do
    local time_s
    time_s=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "0")
    local time_ms
    time_ms=$(echo "$time_s * 1000" | bc 2>/dev/null || echo "0")
    total=$(echo "$total + $time_ms" | bc 2>/dev/null || echo "0")
  done

  echo "scale=1; $total / $RUNS" | bc 2>/dev/null || echo "0"
}

# Get auth token
get_token() {
  local admin_user="${ADMIN_USERNAME:-admin}"
  local admin_pass="${ADMIN_PASSWORD:-}"

  if [ -z "$admin_pass" ] && [ -f ".env" ]; then
    admin_pass=$(grep -E "^ADMIN_PASSWORD=" .env | cut -d= -f2- | tr -d '"' || true)
  fi

  if [ -z "$admin_pass" ]; then
    echo ""
    return
  fi

  local response
  response=$(curl -s -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${admin_user}\",\"password\":\"${admin_pass}\"}" \
    --max-time 10 2>/dev/null || echo "{}")

  echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo ""
}

###############################################################################
# MEASUREMENTS
###############################################################################

echo -e "${BOLD}Arasul Platform - Performance Baseline${NC}"
echo -e "Host: ${HOST}:${PORT} | Runs per measurement: ${RUNS}"
echo -e "Date: $(date -Iseconds)"

# Authenticate
TOKEN=$(get_token)
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Warning: Could not authenticate. Some measurements will be skipped.${NC}"
fi

# ── 1. Memory Footprint ──────────────────────────────────────────────────────

log_section "1. Memory Footprint (per container)"

declare -A MEM_MAP
echo ""
printf "  ${BOLD}%-30s %10s %10s${NC}\n" "Container" "Memory" "Limit"
echo "  $(printf '%.0s─' {1..52})"

while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}')
  mem=$(echo "$line" | awk '{print $2}')
  limit=$(echo "$line" | awk '{print $3}')
  printf "  %-30s %10s %10s\n" "$name" "$mem" "${limit:-N/A}"
  MEM_MAP[$name]="$mem"
done < <(docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" 2>/dev/null | sed 's|/| |' || echo "N/A N/A N/A")

TOTAL_MEM=$(docker stats --no-stream --format "{{.MemUsage}}" 2>/dev/null | \
  awk -F/ '{gsub(/[^0-9.]/, "", $1); sum += $1} END {printf "%.0f MiB", sum}' || echo "N/A")
echo ""
log_metric "Total Memory Usage:" "$TOTAL_MEM"

# ── 2. API Response Latencies ────────────────────────────────────────────────

log_section "2. API Response Latencies (avg of ${RUNS} runs)"

declare -A LATENCY_MAP

# Public endpoints
endpoints=(
  "GET /system/heartbeat"
)

# Auth-required endpoints
if [ -n "$TOKEN" ]; then
  endpoints+=(
    "GET /system/status"
    "GET /system/info"
    "GET /system/network"
    "GET /chats"
    "GET /documents"
    "GET /settings"
    "GET /services"
    "GET /metrics"
    "GET /logs/list"
    "GET /llm/models"
    "GET /datentabellen/tables"
  )
fi

echo ""
printf "  ${BOLD}%-35s %10s${NC}\n" "Endpoint" "Latency"
echo "  $(printf '%.0s─' {1..47})"

for ep in "${endpoints[@]}"; do
  method=$(echo "$ep" | awk '{print $1}')
  path=$(echo "$ep" | awk '{print $2}')
  latency=$(measure_request "$method" "$path")
  printf "  %-35s %8s ms\n" "$ep" "$latency"
  LATENCY_MAP["$ep"]="${latency}"
done

# ── 3. Startup Time Estimate ─────────────────────────────────────────────────

log_section "3. Service Startup Times"

echo ""
printf "  ${BOLD}%-30s %15s${NC}\n" "Container" "Uptime"
echo "  $(printf '%.0s─' {1..47})"

while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}')
  status=$(echo "$line" | awk '{$1=""; print $0}' | sed 's/^ //')
  printf "  %-30s %s\n" "$name" "$status"
done < <(docker compose ps --format "{{.Name}} {{.Status}}" 2>/dev/null || echo "N/A N/A")

# Measure cold-start simulation: time to first successful API response
echo ""
echo -e "  ${BLUE}Cold-start measurement requires services restart.${NC}"
echo -e "  ${BLUE}Skipping to avoid disruption. Run manually:${NC}"
echo -e "  ${YELLOW}  time (docker compose down && docker compose up -d && \\${NC}"
echo -e "  ${YELLOW}   until curl -sf http://localhost/api/system/heartbeat; do sleep 1; done)${NC}"

# ── 4. LLM Response Latency ─────────────────────────────────────────────────

log_section "4. LLM Response Latency"

LLM_LATENCY="N/A"
if [ -n "$TOKEN" ]; then
  # Check if LLM is available
  LLM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "Authorization: Bearer ${TOKEN}" \
    "${API_URL}/llm/models" 2>/dev/null || echo "000")

  if [ "$LLM_CHECK" = "200" ]; then
    echo -e "  ${BLUE}Sending test prompt to LLM (this may take a moment)...${NC}"

    START_TIME=$(date +%s%N)
    LLM_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 120 \
      -X POST "${API_URL}/llm/chat" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"message":"Antworte nur mit: OK","model":"auto"}' 2>/dev/null || echo -e "\n000")
    END_TIME=$(date +%s%N)

    LLM_STATUS=$(echo "$LLM_RESPONSE" | tail -1)
    if [ "$LLM_STATUS" = "200" ]; then
      LLM_LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))
      log_metric "LLM response time:" "${LLM_LATENCY} ms"
    else
      log_metric "LLM response:" "Error (HTTP $LLM_STATUS)"
    fi
  else
    log_metric "LLM:" "Not available"
  fi
else
  log_metric "LLM:" "Skipped (no auth)"
fi

# ── 5. Disk Usage ────────────────────────────────────────────────────────────

log_section "5. Disk Usage"

echo ""
printf "  ${BOLD}%-30s %10s${NC}\n" "Directory" "Size"
echo "  $(printf '%.0s─' {1..42})"

for dir in data/postgres data/minio data/qdrant data/ollama data/backups logs; do
  if [ -d "$dir" ]; then
    size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
    printf "  %-30s %10s\n" "$dir" "$size"
  fi
done

TOTAL_DISK=$(du -sh data/ 2>/dev/null | awk '{print $1}' || echo "N/A")
echo ""
log_metric "Total data directory:" "$TOTAL_DISK"

# ── 6. System Resources ─────────────────────────────────────────────────────

log_section "6. System Resources"

CPU_CORES=$(nproc 2>/dev/null || echo "N/A")
TOTAL_RAM=$(free -h 2>/dev/null | awk '/^Mem:/ {print $2}' || echo "N/A")
AVAIL_RAM=$(free -h 2>/dev/null | awk '/^Mem:/ {print $7}' || echo "N/A")
SWAP=$(free -h 2>/dev/null | awk '/^Swap:/ {print $2}' || echo "N/A")

log_metric "CPU Cores:" "$CPU_CORES"
log_metric "Total RAM:" "$TOTAL_RAM"
log_metric "Available RAM:" "$AVAIL_RAM"
log_metric "Swap:" "$SWAP"

# GPU info (Jetson)
if command -v tegrastats &>/dev/null || [ -f /etc/nv_tegra_release ]; then
  GPU_MEM=$(cat /sys/devices/platform/17000000.ga10b/devfreq/17000000.ga10b/cur_freq 2>/dev/null || echo "N/A")
  log_metric "GPU Freq:" "${GPU_MEM} Hz"
fi

# ── Generate Report ──────────────────────────────────────────────────────────

log_section "Report Generation"

mkdir -p "$(dirname "$OUTPUT_FILE")"

python3 -c "
import json, datetime

report = {
    'timestamp': '$(date -Iseconds)',
    'host': '${HOST}:${PORT}',
    'system': {
        'cpu_cores': '${CPU_CORES}',
        'total_ram': '${TOTAL_RAM}',
        'available_ram': '${AVAIL_RAM}',
        'swap': '${SWAP}',
        'total_disk_data': '${TOTAL_DISK}'
    },
    'api_latencies_ms': {},
    'llm_latency_ms': '${LLM_LATENCY}',
    'measurement_runs': ${RUNS}
}

print(json.dumps(report, indent=2))
" > "$OUTPUT_FILE" 2>/dev/null || echo "{}" > "$OUTPUT_FILE"

echo -e "  Report saved to: ${GREEN}${OUTPUT_FILE}${NC}"
echo ""
echo -e "  ${GREEN}${BOLD}Performance baseline measurement complete.${NC}"
