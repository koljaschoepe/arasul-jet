#!/bin/bash
# ARASUL PLATFORM - Restore from Backup
# Restores PostgreSQL database, MinIO objects, and Qdrant vectors from backup.
#
# Usage:
#   ./scripts/recovery/restore-from-backup.sh                     # Latest backup
#   ./scripts/recovery/restore-from-backup.sh 2026-03-14_02-00    # Specific backup
#   ./scripts/recovery/restore-from-backup.sh --list              # List available backups
#
# Prerequisites:
#   - Docker containers must be running (at least postgres-db, minio, qdrant)
#   - Backup volume mounted at /backups/ (or BACKUP_DIR env var set)

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/arasul/arasul/arasul-jet/data/backups}"
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

        # MinIO backups
        echo -e "${BLUE}MinIO:${NC}"
        ls -lh "$BACKUP_DIR"/minio_*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (none)"
        echo ""

        # Qdrant backups
        echo -e "${BLUE}Qdrant:${NC}"
        ls -lh "$BACKUP_DIR"/qdrant_*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (none)"
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
    local type="$1"    # postgres, minio, qdrant
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

# Restore MinIO
restore_minio() {
    local backup_file="$1"
    log "Restoring MinIO from: $(basename "$backup_file")"
    warn "MinIO restore overwrites existing objects in the documents bucket"

    # Extract to temp dir, then copy into MinIO container
    local tmp_dir
    tmp_dir=$(mktemp -d)

    log "Extracting backup..."
    tar -xzf "$backup_file" -C "$tmp_dir"

    log "Copying to MinIO container..."
    docker cp "$tmp_dir/." "${COMPOSE_PROJECT}-minio-1:/restore_tmp/"
    docker exec "${COMPOSE_PROJECT}-minio-1" mc alias set local http://localhost:9000 "${MINIO_ROOT_USER:-arasul}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null || true
    docker exec "${COMPOSE_PROJECT}-minio-1" mc mirror /restore_tmp/ local/documents/ 2>/dev/null || true
    docker exec "${COMPOSE_PROJECT}-minio-1" rm -rf /restore_tmp

    rm -rf "$tmp_dir"
    log "MinIO restore complete"
}

# Restore Qdrant
restore_qdrant() {
    local backup_file="$1"
    log "Restoring Qdrant from: $(basename "$backup_file")"

    log "Stopping Qdrant..."
    docker compose stop qdrant 2>/dev/null || true

    log "Extracting snapshot..."
    local qdrant_data
    qdrant_data=$(docker inspect --format='{{range .Mounts}}{{if eq .Destination "/qdrant/storage"}}{{.Source}}{{end}}{{end}}' "${COMPOSE_PROJECT}-qdrant-1" 2>/dev/null)

    if [ -n "$qdrant_data" ]; then
        sudo tar -xzf "$backup_file" -C "$qdrant_data" 2>/dev/null
    else
        warn "Could not determine Qdrant data directory, trying default volume path"
        local tmp_dir
        tmp_dir=$(mktemp -d)
        tar -xzf "$backup_file" -C "$tmp_dir"
        docker cp "$tmp_dir/." "${COMPOSE_PROJECT}-qdrant-1:/qdrant/storage/"
        rm -rf "$tmp_dir"
    fi

    log "Starting Qdrant..."
    docker compose up -d qdrant 2>/dev/null
    log "Qdrant restore complete"
}

# Main
main() {
    local timestamp="latest"
    local restore_db=true
    local restore_minio_flag=true
    local restore_qdrant_flag=true

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --list)
                list_backups
                exit 0
                ;;
            --db-only)
                restore_minio_flag=false
                restore_qdrant_flag=false
                ;;
            --no-db)
                restore_db=false
                ;;
            --help|-h)
                echo "Usage: $0 [TIMESTAMP] [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --list         List available backups"
                echo "  --db-only      Restore only PostgreSQL"
                echo "  --no-db        Skip PostgreSQL restore"
                echo "  --help         Show this help"
                echo ""
                echo "Examples:"
                echo "  $0                        # Restore latest backup"
                echo "  $0 2026-03-14_02-00       # Restore specific backup"
                echo "  $0 --db-only              # Restore only database"
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
    if $restore_db; then
        local pg_backup
        pg_backup=$(find_backup "postgres" "$timestamp")
        if [ -n "$pg_backup" ]; then
            restore_postgres "$pg_backup"
        else
            warn "No PostgreSQL backup found for timestamp: $timestamp"
        fi
    fi

    # MinIO
    if $restore_minio_flag; then
        local minio_backup
        minio_backup=$(find_backup "minio" "$timestamp")
        if [ -n "$minio_backup" ]; then
            restore_minio "$minio_backup"
        else
            warn "No MinIO backup found for timestamp: $timestamp"
        fi
    fi

    # Qdrant
    if $restore_qdrant_flag; then
        local qdrant_backup
        qdrant_backup=$(find_backup "qdrant" "$timestamp")
        if [ -n "$qdrant_backup" ]; then
            restore_qdrant "$qdrant_backup"
        else
            warn "No Qdrant backup found for timestamp: $timestamp"
        fi
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
