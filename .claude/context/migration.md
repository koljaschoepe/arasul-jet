# Context: Database Migration

## Quick Reference

**Location:** `services/postgres/init/`
**Current Migrations:** 000-052
**Next Migration:** `053_*.sql`
**Documentation:** `docs/DATABASE_SCHEMA.md`

---

## Steps

1. Create migration file: `053_description.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Update `docs/DATABASE_SCHEMA.md`
4. Rebuild: `docker compose up -d --build postgres-db`

---

## Migration Template

```sql
-- 053_example_feature.sql
-- Description: Add example feature tables
-- Author: Claude Code
-- Date: 2026-03-29

-- Create new table
CREATE TABLE IF NOT EXISTS example_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_example_items_user_id ON example_items(user_id);
CREATE INDEX IF NOT EXISTS idx_example_items_status ON example_items(status);
CREATE INDEX IF NOT EXISTS idx_example_items_created_at ON example_items(created_at DESC);

-- Add column to existing table (safe pattern)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'existing_table' AND column_name = 'new_column'
    ) THEN
        ALTER TABLE existing_table ADD COLUMN new_column VARCHAR(255);
    END IF;
END $$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_example_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_example_items_updated ON example_items;
CREATE TRIGGER trigger_example_items_updated
    BEFORE UPDATE ON example_items
    FOR EACH ROW
    EXECUTE FUNCTION update_example_items_timestamp();

-- Insert default data (if needed)
INSERT INTO example_items (name, description, status)
SELECT 'Default Item', 'Auto-created default', 'active'
WHERE NOT EXISTS (SELECT 1 FROM example_items WHERE name = 'Default Item');
```

---

## Common Patterns

### Add Column (Safe)

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'table_name' AND column_name = 'column_name'
    ) THEN
        ALTER TABLE table_name ADD COLUMN column_name VARCHAR(255);
    END IF;
END $$;
```

### Add Foreign Key (Safe)

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_constraint_name'
    ) THEN
        ALTER TABLE child_table
        ADD CONSTRAINT fk_constraint_name
        FOREIGN KEY (parent_id) REFERENCES parent_table(id) ON DELETE CASCADE;
    END IF;
END $$;
```

### Create Enum Type (Safe)

```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_enum') THEN
        CREATE TYPE status_enum AS ENUM ('active', 'inactive', 'pending');
    END IF;
END $$;
```

### Add Enum Value (Safe)

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'new_value'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'status_enum')
    ) THEN
        ALTER TYPE status_enum ADD VALUE 'new_value';
    END IF;
END $$;
```

### Singleton Table (Single-Row Config)

Some tables enforce exactly one row using `CHECK (id = 1)`:

```sql
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    setting_a TEXT,
    setting_b BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Current singleton tables: `system_settings`, `alert_settings`, `telegram_config`, `company_context`.

---

## Consolidated Cleanup Function

Migration `050` defines `run_all_cleanups()` which calls 17 per-table cleanup
functions (one for each table with retention policies). Each sub-call is wrapped
in its own `BEGIN/EXCEPTION` block so a failure in one does not abort the rest.

```sql
-- Call from backend scheduler, cron, or manually:
SELECT run_all_cleanups();
-- Returns JSONB with per-function status and timing.
```

---

## Existing Tables Reference

### Core / System

| Table                | Migration | Purpose                           |
| -------------------- | --------- | --------------------------------- |
| `schema_migrations`  | 000       | Migration tracking                |
| `system_settings`    | 038       | Global settings (singleton, id=1) |
| `system_snapshots`   | 001       | Periodic system state snapshots   |
| `system_boot_events` | 019       | Boot event log                    |

### Auth / Security

| Table              | Migration | Purpose                               |
| ------------------ | --------- | ------------------------------------- |
| `admin_users`      | 002       | User accounts                         |
| `token_blacklist`  | 002       | Revoked JWT tokens                    |
| `login_attempts`   | 002       | Failed login tracking                 |
| `active_sessions`  | 002       | Active user sessions                  |
| `password_history` | 002       | Password history for reuse prevention |
| `api_keys`         | 023       | External API keys                     |
| `api_key_usage`    | 023       | API key usage tracking                |
| `api_audit_logs`   | 021       | API audit trail                       |
| `bot_audit_log`    | 017       | Bot action audit trail                |

### Chat / LLM

| Table                       | Migration | Purpose                                  |
| --------------------------- | --------- | ---------------------------------------- |
| `chat_conversations`        | 005       | Chat conversations                       |
| `chat_messages`             | 005       | Chat messages (with sources from 007)    |
| `llm_jobs`                  | 006, 008  | LLM job queue                            |
| `llm_model_catalog`         | 011       | Available model catalog                  |
| `llm_installed_models`      | 011       | Currently installed models               |
| `llm_model_switches`        | 011       | Model switch history                     |
| `model_performance_metrics` | 030       | Model benchmark data                     |
| `projects`                  | 042       | Chat projects (default project from 043) |
| `ai_memories`               | 041       | Persistent AI memory entries             |
| `compaction_log`            | 041       | Memory compaction history                |

### Documents / RAG

| Table                       | Migration | Purpose                                           |
| --------------------------- | --------- | ------------------------------------------------- |
| `documents`                 | 009       | Uploaded documents (unique content_hash from 052) |
| `document_chunks`           | 009       | Document text chunks                              |
| `document_parent_chunks`    | 039       | Hierarchical parent chunks                        |
| `document_categories`       | 009       | Document categories                               |
| `document_similarities`     | 009       | Document similarity pairs                         |
| `document_processing_queue` | 009       | Async processing queue                            |
| `document_access_log`       | 009       | Document access tracking                          |
| `knowledge_spaces`          | 016       | RAG knowledge spaces                              |
| `company_context`           | 016       | Company context (singleton, id=1)                 |
| `kg_entities`               | 044       | Knowledge graph entities                          |
| `kg_entity_documents`       | 044       | Entity-document links                             |
| `kg_relations`              | 044       | Knowledge graph relations (refined in 045)        |

### Monitoring / Self-Healing

| Table                      | Migration | Purpose                          |
| -------------------------- | --------- | -------------------------------- |
| `metrics_cpu`              | 001       | CPU metrics history              |
| `metrics_ram`              | 001       | RAM metrics history              |
| `metrics_gpu`              | 001       | GPU metrics history              |
| `metrics_temperature`      | 001       | Temperature history              |
| `metrics_disk`             | 001       | Disk usage history               |
| `self_healing_events`      | 001       | Recovery event log               |
| `service_failures`         | 003       | Per-service failure tracking     |
| `service_restarts`         | 001       | Service restart history          |
| `recovery_actions`         | 003       | Recovery action log              |
| `reboot_events`            | 003       | System reboot log                |
| `workflow_activity`        | 001       | n8n workflow activity            |
| `alert_thresholds`         | 010       | Alert threshold config           |
| `alert_quiet_hours`        | 010       | Alert quiet hours                |
| `alert_history`            | 010       | Alert firing history             |
| `alert_settings`           | 010       | Alert settings (singleton, id=1) |
| `alert_last_fired`         | 010       | Last fire time per alert         |
| `notification_events`      | 019       | Notification event log           |
| `notification_settings`    | 019       | Notification preferences         |
| `notification_rate_limits` | 019       | Notification rate limiting       |
| `service_status_cache`     | 019       | Cached service status            |

### Telegram

| Table                           | Migration | Purpose                         |
| ------------------------------- | --------- | ------------------------------- |
| `telegram_config`               | 020       | Legacy config (singleton, id=1) |
| `telegram_bots`                 | 032       | Multi-bot configurations        |
| `telegram_bot_commands`         | 032       | Bot command definitions         |
| `telegram_bot_chats`            | 032       | Bot chat associations           |
| `telegram_bot_sessions`         | 032       | Bot session state               |
| `telegram_bot_configs`          | 024       | Bot config store                |
| `telegram_setup_sessions`       | 024       | Setup wizard sessions           |
| `telegram_notification_rules`   | 024       | Notification routing rules      |
| `telegram_orchestrator_state`   | 024       | Orchestrator state              |
| `telegram_notification_history` | 024       | Notification delivery log       |
| `telegram_rate_limits`          | 022       | Telegram rate limiting          |
| `telegram_app_status`           | 034       | App status tracking             |

### Apps / Store

| Table                | Migration | Purpose                           |
| -------------------- | --------- | --------------------------------- |
| `app_installations`  | 013       | Installed apps (converted in 014) |
| `app_configurations` | 013       | App config storage                |
| `app_dependencies`   | 013       | App dependency graph              |
| `app_events`         | 013       | App lifecycle events              |

### Updates

| Table                    | Migration | Purpose               |
| ------------------------ | --------- | --------------------- |
| `update_events`          | 004       | Update event log      |
| `update_backups`         | 004       | Pre-update backups    |
| `update_files`           | 004       | Updated file tracking |
| `update_rollbacks`       | 004       | Rollback history      |
| `update_state_snapshots` | 004       | Pre-update state      |
| `component_updates`      | 004       | Per-component updates |

### Other

| Table                      | Migration | Purpose                   |
| -------------------------- | --------- | ------------------------- |
| `claude_workspaces`        | 015       | Claude Code workspaces    |
| `claude_terminal_sessions` | 018       | Claude terminal sessions  |
| `claude_terminal_queries`  | 018       | Claude terminal query log |
| `datentabellen_config`     | 031       | Data table configurations |

---

## Apply Migration

```bash
# Rebuild postgres (runs init scripts in order)
docker compose up -d --build postgres-db

# Or execute directly
docker exec -i postgres-db psql -U arasul -d arasul_db < services/postgres/init/053_example.sql

# Verify
docker exec -it postgres-db psql -U arasul -d arasul_db -c "\dt"

# Run consolidated cleanup
docker exec -it postgres-db psql -U arasul -d arasul_db -c "SELECT run_all_cleanups()"
```

---

## Checklist

- [ ] File named `053_description.sql`
- [ ] All CREATE statements use `IF NOT EXISTS`
- [ ] All ALTER statements are wrapped in `DO $$ ... $$`
- [ ] Indexes created for foreign keys
- [ ] Indexes created for frequently queried columns
- [ ] Singleton tables use `CHECK (id = 1)` pattern
- [ ] `docs/DATABASE_SCHEMA.md` updated
- [ ] Migration tested locally
