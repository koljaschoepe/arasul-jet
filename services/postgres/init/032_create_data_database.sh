#!/bin/bash
# Create the arasul_data_db database and run its init scripts
# This script runs AFTER all SQL migrations for the main database

set -e

# Variables from environment (set in docker-compose)
DATA_DB_NAME="${ARASUL_DATA_DB_NAME:-arasul_data_db}"
DATA_DB_USER="${ARASUL_DATA_DB_USER:-arasul_data}"
DATA_DB_PASSWORD="${ARASUL_DATA_DB_PASSWORD:-$POSTGRES_PASSWORD}"

echo "=== Creating Datentabellen Database ==="
echo "Database: $DATA_DB_NAME"
echo "User: $DATA_DB_USER"

# Create user if not exists
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DATA_DB_USER') THEN
            CREATE ROLE $DATA_DB_USER WITH LOGIN PASSWORD '$DATA_DB_PASSWORD';
        END IF;
    END
    \$\$;
EOSQL

echo "User $DATA_DB_USER created/verified"

# Check if database exists
DB_EXISTS=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='$DATA_DB_NAME'" || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database: $DATA_DB_NAME"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE $DATA_DB_NAME OWNER $DATA_DB_USER;"

    # Grant all privileges
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $DATA_DB_NAME TO $DATA_DB_USER;"

    echo "Database $DATA_DB_NAME created"

    # Run init scripts for data database
    DATA_INIT_DIR="/docker-entrypoint-initdb.d/data-db"
    if [ -d "$DATA_INIT_DIR" ]; then
        echo "Running init scripts from $DATA_INIT_DIR..."
        for f in "$DATA_INIT_DIR"/*.sql; do
            if [ -f "$f" ]; then
                echo "  Executing: $(basename "$f")"
                psql -v ON_ERROR_STOP=1 --username "$DATA_DB_USER" --dbname "$DATA_DB_NAME" -f "$f"
            fi
        done
    else
        echo "No init scripts found in $DATA_INIT_DIR"
    fi
else
    echo "Database $DATA_DB_NAME already exists, skipping creation"
fi

echo "=== Datentabellen Database setup complete ==="
