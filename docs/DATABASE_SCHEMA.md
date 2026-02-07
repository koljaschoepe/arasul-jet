# Database Schema

Complete schema reference for the Arasul Platform PostgreSQL database.

## Overview

### Main Database

| Property | Value |
|----------|-------|
| Database | arasul_db |
| User | arasul |
| Schema | public |
| Migrations | `/services/postgres/init/` |

### Data Database (Datentabellen)

| Property | Value |
|----------|-------|
| Database | arasul_data_db |
| User | arasul_data |
| Schema | public |
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

### 010_alert_config_schema.sql - Alert Configuration

#### alert_thresholds
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| metric_type | alert_metric_type | cpu, ram, disk, temperature |
| warning_threshold | decimal(5,2) | Warning level |
| critical_threshold | decimal(5,2) | Critical level |
| enabled | boolean | Enable/disable this alert |
| cooldown_seconds | integer | Min seconds between alerts (default: 300) |
| display_name | varchar(100) | UI display name |

#### alert_history
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| metric_type | alert_metric_type | Alert type |
| severity | alert_severity | warning/critical |
| value | decimal(10,2) | Actual value |
| threshold | decimal(10,2) | Threshold that was exceeded |
| triggered_at | timestamptz | Alert time |
| resolved_at | timestamptz | Resolution time |
| notification_sent | boolean | Notification status |

---

### 011_llm_models_schema.sql - LLM Model Management

#### llm_model_catalog
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(100) | Primary key (e.g., 'qwen3:7b-q8') |
| name | varchar(255) | Display name |
| description | text | Model description |
| size_bytes | bigint | Download size |
| ram_required_gb | integer | RAM requirement |
| category | varchar(50) | small/medium/large/xlarge |
| capabilities | jsonb | ['coding', 'reasoning', etc.] |
| jetson_tested | boolean | Tested on Jetson AGX Orin |
| performance_tier | integer | 1=fastest, 3=slowest |

#### llm_installed_models
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(100) | Primary key |
| status | varchar(20) | downloading/available/error |
| download_progress | integer | 0-100 percent |
| downloaded_at | timestamptz | Download completion |
| last_used_at | timestamptz | Last usage |
| usage_count | integer | Usage counter |
| is_default | boolean | Default model flag |

#### llm_model_switches
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| from_model | varchar(100) | Previous model |
| to_model | varchar(100) | New model |
| switch_duration_ms | integer | Switch time |
| triggered_by | varchar(50) | user/queue/workflow/auto |
| switched_at | timestamptz | Switch timestamp |

---

### 013_appstore_schema.sql - App Store

#### installed_apps
| Column | Type | Description |
|--------|------|-------------|
| id | varchar(100) | Primary key |
| name | varchar(255) | App name |
| description | text | App description |
| version | varchar(50) | Installed version |
| category | varchar(50) | App category |
| status | varchar(20) | installed/running/stopped |
| config | jsonb | App configuration |
| installed_at | timestamptz | Installation time |

---

### 017_audit_log_schema.sql - Audit Logging

#### audit_logs
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to admin_users |
| action | varchar(100) | Action performed |
| resource_type | varchar(50) | Type of resource |
| resource_id | varchar(100) | Resource identifier |
| details | jsonb | Action details |
| ip_address | varchar(45) | Client IP |
| created_at | timestamptz | Action time |

---

### 018_claude_terminal_schema.sql - Claude Terminal

#### claude_terminal_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to admin_users |
| query | text | User query |
| response | text | Claude response |
| context | jsonb | Session context |
| created_at | timestamptz | Query time |

---

### 020_telegram_config_schema.sql - Telegram Bot

#### telegram_config
| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key (always 1, singleton) |
| bot_token_encrypted | text | AES-256-GCM encrypted token |
| bot_token_iv | text | Initialization vector for decryption |
| bot_token_tag | text | GCM authentication tag |
| chat_id | varchar(50) | Default chat ID for broadcasts |
| enabled | boolean | Master switch for notifications |
| alert_thresholds | jsonb | Alert threshold configuration (see below) |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update (auto-updated via trigger) |

**alert_thresholds JSON Schema:**
```json
{
  "cpu_warning": 80,           // CPU % for warning
  "cpu_critical": 95,          // CPU % for critical alert
  "ram_warning": 80,           // RAM % for warning
  "ram_critical": 95,          // RAM % for critical alert
  "disk_warning": 80,          // Disk % for warning
  "disk_critical": 95,         // Disk % for critical alert
  "gpu_warning": 85,           // GPU % for warning
  "gpu_critical": 95,          // GPU % for critical alert
  "temperature_warning": 75,   // Temperature °C for warning
  "temperature_critical": 85,  // Temperature °C for critical alert
  "notify_on_warning": false,  // Send notifications on warning level
  "notify_on_critical": true,  // Send notifications on critical level
  "notify_on_service_down": true,    // Alert when services fail
  "notify_on_self_healing": true,    // Alert on self-healing events
  "cooldown_minutes": 15       // Minimum minutes between repeated alerts
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
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| event_type | varchar(50) | Event type (service_status, workflow_event, etc.) |
| event_category | varchar(50) | Category (status_change, completion, failure) |
| source_service | varchar(100) | Container or service name |
| severity | varchar(20) | info, warning, error, critical |
| title | varchar(255) | Event title |
| message | text | Event message |
| metadata | jsonb | Additional event data |
| notification_sent | boolean | Whether notification was sent |
| notification_sent_at | timestamptz | When notification was sent |
| notification_error | text | Error if sending failed |
| retry_count | integer | Number of retry attempts |
| created_at | timestamptz | Creation time |

#### notification_settings
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to users |
| channel | varchar(50) | telegram, webhook, email |
| enabled | boolean | Channel enabled |
| event_types | text[] | Filtered event types |
| min_severity | varchar(20) | Minimum severity to send |
| rate_limit_per_minute | integer | Rate limit per minute |
| rate_limit_per_hour | integer | Rate limit per hour |
| quiet_hours_start | time | Quiet hours start |
| quiet_hours_end | time | Quiet hours end |
| telegram_chat_id | varchar(100) | Telegram chat ID |
| telegram_bot_token_override | varchar(255) | Optional custom bot token |
| webhook_url | varchar(500) | Webhook URL |
| webhook_secret | varchar(255) | Webhook secret |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update |

#### service_status_cache
| Column | Type | Description |
|--------|------|-------------|
| service_name | varchar(100) | Primary key |
| container_name | varchar(255) | Docker container name |
| status | varchar(50) | running, stopped, exited, etc. |
| health | varchar(50) | healthy, unhealthy, starting |
| last_status | varchar(50) | Previous status |
| last_health | varchar(50) | Previous health |
| status_changed_at | timestamptz | When status changed |
| last_checked_at | timestamptz | Last check time |
| metadata | jsonb | Additional data |

#### system_boot_events
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| boot_timestamp | timestamptz | Boot time |
| previous_shutdown_timestamp | timestamptz | Previous shutdown |
| shutdown_reason | varchar(100) | Reason for shutdown |
| uptime_before_shutdown_seconds | integer | Uptime before shutdown |
| services_status_at_boot | jsonb | Services status at boot |
| boot_duration_ms | integer | Boot duration in ms |
| notification_sent | boolean | Notification sent |
| created_at | timestamptz | Creation time |

#### notification_rate_limits
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to users |
| channel | varchar(50) | Notification channel |
| event_type | varchar(50) | Event type |
| window_start | timestamptz | Rate limit window start |
| count | integer | Message count in window |

---

### 021_api_audit_logs_schema.sql - API Audit Logging

#### api_audit_logs
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| timestamp | timestamptz | Request timestamp |
| user_id | integer | FK to admin_users (nullable for unauth requests) |
| username | varchar(255) | Username at time of request |
| action_type | varchar(50) | HTTP method (GET, POST, PUT, DELETE, PATCH) |
| target_endpoint | varchar(500) | Full API endpoint path |
| request_method | varchar(10) | HTTP method (for efficient filtering) |
| request_payload | jsonb | Sanitized request body (no passwords/tokens) |
| response_status | integer | HTTP response status code |
| duration_ms | integer | Request processing time in ms |
| ip_address | varchar(45) | Client IP address (IPv4/IPv6) |
| user_agent | text | Client user agent string |
| error_message | text | Error details for failed requests |

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

| Column | Type | Description |
|--------|------|-------------|
| notification_preferences | jsonb | Notification type preferences |
| test_message_sent_at | timestamptz | Last test message time |
| last_error | text | Last error message |
| last_error_at | timestamptz | Last error time |
| connection_verified | boolean | Connection verified flag |
| connection_verified_at | timestamptz | Verification time |
| bot_username | varchar(100) | Bot username from getMe |

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
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| chat_id | varchar(50) | Telegram chat ID |
| window_start | timestamptz | Rate limit window start |
| message_count | integer | Messages in window |
| last_message_at | timestamptz | Last message time |

**Purpose:** Enforces Telegram API rate limits (30 msg/sec per chat)

#### telegram_message_log
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| chat_id | varchar(50) | Telegram chat ID |
| message_type | varchar(50) | alert, test, notification, daily_summary |
| severity | varchar(20) | info, warning, error, critical |
| title | varchar(255) | Message title |
| message_text | text | Full message content |
| message_id | integer | Telegram message ID |
| metadata | jsonb | Additional data |
| sent_at | timestamptz | Send time |
| delivered | boolean | Delivery success |
| error_message | text | Error if failed |
| retry_count | integer | Retry attempts |
| source_event_id | integer | Reference to notification_events |
| triggered_by | varchar(100) | system, user:{username}, scheduler |

**Retention:** 30 days

#### telegram_alert_cooldowns
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| alert_type | varchar(100) | Alert type (cpu_critical, service_down:name) |
| chat_id | varchar(50) | Telegram chat ID |
| last_alert_at | timestamptz | Last alert time |
| alert_count | integer | Total alert count |

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
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| key_hash | varchar(128) | bcrypt hash of API key |
| key_prefix | varchar(8) | First 8 chars for identification |
| name | varchar(100) | Key name |
| description | text | Key description |
| created_by | integer | FK to admin_users |
| created_at | timestamptz | Creation time |
| last_used_at | timestamptz | Last usage |
| expires_at | timestamptz | Expiration time |
| is_active | boolean | Active status |
| rate_limit_per_minute | integer | Rate limit (default: 60) |
| allowed_endpoints | text[] | Allowed endpoint patterns |

#### api_key_usage
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| api_key_id | integer | FK to api_keys |
| endpoint | varchar(255) | Called endpoint |
| method | varchar(10) | HTTP method |
| status_code | integer | Response status |
| response_time_ms | integer | Response time |
| request_ip | varchar(45) | Client IP |
| created_at | timestamptz | Request time |

---

### 024_telegram_app_schema.sql - Telegram Bot App

#### telegram_setup_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| setup_token | varchar(64) | Unique setup token |
| bot_token_encrypted | bytea | AES-256 encrypted bot token |
| bot_username | varchar(100) | Bot username |
| chat_id | bigint | Connected chat ID |
| user_id | integer | FK to admin_users |
| status | telegram_setup_status | pending/token_valid/completed/expired |
| expires_at | timestamptz | Session expiration |

#### telegram_notification_rules
| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| name | varchar(100) | Rule name |
| event_source | notification_event_source | claude/system/n8n/services/custom |
| event_type | varchar(100) | Event type filter |
| severity_filter | varchar(20)[] | Severity levels to match |
| message_template | text | Message template |
| enabled | boolean | Rule enabled |
| created_at | timestamptz | Creation time |

---

### 025-028 - Maintenance Migrations

These migrations contain fixes and incremental updates:
- **025_telegram_functions_fix.sql**: Fixes for Telegram notification functions
- **026_fix_default_model.sql**: Fix for default model handling
- **027_model_ollama_name.sql**: Add ollama_name column to model catalog
- **028_fix_user_references.sql**: Fix user reference constraints

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
| telegram_config | idx_telegram_config_enabled | enabled |
| api_audit_logs | idx_api_audit_logs_timestamp | timestamp DESC |
| api_audit_logs | idx_api_audit_logs_user_id | user_id, timestamp DESC |
| api_audit_logs | idx_api_audit_logs_action_type | action_type, timestamp DESC |
| api_audit_logs | idx_api_audit_logs_response_status | response_status, timestamp DESC |
| api_audit_logs | idx_api_audit_logs_timestamp_action | timestamp DESC, action_type |
| api_audit_logs | idx_api_audit_logs_endpoint | target_endpoint, timestamp DESC |
| api_audit_logs | idx_api_audit_logs_errors | timestamp DESC (WHERE >= 400) |
| telegram_rate_limits | idx_telegram_rate_limits_chat | chat_id, window_start DESC |
| telegram_rate_limits | idx_telegram_rate_limits_cleanup | window_start |
| telegram_message_log | idx_telegram_message_log_chat | chat_id, sent_at DESC |
| telegram_message_log | idx_telegram_message_log_type | message_type, sent_at DESC |
| telegram_message_log | idx_telegram_message_log_severity | severity, sent_at DESC |
| telegram_message_log | idx_telegram_message_log_sent | sent_at DESC |
| telegram_message_log | idx_telegram_message_log_failed | delivered (WHERE FALSE) |
| telegram_alert_cooldowns | idx_telegram_alert_cooldowns_lookup | alert_type, chat_id, last_alert_at |

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
| Telegram config | Permanent (singleton) |
| Telegram message log | 30 days |
| Telegram rate limits | 1 hour |
| API audit logs | 90 days |

---

## Datentabellen (Dynamic Database)

Separate database `arasul_data_db` for user-created dynamic tables and quote management.

### Meta Tables

| Table | Purpose |
|-------|---------|
| dt_tables | Table definitions (name, slug, icon, color) |
| dt_fields | Field definitions (type, validation, options) |
| dt_relations | Relationships between tables |
| dt_views | Saved filter/sort configurations |

### Dynamic Data Tables

User-created tables follow the naming convention `data_{slug}`:

| Column | Type | Description |
|--------|------|-------------|
| _id | UUID | Primary key |
| _created_at | TIMESTAMPTZ | Creation timestamp |
| _updated_at | TIMESTAMPTZ | Last update timestamp |
| _created_by | VARCHAR(100) | Creator username |
| *user_fields* | *varies* | User-defined columns |

### Quote Tables

| Table | Purpose |
|-------|---------|
| dt_quote_templates | Company branding, PDF settings, tax rates |
| dt_quotes | Quote header (customer, totals, status) |
| dt_quote_positions | Line items/positions |
| dt_quote_history | Audit trail of status changes |

### Supported Field Types

| Type | PostgreSQL Type | Description |
|------|----------------|-------------|
| text | TEXT | Single-line text |
| textarea | TEXT | Multi-line text |
| number | NUMERIC | Numbers |
| currency | NUMERIC(12,2) | Currency values |
| date | DATE | Date only |
| datetime | TIMESTAMPTZ | Date and time |
| select | TEXT | Single selection |
| multiselect | TEXT[] | Multiple selection |
| checkbox | BOOLEAN | True/false |
| relation | UUID | Foreign key reference |
| email | TEXT | Email addresses |
| url | TEXT | Web URLs |
| phone | TEXT | Phone numbers |

### Schema Files

| File | Description |
|------|-------------|
| init/031_datentabellen_database.sql | Config table in main DB |
| init/032_create_data_database.sh | Creates arasul_data_db |
| init-data-db/001_meta_schema.sql | Meta tables |
| init-data-db/002_quotes_schema.sql | Quote tables |

---

## Related Documentation

- [PostgreSQL Service](../services/postgres/README.md) - Service details
- [Dashboard Backend](../services/dashboard-backend/README.md) - Database client
