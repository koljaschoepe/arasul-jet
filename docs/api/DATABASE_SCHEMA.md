# Arasul Platform — Database Schema

> **Auto-generated**. Do not edit by hand.
> Run `scripts/docs/generate-db-schema.sh` to regenerate. Last sync: `2026-07-21T21:58:37Z`

## Übersicht

- Tabellen: **89**
- Spalten gesamt: **1186**
- Foreign Keys: **58**
- Indexes: **334**

---

## `active_sessions`

> Active user sessions

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('active_sessions_id_seq'::reg...` |
| `user_id`       | bigint                   | ✅       |                                            |
| `token_jti`     | character varying        | ⛔       |                                            |
| `ip_address`    | inet                     | ✅       |                                            |
| `user_agent`    | text                     | ✅       |                                            |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                    |
| `expires_at`    | timestamp with time zone | ⛔       |                                            |
| `last_activity` | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `active_sessions_pkey` — `CREATE UNIQUE INDEX active_sessions_pkey ON public.active_sessions USING btree (id)`
- `active_sessions_token_jti_key` — `CREATE UNIQUE INDEX active_sessions_token_jti_key ON public.active_sessions USING btree (token_jti)`
- `idx_active_sessions_expires` — `CREATE INDEX idx_active_sessions_expires ON public.active_sessions USING btree (expires_at)`
- `idx_active_sessions_jti` — `CREATE INDEX idx_active_sessions_jti ON public.active_sessions USING btree (token_jti)`
- `idx_active_sessions_user` — `CREATE INDEX idx_active_sessions_user ON public.active_sessions USING btree (user_id)`

---

## `admin_users`

> Administrator user accounts

| Column           | Type                     | Nullable | Default                                   |
| ---------------- | ------------------------ | -------- | ----------------------------------------- |
| `id`             | bigint                   | ⛔       | `nextval('admin_users_id_seq'::regclass)` |
| `username`       | character varying        | ⛔       |                                           |
| `password_hash`  | character varying        | ⛔       |                                           |
| `email`          | character varying        | ✅       |                                           |
| `created_at`     | timestamp with time zone | ✅       | `now()`                                   |
| `updated_at`     | timestamp with time zone | ✅       | `now()`                                   |
| `last_login`     | timestamp with time zone | ✅       |                                           |
| `login_attempts` | integer                  | ✅       | `0`                                       |
| `locked_until`   | timestamp with time zone | ✅       |                                           |
| `is_active`      | boolean                  | ✅       | `true`                                    |
| `role`           | character varying        | ⛔       | `'admin'::character varying`              |

**Primary key:** `id`

**Indexes:**

- `admin_users_pkey` — `CREATE UNIQUE INDEX admin_users_pkey ON public.admin_users USING btree (id)`
- `admin_users_username_key` — `CREATE UNIQUE INDEX admin_users_username_key ON public.admin_users USING btree (username)`
- `idx_admin_users_active` — `CREATE INDEX idx_admin_users_active ON public.admin_users USING btree (is_active)`
- `idx_admin_users_username` — `CREATE INDEX idx_admin_users_username ON public.admin_users USING btree (username)`

---

## `ai_memories`

| Column                   | Type                     | Nullable | Default             |
| ------------------------ | ------------------------ | -------- | ------------------- |
| `id`                     | uuid                     | ⛔       | `gen_random_uuid()` |
| `type`                   | character varying        | ⛔       |                     |
| `content`                | text                     | ⛔       |                     |
| `source_conversation_id` | bigint                   | ✅       |                     |
| `qdrant_point_id`        | uuid                     | ✅       |                     |
| `importance`             | numeric                  | ✅       | `0.5`               |
| `created_at`             | timestamp with time zone | ✅       | `now()`             |
| `updated_at`             | timestamp with time zone | ✅       | `now()`             |
| `is_active`              | boolean                  | ✅       | `true`              |

**Primary key:** `id`

**Foreign Keys:**

- `source_conversation_id` → `chat_conversations.id`

**Indexes:**

- `ai_memories_pkey` — `CREATE UNIQUE INDEX ai_memories_pkey ON public.ai_memories USING btree (id)`
- `idx_ai_memories_active` — `CREATE INDEX idx_ai_memories_active ON public.ai_memories USING btree (is_active) WHERE (is_active = true)`
- `idx_ai_memories_created` — `CREATE INDEX idx_ai_memories_created ON public.ai_memories USING btree (created_at DESC)`
- `idx_ai_memories_type` — `CREATE INDEX idx_ai_memories_type ON public.ai_memories USING btree (type)`

---

## `alert_history`

> History of all fired alerts

| Column                  | Type                     | Nullable | Default                                    |
| ----------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                    | integer                  | ⛔       | `nextval('alert_history_id_seq'::regcl...` |
| `metric_type`           | USER-DEFINED             | ⛔       |                                            |
| `severity`              | USER-DEFINED             | ⛔       |                                            |
| `current_value`         | numeric                  | ⛔       |                                            |
| `threshold_value`       | numeric                  | ⛔       |                                            |
| `message`               | text                     | ⛔       |                                            |
| `notified_via`          | ARRAY                    | ✅       |                                            |
| `webhook_response_code` | integer                  | ✅       |                                            |
| `acknowledged`          | boolean                  | ✅       | `false`                                    |
| `acknowledged_at`       | timestamp with time zone | ✅       |                                            |
| `acknowledged_by`       | character varying        | ✅       |                                            |
| `fired_at`              | timestamp with time zone | ✅       | `now()`                                    |
| `resolved_at`           | timestamp with time zone | ✅       |                                            |
| `created_at`            | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `alert_history_pkey` — `CREATE UNIQUE INDEX alert_history_pkey ON public.alert_history USING btree (id)`
- `idx_alert_history_acknowledged` — `CREATE INDEX idx_alert_history_acknowledged ON public.alert_history USING btree (acknowledged) WHERE (NOT acknowledged)`
- `idx_alert_history_fired_at` — `CREATE INDEX idx_alert_history_fired_at ON public.alert_history USING btree (fired_at DESC)`
- `idx_alert_history_metric` — `CREATE INDEX idx_alert_history_metric ON public.alert_history USING btree (metric_type)`
- `idx_alert_history_severity` — `CREATE INDEX idx_alert_history_severity ON public.alert_history USING btree (severity)`

---

## `alert_last_fired`

> Rate limiting tracker for each metric type

| Column          | Type                     | Nullable | Default |
| --------------- | ------------------------ | -------- | ------- |
| `metric_type`   | USER-DEFINED             | ⛔       |         |
| `severity`      | USER-DEFINED             | ⛔       |         |
| `fired_at`      | timestamp with time zone | ⛔       | `now()` |
| `current_value` | numeric                  | ✅       |         |

**Primary key:** `metric_type`

**Indexes:**

- `alert_last_fired_pkey` — `CREATE UNIQUE INDEX alert_last_fired_pkey ON public.alert_last_fired USING btree (metric_type)`

---

## `alert_quiet_hours`

> Quiet hours configuration to suppress alerts during certain times

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | integer                  | ⛔       | `nextval('alert_quiet_hours_id_seq'::r...` |
| `day_of_week` | integer                  | ⛔       |                                            |
| `start_time`  | time without time zone   | ⛔       | `'22:00:00'::time without time zone`       |
| `end_time`    | time without time zone   | ⛔       | `'07:00:00'::time without time zone`       |
| `enabled`     | boolean                  | ✅       | `false`                                    |
| `created_at`  | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`  | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `alert_quiet_hours_day_of_week_key` — `CREATE UNIQUE INDEX alert_quiet_hours_day_of_week_key ON public.alert_quiet_hours USING btree (day_of_week)`
- `alert_quiet_hours_pkey` — `CREATE UNIQUE INDEX alert_quiet_hours_pkey ON public.alert_quiet_hours USING btree (id)`

---

## `alert_settings`

> Global alert system configuration

| Column                 | Type                     | Nullable | Default |
| ---------------------- | ------------------------ | -------- | ------- |
| `id`                   | integer                  | ⛔       | `1`     |
| `alerts_enabled`       | boolean                  | ✅       | `true`  |
| `webhook_url`          | text                     | ✅       |         |
| `webhook_enabled`      | boolean                  | ✅       | `false` |
| `webhook_secret`       | character varying        | ✅       |         |
| `in_app_notifications` | boolean                  | ✅       | `true`  |
| `audio_enabled`        | boolean                  | ✅       | `false` |
| `max_history_entries`  | integer                  | ✅       | `1000`  |
| `updated_at`           | timestamp with time zone | ✅       | `now()` |
| `updated_by`           | character varying        | ✅       |         |

**Primary key:** `id`

**Indexes:**

- `alert_settings_pkey` — `CREATE UNIQUE INDEX alert_settings_pkey ON public.alert_settings USING btree (id)`

---

## `alert_thresholds`

> Configurable thresholds for system metrics alerts

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('alert_thresholds_id_seq'::re...` |
| `metric_type`        | USER-DEFINED             | ⛔       |                                            |
| `warning_threshold`  | numeric                  | ⛔       |                                            |
| `critical_threshold` | numeric                  | ⛔       |                                            |
| `enabled`            | boolean                  | ✅       | `true`                                     |
| `cooldown_seconds`   | integer                  | ✅       | `300`                                      |
| `display_name`       | character varying        | ⛔       |                                            |
| `description`        | text                     | ✅       |                                            |
| `unit`               | character varying        | ✅       | `'%'::character varying`                   |
| `created_at`         | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`         | timestamp with time zone | ✅       | `now()`                                    |
| `updated_by`         | character varying        | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `alert_thresholds_metric_type_key` — `CREATE UNIQUE INDEX alert_thresholds_metric_type_key ON public.alert_thresholds USING btree (metric_type)`
- `alert_thresholds_pkey` — `CREATE UNIQUE INDEX alert_thresholds_pkey ON public.alert_thresholds USING btree (id)`

---

## `api_audit_logs`

> Audit log for all API requests - used for monitoring, debugging, and compliance

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | integer                  | ⛔       | `nextval('api_audit_logs_id_seq'::regc...` |
| `timestamp`       | timestamp with time zone | ⛔       | `now()`                                    |
| `user_id`         | integer                  | ✅       |                                            |
| `action_type`     | character varying        | ⛔       |                                            |
| `target_endpoint` | character varying        | ⛔       |                                            |
| `request_payload` | jsonb                    | ✅       | `'{}'::jsonb`                              |
| `response_status` | integer                  | ⛔       |                                            |
| `duration_ms`     | integer                  | ⛔       | `0`                                        |
| `ip_address`      | inet                     | ✅       |                                            |
| `user_agent`      | text                     | ✅       |                                            |
| `request_id`      | character varying        | ✅       |                                            |
| `error_message`   | text                     | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `api_audit_logs_pkey` — `CREATE UNIQUE INDEX api_audit_logs_pkey ON public.api_audit_logs USING btree (id)`
- `idx_api_audit_logs_action_type` — `CREATE INDEX idx_api_audit_logs_action_type ON public.api_audit_logs USING btree (action_type, "timestamp" DESC)`
- `idx_api_audit_logs_endpoint` — `CREATE INDEX idx_api_audit_logs_endpoint ON public.api_audit_logs USING btree (target_endpoint, "timestamp" DESC)`
- `idx_api_audit_logs_errors` — `CREATE INDEX idx_api_audit_logs_errors ON public.api_audit_logs USING btree ("timestamp" DESC) WHERE (response_status >= 400)`
- `idx_api_audit_logs_response_status` — `CREATE INDEX idx_api_audit_logs_response_status ON public.api_audit_logs USING btree (response_status, "timestamp" DESC)`
- `idx_api_audit_logs_timestamp` — `CREATE INDEX idx_api_audit_logs_timestamp ON public.api_audit_logs USING btree ("timestamp" DESC)`
- `idx_api_audit_logs_timestamp_action` — `CREATE INDEX idx_api_audit_logs_timestamp_action ON public.api_audit_logs USING btree ("timestamp" DESC, action_type)`
- `idx_api_audit_logs_user_id` — `CREATE INDEX idx_api_audit_logs_user_id ON public.api_audit_logs USING btree (user_id, "timestamp" DESC) WHERE (user_id IS NOT NULL)`

---

## `api_key_usage`

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | integer                  | ⛔       | `nextval('api_key_usage_id_seq'::regcl...` |
| `api_key_id`       | integer                  | ✅       |                                            |
| `endpoint`         | character varying        | ⛔       |                                            |
| `method`           | character varying        | ⛔       |                                            |
| `status_code`      | integer                  | ✅       |                                            |
| `response_time_ms` | integer                  | ✅       |                                            |
| `request_ip`       | character varying        | ✅       |                                            |
| `user_agent`       | text                     | ✅       |                                            |
| `created_at`       | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `api_key_id` → `api_keys.id`

**Indexes:**

- `api_key_usage_pkey` — `CREATE UNIQUE INDEX api_key_usage_pkey ON public.api_key_usage USING btree (id)`
- `idx_api_key_usage_created` — `CREATE INDEX idx_api_key_usage_created ON public.api_key_usage USING btree (created_at)`
- `idx_api_key_usage_key_id` — `CREATE INDEX idx_api_key_usage_key_id ON public.api_key_usage USING btree (api_key_id)`

---

## `api_keys`

> API keys for external app access (n8n, automations, etc.)

| Column                  | Type                     | Nullable | Default                                    |
| ----------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                    | integer                  | ⛔       | `nextval('api_keys_id_seq'::regclass)`     |
| `key_hash`              | character varying        | ⛔       |                                            |
| `key_prefix`            | character varying        | ⛔       |                                            |
| `name`                  | character varying        | ⛔       |                                            |
| `description`           | text                     | ✅       |                                            |
| `created_by`            | integer                  | ✅       |                                            |
| `created_at`            | timestamp with time zone | ✅       | `now()`                                    |
| `last_used_at`          | timestamp with time zone | ✅       |                                            |
| `expires_at`            | timestamp with time zone | ✅       |                                            |
| `is_active`             | boolean                  | ✅       | `true`                                     |
| `rate_limit_per_minute` | integer                  | ✅       | `60`                                       |
| `allowed_endpoints`     | ARRAY                    | ✅       | `ARRAY['llm:chat'::text, 'llm:status':...` |
| `metadata`              | jsonb                    | ✅       | `'{}'::jsonb`                              |
| `requires_review`       | boolean                  | ✅       | `false`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `created_by` → `admin_users.id`

**Indexes:**

- `api_keys_pkey` — `CREATE UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id)`
- `idx_api_keys_active` — `CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (is_active) WHERE (is_active = true)`
- `idx_api_keys_prefix` — `CREATE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix)`
- `idx_api_keys_requires_review` — `CREATE INDEX idx_api_keys_requires_review ON public.api_keys USING btree (requires_review) WHERE (requires_review = true)`

---

## `app_configurations`

> Per-app configuration key-value storage

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | integer                  | ⛔       | `nextval('app_configurations_id_seq'::...` |
| `app_id`       | character varying        | ⛔       |                                            |
| `config_key`   | character varying        | ⛔       |                                            |
| `config_value` | text                     | ✅       |                                            |
| `is_secret`    | boolean                  | ✅       | `false`                                    |
| `created_at`   | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`   | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `app_id` → `app_installations.app_id`

**Indexes:**

- `app_configurations_app_id_config_key_key` — `CREATE UNIQUE INDEX app_configurations_app_id_config_key_key ON public.app_configurations USING btree (app_id, config_key)`
- `app_configurations_pkey` — `CREATE UNIQUE INDEX app_configurations_pkey ON public.app_configurations USING btree (id)`
- `idx_app_configurations_app` — `CREATE INDEX idx_app_configurations_app ON public.app_configurations USING btree (app_id)`
- `idx_app_configurations_app_id` — `CREATE INDEX idx_app_configurations_app_id ON public.app_configurations USING btree (app_id)`

---

## `app_dependencies`

> App dependency tracking (e.g., needs postgres-db)

| Column            | Type              | Nullable | Default                                    |
| ----------------- | ----------------- | -------- | ------------------------------------------ |
| `id`              | integer           | ⛔       | `nextval('app_dependencies_id_seq'::re...` |
| `app_id`          | character varying | ⛔       |                                            |
| `depends_on`      | character varying | ⛔       |                                            |
| `dependency_type` | character varying | ✅       | `'required'::character varying`            |

**Primary key:** `id`

**Foreign Keys:**

- `app_id` → `app_installations.app_id`

**Indexes:**

- `app_dependencies_app_id_depends_on_key` — `CREATE UNIQUE INDEX app_dependencies_app_id_depends_on_key ON public.app_dependencies USING btree (app_id, depends_on)`
- `app_dependencies_pkey` — `CREATE UNIQUE INDEX app_dependencies_pkey ON public.app_dependencies USING btree (id)`
- `idx_app_dependencies_app` — `CREATE INDEX idx_app_dependencies_app ON public.app_dependencies USING btree (app_id)`

---

## `app_events`

> Audit log for app lifecycle events

| Column          | Type                     | Nullable | Default                                  |
| --------------- | ------------------------ | -------- | ---------------------------------------- |
| `id`            | integer                  | ⛔       | `nextval('app_events_id_seq'::regclass)` |
| `app_id`        | character varying        | ⛔       |                                          |
| `event_type`    | character varying        | ⛔       |                                          |
| `event_message` | text                     | ✅       |                                          |
| `event_details` | jsonb                    | ✅       |                                          |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                  |

**Primary key:** `id`

**Indexes:**

- `app_events_pkey` — `CREATE UNIQUE INDEX app_events_pkey ON public.app_events USING btree (id)`
- `idx_app_events_app` — `CREATE INDEX idx_app_events_app ON public.app_events USING btree (app_id)`
- `idx_app_events_created` — `CREATE INDEX idx_app_events_created ON public.app_events USING btree (created_at DESC)`
- `idx_app_events_type` — `CREATE INDEX idx_app_events_type ON public.app_events USING btree (event_type)`

---

## `app_installations`

> Main app installation tracking for AppStore

| Column              | Type                     | Nullable | Default                   |
| ------------------- | ------------------------ | -------- | ------------------------- |
| `id`                | uuid                     | ⛔       | `gen_random_uuid()`       |
| `app_id`            | character varying        | ⛔       |                           |
| `status`            | USER-DEFINED             | ✅       | `'available'::app_status` |
| `app_type`          | USER-DEFINED             | ✅       | `'official'::app_type`    |
| `version`           | character varying        | ✅       |                           |
| `container_id`      | character varying        | ✅       |                           |
| `container_name`    | character varying        | ✅       |                           |
| `internal_port`     | integer                  | ✅       |                           |
| `external_port`     | integer                  | ✅       |                           |
| `traefik_route`     | character varying        | ✅       |                           |
| `cpu_usage`         | numeric                  | ✅       |                           |
| `memory_usage_mb`   | integer                  | ✅       |                           |
| `installed_at`      | timestamp with time zone | ✅       |                           |
| `started_at`        | timestamp with time zone | ✅       |                           |
| `stopped_at`        | timestamp with time zone | ✅       |                           |
| `last_health_check` | timestamp with time zone | ✅       |                           |
| `last_error`        | text                     | ✅       |                           |
| `error_count`       | integer                  | ✅       | `0`                       |
| `created_at`        | timestamp with time zone | ✅       | `now()`                   |
| `updated_at`        | timestamp with time zone | ✅       | `now()`                   |

**Primary key:** `id`

**Indexes:**

- `app_installations_app_id_key` — `CREATE UNIQUE INDEX app_installations_app_id_key ON public.app_installations USING btree (app_id)`
- `app_installations_pkey` — `CREATE UNIQUE INDEX app_installations_pkey ON public.app_installations USING btree (id)`
- `idx_app_installations_app_id` — `CREATE INDEX idx_app_installations_app_id ON public.app_installations USING btree (app_id)`
- `idx_app_installations_status` — `CREATE INDEX idx_app_installations_status ON public.app_installations USING btree (status)`
- `idx_app_installations_type` — `CREATE INDEX idx_app_installations_type ON public.app_installations USING btree (app_type)`

---

## `audit_log_health`

> Phase 1.5: Health-Counter für asynchrone Audit-Writes. Wird von auditLog.js bei jedem Write aktualisiert.

| Column                | Type                     | Nullable | Default |
| --------------------- | ------------------------ | -------- | ------- |
| `id`                  | integer                  | ⛔       | `1`     |
| `failure_count`       | bigint                   | ⛔       | `0`     |
| `last_failure_at`     | timestamp with time zone | ✅       |         |
| `last_failure_reason` | text                     | ✅       |         |
| `last_success_at`     | timestamp with time zone | ✅       |         |

**Primary key:** `id`

**Indexes:**

- `audit_log_health_pkey` — `CREATE UNIQUE INDEX audit_log_health_pkey ON public.audit_log_health USING btree (id)`

---

## `audit_logs`

> High-value security audit trail — password changes, service restarts, config changes, exports

| Column       | Type                     | Nullable | Default                                  |
| ------------ | ------------------------ | -------- | ---------------------------------------- |
| `id`         | integer                  | ⛔       | `nextval('audit_logs_id_seq'::regclass)` |
| `timestamp`  | timestamp with time zone | ⛔       | `now()`                                  |
| `user_id`    | integer                  | ✅       |                                          |
| `action`     | character varying        | ⛔       |                                          |
| `details`    | jsonb                    | ✅       | `'{}'::jsonb`                            |
| `ip_address` | character varying        | ✅       |                                          |
| `request_id` | uuid                     | ✅       |                                          |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `audit_logs_pkey` — `CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id)`
- `idx_audit_logs_action` — `CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action, "timestamp" DESC)`
- `idx_audit_logs_timestamp` — `CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC)`
- `idx_audit_logs_user_action` — `CREATE INDEX idx_audit_logs_user_action ON public.audit_logs USING btree (user_id, action, "timestamp" DESC)`

---

## `avatar_best_slot`

| Column           | Type                     | Nullable | Default |
| ---------------- | ------------------------ | -------- | ------- |
| `hour_of_day`    | integer                  | ⛔       |         |
| `avg_reach`      | double precision         | ⛔       | `0`     |
| `avg_engagement` | double precision         | ⛔       | `0`     |
| `sample_count`   | integer                  | ⛔       | `0`     |
| `last_updated`   | timestamp with time zone | ⛔       | `now()` |

**Primary key:** `hour_of_day`

**Indexes:**

- `avatar_best_slot_pkey` — `CREATE UNIQUE INDEX avatar_best_slot_pkey ON arasul.avatar_best_slot USING btree (hour_of_day)`

---

## `avatar_render_queue`

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | integer                  | ⛔       | `nextval('avatar_render_queue_id_seq':...` |
| `script_id`       | integer                  | ✅       |                                            |
| `status`          | text                     | ⛔       | `'pending'::text`                          |
| `render_backend`  | text                     | ⛔       | `'heygen'::text`                           |
| `audio_url`       | text                     | ✅       |                                            |
| `avatar_id`       | text                     | ✅       |                                            |
| `render_job_id`   | text                     | ✅       |                                            |
| `raw_video_url`   | text                     | ✅       |                                            |
| `final_video_url` | text                     | ✅       |                                            |
| `error_message`   | text                     | ✅       |                                            |
| `retry_count`     | integer                  | ⛔       | `0`                                        |
| `created_at`      | timestamp with time zone | ⛔       | `now()`                                    |
| `updated_at`      | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `avatar_render_queue_pkey` — `CREATE UNIQUE INDEX avatar_render_queue_pkey ON arasul.avatar_render_queue USING btree (id)`
- `idx_arq_created_at` — `CREATE INDEX idx_arq_created_at ON arasul.avatar_render_queue USING btree (created_at DESC)`
- `idx_arq_status` — `CREATE INDEX idx_arq_status ON arasul.avatar_render_queue USING btree (status)`

---

## `avatar_script_history`

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | integer                  | ⛔       | `nextval('avatar_script_history_id_seq...` |
| `topic`           | text                     | ⛔       |                                            |
| `topic_category`  | text                     | ⛔       |                                            |
| `hook`            | text                     | ✅       |                                            |
| `body`            | text                     | ⛔       |                                            |
| `cta`             | text                     | ✅       |                                            |
| `hashtags`        | ARRAY                    | ✅       |                                            |
| `full_script`     | text                     | ⛔       |                                            |
| `qdrant_point_id` | text                     | ✅       |                                            |
| `approved_by`     | text                     | ✅       | `'telegram'::text`                         |
| `approval_at`     | timestamp with time zone | ✅       |                                            |
| `render_queue_id` | integer                  | ✅       |                                            |
| `created_at`      | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `avatar_script_history_pkey` — `CREATE UNIQUE INDEX avatar_script_history_pkey ON arasul.avatar_script_history USING btree (id)`
- `idx_ash_created_at` — `CREATE INDEX idx_ash_created_at ON arasul.avatar_script_history USING btree (created_at DESC)`
- `idx_ash_topic_category` — `CREATE INDEX idx_ash_topic_category ON arasul.avatar_script_history USING btree (topic_category)`

---

## `avatar_topic_weight`

| Column           | Type                     | Nullable | Default |
| ---------------- | ------------------------ | -------- | ------- |
| `topic_category` | text                     | ⛔       |         |
| `weight`         | double precision         | ⛔       | `1.0`   |
| `avg_engagement` | double precision         | ⛔       | `0`     |
| `post_count`     | integer                  | ⛔       | `0`     |
| `last_updated`   | timestamp with time zone | ⛔       | `now()` |

**Primary key:** `topic_category`

**Indexes:**

- `avatar_topic_weight_pkey` — `CREATE UNIQUE INDEX avatar_topic_weight_pkey ON arasul.avatar_topic_weight USING btree (topic_category)`

---

## `avatar_video_performance`

| Column                | Type                     | Nullable | Default                                    |
| --------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                  | integer                  | ⛔       | `nextval('avatar_video_performance_id_...` |
| `video_id`            | text                     | ⛔       |                                            |
| `script_id`           | integer                  | ✅       |                                            |
| `topic`               | text                     | ⛔       |                                            |
| `topic_category`      | text                     | ⛔       |                                            |
| `hook_style`          | text                     | ✅       |                                            |
| `caption_length`      | integer                  | ✅       |                                            |
| `hashtag_count`       | integer                  | ✅       |                                            |
| `posted_at`           | timestamp with time zone | ⛔       |                                            |
| `platform`            | text                     | ⛔       |                                            |
| `platform_post_id`    | text                     | ✅       |                                            |
| `reach`               | integer                  | ⛔       | `0`                                        |
| `plays`               | integer                  | ⛔       | `0`                                        |
| `shares`              | integer                  | ⛔       | `0`                                        |
| `saves`               | integer                  | ⛔       | `0`                                        |
| `comments_count`      | integer                  | ⛔       | `0`                                        |
| `engagement_rate`     | double precision         | ✅       |                                            |
| `insights_fetched_at` | timestamp with time zone | ✅       |                                            |
| `created_at`          | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `avatar_video_performance_pkey` — `CREATE UNIQUE INDEX avatar_video_performance_pkey ON arasul.avatar_video_performance USING btree (id)`
- `avatar_video_performance_video_id_key` — `CREATE UNIQUE INDEX avatar_video_performance_video_id_key ON arasul.avatar_video_performance USING btree (video_id)`
- `idx_avp_platform` — `CREATE INDEX idx_avp_platform ON arasul.avatar_video_performance USING btree (platform)`
- `idx_avp_posted_at` — `CREATE INDEX idx_avp_posted_at ON arasul.avatar_video_performance USING btree (posted_at DESC)`
- `idx_avp_topic_category` — `CREATE INDEX idx_avp_topic_category ON arasul.avatar_video_performance USING btree (topic_category)`

---

## `avatar_weekly_report`

| Column           | Type                     | Nullable | Default                                    |
| ---------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`             | integer                  | ⛔       | `nextval('avatar_weekly_report_id_seq'...` |
| `report_text`    | text                     | ⛔       |                                            |
| `top_topics`     | jsonb                    | ✅       |                                            |
| `top_hours`      | jsonb                    | ✅       |                                            |
| `weight_changes` | jsonb                    | ✅       |                                            |
| `created_at`     | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `avatar_weekly_report_pkey` — `CREATE UNIQUE INDEX avatar_weekly_report_pkey ON arasul.avatar_weekly_report USING btree (id)`

---

## `bot_audit_log`

> Audit log for all Telegram bot interactions

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | integer                  | ⛔       | `nextval('bot_audit_log_id_seq'::regcl...` |
| `timestamp`        | timestamp with time zone | ⛔       | `now()`                                    |
| `user_id`          | bigint                   | ✅       |                                            |
| `username`         | character varying        | ✅       |                                            |
| `chat_id`          | bigint                   | ⛔       |                                            |
| `command`          | character varying        | ✅       |                                            |
| `message_text`     | text                     | ✅       |                                            |
| `response_text`    | text                     | ✅       |                                            |
| `response_time_ms` | integer                  | ✅       |                                            |
| `success`          | boolean                  | ✅       | `true`                                     |
| `error_message`    | text                     | ✅       |                                            |
| `interaction_type` | character varying        | ✅       | `'message'::character varying`             |
| `metadata`         | jsonb                    | ✅       | `'{}'::jsonb`                              |

**Primary key:** `id`

**Indexes:**

- `bot_audit_log_pkey` — `CREATE UNIQUE INDEX bot_audit_log_pkey ON public.bot_audit_log USING btree (id)`
- `idx_bot_audit_log_chat_id` — `CREATE INDEX idx_bot_audit_log_chat_id ON public.bot_audit_log USING btree (chat_id, "timestamp" DESC)`
- `idx_bot_audit_log_command` — `CREATE INDEX idx_bot_audit_log_command ON public.bot_audit_log USING btree (command) WHERE (command IS NOT NULL)`
- `idx_bot_audit_log_success` — `CREATE INDEX idx_bot_audit_log_success ON public.bot_audit_log USING btree (success, "timestamp" DESC) WHERE (success = false)`
- `idx_bot_audit_log_timestamp` — `CREATE INDEX idx_bot_audit_log_timestamp ON public.bot_audit_log USING btree ("timestamp" DESC)`
- `idx_bot_audit_log_user_id` — `CREATE INDEX idx_bot_audit_log_user_id ON public.bot_audit_log USING btree (user_id, "timestamp" DESC)`

---

## `chat_attachments`

| Column                | Type                     | Nullable | Default                        |
| --------------------- | ------------------------ | -------- | ------------------------------ |
| `id`                  | uuid                     | ⛔       | `gen_random_uuid()`            |
| `message_id`          | bigint                   | ✅       |                                |
| `conversation_id`     | bigint                   | ✅       |                                |
| `filename`            | character varying        | ⛔       |                                |
| `original_filename`   | character varying        | ⛔       |                                |
| `file_path`           | character varying        | ⛔       |                                |
| `file_size`           | bigint                   | ⛔       |                                |
| `mime_type`           | character varying        | ✅       |                                |
| `file_extension`      | character varying        | ✅       |                                |
| `extracted_text`      | text                     | ✅       |                                |
| `extraction_status`   | character varying        | ✅       | `'pending'::character varying` |
| `extraction_metadata` | jsonb                    | ✅       |                                |
| `created_at`          | timestamp with time zone | ✅       | `now()`                        |

**Primary key:** `id`

**Foreign Keys:**

- `message_id` → `chat_messages.id`
- `conversation_id` → `chat_conversations.id`

**Indexes:**

- `chat_attachments_pkey` — `CREATE UNIQUE INDEX chat_attachments_pkey ON public.chat_attachments USING btree (id)`
- `idx_chat_attachments_conversation` — `CREATE INDEX idx_chat_attachments_conversation ON public.chat_attachments USING btree (conversation_id)`
- `idx_chat_attachments_message` — `CREATE INDEX idx_chat_attachments_message ON public.chat_attachments USING btree (message_id)`
- `idx_chat_attachments_status` — `CREATE INDEX idx_chat_attachments_status ON public.chat_attachments USING btree (extraction_status) WHERE ((extraction_status)::text <> 'done'::text)`

---

## `chat_conversations`

> Multi-conversation chat sessions

| Column                     | Type                     | Nullable | Default                                    |
| -------------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                       | bigint                   | ⛔       | `nextval('chat_conversations_id_seq'::...` |
| `title`                    | text                     | ⛔       | `'New Chat'::text`                         |
| `created_at`               | timestamp with time zone | ⛔       | `now()`                                    |
| `updated_at`               | timestamp with time zone | ⛔       | `now()`                                    |
| `deleted_at`               | timestamp with time zone | ✅       |                                            |
| `message_count`            | integer                  | ⛔       | `0`                                        |
| `compaction_summary`       | text                     | ✅       |                                            |
| `compaction_token_count`   | integer                  | ✅       | `0`                                        |
| `compaction_message_count` | integer                  | ✅       | `0`                                        |
| `last_compacted_at`        | timestamp with time zone | ✅       |                                            |
| `use_rag`                  | boolean                  | ✅       | `false`                                    |
| `use_thinking`             | boolean                  | ✅       | `true`                                     |
| `preferred_model`          | character varying        | ✅       | `NULL::character varying`                  |
| `preferred_space_id`       | uuid                     | ✅       |                                            |
| `user_id`                  | bigint                   | ⛔       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `chat_conversations_pkey` — `CREATE UNIQUE INDEX chat_conversations_pkey ON public.chat_conversations USING btree (id)`
- `idx_chat_conversations_deleted` — `CREATE INDEX idx_chat_conversations_deleted ON public.chat_conversations USING btree (deleted_at) WHERE (deleted_at IS NULL)`
- `idx_chat_conversations_updated` — `CREATE INDEX idx_chat_conversations_updated ON public.chat_conversations USING btree (updated_at DESC)`
- `idx_chat_conversations_user` — `CREATE INDEX idx_chat_conversations_user ON public.chat_conversations USING btree (user_id, updated_at DESC) WHERE (deleted_at IS NULL)`
- `idx_conversations_updated` — `CREATE INDEX idx_conversations_updated ON public.chat_conversations USING btree (updated_at DESC) WHERE (deleted_at IS NULL)`

---

## `chat_messages`

> Chat messages with role (user/assistant/system) and optional thinking blocks

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | bigint                   | ⛔       | `nextval('chat_messages_id_seq'::regcl...` |
| `conversation_id` | bigint                   | ⛔       |                                            |
| `role`            | text                     | ⛔       |                                            |
| `content`         | text                     | ⛔       |                                            |
| `thinking`        | text                     | ✅       |                                            |
| `created_at`      | timestamp with time zone | ⛔       | `now()`                                    |
| `job_id`          | uuid                     | ✅       |                                            |
| `status`          | character varying        | ✅       | `'completed'::character varying`           |
| `sources`         | jsonb                    | ✅       |                                            |
| `matched_spaces`  | jsonb                    | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `conversation_id` → `chat_conversations.id`
- `job_id` → `llm_jobs.id`

**Indexes:**

- `chat_messages_pkey` — `CREATE UNIQUE INDEX chat_messages_pkey ON public.chat_messages USING btree (id)`
- `idx_chat_messages_conversation` — `CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id)`
- `idx_chat_messages_conversation_created` — `CREATE INDEX idx_chat_messages_conversation_created ON public.chat_messages USING btree (conversation_id, created_at)`
- `idx_chat_messages_created` — `CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at DESC)`
- `idx_chat_messages_job` — `CREATE INDEX idx_chat_messages_job ON public.chat_messages USING btree (job_id) WHERE (job_id IS NOT NULL)`
- `idx_chat_messages_job_id` — `CREATE INDEX idx_chat_messages_job_id ON public.chat_messages USING btree (job_id) WHERE (job_id IS NOT NULL)`
- `idx_chat_messages_status` — `CREATE INDEX idx_chat_messages_status ON public.chat_messages USING btree (status) WHERE ((status)::text <> 'completed'::text)`

---

## `claude_terminal_queries`

> Claude Terminal query history (max 100 per user)

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | integer                  | ⛔       | `nextval('claude_terminal_queries_id_s...` |
| `session_id`       | integer                  | ✅       |                                            |
| `user_id`          | integer                  | ✅       |                                            |
| `query`            | text                     | ⛔       |                                            |
| `response`         | text                     | ✅       |                                            |
| `injected_context` | jsonb                    | ✅       |                                            |
| `model_used`       | character varying        | ✅       |                                            |
| `tokens_used`      | integer                  | ✅       |                                            |
| `response_time_ms` | integer                  | ✅       |                                            |
| `status`           | character varying        | ✅       | `'pending'::character varying`             |
| `error_message`    | text                     | ✅       |                                            |
| `created_at`       | timestamp with time zone | ✅       | `now()`                                    |
| `completed_at`     | timestamp with time zone | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `session_id` → `claude_terminal_sessions.id`
- `user_id` → `admin_users.id`

**Indexes:**

- `claude_terminal_queries_pkey` — `CREATE UNIQUE INDEX claude_terminal_queries_pkey ON public.claude_terminal_queries USING btree (id)`
- `idx_claude_terminal_queries_created_at` — `CREATE INDEX idx_claude_terminal_queries_created_at ON public.claude_terminal_queries USING btree (created_at DESC)`
- `idx_claude_terminal_queries_session_id` — `CREATE INDEX idx_claude_terminal_queries_session_id ON public.claude_terminal_queries USING btree (session_id)`
- `idx_claude_terminal_queries_status` — `CREATE INDEX idx_claude_terminal_queries_status ON public.claude_terminal_queries USING btree (status)`
- `idx_claude_terminal_queries_user_id` — `CREATE INDEX idx_claude_terminal_queries_user_id ON public.claude_terminal_queries USING btree (user_id)`

---

## `claude_terminal_sessions`

> Claude Terminal user sessions for context persistence

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | integer                  | ⛔       | `nextval('claude_terminal_sessions_id_...` |
| `user_id`          | integer                  | ✅       |                                            |
| `created_at`       | timestamp with time zone | ✅       | `now()`                                    |
| `last_activity_at` | timestamp with time zone | ✅       | `now()`                                    |
| `session_context`  | jsonb                    | ✅       | `'{}'::jsonb`                              |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `claude_terminal_sessions_pkey` — `CREATE UNIQUE INDEX claude_terminal_sessions_pkey ON public.claude_terminal_sessions USING btree (id)`
- `idx_claude_terminal_sessions_user_id` — `CREATE INDEX idx_claude_terminal_sessions_user_id ON public.claude_terminal_sessions USING btree (user_id)`

---

## `claude_workspaces`

> Dynamic workspace management for Claude Code

| Column           | Type                     | Nullable | Default                                    |
| ---------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`             | integer                  | ⛔       | `nextval('claude_workspaces_id_seq'::r...` |
| `name`           | character varying        | ⛔       |                                            |
| `slug`           | character varying        | ⛔       |                                            |
| `description`    | text                     | ✅       |                                            |
| `host_path`      | character varying        | ⛔       |                                            |
| `container_path` | character varying        | ⛔       |                                            |
| `is_default`     | boolean                  | ✅       | `false`                                    |
| `is_system`      | boolean                  | ✅       | `false`                                    |
| `is_active`      | boolean                  | ✅       | `true`                                     |
| `last_used_at`   | timestamp with time zone | ✅       |                                            |
| `usage_count`    | integer                  | ✅       | `0`                                        |
| `created_at`     | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`     | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `claude_workspaces_pkey` — `CREATE UNIQUE INDEX claude_workspaces_pkey ON public.claude_workspaces USING btree (id)`
- `claude_workspaces_slug_key` — `CREATE UNIQUE INDEX claude_workspaces_slug_key ON public.claude_workspaces USING btree (slug)`
- `idx_claude_workspaces_active` — `CREATE INDEX idx_claude_workspaces_active ON public.claude_workspaces USING btree (is_active, name)`
- `idx_claude_workspaces_default` — `CREATE UNIQUE INDEX idx_claude_workspaces_default ON public.claude_workspaces USING btree (is_default) WHERE (is_default = true)`
- `idx_claude_workspaces_slug` — `CREATE INDEX idx_claude_workspaces_slug ON public.claude_workspaces USING btree (slug)`

---

## `compaction_log`

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('compaction_log_id_seq'::regc...` |
| `conversation_id`    | bigint                   | ✅       |                                            |
| `messages_compacted` | integer                  | ⛔       |                                            |
| `tokens_before`      | integer                  | ⛔       |                                            |
| `tokens_after`       | integer                  | ⛔       |                                            |
| `compression_ratio`  | numeric                  | ✅       |                                            |
| `memories_extracted` | integer                  | ✅       | `0`                                        |
| `model_used`         | character varying        | ✅       |                                            |
| `duration_ms`        | integer                  | ✅       |                                            |
| `created_at`         | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `conversation_id` → `chat_conversations.id`

**Indexes:**

- `compaction_log_pkey` — `CREATE UNIQUE INDEX compaction_log_pkey ON public.compaction_log USING btree (id)`
- `idx_compaction_log_conversation` — `CREATE INDEX idx_compaction_log_conversation ON public.compaction_log USING btree (conversation_id)`

---

## `company_context`

> Singleton table for global company context used in all RAG queries

| Column              | Type                     | Nullable | Default    |
| ------------------- | ------------------------ | -------- | ---------- |
| `id`                | integer                  | ⛔       | `1`        |
| `content`           | text                     | ⛔       | `''::text` |
| `content_embedding` | text                     | ✅       |            |
| `updated_at`        | timestamp with time zone | ✅       | `now()`    |
| `updated_by`        | integer                  | ✅       |            |

**Primary key:** `id`

**Indexes:**

- `company_context_pkey` — `CREATE UNIQUE INDEX company_context_pkey ON public.company_context USING btree (id)`

---

## `component_updates`

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | integer                  | ⛔       | `nextval('component_updates_id_seq'::r...` |
| `update_event_id` | integer                  | ✅       |                                            |
| `component_name`  | character varying        | ⛔       |                                            |
| `component_type`  | character varying        | ⛔       |                                            |
| `version_from`    | character varying        | ✅       |                                            |
| `version_to`      | character varying        | ✅       |                                            |
| `status`          | character varying        | ⛔       |                                            |
| `started_at`      | timestamp with time zone | ✅       |                                            |
| `completed_at`    | timestamp with time zone | ✅       |                                            |
| `error_message`   | text                     | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `update_event_id` → `update_events.id`

**Indexes:**

- `component_updates_pkey` — `CREATE UNIQUE INDEX component_updates_pkey ON public.component_updates USING btree (id)`
- `idx_component_updates_event` — `CREATE INDEX idx_component_updates_event ON public.component_updates USING btree (update_event_id)`

---

## `document_access_log`

> Analytics log for document access patterns

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | integer                  | ⛔       | `nextval('document_access_log_id_seq':...` |
| `document_id` | uuid                     | ⛔       |                                            |
| `access_type` | character varying        | ⛔       |                                            |
| `user_id`     | character varying        | ✅       |                                            |
| `query_text`  | text                     | ✅       |                                            |
| `accessed_at` | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `document_id` → `documents.id`

**Indexes:**

- `document_access_log_pkey` — `CREATE UNIQUE INDEX document_access_log_pkey ON public.document_access_log USING btree (id)`
- `idx_document_access_log_document` — `CREATE INDEX idx_document_access_log_document ON public.document_access_log USING btree (document_id)`
- `idx_document_access_log_time` — `CREATE INDEX idx_document_access_log_time ON public.document_access_log USING btree (accessed_at DESC)`

---

## `document_categories`

> Document categories for organization and filtering

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | integer                  | ⛔       | `nextval('document_categories_id_seq':...` |
| `name`        | character varying        | ⛔       |                                            |
| `description` | text                     | ✅       |                                            |
| `color`       | character varying        | ✅       | `'#6366f1'::character varying`             |
| `icon`        | character varying        | ✅       | `'file'::character varying`                |
| `is_system`   | boolean                  | ✅       | `false`                                    |
| `created_at`  | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`  | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `document_categories_name_key` — `CREATE UNIQUE INDEX document_categories_name_key ON public.document_categories USING btree (name)`
- `document_categories_pkey` — `CREATE UNIQUE INDEX document_categories_pkey ON public.document_categories USING btree (id)`
- `idx_document_categories_name` — `CREATE INDEX idx_document_categories_name ON public.document_categories USING btree (name)`

---

## `document_chunks`

> Tracking of document chunks indexed in Qdrant

| Column            | Type                     | Nullable | Default |
| ----------------- | ------------------------ | -------- | ------- |
| `id`              | uuid                     | ⛔       |         |
| `document_id`     | uuid                     | ⛔       |         |
| `chunk_index`     | integer                  | ⛔       |         |
| `chunk_text`      | text                     | ⛔       |         |
| `char_start`      | integer                  | ✅       |         |
| `char_end`        | integer                  | ✅       |         |
| `word_count`      | integer                  | ✅       |         |
| `created_at`      | timestamp with time zone | ✅       | `now()` |
| `parent_chunk_id` | uuid                     | ✅       |         |
| `child_index`     | integer                  | ✅       |         |

**Primary key:** `id`

**Foreign Keys:**

- `document_id` → `documents.id`
- `parent_chunk_id` → `document_parent_chunks.id`

**Indexes:**

- `document_chunks_document_id_chunk_index_key` — `CREATE UNIQUE INDEX document_chunks_document_id_chunk_index_key ON public.document_chunks USING btree (document_id, chunk_index)`
- `document_chunks_pkey` — `CREATE UNIQUE INDEX document_chunks_pkey ON public.document_chunks USING btree (id)`
- `idx_document_chunks_document` — `CREATE INDEX idx_document_chunks_document ON public.document_chunks USING btree (document_id)`
- `idx_document_chunks_document_id` — `CREATE INDEX idx_document_chunks_document_id ON public.document_chunks USING btree (document_id)`
- `idx_document_chunks_document_index` — `CREATE INDEX idx_document_chunks_document_index ON public.document_chunks USING btree (document_id, chunk_index)`
- `idx_document_chunks_parent` — `CREATE INDEX idx_document_chunks_parent ON public.document_chunks USING btree (parent_chunk_id)`
- `idx_document_chunks_text_search_de` — `CREATE INDEX idx_document_chunks_text_search_de ON public.document_chunks USING gin (to_tsvector('german'::regconfig, chunk_text))`

---

## `document_parent_chunks`

| Column         | Type                     | Nullable | Default             |
| -------------- | ------------------------ | -------- | ------------------- |
| `id`           | uuid                     | ⛔       | `gen_random_uuid()` |
| `document_id`  | uuid                     | ⛔       |                     |
| `parent_index` | integer                  | ⛔       |                     |
| `chunk_text`   | text                     | ⛔       |                     |
| `char_start`   | integer                  | ✅       |                     |
| `char_end`     | integer                  | ✅       |                     |
| `word_count`   | integer                  | ✅       |                     |
| `token_count`  | integer                  | ✅       |                     |
| `created_at`   | timestamp with time zone | ✅       | `now()`             |

**Primary key:** `id`

**Foreign Keys:**

- `document_id` → `documents.id`

**Indexes:**

- `document_parent_chunks_document_id_parent_index_key` — `CREATE UNIQUE INDEX document_parent_chunks_document_id_parent_index_key ON public.document_parent_chunks USING btree (document_id, parent_index)`
- `document_parent_chunks_pkey` — `CREATE UNIQUE INDEX document_parent_chunks_pkey ON public.document_parent_chunks USING btree (id)`
- `idx_parent_chunks_document` — `CREATE INDEX idx_parent_chunks_document ON public.document_parent_chunks USING btree (document_id)`

---

## `document_processing_queue`

> Queue for async document processing tasks

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | integer                  | ⛔       | `nextval('document_processing_queue_id...` |
| `document_id`   | uuid                     | ⛔       |                                            |
| `task_type`     | character varying        | ⛔       |                                            |
| `priority`      | integer                  | ✅       | `0`                                        |
| `status`        | character varying        | ✅       | `'pending'::character varying`             |
| `attempts`      | integer                  | ✅       | `0`                                        |
| `max_attempts`  | integer                  | ✅       | `3`                                        |
| `error_message` | text                     | ✅       |                                            |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                    |
| `started_at`    | timestamp with time zone | ✅       |                                            |
| `completed_at`  | timestamp with time zone | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `document_id` → `documents.id`

**Indexes:**

- `document_processing_queue_document_id_task_type_status_key` — `CREATE UNIQUE INDEX document_processing_queue_document_id_task_type_status_key ON public.document_processing_queue USING btree (document_id, task_type, status)`
- `document_processing_queue_pkey` — `CREATE UNIQUE INDEX document_processing_queue_pkey ON public.document_processing_queue USING btree (id)`
- `idx_document_queue_status` — `CREATE INDEX idx_document_queue_status ON public.document_processing_queue USING btree (status, priority DESC)`

---

## `document_similarities`

> Pre-computed document similarity scores

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | integer                  | ⛔       | `nextval('document_similarities_id_seq...` |
| `document_id_1`    | uuid                     | ⛔       |                                            |
| `document_id_2`    | uuid                     | ⛔       |                                            |
| `similarity_score` | numeric                  | ⛔       |                                            |
| `similarity_type`  | character varying        | ✅       | `'semantic'::character varying`            |
| `calculated_at`    | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `document_id_1` → `documents.id`
- `document_id_2` → `documents.id`

**Indexes:**

- `document_similarities_document_id_1_document_id_2_key` — `CREATE UNIQUE INDEX document_similarities_document_id_1_document_id_2_key ON public.document_similarities USING btree (document_id_1, document_id_2)`
- `document_similarities_pkey` — `CREATE UNIQUE INDEX document_similarities_pkey ON public.document_similarities USING btree (id)`
- `idx_document_similarities_doc1` — `CREATE INDEX idx_document_similarities_doc1 ON public.document_similarities USING btree (document_id_1)`
- `idx_document_similarities_doc2` — `CREATE INDEX idx_document_similarities_doc2 ON public.document_similarities USING btree (document_id_2)`
- `idx_document_similarities_score` — `CREATE INDEX idx_document_similarities_score ON public.document_similarities USING btree (similarity_score DESC)`

---

## `documents`

> Main document metadata storage for RAG system

| Column                    | Type                     | Nullable | Default                      |
| ------------------------- | ------------------------ | -------- | ---------------------------- |
| `id`                      | uuid                     | ⛔       | `gen_random_uuid()`          |
| `filename`                | character varying        | ⛔       |                              |
| `original_filename`       | character varying        | ⛔       |                              |
| `file_path`               | character varying        | ⛔       |                              |
| `file_size`               | bigint                   | ⛔       |                              |
| `mime_type`               | character varying        | ✅       |                              |
| `file_extension`          | character varying        | ✅       |                              |
| `content_hash`            | character varying        | ⛔       |                              |
| `file_hash`               | character varying        | ⛔       |                              |
| `status`                  | USER-DEFINED             | ✅       | `'pending'::document_status` |
| `processing_started_at`   | timestamp with time zone | ✅       |                              |
| `processing_completed_at` | timestamp with time zone | ✅       |                              |
| `processing_error`        | text                     | ✅       |                              |
| `retry_count`             | integer                  | ✅       | `0`                          |
| `title`                   | character varying        | ✅       |                              |
| `author`                  | character varying        | ✅       |                              |
| `language`                | character varying        | ✅       | `'de'::character varying`    |
| `page_count`              | integer                  | ✅       |                              |
| `word_count`              | integer                  | ✅       |                              |
| `char_count`              | integer                  | ✅       |                              |
| `chunk_count`             | integer                  | ✅       | `0`                          |
| `embedding_model`         | character varying        | ✅       |                              |
| `summary`                 | text                     | ✅       |                              |
| `key_topics`              | ARRAY                    | ✅       |                              |
| `category_id`             | integer                  | ✅       |                              |
| `category_confidence`     | numeric                  | ✅       |                              |
| `user_tags`               | ARRAY                    | ✅       |                              |
| `user_notes`              | text                     | ✅       |                              |
| `is_favorite`             | boolean                  | ✅       | `false`                      |
| `uploaded_at`             | timestamp with time zone | ✅       | `now()`                      |
| `indexed_at`              | timestamp with time zone | ✅       |                              |
| `updated_at`              | timestamp with time zone | ✅       | `now()`                      |
| `deleted_at`              | timestamp with time zone | ✅       |                              |
| `uploaded_by`             | character varying        | ✅       | `'admin'::character varying` |
| `space_id`                | uuid                     | ✅       |                              |
| `document_summary`        | text                     | ✅       |                              |
| `owner_id`                | integer                  | ✅       |                              |
| `is_context_file`         | boolean                  | ⛔       | `false`                      |

**Primary key:** `id`

**Foreign Keys:**

- `space_id` → `knowledge_spaces.id`
- `category_id` → `document_categories.id`
- `owner_id` → `admin_users.id`

**Indexes:**

- `documents_pkey` — `CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id)`
- `idx_documents_category` — `CREATE INDEX idx_documents_category ON public.documents USING btree (category_id)`
- `idx_documents_category_uploaded` — `CREATE INDEX idx_documents_category_uploaded ON public.documents USING btree (category_id, uploaded_at DESC) WHERE (deleted_at IS NULL)`
- `idx_documents_context_file_unique` — `CREATE UNIQUE INDEX idx_documents_context_file_unique ON public.documents USING btree (space_id) WHERE ((is_context_file = true) AND (deleted_at IS NULL))`
- `idx_documents_deleted_at` — `CREATE INDEX idx_documents_deleted_at ON public.documents USING btree (deleted_at) WHERE (deleted_at IS NULL)`
- `idx_documents_file_hash` — `CREATE INDEX idx_documents_file_hash ON public.documents USING btree (file_hash)`
- `idx_documents_filename` — `CREATE INDEX idx_documents_filename ON public.documents USING btree (filename)`
- `idx_documents_owner` — `CREATE INDEX idx_documents_owner ON public.documents USING btree (owner_id)`
- `idx_documents_search_gin` — `CREATE INDEX idx_documents_search_gin ON public.documents USING gin (to_tsvector('german'::regconfig, (((COALESCE(filename, ''::character varying))::text || ' '::text) || (COALESCE(title, ''::character varying))::text))) WHERE (deleted_at IS NULL)`
- `idx_documents_space_id` — `CREATE INDEX idx_documents_space_id ON public.documents USING btree (space_id)`
- `idx_documents_space_status` — `CREATE INDEX idx_documents_space_status ON public.documents USING btree (space_id, status) WHERE (deleted_at IS NULL)`
- `idx_documents_status` — `CREATE INDEX idx_documents_status ON public.documents USING btree (status)`
- `idx_documents_status_uploaded` — `CREATE INDEX idx_documents_status_uploaded ON public.documents USING btree (status, uploaded_at DESC)`
- `idx_documents_unique_content_hash` — `CREATE UNIQUE INDEX idx_documents_unique_content_hash ON public.documents USING btree (content_hash) WHERE ((deleted_at IS NULL) AND (status <> 'deleted'::document_status))`
- `idx_documents_uploaded_at` — `CREATE INDEX idx_documents_uploaded_at ON public.documents USING btree (uploaded_at DESC)`

---

## `kg_entities`

| Column          | Type                     | Nullable | Default                                   |
| --------------- | ------------------------ | -------- | ----------------------------------------- |
| `id`            | integer                  | ⛔       | `nextval('kg_entities_id_seq'::regclass)` |
| `name`          | text                     | ⛔       |                                           |
| `entity_type`   | text                     | ⛔       |                                           |
| `properties`    | jsonb                    | ✅       | `'{}'::jsonb`                             |
| `mention_count` | integer                  | ✅       | `1`                                       |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                   |
| `updated_at`    | timestamp with time zone | ✅       | `now()`                                   |
| `refined`       | boolean                  | ✅       | `false`                                   |
| `canonical_id`  | integer                  | ✅       |                                           |

**Primary key:** `id`

**Foreign Keys:**

- `canonical_id` → `kg_entities.id`

**Indexes:**

- `idx_kg_entities_canonical` — `CREATE INDEX idx_kg_entities_canonical ON public.kg_entities USING btree (canonical_id) WHERE (canonical_id IS NOT NULL)`
- `idx_kg_entities_name_lower` — `CREATE INDEX idx_kg_entities_name_lower ON public.kg_entities USING btree (lower(name))`
- `idx_kg_entities_name_trgm` — `CREATE INDEX idx_kg_entities_name_trgm ON public.kg_entities USING gin (name gin_trgm_ops)`
- `idx_kg_entities_type` — `CREATE INDEX idx_kg_entities_type ON public.kg_entities USING btree (entity_type)`
- `idx_kg_entities_unrefined` — `CREATE INDEX idx_kg_entities_unrefined ON public.kg_entities USING btree (refined) WHERE (refined = false)`
- `kg_entities_name_entity_type_key` — `CREATE UNIQUE INDEX kg_entities_name_entity_type_key ON public.kg_entities USING btree (name, entity_type)`
- `kg_entities_pkey` — `CREATE UNIQUE INDEX kg_entities_pkey ON public.kg_entities USING btree (id)`

---

## `kg_entity_documents`

| Column          | Type                     | Nullable | Default |
| --------------- | ------------------------ | -------- | ------- |
| `entity_id`     | integer                  | ⛔       |         |
| `document_id`   | uuid                     | ⛔       |         |
| `mention_count` | integer                  | ✅       | `1`     |
| `created_at`    | timestamp with time zone | ✅       | `now()` |

**Primary key:** `entity_id, document_id`

**Foreign Keys:**

- `entity_id` → `kg_entities.id`
- `document_id` → `documents.id`

**Indexes:**

- `idx_kg_entity_documents_doc` — `CREATE INDEX idx_kg_entity_documents_doc ON public.kg_entity_documents USING btree (document_id)`
- `idx_kg_entity_documents_entity_id` — `CREATE INDEX idx_kg_entity_documents_entity_id ON public.kg_entity_documents USING btree (entity_id)`
- `kg_entity_documents_pkey` — `CREATE UNIQUE INDEX kg_entity_documents_pkey ON public.kg_entity_documents USING btree (entity_id, document_id)`

---

## `kg_relations`

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('kg_relations_id_seq'::regclass)` |
| `source_entity_id`   | integer                  | ⛔       |                                            |
| `target_entity_id`   | integer                  | ⛔       |                                            |
| `relation_type`      | text                     | ⛔       |                                            |
| `context`            | text                     | ✅       |                                            |
| `properties`         | jsonb                    | ✅       | `'{}'::jsonb`                              |
| `weight`             | real                     | ✅       | `1.0`                                      |
| `source_document_id` | uuid                     | ✅       |                                            |
| `created_at`         | timestamp with time zone | ✅       | `now()`                                    |
| `refined`            | boolean                  | ✅       | `false`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `source_entity_id` → `kg_entities.id`
- `target_entity_id` → `kg_entities.id`
- `source_document_id` → `documents.id`

**Indexes:**

- `idx_kg_relations_source` — `CREATE INDEX idx_kg_relations_source ON public.kg_relations USING btree (source_entity_id)`
- `idx_kg_relations_target` — `CREATE INDEX idx_kg_relations_target ON public.kg_relations USING btree (target_entity_id)`
- `idx_kg_relations_type` — `CREATE INDEX idx_kg_relations_type ON public.kg_relations USING btree (relation_type)`
- `idx_kg_relations_unrefined` — `CREATE INDEX idx_kg_relations_unrefined ON public.kg_relations USING btree (refined) WHERE ((refined = false) AND (relation_type = 'VERWANDT_MIT'::text))`
- `kg_relations_pkey` — `CREATE UNIQUE INDEX kg_relations_pkey ON public.kg_relations USING btree (id)`
- `kg_relations_source_entity_id_target_entity_id_relation_typ_key` — `CREATE UNIQUE INDEX kg_relations_source_entity_id_target_entity_id_relation_typ_key ON public.kg_relations USING btree (source_entity_id, target_entity_id, relation_type)`

---

## `knowledge_spaces`

> Knowledge spaces (themed document collections) for hierarchical RAG

| Column                   | Type                     | Nullable | Default                        |
| ------------------------ | ------------------------ | -------- | ------------------------------ |
| `id`                     | uuid                     | ⛔       | `gen_random_uuid()`            |
| `name`                   | character varying        | ⛔       |                                |
| `slug`                   | character varying        | ⛔       |                                |
| `icon`                   | character varying        | ✅       | `'folder'::character varying`  |
| `color`                  | character varying        | ✅       | `'#6366f1'::character varying` |
| `sort_order`             | integer                  | ✅       | `0`                            |
| `description`            | text                     | ⛔       |                                |
| `description_embedding`  | text                     | ✅       |                                |
| `auto_summary`           | text                     | ✅       |                                |
| `auto_topics`            | jsonb                    | ✅       | `'[]'::jsonb`                  |
| `auto_glossary`          | jsonb                    | ✅       | `'[]'::jsonb`                  |
| `auto_generated_at`      | timestamp with time zone | ✅       |                                |
| `auto_generation_status` | character varying        | ✅       | `'pending'::character varying` |
| `auto_generation_error`  | text                     | ✅       |                                |
| `document_count`         | integer                  | ✅       | `0`                            |
| `total_chunks`           | integer                  | ✅       | `0`                            |
| `total_size_bytes`       | bigint                   | ✅       | `0`                            |
| `is_default`             | boolean                  | ✅       | `false`                        |
| `is_system`              | boolean                  | ✅       | `false`                        |
| `created_at`             | timestamp with time zone | ✅       | `now()`                        |
| `updated_at`             | timestamp with time zone | ✅       | `now()`                        |
| `owner_id`               | integer                  | ✅       |                                |
| `parent_id`              | uuid                     | ✅       |                                |
| `is_workspace`           | boolean                  | ⛔       | `false`                        |

**Primary key:** `id`

**Foreign Keys:**

- `owner_id` → `admin_users.id`
- `parent_id` → `knowledge_spaces.id`

**Indexes:**

- `idx_knowledge_spaces_is_workspace` — `CREATE INDEX idx_knowledge_spaces_is_workspace ON public.knowledge_spaces USING btree (is_workspace) WHERE (is_workspace = true)`
- `idx_knowledge_spaces_owner` — `CREATE INDEX idx_knowledge_spaces_owner ON public.knowledge_spaces USING btree (owner_id)`
- `idx_knowledge_spaces_parent_id` — `CREATE INDEX idx_knowledge_spaces_parent_id ON public.knowledge_spaces USING btree (parent_id) WHERE (parent_id IS NOT NULL)`
- `idx_knowledge_spaces_single_default` — `CREATE UNIQUE INDEX idx_knowledge_spaces_single_default ON public.knowledge_spaces USING btree (is_default) WHERE (is_default = true)`
- `idx_knowledge_spaces_sort` — `CREATE INDEX idx_knowledge_spaces_sort ON public.knowledge_spaces USING btree (sort_order, name)`
- `idx_knowledge_spaces_updated` — `CREATE INDEX idx_knowledge_spaces_updated ON public.knowledge_spaces USING btree (updated_at DESC)`
- `knowledge_spaces_pkey` — `CREATE UNIQUE INDEX knowledge_spaces_pkey ON public.knowledge_spaces USING btree (id)`
- `knowledge_spaces_slug_key` — `CREATE UNIQUE INDEX knowledge_spaces_slug_key ON public.knowledge_spaces USING btree (slug)`

---

## `llm_installed_models`

> Tracking of installed/downloaded models

| Column                | Type                     | Nullable | Default                          |
| --------------------- | ------------------------ | -------- | -------------------------------- |
| `id`                  | character varying        | ⛔       |                                  |
| `status`              | character varying        | ✅       | `'available'::character varying` |
| `download_progress`   | integer                  | ✅       | `0`                              |
| `downloaded_at`       | timestamp with time zone | ✅       |                                  |
| `last_used_at`        | timestamp with time zone | ✅       |                                  |
| `usage_count`         | integer                  | ✅       | `0`                              |
| `error_message`       | text                     | ✅       |                                  |
| `is_default`          | boolean                  | ✅       | `false`                          |
| `bytes_total`         | bigint                   | ✅       |                                  |
| `bytes_completed`     | bigint                   | ✅       | `0`                              |
| `download_started_at` | timestamp with time zone | ✅       |                                  |
| `last_activity_at`    | timestamp with time zone | ✅       |                                  |
| `attempt_count`       | integer                  | ✅       | `0`                              |
| `last_error_code`     | character varying        | ✅       |                                  |
| `download_speed_bps`  | bigint                   | ✅       |                                  |

**Primary key:** `id`

**Indexes:**

- `idx_llm_installed_models_default` — `CREATE UNIQUE INDEX idx_llm_installed_models_default ON public.llm_installed_models USING btree (is_default) WHERE (is_default = true)`
- `idx_llm_installed_models_last_used` — `CREATE INDEX idx_llm_installed_models_last_used ON public.llm_installed_models USING btree (last_used_at DESC NULLS LAST)`
- `idx_llm_installed_models_recovery` — `CREATE INDEX idx_llm_installed_models_recovery ON public.llm_installed_models USING btree (status, last_activity_at) WHERE ((status)::text = ANY ((ARRAY['downloading'::character varying, 'paused'::character varying])::text[]))`
- `idx_llm_installed_models_status` — `CREATE INDEX idx_llm_installed_models_status ON public.llm_installed_models USING btree (status)`
- `llm_installed_models_pkey` — `CREATE UNIQUE INDEX llm_installed_models_pkey ON public.llm_installed_models USING btree (id)`

---

## `llm_jobs`

> Background LLM streaming jobs for tab-switch resilience

| Column                | Type                     | Nullable | Default                        |
| --------------------- | ------------------------ | -------- | ------------------------------ |
| `id`                  | uuid                     | ⛔       | `gen_random_uuid()`            |
| `conversation_id`     | bigint                   | ⛔       |                                |
| `message_id`          | bigint                   | ✅       |                                |
| `job_type`            | character varying        | ⛔       |                                |
| `status`              | character varying        | ⛔       | `'pending'::character varying` |
| `request_data`        | jsonb                    | ⛔       |                                |
| `content`             | text                     | ⛔       | `''::text`                     |
| `thinking`            | text                     | ✅       |                                |
| `sources`             | jsonb                    | ✅       |                                |
| `created_at`          | timestamp with time zone | ⛔       | `now()`                        |
| `started_at`          | timestamp with time zone | ✅       |                                |
| `completed_at`        | timestamp with time zone | ✅       |                                |
| `last_update_at`      | timestamp with time zone | ⛔       | `now()`                        |
| `error_message`       | text                     | ✅       |                                |
| `queue_position`      | integer                  | ✅       |                                |
| `queued_at`           | timestamp with time zone | ✅       | `now()`                        |
| `priority`            | integer                  | ✅       | `0`                            |
| `requested_model`     | character varying        | ✅       |                                |
| `model_sequence`      | jsonb                    | ✅       |                                |
| `max_wait_seconds`    | integer                  | ✅       | `120`                          |
| `prompt_tokens`       | integer                  | ✅       |                                |
| `completion_tokens`   | integer                  | ✅       |                                |
| `context_window_used` | integer                  | ✅       |                                |
| `matched_spaces`      | jsonb                    | ✅       |                                |
| `images`              | jsonb                    | ✅       |                                |

**Primary key:** `id`

**Foreign Keys:**

- `conversation_id` → `chat_conversations.id`
- `message_id` → `chat_messages.id`

**Indexes:**

- `idx_llm_jobs_completed_at` — `CREATE INDEX idx_llm_jobs_completed_at ON public.llm_jobs USING btree (completed_at) WHERE ((status)::text = ANY ((ARRAY['completed'::character varying, 'error'::character varying, 'cancelled'::character varying])::text[]))`
- `idx_llm_jobs_conversation` — `CREATE INDEX idx_llm_jobs_conversation ON public.llm_jobs USING btree (conversation_id)`
- `idx_llm_jobs_conversation_status` — `CREATE INDEX idx_llm_jobs_conversation_status ON public.llm_jobs USING btree (conversation_id, status) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying, 'streaming'::character varying])::text[]))`
- `idx_llm_jobs_created` — `CREATE INDEX idx_llm_jobs_created ON public.llm_jobs USING btree (created_at DESC)`
- `idx_llm_jobs_fairness_check` — `CREATE INDEX idx_llm_jobs_fairness_check ON public.llm_jobs USING btree (queued_at) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_model_pending` — `CREATE INDEX idx_llm_jobs_model_pending ON public.llm_jobs USING btree (requested_model, priority DESC, queued_at) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_queue` — `CREATE INDEX idx_llm_jobs_queue ON public.llm_jobs USING btree (queue_position) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_queue_position` — `CREATE INDEX idx_llm_jobs_queue_position ON public.llm_jobs USING btree (queue_position) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying])::text[]))`
- `idx_llm_jobs_status` — `CREATE INDEX idx_llm_jobs_status ON public.llm_jobs USING btree (status) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'streaming'::character varying])::text[]))`
- `idx_llm_jobs_status_created` — `CREATE INDEX idx_llm_jobs_status_created ON public.llm_jobs USING btree (status, created_at DESC)`
- `llm_jobs_pkey` — `CREATE UNIQUE INDEX llm_jobs_pkey ON public.llm_jobs USING btree (id)`

---

## `llm_model_catalog`

> Curated catalog of Jetson-tested LLM models

| Column                  | Type                     | Nullable | Default                         |
| ----------------------- | ------------------------ | -------- | ------------------------------- |
| `id`                    | character varying        | ⛔       |                                 |
| `name`                  | character varying        | ⛔       |                                 |
| `description`           | text                     | ✅       |                                 |
| `size_bytes`            | bigint                   | ⛔       |                                 |
| `ram_required_gb`       | integer                  | ⛔       |                                 |
| `category`              | character varying        | ⛔       |                                 |
| `capabilities`          | jsonb                    | ✅       | `'[]'::jsonb`                   |
| `recommended_for`       | jsonb                    | ✅       | `'[]'::jsonb`                   |
| `jetson_tested`         | boolean                  | ✅       | `true`                          |
| `performance_tier`      | integer                  | ✅       | `2`                             |
| `ollama_library_url`    | character varying        | ✅       |                                 |
| `added_at`              | timestamp with time zone | ✅       | `now()`                         |
| `updated_at`            | timestamp with time zone | ✅       | `now()`                         |
| `ollama_name`           | character varying        | ✅       |                                 |
| `supports_thinking`     | boolean                  | ✅       | `false`                         |
| `rag_optimized`         | boolean                  | ✅       | `false`                         |
| `model_type`            | character varying        | ✅       | `'llm'::character varying`      |
| `context_window`        | integer                  | ✅       |                                 |
| `recommended_ctx`       | integer                  | ✅       | `8192`                          |
| `supports_vision_input` | boolean                  | ✅       | `false`                         |
| `is_platform_default`   | boolean                  | ✅       | `false`                         |
| `speed_tier`            | character varying        | ✅       | `'balanced'::character varying` |

**Primary key:** `id`

**Indexes:**

- `idx_llm_catalog_capabilities` — `CREATE INDEX idx_llm_catalog_capabilities ON public.llm_model_catalog USING btree (supports_thinking, rag_optimized)`
- `idx_llm_catalog_platform_default` — `CREATE INDEX idx_llm_catalog_platform_default ON public.llm_model_catalog USING btree (is_platform_default) WHERE (is_platform_default = true)`
- `idx_llm_catalog_speed_tier` — `CREATE INDEX idx_llm_catalog_speed_tier ON public.llm_model_catalog USING btree (speed_tier)`
- `idx_llm_catalog_vision` — `CREATE INDEX idx_llm_catalog_vision ON public.llm_model_catalog USING btree (supports_vision_input) WHERE (supports_vision_input = true)`
- `idx_llm_model_catalog_category` — `CREATE INDEX idx_llm_model_catalog_category ON public.llm_model_catalog USING btree (category)`
- `idx_llm_model_catalog_ollama_name` — `CREATE INDEX idx_llm_model_catalog_ollama_name ON public.llm_model_catalog USING btree (ollama_name)`
- `idx_llm_model_catalog_performance` — `CREATE INDEX idx_llm_model_catalog_performance ON public.llm_model_catalog USING btree (performance_tier)`
- `idx_model_catalog_type` — `CREATE INDEX idx_model_catalog_type ON public.llm_model_catalog USING btree (model_type)`
- `llm_model_catalog_pkey` — `CREATE UNIQUE INDEX llm_model_catalog_pkey ON public.llm_model_catalog USING btree (id)`

---

## `llm_model_switches`

> History of model switches for analytics

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('llm_model_switches_id_seq'::...` |
| `from_model`         | character varying        | ✅       |                                            |
| `to_model`           | character varying        | ⛔       |                                            |
| `switch_duration_ms` | integer                  | ✅       |                                            |
| `triggered_by`       | character varying        | ✅       |                                            |
| `reason`             | character varying        | ✅       |                                            |
| `switched_at`        | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_llm_model_switches_time` — `CREATE INDEX idx_llm_model_switches_time ON public.llm_model_switches USING btree (switched_at DESC)`
- `llm_model_switches_pkey` — `CREATE UNIQUE INDEX llm_model_switches_pkey ON public.llm_model_switches USING btree (id)`

---

## `login_attempts`

> Login attempt history for security monitoring

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | bigint                   | ⛔       | `nextval('login_attempts_id_seq'::regc...` |
| `username`     | character varying        | ⛔       |                                            |
| `ip_address`   | inet                     | ⛔       |                                            |
| `success`      | boolean                  | ⛔       |                                            |
| `attempted_at` | timestamp with time zone | ✅       | `now()`                                    |
| `user_agent`   | text                     | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_login_attempts_ip` — `CREATE INDEX idx_login_attempts_ip ON public.login_attempts USING btree (ip_address)`
- `idx_login_attempts_ip_time` — `CREATE INDEX idx_login_attempts_ip_time ON public.login_attempts USING btree (ip_address, attempted_at DESC)`
- `idx_login_attempts_time` — `CREATE INDEX idx_login_attempts_time ON public.login_attempts USING btree (attempted_at DESC)`
- `idx_login_attempts_username` — `CREATE INDEX idx_login_attempts_username ON public.login_attempts USING btree (username)`
- `idx_login_attempts_username_time` — `CREATE INDEX idx_login_attempts_username_time ON public.login_attempts USING btree (username, attempted_at DESC)`
- `login_attempts_pkey` — `CREATE UNIQUE INDEX login_attempts_pkey ON public.login_attempts USING btree (id)`

---

## `metrics_cpu`

> CPU utilization metrics (percentage)

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `value`      | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_cpu_recent` — `CREATE INDEX idx_metrics_cpu_recent ON public.metrics_cpu USING btree ("timestamp" DESC)`
- `idx_metrics_cpu_timestamp` — `CREATE INDEX idx_metrics_cpu_timestamp ON public.metrics_cpu USING btree ("timestamp" DESC)`
- `metrics_cpu_pkey` — `CREATE UNIQUE INDEX metrics_cpu_pkey ON public.metrics_cpu USING btree ("timestamp")`

---

## `metrics_disk`

> Disk usage metrics

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `used`       | bigint                   | ⛔       |         |
| `free`       | bigint                   | ⛔       |         |
| `percent`    | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_disk_recent` — `CREATE INDEX idx_metrics_disk_recent ON public.metrics_disk USING btree ("timestamp" DESC)`
- `idx_metrics_disk_timestamp` — `CREATE INDEX idx_metrics_disk_timestamp ON public.metrics_disk USING btree ("timestamp" DESC)`
- `metrics_disk_pkey` — `CREATE UNIQUE INDEX metrics_disk_pkey ON public.metrics_disk USING btree ("timestamp")`

---

## `metrics_gpu`

> GPU utilization metrics (percentage)

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `value`      | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_gpu_recent` — `CREATE INDEX idx_metrics_gpu_recent ON public.metrics_gpu USING btree ("timestamp" DESC)`
- `idx_metrics_gpu_timestamp` — `CREATE INDEX idx_metrics_gpu_timestamp ON public.metrics_gpu USING btree ("timestamp" DESC)`
- `metrics_gpu_pkey` — `CREATE UNIQUE INDEX metrics_gpu_pkey ON public.metrics_gpu USING btree ("timestamp")`

---

## `metrics_infra`

> Generic infra metrics sink: one row per (source_type, source_name, collection). payload is JSONB so new metrics do not require migrations.

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | bigint                   | ⛔       | `nextval('metrics_infra_id_seq'::regcl...` |
| `source_type`  | character varying        | ⛔       |                                            |
| `source_name`  | character varying        | ⛔       |                                            |
| `payload`      | jsonb                    | ⛔       | `'{}'::jsonb`                              |
| `collected_at` | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_metrics_infra_collected_at` — `CREATE INDEX idx_metrics_infra_collected_at ON public.metrics_infra USING btree (collected_at DESC)`
- `idx_metrics_infra_type_name_time` — `CREATE INDEX idx_metrics_infra_type_name_time ON public.metrics_infra USING btree (source_type, source_name, collected_at DESC)`
- `metrics_infra_pkey` — `CREATE UNIQUE INDEX metrics_infra_pkey ON public.metrics_infra USING btree (id)`

---

## `metrics_ram`

> RAM utilization metrics (percentage)

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `value`      | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_ram_recent` — `CREATE INDEX idx_metrics_ram_recent ON public.metrics_ram USING btree ("timestamp" DESC)`
- `idx_metrics_ram_timestamp` — `CREATE INDEX idx_metrics_ram_timestamp ON public.metrics_ram USING btree ("timestamp" DESC)`
- `metrics_ram_pkey` — `CREATE UNIQUE INDEX metrics_ram_pkey ON public.metrics_ram USING btree ("timestamp")`

---

## `metrics_swap`

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `value`      | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_swap_recent` — `CREATE INDEX idx_metrics_swap_recent ON public.metrics_swap USING btree ("timestamp" DESC)`
- `idx_metrics_swap_timestamp` — `CREATE INDEX idx_metrics_swap_timestamp ON public.metrics_swap USING btree ("timestamp" DESC)`
- `metrics_swap_pkey` — `CREATE UNIQUE INDEX metrics_swap_pkey ON public.metrics_swap USING btree ("timestamp")`

---

## `metrics_temperature`

> System temperature metrics (Celsius)

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `timestamp`  | timestamp with time zone | ⛔       |         |
| `value`      | double precision         | ⛔       |         |
| `created_at` | timestamp with time zone | ✅       | `now()` |

**Primary key:** `timestamp`

**Indexes:**

- `idx_metrics_temperature_recent` — `CREATE INDEX idx_metrics_temperature_recent ON public.metrics_temperature USING btree ("timestamp" DESC)`
- `idx_metrics_temperature_timestamp` — `CREATE INDEX idx_metrics_temperature_timestamp ON public.metrics_temperature USING btree ("timestamp" DESC)`
- `metrics_temperature_pkey` — `CREATE UNIQUE INDEX metrics_temperature_pkey ON public.metrics_temperature USING btree ("timestamp")`

---

## `model_performance_metrics`

> Tracks LLM performance metrics (tokens/s, latency) for each model and request type

| Column                   | Type                     | Nullable | Default                                    |
| ------------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`                     | integer                  | ⛔       | `nextval('model_performance_metrics_id...` |
| `model_id`               | character varying        | ⛔       |                                            |
| `job_id`                 | uuid                     | ✅       |                                            |
| `job_type`               | character varying        | ⛔       | `'chat'::character varying`                |
| `tokens_generated`       | integer                  | ⛔       | `0`                                        |
| `prompt_tokens`          | integer                  | ✅       |                                            |
| `time_to_first_token_ms` | integer                  | ✅       |                                            |
| `total_duration_ms`      | integer                  | ⛔       |                                            |
| `tokens_per_second`      | numeric                  | ✅       |                                            |
| `thinking_enabled`       | boolean                  | ✅       | `false`                                    |
| `context_length`         | integer                  | ✅       |                                            |
| `created_at`             | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `job_id` → `llm_jobs.id`

**Indexes:**

- `idx_perf_created_at` — `CREATE INDEX idx_perf_created_at ON public.model_performance_metrics USING btree (created_at DESC)`
- `idx_perf_job_type` — `CREATE INDEX idx_perf_job_type ON public.model_performance_metrics USING btree (job_type)`
- `idx_perf_model_id` — `CREATE INDEX idx_perf_model_id ON public.model_performance_metrics USING btree (model_id)`
- `model_performance_metrics_pkey` — `CREATE UNIQUE INDEX model_performance_metrics_pkey ON public.model_performance_metrics USING btree (id)`

---

## `n8n_allowed_external_domains`

> Phase 1.7: Whitelist externer Domains, die n8n-Workflows kontaktieren dürfen. Leer = alles geblockt. Verwaltung über Settings → n8n-Integration.

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | integer                  | ⛔       | `nextval('n8n_allowed_external_domains...` |
| `domain`      | character varying        | ⛔       |                                            |
| `description` | text                     | ✅       |                                            |
| `added_by`    | integer                  | ✅       |                                            |
| `added_at`    | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `added_by` → `admin_users.id`

**Indexes:**

- `n8n_allowed_external_domains_domain_key` — `CREATE UNIQUE INDEX n8n_allowed_external_domains_domain_key ON public.n8n_allowed_external_domains USING btree (domain)`
- `n8n_allowed_external_domains_pkey` — `CREATE UNIQUE INDEX n8n_allowed_external_domains_pkey ON public.n8n_allowed_external_domains USING btree (id)`

---

## `n8n_audit_log`

> DSGVO Art-30 audit trail for n8n workflow/credential/user mutations. Phase-3 EXTERNAL_INTEGRATIONS plan. Pruned by run_all_cleanups()/cleanup_n8n_audit_log().

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | bigint                   | ⛔       | `nextval('n8n_audit_log_id_seq'::regcl...` |
| `occurred_at` | timestamp with time zone | ⛔       | `now()`                                    |
| `table_name`  | text                     | ⛔       |                                            |
| `action`      | text                     | ⛔       |                                            |
| `row_id`      | text                     | ✅       |                                            |
| `actor_id`    | text                     | ✅       |                                            |
| `diff`        | jsonb                    | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_n8n_audit_log_occurred_at` — `CREATE INDEX idx_n8n_audit_log_occurred_at ON arasul.n8n_audit_log USING btree (occurred_at DESC)`
- `idx_n8n_audit_log_table_action` — `CREATE INDEX idx_n8n_audit_log_table_action ON arasul.n8n_audit_log USING btree (table_name, action)`
- `n8n_audit_log_pkey` — `CREATE UNIQUE INDEX n8n_audit_log_pkey ON arasul.n8n_audit_log USING btree (id)`

---

## `n8n_external_call_log`

> Phase 1.7: Audit-Trail für jeden externen HTTP-Call aus n8n-Workflows. Beweispflicht für Kanzlei-DSB.

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('n8n_external_call_log_id_seq...` |
| `workflow_id`   | character varying        | ✅       |                                            |
| `workflow_name` | character varying        | ✅       |                                            |
| `execution_id`  | character varying        | ✅       |                                            |
| `target_url`    | text                     | ⛔       |                                            |
| `target_host`   | character varying        | ⛔       |                                            |
| `method`        | character varying        | ⛔       | `'GET'::character varying`                 |
| `status_code`   | integer                  | ✅       |                                            |
| `blocked`       | boolean                  | ⛔       | `false`                                    |
| `block_reason`  | text                     | ✅       |                                            |
| `duration_ms`   | integer                  | ✅       |                                            |
| `created_at`    | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_n8n_calls_blocked` — `CREATE INDEX idx_n8n_calls_blocked ON public.n8n_external_call_log USING btree (blocked, created_at DESC) WHERE (blocked = true)`
- `idx_n8n_calls_created_at` — `CREATE INDEX idx_n8n_calls_created_at ON public.n8n_external_call_log USING btree (created_at DESC)`
- `idx_n8n_calls_target_host` — `CREATE INDEX idx_n8n_calls_target_host ON public.n8n_external_call_log USING btree (target_host)`
- `idx_n8n_calls_workflow` — `CREATE INDEX idx_n8n_calls_workflow ON public.n8n_external_call_log USING btree (workflow_id, created_at DESC)`
- `n8n_external_call_log_pkey` — `CREATE UNIQUE INDEX n8n_external_call_log_pkey ON public.n8n_external_call_log USING btree (id)`

---

## `notification_events`

> Stores all events that trigger notifications

| Column                 | Type                     | Nullable | Default                                    |
| ---------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                   | integer                  | ⛔       | `nextval('notification_events_id_seq':...` |
| `event_type`           | character varying        | ⛔       |                                            |
| `event_category`       | character varying        | ⛔       |                                            |
| `source_service`       | character varying        | ✅       |                                            |
| `severity`             | character varying        | ✅       | `'info'::character varying`                |
| `title`                | character varying        | ⛔       |                                            |
| `message`              | text                     | ✅       |                                            |
| `metadata`             | jsonb                    | ✅       | `'{}'::jsonb`                              |
| `notification_sent`    | boolean                  | ✅       | `false`                                    |
| `notification_sent_at` | timestamp with time zone | ✅       |                                            |
| `notification_error`   | text                     | ✅       |                                            |
| `retry_count`          | integer                  | ✅       | `0`                                        |
| `created_at`           | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_notification_events_created` — `CREATE INDEX idx_notification_events_created ON public.notification_events USING btree (created_at DESC)`
- `idx_notification_events_severity` — `CREATE INDEX idx_notification_events_severity ON public.notification_events USING btree (severity)`
- `idx_notification_events_type` — `CREATE INDEX idx_notification_events_type ON public.notification_events USING btree (event_type)`
- `idx_notification_events_unsent` — `CREATE INDEX idx_notification_events_unsent ON public.notification_events USING btree (notification_sent) WHERE (notification_sent = false)`
- `notification_events_pkey` — `CREATE UNIQUE INDEX notification_events_pkey ON public.notification_events USING btree (id)`

---

## `notification_rate_limits`

> Prevents notification spam via rate limiting

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | integer                  | ⛔       | `nextval('notification_rate_limits_id_...` |
| `user_id`      | integer                  | ✅       |                                            |
| `channel`      | character varying        | ⛔       |                                            |
| `event_type`   | character varying        | ⛔       |                                            |
| `window_start` | timestamp with time zone | ⛔       |                                            |
| `count`        | integer                  | ✅       | `1`                                        |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `idx_notification_rate_limits_window` — `CREATE INDEX idx_notification_rate_limits_window ON public.notification_rate_limits USING btree (user_id, channel, window_start)`
- `notification_rate_limits_pkey` — `CREATE UNIQUE INDEX notification_rate_limits_pkey ON public.notification_rate_limits USING btree (id)`
- `notification_rate_limits_user_id_channel_event_type_window__key` — `CREATE UNIQUE INDEX notification_rate_limits_user_id_channel_event_type_window__key ON public.notification_rate_limits USING btree (user_id, channel, event_type, window_start)`

---

## `notification_settings`

> User preferences for notification delivery

| Column                        | Type                     | Nullable | Default                                    |
| ----------------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                          | integer                  | ⛔       | `nextval('notification_settings_id_seq...` |
| `user_id`                     | integer                  | ✅       |                                            |
| `channel`                     | character varying        | ⛔       | `'telegram'::character varying`            |
| `enabled`                     | boolean                  | ✅       | `true`                                     |
| `event_types`                 | ARRAY                    | ✅       | `ARRAY['service_status'::text, 'workfl...` |
| `min_severity`                | character varying        | ✅       | `'warning'::character varying`             |
| `rate_limit_per_minute`       | integer                  | ✅       | `10`                                       |
| `rate_limit_per_hour`         | integer                  | ✅       | `100`                                      |
| `quiet_hours_start`           | time without time zone   | ✅       |                                            |
| `quiet_hours_end`             | time without time zone   | ✅       |                                            |
| `telegram_chat_id`            | character varying        | ✅       |                                            |
| `telegram_bot_token_override` | character varying        | ✅       |                                            |
| `webhook_url`                 | character varying        | ✅       |                                            |
| `webhook_secret`              | character varying        | ✅       |                                            |
| `created_at`                  | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`                  | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `notification_settings_pkey` — `CREATE UNIQUE INDEX notification_settings_pkey ON public.notification_settings USING btree (id)`
- `notification_settings_user_id_channel_key` — `CREATE UNIQUE INDEX notification_settings_user_id_channel_key ON public.notification_settings USING btree (user_id, channel)`

---

## `password_history`

> Password change history

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('password_history_id_seq'::re...` |
| `user_id`       | bigint                   | ✅       |                                            |
| `password_hash` | character varying        | ⛔       |                                            |
| `changed_at`    | timestamp with time zone | ✅       | `now()`                                    |
| `changed_by`    | character varying        | ✅       |                                            |
| `ip_address`    | inet                     | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `idx_password_history_time` — `CREATE INDEX idx_password_history_time ON public.password_history USING btree (changed_at DESC)`
- `idx_password_history_user` — `CREATE INDEX idx_password_history_user ON public.password_history USING btree (user_id)`
- `password_history_pkey` — `CREATE UNIQUE INDEX password_history_pkey ON public.password_history USING btree (id)`

---

## `platform_apps`

> Kuratierte Plattform-Apps (Extensions-Tab): pro App an/aus. v1-Seed: n8n, telegram, database.

| Column       | Type                     | Nullable | Default |
| ------------ | ------------------------ | -------- | ------- |
| `id`         | text                     | ⛔       |         |
| `enabled`    | boolean                  | ⛔       | `false` |
| `updated_at` | timestamp with time zone | ⛔       | `now()` |

**Primary key:** `id`

**Indexes:**

- `platform_apps_pkey` — `CREATE UNIQUE INDEX platform_apps_pkey ON arasul.platform_apps USING btree (id)`

---

## `rag_query_log`

> Per-query RAG telemetry. Aggregated by /api/rag/metrics for the Database Overview dashboard.

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | bigint                   | ⛔       | `nextval('rag_query_log_id_seq'::regcl...` |
| `created_at`       | timestamp with time zone | ⛔       | `now()`                                    |
| `conversation_id`  | integer                  | ✅       |                                            |
| `user_id`          | integer                  | ✅       |                                            |
| `query_text`       | text                     | ✅       |                                            |
| `query_length`     | integer                  | ⛔       |                                            |
| `retrieved_count`  | integer                  | ⛔       | `0`                                        |
| `top_rerank_score` | double precision         | ✅       |                                            |
| `avg_rerank_score` | double precision         | ✅       |                                            |
| `space_ids`        | ARRAY                    | ✅       |                                            |
| `routing_method`   | text                     | ✅       |                                            |
| `marginal_results` | boolean                  | ⛔       | `false`                                    |
| `no_relevant_docs` | boolean                  | ⛔       | `false`                                    |
| `response_length`  | integer                  | ✅       |                                            |
| `latency_ms`       | integer                  | ✅       |                                            |
| `error`            | text                     | ✅       |                                            |
| `query_hash`       | character varying        | ✅       |                                            |
| `query_language`   | character varying        | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_rag_query_log_conversation` — `CREATE INDEX idx_rag_query_log_conversation ON public.rag_query_log USING btree (conversation_id)`
- `idx_rag_query_log_created_at` — `CREATE INDEX idx_rag_query_log_created_at ON public.rag_query_log USING btree (created_at DESC)`
- `idx_rag_query_log_hash` — `CREATE INDEX idx_rag_query_log_hash ON public.rag_query_log USING btree (query_hash) WHERE (query_hash IS NOT NULL)`
- `rag_query_log_pkey` — `CREATE UNIQUE INDEX rag_query_log_pkey ON public.rag_query_log USING btree (id)`

---

## `reboot_events`

| Column              | Type                     | Nullable | Default                                    |
| ------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                | bigint                   | ⛔       | `nextval('reboot_events_id_seq'::regcl...` |
| `timestamp`         | timestamp with time zone | ⛔       | `now()`                                    |
| `reason`            | text                     | ⛔       |                                            |
| `pre_reboot_state`  | jsonb                    | ⛔       |                                            |
| `post_reboot_state` | jsonb                    | ✅       |                                            |
| `reboot_completed`  | boolean                  | ✅       | `false`                                    |
| `validation_passed` | boolean                  | ✅       |                                            |
| `created_at`        | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_reboot_events_timestamp` — `CREATE INDEX idx_reboot_events_timestamp ON public.reboot_events USING btree ("timestamp" DESC)`
- `reboot_events_pkey` — `CREATE UNIQUE INDEX reboot_events_pkey ON public.reboot_events USING btree (id)`

---

## `recovery_actions`

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('recovery_actions_id_seq'::re...` |
| `timestamp`     | timestamp with time zone | ⛔       | `now()`                                    |
| `action_type`   | text                     | ⛔       |                                            |
| `service_name`  | text                     | ✅       |                                            |
| `reason`        | text                     | ⛔       |                                            |
| `success`       | boolean                  | ⛔       |                                            |
| `duration_ms`   | integer                  | ✅       |                                            |
| `error_message` | text                     | ✅       |                                            |
| `metadata`      | jsonb                    | ✅       |                                            |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_recovery_actions_action_type` — `CREATE INDEX idx_recovery_actions_action_type ON public.recovery_actions USING btree (action_type)`
- `idx_recovery_actions_service` — `CREATE INDEX idx_recovery_actions_service ON public.recovery_actions USING btree (service_name)`
- `idx_recovery_actions_timestamp` — `CREATE INDEX idx_recovery_actions_timestamp ON public.recovery_actions USING btree ("timestamp" DESC)`
- `recovery_actions_pkey` — `CREATE UNIQUE INDEX recovery_actions_pkey ON public.recovery_actions USING btree (id)`

---

## `sandbox_projects`

> Persistent sandbox development environments with Docker containers

| Column                   | Type                     | Nullable | Default                                    |
| ------------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`                     | uuid                     | ⛔       | `gen_random_uuid()`                        |
| `name`                   | character varying        | ⛔       |                                            |
| `slug`                   | character varying        | ⛔       |                                            |
| `description`            | text                     | ✅       | `''::text`                                 |
| `icon`                   | character varying        | ✅       | `'terminal'::character varying`            |
| `color`                  | character varying        | ✅       | `'#45ADFF'::character varying`             |
| `base_image`             | character varying        | ⛔       | `'arasul-sandbox:latest'::character va...` |
| `status`                 | USER-DEFINED             | ✅       | `'active'::sandbox_project_status`         |
| `container_id`           | character varying        | ✅       |                                            |
| `container_name`         | character varying        | ✅       |                                            |
| `container_status`       | USER-DEFINED             | ✅       | `'none'::sandbox_container_status`         |
| `committed_image`        | character varying        | ✅       |                                            |
| `host_path`              | text                     | ⛔       |                                            |
| `container_path`         | text                     | ⛔       | `'/workspace'::text`                       |
| `resource_limits`        | jsonb                    | ✅       | `'{"cpus": "2", "pids": 256, "memory":...` |
| `environment`            | jsonb                    | ✅       | `'{}'::jsonb`                              |
| `installed_packages`     | ARRAY                    | ✅       | `'{}'::text[]`                             |
| `last_accessed_at`       | timestamp with time zone | ✅       |                                            |
| `total_terminal_seconds` | integer                  | ✅       | `0`                                        |
| `created_at`             | timestamp with time zone | ✅       | `now()`                                    |
| `updated_at`             | timestamp with time zone | ✅       | `now()`                                    |
| `network_mode`           | character varying        | ✅       | `'internal'::character varying`            |
| `user_id`                | integer                  | ✅       |                                            |
| `agent_run_token_hash`   | text                     | ✅       |                                            |
| `agent_run_token_set_at` | timestamp with time zone | ✅       |                                            |
| `space_id`               | uuid                     | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `space_id` → `knowledge_spaces.id`
- `user_id` → `admin_users.id`

**Indexes:**

- `idx_sandbox_projects_container_status` — `CREATE INDEX idx_sandbox_projects_container_status ON public.sandbox_projects USING btree (container_status) WHERE (container_status = ANY (ARRAY['running'::sandbox_container_status, 'creating'::sandbox_container_status]))`
- `idx_sandbox_projects_last_accessed` — `CREATE INDEX idx_sandbox_projects_last_accessed ON public.sandbox_projects USING btree (last_accessed_at DESC NULLS LAST) WHERE (status = 'active'::sandbox_project_status)`
- `idx_sandbox_projects_slug` — `CREATE INDEX idx_sandbox_projects_slug ON public.sandbox_projects USING btree (slug)`
- `idx_sandbox_projects_space_id` — `CREATE INDEX idx_sandbox_projects_space_id ON public.sandbox_projects USING btree (space_id)`
- `idx_sandbox_projects_status` — `CREATE INDEX idx_sandbox_projects_status ON public.sandbox_projects USING btree (status)`
- `idx_sandbox_projects_user_id` — `CREATE INDEX idx_sandbox_projects_user_id ON public.sandbox_projects USING btree (user_id)`
- `sandbox_projects_pkey` — `CREATE UNIQUE INDEX sandbox_projects_pkey ON public.sandbox_projects USING btree (id)`
- `sandbox_projects_slug_key` — `CREATE UNIQUE INDEX sandbox_projects_slug_key ON public.sandbox_projects USING btree (slug)`

---

## `sandbox_terminal_sessions`

> Active and historical terminal sessions within sandbox projects

| Column              | Type                     | Nullable | Default                            |
| ------------------- | ------------------------ | -------- | ---------------------------------- |
| `id`                | uuid                     | ⛔       | `gen_random_uuid()`                |
| `project_id`        | uuid                     | ⛔       |                                    |
| `session_type`      | USER-DEFINED             | ✅       | `'shell'::sandbox_session_type`    |
| `command`           | text                     | ✅       | `'/bin/bash'::text`                |
| `status`            | USER-DEFINED             | ✅       | `'active'::sandbox_session_status` |
| `container_exec_id` | character varying        | ✅       |                                    |
| `started_at`        | timestamp with time zone | ✅       | `now()`                            |
| `ended_at`          | timestamp with time zone | ✅       |                                    |
| `metadata`          | jsonb                    | ✅       | `'{}'::jsonb`                      |

**Primary key:** `id`

**Foreign Keys:**

- `project_id` → `sandbox_projects.id`

**Indexes:**

- `idx_sandbox_sessions_active` — `CREATE INDEX idx_sandbox_sessions_active ON public.sandbox_terminal_sessions USING btree (project_id, status) WHERE (status = 'active'::sandbox_session_status)`
- `idx_sandbox_sessions_project` — `CREATE INDEX idx_sandbox_sessions_project ON public.sandbox_terminal_sessions USING btree (project_id)`
- `idx_sandbox_sessions_started` — `CREATE INDEX idx_sandbox_sessions_started ON public.sandbox_terminal_sessions USING btree (started_at DESC)`
- `sandbox_terminal_sessions_pkey` — `CREATE UNIQUE INDEX sandbox_terminal_sessions_pkey ON public.sandbox_terminal_sessions USING btree (id)`

---

## `schema_migrations`

| Column         | Type                     | Nullable | Default |
| -------------- | ------------------------ | -------- | ------- |
| `version`      | integer                  | ⛔       |         |
| `version`      | integer                  | ⛔       |         |
| `filename`     | character varying        | ⛔       |         |
| `filename`     | character varying        | ⛔       |         |
| `applied_at`   | timestamp with time zone | ✅       | `now()` |
| `applied_at`   | timestamp with time zone | ✅       | `now()` |
| `checksum`     | character varying        | ✅       |         |
| `checksum`     | character varying        | ✅       |         |
| `execution_ms` | integer                  | ✅       |         |
| `execution_ms` | integer                  | ✅       |         |
| `success`      | boolean                  | ✅       | `true`  |
| `success`      | boolean                  | ✅       | `true`  |

**Primary key:** `version, version`

**Indexes:**

- `schema_migrations_pkey` — `CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (version)`
- `schema_migrations_pkey` — `CREATE UNIQUE INDEX schema_migrations_pkey ON arasul.schema_migrations USING btree (version)`

---

## `self_healing_events`

> Self-healing engine action log

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | bigint                   | ⛔       | `nextval('self_healing_events_id_seq':...` |
| `event_type`   | text                     | ⛔       |                                            |
| `severity`     | text                     | ⛔       |                                            |
| `description`  | text                     | ⛔       |                                            |
| `timestamp`    | timestamp with time zone | ⛔       | `now()`                                    |
| `action_taken` | text                     | ⛔       |                                            |
| `service_name` | text                     | ✅       |                                            |
| `success`      | boolean                  | ✅       | `true`                                     |
| `metadata`     | jsonb                    | ✅       |                                            |
| `created_at`   | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_self_healing_events_service` — `CREATE INDEX idx_self_healing_events_service ON public.self_healing_events USING btree (service_name)`
- `idx_self_healing_events_severity` — `CREATE INDEX idx_self_healing_events_severity ON public.self_healing_events USING btree (severity)`
- `idx_self_healing_events_timestamp` — `CREATE INDEX idx_self_healing_events_timestamp ON public.self_healing_events USING btree ("timestamp" DESC)`
- `self_healing_events_pkey` — `CREATE UNIQUE INDEX self_healing_events_pkey ON public.self_healing_events USING btree (id)`

---

## `service_failures`

| Column             | Type                     | Nullable | Default                                    |
| ------------------ | ------------------------ | -------- | ------------------------------------------ |
| `id`               | bigint                   | ⛔       | `nextval('service_failures_id_seq'::re...` |
| `service_name`     | text                     | ⛔       |                                            |
| `timestamp`        | timestamp with time zone | ⛔       | `now()`                                    |
| `failure_type`     | text                     | ⛔       |                                            |
| `health_status`    | text                     | ✅       |                                            |
| `recovery_action`  | text                     | ✅       |                                            |
| `recovery_success` | boolean                  | ✅       |                                            |
| `window_start`     | timestamp with time zone | ⛔       |                                            |
| `created_at`       | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_service_failures_service_name` — `CREATE INDEX idx_service_failures_service_name ON public.service_failures USING btree (service_name)`
- `idx_service_failures_timestamp` — `CREATE INDEX idx_service_failures_timestamp ON public.service_failures USING btree ("timestamp" DESC)`
- `idx_service_failures_window` — `CREATE INDEX idx_service_failures_window ON public.service_failures USING btree (window_start DESC)`
- `service_failures_pkey` — `CREATE UNIQUE INDEX service_failures_pkey ON public.service_failures USING btree (id)`

---

## `service_restarts`

> Service restart tracking

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('service_restarts_id_seq'::re...` |
| `timestamp`     | timestamp with time zone | ⛔       | `now()`                                    |
| `service_name`  | text                     | ⛔       |                                            |
| `reason`        | text                     | ⛔       |                                            |
| `initiated_by`  | text                     | ⛔       |                                            |
| `success`       | boolean                  | ⛔       |                                            |
| `restart_count` | integer                  | ✅       | `1`                                        |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_service_restarts_service` — `CREATE INDEX idx_service_restarts_service ON public.service_restarts USING btree (service_name)`
- `idx_service_restarts_timestamp` — `CREATE INDEX idx_service_restarts_timestamp ON public.service_restarts USING btree ("timestamp" DESC)`
- `service_restarts_pkey` — `CREATE UNIQUE INDEX service_restarts_pkey ON public.service_restarts USING btree (id)`

---

## `service_status_cache`

> Caches last known service status for change detection

| Column              | Type                     | Nullable | Default       |
| ------------------- | ------------------------ | -------- | ------------- |
| `service_name`      | character varying        | ⛔       |               |
| `container_name`    | character varying        | ✅       |               |
| `status`            | character varying        | ⛔       |               |
| `health`            | character varying        | ✅       |               |
| `last_status`       | character varying        | ✅       |               |
| `last_health`       | character varying        | ✅       |               |
| `status_changed_at` | timestamp with time zone | ✅       | `now()`       |
| `last_checked_at`   | timestamp with time zone | ✅       | `now()`       |
| `metadata`          | jsonb                    | ✅       | `'{}'::jsonb` |

**Primary key:** `service_name`

**Indexes:**

- `idx_service_status_cache_changed` — `CREATE INDEX idx_service_status_cache_changed ON public.service_status_cache USING btree (status_changed_at DESC)`
- `service_status_cache_pkey` — `CREATE UNIQUE INDEX service_status_cache_pkey ON public.service_status_cache USING btree (service_name)`

---

## `skill_run_steps`

> Einzelne Schritte eines Skill-Laufs (Plan 011, Schritt 9): je Werkzeug-/Subagent-/Modell-Schritt eine Zeile, angehängt statt ein wachsendes JSONB neu zu schreiben.

| Column        | Type                     | Nullable | Default                                    |
| ------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`          | bigint                   | ⛔       | `nextval('skill_run_steps_id_seq'::reg...` |
| `run_id`      | bigint                   | ⛔       |                                            |
| `position`    | integer                  | ⛔       |                                            |
| `kind`        | USER-DEFINED             | ⛔       |                                            |
| `name`        | character varying        | ⛔       | `''::character varying`                    |
| `input`       | jsonb                    | ⛔       | `'{}'::jsonb`                              |
| `output`      | text                     | ✅       |                                            |
| `raw_output`  | text                     | ✅       |                                            |
| `status`      | USER-DEFINED             | ⛔       | `'laeuft'::skill_run_status`               |
| `created_at`  | timestamp with time zone | ⛔       | `now()`                                    |
| `finished_at` | timestamp with time zone | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `run_id` → `skill_runs.id`

**Indexes:**

- `idx_skill_run_steps_run_id` — `CREATE INDEX idx_skill_run_steps_run_id ON arasul.skill_run_steps USING btree (run_id)`
- `skill_run_steps_pkey` — `CREATE UNIQUE INDEX skill_run_steps_pkey ON arasul.skill_run_steps USING btree (id)`
- `skill_run_steps_run_pos_uniq` — `CREATE UNIQUE INDEX skill_run_steps_run_pos_uniq ON arasul.skill_run_steps USING btree (run_id, "position")`

---

## `skill_runs`

> Skill-Läufe (Plan 011, Schritt 9): ein Lauf je Aufruf von /name. Überlebt das Schließen des Tabs, damit die Live-Übertragung wiederverbinden kann.

| Column            | Type                     | Nullable | Default                                  |
| ----------------- | ------------------------ | -------- | ---------------------------------------- |
| `id`              | bigint                   | ⛔       | `nextval('skill_runs_id_seq'::regclass)` |
| `user_id`         | bigint                   | ⛔       |                                          |
| `skill_name`      | character varying        | ⛔       |                                          |
| `conversation_id` | bigint                   | ✅       |                                          |
| `arguments`       | jsonb                    | ⛔       | `'{}'::jsonb`                            |
| `status`          | USER-DEFINED             | ⛔       | `'laeuft'::skill_run_status`             |
| `result`          | text                     | ✅       |                                          |
| `error`           | text                     | ✅       |                                          |
| `steps_used`      | integer                  | ⛔       | `0`                                      |
| `changes`         | jsonb                    | ✅       |                                          |
| `created_at`      | timestamp with time zone | ⛔       | `now()`                                  |
| `finished_at`     | timestamp with time zone | ✅       |                                          |

> `changes` (Plan 011, Schritt 16): Datei-Änderungen des Laufs — `[{pfad, art (neu\|geaendert\|geloescht), vorher, nachher, gekuerzt, hinweis}]`, aus dem Ordner-Abzug vor/nach dem Lauf; gedeckelt in Zahl und Vorschau-Länge. `NULL` = nicht ermittelt (Lauf ohne Schreib-Werkzeug).

**Primary key:** `id`

**Indexes:**

- `idx_skill_runs_conversation` — `CREATE INDEX idx_skill_runs_conversation ON arasul.skill_runs USING btree (conversation_id)`
- `idx_skill_runs_status` — `CREATE INDEX idx_skill_runs_status ON arasul.skill_runs USING btree (status) WHERE (status = 'laeuft'::skill_run_status)`
- `idx_skill_runs_user_id` — `CREATE INDEX idx_skill_runs_user_id ON arasul.skill_runs USING btree (user_id)`
- `skill_runs_pkey` — `CREATE UNIQUE INDEX skill_runs_pkey ON arasul.skill_runs USING btree (id)`

---

## `space_members`

> Phase 1.1: Per-Space-ACL. Owner ist immer implicit member with permission='owner'. Admins (admin_users.role = 'admin') haben Zugriff auf alle Spaces.

| Column       | Type                     | Nullable | Default                      |
| ------------ | ------------------------ | -------- | ---------------------------- |
| `space_id`   | uuid                     | ⛔       |                              |
| `user_id`    | integer                  | ⛔       |                              |
| `permission` | USER-DEFINED             | ⛔       | `'viewer'::space_permission` |
| `added_by`   | integer                  | ✅       |                              |
| `added_at`   | timestamp with time zone | ⛔       | `now()`                      |

**Primary key:** `space_id, user_id`

**Foreign Keys:**

- `space_id` → `knowledge_spaces.id`
- `user_id` → `admin_users.id`
- `added_by` → `admin_users.id`

**Indexes:**

- `idx_space_members_user` — `CREATE INDEX idx_space_members_user ON public.space_members USING btree (user_id)`
- `space_members_pkey` — `CREATE UNIQUE INDEX space_members_pkey ON public.space_members USING btree (space_id, user_id)`

---

## `system_boot_events`

> Records system boot events for uptime tracking

| Column                           | Type                     | Nullable | Default                                    |
| -------------------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                             | integer                  | ⛔       | `nextval('system_boot_events_id_seq'::...` |
| `boot_timestamp`                 | timestamp with time zone | ⛔       | `now()`                                    |
| `previous_shutdown_timestamp`    | timestamp with time zone | ✅       |                                            |
| `shutdown_reason`                | character varying        | ✅       |                                            |
| `uptime_before_shutdown_seconds` | integer                  | ✅       |                                            |
| `services_status_at_boot`        | jsonb                    | ✅       |                                            |
| `boot_duration_ms`               | integer                  | ✅       |                                            |
| `notification_sent`              | boolean                  | ✅       | `false`                                    |
| `created_at`                     | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_system_boot_events_timestamp` — `CREATE INDEX idx_system_boot_events_timestamp ON public.system_boot_events USING btree (boot_timestamp DESC)`
- `system_boot_events_pkey` — `CREATE UNIQUE INDEX system_boot_events_pkey ON public.system_boot_events USING btree (id)`

---

## `system_settings`

| Column                            | Type                     | Nullable | Default |
| --------------------------------- | ------------------------ | -------- | ------- |
| `id`                              | integer                  | ⛔       | `1`     |
| `setup_completed`                 | boolean                  | ⛔       | `false` |
| `setup_completed_at`              | timestamp with time zone | ✅       |         |
| `setup_completed_by`              | integer                  | ✅       |         |
| `company_name`                    | character varying        | ✅       |         |
| `hostname`                        | character varying        | ✅       |         |
| `selected_model`                  | character varying        | ✅       |         |
| `setup_step`                      | integer                  | ✅       | `0`     |
| `created_at`                      | timestamp with time zone | ⛔       | `now()` |
| `updated_at`                      | timestamp with time zone | ⛔       | `now()` |
| `ai_profile_yaml`                 | text                     | ✅       |         |
| `ai_profile_updated_at`           | timestamp with time zone | ✅       |         |
| `telegram_enabled`                | boolean                  | ⛔       | `false` |
| `telegram_disclaimer_accepted`    | boolean                  | ⛔       | `false` |
| `telegram_disclaimer_accepted_at` | timestamp with time zone | ✅       |         |
| `telegram_disclaimer_accepted_by` | integer                  | ✅       |         |
| `ai_transparency_enabled`         | boolean                  | ⛔       | `true`  |
| `ai_transparency_disabled_at`     | timestamp with time zone | ✅       |         |
| `ai_transparency_disabled_by`     | integer                  | ✅       |         |
| `rag_top_k`                       | integer                  | ✅       | `10`    |
| `rag_final_k`                     | integer                  | ✅       | `4`     |
| `rag_score_threshold`             | double precision         | ✅       | `0.30`  |
| `rag_relevance_threshold`         | double precision         | ✅       | `0.55`  |
| `rag_rerank_enabled`              | boolean                  | ✅       | `true`  |
| `rag_timeout_rerank_ms`           | integer                  | ✅       | `8000`  |
| `llm_num_ctx_default`             | integer                  | ✅       |         |
| `llm_keep_alive_seconds`          | integer                  | ✅       | `3600`  |
| `llm_num_predict_default`         | integer                  | ✅       | `2048`  |
| `rag_temperature`                 | double precision         | ✅       | `0.2`   |
| `rag_num_predict`                 | integer                  | ✅       | `2048`  |
| `rag_mmr_lambda`                  | double precision         | ✅       | `0.7`   |
| `rag_dedup_max_per_doc`           | integer                  | ✅       | `3`     |
| `rag_hybrid_search`               | boolean                  | ✅       | `true`  |
| `rag_space_routing_threshold`     | double precision         | ✅       | `0.4`   |
| `rag_space_routing_max_spaces`    | integer                  | ✅       | `3`     |
| `llm_base_system_prompt`          | text                     | ✅       |         |

**Primary key:** `id`

**Foreign Keys:**

- `telegram_disclaimer_accepted_by` → `admin_users.id`
- `setup_completed_by` → `admin_users.id`
- `ai_transparency_disabled_by` → `admin_users.id`

**Indexes:**

- `system_settings_pkey` — `CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (id)`

---

## `system_snapshots`

> Periodic system state snapshots

| Column         | Type                     | Nullable | Default                                    |
| -------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`           | bigint                   | ⛔       | `nextval('system_snapshots_id_seq'::re...` |
| `timestamp`    | timestamp with time zone | ⛔       | `now()`                                    |
| `status`       | text                     | ⛔       |                                            |
| `cpu`          | double precision         | ✅       |                                            |
| `ram`          | double precision         | ✅       |                                            |
| `gpu`          | double precision         | ✅       |                                            |
| `temperature`  | double precision         | ✅       |                                            |
| `disk_percent` | double precision         | ✅       |                                            |
| `services`     | jsonb                    | ✅       |                                            |
| `created_at`   | timestamp with time zone | ✅       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_system_snapshots_status` — `CREATE INDEX idx_system_snapshots_status ON public.system_snapshots USING btree (status)`
- `idx_system_snapshots_timestamp` — `CREATE INDEX idx_system_snapshots_timestamp ON public.system_snapshots USING btree ("timestamp" DESC)`
- `system_snapshots_pkey` — `CREATE UNIQUE INDEX system_snapshots_pkey ON public.system_snapshots USING btree (id)`

---

## `token_blacklist`

> Blacklisted JWT tokens (logged out)

| Column           | Type                     | Nullable | Default                                    |
| ---------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`             | bigint                   | ⛔       | `nextval('token_blacklist_id_seq'::reg...` |
| `token_jti`      | character varying        | ⛔       |                                            |
| `user_id`        | bigint                   | ✅       |                                            |
| `blacklisted_at` | timestamp with time zone | ✅       | `now()`                                    |
| `expires_at`     | timestamp with time zone | ⛔       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `idx_token_blacklist_expires` — `CREATE INDEX idx_token_blacklist_expires ON public.token_blacklist USING btree (expires_at)`
- `idx_token_blacklist_jti` — `CREATE INDEX idx_token_blacklist_jti ON public.token_blacklist USING btree (token_jti)`
- `idx_token_blacklist_user_id` — `CREATE INDEX idx_token_blacklist_user_id ON public.token_blacklist USING btree (user_id)`
- `token_blacklist_pkey` — `CREATE UNIQUE INDEX token_blacklist_pkey ON public.token_blacklist USING btree (id)`
- `token_blacklist_token_jti_key` — `CREATE UNIQUE INDEX token_blacklist_token_jti_key ON public.token_blacklist USING btree (token_jti)`

---

## `update_backups`

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('update_backups_id_seq'::regc...` |
| `backup_path`        | character varying        | ⛔       |                                            |
| `update_event_id`    | integer                  | ✅       |                                            |
| `created_at`         | timestamp with time zone | ✅       | `now()`                                    |
| `backup_size_mb`     | integer                  | ✅       |                                            |
| `components`         | jsonb                    | ✅       |                                            |
| `restoration_tested` | boolean                  | ✅       | `false`                                    |
| `notes`              | text                     | ✅       |                                            |

**Primary key:** `id`

**Foreign Keys:**

- `update_event_id` → `update_events.id`

**Indexes:**

- `idx_update_backups_event` — `CREATE INDEX idx_update_backups_event ON public.update_backups USING btree (update_event_id)`
- `update_backups_pkey` — `CREATE UNIQUE INDEX update_backups_pkey ON public.update_backups USING btree (id)`

---

## `update_events`

| Column               | Type                     | Nullable | Default                                    |
| -------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                 | integer                  | ⛔       | `nextval('update_events_id_seq'::regcl...` |
| `version_from`       | character varying        | ⛔       |                                            |
| `version_to`         | character varying        | ⛔       |                                            |
| `status`             | character varying        | ⛔       |                                            |
| `source`             | character varying        | ⛔       |                                            |
| `components_updated` | jsonb                    | ✅       |                                            |
| `error_message`      | text                     | ✅       |                                            |
| `started_at`         | timestamp with time zone | ✅       | `now()`                                    |
| `completed_at`       | timestamp with time zone | ✅       |                                            |
| `duration_seconds`   | integer                  | ✅       |                                            |
| `requires_reboot`    | boolean                  | ✅       | `false`                                    |
| `reboot_completed`   | boolean                  | ✅       | `false`                                    |
| `initiated_by`       | character varying        | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_update_events_status` — `CREATE INDEX idx_update_events_status ON public.update_events USING btree (status)`
- `idx_update_events_timestamp` — `CREATE INDEX idx_update_events_timestamp ON public.update_events USING btree (started_at DESC)`
- `update_events_pkey` — `CREATE UNIQUE INDEX update_events_pkey ON public.update_events USING btree (id)`

---

## `update_files`

| Column                  | Type                     | Nullable | Default                                    |
| ----------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                    | integer                  | ⛔       | `nextval('update_files_id_seq'::regclass)` |
| `filename`              | character varying        | ⛔       |                                            |
| `file_path`             | character varying        | ⛔       |                                            |
| `checksum_sha256`       | character varying        | ⛔       |                                            |
| `file_size_bytes`       | bigint                   | ⛔       |                                            |
| `source`                | character varying        | ⛔       |                                            |
| `uploaded_at`           | timestamp with time zone | ✅       | `now()`                                    |
| `signature_verified`    | boolean                  | ✅       | `false`                                    |
| `signature_verified_at` | timestamp with time zone | ✅       |                                            |
| `manifest`              | jsonb                    | ✅       |                                            |
| `validation_status`     | character varying        | ✅       |                                            |
| `validation_error`      | text                     | ✅       |                                            |
| `applied`               | boolean                  | ✅       | `false`                                    |
| `applied_at`            | timestamp with time zone | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_update_files_applied` — `CREATE INDEX idx_update_files_applied ON public.update_files USING btree (applied, uploaded_at DESC)`
- `idx_update_files_checksum` — `CREATE INDEX idx_update_files_checksum ON public.update_files USING btree (checksum_sha256)`
- `update_files_checksum_sha256_key` — `CREATE UNIQUE INDEX update_files_checksum_sha256_key ON public.update_files USING btree (checksum_sha256)`
- `update_files_pkey` — `CREATE UNIQUE INDEX update_files_pkey ON public.update_files USING btree (id)`

---

## `update_rollbacks`

| Column                     | Type                     | Nullable | Default                                    |
| -------------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                       | integer                  | ⛔       | `nextval('update_rollbacks_id_seq'::re...` |
| `original_update_event_id` | integer                  | ✅       |                                            |
| `backup_id`                | integer                  | ✅       |                                            |
| `rollback_reason`          | text                     | ⛔       |                                            |
| `initiated_by`             | character varying        | ✅       |                                            |
| `started_at`               | timestamp with time zone | ✅       | `now()`                                    |
| `completed_at`             | timestamp with time zone | ✅       |                                            |
| `success`                  | boolean                  | ✅       |                                            |
| `error_message`            | text                     | ✅       |                                            |
| `services_restored`        | ARRAY                    | ✅       |                                            |
| `database_restored`        | boolean                  | ✅       | `false`                                    |
| `config_restored`          | boolean                  | ✅       | `false`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `original_update_event_id` → `update_events.id`
- `backup_id` → `update_backups.id`

**Indexes:**

- `update_rollbacks_pkey` — `CREATE UNIQUE INDEX update_rollbacks_pkey ON public.update_rollbacks USING btree (id)`

---

## `update_state_snapshots`

| Column            | Type                     | Nullable | Default                                    |
| ----------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`              | integer                  | ⛔       | `nextval('update_state_snapshots_id_se...` |
| `update_event_id` | integer                  | ✅       |                                            |
| `current_step`    | character varying        | ⛔       |                                            |
| `step_data`       | jsonb                    | ✅       |                                            |
| `created_at`      | timestamp with time zone | ✅       | `now()`                                    |
| `completed`       | boolean                  | ✅       | `false`                                    |

**Primary key:** `id`

**Foreign Keys:**

- `update_event_id` → `update_events.id`

**Indexes:**

- `update_state_snapshots_pkey` — `CREATE UNIQUE INDEX update_state_snapshots_pkey ON public.update_state_snapshots USING btree (id)`

---

## `user_external_credentials`

> Pro Nutzer verschlüsselt gespeicherte Credentials externer CLIs (Plan 008 Schritt 14). v1: provider=claude — die Claude-Code-Login-Dateien, damit ein Login einen Container-Rebuild überlebt.

| Column                  | Type                     | Nullable | Default                                    |
| ----------------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`                    | bigint                   | ⛔       | `nextval('user_external_credentials_id...` |
| `user_id`               | integer                  | ⛔       |                                            |
| `provider`              | character varying        | ⛔       |                                            |
| `encrypted_credentials` | bytea                    | ⛔       |                                            |
| `created_at`            | timestamp with time zone | ⛔       | `now()`                                    |
| `updated_at`            | timestamp with time zone | ⛔       | `now()`                                    |

**Primary key:** `id`

**Indexes:**

- `idx_user_external_credentials_user_id` — `CREATE INDEX idx_user_external_credentials_user_id ON arasul.user_external_credentials USING btree (user_id)`
- `user_external_credentials_pkey` — `CREATE UNIQUE INDEX user_external_credentials_pkey ON arasul.user_external_credentials USING btree (id)`
- `user_external_credentials_user_provider_uniq` — `CREATE UNIQUE INDEX user_external_credentials_user_provider_uniq ON arasul.user_external_credentials USING btree (user_id, provider)`

---

## `workflow_activity`

> n8n workflow execution history

| Column          | Type                     | Nullable | Default                                    |
| --------------- | ------------------------ | -------- | ------------------------------------------ |
| `id`            | bigint                   | ⛔       | `nextval('workflow_activity_id_seq'::r...` |
| `workflow_name` | text                     | ⛔       |                                            |
| `status`        | text                     | ⛔       |                                            |
| `timestamp`     | timestamp with time zone | ⛔       | `now()`                                    |
| `duration_ms`   | integer                  | ✅       |                                            |
| `error`         | text                     | ✅       |                                            |
| `created_at`    | timestamp with time zone | ✅       | `now()`                                    |
| `execution_id`  | text                     | ✅       |                                            |

**Primary key:** `id`

**Indexes:**

- `idx_workflow_activity_execution_id` — `CREATE INDEX idx_workflow_activity_execution_id ON public.workflow_activity USING btree (execution_id) WHERE (execution_id IS NOT NULL)`
- `idx_workflow_activity_status` — `CREATE INDEX idx_workflow_activity_status ON public.workflow_activity USING btree (status)`
- `idx_workflow_activity_timestamp` — `CREATE INDEX idx_workflow_activity_timestamp ON public.workflow_activity USING btree ("timestamp" DESC)`
- `idx_workflow_activity_workflow_name` — `CREATE INDEX idx_workflow_activity_workflow_name ON public.workflow_activity USING btree (workflow_name)`
- `workflow_activity_pkey` — `CREATE UNIQUE INDEX workflow_activity_pkey ON public.workflow_activity USING btree (id)`

---
