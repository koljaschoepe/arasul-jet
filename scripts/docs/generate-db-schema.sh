#!/bin/bash
# =============================================================================
# Arasul Platform — Generate docs/DATABASE_SCHEMA.md from live Postgres
#
# Dumps the current schema (no data), picks out tables + columns + primary
# keys + foreign keys + indexes, and renders them to Markdown. The point is
# not a perfect ERD — it's a human-readable index that stays in sync with
# reality. Run after adding a migration.
#
# Usage:
#   scripts/docs/generate-db-schema.sh           # writes docs/DATABASE_SCHEMA.md
#   scripts/docs/generate-db-schema.sh --check   # non-zero if file is stale
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_FILE="${PROJECT_DIR}/docs/DATABASE_SCHEMA.md"
TMP_FILE="$(mktemp)"
CHECK_MODE=false

for arg in "$@"; do
    case "$arg" in
        --check) CHECK_MODE=true ;;
        --out) shift; OUT_FILE="$1" ;;
        -h|--help) sed -n '1,20p' "$0"; exit 0 ;;
    esac
done

cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

CONTAINER="${POSTGRES_CONTAINER:-postgres-db}"
DB="${POSTGRES_DB:-arasul_db}"
USER="${POSTGRES_USER:-arasul}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "ERROR: container '$CONTAINER' not running" >&2
    exit 1
fi

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# SQL that pulls everything we need in one sweep. Table list first, then per
# table: columns, PKs, FKs, indexes. The backend/frontend doc is German;
# keep comments German for consistency.
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -P pager=off -At -F '|' <<'SQL' > "$TMP_FILE"
SELECT 'T|' || table_name || '|' || COALESCE(obj_description(c.oid, 'pg_class'), '')
  FROM information_schema.tables t
  JOIN pg_class c ON c.relname = t.table_name
 WHERE t.table_schema = 'public'
   AND t.table_type = 'BASE TABLE'
 ORDER BY t.table_name;

SELECT 'C|' || c.table_name || '|' || c.column_name || '|' || c.data_type || '|' ||
       (CASE WHEN c.is_nullable = 'NO' THEN 'NOT NULL' ELSE '' END) || '|' ||
       COALESCE(c.column_default, '')
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
 ORDER BY c.table_name, c.ordinal_position;

SELECT 'P|' || tc.table_name || '|' || kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
 WHERE tc.constraint_type = 'PRIMARY KEY'
   AND tc.table_schema = 'public'
 ORDER BY tc.table_name, kcu.ordinal_position;

SELECT 'F|' || tc.table_name || '|' || kcu.column_name || '|' ||
       ccu.table_name || '|' || ccu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
 WHERE tc.constraint_type = 'FOREIGN KEY'
   AND tc.table_schema = 'public';

SELECT 'I|' || tablename || '|' || indexname || '|' || indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;
SQL

python3 - "$TMP_FILE" "$timestamp" "$OUT_FILE" <<'PY'
import sys, collections, os

tmp_file, timestamp, out_file = sys.argv[1:4]

tables = {}        # name -> comment
columns = collections.defaultdict(list)  # table -> [(col, type, null, default)]
pks = collections.defaultdict(list)      # table -> [col, col, ...]
fks = collections.defaultdict(list)      # table -> [(col, ref_table, ref_col)]
indexes = collections.defaultdict(list)  # table -> [(name, def)]

with open(tmp_file, encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        kind, _, rest = line.partition('|')
        if kind == 'T':
            parts = rest.split('|', 1)
            tables[parts[0]] = parts[1] if len(parts) > 1 else ''
        elif kind == 'C':
            parts = rest.split('|', 4)
            if len(parts) != 5:
                continue
            tbl, col, typ, nullflag, default = parts
            columns[tbl].append((col, typ, nullflag, default))
        elif kind == 'P':
            parts = rest.split('|', 1)
            if len(parts) != 2:
                continue
            pks[parts[0]].append(parts[1])
        elif kind == 'F':
            parts = rest.split('|', 3)
            if len(parts) != 4:
                continue
            tbl, col, rtbl, rcol = parts
            fks[tbl].append((col, rtbl, rcol))
        elif kind == 'I':
            parts = rest.split('|', 2)
            if len(parts) != 3:
                continue
            tbl, iname, idef = parts
            indexes[tbl].append((iname, idef))

lines = []
lines.append('# Arasul Platform — Database Schema')
lines.append('')
lines.append('> **Auto-generated**. Do not edit by hand.')
lines.append(f'> Run `scripts/docs/generate-db-schema.sh` to regenerate. Last sync: `{timestamp}`')
lines.append('')
lines.append(f'## Übersicht')
lines.append('')
lines.append(f'- Tabellen: **{len(tables)}**')
total_cols = sum(len(v) for v in columns.values())
total_fks = sum(len(v) for v in fks.values())
total_idx = sum(len(v) for v in indexes.values())
lines.append(f'- Spalten gesamt: **{total_cols}**')
lines.append(f'- Foreign Keys: **{total_fks}**')
lines.append(f'- Indexes: **{total_idx}**')
lines.append('')
lines.append('---')
lines.append('')

for tbl in sorted(tables):
    comment = tables[tbl].strip()
    lines.append(f'## `{tbl}`')
    if comment:
        lines.append('')
        lines.append(f'> {comment}')
    lines.append('')

    cols = columns.get(tbl, [])
    if cols:
        lines.append('| Column | Type | Nullable | Default |')
        lines.append('|---|---|---|---|')
        for col, typ, nullflag, default in cols:
            nn = '⛔' if nullflag == 'NOT NULL' else '✅'
            default_display = default if default else ''
            if len(default_display) > 40:
                default_display = default_display[:37] + '...'
            lines.append(f'| `{col}` | {typ} | {nn} | `{default_display}` |' if default_display
                         else f'| `{col}` | {typ} | {nn} |  |')
        lines.append('')

    if pks.get(tbl):
        lines.append(f'**Primary key:** `{", ".join(pks[tbl])}`')
        lines.append('')

    if fks.get(tbl):
        lines.append('**Foreign Keys:**')
        lines.append('')
        for col, rtbl, rcol in fks[tbl]:
            lines.append(f'- `{col}` → `{rtbl}.{rcol}`')
        lines.append('')

    if indexes.get(tbl):
        lines.append('**Indexes:**')
        lines.append('')
        for iname, idef in indexes[tbl]:
            lines.append(f'- `{iname}` — `{idef}`')
        lines.append('')

    lines.append('---')
    lines.append('')

content = '\n'.join(lines)

# Strip trailing whitespace per line to keep diffs clean
content = '\n'.join(l.rstrip() for l in content.splitlines()) + '\n'

os.makedirs(os.path.dirname(out_file), exist_ok=True)
with open(out_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Wrote {out_file} ({len(tables)} tables, {total_cols} columns, {total_fks} FKs, {total_idx} indexes)")
PY

if [[ "$CHECK_MODE" == "true" ]]; then
    # If generated doc differs from committed version, exit non-zero so CI can fail.
    if ! git diff --quiet -- "$OUT_FILE"; then
        echo "ERROR: $OUT_FILE is stale. Regenerate with scripts/docs/generate-db-schema.sh" >&2
        exit 1
    fi
fi
