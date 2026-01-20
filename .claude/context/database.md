# Database Context - PostgreSQL 16

## Entry Point
- **Migrations**: `services/postgres/init/*.sql` (25 files)
- **Connection**: `services/dashboard-backend/src/database.js`

## Migration Files

### Core Schema (001-009)
| File | Tables |
|------|--------|
| 001_init_schema.sql | metrics, metric_history |
| 002_auth_schema.sql | users, sessions |
| 003_self_healing_schema.sql | self_healing_events |
| 004_update_schema.sql | update_packages, update_history |
| 005_chat_schema.sql | conversations, messages |
| 006_llm_jobs_schema.sql | llm_jobs |
| 007_add_sources_to_messages.sql | (alter messages) |
| 008_llm_queue_schema.sql | llm_queue |
| 009_documents_schema.sql | documents, document_chunks |

### Features (010-014)
| File | Tables |
|------|--------|
| 010_alert_config_schema.sql | alert_config, alert_thresholds |
| 010_llm_models_schema.sql | llm_models |
| 010_performance_indexes.sql | (indexes) |
| 011_appstore_schema.sql | apps, app_categories |
| 012_convert_system_apps.sql | (data migration) |
| 013_claude_workspaces_schema.sql | claude_workspaces |
| 014_knowledge_spaces_schema.sql | knowledge_spaces |

### Integration (015-025)
| File | Tables |
|------|--------|
| 015_audit_log_schema.sql | audit_logs |
| 015_claude_terminal_schema.sql | claude_terminal_sessions |
| 015_notification_events_schema.sql | notification_events |
| 015_telegram_*.sql | telegram_config, telegram_security |
| 016_api_audit_logs_schema.sql | api_audit_logs |
| 025_telegram_notification_system.sql | telegram_notifications |

## Key Tables

### Auth
```sql
users (id, username, password_hash, created_at)
sessions (id, user_id, token, expires_at)
```

### Chat
```sql
conversations (id, user_id, title, created_at, updated_at)
messages (id, conversation_id, role, content, sources, created_at)
```

### Documents
```sql
documents (id, filename, filepath, status, created_at)
document_chunks (id, document_id, chunk_text, chunk_index, vector_id)
```

### Alerts
```sql
alert_config (id, metric_type, threshold, enabled)
notification_events (id, event_type, payload, created_at)
```

## Migration Pattern
```sql
-- Always use IF NOT EXISTS for idempotency
CREATE TABLE IF NOT EXISTS new_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Always create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_new_table_name ON new_table(name);
CREATE INDEX IF NOT EXISTS idx_new_table_status ON new_table(status);
CREATE INDEX IF NOT EXISTS idx_new_table_created_at ON new_table(created_at);
```

## Next Migration Number
- **Use**: `026_*.sql` (all numbers up to 025 are taken)

## Database Access
```bash
# Shell access
docker exec -it postgres-db psql -U arasul -d arasul_db

# Check connections
SELECT count(*) FROM pg_stat_activity;

# List tables
\dt

# Describe table
\d+ table_name
```

## Query Pattern (from backend)
```javascript
const db = require('../database');

// Single query
const result = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Transaction
const client = await db.pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO ...', [...]);
  await client.query('UPDATE ...', [...]);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## Rebuild Database
```bash
# Warning: Destroys all data!
docker compose down -v postgres-db
docker compose up -d postgres-db
```
