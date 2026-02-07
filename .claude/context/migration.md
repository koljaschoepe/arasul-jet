# Context: Database Migration

## Quick Reference

**Location:** `services/postgres/init/`
**Next Migration:** `029_*.sql`
**Documentation:** `docs/DATABASE_SCHEMA.md`

---

## Steps

1. Create migration file: `029_description.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Update `docs/DATABASE_SCHEMA.md`
4. Rebuild: `docker compose up -d --build postgres-db`

---

## Migration Pattern

```sql
-- 029_example_feature.sql
-- Description: Add example feature tables
-- Author: Claude Code
-- Date: 2026-01-25

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

---

## Existing Tables Reference

| Table | Purpose |
|-------|---------|
| `admin_users` | User accounts |
| `sessions` | Active sessions |
| `conversations` | Chat conversations |
| `messages` | Chat messages |
| `documents` | Uploaded documents |
| `document_chunks` | Document text chunks |
| `llm_jobs` | LLM job queue |
| `llm_models` | Available models |
| `alert_configs` | Alert thresholds |
| `self_healing_events` | Recovery events |
| `audit_logs` | API audit trail |
| `api_keys` | External API keys |
| `notification_events` | Notifications |
| `telegram_config` | Telegram settings |
| `apps` | Installed apps |
| `knowledge_spaces` | RAG spaces |
| `workspaces` | Claude workspaces |

---

## Apply Migration

```bash
# Rebuild postgres (runs init scripts)
docker compose up -d --build postgres-db

# Or execute directly
docker exec -i postgres-db psql -U arasul -d arasul_db < services/postgres/init/029_example.sql

# Verify
docker exec -it postgres-db psql -U arasul -d arasul_db -c "\dt"
```

---

## Checklist

- [ ] File named `029_description.sql`
- [ ] All CREATE statements use `IF NOT EXISTS`
- [ ] All ALTER statements are wrapped in `DO $$ ... $$`
- [ ] Indexes created for foreign keys
- [ ] Indexes created for frequently queried columns
- [ ] `docs/DATABASE_SCHEMA.md` updated
- [ ] Migration tested locally
