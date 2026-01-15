# Database Schema

Complete schema reference for the Arasul Platform PostgreSQL database.

## Overview

| Property | Value |
|----------|-------|
| Database | arasul_db |
| User | arasul |
| Schema | public |
| Migrations | 15 files in `/services/postgres/init/` |

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  admin_users    │     │ chat_conversations│    │ telegram_config │
│─────────────────│     │─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ username        │     │ title           │     │ bot_token       │
│ password_hash   │     │ message_count   │     │ chat_id         │
│ ...             │     │ deleted_at      │     │ enabled         │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │ 1:N                   │ 1:N
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ active_sessions │     │ chat_messages   │     │telegram_audit_log│
│─────────────────│     │─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ user_id (FK)    │     │ conversation_id │     │ event_type      │
│ token_jti       │     │ role            │     │ user_id (FK)    │
│ ...             │     │ content         │     │ payload         │
└─────────────────┘     │ thinking        │     │ created_at      │
                        │ sources         │     └─────────────────┘
┌─────────────────┐     └─────────────────┘
│ llm_jobs        │
│─────────────────│     ┌─────────────────┐
│ id (PK)         │     │   documents     │
│ conversation_id │     │─────────────────│
│ status          │     │ id (PK)         │
│ prompt          │     │ filename        │
│ response        │     │ minio_path      │
└────────┬────────┘     │ status          │
         │              └────────┬────────┘
         │ 1:1                   │ 1:N
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   llm_queue     │     │ document_chunks │
│─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │
│ job_id (FK)     │     │ document_id (FK)│
│ priority        │     │ chunk_index     │
└─────────────────┘     │ content         │
                        └─────────────────┘
```

---

## Tables by Migration

### 001_init_schema.sql - Metrics

#### metrics_cpu
| Column | Type | Description |
|--------|------|-------------|
| timestamp | timestamptz | Measurement time (PK) |
| value | decimal(5,2) | CPU usage % |

#### metrics_ram
| Column | Type | Description |
|--------|------|-------------|
| timestamp | timestamptz | Measurement time (PK) |
| value | decimal(5,2) | RAM usage % |

#### metrics_gpu
| Column | Type | Description |
|--------|------|-------------|
| timestamp | timestamptz | Measurement time (PK) |
| value | decimal(5,2) | GPU usage % |

#### metrics_temperature
| Column | Type | Description |
|--------|------|-------------|
| timestamp | timestamptz | Measurement time (PK) |
| value | decimal(5,2) | Temperature °C |

#### metrics_disk
| Column | Type | Description |
|--------|------|-------------|
| timestamp | timestamptz | Measurement time (PK) |
| used | bigint | Used bytes |
| free | bigint | Free bytes |
| percent | decimal(5,2) | Usage % |

**Retention:** 7 days

---

### 002_auth_schema.sql - Authentication

#### admin_users
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| username | varchar(50) | Unique username |
| password_hash | varchar(255) | bcrypt hash |
| email | varchar(255) | Email (nullable) |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |
| last_login | timestamptz | Last login time |
| login_attempts | integer | Failed attempts |
| locked_until | timestamptz | Lockout expiry |
| is_active | boolean | Account active |

**Constraints:**
- `username` UNIQUE
- Default user: `admin`

#### token_blacklist
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| token_jti | varchar(255) | JWT ID (unique) |
| user_id | integer | FK to admin_users |
| blacklisted_at | timestamptz | Blacklist time |
| expires_at | timestamptz | Token expiry |

#### login_attempts
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| username | varchar(50) | Attempted username |
| ip_address | inet | Client IP |
| success | boolean | Login success |
| attempted_at | timestamptz | Attempt time |
| user_agent | text | Browser/client info |

#### active_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to admin_users |
| token_jti | varchar(255) | JWT ID |
| ip_address | inet | Client IP |
| user_agent | text | Browser/client info |
| created_at | timestamptz | Session start |
| expires_at | timestamptz | Session expiry |
| last_activity | timestamptz | Last activity |

#### password_history
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to admin_users |
| password_hash | varchar(255) | Old password hash |
| changed_at | timestamptz | Change time |
| changed_by | varchar(50) | Changed by username |
| ip_address | inet | Client IP |

---

### 003_self_healing_schema.sql - Self-Healing

#### self_healing_events
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| event_type | varchar(50) | Event type |
| severity | varchar(20) | INFO/WARNING/CRITICAL |
| description | text | Event description |
| action_taken | text | Recovery action |
| timestamp | timestamptz | Event time |

**Retention:** 7 days

#### workflow_activity
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| workflow_name | varchar(255) | n8n workflow name |
| status | varchar(50) | Execution status |
| timestamp | timestamptz | Execution time |
| duration_ms | integer | Duration in ms |
| error | text | Error message |

---

### 004_update_schema.sql - Updates

#### update_events
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| version_from | varchar(20) | Previous version |
| version_to | varchar(20) | New version |
| status | varchar(20) | pending/in_progress/completed/failed/rolled_back |
| source | varchar(50) | dashboard/usb/auto |
| components_updated | jsonb | Updated components |
| error_message | text | Error details |
| started_at | timestamptz | Start time |
| completed_at | timestamptz | Completion time |
| duration_seconds | integer | Duration |
| requires_reboot | boolean | Reboot needed |
| initiated_by | varchar(50) | User/system |

#### update_backups
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| backup_path | varchar(500) | Backup file path |
| update_event_id | integer | FK to update_events |
| created_at | timestamptz | Creation time |
| backup_size_mb | decimal(10,2) | Size in MB |
| components | jsonb | Backed up components |
| restoration_tested | boolean | Tested flag |
| notes | text | Notes |

#### update_files
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| filename | varchar(255) | File name |
| file_path | varchar(500) | Full path |
| checksum_sha256 | varchar(64) | SHA256 hash |
| file_size_bytes | bigint | Size in bytes |
| source | varchar(50) | Upload source |
| uploaded_at | timestamptz | Upload time |
| signature_verified | boolean | Signature valid |
| manifest | jsonb | Package manifest |
| validation_status | varchar(20) | Validation status |
| applied | boolean | Applied flag |

#### update_rollbacks
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| original_update_event_id | integer | FK to update_events |
| backup_id | integer | FK to update_backups |
| rollback_reason | text | Reason |
| initiated_by | varchar(50) | User/system |
| started_at | timestamptz | Start time |
| completed_at | timestamptz | Completion time |
| success | boolean | Success flag |
| error_message | text | Error details |

#### component_updates
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| update_event_id | integer | FK to update_events |
| component_name | varchar(100) | Component name |
| component_type | varchar(50) | Type (service/config/etc) |
| version_from | varchar(20) | Previous version |
| version_to | varchar(20) | New version |
| status | varchar(20) | Status |
| started_at | timestamptz | Start time |
| completed_at | timestamptz | Completion time |
| error_message | text | Error details |

---

### 005_chat_schema.sql - Chat

#### chat_conversations
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (generated) |
| title | varchar(255) | Conversation title |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |
| deleted_at | timestamptz | Soft delete time |
| message_count | integer | Auto-updated count |

**Indexes:**
- `idx_conversations_updated` on updated_at DESC
- `idx_conversations_deleted` on deleted_at

#### chat_messages
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (generated) |
| conversation_id | uuid | FK to chat_conversations |
| role | varchar(20) | user/assistant/system |
| content | text | Message content |
| thinking | text | LLM thinking (nullable) |
| sources | jsonb | RAG sources (nullable) |
| created_at | timestamptz | Creation time |

**Indexes:**
- `idx_messages_conversation` on conversation_id, created_at

**Triggers:**
- `update_message_count` - Auto-updates conversation.message_count

---

### 006_llm_jobs_schema.sql - LLM Jobs

#### llm_jobs
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (generated) |
| conversation_id | uuid | FK to chat_conversations |
| status | varchar(20) | pending/processing/completed/failed |
| prompt | text | User prompt |
| response | text | LLM response |
| error | text | Error message |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

---

### 007_add_sources_to_messages.sql

Adds `sources` JSONB column to `chat_messages` for RAG source tracking.

---

### 008_llm_queue_schema.sql - LLM Queue

#### llm_queue
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| job_id | uuid | FK to llm_jobs |
| priority | integer | Queue priority |
| created_at | timestamptz | Queue time |
| started_at | timestamptz | Processing start |

---

### 009_documents_schema.sql - Documents

#### documents
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (generated) |
| filename | varchar(255) | Stored filename |
| original_name | varchar(255) | Original filename |
| mime_type | varchar(100) | MIME type |
| size_bytes | bigint | File size |
| minio_path | varchar(500) | MinIO object path |
| status | varchar(20) | pending/indexing/indexed/failed |
| chunk_count | integer | Number of chunks |
| error_message | text | Error details |
| created_at | timestamptz | Upload time |
| updated_at | timestamptz | Last update |
| indexed_at | timestamptz | Indexing completion |

**Indexes:**
- `idx_documents_status` on status
- `idx_documents_created` on created_at DESC

#### document_chunks
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (generated) |
| document_id | uuid | FK to documents |
| chunk_index | integer | Chunk sequence |
| content | text | Chunk text |
| embedding_id | varchar(100) | Qdrant point ID |
| created_at | timestamptz | Creation time |

**Indexes:**
- `idx_chunks_document` on document_id

---

### 015_telegram_schema.sql - Telegram Bot

#### telegram_config
| Column | Type | Description |
|--------|------|-------------|
| id | bigserial | Primary key (singleton: always 1) |
| bot_token | text | Telegram Bot API token (sensitive) |
| chat_id | text | Target chat/channel ID |
| enabled | boolean | Bot enabled flag |
| webhook_url | text | Webhook URL for updates |
| webhook_secret | text | Webhook verification secret |
| notification_settings | jsonb | Notification type configuration |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update (auto-updated) |

**Constraints:**
- `telegram_config_singleton` - Only id=1 allowed (singleton pattern)
- `idx_telegram_config_singleton` - Unique index on (true)

**Default notification_settings:**
```json
{
  "system_alerts": true,
  "self_healing_events": true,
  "update_notifications": true,
  "login_alerts": true,
  "daily_summary": false
}
```

#### telegram_audit_log
| Column | Type | Description |
|--------|------|-------------|
| id | bigserial | Primary key |
| event_type | varchar(50) | Event type identifier |
| event_description | text | Human-readable description |
| payload | jsonb | Event-specific data |
| success | boolean | Success flag |
| error_message | text | Error details if failed |
| user_id | bigint | FK to admin_users (nullable) |
| ip_address | inet | Client IP address |
| created_at | timestamptz | Event time |

**Event Types:**
- `config_updated` - Configuration changed
- `message_sent` - Notification sent
- `webhook_received` - Incoming webhook
- `connection_test` - Bot connection test
- `schema_created` - Initial schema setup

**Indexes:**
- `idx_telegram_audit_created` on created_at DESC
- `idx_telegram_audit_event_type` on event_type
- `idx_telegram_audit_success` on success
- `idx_telegram_audit_type_created` on (event_type, created_at DESC)

**Functions:**
- `log_telegram_event()` - Log events to audit table
- `get_or_create_telegram_config()` - Get singleton config row

**Views:**
- `v_telegram_recent_activity` - Last 100 events with usernames
- `v_telegram_stats_24h` - Event statistics (24h)

---

## Indexes Summary

| Table | Index | Columns |
|-------|-------|---------|
| chat_conversations | idx_conversations_updated | updated_at DESC |
| chat_conversations | idx_conversations_deleted | deleted_at |
| chat_messages | idx_messages_conversation | conversation_id, created_at |
| documents | idx_documents_status | status |
| documents | idx_documents_created | created_at DESC |
| document_chunks | idx_chunks_document | document_id |
| telegram_config | idx_telegram_config_singleton | (true) |
| telegram_config | idx_telegram_config_enabled | enabled |
| telegram_audit_log | idx_telegram_audit_created | created_at DESC |
| telegram_audit_log | idx_telegram_audit_event_type | event_type |
| telegram_audit_log | idx_telegram_audit_success | success |
| telegram_audit_log | idx_telegram_audit_type_created | event_type, created_at DESC |

---

## Data Retention

| Data Type | Retention |
|-----------|-----------|
| Metrics | 7 days |
| Self-healing events | 7 days |
| Workflow activity | 7 days |
| Deleted conversations | 30 days (soft delete) |
| Update history | Permanent |
| User accounts | Permanent |
| Telegram audit logs | Permanent (configurable via self-healing) |
| Telegram config | Permanent (singleton) |

---

## Related Documentation

- [PostgreSQL Service](../services/postgres/README.md) - Service details
- [Dashboard Backend](../services/dashboard-backend/README.md) - Database client
