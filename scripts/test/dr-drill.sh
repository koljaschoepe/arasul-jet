#!/bin/bash
# ARASUL PLATFORM - Disaster Recovery Drill
# Tests the complete backup→destroy→restore cycle.
#
# WARNING: This script DESTROYS ALL DATA and restores from backup.
#          Only run this in a test/staging environment!
#
# Usage:
#   ./scripts/test/dr-drill.sh              # Full DR drill
#   ./scripts/test/dr-drill.sh --dry-run    # Verify backup only, don't destroy
#
# Expected result: Full restore in < 30 minutes, all data intact.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

log() { echo -e "${GREEN}[DR-DRILL]${NC} $*"; }
warn() { echo -e "${YELLOW}[DR-DRILL]${NC} $*"; }
error() { echo -e "${RED}[DR-DRILL]${NC} $*" >&2; }
pass() { echo -e "  ${GREEN}✓ PASS:${NC} $*"; }
fail() { echo -e "  ${RED}✗ FAIL:${NC} $*"; FAILURES=$((FAILURES + 1)); }

FAILURES=0
START_TIME=$(date +%s)

echo ""
echo -e "${RED}============================================${NC}"
echo -e "${RED}  ARASUL DISASTER RECOVERY DRILL${NC}"
echo -e "${RED}============================================${NC}"
echo ""

if $DRY_RUN; then
    log "DRY RUN MODE - no destructive operations"
else
    warn "THIS WILL DESTROY ALL DATA AND RESTORE FROM BACKUP"
    warn "Only run this in a test/staging environment!"
    echo -n -e "  ${RED}Type 'DESTROY' to continue:${NC} "
    read -r confirm
    if [ "$confirm" != "DESTROY" ]; then
        log "Aborted."
        exit 0
    fi
fi

cd "$PROJECT_ROOT"

# =============================================================================
# Step 1: Verify backup exists
# =============================================================================
log "Step 1: Verify backup exists"

BACKUP_DIR="data/backups"
if [ ! -d "$BACKUP_DIR" ]; then
    # Try Docker volume path
    BACKUP_DIR=$(docker inspect --format='{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' arasul-platform-backup-service-1 2>/dev/null || echo "")
fi

PG_BACKUP=$(ls -t "${BACKUP_DIR}"/postgres_*.sql.gz 2>/dev/null | head -1 || echo "")

if [ -n "$PG_BACKUP" ]; then
    local_size=$(du -sh "$PG_BACKUP" 2>/dev/null | awk '{print $1}' || echo "unknown")
    pass "PostgreSQL backup found: $(basename "$PG_BACKUP") (${local_size})"
else
    fail "No PostgreSQL backup found in ${BACKUP_DIR}"
fi

# =============================================================================
# Step 2: Create fresh backup before drill
# =============================================================================
log "Step 2: Create fresh backup"

docker exec arasul-platform-backup-service-1 /app/backup.sh 2>/dev/null && \
    pass "Fresh backup created" || \
    warn "Could not create fresh backup (using existing)"

# =============================================================================
# Step 3: Record pre-drill state
# =============================================================================
log "Step 3: Record pre-drill state"

PRE_TABLES=$(docker exec arasul-platform-postgres-db-1 psql -U arasul -d arasul_db -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')
PRE_USERS=$(docker exec arasul-platform-postgres-db-1 psql -U arasul -d arasul_db -t -c \
    "SELECT count(*) FROM users" 2>/dev/null | tr -d ' ')

log "  Pre-drill: ${PRE_TABLES} tables, ${PRE_USERS} users"

if $DRY_RUN; then
    log "DRY RUN: Skipping destructive steps (4-5)"
    pass "Backup verified, pre-drill state recorded"

    ELAPSED=$(( $(date +%s) - START_TIME ))
    echo ""
    log "Dry run complete in ${ELAPSED}s"
    exit 0
fi

# =============================================================================
# Step 4: Destroy all data
# =============================================================================
log "Step 4: Destroying all data..."

docker compose down -v 2>/dev/null
pass "All volumes destroyed"

# =============================================================================
# Step 5: Restore from backup
# =============================================================================
log "Step 5: Restoring from backup..."

# Start infrastructure only
docker compose up -d postgres-db minio qdrant 2>/dev/null
log "  Waiting for infrastructure to be healthy..."
sleep 15

# Restore database
if [ -n "$PG_BACKUP" ]; then
    log "  Restoring PostgreSQL..."
    gunzip -c "$PG_BACKUP" | docker exec -i arasul-platform-postgres-db-1 psql -U arasul -d arasul_db --quiet 2>/dev/null && \
        pass "PostgreSQL restored" || \
        fail "PostgreSQL restore failed"
fi

# Start remaining services
log "  Starting all services..."
docker compose up -d 2>/dev/null
log "  Waiting for services to start..."
sleep 30

# =============================================================================
# Step 6: Validate restore
# =============================================================================
log "Step 6: Validate restore"

# Check tables
POST_TABLES=$(docker exec arasul-platform-postgres-db-1 psql -U arasul -d arasul_db -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')

if [ "$POST_TABLES" -ge "$PRE_TABLES" ] 2>/dev/null; then
    pass "Tables restored: ${POST_TABLES} (was ${PRE_TABLES})"
else
    fail "Tables mismatch: ${POST_TABLES} (was ${PRE_TABLES})"
fi

# Check users
POST_USERS=$(docker exec arasul-platform-postgres-db-1 psql -U arasul -d arasul_db -t -c \
    "SELECT count(*) FROM users" 2>/dev/null | tr -d ' ')

if [ "$POST_USERS" -ge 1 ]; then
    pass "Users restored: ${POST_USERS}"
else
    fail "No users found after restore"
fi

# Check admin login
HEALTH=$(curl -sf -o /dev/null -w '%{http_code}' "http://localhost/api/health" 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
    pass "API health check passed (HTTP ${HEALTH})"
else
    fail "API health check failed (HTTP ${HEALTH})"
fi

# Check services
RUNNING=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys,json
lines = sys.stdin.read().strip().split('\n')
running = sum(1 for l in lines if l and 'running' in json.loads(l).get('State',''))
print(running)
" 2>/dev/null || echo "0")

if [ "$RUNNING" -ge 10 ]; then
    pass "Services running: ${RUNNING}"
else
    fail "Only ${RUNNING} services running"
fi

# =============================================================================
# Results
# =============================================================================
ELAPSED=$(( $(date +%s) - START_TIME ))
ELAPSED_MIN=$((ELAPSED / 60))
ELAPSED_SEC=$((ELAPSED % 60))

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  DR Drill Results${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  Duration: ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
echo -e "  Failures: ${FAILURES}"

if [ "$FAILURES" -eq 0 ]; then
    echo -e "  ${GREEN}DR DRILL PASSED${NC}"
    if [ "$ELAPSED" -le 1800 ]; then
        echo -e "  ${GREEN}RTO MET: Restore completed in < 30 minutes${NC}"
    else
        echo -e "  ${YELLOW}RTO EXCEEDED: Restore took > 30 minutes${NC}"
    fi
else
    echo -e "  ${RED}DR DRILL FAILED (${FAILURES} failures)${NC}"
fi
echo -e "${BLUE}============================================${NC}"

exit $FAILURES
