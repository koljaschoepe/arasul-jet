#!/bin/bash
# ARASUL PLATFORM - Restore from Backup
# Restores the PostgreSQL database from backup.
# (MinIO-Wiederherstellung am 26.08.2026 entfallen, Phase B4 des Rueckbaus:
# der Objektspeicher ist weg, alte minio_*.tar.gz haben kein Ziel mehr.)
#
# Usage:
#   ./scripts/recovery/restore-from-backup.sh                     # Latest backup
#   ./scripts/recovery/restore-from-backup.sh 2026-03-14_02-00    # Specific backup
#   ./scripts/recovery/restore-from-backup.sh --list              # List available backups
#
# Prerequisites:
#   - Docker containers must be running (at least postgres-db)
#   - Backup volume mounted at /backups/ (or BACKUP_DIR env var set)

set -euo pipefail

# Configuration
# Resolve repo root from script location so non-/opt/arasul installs work too.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${ARASUL_REPO_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/data/backups}"
COMPOSE_PROJECT="arasul-platform"
POSTGRES_USER="${POSTGRES_USER:-arasul}"
POSTGRES_DB="${POSTGRES_DB:-arasul_db}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[RESTORE]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# List available backups
list_backups() {
    echo -e "${BLUE}Available Backups:${NC}"
    echo ""

    if [ -d "$BACKUP_DIR" ]; then
        # PostgreSQL backups
        echo -e "${BLUE}PostgreSQL:${NC}"
        ls -lh "$BACKUP_DIR"/postgres_*.sql.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (none)"
        echo ""

        # WAL archives
        if [ -d "$BACKUP_DIR/../wal-archive" ]; then
            echo -e "${BLUE}WAL Archives:${NC}"
            ls -lh "$BACKUP_DIR"/../wal-archive/*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (none)"
        fi
    else
        error "Backup directory not found: $BACKUP_DIR"
    fi
}

# Find backup file matching timestamp pattern
find_backup() {
    local type="$1"    # postgres
    local timestamp="$2"

    if [ "$timestamp" = "latest" ]; then
        # Find most recent backup of this type
        ls -t "$BACKUP_DIR"/${type}_*.gz 2>/dev/null | head -1
    else
        # Find backup matching timestamp
        ls "$BACKUP_DIR"/${type}_*${timestamp}*.gz 2>/dev/null | head -1
    fi
}

# Restore PostgreSQL
restore_postgres() {
    local backup_file="$1"
    log "Restoring PostgreSQL from: $(basename "$backup_file")"

    # Stop services that depend on the database
    log "Stopping dependent services..."
    docker compose stop dashboard-backend n8n document-indexer self-healing-agent 2>/dev/null || true

    # Restore
    log "Dropping and recreating database..."
    docker exec -i "${COMPOSE_PROJECT}-postgres-db-1" psql -U "$POSTGRES_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
    " 2>/dev/null || true

    docker exec -i "${COMPOSE_PROJECT}-postgres-db-1" psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};" 2>/dev/null
    docker exec -i "${COMPOSE_PROJECT}-postgres-db-1" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};" 2>/dev/null

    log "Restoring data (this may take a few minutes)..."
    gunzip -c "$backup_file" | docker exec -i "${COMPOSE_PROJECT}-postgres-db-1" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet 2>/dev/null

    log "PostgreSQL restore complete"
}

# Main
main() {
    local timestamp="latest"

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --list)
                list_backups
                exit 0
                ;;
            --help|-h)
                echo "Usage: $0 [TIMESTAMP] [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --list         List available backups"
                echo "  --help         Show this help"
                echo ""
                echo "Examples:"
                echo "  $0                        # Restore latest backup"
                echo "  $0 2026-03-14_02-00       # Restore specific backup"
                exit 0
                ;;
            *)
                timestamp="$arg"
                ;;
        esac
    done

    echo ""
    echo -e "${RED}=== ARASUL DISASTER RECOVERY ===${NC}"
    echo ""
    warn "This will OVERWRITE current data with backup data!"
    echo -n -e "  ${YELLOW}Continue? [y/N]:${NC} "
    read -r confirm
    if [[ ! "$confirm" =~ ^[yY] ]]; then
        log "Restore cancelled"
        exit 0
    fi

    local start_time=$SECONDS

    # PostgreSQL
    local pg_backup
    pg_backup=$(find_backup "postgres" "$timestamp")
    if [ -n "$pg_backup" ]; then
        restore_postgres "$pg_backup"
    else
        error "No PostgreSQL backup found for timestamp: $timestamp"
        exit 1
    fi

    # Restart all services
    log "Restarting services..."
    docker compose up -d 2>/dev/null

    local elapsed=$((SECONDS - start_time))
    echo ""
    log "Restore complete in ${elapsed}s"
    log "Verify services: docker compose ps"
}

main "$@"
