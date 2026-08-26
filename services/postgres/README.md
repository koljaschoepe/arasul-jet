# PostgreSQL Database

Central database for the Arasul Platform.

## Overview

| Property  | Value            |
| --------- | ---------------- |
| Port      | 5432 (internal)  |
| Version   | PostgreSQL 15+   |
| Database  | arasul_db        |
| User      | arasul           |
| Retention | 7 days (metrics) |

## Directory Structure

```
postgres/
└── init/
    ├── 001_init_schema.sql       # Metrics tables
    ├── 002_auth_schema.sql       # Authentication
    ├── 003_self_healing_schema.sql # Self-healing events
    ├── 004_update_schema.sql     # Update tracking
    ├── 005_chat_schema.sql       # Chat conversations
    ├── 006_llm_jobs_schema.sql   # LLM job queue
    ├── 007_add_sources_to_messages.sql # RAG sources
    └── 008_llm_queue_schema.sql  # Queue optimization
```

Migration 009 added the document/chunk tables; they were removed again by
migration 163 (Phase B4, 26.08.2026), see below.

## Schema Overview

### Metrics (001)

```sql
metrics_cpu (timestamp, value)
metrics_ram (timestamp, value)
metrics_gpu (timestamp, value)
metrics_temperature (timestamp, value)
metrics_disk (timestamp, used, free, percent)
```

7-day retention with auto-cleanup.

### Authentication (002)

```sql
admin_users (
  id, username, password_hash, email,
  created_at, updated_at, last_login,
  login_attempts, locked_until, is_active
)

token_blacklist (id, token_jti, user_id, blacklisted_at, expires_at)

login_attempts (id, username, ip_address, success, attempted_at, user_agent)

active_sessions (
  id, user_id, token_jti, ip_address,
  user_agent, created_at, expires_at, last_activity
)

password_history (id, user_id, password_hash, changed_at, changed_by, ip_address)
```

### Self-Healing (003)

```sql
self_healing_events (
  id, event_type, severity, description,
  action_taken, timestamp
)
```

### Updates (004)

```sql
update_events (
  id, version_from, version_to, status, source,
  components_updated, error_message,
  started_at, completed_at, duration_seconds,
  requires_reboot, initiated_by
)

update_backups (id, backup_path, update_event_id, created_at, ...)

update_files (id, filename, file_path, checksum_sha256, ...)

update_rollbacks (id, original_update_event_id, backup_id, ...)

component_updates (id, update_event_id, component_name, ...)
```

### LLM Jobs (006, 008, 165)

```sql
llm_jobs (
  id, user_id, job_type, status, request_data,
  content, thinking, error_message, queue_position,
  priority, requested_model, created_at, completed_at
)
```

Die Chat-Tabellen (005) sind mit Phase B6 (26.08.2026, Migration 165) weg;
ein Auftrag trägt seinen Besitzer selbst und lebt eine Stunde nach dem Ende.

## Data Retention

| Table               | Retention        |
| ------------------- | ---------------- |
| metrics\_\*         | 7 days           |
| self_healing_events | 7 days           |
| llm_jobs            | 1 hour after end |
| update_events       | Permanent        |
| admin_users         | Permanent        |

## Connection Configuration

```
POSTGRES_HOST=postgres-db
POSTGRES_PORT=5432
POSTGRES_USER=arasul
POSTGRES_PASSWORD=<from .env>
POSTGRES_DB=arasul_db
POSTGRES_MAX_CONNECTIONS=100
```

### Connection Pooling (Services)

Services use connection pooling:

```
MIN_CONNECTIONS=2
MAX_CONNECTIONS=20
IDLE_TIMEOUT=30s
```

## Migrations

Migrations run automatically on container start via `init/` directory.

Files are executed in alphabetical order (001*, 002*, etc.).

### Adding New Migrations

1. Create file: `init/0XX_description.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Rebuild container: `docker compose up -d --build postgres-db`

## Backup

```bash
# Manual backup
docker exec postgres-db pg_dump -U arasul arasul_db > backup.sql

# Restore
docker exec -i postgres-db psql -U arasul arasul_db < backup.sql
```

## Useful Queries

```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('arasul_db'));

-- Table sizes
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::text) DESC;

-- Recent self-healing events
SELECT * FROM self_healing_events
ORDER BY timestamp DESC
LIMIT 20;

-- Offene Auftraege an das Sprachmodell
SELECT status, COUNT(*) FROM llm_jobs GROUP BY status;

-- Connection count
SELECT count(*) FROM pg_stat_activity;
```

## Health Check

```bash
docker exec postgres-db pg_isready -U arasul
```

Returns exit code 0 if database is accepting connections.

## Related Documentation

- [DATABASE_SCHEMA.md](../../docs/api/DATABASE_SCHEMA.md) - Full schema documentation
- [Dashboard Backend](../../apps/dashboard-backend/README.md) - Database client
