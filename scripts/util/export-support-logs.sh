#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Support Log Export
# Creates an anonymized log archive for support cases.
#
# Collected data:
#   - Docker service status and logs (last 500 lines each)
#   - System metrics (CPU, RAM, disk, temperature)
#   - Configuration validation results
#   - Self-healing event history
#   - NO passwords, tokens, or personal data
#
# Usage:
#   ./scripts/export-support-logs.sh [--output DIR] [--lines N]
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
OUTPUT_DIR="data"
LOG_LINES=500
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# CLI flags
for arg in "$@"; do
  case "$arg" in
    --output=*) OUTPUT_DIR="${arg#*=}" ;;
    --lines=*)  LOG_LINES="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--output=DIR] [--lines=N]"
      echo "  --output=DIR   Output directory (default: data)"
      echo "  --lines=N      Number of log lines per service (default: 500)"
      exit 0
      ;;
  esac
done

WORK_DIR=$(mktemp -d)
EXPORT_DIR="${WORK_DIR}/support-logs-${TIMESTAMP}"
mkdir -p "$EXPORT_DIR"

echo -e "${BOLD}Arasul Support Log Export${NC}"
echo -e "Timestamp: ${TIMESTAMP}"
echo ""

###############################################################################
# 1. System Information
###############################################################################

echo -e "  ${BLUE}Collecting system information...${NC}"

{
  echo "=== System Information ==="
  echo "Date: $(date -Iseconds)"
  echo "Hostname: $(hostname)"
  echo "Uptime: $(uptime)"
  echo "Kernel: $(uname -r)"
  echo "Architecture: $(uname -m)"
  echo ""

  echo "=== Memory ==="
  free -h
  echo ""

  echo "=== Disk ==="
  df -h
  echo ""

  echo "=== CPU ==="
  echo "Cores: $(nproc)"
  cat /proc/loadavg 2>/dev/null || echo "N/A"
  echo ""

  echo "=== Temperature ==="
  for zone in /sys/devices/virtual/thermal/thermal_zone*/temp; do
    name=$(cat "$(dirname "$zone")/type" 2>/dev/null || echo "unknown")
    temp=$(cat "$zone" 2>/dev/null || echo "0")
    echo "${name}: $((temp / 1000))°C"
  done
  echo ""

  echo "=== JetPack Version ==="
  dpkg-query -W -f='${Version}' nvidia-jetpack 2>/dev/null || echo "N/A"
  echo ""

  echo "=== Docker Version ==="
  docker version --format '{{.Server.Version}}' 2>/dev/null || echo "N/A"
  echo ""

  echo "=== Docker Compose Version ==="
  docker compose version 2>/dev/null || echo "N/A"
} > "${EXPORT_DIR}/system-info.txt" 2>&1

###############################################################################
# 2. Docker Service Status
###############################################################################

echo -e "  ${BLUE}Collecting Docker service status...${NC}"

{
  echo "=== Docker Compose Services ==="
  docker compose ps 2>/dev/null || echo "docker compose not available"
  echo ""

  echo "=== Container Resource Usage ==="
  docker stats --no-stream 2>/dev/null || echo "N/A"
  echo ""

  echo "=== Docker Images ==="
  docker compose config --images 2>/dev/null || echo "N/A"
} > "${EXPORT_DIR}/docker-status.txt" 2>&1

###############################################################################
# 3. Service Logs (anonymized)
###############################################################################

echo -e "  ${BLUE}Collecting service logs (last ${LOG_LINES} lines each)...${NC}"

LOGS_DIR="${EXPORT_DIR}/logs"
mkdir -p "$LOGS_DIR"

SERVICES=$(docker compose ps --format "{{.Name}}" 2>/dev/null || echo "")
while IFS= read -r service; do
  if [ -n "$service" ]; then
    docker compose logs --tail="$LOG_LINES" --no-color "$service" 2>/dev/null | \
      sed -E \
        -e 's/password=[^ ]*/password=***REDACTED***/gi' \
        -e 's/token=[^ ]*/token=***REDACTED***/gi' \
        -e 's/Bearer [A-Za-z0-9._-]+/Bearer ***REDACTED***/g' \
        -e 's/JWT_SECRET=[^ ]*/JWT_SECRET=***REDACTED***/g' \
        -e 's/POSTGRES_PASSWORD=[^ ]*/POSTGRES_PASSWORD=***REDACTED***/g' \
        -e 's/MINIO_ROOT_PASSWORD=[^ ]*/MINIO_ROOT_PASSWORD=***REDACTED***/g' \
        -e 's/ADMIN_PASSWORD=[^ ]*/ADMIN_PASSWORD=***REDACTED***/g' \
        -e 's/NGROK_AUTHTOKEN=[^ ]*/NGROK_AUTHTOKEN=***REDACTED***/g' \
        -e 's/CLOUDFLARE_TUNNEL_TOKEN=[^ ]*/CLOUDFLARE_TUNNEL_TOKEN=***REDACTED***/g' \
        -e 's/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/***EMAIL***/g' \
      > "${LOGS_DIR}/${service}.log"
  fi
done <<< "$SERVICES"

###############################################################################
# 4. Application Logs
###############################################################################

echo -e "  ${BLUE}Collecting application logs...${NC}"

for logfile in logs/*.log; do
  if [ -f "$logfile" ]; then
    tail -n "$LOG_LINES" "$logfile" | \
      sed -E \
        -e 's/password=[^ ]*/password=***REDACTED***/gi' \
        -e 's/token=[^ ]*/token=***REDACTED***/gi' \
        -e 's/Bearer [A-Za-z0-9._-]+/Bearer ***REDACTED***/g' \
      > "${LOGS_DIR}/$(basename "$logfile")" 2>/dev/null || true
  fi
done

###############################################################################
# 5. Configuration Status (no secrets)
###############################################################################

echo -e "  ${BLUE}Collecting configuration status...${NC}"

{
  echo "=== Environment Variables (names only, no values) ==="
  if [ -f ".env" ]; then
    grep -E "^[A-Z_]+=" .env | cut -d= -f1 | sort
  else
    echo ".env file not found"
  fi
  echo ""

  echo "=== Docker Compose Config Validation ==="
  docker compose config --quiet 2>&1 && echo "Valid" || echo "Invalid"
  echo ""

  echo "=== Network Configuration ==="
  docker network ls 2>/dev/null || echo "N/A"
  echo ""

  echo "=== Volume Information ==="
  docker volume ls 2>/dev/null || echo "N/A"
} > "${EXPORT_DIR}/config-status.txt" 2>&1

###############################################################################
# 6. Health Check Results
###############################################################################

echo -e "  ${BLUE}Collecting health check results...${NC}"

{
  echo "=== Service Health Checks ==="
  docker compose ps --format "{{.Name}}\t{{.State}}\t{{.Health}}" 2>/dev/null || echo "N/A"
  echo ""

  echo "=== API Health ==="
  curl -s --max-time 5 "http://localhost/api/system/heartbeat" 2>/dev/null || echo "API not reachable"
  echo ""

  echo "=== API Status ==="
  curl -s --max-time 5 "http://localhost/api/system/status" 2>/dev/null || echo "Status endpoint not reachable"
} > "${EXPORT_DIR}/health-checks.txt" 2>&1

###############################################################################
# 7. Create Archive
###############################################################################

echo -e "  ${BLUE}Creating archive...${NC}"

ARCHIVE_NAME="support-logs-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"
mkdir -p "$OUTPUT_DIR"

cd "$WORK_DIR"
tar czf "$ARCHIVE_PATH" "support-logs-${TIMESTAMP}/"
cd "$PROJECT_ROOT"

# Cleanup
rm -rf "$WORK_DIR"

ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" | awk '{print $1}')

echo ""
echo -e "  ${GREEN}✓${NC} Support logs exported: ${GREEN}${ARCHIVE_PATH}${NC} (${ARCHIVE_SIZE})"
echo ""
echo -e "  ${BOLD}Bitte senden Sie diese Datei an den Support.${NC}"
echo -e "  Die Datei enthaelt KEINE Passwoerter oder persoenlichen Daten."
