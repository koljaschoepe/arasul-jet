# Database Schema

Complete schema reference for the Arasul Platform PostgreSQL database.

## Overview

### Main Database

| Property   | Value                      |
| ---------- | -------------------------- |
| Database   | arasul_db                  |
| User       | arasul                     |
| Schema     | public                     |
| Migrations | `/services/postgres/init/` |

### Data Database (Datentabellen)

| Property   | Value                              |
| ---------- | ---------------------------------- |
| Database   | arasul_data_db                     |
| User       | arasul_data                        |
| Schema     | public                             |
| Migrations | `/services/postgres/init-data-db/` |

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  admin_users    │     │ chat_conversations│    │ telegram_config │
│─────────────────│     │─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ username        │     │ title           │     │ bot_token_enc   │
│ password_hash   │     │ message_count   │     │ chat_id         │
│ ...             │     │ deleted_at      │     │ enabled         │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │ 1:N                   │ 1:N
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ active_sessions │     │ chat_messages   │
│─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │
│ user_id (FK)    │     │ conversation_id │
│ token_jti       │     │ role            │
│ ...             │     │ content         │
└─────────────────┘     │ thinking        │
                        │ sources         │
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

| Column    | Type         | Description           |
| --------- | ------------ | --------------------- |
| timestamp | timestamptz  | Measurement time (PK) |
| value     | decimal(5,2) | CPU usage %           |

#### metrics_ram

| Column    | Type         | Description           |
| --------- | ------------ | --------------------- |
| timestamp | timestamptz  | Measurement time (PK) |
| value     | decimal(5,2) | RAM usage %           |

#### metrics_gpu

| Column    | Type         | Description           |
| --------- | ------------ | --------------------- |
| timestamp | timestamptz  | Measurement time (PK) |
| value     | decimal(5,2) | GPU usage %           |

#### metrics_temperature

| Column    | Type         | Description           |
| --------- | ------------ | --------------------- |
| timestamp | timestamptz  | Measurement time (PK) |
| value     | decimal(5,2) | Temperature °C        |

#### metrics_disk

| Column    | Type         | Description           |
| --------- | ------------ | --------------------- |
| timestamp | timestamptz  | Measurement time (PK) |
| used      | bigint       | Used bytes            |
| free      | bigint       | Free bytes            |
| percent   | decimal(5,2) | Usage %               |

**Retention:** 7 days

---

### 002_auth_schema.sql - Authentication

#### admin_users

| Column         | Type         | Description      |
| -------------- | ------------ | ---------------- |
| id             | serial       | Primary key      |
| username       | varchar(50)  | Unique username  |
| password_hash  | varchar(255) | bcrypt hash      |
| email          | varchar(255) | Email (nullable) |
| created_at     | timestamptz  | Creation time    |
| updated_at     | timestamptz  | Last update      |
| last_login     | timestamptz  | Last login time  |
| login_attempts | integer      | Failed attempts  |
| locked_until   | timestamptz  | Lockout expiry   |
| is_active      | boolean      | Account active   |

**Constraints:**

- `username` UNIQUE
- Default user: `admin`

#### token_blacklist

| Column         | Type         | Description       |
| -------------- | ------------ | ----------------- |
| id             | serial       | Primary key       |
| token_jti      | varchar(255) | JWT ID (unique)   |
| user_id        | integer      | FK to admin_users |
| blacklisted_at | timestamptz  | Blacklist time    |
| expires_at     | timestamptz  | Token expiry      |

#### login_attempts

| Column       | Type        | Description         |
| ------------ | ----------- | ------------------- |
| id           | serial      | Primary key         |
| username     | varchar(50) | Attempted username  |
| ip_address   | inet        | Client IP           |
| success      | boolean     | Login success       |
| attempted_at | timestamptz | Attempt time        |
| user_agent   | text        | Browser/client info |

#### active_sessions

| Column        | Type         | Description         |
| ------------- | ------------ | ------------------- |
| id            | serial       | Primary key         |
| user_id       | integer      | FK to admin_users   |
| token_jti     | varchar(255) | JWT ID              |
| ip_address    | inet         | Client IP           |
| user_agent    | text         | Browser/client info |
| created_at    | timestamptz  | Session start       |
| expires_at    | timestamptz  | Session expiry      |
| last_activity | timestamptz  | Last activity       |

#### password_history

| Column        | Type         | Description         |
| ------------- | ------------ | ------------------- |
| id            | serial       | Primary key         |
| user_id       | integer      | FK to admin_users   |
| password_hash | varchar(255) | Old password hash   |
| changed_at    | timestamptz  | Change time         |
| changed_by    | varchar(50)  | Changed by username |
| ip_address    | inet         | Client IP           |

---

### 003_self_healing_schema.sql - Self-Healing

#### self_healing_events

| Column       | Type        | Description           |
| ------------ | ----------- | --------------------- |
| id           | serial      | Primary key           |
| event_type   | varchar(50) | Event type            |
| severity     | varchar(20) | INFO/WARNING/CRITICAL |
| description  | text        | Event description     |
| action_taken | text        | Recovery action       |
| timestamp    | timestamptz | Event time            |

**Retention:** 7 days

#### workflow_activity

| Column        | Type         | Description       |
| ------------- | ------------ | ----------------- |
| id            | serial       | Primary key       |
| workflow_name | varchar(255) | n8n workflow name |
| status        | varchar(50)  | Execution status  |
| timestamp     | timestamptz  | Execution time    |
| duration_ms   | integer      | Duration in ms    |
| error         | text         | Error message     |

---

### 004_update_schema.sql - Updates

#### update_events

| Column             | Type        | Description                                      |
| ------------------ | ----------- | ------------------------------------------------ |
| id                 | serial      | Primary key                                      |
| version_from       | varchar(20) | Previous version                                 |
| version_to         | varchar(20) | New version                                      |
| status             | varchar(20) | pending/in_progress/completed/failed/rolled_back |
| source             | varchar(50) | dashboard/usb/auto                               |
| components_updated | jsonb       | Updated components                               |
| error_message      | text        | Error details                                    |
| started_at         | timestamptz | Start time                                       |
| completed_at       | timestamptz | Completion time                                  |
| duration_seconds   | integer     | Duration                                         |
| requires_reboot    | boolean     | Reboot needed                                    |
| initiated_by       | varchar(50) | User/system                                      |

#### update_backups

| Column             | Type          | Description          |
| ------------------ | ------------- | -------------------- |
| id                 | serial        | Primary key          |
| backup_path        | varchar(500)  | Backup file path     |
| update_event_id    | integer       | FK to update_events  |
| created_at         | timestamptz   | Creation time        |
| backup_size_mb     | decimal(10,2) | Size in MB           |
| components         | jsonb         | Backed up components |
| restoration_tested | boolean       | Tested flag          |
| notes              | text          | Notes                |

#### update_files

| Column             | Type         | Description       |
| ------------------ | ------------ | ----------------- |
| id                 | serial       | Primary key       |
| filename           | varchar(255) | File name         |
| file_path          | varchar(500) | Full path         |
| checksum_sha256    | varchar(64)  | SHA256 hash       |
| file_size_bytes    | bigint       | Size in bytes     |
| source             | varchar(50)  | Upload source     |
| uploaded_at        | timestamptz  | Upload time       |
| signature_verified | boolean      | Signature valid   |
| manifest           | jsonb        | Package manifest  |
| validation_status  | varchar(20)  | Validation status |
| applied            | boolean      | Applied flag      |

#### update_rollbacks

| Column                   | Type        | Description          |
| ------------------------ | ----------- | -------------------- |
| id                       | serial      | Primary key          |
| original_update_event_id | integer     | FK to update_events  |
| backup_id                | integer     | FK to update_backups |
| rollback_reason          | text        | Reason               |
| initiated_by             | varchar(50) | User/system          |
| started_at               | timestamptz | Start time           |
| completed_at             | timestamptz | Completion time      |
| success                  | boolean     | Success flag         |
| error_message            | text        | Error details        |

#### component_updates

| Column          | Type         | Description               |
| --------------- | ------------ | ------------------------- |
| id              | serial       | Primary key               |
| update_event_id | integer      | FK to update_events       |
| component_name  | varchar(100) | Component name            |
| component_type  | varchar(50)  | Type (service/config/etc) |
| version_from    | varchar(20)  | Previous version          |
| version_to      | varchar(20)  | New version               |
| status          | varchar(20)  | Status                    |
| started_at      | timestamptz  | Start time                |
| completed_at    | timestamptz  | Completion time           |
| error_message   | text         | Error details             |

---

### 005_chat_schema.sql - Chat

#### chat_conversations

| Column        | Type         | Description             |
| ------------- | ------------ | ----------------------- |
| id            | uuid         | Primary key (generated) |
| title         | varchar(255) | Conversation title      |
| created_at    | timestamptz  | Creation time           |
| updated_at    | timestamptz  | Last update             |
| deleted_at    | timestamptz  | Soft delete time        |
| message_count | integer      | Auto-updated count      |

**Indexes:**

- `idx_conversations_updated` on updated_at DESC
- `idx_conversations_deleted` on deleted_at

#### chat_messages

| Column          | Type        | Description              |
| --------------- | ----------- | ------------------------ |
| id              | uuid        | Primary key (generated)  |
| conversation_id | uuid        | FK to chat_conversations |
| role            | varchar(20) | user/assistant/system    |
| content         | text        | Message content          |
| thinking        | text        | LLM thinking (nullable)  |
| sources         | jsonb       | RAG sources (nullable)   |
| created_at      | timestamptz | Creation time            |

**Indexes:**

- `idx_messages_conversation` on conversation_id, created_at

**Triggers:**

- `update_message_count` - Auto-updates conversation.message_count

---

### 006_llm_jobs_schema.sql - LLM Jobs

#### llm_jobs

| Column          | Type        | Description                         |
| --------------- | ----------- | ----------------------------------- |
| id              | uuid        | Primary key (generated)             |
| conversation_id | uuid        | FK to chat_conversations            |
| status          | varchar(20) | pending/processing/completed/failed |
| prompt          | text        | User prompt                         |
| response        | text        | LLM response                        |
| error           | text        | Error message                       |
| created_at      | timestamptz | Creation time                       |
| updated_at      | timestamptz | Last update                         |

---

### 007_add_sources_to_messages.sql

Adds `sources` JSONB column to `chat_messages` for RAG source tracking.

---

### 008_llm_queue_schema.sql - LLM Queue

#### llm_queue

| Column     | Type        | Description      |
| ---------- | ----------- | ---------------- |
| id         | serial      | Primary key      |
| job_id     | uuid        | FK to llm_jobs   |
| priority   | integer     | Queue priority   |
| created_at | timestamptz | Queue time       |
| started_at | timestamptz | Processing start |

---

### 009_documents_schema.sql - Documents

#### documents

| Column        | Type         | Description                     |
| ------------- | ------------ | ------------------------------- |
| id            | uuid         | Primary key (generated)         |
| filename      | varchar(255) | Stored filename                 |
| original_name | varchar(255) | Original filename               |
| mime_type     | varchar(100) | MIME type                       |
| size_bytes    | bigint       | File size                       |
| minio_path    | varchar(500) | MinIO object path               |
| status        | varchar(20)  | pending/indexing/indexed/failed |
| chunk_count   | integer      | Number of chunks                |
| error_message | text         | Error details                   |
| created_at    | timestamptz  | Upload time                     |
| updated_at    | timestamptz  | Last update                     |
| indexed_at    | timestamptz  | Indexing completion             |

**Indexes:**

- `idx_documents_status` on status
- `idx_documents_created` on created_at DESC

#### document_chunks

| Column       | Type         | Description             |
| ------------ | ------------ | ----------------------- |
| id           | uuid         | Primary key (generated) |
| document_id  | uuid         | FK to documents         |
| chunk_index  | integer      | Chunk sequence          |
| content      | text         | Chunk text              |
| embedding_id | varchar(100) | Qdrant point ID         |
| created_at   | timestamptz  | Creation time           |

**Indexes:**

- `idx_chunks_document` on document_id

---

### 010_alert_config_schema.sql - Alert Configuration

#### alert_thresholds

| Column             | Type              | Description                               |
| ------------------ | ----------------- | ----------------------------------------- |
| id                 | serial            | Primary key                               |
| metric_type        | alert_metric_type | cpu, ram, disk, temperature               |
| warning_threshold  | decimal(5,2)      | Warning level                             |
| critical_threshold | decimal(5,2)      | Critical level                            |
| enabled            | boolean           | Enable/disable this alert                 |
| cooldown_seconds   | integer           | Min seconds between alerts (default: 300) |
| display_name       | varchar(100)      | UI display name                           |

#### alert_history

| Column            | Type              | Description                 |
| ----------------- | ----------------- | --------------------------- |
| id                | serial            | Primary key                 |
| metric_type       | alert_metric_type | Alert type                  |
| severity          | alert_severity    | warning/critical            |
| value             | decimal(10,2)     | Actual value                |
| threshold         | decimal(10,2)     | Threshold that was exceeded |
| triggered_at      | timestamptz       | Alert time                  |
| resolved_at       | timestamptz       | Resolution time             |
| notification_sent | boolean           | Notification status         |

---

### 011_llm_models_schema.sql - LLM Model Management

#### llm_model_catalog

| Column           | Type         | Description                       |
| ---------------- | ------------ | --------------------------------- |
| id               | varchar(100) | Primary key (e.g., 'qwen3:7b-q8') |
| name             | varchar(255) | Display name                      |
| description      | text         | Model description                 |
| size_bytes       | bigint       | Download size                     |
| ram_required_gb  | integer      | RAM requirement                   |
| category         | varchar(50)  | small/medium/large/xlarge         |
| capabilities     | jsonb        | ['coding', 'reasoning', etc.]     |
| jetson_tested    | boolean      | Tested on Jetson AGX Orin         |
| performance_tier | integer      | 1=fastest, 3=slowest              |

#### llm_installed_models

| Column            | Type         | Description                 |
| ----------------- | ------------ | --------------------------- |
| id                | varchar(100) | Primary key                 |
| status            | varchar(20)  | downloading/available/error |
| download_progress | integer      | 0-100 percent               |
| downloaded_at     | timestamptz  | Download completion         |
| last_used_at      | timestamptz  | Last usage                  |
| usage_count       | integer      | Usage counter               |
| is_default        | boolean      | Default model flag          |

#### llm_model_switches

| Column             | Type         | Description              |
| ------------------ | ------------ | ------------------------ |
| id                 | serial       | Primary key              |
| from_model         | varchar(100) | Previous model           |
| to_model           | varchar(100) | New model                |
| switch_duration_ms | integer      | Switch time              |
| triggered_by       | varchar(50)  | user/queue/workflow/auto |
| switched_at        | timestamptz  | Switch timestamp         |

---

### 013_appstore_schema.sql - App Store

#### installed_apps

| Column       | Type         | Description               |
| ------------ | ------------ | ------------------------- |
| id           | varchar(100) | Primary key               |
| name         | varchar(255) | App name                  |
| description  | text         | App description           |
| version      | varchar(50)  | Installed version         |
| category     | varchar(50)  | App category              |
| status       | varchar(20)  | installed/running/stopped |
| config       | jsonb        | App configuration         |
| installed_at | timestamptz  | Installation time         |

---

### 017_audit_log_schema.sql - Audit Logging

#### audit_logs

| Column        | Type         | Description         |
| ------------- | ------------ | ------------------- |
| id            | serial       | Primary key         |
| user_id       | integer      | FK to admin_users   |
| action        | varchar(100) | Action performed    |
| resource_type | varchar(50)  | Type of resource    |
| resource_id   | varchar(100) | Resource identifier |
| details       | jsonb        | Action details      |
| ip_address    | varchar(45)  | Client IP           |
| created_at    | timestamptz  | Action time         |

---

### 018_claude_terminal_schema.sql - Claude Terminal

#### claude_terminal_sessions

| Column     | Type        | Description       |
| ---------- | ----------- | ----------------- |
| id         | serial      | Primary key       |
| user_id    | integer     | FK to admin_users |
| query      | text        | User query        |
| response   | text        | Claude response   |
| context    | jsonb       | Session context   |
| created_at | timestamptz | Query time        |

---

### 020_telegram_config_schema.sql - Telegram Bot

#### telegram_config

| Column              | Type        | Description                               |
| ------------------- | ----------- | ----------------------------------------- |
| id                  | integer     | Primary key (always 1, singleton)         |
| bot_token_encrypted | text        | AES-256-GCM encrypted token               |
| bot_token_iv        | text        | Initialization vector for decryption      |
| bot_token_tag       | text        | GCM authentication tag                    |
| chat_id             | varchar(50) | Default chat ID for broadcasts            |
| enabled             | boolean     | Master switch for notifications           |
| alert_thresholds    | jsonb       | Alert threshold configuration (see below) |
| created_at          | timestamptz | Creation time                             |
| updated_at          | timestamptz | Last update (auto-updated via trigger)    |

**alert_thresholds JSON Schema:**

```json
{
  "cpu_warning": 80, // CPU % for warning
  "cpu_critical": 95, // CPU % for critical alert
  "ram_warning": 80, // RAM % for warning
  "ram_critical": 95, // RAM % for critical alert
  "disk_warning": 80, // Disk % for warning
  "disk_critical": 95, // Disk % for critical alert
  "gpu_warning": 85, // GPU % for warning
  "gpu_critical": 95, // GPU % for critical alert
  "temperature_warning": 75, // Temperature °C for warning
  "temperature_critical": 85, // Temperature °C for critical alert
  "notify_on_warning": false, // Send notifications on warning level
  "notify_on_critical": true, // Send notifications on critical level
  "notify_on_service_down": true, // Alert when services fail
  "notify_on_self_healing": true, // Alert on self-healing events
  "cooldown_minutes": 15 // Minimum minutes between repeated alerts
}
```

**Constraints:**

- `CHECK (id = 1)` - Single-row enforced (singleton pattern)
- Token encrypted with AES-256-GCM using JWT_SECRET as key

**Indexes:**

- `idx_telegram_config_enabled` on enabled

**Triggers:**

- `trigger_telegram_config_updated_at` - Auto-updates `updated_at` on changes

---

### 019_notification_events_schema.sql - Notification Events

#### notification_events

| Column               | Type         | Description                                       |
| -------------------- | ------------ | ------------------------------------------------- |
| id                   | serial       | Primary key                                       |
| event_type           | varchar(50)  | Event type (service_status, workflow_event, etc.) |
| event_category       | varchar(50)  | Category (status_change, completion, failure)     |
| source_service       | varchar(100) | Container or service name                         |
| severity             | varchar(20)  | info, warning, error, critical                    |
| title                | varchar(255) | Event title                                       |
| message              | text         | Event message                                     |
| metadata             | jsonb        | Additional event data                             |
| notification_sent    | boolean      | Whether notification was sent                     |
| notification_sent_at | timestamptz  | When notification was sent                        |
| notification_error   | text         | Error if sending failed                           |
| retry_count          | integer      | Number of retry attempts                          |
| created_at           | timestamptz  | Creation time                                     |

#### notification_settings

| Column                      | Type         | Description               |
| --------------------------- | ------------ | ------------------------- |
| id                          | serial       | Primary key               |
| user_id                     | integer      | FK to users               |
| channel                     | varchar(50)  | telegram, webhook, email  |
| enabled                     | boolean      | Channel enabled           |
| event_types                 | text[]       | Filtered event types      |
| min_severity                | varchar(20)  | Minimum severity to send  |
| rate_limit_per_minute       | integer      | Rate limit per minute     |
| rate_limit_per_hour         | integer      | Rate limit per hour       |
| quiet_hours_start           | time         | Quiet hours start         |
| quiet_hours_end             | time         | Quiet hours end           |
| telegram_chat_id            | varchar(100) | Telegram chat ID          |
| telegram_bot_token_override | varchar(255) | Optional custom bot token |
| webhook_url                 | varchar(500) | Webhook URL               |
| webhook_secret              | varchar(255) | Webhook secret            |
| created_at                  | timestamptz  | Creation time             |
| updated_at                  | timestamptz  | Last update               |

#### service_status_cache

| Column            | Type         | Description                    |
| ----------------- | ------------ | ------------------------------ |
| service_name      | varchar(100) | Primary key                    |
| container_name    | varchar(255) | Docker container name          |
| status            | varchar(50)  | running, stopped, exited, etc. |
| health            | varchar(50)  | healthy, unhealthy, starting   |
| last_status       | varchar(50)  | Previous status                |
| last_health       | varchar(50)  | Previous health                |
| status_changed_at | timestamptz  | When status changed            |
| last_checked_at   | timestamptz  | Last check time                |
| metadata          | jsonb        | Additional data                |

#### system_boot_events

| Column                         | Type         | Description             |
| ------------------------------ | ------------ | ----------------------- |
| id                             | serial       | Primary key             |
| boot_timestamp                 | timestamptz  | Boot time               |
| previous_shutdown_timestamp    | timestamptz  | Previous shutdown       |
| shutdown_reason                | varchar(100) | Reason for shutdown     |
| uptime_before_shutdown_seconds | integer      | Uptime before shutdown  |
| services_status_at_boot        | jsonb        | Services status at boot |
| boot_duration_ms               | integer      | Boot duration in ms     |
| notification_sent              | boolean      | Notification sent       |
| created_at                     | timestamptz  | Creation time           |

#### notification_rate_limits

| Column       | Type        | Description             |
| ------------ | ----------- | ----------------------- |
| id           | serial      | Primary key             |
| user_id      | integer     | FK to users             |
| channel      | varchar(50) | Notification channel    |
| event_type   | varchar(50) | Event type              |
| window_start | timestamptz | Rate limit window start |
| count        | integer     | Message count in window |

---

### 021_api_audit_logs_schema.sql - API Audit Logging

#### api_audit_logs

| Column          | Type         | Description                                      |
| --------------- | ------------ | ------------------------------------------------ |
| id              | serial       | Primary key                                      |
| timestamp       | timestamptz  | Request timestamp                                |
| user_id         | integer      | FK to admin_users (nullable for unauth requests) |
| username        | varchar(255) | Username at time of request                      |
| action_type     | varchar(50)  | HTTP method (GET, POST, PUT, DELETE, PATCH)      |
| target_endpoint | varchar(500) | Full API endpoint path                           |
| request_method  | varchar(10)  | HTTP method (for efficient filtering)            |
| request_payload | jsonb        | Sanitized request body (no passwords/tokens)     |
| response_status | integer      | HTTP response status code                        |
| duration_ms     | integer      | Request processing time in ms                    |
| ip_address      | varchar(45)  | Client IP address (IPv4/IPv6)                    |
| user_agent      | text         | Client user agent string                         |
| error_message   | text         | Error details for failed requests                |

**Indexes:**

- `idx_api_audit_logs_timestamp` on timestamp DESC
- `idx_api_audit_logs_user_id` on user_id, timestamp DESC
- `idx_api_audit_logs_action_type` on action_type, timestamp DESC
- `idx_api_audit_logs_status` on response_status, timestamp DESC
- `idx_api_audit_logs_date_action` on DATE(timestamp), action_type
- `idx_api_audit_logs_endpoint` on target_endpoint, timestamp DESC
- `idx_api_audit_logs_errors` on timestamp DESC WHERE response_status >= 400

**Views:**

- `api_audit_daily_stats` - Daily aggregated request statistics
- `api_audit_endpoint_stats` - Endpoint usage and performance stats

**Functions:**

- `cleanup_old_api_audit_logs(retention_days)` - Remove logs older than N days (default: 90)

**Retention:** 90 days (recommended)

---

### 022_telegram_notification_system.sql - Telegram Notification System

Extended columns added to `telegram_config`:

| Column                   | Type         | Description                   |
| ------------------------ | ------------ | ----------------------------- |
| notification_preferences | jsonb        | Notification type preferences |
| test_message_sent_at     | timestamptz  | Last test message time        |
| last_error               | text         | Last error message            |
| last_error_at            | timestamptz  | Last error time               |
| connection_verified      | boolean      | Connection verified flag      |
| connection_verified_at   | timestamptz  | Verification time             |
| bot_username             | varchar(100) | Bot username from getMe       |

**notification_preferences JSON Schema:**

```json
{
  "system_alerts": true,
  "self_healing_events": true,
  "service_status_changes": true,
  "login_alerts": true,
  "daily_summary": false,
  "quiet_hours_enabled": false,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "07:00"
}
```

#### telegram_rate_limits

| Column          | Type        | Description             |
| --------------- | ----------- | ----------------------- |
| id              | serial      | Primary key             |
| chat_id         | varchar(50) | Telegram chat ID        |
| window_start    | timestamptz | Rate limit window start |
| message_count   | integer     | Messages in window      |
| last_message_at | timestamptz | Last message time       |

**Purpose:** Enforces Telegram API rate limits (30 msg/sec per chat)

#### telegram_message_log

| Column          | Type         | Description                              |
| --------------- | ------------ | ---------------------------------------- |
| id              | serial       | Primary key                              |
| chat_id         | varchar(50)  | Telegram chat ID                         |
| message_type    | varchar(50)  | alert, test, notification, daily_summary |
| severity        | varchar(20)  | info, warning, error, critical           |
| title           | varchar(255) | Message title                            |
| message_text    | text         | Full message content                     |
| message_id      | integer      | Telegram message ID                      |
| metadata        | jsonb        | Additional data                          |
| sent_at         | timestamptz  | Send time                                |
| delivered       | boolean      | Delivery success                         |
| error_message   | text         | Error if failed                          |
| retry_count     | integer      | Retry attempts                           |
| source_event_id | integer      | Reference to notification_events         |
| triggered_by    | varchar(100) | system, user:{username}, scheduler       |

**Retention:** 30 days

#### telegram_alert_cooldowns

| Column        | Type         | Description                                  |
| ------------- | ------------ | -------------------------------------------- |
| id            | serial       | Primary key                                  |
| alert_type    | varchar(100) | Alert type (cpu_critical, service_down:name) |
| chat_id       | varchar(50)  | Telegram chat ID                             |
| last_alert_at | timestamptz  | Last alert time                              |
| alert_count   | integer      | Total alert count                            |

**Purpose:** Prevents alert spam with configurable cooldown per alert type

**Functions:**

- `check_telegram_rate_limit(chat_id, max_per_sec, max_per_min)` - Check and increment rate limit
- `check_telegram_alert_cooldown(alert_type, chat_id, cooldown_min)` - Check if alert can be sent
- `log_telegram_message(...)` - Log sent message
- `cleanup_telegram_rate_limits()` - Clean entries older than 1 hour
- `cleanup_telegram_message_logs(retention_days)` - Clean old message logs

**Views:**

- `v_telegram_stats_24h` - Message statistics for last 24 hours
- `v_telegram_active_cooldowns` - Currently active cooldowns
- `v_telegram_recent_messages` - Last 50 messages

---

### 023_api_keys_schema.sql - API Keys for External Access

#### api_keys

| Column                | Type         | Description                      |
| --------------------- | ------------ | -------------------------------- |
| id                    | serial       | Primary key                      |
| key_hash              | varchar(128) | bcrypt hash of API key           |
| key_prefix            | varchar(8)   | First 8 chars for identification |
| name                  | varchar(100) | Key name                         |
| description           | text         | Key description                  |
| created_by            | integer      | FK to admin_users                |
| created_at            | timestamptz  | Creation time                    |
| last_used_at          | timestamptz  | Last usage                       |
| expires_at            | timestamptz  | Expiration time                  |
| is_active             | boolean      | Active status                    |
| rate_limit_per_minute | integer      | Rate limit (default: 60)         |
| allowed_endpoints     | text[]       | Allowed endpoint patterns        |

#### api_key_usage

| Column           | Type         | Description     |
| ---------------- | ------------ | --------------- |
| id               | serial       | Primary key     |
| api_key_id       | integer      | FK to api_keys  |
| endpoint         | varchar(255) | Called endpoint |
| method           | varchar(10)  | HTTP method     |
| status_code      | integer      | Response status |
| response_time_ms | integer      | Response time   |
| request_ip       | varchar(45)  | Client IP       |
| created_at       | timestamptz  | Request time    |

---

### 024_telegram_app_schema.sql - Telegram Bot App

#### telegram_setup_sessions

| Column              | Type                  | Description                           |
| ------------------- | --------------------- | ------------------------------------- |
| id                  | serial                | Primary key                           |
| setup_token         | varchar(64)           | Unique setup token                    |
| bot_token_encrypted | bytea                 | AES-256 encrypted bot token           |
| bot_username        | varchar(100)          | Bot username                          |
| chat_id             | bigint                | Connected chat ID                     |
| user_id             | integer               | FK to admin_users                     |
| status              | telegram_setup_status | pending/token_valid/completed/expired |
| expires_at          | timestamptz           | Session expiration                    |

#### telegram_notification_rules

| Column           | Type                      | Description                       |
| ---------------- | ------------------------- | --------------------------------- |
| id               | serial                    | Primary key                       |
| name             | varchar(100)              | Rule name                         |
| event_source     | notification_event_source | claude/system/n8n/services/custom |
| event_type       | varchar(100)              | Event type filter                 |
| severity_filter  | varchar(20)[]             | Severity levels to match          |
| message_template | text                      | Message template                  |
| enabled          | boolean                   | Rule enabled                      |
| created_at       | timestamptz               | Creation time                     |

---

### 025-028 - Maintenance Migrations

These migrations contain fixes and incremental updates:

- **025_telegram_functions_fix.sql**: Fixes for Telegram notification functions
- **026_fix_default_model.sql**: Fix for default model handling
- **027_model_ollama_name.sql**: Add ollama_name column to model catalog
- **028_fix_user_references.sql**: Fix user reference constraints

---

### 029_model_capabilities_schema.sql - Model Capabilities

Adds capability columns to `llm_model_catalog`:

| Column            | Type    | Description                                                 |
| ----------------- | ------- | ----------------------------------------------------------- |
| supports_thinking | boolean | Model supports extended thinking mode (default: false)      |
| rag_optimized     | boolean | Model is optimized for RAG retrieval tasks (default: false) |

**Data Seeded:**

- `supports_thinking = true`: qwen3:7b-q8, qwen3:14b-q8, qwen3:32b-q4
- `rag_optimized = true`: qwen3:7b-q8, qwen3:14b-q8, qwen3:32b-q4, llama3.1:70b-q4

**Indexes:**

- `idx_llm_catalog_capabilities` on (supports_thinking, rag_optimized)

---

### 030_model_performance_metrics.sql - Model Performance Tracking

#### model_performance_metrics

| Column                 | Type         | Description                                                                     |
| ---------------------- | ------------ | ------------------------------------------------------------------------------- |
| id                     | serial       | Primary key                                                                     |
| model_id               | varchar(100) | Model identifier                                                                |
| job_id                 | uuid         | Associated job ID                                                               |
| job_type               | varchar(50)  | Job type (chat, rag, etc.)                                                      |
| tokens_generated       | integer      | Number of tokens generated                                                      |
| prompt_tokens          | integer      | Number of prompt tokens                                                         |
| time_to_first_token_ms | integer      | Time to first token in ms                                                       |
| total_duration_ms      | integer      | Total generation duration in ms                                                 |
| tokens_per_second      | numeric      | Throughput (GENERATED STORED, computed from tokens_generated/total_duration_ms) |
| thinking_enabled       | boolean      | Whether thinking mode was active                                                |
| context_length         | integer      | Context length used                                                             |
| created_at             | timestamptz  | Record creation time                                                            |

**View:**

- `model_performance_stats` - 7-day aggregated statistics grouped by model_id and job_type

**Functions:**

- `record_model_performance()` - Insert a new performance record
- `cleanup_old_performance_metrics()` - Remove records older than 30 days (30-day retention)

**Indexes:**

- `idx_perf_model_id` on model_id
- `idx_perf_created_at` on created_at DESC
- `idx_perf_job_type` on job_type

---

### 031_datentabellen_database.sql - Datentabellen Config

#### datentabellen_config

| Column       | Type         | Description                            |
| ------------ | ------------ | -------------------------------------- |
| id           | serial       | Primary key                            |
| data_db_host | varchar(255) | Data database hostname                 |
| data_db_port | integer      | Data database port                     |
| data_db_name | varchar(100) | Data database name                     |
| data_db_user | varchar(100) | Data database user                     |
| is_enabled   | boolean      | Feature enabled flag                   |
| created_at   | timestamptz  | Creation time                          |
| updated_at   | timestamptz  | Last update (auto-updated via trigger) |

**Default Row:** host=postgres-db, port=5432, db=arasul_data_db, user=arasul_data, enabled=true

**Triggers:**

- Auto-update `updated_at` on row change

---

### 032_telegram_multi_bot_schema.sql - Multi-Bot Telegram (519 lines)

Major schema overhaul replacing the single-bot Telegram architecture with a multi-bot system.

**Dropped Tables:** telegram_llm_messages, telegram_llm_sessions, telegram_api_keys

#### telegram_bots

| Column              | Type         | Description                     |
| ------------------- | ------------ | ------------------------------- |
| id                  | serial       | Primary key                     |
| bot_token_encrypted | text         | AES-256-GCM encrypted bot token |
| bot_token_iv        | text         | Initialization vector           |
| bot_token_tag       | text         | GCM authentication tag          |
| bot_username        | varchar(100) | Bot username from Telegram      |
| bot_name            | varchar(255) | Display name                    |
| llm_model           | varchar(100) | Assigned LLM model              |
| llm_system_prompt   | text         | System prompt for LLM           |
| webhook_url         | text         | Webhook endpoint URL            |
| is_active           | boolean      | Bot active flag                 |
| created_at          | timestamptz  | Creation time                   |
| updated_at          | timestamptz  | Last update                     |

#### telegram_bot_commands

| Column            | Type         | Description                 |
| ----------------- | ------------ | --------------------------- |
| id                | serial       | Primary key                 |
| bot_id            | integer      | FK to telegram_bots         |
| command           | varchar(100) | Slash command (e.g. /start) |
| description       | text         | Command description         |
| response_template | text         | Response template           |
| is_active         | boolean      | Command active flag         |

#### telegram_bot_chats

| Column       | Type         | Description                      |
| ------------ | ------------ | -------------------------------- |
| id           | serial       | Primary key                      |
| bot_id       | integer      | FK to telegram_bots              |
| chat_id      | bigint       | Telegram chat ID                 |
| chat_type    | varchar(20)  | private/group/supergroup/channel |
| chat_title   | varchar(255) | Chat name                        |
| is_active    | boolean      | Connection active                |
| connected_at | timestamptz  | Connection time                  |

#### telegram_bot_sessions

| Column     | Type        | Description                |
| ---------- | ----------- | -------------------------- |
| id         | serial      | Primary key                |
| bot_id     | integer     | FK to telegram_bots        |
| chat_id    | bigint      | Telegram chat ID           |
| user_id    | bigint      | Telegram user ID           |
| messages   | jsonb       | Conversation history array |
| created_at | timestamptz | Session start              |
| updated_at | timestamptz | Last activity              |

**Modified Tables:**

- `telegram_notification_rules` - Added bot_id column
- `telegram_notification_history` - Added bot_id column
- `telegram_setup_sessions` - Added bot_id, bot_name, llm_provider columns

**Functions:**

- `create_telegram_bot()` - Create a new bot entry with encrypted token
- `add_telegram_bot_chat()` - Register a chat connection for a bot
- `get_or_create_bot_session()` - Retrieve or initialize a conversation session
- `add_message_to_session()` - Append a message to session history
- `clear_bot_session()` - Reset conversation history for a session
- `complete_multibot_setup()` - Finalize bot setup flow

**Indexes:** 13 indexes created; data migration from old tables performed.

---

### 033_telegram_voice_support.sql - Telegram Voice & Rate Limiting

Adds voice support and user restrictions to `telegram_bots`:

| Column             | Type    | Description                                  |
| ------------------ | ------- | -------------------------------------------- |
| openai_api_key     | text    | AES-256 encrypted OpenAI API key for Whisper |
| voice_enabled      | boolean | Enable voice message handling                |
| max_voice_duration | integer | Maximum voice duration in seconds            |
| allowed_users      | jsonb   | Array of allowed Telegram user IDs           |
| restrict_users     | boolean | Enforce allowed_users whitelist              |

#### telegram_rate_limits

| Column                  | Type        | Description                 |
| ----------------------- | ----------- | --------------------------- |
| id                      | serial      | Primary key                 |
| bot_id                  | integer     | FK to telegram_bots         |
| chat_id                 | bigint      | Telegram chat ID            |
| user_id                 | bigint      | Telegram user ID            |
| request_count           | integer     | Requests in current window  |
| window_start            | timestamptz | Window start time           |
| max_requests_per_minute | integer     | Per-minute rate limit       |
| max_requests_per_hour   | integer     | Per-hour rate limit         |
| is_rate_limited         | boolean     | Currently rate limited flag |
| cooldown_until          | timestamptz | Rate limit expiry time      |

**Functions:**

- `check_rate_limit()` - Evaluate and enforce rate limits for a user/chat
- `is_user_allowed()` - Check if a user is in the allowed_users whitelist

---

### 034_telegram_app_status_schema.sql - Telegram App Status

#### telegram_app_status

| Column               | Type        | Description                 |
| -------------------- | ----------- | --------------------------- |
| id                   | serial      | Primary key                 |
| user_id              | integer     | FK to admin_users (UNIQUE)  |
| is_enabled           | boolean     | App enabled for this user   |
| icon_visible         | boolean     | App icon shown in dashboard |
| first_bot_created_at | timestamptz | When first bot was created  |
| last_activity_at     | timestamptz | Last activity timestamp     |
| settings             | jsonb       | User-specific settings      |

**Functions:**

- `ensure_telegram_app_status()` - Create status row if not exists for a user
- `activate_telegram_app()` - Enable the app and make icon visible
- `update_telegram_app_on_bot_change()` - Sync app status on bot creation/deletion

**Triggers:**

- Auto-trigger on bot creation in `telegram_bots` to activate the app status for the owner

---

### 035_model_types.sql - Model Type Classification

Adds type classification to `llm_model_catalog`:

| Column     | Type        | Description                                                      |
| ---------- | ----------- | ---------------------------------------------------------------- |
| model_type | varchar(20) | Model category: 'llm', 'ocr', 'vision', 'audio' (default: 'llm') |

**Constraint:** CHECK (model_type IN ('llm', 'ocr', 'vision', 'audio'))

**Index:**

- `idx_model_catalog_type` on model_type

**Data Seeded (OCR models):**
| Model | Size | Type |
|-------|------|------|
| tesseract:latest | 536 MB | ocr |
| paddleocr:latest | 4 GB | ocr |

---

### 036_rag_performance.sql - RAG Performance Indexes

Performance indexes for German-language document retrieval:

- **`idx_document_chunks_text_search_de`** - GIN index on `to_tsvector('german', chunk_text)` in `document_chunks` for German full-text search
- **`idx_documents_space_status`** - Composite index on `(space_id, status)` in `documents` WHERE `deleted_at IS NULL` (partial index)

---

### 037_fix_foreign_keys_and_indexes.sql - FK and Index Fixes

Fixes foreign key constraints with explicit ON DELETE actions for tables from migrations 004, 009, 023, and 024.

**Composite Indexes Added:**

| Table         | Index                                  | Columns                     |
| ------------- | -------------------------------------- | --------------------------- |
| chat_messages | idx_chat_messages_conversation_created | conversation_id, created_at |
| documents     | idx_documents_space_id                 | space_id                    |
| documents     | idx_documents_status_uploaded          | status, uploaded_at         |

---

### 038_system_settings.sql - System Setup Wizard

Introduces the `system_settings` singleton table that persists the state of the first-boot Setup Wizard (Phase 6).

#### system_settings

| Column             | Type         | Description                                 |
| ------------------ | ------------ | ------------------------------------------- |
| id                 | integer      | Primary key (always 1, singleton)           |
| setup_completed    | boolean      | Whether the Setup Wizard has been completed |
| setup_completed_at | timestamptz  | Timestamp when setup was marked complete    |
| setup_completed_by | integer      | FK to admin_users (who completed the setup) |
| company_name       | varchar(255) | Company name entered during setup           |
| hostname           | varchar(255) | Device hostname configured during setup     |
| selected_model     | varchar(255) | LLM model selected during setup             |
| setup_step         | integer      | Last saved wizard step (for resume support) |
| created_at         | timestamptz  | Row creation time                           |
| updated_at         | timestamptz  | Last update (auto-updated via trigger)      |

**Constraints:**

- `CHECK (id = 1)` - Single-row enforced (singleton pattern)
- `setup_completed_by` FK references `admin_users(id)` ON DELETE SET NULL

**Default Row:** Inserted on migration with `setup_completed = false`, `setup_step = 1`.

**Functions:**

- `is_setup_completed()` - Returns boolean; queries `system_settings` to check whether setup is done. Used by the public `GET /api/system/setup-status` endpoint without requiring a DB join.
- `update_system_settings_timestamp()` - Trigger function that sets `updated_at = NOW()` on every UPDATE.

**Triggers:**

- `trg_system_settings_updated` - BEFORE UPDATE trigger on `system_settings`; calls `update_system_settings_timestamp()` to keep `updated_at` current.

---

### 039_parent_chunks_schema.sql - Hierarchical Document Chunks

Supports hierarchical chunking: parent chunks (~2000 tokens) for LLM context, child chunks (~400 tokens) for precise vector retrieval.

#### document_parent_chunks

| Column       | Type        | Description               |
| ------------ | ----------- | ------------------------- |
| id           | uuid        | Primary key (generated)   |
| document_id  | uuid        | FK to documents (CASCADE) |
| parent_index | integer     | Parent chunk sequence     |
| chunk_text   | text        | Parent chunk text         |
| char_start   | integer     | Start character offset    |
| char_end     | integer     | End character offset      |
| word_count   | integer     | Word count                |
| token_count  | integer     | Token count               |
| created_at   | timestamptz | Creation time             |

**Constraints:**

- `UNIQUE(document_id, parent_index)`

**Columns added to `document_chunks`:**

| Column          | Type    | Description                           |
| --------------- | ------- | ------------------------------------- |
| parent_chunk_id | uuid    | FK to document_parent_chunks          |
| child_index     | integer | Child chunk index within parent chunk |

**Indexes:**

- `idx_document_chunks_parent` on document_chunks(parent_chunk_id)
- `idx_parent_chunks_document` on document_parent_chunks(document_id)

---

### 040_filter_aware_statistics.sql - Document Statistics Function

**Function:** `get_filtered_document_statistics(p_space_id, p_status, p_category_id) RETURNS TABLE`

Filter-aware document statistics function. All parameters are optional (NULL = no filter).

Returns: `total_documents`, `indexed_documents`, `pending_documents`, `failed_documents`, `total_chunks`, `total_size_bytes`, `documents_by_category` (JSONB).

---

### 041_context_management_schema.sql - Context Management System

Compaction, memory, token-tracking, and model context window management.

**Columns added to `chat_conversations`:**

| Column                   | Type        | Description                     |
| ------------------------ | ----------- | ------------------------------- |
| compaction_summary       | text        | Summary from context compaction |
| compaction_token_count   | integer     | Token count after compaction    |
| compaction_message_count | integer     | Messages compacted              |
| last_compacted_at        | timestamptz | Last compaction time            |

**Columns added to `llm_jobs`:**

| Column              | Type    | Description            |
| ------------------- | ------- | ---------------------- |
| prompt_tokens       | integer | Prompt token count     |
| completion_tokens   | integer | Completion token count |
| context_window_used | integer | Context window used    |

**Columns added to `llm_model_catalog`:**

| Column          | Type    | Description                         |
| --------------- | ------- | ----------------------------------- |
| context_window  | integer | Model context window size           |
| recommended_ctx | integer | Recommended context (default: 8192) |

**Columns added to `system_settings`:**

| Column                | Type        | Description                 |
| --------------------- | ----------- | --------------------------- |
| ai_profile_yaml       | text        | AI profile YAML config      |
| ai_profile_updated_at | timestamptz | AI profile last update time |

#### ai_memories

| Column                 | Type         | Description                         |
| ---------------------- | ------------ | ----------------------------------- |
| id                     | uuid         | Primary key (generated)             |
| type                   | varchar(20)  | fact/decision/preference            |
| content                | text         | Memory content                      |
| source_conversation_id | bigint       | FK to chat_conversations (SET NULL) |
| qdrant_point_id        | uuid         | Qdrant vector point ID              |
| importance             | decimal(3,2) | Importance score (default: 0.5)     |
| created_at             | timestamptz  | Creation time                       |
| updated_at             | timestamptz  | Last update                         |
| is_active              | boolean      | Active flag (default: true)         |

**Indexes:**

- `idx_ai_memories_type` on type
- `idx_ai_memories_active` on is_active WHERE is_active = TRUE
- `idx_ai_memories_created` on created_at DESC

#### compaction_log

| Column             | Type         | Description                          |
| ------------------ | ------------ | ------------------------------------ |
| id                 | serial       | Primary key                          |
| conversation_id    | bigint       | FK to chat_conversations (CASCADE)   |
| messages_compacted | integer      | Number of messages compacted         |
| tokens_before      | integer      | Token count before compaction        |
| tokens_after       | integer      | Token count after compaction         |
| compression_ratio  | decimal(5,2) | Compression ratio                    |
| memories_extracted | integer      | Memories extracted during compaction |
| model_used         | varchar(100) | Model used for compaction            |
| duration_ms        | integer      | Compaction duration in ms            |
| created_at         | timestamptz  | Record creation time                 |

**Functions:**

- `cleanup_old_compaction_logs()` - Remove records older than 30 days

**Retention:** 30 days

---

### 042_projects_schema.sql - Project System

Adds project system for grouping conversations with system prompts and knowledge spaces.

#### projects

| Column             | Type         | Description                         |
| ------------------ | ------------ | ----------------------------------- |
| id                 | uuid         | Primary key (generated)             |
| name               | varchar(100) | Project name                        |
| description        | text         | Project description                 |
| system_prompt      | text         | System prompt for project chats     |
| icon               | varchar(50)  | Icon identifier (default: 'folder') |
| color              | varchar(7)   | Hex color (default: '#45ADFF')      |
| knowledge_space_id | uuid         | FK to knowledge_spaces (SET NULL)   |
| sort_order         | integer      | Display order                       |
| created_at         | timestamptz  | Creation time                       |
| updated_at         | timestamptz  | Last update                         |

**Column added to `chat_conversations`:**

| Column     | Type | Description    |
| ---------- | ---- | -------------- |
| project_id | uuid | FK to projects |

**Indexes:**

- `idx_conversations_project` on chat_conversations(project_id)
- `idx_projects_sort` on projects(sort_order, created_at DESC)

---

### 043_default_project_and_constraints.sql - Default Project

Ensures every chat belongs to a project. Creates "Allgemein" as the default project.

**Column added to `projects`:**

| Column     | Type    | Description          |
| ---------- | ------- | -------------------- |
| is_default | boolean | Default project flag |

**Data:** Inserts "Allgemein" default project (icon: inbox, color: #94A3B8).

**Constraint:** `chat_conversations.project_id` changed to NOT NULL.

**Indexes:**

- `idx_conversations_updated` on chat_conversations(updated_at DESC) WHERE deleted_at IS NULL

---

### 044_knowledge_graph_schema.sql - Knowledge Graph

Stores entities and relations extracted from documents for graph-enriched RAG.

**Extension:** `pg_trgm` (trigram similarity)

#### kg_entities

| Column        | Type        | Description                      |
| ------------- | ----------- | -------------------------------- |
| id            | serial      | Primary key                      |
| name          | text        | Entity name                      |
| entity_type   | text        | Person/Organisation/Produkt/etc. |
| properties    | jsonb       | Additional properties            |
| mention_count | integer     | Number of mentions (default: 1)  |
| created_at    | timestamptz | Creation time                    |
| updated_at    | timestamptz | Last update (auto-trigger)       |

**Constraints:**

- `UNIQUE(name, entity_type)`

#### kg_entity_documents

| Column        | Type        | Description                            |
| ------------- | ----------- | -------------------------------------- |
| entity_id     | integer     | FK to kg_entities (CASCADE), PK part   |
| document_id   | uuid        | FK to documents (CASCADE), PK part     |
| mention_count | integer     | Mentions in this document (default: 1) |
| created_at    | timestamptz | Creation time                          |

**Primary Key:** (entity_id, document_id)

#### kg_relations

| Column             | Type        | Description                    |
| ------------------ | ----------- | ------------------------------ |
| id                 | serial      | Primary key                    |
| source_entity_id   | integer     | FK to kg_entities (CASCADE)    |
| target_entity_id   | integer     | FK to kg_entities (CASCADE)    |
| relation_type      | text        | Relation label                 |
| context            | text        | Contextual snippet             |
| properties         | jsonb       | Additional properties          |
| weight             | real        | Relation weight (default: 1.0) |
| source_document_id | uuid        | FK to documents (SET NULL)     |
| created_at         | timestamptz | Creation time                  |

**Constraints:**

- `UNIQUE(source_entity_id, target_entity_id, relation_type)`

**Indexes:**

- `idx_kg_entities_type` on kg_entities(entity_type)
- `idx_kg_entities_name_trgm` GIN index on kg_entities(name) for trigram similarity
- `idx_kg_relations_source` on kg_relations(source_entity_id)
- `idx_kg_relations_target` on kg_relations(target_entity_id)
- `idx_kg_relations_type` on kg_relations(relation_type)
- `idx_kg_entity_documents_doc` on kg_entity_documents(document_id)

**Triggers:**

- `kg_entities_updated` - Auto-updates `updated_at` on kg_entities changes

---

### 045_knowledge_graph_refinement.sql - Knowledge Graph Refinement

Adds entity resolution tracking for LLM-based graph refinement.

**Columns added to `kg_entities`:**

| Column       | Type    | Description                                      |
| ------------ | ------- | ------------------------------------------------ |
| refined      | boolean | Whether entity has been refined (default: false) |
| canonical_id | integer | Self-FK for entity resolution/merging            |

**Columns added to `kg_relations`:**

| Column  | Type    | Description                                        |
| ------- | ------- | -------------------------------------------------- |
| refined | boolean | Whether relation has been refined (default: false) |

**Indexes:**

- `idx_kg_entities_unrefined` on kg_entities(refined) WHERE refined = FALSE
- `idx_kg_relations_unrefined` on kg_relations(refined) WHERE refined = FALSE AND relation_type = 'VERWANDT_MIT'
- `idx_kg_entities_canonical` on kg_entities(canonical_id) WHERE canonical_id IS NOT NULL
- `idx_kg_entities_name_lower` on kg_entities(LOWER(name))

---

### 046_chat_settings.sql - Per-Chat Settings

Persists per-chat preferences (RAG, thinking mode, model, knowledge space) across sessions.

**Columns added to `chat_conversations`:**

| Column             | Type         | Default | Description               |
| ------------------ | ------------ | ------- | ------------------------- |
| use_rag            | boolean      | false   | RAG enabled for this chat |
| use_thinking       | boolean      | true    | Thinking mode enabled     |
| preferred_model    | varchar(100) | NULL    | Preferred LLM model       |
| preferred_space_id | uuid         | NULL    | Preferred knowledge space |

---

### 047_telegram_rag.sql - Telegram Bot RAG Configuration

Adds RAG (Retrieval-Augmented Generation) settings to `telegram_bots`:

| Column            | Type    | Default | Description                                               |
| ----------------- | ------- | ------- | --------------------------------------------------------- |
| rag_enabled       | boolean | false   | Whether RAG is enabled for this bot                       |
| rag_space_ids     | uuid[]  | NULL    | Array of space IDs the bot can access (NULL = all spaces) |
| rag_show_sources  | boolean | true    | Whether to show sources in responses                      |
| rag_context_limit | integer | 2000    | Maximum context length for RAG                            |

**Notes:**

- Master Bot: `rag_space_ids = NULL` means access to all spaces
- Custom Bots: `rag_space_ids = '{uuid1,uuid2}'` restricts to specific spaces

---

### 048_fix_project_id_constraint.sql - Project FK Fix

Fixes constraint conflict between 042 (ON DELETE SET NULL) and 043 (NOT NULL).

Changes `chat_conversations.project_id` FK to ON DELETE RESTRICT. The backend handles reassigning conversations before deleting a project.

**Constraint:** `fk_conversations_project` FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT

---

### 049_cleanup_stale_tables.sql - Remove Stale Objects

Removes unused tables, views, and functions from the old singleton Telegram notification system (migration 022), superseded by the multi-bot architecture (032+).

**Dropped Views:** `v_telegram_stats_24h`, `v_telegram_active_cooldowns`, `v_telegram_recent_messages`

**Dropped Functions:** `check_telegram_rate_limit()`, `check_telegram_alert_cooldown()`, `log_telegram_message()`, `cleanup_telegram_rate_limits()`, `cleanup_telegram_message_logs()`

**Dropped Tables:** `telegram_alert_cooldowns`, `telegram_message_log`

---

### 050_scheduled_cleanup_and_fk_fixes.sql - Consolidated Cleanup & FK Fixes

**FK Fix:** Ensures `llm_jobs.conversation_id` has `ON DELETE CASCADE` (idempotent DROP + ADD).

**Function:** `run_all_cleanups() RETURNS JSONB`

Calls all 17 cleanup functions in isolation (each wrapped in its own exception handler). Returns a JSONB object with per-function status, timing, and a `_summary` key with totals.

| Cleanup Function                      | Source Migration | Retention Policy                           |
| ------------------------------------- | ---------------- | ------------------------------------------ |
| `cleanup_old_metrics()`               | 001              | 7d metrics, 30d events/restarts            |
| `cleanup_expired_auth_data()`         | 002              | Expired tokens/sessions, 7d login attempts |
| `cleanup_service_failures()`          | 003              | 1h failures, 7d actions, 30d reboots       |
| `cleanup_old_update_files()`          | 004              | 90d, keep latest 10                        |
| `cleanup_old_update_events()`         | 004              | 180d, keep latest 20                       |
| `cleanup_deleted_chats()`             | 005              | 30d after soft-delete                      |
| `cleanup_old_llm_jobs()`              | 006              | 1h after completion                        |
| `cleanup_stale_llm_jobs()`            | 006              | 10min timeout on streaming jobs            |
| `cleanup_old_access_logs()`           | 009              | 30d                                        |
| `cleanup_old_alert_history()`         | 010              | Trims to max_history_entries setting       |
| `cleanup_old_app_events()`            | 013              | 30d                                        |
| `cleanup_old_audit_logs()`            | 017              | 90d (default)                              |
| `cleanup_old_notification_events()`   | 019              | 30d events, 1d rate limits                 |
| `cleanup_old_api_audit_logs()`        | 021              | 90d (default)                              |
| `cleanup_expired_telegram_sessions()` | 024              | Expires pending sessions past expiry time  |
| `cleanup_old_performance_metrics()`   | 030              | 30d                                        |
| `cleanup_old_compaction_logs()`       | 041              | 30d                                        |

**Usage:**

```sql
-- From backend scheduler or cron:
SELECT run_all_cleanups();

-- Host cron example (daily at 3 AM):
-- 0 3 * * * psql -U arasul -d arasul_db -c "SELECT run_all_cleanups()"
```

---

### 051_fix_model_catalog_ollama_names.sql - Fix Ollama Registry Names

Corrects `ollama_name` mappings and `size_bytes` values in `llm_model_catalog`. The original migration 027 used incorrect quantization suffixes (e.g., `qwen3:14b` instead of `qwen3:14b-q8_0`).

**Corrections:**

| Model ID        | Old ollama_name | Corrected ollama_name | Corrected Size |
| --------------- | --------------- | --------------------- | -------------- |
| qwen3:14b-q8    | qwen3:14b       | qwen3:14b-q8_0        | 15 GB          |
| qwen3:7b-q8     | qwen3:8b        | qwen3:8b-q8_0         | 8 GB           |
| mistral:7b-q8   | mistral:7b      | mistral:7b            | 4.1 GB         |
| gemma2:9b-q8    | gemma2:9b       | gemma2:9b             | 5.4 GB         |
| qwen3:32b-q4    | qwen3:32b       | qwen3:32b             | 20 GB          |
| llama3.1:70b-q4 | llama3.1:70b    | llama3.1:70b          | 40 GB          |
| llama3.1:8b     | (unchanged)     | (unchanged)           | 4.9 GB         |

---

### 052_document_unique_content_hash.sql - Document Deduplication

Adds a partial unique constraint on `content_hash` to prevent duplicate documents.

**Index:** `idx_documents_unique_content_hash` UNIQUE on documents(content_hash) WHERE deleted_at IS NULL AND status <> 'deleted'

---

### 053_update_thinking_models.sql - Update Thinking Model Catalog

Updates `supports_thinking = true` for newly supported thinking-capable models (Ollama 0.9.0+).

**Models updated:** DeepSeek-R1 variants, QwQ, DeepSeek-v3.1, Qwen3.5, Magistral, Nemotron, GLM-4.7

---

### 054_schema_hardening.sql - Schema Hardening

Adds missing FK constraints and indexes identified in schema audit.

**FK Constraints Added:**

- `fk_app_configurations_app_id` on app_configurations(app_id) REFERENCES app_installations(app_id) ON DELETE CASCADE
- `fk_app_dependencies_app_id` on app_dependencies(app_id) REFERENCES app_installations(app_id) ON DELETE CASCADE

**Indexes Added:**

- `idx_kg_entity_documents_entity_id` on kg_entity_documents(entity_id)
- `idx_llm_jobs_status_created` on llm_jobs(status, created_at DESC)

---

### 055_telegram_bot_capabilities.sql - Telegram Bot Capabilities

Adds per-bot capability columns for tools, context limits, and rate limiting.

**Columns added to `telegram_bots`:**

| Column                | Type    | Default | Description                          |
| --------------------- | ------- | ------- | ------------------------------------ |
| tools_enabled         | boolean | true    | Enable tool use for this bot         |
| max_context_tokens    | integer | 4096    | Per-bot context window limit         |
| max_response_tokens   | integer | 1024    | Per-bot max response token limit     |
| rate_limit_per_minute | integer | 10      | Per-bot rate limit (requests/minute) |

---

### 056_schema_cleanup.sql - Schema Cleanup

Cleanup and maintenance migration.

**Dropped:** `idx_documents_content_hash` (superseded by `idx_documents_unique_content_hash` from 052)

**Indexes Added:**

- `idx_app_configurations_app_id` on app_configurations(app_id)

**Functions:**

- `update_updated_at_column()` - Canonical trigger function for auto-updating `updated_at`
- `cleanup_telegram_sessions()` - Removes stale bot sessions (30 days) and setup sessions (1 day)

---

### 057_model_lifecycle_views.sql - Model Usage Profile Views

Provides hourly usage aggregation from `llm_jobs` for adaptive keep-alive scheduling.

**Views:**

- `v_llm_hourly_usage` - Hourly request counts by day-of-week (7-day window)
- `v_llm_usage_profile` - Aggregated hourly usage profile (avg/peak requests, active days)

---

### 058_add_matched_spaces.sql - RAG Matched Spaces

Persists RAG knowledge space metadata so it survives page reload.

**Columns added to `chat_messages`:**

| Column         | Type  | Description                                             |
| -------------- | ----- | ------------------------------------------------------- |
| matched_spaces | jsonb | RAG matched knowledge spaces [{name, color, score, id}] |

**Columns added to `llm_jobs`:**

| Column         | Type  | Description                                   |
| -------------- | ----- | --------------------------------------------- |
| matched_spaces | jsonb | RAG matched knowledge spaces during streaming |

---

## Indexes Summary

| Table                     | Index                                  | Columns                                     | Source |
| ------------------------- | -------------------------------------- | ------------------------------------------- | ------ |
| chat_conversations        | idx_conversations_updated              | updated_at DESC (WHERE deleted_at IS NULL)  | 043    |
| chat_conversations        | idx_conversations_deleted              | deleted_at                                  | 005    |
| chat_conversations        | idx_conversations_project              | project_id                                  | 042    |
| chat_messages             | idx_messages_conversation              | conversation_id, created_at                 | 005    |
| chat_messages             | idx_chat_messages_conversation_created | conversation_id, created_at                 | 037    |
| documents                 | idx_documents_status                   | status                                      | 009    |
| documents                 | idx_documents_created                  | created_at DESC                             | 009    |
| documents                 | idx_documents_space_status             | space_id, status (WHERE deleted_at IS NULL) | 036    |
| documents                 | idx_documents_space_id                 | space_id                                    | 037    |
| documents                 | idx_documents_status_uploaded          | status, uploaded_at                         | 037    |
| documents                 | idx_documents_unique_content_hash      | content_hash (UNIQUE, partial)              | 052    |
| document_chunks           | idx_chunks_document                    | document_id                                 | 009    |
| document_chunks           | idx_document_chunks_text_search_de     | to_tsvector('german', chunk_text) GIN       | 036    |
| document_chunks           | idx_document_chunks_parent             | parent_chunk_id                             | 039    |
| document_parent_chunks    | idx_parent_chunks_document             | document_id                                 | 039    |
| telegram_config           | idx_telegram_config_enabled            | enabled                                     | 020    |
| telegram_rate_limits      | idx_telegram_rate_limits_chat          | chat_id, window_start DESC                  | 022    |
| telegram_rate_limits      | idx_telegram_rate_limits_cleanup       | window_start                                | 022    |
| api_audit_logs            | idx_api_audit_logs_timestamp           | timestamp DESC                              | 021    |
| api_audit_logs            | idx_api_audit_logs_user_id             | user_id, timestamp DESC                     | 021    |
| api_audit_logs            | idx_api_audit_logs_action_type         | action_type, timestamp DESC                 | 021    |
| api_audit_logs            | idx_api_audit_logs_response_status     | response_status, timestamp DESC             | 021    |
| api_audit_logs            | idx_api_audit_logs_timestamp_action    | timestamp DESC, action_type                 | 021    |
| api_audit_logs            | idx_api_audit_logs_endpoint            | target_endpoint, timestamp DESC             | 021    |
| api_audit_logs            | idx_api_audit_logs_errors              | timestamp DESC (WHERE >= 400)               | 021    |
| llm_model_catalog         | idx_llm_catalog_capabilities           | supports_thinking, rag_optimized            | 029    |
| llm_model_catalog         | idx_model_catalog_type                 | model_type                                  | 035    |
| llm_model_catalog         | idx_llm_model_catalog_ollama_name      | ollama_name                                 | 027    |
| model_performance_metrics | idx_perf_model_id                      | model_id                                    | 030    |
| model_performance_metrics | idx_perf_created_at                    | created_at DESC                             | 030    |
| model_performance_metrics | idx_perf_job_type                      | job_type                                    | 030    |
| llm_jobs                  | idx_llm_jobs_status_created            | status, created_at DESC                     | 054    |
| ai_memories               | idx_ai_memories_type                   | type                                        | 041    |
| ai_memories               | idx_ai_memories_active                 | is_active (WHERE TRUE)                      | 041    |
| ai_memories               | idx_ai_memories_created                | created_at DESC                             | 041    |
| compaction_log            | idx_compaction_log_conversation        | conversation_id                             | 041    |
| projects                  | idx_projects_sort                      | sort_order, created_at DESC                 | 042    |
| kg_entities               | idx_kg_entities_type                   | entity_type                                 | 044    |
| kg_entities               | idx_kg_entities_name_trgm              | name (GIN trigram)                          | 044    |
| kg_entities               | idx_kg_entities_unrefined              | refined (WHERE FALSE)                       | 045    |
| kg_entities               | idx_kg_entities_canonical              | canonical_id (WHERE NOT NULL)               | 045    |
| kg_entities               | idx_kg_entities_name_lower             | LOWER(name)                                 | 045    |
| kg_relations              | idx_kg_relations_source                | source_entity_id                            | 044    |
| kg_relations              | idx_kg_relations_target                | target_entity_id                            | 044    |
| kg_relations              | idx_kg_relations_type                  | relation_type                               | 044    |
| kg_relations              | idx_kg_relations_unrefined             | refined (WHERE FALSE AND VERWANDT_MIT)      | 045    |
| kg_entity_documents       | idx_kg_entity_documents_doc            | document_id                                 | 044    |
| kg_entity_documents       | idx_kg_entity_documents_entity_id      | entity_id                                   | 054    |
| app_configurations        | idx_app_configurations_app_id          | app_id                                      | 056    |

---

## Data Retention

| Data Type                  | Retention                 |
| -------------------------- | ------------------------- |
| Metrics (CPU/RAM/GPU/etc.) | 7 days                    |
| Self-healing events        | 30 days                   |
| Workflow activity          | 7 days                    |
| Deleted conversations      | 30 days (soft delete)     |
| Update files               | 90 days (keep latest 10)  |
| Update events              | 180 days (keep latest 20) |
| Login attempts             | 7 days                    |
| Document access logs       | 30 days                   |
| Alert history              | Configurable              |
| App store events           | 30 days                   |
| Audit logs                 | 90 days                   |
| Notification events        | 30 days                   |
| API audit logs             | 90 days                   |
| Telegram bot sessions      | 30 days                   |
| Telegram setup sessions    | 1 day                     |
| Model performance metrics  | 30 days                   |
| Compaction log             | 30 days                   |
| LLM jobs (completed)       | 1 hour                    |
| User accounts              | Permanent                 |
| Telegram config            | Permanent (singleton)     |
| System settings            | Permanent (singleton)     |

---

## Datentabellen (Dynamic Database)

Separate database `arasul_data_db` for user-created dynamic tables and quote management.

### Meta Tables

| Table        | Purpose                                             |
| ------------ | --------------------------------------------------- |
| dt_tables    | Table definitions (name, slug, icon, color)         |
| dt_fields    | Field definitions (type, unit, validation, options) |
| dt_relations | Relationships between tables                        |
| dt_views     | Saved filter/sort configurations                    |

### Dynamic Data Tables

User-created tables follow the naming convention `data_{slug}`:

| Column        | Type         | Description           |
| ------------- | ------------ | --------------------- |
| \_id          | UUID         | Primary key           |
| \_created_at  | TIMESTAMPTZ  | Creation timestamp    |
| \_updated_at  | TIMESTAMPTZ  | Last update timestamp |
| \_created_by  | VARCHAR(100) | Creator username      |
| _user_fields_ | _varies_     | User-defined columns  |

### Quote Tables

| Table              | Purpose                                   |
| ------------------ | ----------------------------------------- |
| dt_quote_templates | Company branding, PDF settings, tax rates |
| dt_quotes          | Quote header (customer, totals, status)   |
| dt_quote_positions | Line items/positions                      |
| dt_quote_history   | Audit trail of status changes             |

### Supported Field Types

| Type        | PostgreSQL Type | Description           |
| ----------- | --------------- | --------------------- |
| text        | TEXT            | Single-line text      |
| textarea    | TEXT            | Multi-line text       |
| number      | NUMERIC         | Numbers               |
| currency    | NUMERIC(12,2)   | Currency values       |
| date        | DATE            | Date only             |
| datetime    | TIMESTAMPTZ     | Date and time         |
| select      | TEXT            | Single selection      |
| multiselect | TEXT[]          | Multiple selection    |
| checkbox    | BOOLEAN         | True/false            |
| relation    | UUID            | Foreign key reference |
| email       | TEXT            | Email addresses       |
| url         | TEXT            | Web URLs              |
| phone       | TEXT            | Phone numbers         |

### dt_fields Columns

| Column      | Type         | Description                               |
| ----------- | ------------ | ----------------------------------------- |
| id          | SERIAL       | Primary key                               |
| table_id    | INTEGER (FK) | Reference to dt_tables                    |
| name        | VARCHAR(255) | Display name                              |
| slug        | VARCHAR(255) | URL-safe identifier                       |
| field_type  | VARCHAR(50)  | One of the supported field types above    |
| unit        | VARCHAR(50)  | Optional measurement unit (e.g. kg, €, m) |
| is_required | BOOLEAN      | Whether field is required                 |
| is_unique   | BOOLEAN      | Whether values must be unique             |
| options     | JSONB        | Type-specific options (e.g. select items) |
| position    | INTEGER      | Display order                             |

### Schema Files

| File                                | Description                   |
| ----------------------------------- | ----------------------------- |
| init/031_datentabellen_database.sql | Config table in main DB       |
| init/032_create_data_database.sh    | Creates arasul_data_db        |
| init-data-db/001_meta_schema.sql    | Meta tables                   |
| init-data-db/002_quotes_schema.sql  | Quote tables                  |
| init-data-db/004_add_field_unit.sql | Adds unit column to dt_fields |

---

## Related Documentation

- [PostgreSQL Service](../services/postgres/README.md) - Service details
- [Dashboard Backend](../apps/dashboard-backend/README.md) - Database client
