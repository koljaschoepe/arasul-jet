# Commercial / Compliance — Context

> Conventions specific to the platform's commercial promise: GDPR/DSGVO,
> data minimization, audit trails, and the "5 years autonomous" bar.
> Anything you change here lands on a customer's box, often unattended.

## GDPR endpoints (`apps/dashboard-backend/src/routes/admin/gdpr.js`)

| Endpoint                   | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `GET /api/gdpr/export`     | Full JSON archive of the authed user's personal data |
| `GET /api/gdpr/categories` | Counts per category — transparency before export     |

Both routes require `requireAuth + requireAdmin` and call
`logSecurityEvent(...)` so the access shows up in `security_audit_log`
(Migration 061). Always extend that audit call when you add a new
GDPR-relevant action — the log is what proves the export ever happened.

## Data minimization rules

- **Prompts → hash, not plaintext** for non-essential telemetry.
  `rag_query_log` (Mig 076) and `api_audit_logs` store a SHA-256 of the
  prompt for similarity/abuse analysis, never the prompt itself.
  Don't add a column that resurrects plaintext "for debugging" — Phase 5
  removed that and we are not bringing it back.
- **PII boundary is the chat row**: `chat_messages.content` and
  `chat_messages.thinking` are user data. Anywhere those leave the row
  (logs, metrics, analytics, error-handler, support bundle) they must be
  truncated, hashed, or omitted.
- **Logs are not a database**: don't `logger.info('user submitted: ' + body)`.
  The platform's logger ships to stdout → Docker → potentially a customer's
  log shipper. Treat it as untrusted disclosure.

## Audit trail

| Table                | Migration | What goes in                                         |
| -------------------- | --------- | ---------------------------------------------------- |
| `security_audit_log` | 061       | Logins, GDPR actions, password changes, key rotation |
| `api_audit_logs`     | 021       | External API key usage (per-key throttle counters)   |
| `audit_log`          | 017       | Generic high-value admin actions                     |

Use `utils/auditLog.js` (`logSecurityEvent`, etc.) — never raw `INSERT INTO …`.

## Retention

- **Metrics & logs**: 7 days (Mig 081 + the cleanup cron).
- **Chat conversations**: soft-delete (30 days, see schema docs).
- **`update_events`, `admin_users`**: permanent.
- **`app_events`**: 90 days (Mig 079).
- New table that holds user data → add it to the cleanup cron and to
  `docs/api/DATABASE_DOMAINS.md` retention table.

## Secrets

- All secrets are mounted as Docker secrets at `/run/secrets/<name>` and
  hydrated into env at boot via `apps/dashboard-backend/src/utils/resolveSecrets.js`.
  Read them once at boot, pass via config — don't sprinkle
  `process.env.JWT_SECRET` deep in business logic.
- Production guard: `index.js` refuses to boot if `JWT_SECRET` < 32 chars
  or contains `dev|test|default|example|changeme|password`. Don't relax
  that check.

## Customer-facing language

UI strings and customer-visible error messages stay in **German** unless
explicitly internationalized — that's the product's market. Code, comments,
and developer-facing messages are English (per `CONTRIBUTING.md`).

## Support / incident response

- **Backups**: `services/backup-service/` runs `pg_dump` + a periodic
  restore-drill. See `docs/ops/BACKUP_SYSTEM.md` and
  `docs/ops/DISASTER_RECOVERY.md`.
- **Self-healing**: services declared in compose with healthchecks are
  auto-recovered. New services that don't have a healthcheck are
  invisible to the agent.
- **Update path**: `update_events` + the Update System docs. Never push
  schema-incompatible changes to a release without a forward-only migration.

## When you add a feature that touches user data

Checklist:

1. New table or column? Document retention + ownership.
2. New endpoint that returns user data? Audit-log it.
3. New log line? Confirm no PII / prompt content.
4. New env var that holds a secret? Add to `resolveSecrets.js`,
   document in `docs/ENVIRONMENT_VARIABLES.md`.
5. Customer message? German, clear, actionable.
