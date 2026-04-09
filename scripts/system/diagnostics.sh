#!/bin/bash
# =============================================================================
# Arasul Platform - System Diagnostics Export
# =============================================================================
# Collects comprehensive system information for support and troubleshooting.
# Creates a tarball with logs, metrics, config (secrets redacted), and status.
#
# Usage: ./diagnostics.sh [--output /path/to/dir] [--days 3] [--no-logs]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${PROJECT_DIR}/data/diagnostics"
DIAG_DIR=""
INCLUDE_LOGS=true
LOG_DAYS=3

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --output)  OUTPUT_DIR="$2"; shift 2 ;;
    --days)    LOG_DAYS="$2"; shift 2 ;;
    --no-logs) INCLUDE_LOGS=false; shift ;;
    -h|--help)
      echo "Usage: $0 [--output /path] [--days N] [--no-logs]"
      echo "  --output  Directory for the diagnostics archive (default: data/diagnostics)"
      echo "  --days    Days of logs to include (default: 3)"
      echo "  --no-logs Skip log collection (faster)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cleanup() {
  [[ -n "${DIAG_DIR}" && -d "${DIAG_DIR}" ]] && rm -rf "${DIAG_DIR}"
}
trap cleanup EXIT

mkdir -p "${OUTPUT_DIR}"
DIAG_DIR=$(mktemp -d "${OUTPUT_DIR}/diag_${TIMESTAMP}_XXXXXX")
ARCHIVE="${OUTPUT_DIR}/arasul-diagnostics-${TIMESTAMP}.tar.gz"

section() {
  local file="$1"
  local title="$2"
  echo "=== ${title} ===" >> "${DIAG_DIR}/${file}"
  echo "Timestamp: $(date -Iseconds)" >> "${DIAG_DIR}/${file}"
  echo "" >> "${DIAG_DIR}/${file}"
}

collect() {
  local file="$1"
  local title="$2"
  shift 2
  section "${file}" "${title}"
  if "$@" >> "${DIAG_DIR}/${file}" 2>&1; then
    echo "" >> "${DIAG_DIR}/${file}"
  else
    echo "(command failed with exit code $?)" >> "${DIAG_DIR}/${file}"
    echo "" >> "${DIAG_DIR}/${file}"
  fi
}

redact_secrets() {
  # Redact passwords, tokens, keys from config output
  sed -E \
    -e 's/(PASSWORD|SECRET|TOKEN|KEY|PASS|API_KEY|ENCRYPTION_KEY)=.*/\1=***REDACTED***/gi' \
    -e 's/(password|secret|token)": *"[^"]*"/\1": "***REDACTED***"/gi'
}

echo "Collecting system diagnostics..."

# ─── 1. System Info ──────────────────────────────────────────────────────────
echo "  [1/8] System info..."
collect "system.txt" "OS / Kernel" uname -a
collect "system.txt" "Hostname" hostname
collect "system.txt" "Uptime" uptime
collect "system.txt" "CPU Info" lscpu
collect "system.txt" "Memory" free -h
collect "system.txt" "Disk Usage" df -h
collect "system.txt" "Block Devices" lsblk -o NAME,SIZE,TYPE,MOUNTPOINT
collect "system.txt" "Network Interfaces" ip -br addr

# Jetson-specific
if [[ -f /etc/nv_tegra_release ]]; then
  collect "system.txt" "Tegra Release" cat /etc/nv_tegra_release
fi
if [[ -f /proc/device-tree/model ]]; then
  collect "system.txt" "Device Model" cat /proc/device-tree/model
fi

# GPU
if command -v nvidia-smi &>/dev/null; then
  collect "system.txt" "GPU (nvidia-smi)" nvidia-smi
elif command -v tegrastats &>/dev/null; then
  collect "system.txt" "GPU (tegrastats snapshot)" timeout 2 tegrastats --interval 1000 || true
fi

# ─── 2. Docker Status ────────────────────────────────────────────────────────
echo "  [2/8] Docker status..."
collect "docker.txt" "Docker Version" docker version
collect "docker.txt" "Docker Info" docker info
collect "docker.txt" "Container Status" docker compose -f "${PROJECT_DIR}/compose/compose.core.yaml" \
  -f "${PROJECT_DIR}/compose/compose.app.yaml" \
  -f "${PROJECT_DIR}/compose/compose.ai.yaml" ps -a
collect "docker.txt" "Container Resource Usage" docker stats --no-stream --format \
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}"
collect "docker.txt" "Docker Disk Usage" docker system df -v

# ─── 3. Service Logs (last N days, truncated) ────────────────────────────────
if [[ "${INCLUDE_LOGS}" == true ]]; then
  echo "  [3/8] Service logs (last ${LOG_DAYS} days)..."
  mkdir -p "${DIAG_DIR}/logs"

  services=(
    dashboard-backend dashboard-frontend postgres-db minio
    llm-service embedding-service qdrant document-indexer
    n8n self-healing-agent metrics-collector reverse-proxy docker-proxy
  )

  for svc in "${services[@]}"; do
    docker compose -f "${PROJECT_DIR}/compose/compose.core.yaml" \
      -f "${PROJECT_DIR}/compose/compose.app.yaml" \
      -f "${PROJECT_DIR}/compose/compose.ai.yaml" \
      logs --since "${LOG_DAYS}d" --no-color --tail 2000 "${svc}" \
      > "${DIAG_DIR}/logs/${svc}.log" 2>&1 || true
  done
else
  echo "  [3/8] Skipping logs (--no-logs)"
fi

# ─── 4. Database Health ──────────────────────────────────────────────────────
echo "  [4/8] Database health..."
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'postgres-db$|_postgres-db$' | head -1 || true)
if [[ -n "${DB_CONTAINER}" ]]; then
  section "database.txt" "PostgreSQL Status"
  docker exec "${DB_CONTAINER}" pg_isready -U arasul >> "${DIAG_DIR}/database.txt" 2>&1 || true
  echo "" >> "${DIAG_DIR}/database.txt"

  section "database.txt" "Connection Summary"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count DESC;" \
    >> "${DIAG_DIR}/database.txt" 2>&1 || true
  echo "" >> "${DIAG_DIR}/database.txt"

  section "database.txt" "Table Sizes (top 20)"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
     FROM pg_catalog.pg_statio_user_tables
     ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;" \
    >> "${DIAG_DIR}/database.txt" 2>&1 || true
  echo "" >> "${DIAG_DIR}/database.txt"

  section "database.txt" "Migration Count"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT count(*) AS applied_migrations FROM schema_migrations;" \
    >> "${DIAG_DIR}/database.txt" 2>&1 || true
  echo "" >> "${DIAG_DIR}/database.txt"

  section "database.txt" "Dead Tuple Bloat (tables with >1000 dead tuples)"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT relname, n_dead_tup, n_live_tup,
            CASE WHEN n_live_tup > 0 THEN round(100.0 * n_dead_tup / n_live_tup, 1) ELSE 0 END AS dead_pct
     FROM pg_stat_user_tables WHERE n_dead_tup > 1000
     ORDER BY n_dead_tup DESC LIMIT 20;" \
    >> "${DIAG_DIR}/database.txt" 2>&1 || true
else
  echo "PostgreSQL container not found" > "${DIAG_DIR}/database.txt"
fi

# ─── 5. Backup Status ────────────────────────────────────────────────────────
echo "  [5/8] Backup status..."
section "backups.txt" "Backup Directory"
if [[ -d "${PROJECT_DIR}/data/backups" ]]; then
  ls -lhR "${PROJECT_DIR}/data/backups/" 2>/dev/null | head -50 >> "${DIAG_DIR}/backups.txt"
else
  echo "No backup directory found" >> "${DIAG_DIR}/backups.txt"
fi
echo "" >> "${DIAG_DIR}/backups.txt"

# Verification result
if [[ -f "${PROJECT_DIR}/data/backups/verify_result.json" ]]; then
  section "backups.txt" "Last Verification Result"
  cat "${PROJECT_DIR}/data/backups/verify_result.json" >> "${DIAG_DIR}/backups.txt"
fi

# ─── 6. Self-Healing Events ──────────────────────────────────────────────────
echo "  [6/8] Self-healing events..."
if [[ -n "${DB_CONTAINER}" ]]; then
  section "self-healing.txt" "Recent Events (last 50)"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT timestamp, event_type, severity, service_name, description
     FROM self_healing_events ORDER BY timestamp DESC LIMIT 50;" \
    >> "${DIAG_DIR}/self-healing.txt" 2>&1 || true
  echo "" >> "${DIAG_DIR}/self-healing.txt"

  section "self-healing.txt" "Service Failure Summary (last 7 days)"
  docker exec "${DB_CONTAINER}" psql -U arasul -d arasul_db -c \
    "SELECT service_name, failure_type, count(*) AS failures,
            max(detected_at) AS last_failure
     FROM service_failures
     WHERE detected_at > NOW() - INTERVAL '7 days'
     GROUP BY service_name, failure_type
     ORDER BY failures DESC;" \
    >> "${DIAG_DIR}/self-healing.txt" 2>&1 || true
else
  echo "PostgreSQL container not found" > "${DIAG_DIR}/self-healing.txt"
fi

# ─── 7. Configuration (redacted) ─────────────────────────────────────────────
echo "  [7/8] Configuration (redacted)..."
mkdir -p "${DIAG_DIR}/config"

# .env (redacted)
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  cat "${PROJECT_DIR}/.env" | redact_secrets > "${DIAG_DIR}/config/env-redacted.txt"
fi

# Compose files (no secrets)
for f in "${PROJECT_DIR}"/compose/compose.*.yaml; do
  [[ -f "$f" ]] && cp "$f" "${DIAG_DIR}/config/" 2>/dev/null || true
done

# Traefik dynamic config
if [[ -d "${PROJECT_DIR}/config/traefik/dynamic" ]]; then
  cp -r "${PROJECT_DIR}/config/traefik/dynamic" "${DIAG_DIR}/config/traefik-dynamic" 2>/dev/null || true
fi

# PostgreSQL config
if [[ -f "${PROJECT_DIR}/config/postgres/postgresql.conf" ]]; then
  cp "${PROJECT_DIR}/config/postgres/postgresql.conf" "${DIAG_DIR}/config/" 2>/dev/null || true
fi

# System version
section "config/version.txt" "Version Info"
echo "SYSTEM_VERSION=${SYSTEM_VERSION:-unknown}" >> "${DIAG_DIR}/config/version.txt"
echo "BUILD_HASH=${BUILD_HASH:-dev}" >> "${DIAG_DIR}/config/version.txt"
if [[ -f "${PROJECT_DIR}/VERSION" ]]; then
  echo "VERSION_FILE=$(cat "${PROJECT_DIR}/VERSION")" >> "${DIAG_DIR}/config/version.txt"
fi

# ─── 8. Cron & Scheduled Tasks ───────────────────────────────────────────────
echo "  [8/8] Scheduled tasks..."
collect "scheduled.txt" "Crontab (root)" crontab -l
collect "scheduled.txt" "Systemd Timers" systemctl list-timers --no-pager

# ─── Create Archive ──────────────────────────────────────────────────────────
echo ""
echo "Creating archive..."
tar -czf "${ARCHIVE}" -C "${OUTPUT_DIR}" "$(basename "${DIAG_DIR}")"

# Output result
ARCHIVE_SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo "Diagnostics collected successfully:"
echo "  Archive: ${ARCHIVE}"
echo "  Size:    ${ARCHIVE_SIZE}"

# Cleanup old diagnostics (keep last 5)
ls -t "${OUTPUT_DIR}"/arasul-diagnostics-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

# Output JSON for API consumption
cat <<EOF
---JSON---
{"archive":"${ARCHIVE}","size":"${ARCHIVE_SIZE}","timestamp":"$(date -Iseconds)"}
EOF
