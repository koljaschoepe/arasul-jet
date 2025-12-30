# PostgreSQL Database

Central database for the Arasul Platform.

## Overview

| Property | Value |
|----------|-------|
| Port | 5432 (internal) |
| Version | PostgreSQL 15+ |
| Database | arasul_db |
| User | arasul |
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
    ├── 008_llm_queue_schema.sql  # Queue optimization
    └── 009_documents_schema.sql  # Document metadata
```

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

workflow_activity (
  id, workflow_name, status, timestamp,
  duration_ms, error
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

### Chat (005)

```sql
chat_conversations (
  id, title, created_at, updated_at,
  deleted_at, message_count
)

chat_messages (
  id, conversation_id, role, content,
  thinking, sources, created_at
)
```

Includes triggers for auto-updating `message_count`.

### LLM Jobs (006, 008)

```sql
llm_jobs (
  id, conversation_id, status, prompt,
  response, error, created_at, updated_at
)

llm_queue (
  id, job_id, priority, created_at, started_at
)
```

### Documents (009)

```sql
documents (
  id, filename, original_name, mime_type,
  size_bytes, minio_path, status,
  chunk_count, error_message,
  created_at, updated_at, indexed_at
)

document_chunks (
  id, document_id, chunk_index, content,
  embedding_id, created_at
)
```

## Data Retention

| Table | Retention |
|-------|-----------|
| metrics_* | 7 days |
| self_healing_events | 7 days |
| workflow_activity | 7 days |
| chat_conversations | Soft delete (30 days) |
| update_events | Permanent |
| admin_users | Permanent |

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

Files are executed in alphabetical order (001_, 002_, etc.).

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

-- Chat statistics
SELECT COUNT(*) as chats,
       SUM(message_count) as messages
FROM chat_conversations
WHERE deleted_at IS NULL;

-- Connection count
SELECT count(*) FROM pg_stat_activity;
```

## Health Check

```bash
docker exec postgres-db pg_isready -U arasul
```

Returns exit code 0 if database is accepting connections.

## Related Documentation

- [DATABASE_SCHEMA.md](../../docs/DATABASE_SCHEMA.md) - Full schema documentation
- [Dashboard Backend](../dashboard-backend/README.md) - Database client
