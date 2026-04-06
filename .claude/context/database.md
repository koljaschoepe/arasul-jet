# Database Context - PostgreSQL 16

## Overview

- **Location**: `services/postgres/init/*.sql` (executed alphabetically on first DB start)
- **Connection**: `apps/dashboard-backend/src/database.js`
- **Migrations**: 59 files (000-058), **next available: `059_*.sql`**
- **Two databases**: `arasul_db` (main) and `arasul_data_db` (user data tables / Datentabellen)

## Tables by Domain

### Auth (002)

| Table            | Key Columns                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| admin_users      | id, username, password_hash, email, is_active, locked_until, login_attempts |
| active_sessions  | id, user_id, token_jti, ip_address, expires_at, last_activity               |
| token_blacklist  | id, token_jti, user_id, expires_at                                          |
| login_attempts   | id, username, ip_address, success, attempted_at                             |
| password_history | id, user_id, password_hash, changed_at, ip_address                          |

### Chat (005, 006, 008, 041, 042, 046)

| Table              | Key Columns                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| chat_conversations | id, title, project_id, message_count, deleted_at, compaction_summary                                             |
| chat_messages      | id, conversation_id, role, content, thinking, sources, job_id, status                                            |
| llm_jobs           | id (UUID), conversation_id, job_type, status, content, thinking, sources, request_data, queue_position, priority |

### Projects (042, 041)

| Table          | Key Columns                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| projects       | id (UUID), name, description, system_prompt, knowledge_space_id, icon, color            |
| ai_memories    | id (UUID), type (fact/decision/preference), content, importance, is_active              |
| compaction_log | id, conversation_id, messages_compacted, tokens_before, tokens_after, compression_ratio |

### Documents (009, 016, 039, 052)

| Table                     | Key Columns                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| documents                 | id (UUID), filename, file_path, content_hash, status (enum), space_id, summary, chunk_count |
| document_chunks           | id (UUID), document_id, chunk_index, chunk_text, parent_chunk_id                            |
| document_parent_chunks    | id (UUID), document_id, parent_index, chunk_text, token_count                               |
| document_categories       | id, name, color, icon, is_system                                                            |
| document_similarities     | id, document_id_1, document_id_2, similarity_score                                          |
| document_processing_queue | id, document_id, task_type, priority, status                                                |
| document_access_log       | id, document_id, access_type, query_text                                                    |

### RAG / Knowledge (016, 044)

| Table               | Key Columns                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| knowledge_spaces    | id (UUID), name, slug, description, auto_summary, auto_topics, document_count, is_default |
| company_context     | id=1 (singleton), content (Markdown), updated_at                                          |
| kg_entities         | id, name, entity_type, properties (JSONB), mention_count                                  |
| kg_entity_documents | entity_id, document_id, mention_count (composite PK)                                      |
| kg_relations        | id, source_entity_id, target_entity_id, relation_type, weight                             |

### Telegram (020, 032, 033, 034, 047)

| Table                 | Key Columns                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| telegram_config       | id=1 (singleton), bot_token_encrypted, chat_id, enabled, alert_thresholds   |
| telegram_bots         | id, user_id, name, bot_token_encrypted, system_prompt, llm_model, is_active |
| telegram_bot_commands | id, bot_id, command, description, prompt, usage_count                       |
| telegram_bot_chats    | id, bot_id, chat_id, chat_type, is_active                                   |
| telegram_bot_sessions | id, bot_id, chat_id, messages (JSONB), token_count                          |

### Models (011, 029, 030, 035)

| Table                     | Key Columns                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| llm_model_catalog         | id (e.g. 'qwen3:14b-q8'), name, size_bytes, ram_required_gb, category, capabilities, context_window      |
| llm_installed_models      | id, status, download_progress, is_default                                                                |
| llm_model_switches        | id, from_model, to_model, switched_at                                                                    |
| model_performance_metrics | id, model_id, tokens_generated, total_duration_ms, tokens_per_second (generated), time_to_first_token_ms |

### Apps (013, 014)

| Table              | Key Columns                                                |
| ------------------ | ---------------------------------------------------------- |
| app_installations  | id (UUID), app_id, status (enum), app_type, container_name |
| app_configurations | id, app_id, config_key, config_value                       |

### Alerts (010)

| Table             | Key Columns                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| alert_thresholds  | id, metric_type (enum), warning_threshold, critical_threshold, cooldown_seconds |
| alert_history     | id, metric_type, severity, current_value, threshold_value, acknowledged         |
| alert_settings    | id=1 (singleton), alerts_enabled, webhook_url, webhook_enabled                  |
| alert_quiet_hours | id, day_of_week, start_time, end_time, enabled                                  |
| alert_last_fired  | metric_type (PK), severity, fired_at                                            |

### System Metrics (001)

| Table               | Key Columns                                                         |
| ------------------- | ------------------------------------------------------------------- |
| metrics_cpu         | timestamp (PK), value (0-100)                                       |
| metrics_ram         | timestamp (PK), value (0-100)                                       |
| metrics_gpu         | timestamp (PK), value (0-100)                                       |
| metrics_temperature | timestamp (PK), value (0-150)                                       |
| metrics_disk        | timestamp (PK), used, free, percent                                 |
| system_snapshots    | id, timestamp, status, cpu, ram, gpu, temperature, services (JSONB) |
| workflow_activity   | id, workflow_name, status, duration_ms                              |

### Self-Healing (001, 003)

| Table               | Key Columns                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| self_healing_events | id, event_type, severity, description, action_taken, service_name, success |
| service_failures    | id, service_name, failure_type, recovery_action, recovery_success          |
| recovery_actions    | id, action_type, service_name, reason, success, duration_ms                |
| reboot_events       | id, reason, pre_reboot_state (JSONB), reboot_completed                     |
| service_restarts    | id, service_name, reason, initiated_by, success                            |

### Audit (017, 021)

| Table          | Key Columns                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------- |
| api_audit_logs | id, timestamp, user_id, action_type, target_endpoint, response_status, duration_ms, ip_address |
| bot_audit_log  | id, timestamp, user_id (telegram), chat_id, command, message_text, response_time_ms            |

### Settings (031, 038)

| Table                | Key Columns                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| system_settings      | id=1 (singleton), setup_completed, company_name, hostname, selected_model, ai_profile_yaml |
| datentabellen_config | id, data_db_host, data_db_name, data_db_user, is_enabled                                   |

## Singleton Tables

These tables enforce a single row via `CHECK (id = 1)`:

- **telegram_config** -- Legacy notification bot config
- **alert_settings** -- Global alert enable/disable + webhook
- **system_settings** -- Setup wizard state, company name, AI profile
- **company_context** -- Global company context for RAG queries

## Key SQL Patterns

### Idempotent DDL

```sql
CREATE TABLE IF NOT EXISTS new_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON table(column);
ALTER TABLE t ADD COLUMN IF NOT EXISTS col TYPE DEFAULT val;
INSERT INTO ... ON CONFLICT (key) DO NOTHING;
```

### Soft Deletes

`documents`, `chat_conversations` use `deleted_at TIMESTAMPTZ` columns. Filter with `WHERE deleted_at IS NULL`.

### JSONB for Flexible Data

Used extensively: `llm_jobs.request_data`, `self_healing_events.metadata`, `telegram_bot_sessions.messages`, `kg_entities.properties`, `knowledge_spaces.auto_topics`.

### Enums

Created with `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$;`

- `document_status`: pending, processing, indexed, failed, deleted
- `app_status`: available, installing, installed, running, stopping, etc.
- `alert_metric_type`: cpu, ram, disk, temperature
- `alert_severity`: warning, critical

## Key Functions

| Function                      | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `run_all_cleanups()`          | Master cleanup -- calls all per-table cleanup functions, returns JSONB results |
| `is_user_locked(username)`    | Check if account is locked from failed logins                                  |
| `record_login_attempt()`      | Record login + auto-lock after 5 failures (15 min)                             |
| `get_next_queue_position()`   | Next position in LLM job queue                                                 |
| `is_setup_completed()`        | Check if setup wizard has been completed                                       |
| `cleanup_old_metrics()`       | Delete metrics older than 7 days                                               |
| `cleanup_expired_auth_data()` | Clear expired tokens, sessions, old login attempts                             |
| `get_document_statistics()`   | Aggregate document counts by status and category                               |
| `find_similar_documents()`    | Find documents by pre-computed similarity scores                               |
| `update_space_statistics()`   | Recalculate knowledge space document/chunk counts                              |
| `is_in_quiet_hours()`         | Check if current time is in alert quiet hours                                  |
| `can_fire_alert(type)`        | Rate-limit check for alert cooldown                                            |

## Retention Policies

All enforced by `run_all_cleanups()`:

| Data                            | Retention        |
| ------------------------------- | ---------------- |
| Metrics (CPU/RAM/GPU/Disk/Temp) | 7 days           |
| System snapshots                | 7 days           |
| Workflow activity               | 7 days           |
| Login attempts                  | 7 days           |
| Self-healing events             | 30 days          |
| Service restarts                | 30 days          |
| Document access logs            | 30 days          |
| Soft-deleted chats              | 30 days          |
| Compaction logs                 | 30 days          |
| App store events                | 30 days          |
| Notification events             | 30 days          |
| Bot audit logs                  | 90 days          |
| Update files                    | 90 days          |
| Update events                   | 180 days         |
| LLM jobs (completed)            | 1 hour           |
| Alert history                   | max 1000 entries |

## Migration Template

```sql
-- Migration 053: [Feature Name]
-- [Brief description]

BEGIN;

-- Use IF NOT EXISTS for all CREATE statements
CREATE TABLE IF NOT EXISTS new_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_new_table_status ON new_table(status);
CREATE INDEX IF NOT EXISTS idx_new_table_created ON new_table(created_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_new_table_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_new_table_updated ON new_table;
CREATE TRIGGER trigger_new_table_updated
    BEFORE UPDATE ON new_table
    FOR EACH ROW EXECUTE FUNCTION update_new_table_timestamp();

-- Use ON CONFLICT for default data
INSERT INTO new_table (name, status)
VALUES ('default', 'active')
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON new_table TO arasul;
GRANT ALL PRIVILEGES ON SEQUENCE new_table_id_seq TO arasul;

COMMIT;
```

## Database Access

```bash
# Shell access
docker exec -it postgres-db psql -U arasul -d arasul_db

# Data database
docker exec -it postgres-db psql -U arasul_data -d arasul_data_db

# List tables
\dt

# Describe table
\d+ table_name

# Run cleanup
SELECT run_all_cleanups();

# Check setup status
SELECT is_setup_completed();
```

## Backend Query Pattern

```javascript
const db = require('../database');

// Single query
const result = await db.query('SELECT * FROM admin_users WHERE id = $1', [userId]);

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

## Rebuild Database (Destroys All Data)

```bash
docker compose down -v postgres-db
docker compose up -d postgres-db
```
