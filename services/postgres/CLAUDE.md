# CLAUDE.md — services/postgres/

> PostgreSQL 16 (image), migrations, and the user-data DB seed script.
> The runtime client is `apps/dashboard-backend/src/database.js`; the
> migration runner is `apps/dashboard-backend/src/migrationRunner.js`.

## Layout

```
postgres/
  init/                          Mounted into postgres on first boot AND
                                 also mounted into dashboard-backend at
                                 /arasul/migrations for the runtime runner.
    000_schema_migrations.sql    Tracking table.
    001_init_schema.sql          ... up to ...
    0NN_*.sql                    Highest number on disk = latest migration;
                                 next = that + 1. Read it, never hardcode:
                                 `ls services/postgres/init/ | sort | tail -1`.
    032a_create_data_database.sh Shell variant — runs only on first init.
  init-data-db/                  Init scripts for the secondary user-data DB.
                                 Compose-mounted into postgres at
                                 /docker-entrypoint-initdb.d/data-db (ro).
  init-data-db.sh                One-shot bootstrap for the user-data DB.
  README.md                      Schema overview, retention, useful queries.
```

## Migration contract

1. **Filename**: `0XX_short_snake_case.sql` (or `0XXa_*.sh` for shell variants).
   Numbering is sequential — read the largest existing number under `init/`
   and add 1. The runner regex is `/^(\d+)[a-z]?_/`.
2. **Idempotent**: every statement guarded with `IF NOT EXISTS` /
   `IF EXISTS`, every `INSERT … ON CONFLICT DO NOTHING`, every
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Migrations may re-run on a
   half-initialized DB; they must never error.
3. **Transaction**: the runner wraps each migration in its own transaction.
   Don't `BEGIN`/`COMMIT` inside the file. Don't `CREATE INDEX CONCURRENTLY`
   inside a transaction (postgres rejects it) — use a normal `CREATE INDEX`
   or split the index into a follow-up off-line task.
4. **Tracking**: applied versions are recorded in `schema_migrations`
   (version, filename, sha256 checksum, execution_ms, success). The runner
   skips already-applied versions and seeds the table on first contact with
   an existing live DB.
5. **Both paths**: `init/` is the source of truth for both
   - `postgres-db` first-boot init (Docker entrypoint runs files alphabetically), and
   - `dashboard-backend` runtime migration runner (applied per checksum on backend boot).
     So the migration must work in either order.

## Writing a new migration

```bash
# 1. Find the next number
ls services/postgres/init/ | grep -E '^[0-9]+' | sort | tail -3

# 2. Create the file (0NN = next number from step 1)
$EDITOR services/postgres/init/0NN_add_foo_table.sql
```

```sql
-- 0NN_add_foo_table.sql — Phase X: <reason>

CREATE TABLE IF NOT EXISTS foo (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foo_user_id ON foo(user_id);
```

```bash
# 3. Apply locally (rebuild backend so the runner picks it up)
docker compose up -d --build dashboard-backend
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT version, filename FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

A `/create-migration` slash command is planned (Stage 5+); until then,
follow the recipe above.

## Forbidden

- ❌ Editing an already-applied migration file. Checksums diverge → the
  runner errors. Add a follow-up `0YY_*.sql` instead.
- ❌ Renumbering or deleting existing files.
- ❌ `DROP TABLE … CASCADE` without an explicit `IF EXISTS` guard plus a
  rationale comment at the top of the file.
- ❌ Runtime `CREATE TABLE` inside service code — schema lives here.
- ❌ Storing the `schema_migrations` row by hand. The runner does that.

## Schema docs

Update `docs/api/DATABASE_SCHEMA.md` whenever a migration adds/changes a
table or a column that clients see. The README in this folder is a coarse
overview of the older schema and is not auto-generated — keep it
representative, not exhaustive.

## Backup / restore

```bash
docker exec postgres-db pg_dump -U arasul arasul_db > backup.sql
docker exec -i postgres-db psql -U arasul arasul_db < backup.sql
```

A scheduled `services/backup-service/` runs `pg_dump` + a restore-drill — see
`docs/ops/BACKUP_SYSTEM.md` and `docs/ops/DISASTER_RECOVERY.md`.
