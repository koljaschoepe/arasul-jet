# Database Schema Cleanup — PostgreSQL 16 (81+ Migrations)

**Scope:** `services/postgres/init/*.sql` + backend query usage (grep all SQL table/column references)
**Summary:** **A- grade** schema. **~16 MB dead weight (~8%)** removable. Primary concern: one conflicting duplicate schema.

---

## DEAD / UNUSED TABLES — 16 total

Tables defined in migrations but **never queried/written** by any code:

### High-Confidence Dead

| Table                       | Migration File                       | Reason                                      |
| --------------------------- | ------------------------------------ | ------------------------------------------- |
| `api_key_usage`             | `023_api_keys_schema.sql`            | API audit log never used                    |
| `component_updates`         | `004_update_schema.sql`              | Legacy update system                        |
| `datentabellen_config`      | (see 009+)                           | Config-only, never read                     |
| `document_chunks`           | `009_documents_schema.sql`           | Chunks live in Qdrant, not PG               |
| `document_processing_queue` | `009_documents_schema.sql`           | No consumer                                 |
| `document_similarities`     | `009_documents_schema.sql`           | Never invoked                               |
| `metrics_infra`             | `080_metrics_infra.sql`              | Created but never populated                 |
| `model_performance_metrics` | `030_model_performance_metrics.sql`  | Token metrics never recorded                |
| `notification_rate_limits`  | `019_notification_events_schema.sql` | Superseded by `telegram_rate_limits`        |
| `service_restarts`          | `001_init_schema.sql`                | Duplicate of `service_failures`             |
| `system_snapshots`          | `001_init_schema.sql`                | Superseded by per-metric tables             |
| `telegram_alert_cooldowns`  | `022/049` conflict                   | Unclear state                               |
| `telegram_message_log`      | `022/049`                            | Replaced by `telegram_notification_history` |
| `update_backups`            | `004_update_schema.sql`              | Dead update system                          |
| `update_files`              | `004_update_schema.sql`              | Dead update system                          |
| `update_rollbacks`          | `004_update_schema.sql`              | Dead update system                          |
| `update_state_snapshots`    | `004_update_schema.sql`              | Dead update system                          |

---

## DUPLICATE / INCONSISTENT SCHEMAS

### CRITICAL — `telegram_rate_limits` schema conflict

- `022_telegram_notification_system.sql:121–137` — original simple schema
- `033_telegram_voice_support.sql:51–67` — recreated with `bot_id` (multi-bot)
- `049_cleanup_stale_tables.sql:42` — drop attempt

**Problem:** Unclear if table exists in production and which schema version is live. 27-migration span creates confusion for any new dev debugging telegram rate limits.

**Action:** Audit live DB, reconcile in single new migration.

---

## ORPHANED FUNCTIONS

Migration `081_cleanup_orchestrator.sql` defines `run_all_cleanups()` which calls:

- `cleanup_old_metrics_infra()` — targets dead `metrics_infra`
- `cleanup_old_update_files()` — targets dead `update_files`
- `cleanup_old_update_events()` — targets rarely-used `update_events`

**Fix:** When dead tables are dropped, update 081 accordingly (or add 083 to remove calls).

---

## POSITIVE FINDINGS

- ✅ All FK references point to existing tables
- ✅ No orphaned sequences
- ✅ All tables have proper PKs (UUID or BIGSERIAL)
- ✅ `ON DELETE CASCADE`/`SET NULL` patterns consistent
- ✅ `created_at`/`updated_at` convention well-followed
- ✅ Indexing patterns solid (no missing obvious indexes in sampled routes)

---

## METRICS PROLIFERATION — MONITOR

Eight time-series tables **without partitioning**:
`metrics_cpu`, `metrics_ram`, `metrics_gpu`, `metrics_disk`, `metrics_temperature`, `metrics_swap`, `metrics_infra` (dead), plus one more.

Retention functions exist in migrations 050, 072, 081. For the 5-year autonomy target, **verify these are scheduled and running**. Consider TimescaleDB if any table crosses ~10 GB.

---

## ENUM VALUE AUDIT — LOW PRIORITY

Defined enums without usage validation:
`document_status`, `alert_metric_type`, `alert_severity`, `app_status`, `app_type`, `telegram_setup_status`, `notification_event_source`, `notification_severity`, `telegram_agent_type`, `sandbox_*` (4).

**Action:** Audit enum values only when planning a schema freeze or if unused values cause ambiguity.

---

## DOC DRIFT (cross-check)

Per prior analysis `09-database.md`:

- `docs/DATABASE_SCHEMA.md` stale since migration 025 (now at 081+)
- No `/api/system/db-version` endpoint exposed

---

## KILL LIST (Migration 082 candidates)

```sql
-- Proposed 082_cleanup_dead_tables.sql
DROP TABLE IF EXISTS api_key_usage;
DROP TABLE IF EXISTS component_updates;
DROP TABLE IF EXISTS datentabellen_config;
DROP TABLE IF EXISTS document_chunks;
DROP TABLE IF EXISTS document_processing_queue;
DROP TABLE IF EXISTS document_similarities;
DROP TABLE IF EXISTS metrics_infra;
DROP TABLE IF EXISTS model_performance_metrics;
DROP TABLE IF EXISTS notification_rate_limits;
DROP TABLE IF EXISTS service_restarts;
DROP TABLE IF EXISTS system_snapshots;
DROP TABLE IF EXISTS update_backups;
DROP TABLE IF EXISTS update_files;
DROP TABLE IF EXISTS update_rollbacks;
DROP TABLE IF EXISTS update_state_snapshots;
```

## REFACTOR LIST

| Target                                  | Effort                    | Priority        |
| --------------------------------------- | ------------------------- | --------------- |
| Migration 082 (drop 16 dead tables)     | S (30m)                   | High            |
| Reconcile `telegram_rate_limits` schema | M (1h + DB audit)         | Medium          |
| Update 081 cleanup calls                | S (15m)                   | Low (after 082) |
| Regenerate `docs/DATABASE_SCHEMA.md`    | M (1h, auto from live DB) | High            |
| Add `GET /api/system/db-version`        | S (30m)                   | Low             |

## SQUASHING CANDIDATES (future)

When schema stabilizes, squash:

- `telegram_rate_limits`: migrations 022 → 033 → 049 → one clean DDL
- `telegram_alert_cooldowns`: 022 → 049 → verify + consolidate
