# Arasul Platform — Database Schema

> **Auto-generated**. Do not edit by hand.
> Run `scripts/docs/generate-db-schema.sh` to regenerate. Last sync: `2026-07-21T21:58:37Z`.
> Von Hand nachgezogen am 26.08.2026 (Migration 163, Phase B4): 30 Tabellen, drei Spalten,
> zwei Sichten, 23 Funktionen und sechs Aufzaehlungstypen der gestrichenen Bereiche sind
> entfallen; Foreign-Key- und Index-Zaehler unten sind seitdem nur noch ungefaehr.
> Am 27.08.2026 von Hand ergaenzt (Migration 168, Phase C2): `app_members`.
> Am 27.08.2026 von Hand ergaenzt (Migration 171, Phase C4): `api_keys.app_id`,
> `api_keys.stand` und die Breite von `api_keys.key_prefix`.
> Am 27.08.2026 von Hand ergaenzt (Migration 172, Phase C5): `app_staende.vorige_version`.

## Übersicht

- Tabellen: **57**
- Spalten gesamt: **817**
- Foreign Keys: **52**
- Indexes: **311**

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

> Benutzer des Geräts: Administratoren und Mitarbeiter (seit Migration 167).
> `role` ist `admin` oder `mitarbeiter` (`CHECK admin_users_role_check`, 167);
> der Wert steuert `requireRole` im Backend.

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

> API keys for external app access (automations, integrations)

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
| `app_id`                | text                     | ✅       |                                            |
| `stand`                 | text                     | ✅       |                                            |

`app_id` und `stand` (Migration 171, Phase C4) binden einen Schlüssel an eine
App: `NULL` heißt „gehört einem Menschen", gesetzt heißt „steht in der Umgebung
des Containers `arasul-app-<app_id>-<stand>`". Beide sind zusammen gesetzt oder
zusammen leer. Je App und Stand gibt es höchstens einen; beim Einspielen wird
er neu gewürfelt und der alte zurückgezogen.

`key_prefix` ist seit 171 `varchar(16)`. Bis dahin stand dort `varchar(8)`,
während der Code zwölf Zeichen schreibt — jedes Anlegen eines Schlüssels
scheiterte mit `value too long for type character varying(8)`.

**Primary key:** `id`

**Foreign Keys:**

- `created_by` → `admin_users.id`
- `app_id` → `apps.id` (ON DELETE CASCADE)

**Indexes:**

- `api_keys_pkey` — `CREATE UNIQUE INDEX api_keys_pkey ON public.api_keys USING btree (id)`
- `idx_api_keys_active` — `CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (is_active) WHERE (is_active = true)`
- `idx_api_keys_app_stand` — `CREATE UNIQUE INDEX idx_api_keys_app_stand ON public.api_keys USING btree (app_id, stand) WHERE (app_id IS NOT NULL)`
- `idx_api_keys_prefix` — `CREATE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix)`
- `idx_api_keys_requires_review` — `CREATE INDEX idx_api_keys_requires_review ON public.api_keys USING btree (requires_review) WHERE (requires_review = true)`

---

## `app_members`

> Freigaben: welcher Mitarbeiter sieht welche App. Ersetzt space_members (089, verworfen mit 163); seit 168

| Column            | Type                     | Nullable | Default  |
| ----------------- | ------------------------ | -------- | -------- |
| `app_id`          | text                     | ⛔       |          |
| `user_id`         | bigint                   | ⛔       |          |
| `stand`           | text                     | ⛔       | `'live'` |
| `freigegeben_von` | bigint                   | ✅       |          |
| `freigegeben_am`  | timestamp with time zone | ⛔       | `now()`  |

**Primary key:** `app_id, user_id`

**Foreign Keys:**

- `app_id` → `apps.id` (`ON DELETE CASCADE`) — seit 169
- `user_id` → `admin_users.id` (`ON DELETE CASCADE`)
- `freigegeben_von` → `admin_users.id` (`ON DELETE SET NULL`)

**Constraints:** `stand IN ('test', 'live')`

**Indexes:**

- `app_members_pkey` — `CREATE UNIQUE INDEX app_members_pkey ON public.app_members USING btree (app_id, user_id)`
- `idx_app_members_user` — `CREATE INDEX idx_app_members_user ON public.app_members USING btree (user_id)`

`app_id` war bis Phase C3 ein freier Text und zeigt seit Migration 169 als
Fremdschlüssel auf `apps.id`. Ein `permission`-Feld wie in `space_members` (089)
gibt es bewusst nicht — eine App ist freigegeben oder nicht, und wer innerhalb
der App was darf, entscheidet die App.

`stand` ist der Tester-Kreis aus C3: `live` sieht `/apps/<id>/`, `test` sieht
zusätzlich `/apps/<id>/test/`. Ein Tester ist kein anderer Nutzer, sondern ein
Nutzer mit einer Tür mehr; deshalb bleibt der Primärschlüssel ein Paar.

---

## `app_staende`

> Je App höchstens zwei Zeilen: der Teststand und der Livestand, jeder mit Version und Manifest. Seit 169

| Column            | Type                     | Nullable | Default |
| ----------------- | ------------------------ | -------- | ------- |
| `app_id`          | text                     | ⛔       |         |
| `stand`           | text                     | ⛔       |         |
| `version`         | text                     | ⛔       |         |
| `vorige_version`  | text                     | ✅       |         |
| `manifest`        | jsonb                    | ⛔       |         |
| `eingespielt_am`  | timestamp with time zone | ⛔       | `now()` |
| `eingespielt_von` | bigint                   | ✅       |         |

**Primary key:** `app_id, stand`

**Foreign Keys:**

- `app_id` → `apps.id` (`ON DELETE CASCADE`)
- `eingespielt_von` → `admin_users.id` (`ON DELETE SET NULL`)

**Constraints:** `stand IN ('test', 'live')`

`manifest` ist das ganze `app.json` dieser Version, so wie es eingespielt wurde:
der Ordner am Gerät kann gelöscht werden, die Antwort auf „womit lief das" nicht.
Ob ein Container LÄUFT, steht hier nicht — das weiß Docker, und es daneben in
einer Spalte zu führen hieße, zwei Wahrheiten zu pflegen.

`vorige_version` (Migration 172, Phase C5) ist die Version, die in diesem Stand
vor der jetzigen lief; `NULL`, wenn es keine gab. Darauf schaltet
`POST /api/v1/external/apps/:id/schalten` mit `{"ziel":"zurueck"}` zurück.
Geschrieben wird sie in `appStore.spieleEin` und nur bei einem echten Wechsel —
dieselbe Version noch einmal einzuspielen (was der Schalter nach `live` tut)
darf die Erinnerung nicht überschreiben. Eine Tabelle mit dem ganzen Verlauf
wäre eine zweite Antwort auf eine Frage, die niemand stellt: was am Gerät
liegt, sagen die Ordner, und wer wann geschaltet hat, steht in
`security_events`.

---

## `apps`

> Die Apps am Gerät. Was eine App IST, steht in ihrem Manifest app.json; was von ihr läuft, in app_staende. Ersetzt app_installations (013); seit 169

| Column         | Type                     | Nullable | Default |
| -------------- | ------------------------ | -------- | ------- |
| `id`           | text                     | ⛔       |         |
| `name`         | text                     | ⛔       |         |
| `beschreibung` | text                     | ✅       |         |
| `angelegt_am`  | timestamp with time zone | ⛔       | `now()` |
| `geaendert_am` | timestamp with time zone | ⛔       | `now()` |

**Primary key:** `id`

Die Kennung kommt aus dem Manifest und ist zugleich Pfad (`/apps/<id>/`),
Containername (`arasul-app-<id>-live`) und Traefik-Router. Eine zweite,
künstliche Nummer daneben wäre ein zweiter Name für dieselbe Sache. Die Form
prüft das Backend (`schemas/apps.js`), nicht die Datenbank: eine CHECK-Regel mit
einem regulären Ausdruck wäre ein zweiter Ort für dieselbe Regel.

Mit Migration 169 sind `app_installations`, `app_configurations`,
`app_dependencies` und `app_events` aus 013 gefallen: sie beschrieben einen
Katalog, aus dem ein Administrator Container aussucht. Eine App kommt jetzt vom
Partner auf das Gerät.

Angelegt hat beide Tabellen am Gerät allerdings Migration **170**. 169 brach
ab, bevor sie dazu kam: sie ließ die Typen `app_status` und `app_type` fallen,
ohne die Funktion `check_app_dependencies()` aus 014 auf ihre Löschliste zu
nehmen, deren Rückgabetyp `app_status` nennt. 170 holt beides nach und ist
gegen beide Ausgangslagen idempotent.

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
| `user_id`             | bigint                   | ✅       |                                |
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
| `abbruch_grund`       | character varying        | ✅       |                                |
| `abbruch_kennung`     | character varying        | ✅       |                                |
| `abbruch_detail`      | text                     | ✅       |                                |
| `abbruch_am`          | timestamp with time zone | ✅       |                                |

Die vier `abbruch_*`-Spalten kommen aus Migration 154 (Plan 023 E1) und sind
ausdrücklich etwas anderes als `error_message`. `abbruch_grund` ist eine stabile
Kennung aus `services/llm/abbruchGrund.js` (`nutzer`, `stream_still`,
`strom_zeitlimit`, `zuhoerer_verworfen`, `neustart`, ...), nach der sich zählen
lässt; `error_message` ist freier Text, nach dem sich nicht zählen lässt.
`abbruch_kennung` hat die Form `ABB-<6 Zeichen der Job-Id>-<Grund>` und steht
zugleich im Chat und im Protokoll, damit der Weg von der Meldung auf dem
Bildschirm zur Zeile im Protokoll eine einzige Suche ist. Auswertung:
`scripts/util/abbrueche.sh`.

**Primary key:** `id`

Seit Migration 165 (Phase B6, 26.08.2026) ist ein Auftrag zustandslos: `user_id`
(Ersteller des API-Schlüssels, `ON DELETE SET NULL`) ersetzt `conversation_id`
und `message_id`; die Antwort steht in `content`/`thinking` am Auftrag selbst
und wird nirgendwohin umkopiert. `sources` und `matched_spaces` sind seit dem
Ausbau des RAG (162, 163) immer NULL.

**Foreign Keys:**

- `user_id` → `admin_users.id`

**Indexes:**

- `idx_llm_jobs_completed_at` — `CREATE INDEX idx_llm_jobs_completed_at ON public.llm_jobs USING btree (completed_at) WHERE ((status)::text = ANY ((ARRAY['completed'::character varying, 'error'::character varying, 'cancelled'::character varying])::text[]))`
- `idx_llm_jobs_created` — `CREATE INDEX idx_llm_jobs_created ON public.llm_jobs USING btree (created_at DESC)`
- `idx_llm_jobs_fairness_check` — `CREATE INDEX idx_llm_jobs_fairness_check ON public.llm_jobs USING btree (queued_at) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_model_pending` — `CREATE INDEX idx_llm_jobs_model_pending ON public.llm_jobs USING btree (requested_model, priority DESC, queued_at) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_queue` — `CREATE INDEX idx_llm_jobs_queue ON public.llm_jobs USING btree (queue_position) WHERE ((status)::text = 'pending'::text)`
- `idx_llm_jobs_queue_position` — `CREATE INDEX idx_llm_jobs_queue_position ON public.llm_jobs USING btree (queue_position) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying])::text[]))`
- `idx_llm_jobs_status` — `CREATE INDEX idx_llm_jobs_status ON public.llm_jobs USING btree (status) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'streaming'::character varying])::text[]))`
- `idx_llm_jobs_status_created` — `CREATE INDEX idx_llm_jobs_status_created ON public.llm_jobs USING btree (status, created_at DESC)`
- `idx_llm_jobs_user` — `CREATE INDEX idx_llm_jobs_user ON public.llm_jobs USING btree (user_id)`
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
| `task`                  | character varying        | ✅       |                                 |
| `is_task_default`       | boolean                  | ✅       | `false`                         |
| `parameter_label`       | character varying        | ✅       |                                 |
| `quantization`          | character varying        | ✅       |                                 |
| `license`               | character varying        | ✅       |                                 |
| `profile_read_at`       | timestamp with time zone | ✅       |                                 |

`task` und `is_task_default` stammen aus Migration 151 (Plan 023 D5). `task`
sagt, wofür ein Modell vorgesehen ist (`text`, `coding`, `vision`, `ocr`,
`embedding`), anders als `model_type`, der sagt, was es kann. Der eindeutige
Teil-Index `idx_llm_catalog_task_default` erzwingt **höchstens einen Standard je
Aufgabe**; die Vorgängerspalte `is_platform_default` stand bei drei Modellen auf
`true` und hatte keinen einzigen Leser, sie ist in derselben Migration entfallen.

Die vier davor stammen aus Migration 148 (Plan 023 D2) und werden nicht
gepflegt, sondern beim Modell-Abgleich aus Ollamas `/api/show` gelesen.
`profile_read_at` unterscheidet „noch nie gelesen" von „gelesen, das Modell
trägt die Angabe nicht".

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

## `flow_run_steps`

> Einzelne Schritte eines Skill-Laufs (Plan 011, Schritt 9): je Werkzeug-/Subagent-/Modell-Schritt eine Zeile, angehängt statt ein wachsendes JSONB neu zu schreiben. Seit Migration 124 ein echter Baum: die inneren Werkzeug-Aufrufe eines Subagenten hängen als Kind-Schritte an dessen Schritt (`parent_step_id`); `modell` hält das Modell eines Subagent-/Modell-Schritts fest.

| Column           | Type                     | Nullable | Default                                   |
| ---------------- | ------------------------ | -------- | ----------------------------------------- |
| `id`             | bigint                   | ⛔       | `nextval('flow_run_steps_id_seq'::reg...` |
| `run_id`         | bigint                   | ⛔       |                                           |
| `position`       | integer                  | ⛔       |                                           |
| `kind`           | USER-DEFINED             | ⛔       |                                           |
| `name`           | character varying        | ⛔       | `''::character varying`                   |
| `input`          | jsonb                    | ⛔       | `'{}'::jsonb`                             |
| `output`         | text                     | ✅       |                                           |
| `raw_output`     | text                     | ✅       |                                           |
| `status`         | USER-DEFINED             | ⛔       | `'laeuft'::flow_run_status`               |
| `created_at`     | timestamp with time zone | ⛔       | `now()`                                   |
| `finished_at`    | timestamp with time zone | ✅       |                                           |
| `parent_step_id` | bigint                   | ✅       |                                           |
| `modell`         | character varying        | ✅       |                                           |

**Primary key:** `id`

**Foreign Keys:**

- `run_id` → `flow_runs.id`
- `parent_step_id` → `flow_run_steps.id` (ON DELETE CASCADE — Kind-Schritte eines Subagenten, Agenten-Baum)

**Indexes:**

- `idx_flow_run_steps_run_id` — `CREATE INDEX idx_flow_run_steps_run_id ON arasul.flow_run_steps USING btree (run_id)`
- `idx_flow_run_steps_parent` — `CREATE INDEX idx_flow_run_steps_parent ON arasul.flow_run_steps USING btree (parent_step_id)`
- `flow_run_steps_pkey` — `CREATE UNIQUE INDEX flow_run_steps_pkey ON arasul.flow_run_steps USING btree (id)`
- `flow_run_steps_run_pos_uniq` — `CREATE UNIQUE INDEX flow_run_steps_run_pos_uniq ON arasul.flow_run_steps USING btree (run_id, "position")`

---

## `flow_runs`

> Skill-Läufe (Plan 011, Schritt 9): ein Lauf je Aufruf von /name. Überlebt das Schließen des Tabs, damit die Live-Übertragung wiederverbinden kann.

| Column        | Type                     | Nullable | Default                                 |
| ------------- | ------------------------ | -------- | --------------------------------------- |
| `id`          | bigint                   | ⛔       | `nextval('flow_runs_id_seq'::regclass)` |
| `user_id`     | bigint                   | ⛔       |                                         |
| `flow_name`   | character varying        | ⛔       |                                         |
| `arguments`   | jsonb                    | ⛔       | `'{}'::jsonb`                           |
| `status`      | USER-DEFINED             | ⛔       | `'laeuft'::flow_run_status`             |
| `result`      | text                     | ✅       |                                         |
| `error`       | text                     | ✅       |                                         |
| `steps_used`  | integer                  | ⛔       | `0`                                     |
| `changes`     | jsonb                    | ✅       |                                         |
| `annahmen`    | jsonb                    | ✅       |                                         |
| `created_at`  | timestamp with time zone | ⛔       | `now()`                                 |
| `finished_at` | timestamp with time zone | ✅       |                                         |

> `annahmen` (Migration 131, Plan 014 Phase 2): Annahmen-Protokoll des
> Prüfschritts — JSON-Array von Klartext-Sätzen (Annahmen der Prüfrunde +
> verbliebene `[offene Stellen]` im Dokument). `NULL` = kein Prüfschritt
> gelaufen (Flow ohne Dokument-Ausgabe oder Lauf vor Phase 2).

> `changes` (Plan 011, Schritt 16): Datei-Änderungen des Laufs — `[{pfad, art (neu\|geaendert\|geloescht), vorher, nachher, gekuerzt, hinweis}]`, aus dem Ordner-Abzug vor/nach dem Lauf; gedeckelt in Zahl und Vorschau-Länge. `NULL` = nicht ermittelt (Lauf ohne Schreib-Werkzeug).

**Primary key:** `id`

**Indexes:**

- `idx_flow_runs_status` — `CREATE INDEX idx_flow_runs_status ON arasul.flow_runs USING btree (status) WHERE (status = 'laeuft'::flow_run_status)`
- `idx_flow_runs_user_id` — `CREATE INDEX idx_flow_runs_user_id ON arasul.flow_runs USING btree (user_id)`
- `flow_runs_pkey` — `CREATE UNIQUE INDEX flow_runs_pkey ON arasul.flow_runs USING btree (id)`

---

## `schema_migrations`

> Das Migrationsbuch. Es steht **entweder** in `public` **oder** in `arasul`,
> nie an beiden Orten gleichzeitig maßgeblich. Der Ort wird beim Start einmal
> ermittelt (`migrationRunner.js`, `ermittleBuchOrt`) und danach überall
> ausgeschrieben: gibt es `arasul.schema_migrations`, bleibt es dort, sonst
> `public`.
>
> Warum das nötig ist: bis zum 19.08.2026 stand im Code der unqualifizierte
> Name. Der löst gegen `search_path` auf, und der ist `"$user", public`. Der
> Datenbanknutzer heißt `arasul`, und seit Migration 090 gibt es auch ein
> Schema `arasul`. Damit hing der Ablageort davon ab, ob dieses Schema im
> Moment des `CREATE` schon existierte. Auf dem Gerät stehen deshalb beide:
> `arasul.schema_migrations` mit 145 Zeilen (maßgeblich) und
> `public.schema_migrations` mit 93 aus der Zeit davor. Auf einem frischen Gerät
> legte der zweite Start das Buch neu an und markierte blind alle Migrationen
> als erledigt.
>
> Dass auf dem Gerät zwei Kopien stehen, ist kein Versehen, sondern der Preis
> dafür, nichts umzuziehen: ein Umzug würde dort die Migrationen 94 bis 146
> erneut anwerfen. Das ist ein eigener, vorbereiteter Schritt (Plan 023 K) und
> nichts, was nebenbei passiert.

## `arasul.geraet`

> Eine Zeile, `id = 1`. Merker über einen Werksreset hinweg (Migration 146).
> Der Werksreset setzt `werksreset_am`, die Ersteinrichtung löscht es wieder.
> Solange es gesetzt ist, legt `bootstrap.js` **keinen** Administrator aus
> `ADMIN_PASSWORD` an. Ohne diesen Merker legte der nächste Start nach einem
> Werksreset den alten Zugang wieder an: das Entwerten in der `.env` allein
> reicht nicht, dasselbe Passwort kommt zusätzlich als Docker-Secret herein
> (`ADMIN_PASSWORD_FILE`, `/run/secrets/admin_password`, read-only im Container).
>
> Steht in der Klassifikation des Werksresets unter `BLEIBT`.

| Column             | Type                     | Nullable | Default               |
| ------------------ | ------------------------ | -------- | --------------------- |
| `id`               | integer                  | ⛔       | `1`, `CHECK (id = 1)` |
| `werksreset_am`    | timestamp with time zone | ✅       |                       |
| `werksreset_stufe` | text                     | ✅       |                       |

## `avatar_*` — ENTFERNT (Migration 145, 2026-08-19)

> Sechs Tabellen im Schema `arasul` (`avatar_best_slot`, `avatar_render_queue`,
> `avatar_script_history`, `avatar_topic_weight`, `avatar_video_performance`,
> `avatar_weekly_report`) stammten aus dem Projekt livia und waren nie Teil von
> Arasul. Keine Migration hat sie angelegt, kein Code hat sie gelesen. Migration
> 145 entfernt sie, weil der Werksreset (Plan 023 B5) jede Tabelle der Datenbank
> einordnen können muss und sonst den Dienst verweigert.

## `flow_schedules` — ENTFERNT (Migration 123, 2026-07-28)

> Die Flow-Zeitpläne/Cron-Auslöser wurden ersatzlos entfernt (Migration 123
> droppt die Tabelle). Flows starten jetzt per Slash-Befehl im Chat oder extern
> per `POST /api/v1/external/flows/:name/run`. Die folgende Struktur ist nur noch
> historisch (Stand vor 2026-07-28).

| Column         | Type                     | Nullable | Default                                      |
| -------------- | ------------------------ | -------- | -------------------------------------------- |
| `id`           | bigint                   | ⛔       | `nextval('flow_schedules_id_seq'::regclass)` |
| `user_id`      | bigint                   | ⛔       |                                              |
| `flow_name`    | character varying        | ⛔       |                                              |
| `trigger_type` | character varying        | ⛔       | `CHECK IN ('zeitplan', 'ereignis')`          |
| `cron`         | character varying        | ✅       | (nur bei `trigger_type = 'zeitplan'`)        |
| `event_name`   | character varying        | ✅       | (nur bei `trigger_type = 'ereignis'`)        |
| `args`         | jsonb                    | ⛔       | `'{}'::jsonb`                                |
| `enabled`      | boolean                  | ⛔       | `true`                                       |
| `next_run_at`  | timestamp with time zone | ✅       | (berechnet aus dem Cron)                     |
| `last_run_at`  | timestamp with time zone | ✅       |                                              |
| `last_run_id`  | bigint                   | ✅       | → `flow_runs.id` ON DELETE SET NULL          |
| `last_error`   | text                     | ✅       |                                              |
| `created_at`   | timestamp with time zone | ⛔       | `now()`                                      |
| `updated_at`   | timestamp with time zone | ⛔       | `now()`                                      |

> `CHECK (flow_schedules_trigger_shape)`: genau eines von `cron`/`event_name` ist passend zum `trigger_type` gesetzt — ein Zeitplan ohne Cron oder ein Ereignis ohne Namen wäre ein toter Auslöser.

**Primary key:** `id`

**Indexes:**

- `idx_flow_schedules_faellig` — `CREATE INDEX idx_flow_schedules_faellig ON arasul.flow_schedules USING btree (next_run_at) WHERE (enabled AND trigger_type = 'zeitplan')`
- `idx_flow_schedules_ereignis` — `CREATE INDEX idx_flow_schedules_ereignis ON arasul.flow_schedules USING btree (event_name) WHERE (enabled AND trigger_type = 'ereignis')`
- `idx_flow_schedules_user` — `CREATE INDEX idx_flow_schedules_user ON arasul.flow_schedules USING btree (user_id, id DESC)`

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
| `llm_num_ctx_default`             | integer                  | ✅       |         |
| `llm_keep_alive_seconds`          | integer                  | ✅       | `3600`  |
| `llm_num_predict_default`         | integer                  | ✅       | `2048`  |
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

## `externe_modell_anbieter`

> Plan 023 D9: je Anbieter ein verschlüsselter Cloud-Schlüssel. Geräteweit, nicht je Nutzer (Entscheidung E1: ein Zugang je Gerät). Modellnamen stehen NICHT hier, sie kommen zur Laufzeit vom Anbieter. Jede Anfrage an ein externes Modell steht in `api_audit_logs` mit `action_type = 'externes_modell'`.

| Column                        | Type                     | Nullable | Default |
| ----------------------------- | ------------------------ | -------- | ------- |
| `anbieter`                    | character varying(50)    | ⛔       |         |
| `verschluesselter_schluessel` | bytea                    | ⛔       |         |
| `schluessel_endet_auf`        | character varying(8)     | ⛔       |         |
| `aktiv`                       | boolean                  | ⛔       | `false` |
| `zuletzt_geprueft_am`         | timestamp with time zone | ✅       |         |
| `letzter_fehler`              | text                     | ✅       |         |
| `angelegt_am`                 | timestamp with time zone | ⛔       | `now()` |
| `geaendert_am`                | timestamp with time zone | ⛔       | `now()` |

**Primary key:** `anbieter`

**Trigger:** `trg_externe_modell_anbieter_geaendert` setzt `geaendert_am` bei jedem UPDATE.

Der Schlüssel liegt als AES-256-GCM-Blob (IV || AuthTag || Ciphertext), erzeugt
von `utils/tokenCrypto.js` mit einem Schlüssel aus `JWT_SECRET`. Eine geleakte
Zeile ohne `JWT_SECRET` ist wertlos. `schluessel_endet_auf` ist bewusst
Klartext, damit die Oberfläche zeigen kann, WELCHER Schlüssel hinterlegt ist,
ohne ihn zu entschlüsseln.

---
