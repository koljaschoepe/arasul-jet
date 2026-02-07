#!/bin/bash
# Initialize the arasul_data_db database
# This script should be run after PostgreSQL is ready

set -e

POSTGRES_HOST="${POSTGRES_HOST:-postgres-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-arasul}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB:-arasul_db}"

DATA_DB_NAME="${ARASUL_DATA_DB_NAME:-arasul_data_db}"
DATA_DB_USER="${ARASUL_DATA_DB_USER:-arasul_data}"
DATA_DB_PASSWORD="${ARASUL_DATA_DB_PASSWORD:-${POSTGRES_PASSWORD}}"

echo "=== Initializing Datentabellen Database ==="
echo "Host: $POSTGRES_HOST:$POSTGRES_PORT"
echo "Data DB: $DATA_DB_NAME"

# Wait for PostgreSQL to be ready
until PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

echo "PostgreSQL is ready"

# Check if data database exists
DB_EXISTS=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='$DATA_DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database: $DATA_DB_NAME"

    # Create user if not exists
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DATA_DB_USER') THEN
        CREATE ROLE $DATA_DB_USER WITH LOGIN PASSWORD '$DATA_DB_PASSWORD';
    END IF;
END
\$\$;
EOF

    # Create database
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE $DATA_DB_NAME OWNER $DATA_DB_USER;"

    echo "Database $DATA_DB_NAME created"
else
    echo "Database $DATA_DB_NAME already exists"
fi

# Run init scripts
SCRIPT_DIR="$(dirname "$0")/init-data-db"
if [ -d "$SCRIPT_DIR" ]; then
    echo "Running init scripts from $SCRIPT_DIR..."
    for f in "$SCRIPT_DIR"/*.sql; do
        if [ -f "$f" ] && [ "$(basename "$f")" != "000_create_database.sql" ]; then
            echo "Running: $(basename "$f")"
            PGPASSWORD="$DATA_DB_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$DATA_DB_USER" -d "$DATA_DB_NAME" -f "$f"
        fi
    done
fi

echo "=== Datentabellen Database initialization complete ==="
