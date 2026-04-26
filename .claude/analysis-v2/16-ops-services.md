# OPS/OBSERVABILITY Services — Dead Code, Duplication & Structural Issues

**Date:** 2026-04-22  
**Scope:** Self-healing agent, metrics-collector, backup-service, alerts, health checks, logging  
**Severity Sort:** CRITICAL → MAJOR → MINOR

---

## CRITICAL ISSUES

### OPS-C01: Incomplete Quarantine Notification Flow

**Impact:** Service flapping not reaching ops admin in all cases  
**Status:** PARTIAL FIX in Phase 5

- **Problem:** `_notify_quarantine()` in `category_handlers.py:43–76` queues notification event to `notification_events` table, but the backend's `eventListenerService` polls this table every 30s and routes to Telegram. Network hiccups or service crashes during that window = missed critical alert.
- **Code Path:** `/home/arasul/arasul/arasul-jet/services/self-healing-agent/category_handlers.py:56–73` → queues event → backend `/apps/dashboard-backend/src/services/core/eventListenerService.js` polls every 30s (async, no retry on failure).
- **Dead Code Risk:** Notification event is queued but has no guaranteed delivery ack; no dead-letter queue.
- **Action:** Add retry logic + dead-letter table for undelivered quarantine notifications; test end-to-end with network partition.
- **Effort:** 2 points

### OPS-C02: Alert Notification Channels Partially Dead

**Impact:** Some alert delivery paths present but never tested  
**Status:** Code exists, tests unknown

- **Alert Engine Routes (alertEngine.js:588–733):**
  - ✅ **WebSocket**: Direct in-memory broadcast, no persistence — loses on crash
  - ✅ **Webhook**: SSRF-protected, signed, but NO test coverage for actual delivery
  - ✅ **Telegram**: Via `telegramNotificationService.queueNotification()` — same async poly as quarantine
  - ❌ **Email/Slack/SMS**: ZERO code present. Database schema has `notified_via` column tracking ["websocket", "webhook", "telegram"] but not ["email", "slack"].

- **Dead Code Smoking Gun:** alertEngine.js:695–724 has full webhook logic, but no unit/integration tests verify webhook actually posts successfully. Example failure: webhook endpoint returns 500 (transient), no retry → alert marked "sent" but never reached ops.

- **Code Path:** `/home/arasul/arasul/arasul-jet/apps/dashboard-backend/src/services/alertEngine.js:639–690`

- **Action:**
  1. Add integration test: mock webhook server, verify POST happens + retry on 5xx
  2. Add `alert_history.webhook_last_error` column to surface failures in dashboard
  3. Kill any Email/Slack documentation (doesn't exist in code)
- **Effort:** 3 points (2 tests + 1 schema change)

### OPS-C03: Restore Drill Stub — Never Validated in CI

**Impact:** Backup restore unknown to work; DR capability unverified  
**Status:** Phase 5.2 added restore-drill.sh, but no CI integration

- **Problem:** `/home/arasul/arasul/arasul-jet/services/backup-service/restore-drill.sh` exists and is functional (lines 1–227), but:
  - No `.github/workflows/*.yml` job calls it
  - No Docker healthcheck/startup integration (would catch restore failures immediately)
  - `critical_tables` list is hardcoded; no validation that list matches actual schema

- **Dead Code Risk:** A restore fails in production (e.g., missing migration), discovered when RTO has already elapsed.

- **Action:**
  1. Add weekly CI job: call `restore-drill.sh` on mock database
  2. Make `critical_tables` dynamic: query `information_schema.tables` for tables marked with `metadata->'is_ops_critical'`
  3. Test with intentional backup corruption (remove a table) to ensure drill catches it

- **Effort:** 3 points

---

## MAJOR ISSUES

### OPS-M01: Duplicate Health Endpoints — Multiple Paths Same Thing

**Impact:** Confusion, maintenance burden, possible inconsistent behavior  
**Status:** Multiple endpoints, no deduplication plan

- **Health Check Endpoints Found:**
  - `GET /api/health` (line 186 in `index.js`) — main dashboard-backend health
  - `GET /api/database/health` (line 28 in `routes/system/database.js`) — database-specific
  - `GET /api/metrics/live` (line 22 in `routes/system/metrics.js`) — metrics endpoint
  - `/health` on individual services: embedding-service, metrics-collector, llm-service (via compose healthcheck + direct HTTP)
  - `GET /api/services` (implied, hits multiple endpoints)
  - Compose-level healthcheck: `postgres-db` uses `pg_isready`, others use shell scripts

- **Problem:** No clear contract. `/api/health` is a god endpoint that calls `/health` on all downstream services (embedding, metrics), but there's no timeout handling if one is slow. Example: embedding-service hangs, `/api/health` times out, dashboard shows "backend unhealthy" but embedding is fine.

- **Dead Code:** `health_check.py` in `/home/arasul/arasul/arasul-jet/libs/shared-python/` exists but unknown if actively used by all Python services.

- **Code Paths:**
  - `/home/arasul/arasul/arasul-jet/apps/dashboard-backend/src/index.js:186–250`
  - `/home/arasul/arasul/arasul-jet/apps/dashboard-backend/src/routes/system/database.js:26–50`
  - `/home/arasul/arasul/arasul-jet/apps/dashboard-backend/src/routes/system/metrics.js:20–40`

- **Action:**
  1. Define single /api/health contract: returns `{ status, services: { embedding: ..., metrics: ... } }` with per-service timeouts (5s each)
  2. Deprecate /api/database/health → redirect or alias
  3. Ensure all endpoints are tested with slow/dead backends; verify timeout behavior

- **Effort:** 2 points

### OPS-M02: Metrics Collected But Not Fully Exposed

**Impact:** Missing observability for long-term capacity planning  
**Status:** Partial collection, no aggregation

- **Problem:** Metrics collector (`services/metrics-collector/collector.py`) collects CPU/RAM/GPU/Temperature/Disk but:
  - **Missing:** PostgreSQL metrics (`pg_stat_user_tables`, `pg_stat_statements`, WAL lag, connection count)
  - **Missing:** Qdrant collection sizes (vector DB bloat detection)
  - **Missing:** MinIO S3 bucket object count + storage trends
  - **Partial:** GPU metrics only exposed via `/metrics/live` real-time endpoint; historical metrics stored 7 days in DB, insufficient for appliance SLA checks

- **Dead Code Risk:** Metrics tables (`metrics_cpu`, `metrics_ram`, etc.) exist but `alertEngine.js` only triggers on recent values from `/metrics/live` (line 515), not on trends. Example: CPU slowly climbing over 24h won't alert until it hits critical threshold today, even if trend is unsustainable.

- **Code Path:** `/home/arasul/arasul/arasul-jet/services/metrics-collector/collector.py:200–400` (partial read needed)

- **Action:**
  1. Add pg_stat tables to metrics schema; poll every 60s
  2. Add trend detection: alert on "CPU < 30% but trending +2%/hour for 8 hours"
  3. Extend metrics retention from 7d to 30d for SLA compliance

- **Effort:** 4 points

### OPS-M03: Self-Healing Agent Logging → Disk Only, No Structured Egress

**Impact:** Hard to aggregate logs; no real-time ops visibility  
**Status:** Logger exists but incomplete

- **Problem:** `services/self-healing-agent/logger.py:19–343` writes JSON logs to `/arasul/logs/self_healing.log` with rotation, BUT:
  - No Loki/ELK integration (metrics-collector logs to `structured_logging`, but self-healing-agent doesn't)
  - No syslog forwarding
  - Dashboard has no `/api/self-healing-agent/logs` endpoint to display recent events
  - If container restarts, logs are lost unless volume is persisted (depends on compose config)

- **Dead Code Risk:** Self-healing agent takes action (service restart, GPU reset, disk cleanup) but ops never sees the action in real-time dashboard. Only detectable by looking at filesystem.

- **Code Path:** `/home/arasul/arasul/arasul-jet/services/self-healing-agent/logger.py` (entire file)

- **Action:**
  1. Integrate `structured_logging` from libs (same as metrics-collector uses)
  2. Add backend endpoint `/api/admin/self-healing-logs` that reads from DB `self_healing_events` (which already exists from category_handlers.py inserts)
  3. Add dashboard widget showing last 10 self-healing actions + success/failure

- **Effort:** 3 points

### OPS-M04: Backup Report Path Hardcoded, No Version Pinning

**Impact:** Configuration brittleness; docker-compose changes break observability  
**Status:** Path is environment variable, but not validated

- **Problem:** `BACKUP_REPORT_PATH` in `apps/dashboard-backend/src/routes/admin/ops.js:19` defaults to `/arasul/backups/backup_report.json` if not set. If compose changes where backups are written, ops endpoint fails silently (returns `{ status: 'missing', reason: 'read_failed' }`).
- **Dead Code Risk:** Backup system working fine, but dashboard shows "backup missing" because path is wrong.

- **Action:**
  1. Validate `BACKUP_REPORT_PATH` in bootstrap; fail fast if missing
  2. Add `/api/admin/config/paths` endpoint showing actual paths (for debugging)

- **Effort:** 1 point

### OPS-M05: Alert History Retention Uncapped

**Impact:** DB bloat; `alert_history` table grows unbounded  
**Status:** Database cleanup exists for some tables, not alert_history

- **Problem:** `/home/arasul/arasul/arasul-jet/services/postgres/init/050_scheduled_cleanup_and_fk_fixes.sql` defines `run_all_cleanups()` which is scheduled every 4h in backend (index.js), but `cleanup_old_alert_history()` is not listed. Alert history can grow to millions of rows if alerts fire frequently.

- **Action:**
  1. Add `cleanup_old_alert_history()` function: delete alerts > 90 days old
  2. Wire into `run_all_cleanups()`
  3. Add retention metric to `/api/ops/overview` dashboard

- **Effort:** 1 point

---

## MINOR ISSUES

### OPS-m01: Self-Healing Recovery Actions Not All Idempotent

**Impact:** Repeated runs of same action may cause data loss  
**Status:** Mostly safe, some risky commands

- **Risky Code:** `category_handlers.py` (lines 200+, needs full read) has `docker restart` (idempotent) but if disk-cleanup code uses `rm -rf` without exclusions, repeated runs could delete user data.

- **Action:** Document which recovery actions are idempotent; add guards to destructive operations (disk cleanup should exclude `/arasul/data`).

- **Effort:** 1 point

### OPS-m02: Notification Events Table No TTL

**Impact:** `notification_events` table grows unbounded  
**Status:** Schema exists, no cleanup

- **Problem:** `notification_events` is queued by self-healing-agent and consumed by backend's eventListenerService, but no cleanup after delivery. Can grow to millions of rows.

- **Action:** Add retention: delete entries > 14 days old OR notification_sent=TRUE and age > 7 days

- **Effort:** 1 point

### OPS-m03: Quarantine Dedup Interval Hardcoded

**Impact:** Admin alert spam if thresholds are wrong  
**Status:** Configurable via code, not env vars

- **Problem:** `_quarantine_notify_interval_seconds = 3600` in `healing_engine.py` is hardcoded; can't tune without restart.

- **Action:** Move to `config.py`; make env var `QUARANTINE_ALERT_INTERVAL_SECONDS`

- **Effort:** 0.5 points

### OPS-m04: No Alerting On Backup Age

**Impact:** Stale backups not detected  
**Status:** Drill checks backup exists, but no alert if backup is > 48h old

- **Problem:** `ops.js:32` marks backup as `stale: ageHours > 48`, but this is only surfaced in `/api/ops/overview` response. No trigger for alert.

- **Action:** Create alerting rule: if `backup.ageHours > 48`, trigger alert. Wire into alertEngine thresholds.

- **Effort:** 1 point

### OPS-m05: Logging Levels Inconsistent Across Services

**Impact:** Hard to tune log verbosity  
**Status:** Each service has own logger

- **Problem:**
  - **Backend:** Winston logger, level from `LOG_LEVEL` env var, defaults to 'info'
  - **Self-healing agent:** Python logging, hardcoded INFO level (logger.py:31)
  - **Metrics collector:** Python logging, hardcoded via `setup_logging()` (unknown default)
  - **N8N workflows:** N8N's own logging (unknown format)

- **No Unified Control:** Can't set all services to DEBUG without code changes.

- **Action:**
  1. Backend + Python services: add `LOG_LEVEL` env var support
  2. Self-healing logger: use `os.getenv('LOG_LEVEL', 'INFO')` in line 31
  3. Add `/api/admin/config/logging` endpoint to show current levels

- **Effort:** 2 points

---

## CODE PATHS & VERIFICATION

| Issue                 | File                                     | Line(s) | Status                     |
| --------------------- | ---------------------------------------- | ------- | -------------------------- |
| Quarantine flow       | `category_handlers.py`                   | 43–76   | Queues to DB, no guarantee |
| Alert webhook logic   | `alertEngine.js`                         | 639–690 | Code exists, no test       |
| Restore drill script  | `restore-drill.sh`                       | 1–227   | Functional but no CI       |
| Health endpoints      | `index.js`                               | 186–250 | Multiple, undeduped        |
| Metrics collection    | `collector.py`                           | 200+    | Partial (CPU/RAM/GPU only) |
| Self-healing logs     | `logger.py`                              | 19–343  | File only, no egress       |
| Backup path           | `ops.js`                                 | 19      | Hardcoded default          |
| Alert history cleanup | `050_scheduled_cleanup_and_fk_fixes.sql` | 39–200  | Not included in cleanup    |
| Notification TTL      | `019_notification_events_schema.sql`     | Unknown | No cleanup                 |

---

## SUMMARY

**Findings:** 13 issues, 3 CRITICAL + 5 MAJOR + 5 MINOR

**Critical Path (must fix for 5-year appliance autonomy):**

1. OPS-C02 (alert webhook tests + dead-letter) — 3 points
2. OPS-C03 (restore drill CI integration) — 3 points
3. OPS-M03 (self-healing logs egress) — 3 points

**Total Effort:** 16 points for critical path; 30+ for full remediation

**Recommendation:** Prioritize OPS-C01/C02/C03 before production deployment. Self-healing and backup systems must have end-to-end tests with network failure scenarios.
