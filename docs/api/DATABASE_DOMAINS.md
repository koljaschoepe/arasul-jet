# Database Domains — Human-readable Schema Map

> Domain-grouped overview of the Postgres tables. Companion to the
> auto-generated [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) (which is
> alphabetic and exhaustive).
>
> For migration mechanics (numbering, idempotency, the runner) read
> [`services/postgres/CLAUDE.md`](../../services/postgres/CLAUDE.md).

## Overview

- **Location**: `services/postgres/init/*.sql` — executed alphabetically on first DB start, and re-applied per checksum by the dashboard-backend migration runner.
- **Connection**: `apps/dashboard-backend/src/database.js` (single pool).
- **One database**: `arasul_db`. (The former second database `arasul_data_db` / Datentabellen feature was removed in Plan 008.)

> Migration counter: read from disk —
> `ls services/postgres/init/ | grep -E '^[0-9]+' | sort | tail -1`

## Tables by Domain

### Auth (002)

| Table            | Key Columns                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| admin_users      | id, username, password_hash, email, is_active, locked_until, login_attempts |
| active_sessions  | id, user_id, token_jti, ip_address, expires_at, last_activity               |
| token_blacklist  | id, token_jti, user_id, expires_at                                          |
| login_attempts   | id, username, ip_address, success, attempted_at                             |
| password_history | id, user_id, password_hash, changed_at, ip_address                          |

### LLM Jobs (006, 008, 154, 159, 165)

| Table    | Key Columns                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| llm_jobs | id (UUID), user_id, job_type, status, content, thinking, request_data, queue_position, priority, abbruch_grund |

> Ein Auftrag an das Sprachmodell trägt seinen Besitzer selbst (`user_id`,
> der Ersteller des API-Schlüssels) und lebt eine Stunde nach seinem Ende
> (`cleanup_old_llm_jobs()`); er entsteht über die externe API und die
> OpenAI-kompatible `/v1`.

### Flows und Schnittstelle (Schema `arasul` für die Läufe)

| Table                 | Key Columns                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| arasul.flow_runs      | id, user_id, flow_name, arguments (JSONB), status, result, error, steps_used, changes, annahmen |
| arasul.flow_run_steps | id, run_id → flow_runs (ON DELETE CASCADE), position, kind, name, input, output, status, modell |
| api_keys              | id, key_hash, key_prefix, name, created_by, expires_at, is_active, allowed_endpoints            |

### Models (011, 029, 030, 035)

| Table                     | Key Columns                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| llm_model_catalog         | id (e.g. 'qwen3:14b-q8'), name, size_bytes, ram_required_gb, category, capabilities, context_window      |
| llm_installed_models      | id, status, download_progress, is_default                                                                |
| llm_model_switches        | id, from_model, to_model, switched_at                                                                    |
| model_performance_metrics | id, model_id, tokens_generated, total_duration_ms, tokens_per_second (generated), time_to_first_token_ms |

### Apps (168, 169)

| Table       | Key Columns                                                 |
| ----------- | ----------------------------------------------------------- |
| apps        | id (Kennung aus dem Manifest), name, beschreibung           |
| app_staende | app_id, stand ('test' \| 'live'), version, manifest (jsonb) |
| app_members | app_id, user_id, stand ('test' \| 'live') — die Freigaben   |

Der AppStore aus 013/014 (`app_installations`, `app_configurations`,
`app_dependencies`, `app_events`) ist mit Migration 169 gefallen.

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

### Self-Healing (001, 003)

| Table               | Key Columns                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| self_healing_events | id, event_type, severity, description, action_taken, service_name, success |
| service_failures    | id, service_name, failure_type, recovery_action, recovery_success          |
| recovery_actions    | id, action_type, service_name, reason, success, duration_ms                |
| reboot_events       | id, reason, pre_reboot_state (JSONB), reboot_completed                     |
| service_restarts    | id, service_name, reason, initiated_by, success                            |

### Audit (017, 021)

| Table          | Key Columns                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api_audit_logs | id, timestamp, user_id, action_type, target_endpoint, response_status, duration_ms, ip_address                                                             |
| bot_audit_log  | id, timestamp, user_id, chat_id, command, message_text, response_time_ms (legacy, seit Plan 008 ohne Schreiber; fällt mit der nächsten Schema-Bereinigung) |

### Settings (031, 038)

| Table           | Key Columns                                                                                |
| --------------- | ------------------------------------------------------------------------------------------ |
| system_settings | id=1 (singleton), setup_completed, company_name, hostname, selected_model, ai_profile_yaml |

## Singleton Tables

These tables enforce a single row via `CHECK (id = 1)`:

- **alert_settings** -- Global alert enable/disable + webhook
- **system_settings** -- Setup wizard state, company name, AI profile

## Key SQL Patterns

### Idempotent DDL

```sql
CREATE TABLE IF NOT EXISTS new_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON table(column);
ALTER TABLE t ADD COLUMN IF NOT EXISTS col TYPE DEFAULT val;
INSERT INTO ... ON CONFLICT (key) DO NOTHING;
```

### Soft Deletes

Keine. `flow_runs` und `llm_jobs` werden hart gelöscht (Werksreset, DSGVO-Löschung,
`cleanup_old_llm_jobs()`).

### JSONB for Flexible Data

Used extensively: `llm_jobs.request_data`, `self_healing_events.metadata`, `flow_runs.changes`.

### Enums

Created with `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$;`

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
| `is_in_quiet_hours()`         | Check if current time is in alert quiet hours                                  |
| `can_fire_alert(type)`        | Rate-limit check for alert cooldown                                            |

## Retention Policies

All enforced by `run_all_cleanups()`:

| Data                            | Retention        |
| ------------------------------- | ---------------- |
| Metrics (CPU/RAM/GPU/Disk/Temp) | 7 days           |
| System snapshots                | 7 days           |
| Login attempts                  | 7 days           |
| Self-healing events             | 30 days          |
| Service restarts                | 30 days          |
| App store events                | 30 days          |
| Notification events             | 30 days          |
| Bot audit logs                  | 90 days          |
| Update files                    | 90 days          |
| Update events                   | 180 days         |
| LLM jobs (completed)            | 1 hour           |
| Alert history                   | max 1000 entries |

## Migration Template

```sql
-- 0NN_feature_name.sql — Phase X: [reason]
-- Kein BEGIN/COMMIT: der Runner huellt jede Migration selbst in eine Transaktion.

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
```

## Database Access

```bash
# Shell access
docker exec -it postgres-db psql -U arasul -d arasul_db

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
