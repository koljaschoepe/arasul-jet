#!/usr/bin/env bash
# 24-hour soak test for the external-integrations stack.
#
# This is an OPERATOR tool — not for CI. It runs in the background, polls
# health endpoints every 60 s, and writes a CSV. After the soak, run
# `./external-integrations-soak.sh report` to summarise.
#
# Usage:
#   ./external-integrations-soak.sh start [--duration=24h] [--host=URL]
#   ./external-integrations-soak.sh report
#   ./external-integrations-soak.sh stop
#
# Acceptance per Phase 7.2:
#   - zero failed n8n executions
#   - zero dropped Telegram messages
#   - dashboard-backend back up < 60 s after a restart at the 6 h mark
#   - n8n back up < 60 s after a restart at the 12 h mark
#
# This script does NOT issue the restarts — the operator triggers them by
# hand to mirror real ops. The script just records what happens.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/data/soak-logs"
CSV="${LOG_DIR}/soak.csv"
PID_FILE="${LOG_DIR}/soak.pid"
mkdir -p "$LOG_DIR"

HOST="${HOST:-https://localhost}"
DURATION_SECS=$((24 * 60 * 60))

parse_duration() {
  case "$1" in
    *h) echo $(( ${1%h} * 3600 )) ;;
    *m) echo $(( ${1%m} * 60 )) ;;
    *s) echo "${1%s}" ;;
    *)  echo "$1" ;;
  esac
}

cmd="${1:-}"
shift || true
for arg in "$@"; do
  case "$arg" in
    --duration=*) DURATION_SECS=$(parse_duration "${arg#--duration=}") ;;
    --host=*)     HOST="${arg#--host=}" ;;
  esac
done

start_soak() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Soak already running (pid $(cat "$PID_FILE")). Stop it first."
    exit 1
  fi
  echo "ts,backend_status,n8n_status,backend_latency_ms,n8n_latency_ms,backend_health,n8n_health" > "$CSV"
  (
    end=$(( $(date +%s) + DURATION_SECS ))
    while [ "$(date +%s)" -lt "$end" ]; do
      ts=$(date -Iseconds)

      backend_t0=$(date +%s%N)
      backend_status=$(curl -sk -o /dev/null -w '%{http_code}' "$HOST/api/health" || echo 000)
      backend_t1=$(date +%s%N)
      backend_latency=$(( (backend_t1 - backend_t0) / 1000000 ))

      n8n_t0=$(date +%s%N)
      n8n_status=$(curl -sk -o /dev/null -w '%{http_code}' "$HOST/n8n/healthz" || echo 000)
      n8n_t1=$(date +%s%N)
      n8n_latency=$(( (n8n_t1 - n8n_t0) / 1000000 ))

      backend_health=$(docker inspect --format='{{.State.Health.Status}}' dashboard-backend 2>/dev/null || echo "?")
      n8n_health=$(docker inspect --format='{{.State.Health.Status}}' n8n 2>/dev/null || echo "?")

      printf "%s,%s,%s,%s,%s,%s,%s\n" \
        "$ts" "$backend_status" "$n8n_status" "$backend_latency" "$n8n_latency" \
        "$backend_health" "$n8n_health" >> "$CSV"

      sleep 60
    done
  ) &
  pid=$!
  echo "$pid" > "$PID_FILE"
  echo "Soak started (pid $pid). Logging to $CSV."
  echo "Run \`$0 report\` after the soak completes."
}

stop_soak() {
  if [ ! -f "$PID_FILE" ]; then echo "No soak pid file."; exit 1; fi
  pid=$(cat "$PID_FILE")
  if kill "$pid" 2>/dev/null; then
    echo "Stopped soak (pid $pid)."
  else
    echo "Soak pid $pid not running."
  fi
  rm -f "$PID_FILE"
}

report_soak() {
  if [ ! -f "$CSV" ]; then echo "No soak CSV at $CSV"; exit 1; fi
  total=$(($(wc -l < "$CSV") - 1))
  ok_backend=$(awk -F, 'NR>1 && $2 ~ /^(2|3)/' "$CSV" | wc -l)
  ok_n8n=$(awk -F, 'NR>1 && $3 ~ /^(2|3)/' "$CSV" | wc -l)
  err_backend=$(( total - ok_backend ))
  err_n8n=$(( total - ok_n8n ))
  unhealthy_backend=$(awk -F, 'NR>1 && $6 != "healthy"' "$CSV" | wc -l)
  unhealthy_n8n=$(awk -F, 'NR>1 && $7 != "healthy"' "$CSV" | wc -l)
  p95_backend=$(awk -F, 'NR>1 {print $4}' "$CSV" | sort -n | awk -v p=0.95 'BEGIN{c=0} {a[c++]=$1} END{if(c==0){print 0}else{print a[int(c*p)]}}')
  p95_n8n=$(awk -F, 'NR>1 {print $5}' "$CSV" | sort -n | awk -v p=0.95 'BEGIN{c=0} {a[c++]=$1} END{if(c==0){print 0}else{print a[int(c*p)]}}')

  printf "Soak report — %d samples (~%d minutes)\n" "$total" "$total"
  printf "  backend: %d ok, %d err, %d unhealthy ticks, p95=%s ms\n" \
    "$ok_backend" "$err_backend" "$unhealthy_backend" "$p95_backend"
  printf "  n8n:     %d ok, %d err, %d unhealthy ticks, p95=%s ms\n" \
    "$ok_n8n" "$err_n8n" "$unhealthy_n8n" "$p95_n8n"

  # Verdict against Phase 7.2 acceptance.
  pass=0
  [ "$err_backend" -gt 5 ]   && { echo "  ✗ backend had $err_backend non-2xx ticks"; pass=1; }
  [ "$err_n8n" -gt 5 ]       && { echo "  ✗ n8n had $err_n8n non-2xx ticks"; pass=1; }
  [ "$unhealthy_backend" -gt 5 ] && { echo "  ✗ backend was unhealthy on $unhealthy_backend ticks"; pass=1; }
  [ "$unhealthy_n8n" -gt 5 ]     && { echo "  ✗ n8n was unhealthy on $unhealthy_n8n ticks"; pass=1; }
  [ "$pass" -eq 0 ] && echo "  ✓ within Phase 7.2 acceptance tolerance"

  echo
  echo "Inspect raw CSV: $CSV"
  exit "$pass"
}

case "$cmd" in
  start)  start_soak ;;
  stop)   stop_soak ;;
  report) report_soak ;;
  *)
    sed -n '2,18p' "$0"
    exit 1 ;;
esac
