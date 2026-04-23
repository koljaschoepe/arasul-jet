#!/usr/bin/env bash
#
# dr-drill-ci.sh
#
# CI-safe disaster-recovery drill. Does NOT touch a live stack. Instead:
#
#   1. Spin up an ephemeral postgres:16 container.
#   2. Apply every migration in services/postgres/init/ in order.
#   3. Insert a canary row the drill can later verify.
#   4. Run `pg_dump` against that container.
#   5. Spin up a second ephemeral postgres:16.
#   6. Replay the dump.
#   7. Verify table count and canary row both match.
#
# This gives us nightly confidence that:
#   - Migrations apply cleanly from scratch (no ordering/drift bugs).
#   - The backup format (pg_dump plain SQL) round-trips without loss.
#
# Exit 0 on success, non-zero on any mismatch.
#
# Usage:   ./scripts/test/dr-drill-ci.sh
#          ./scripts/test/dr-drill-ci.sh --keep    (leave containers up for poking)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT/services/postgres/init"
KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true

PG_IMAGE="postgres:16-alpine"
NET="drdrill-$$"
SRC="drdrill-src-$$"
DST="drdrill-dst-$$"

log() { echo "[dr-drill-ci] $*"; }
fail() { echo "[dr-drill-ci] FAIL: $*" >&2; exit 1; }

cleanup() {
  if $KEEP; then
    log "KEEP mode — leaving containers $SRC, $DST and network $NET"
    return
  fi
  docker rm -f "$SRC" "$DST" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Starting DR drill (source+dest Postgres, migrations + pg_dump roundtrip)"

docker network create "$NET" >/dev/null

start_pg() {
  local name=$1
  docker run -d --rm \
    --name "$name" \
    --network "$NET" \
    -e POSTGRES_DB=arasul_db \
    -e POSTGRES_USER=arasul \
    -e POSTGRES_PASSWORD=drill \
    "$PG_IMAGE" >/dev/null
}

wait_ready() {
  local name=$1
  for _ in $(seq 1 60); do
    if docker exec "$name" pg_isready -U arasul -d arasul_db >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Postgres $name never became ready"
}

log "Step 1: Start source Postgres"
start_pg "$SRC"
wait_ready "$SRC"

log "Step 2: Apply migrations from $MIGRATIONS_DIR"
shopt -s nullglob
MIGRATIONS=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob
if [ ${#MIGRATIONS[@]} -eq 0 ]; then
  fail "No migrations found in $MIGRATIONS_DIR"
fi
log "  Applying ${#MIGRATIONS[@]} migration files"

for mig in "${MIGRATIONS[@]}"; do
  base=$(basename "$mig")
  if ! docker exec -i "$SRC" psql -v ON_ERROR_STOP=1 -U arasul -d arasul_db < "$mig" >/dev/null 2>&1; then
    fail "Migration failed: $base"
  fi
done
log "  All migrations applied"

log "Step 3: Insert canary row"
CANARY="dr-drill-canary-$(date +%s)"
docker exec "$SRC" psql -v ON_ERROR_STOP=1 -U arasul -d arasul_db -c \
  "CREATE TABLE IF NOT EXISTS dr_canary (tag TEXT PRIMARY KEY, ts TIMESTAMPTZ DEFAULT NOW());" \
  >/dev/null
docker exec "$SRC" psql -v ON_ERROR_STOP=1 -U arasul -d arasul_db -c \
  "INSERT INTO dr_canary (tag) VALUES ('$CANARY');" >/dev/null

SRC_TABLES=$(docker exec "$SRC" psql -U arasul -d arasul_db -At -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
log "  Source table count: $SRC_TABLES"

log "Step 4: pg_dump"
DUMP=$(mktemp)
docker exec "$SRC" pg_dump -U arasul -d arasul_db --clean --if-exists --no-owner --no-privileges \
  > "$DUMP" 2>/dev/null
DUMP_SIZE=$(wc -c < "$DUMP")
log "  Dump size: $DUMP_SIZE bytes"
if [ "$DUMP_SIZE" -lt 1024 ]; then
  fail "Dump suspiciously small ($DUMP_SIZE bytes)"
fi

log "Step 5: Start destination Postgres"
start_pg "$DST"
wait_ready "$DST"

log "Step 6: Replay dump into destination"
if ! docker exec -i "$DST" psql -v ON_ERROR_STOP=1 -U arasul -d arasul_db < "$DUMP" >/dev/null 2>&1; then
  fail "Dump replay failed"
fi
rm -f "$DUMP"

log "Step 7: Verify destination"
DST_TABLES=$(docker exec "$DST" psql -U arasul -d arasul_db -At -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
log "  Destination table count: $DST_TABLES"
if [ "$DST_TABLES" != "$SRC_TABLES" ]; then
  fail "Table count mismatch: source=$SRC_TABLES, dest=$DST_TABLES"
fi

DST_CANARY=$(docker exec "$DST" psql -U arasul -d arasul_db -At -c \
  "SELECT tag FROM dr_canary WHERE tag = '$CANARY';")
if [ "$DST_CANARY" != "$CANARY" ]; then
  fail "Canary row missing in destination (expected '$CANARY', got '$DST_CANARY')"
fi
log "  Canary row round-tripped: $DST_CANARY"

log "DR drill PASSED: $SRC_TABLES tables restored, canary verified"
exit 0
