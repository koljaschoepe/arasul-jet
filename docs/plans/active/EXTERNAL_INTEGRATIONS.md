# External Integrations Hardening — n8n Workflows + Telegram Bots

> **Status:** Active · **Owner:** Kolja · **Created:** 2026-05-05
>
> **Goal:** Make n8n usable for arbitrary external connectors (Microsoft Teams, Slack, Lexware, …) and fix the broken Telegram-bot path, on a security/DSGVO baseline that holds for a 5-year unattended B2B appliance.

---

## 0. Vision

Two integration surfaces are central to Arasul's value as an Edge-AI appliance:

1. **n8n as the customer's automation hub.** Customers should be able to use any of n8n's 400+ stock connectors — Microsoft Teams, Slack, Lexware, Stripe, etc. — without Arasul shipping per-vendor code. The appliance only has to make sure the network path, the credential store, the inbound webhook routing, and the OAuth callback cycle all work end-to-end and are safe.
2. **Telegram as the canonical "talk to your appliance" channel.** A customer pastes a BotFather token into the dashboard and chats with their on-prem LLM five seconds later. Today: broken in three independent places.

Outside the scope of this plan: shipping custom Lexware/Teams/Slack nodes, multi-tenant n8n on a single appliance (each appliance is one customer's box), and webhook-based Telegram as the default path (long-polling is the chosen default — see §2).

---

## 1. Acceptance Criteria (Definition of Done)

The hardening is complete when **all** of the following are true:

| #    | Criterion                                                                                                                                                                                                                                                 | Verification                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | A customer who opens the dashboard, installs n8n from the App Store, creates their own n8n account, and configures any standard n8n connector (Microsoft Teams, Slack, HTTP Request) can complete an end-to-end workflow that calls an external SaaS API. | Manual smoke: `httpbin.org/post` workflow + one OAuth2 connector with a real provider account.                                               |
| AC2  | The n8n editor at `/n8n/*` is not reachable without a valid Arasul dashboard session.                                                                                                                                                                     | `curl -i https://<host>/n8n/` from a logged-out browser returns 401/redirect.                                                                |
| AC3  | n8n runs with an explicit `N8N_ENCRYPTION_KEY` sourced from the Docker secret `n8n_encryption_key`. The key is not auto-generated into the volume on first boot.                                                                                          | `docker exec n8n env \| grep N8N_ENCRYPTION_KEY` shows the secret value (or its length); n8n logs do not contain "Generated encryption key". |
| AC4  | n8n image is on a version with all known critical CVEs through 2026-05 patched (≥ 2.4.8 / 2.6.2 or current 2.x stable). An unattended-update mechanism is in place.                                                                                       | `docker exec n8n n8n --version` returns the expected version. A scheduled rebuild job exists and ran at least once.                          |
| AC5  | n8n executions data is pruned: `EXECUTIONS_DATA_PRUNE_ENABLED=true`, `EXECUTIONS_DATA_MAX_AGE=336` (14 days), and a Postgres-side check shows table size stays bounded over a 30-day soak.                                                                | Compose env diff + a postgres query showing pruned rows.                                                                                     |
| AC6  | n8n SSRF protection is on: env vars set per the n8n hardening checklist (see §3.2), and a Code-node attempting to reach an internal hostname (`postgres-db`) is denied.                                                                                   | Smoke test workflow: HTTP Request to `http://postgres-db:5432/` returns blocked.                                                             |
| AC7  | Telegram bot setup works end-to-end via the dashboard: paste BotFather token → bot is reachable in ≤ 30 seconds → first message reaches the LLM and a response is delivered, all without setting any env vars manually on the host.                       | Recorded screen flow: token paste → `/start` → reply.                                                                                        |
| AC8  | Telegram polling resumes automatically on container restart for every bot with `is_active=true`. No manual re-activation needed.                                                                                                                          | Restart `dashboard-backend` while a bot is active; observe polling logs resuming within 60 s and a sent message receiving a reply.           |
| AC9  | The three competing Telegram API surfaces (`/api/telegram`, `/api/telegram-bots`, `/api/telegram-app`) are consolidated. There is exactly **one** persisted source of truth (`telegram_bots` table). Removed routes return 410 Gone with a doc pointer.   | `git grep` of old route paths in src + a passing integration test.                                                                           |
| AC10 | The Telegram path uses the **grammY** library — no remaining direct `fetch`/`axios` calls to `api.telegram.org` in `src/services/telegram/*` or `src/routes/telegram/*`.                                                                                  | `grep -rE "api\\.telegram\\.org" apps/dashboard-backend/src/{services,routes}/telegram/` returns 0.                                          |
| AC11 | A "Test Bot Connection" button in the dashboard calls `getMe` + `getWebhookInfo` and surfaces `last_error_message` directly in the UI. Token-decryption failures show an actionable error toast, not silence.                                             | Manual UI walkthrough.                                                                                                                       |
| AC12 | `telegram_user_id` is HMAC-pseudonymized in the DB; raw IDs only live in the in-memory routing layer. The `/start` command serves an Art-13 notice with explicit Drittland-Hinweis + an inline-keyboard consent step before any LLM call.                 | Postgres `SELECT telegram_user_id FROM ...` shows hashes; manual `/start` flow shows the consent UX.                                         |
| AC13 | An AVV template (Auftragsverarbeitungsvertrag, Kunde ↔ Arasul) and a Telegram-specific Datenschutzhinweis-Snippet exist as committed Markdown documents in `docs/legal/`.                                                                                 | Files exist, reviewed once with the project's legal contact (or marked "draft, awaiting legal review").                                      |

---

## 2. Design Decisions (User-confirmed before plan was written)

These are settled — do not reopen mid-implementation:

| Decision                           | Choice                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **n8n license posture**            | n8n is positioned as an **optional Store-installable app**. The customer downloads it from the App Store inside the dashboard and creates their own n8n account during first run. Arasul does not embed/redistribute n8n — it only provides a one-click installer. License = the customer's, not Arasul's. | The Sustainable Use License blocks "embedding for paid distribution". Treating n8n as a customer-self-installed app keeps Arasul out of the redistribution clause. **Anwaltliche Bestätigung dieser Position als Backlog-Item, kein Phase-0-Blocker.**                                                                                          |
| **No custom per-vendor n8n nodes** | Use **standard n8n core connectors** (HTTP Request, OAuth2, Microsoft Teams, Slack, etc.) for everything. No bespoke `n8n-nodes-arasul-lexware` or similar.                                                                                                                                                | Each custom node is a perpetual maintenance + supply-chain liability (see Jan-2026 typosquat incident). Stock connectors are vendor-maintained.                                                                                                                                                                                                 |
| **Telegram default mode**          | **Long-polling** as the default. Webhook only as an opt-in advanced setting.                                                                                                                                                                                                                               | Outbound 443 to `api.telegram.org` works behind any NAT/Cloudflare/firewall. Webhook needs valid TLS, public hostname, port-443 ingress, and survives Cloudflare-BotFightMode header stripping — all customer-side variables we cannot guarantee. Plug-&-play UX wins. Webhook stays available for customers who care about sub-second latency. |
| **Telegram library**               | **grammY** (active maintenance, TypeScript-native, webhook + polling adapters built-in, multi-bot model fits ours).                                                                                                                                                                                        | Telegraf is in maintenance mode (last release Feb 2024). `node-telegram-bot-api` is legacy. grammY is the only library shipping in 2026.                                                                                                                                                                                                        |
| **Multi-bot architecture**         | One webhook URL per bot using server-generated UUID `bot_id` in path: `/api/telegram-bots/webhook/<bot_id>`. Per-bot `secret_token` validated via timing-safe header check.                                                                                                                                | Telegram updates do not contain the destination bot token, so the path identifies the bot. Token never appears in URLs. This pattern is what telegraf, grammY, and python-telegram-bot all recommend.                                                                                                                                           |
| **n8n version pinning**            | Pin to a single 2.x stable line. Automate weekly `docker pull` + healthcheck-gated rebuild via cron. No more comment-driven CVE pinning.                                                                                                                                                                   | n8n averaged ~1 critical CVE per month through Q1 2026. A 5-year unattended appliance cannot rely on manual patching.                                                                                                                                                                                                                           |

---

## 3. Out of Scope (Explicitly Not in This Plan)

- Per-vendor custom n8n nodes (no `n8n-nodes-arasul-lexware`).
- Multi-tenant n8n on a single appliance (one customer per appliance is the product shape).
- Migrating Telegram from polling to webhook as the default.
- Replacing n8n with Activepieces / Windmill / Airflow.
- Implementing n8n-Enterprise features (audit log streaming, RBAC custom roles, external secrets vault).
- Touching the existing Phase-3 OpenAI-compat shim or custom Arasul-LLM/Embeddings/Documents nodes — those stay as-is unless a Phase below explicitly says otherwise.

---

## 4. Phase Map

Phases are ordered by **operational risk if left undone**, not by build dependency. Each phase is self-contained and independently shippable.

| Phase | Focus                                                          | Est.     | Critical?                                                                               |
| ----- | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| 1     | n8n critical security fixes (editor auth, encryption key, CVE) | 1–2 days | **Yes** — `/n8n` editor is currently RCE-equivalent for any internet-reachable visitor. |
| 2     | n8n outbound + inbound for stock connectors                    | 2–3 days | Yes (functional blocker for AC1)                                                        |
| 3     | n8n hardening + DSGVO + auto-update                            | 3–4 days | Yes (DSGVO blocker for commercial sale)                                                 |
| 4     | Telegram critical fixes (polling-resume, PUBLIC_URL, token UX) | 2–3 days | Yes (functional blocker — the bots are broken right now)                                |
| 5     | Telegram architecture cleanup (grammY, route consolidation)    | 3–5 days | No (works after Phase 4, but maintenance debt without it)                               |
| 6     | Telegram DSGVO + multi-bot hardening                           | 2–3 days | Yes (DSGVO blocker)                                                                     |
| 7     | E2E tests + soak + docs                                        | 2 days   | Recommended                                                                             |

Total: ~3 weeks of focused work.

---

## 5. Phase 1 — n8n Critical Security

> **Why first:** Until this is done, anyone who can reach the appliance's HTTPS port and types `/n8n/` into a browser has Code-node RCE and read access to every credential in the n8n DB. This phase closes that hole and ensures stored secrets are actually encrypted with a known key.

### 5.1 Editor auth (`config/traefik/dynamic/routes.yml:126-135`)

The `/n8n` router currently has no `forward-auth` middleware. Add it:

```yaml
n8n:
  rule: 'PathPrefix(`/n8n`)'
  service: n8n-service
  priority: 100
  middlewares:
    - forward-auth # ← add
    - strip-n8n-prefix
    - security-headers
  entryPoints:
    - websecure
  tls: {}
```

Same change for the `n8n-favicon` router (currently has zero middlewares). The `n8n-webhooks` route at `/webhook/*` stays unauthenticated — that endpoint is meant for external SaaS callbacks (see Phase 2.2 for hardening).

n8n's own user management stays as a second layer: customers create their own n8n account inside the editor, and that account governs workflow ownership. The forward-auth ensures only logged-in dashboard users can even reach the n8n login screen.

### 5.2 Encryption key actually applied (`compose/compose.secrets.yaml:94`)

`N8N_ENCRYPTION_KEY_FILE` is not understood by n8n. Two options, pick **option A** (simpler, no entrypoint surgery):

**Option A — read the secret in compose, pass plain env:**

```yaml
# compose.app.yaml, n8n service
environment:
  N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY} # set in the host shell or a sourced .env
```

The host-side wiring reads the secret file and exports the var before `docker compose up`. Add this to the bootstrap script (`scripts/setup/...`) so customers don't see it.

**Option B — entrypoint script in `services/n8n/Dockerfile`:**

```sh
#!/bin/sh
[ -f /run/secrets/n8n_encryption_key ] && export N8N_ENCRYPTION_KEY="$(cat /run/secrets/n8n_encryption_key)"
exec n8n "$@"
```

Option B is preferred long-term (keeps secret file inside container, never in env on host); Option A is faster to ship.

After the change, verify `docker exec n8n env | grep -c N8N_ENCRYPTION_KEY` returns `1` and the n8n log on first boot does **not** contain the warning about a generated key.

If the appliance has already booted with the auto-generated key: the existing credentials are encrypted under that key. Migration plan = export the n8n DB encryption-key file from `~/.n8n/config` inside the volume, set it as the new `N8N_ENCRYPTION_KEY`, then in a follow-up release rotate to a Docker-secret-sourced key by re-encrypting credentials via `n8n export:credentials --decrypted` → `n8n import:credentials`.

### 5.3 CVE patch — bump n8n image

Current pin in `services/n8n/Dockerfile` is vulnerable to CVE-2026-21858 (CVSS 10.0, unauthenticated RCE through the webhook handler) and several CVSS 9.9 expression-injection RCEs. Bump to current 2.x stable (≥ 2.4.8 / 2.6.2 or whatever is current at time of execution). Validate by booting and running the existing `system-health-check.json` template. The Phase-3 (Phase 3 of _this_ plan, see §7) auto-update mechanism replaces this manual bump going forward.

### 5.4 Switch task runners to external mode — **DEFERRED to a follow-up phase**

Current: `N8N_RUNNERS_MODE: 'internal'`. The official hardening guide recommends `external` with a sidecar `n8nio/runners` container, but the runner-launcher tooling is primarily 2.x-aware; on the 1.123.18 line we're staying on for Phase 1 the external-runner contract is still moving. **Re-revisit this when migrating to 2.x** (separate phase, see §12 backlog). The Phase 1.1 editor-auth + 1.3 CVE-patch combination already mitigates the practical Code-node sandbox-escape risk by a wide margin.

### 5.5 Smoke test

- `curl -i https://<host>/n8n/` from a logged-out client → 401/redirect.
- Logged-in user reaches the n8n editor and creates a test workflow.
- A workflow with a Code node attempting `require('fs').readFileSync('/etc/passwd')` is denied (file access restriction enforced — see Phase 3.2).

---

## 6. Phase 2 — n8n Outbound + Inbound for Stock Connectors

> **Goal:** Any of n8n's 400+ stock connectors works end-to-end on the appliance. The customer should not have to know what an "egress rule" is.

### 6.1 Outbound smoke tests

The Subagent analysis confirmed no `internal: true` networks and no firewall blocking egress. Validate with three concrete connector smoke tests, documented in `docs/development/TESTING.md`:

1. **HTTP Request → httpbin.org** — basic outbound HTTPS.
2. **Microsoft Teams (Incoming Webhook URL)** — exercises the most common B2B target.
3. **OAuth2 Generic Credential** flow against a test provider — exercises the credential-storage round-trip and the OAuth2 callback handler at `/rest/oauth2-credential/callback`.

Each test gets a JSON workflow under `services/n8n/templates/smoketests/` so it can be re-run after every n8n image update.

### 6.2 OAuth2 callback routing

n8n's OAuth2 callback URL is `<N8N_EDITOR_BASE_URL>/rest/oauth2-credential/callback`. Verify that:

- `N8N_EDITOR_BASE_URL` is set to the public HTTPS URL (`https://<host>/n8n`), not just `/n8n`.
- The Traefik route at `routes.yml:126-135` does not strip the path needed by the callback (the `strip-n8n-prefix` middleware handles this — confirm with a real OAuth flow).
- `N8N_PROXY_HOPS` is set to `1` so n8n correctly recognizes its public URL behind Traefik.

Document this as a single-page "OAuth Setup" guide in `docs/integrations/N8N_OAUTH.md`. Customers configuring Microsoft Teams/Google/etc. will all hit this.

### 6.3 Webhook hardening

`/webhook/*` is meant to be unauthenticated (external SaaS posts callbacks here). Tighten the rate limiter:

- `config/traefik/dynamic/middlewares.yml`, `rate-limit-n8n`: add `sourceCriterion.ipStrategy.depth: 1` so the bucket is keyed on the real client IP from the trusted proxy chain — currently a backend-network attacker can spoof `X-Forwarded-For` and bypass the limit.
- Increase the limit to 600 req/min (10 req/s) — the current 100/min is too tight for legitimate high-volume webhooks (e.g. a Stripe customer with many events).
- Document the trust boundary: `N8N_TRUST_PROXY=true` is only safe because n8n is on a Docker network shared only with the dashboard-backend. Add a Traefik IP allowlist on the n8n service so only Traefik can talk to `n8n:5678` directly. This closes the X-Forwarded-For spoof from neighbour containers.

### 6.4 SSRF protection

Currently off. n8n ships SSRF protection but does not enable it by default ([docs](https://docs.n8n.io/hosting/securing/ssrf-protection/)). Add to compose env:

```yaml
N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true'
N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES: 'true'
N8N_RESTRICT_FILE_ACCESS_TO: '/home/node/.n8n'
N8N_DISABLE_FORK: 'true' # Code node sandbox stricter
# SSRF block-list: no internal services reachable from HTTP Request node
N8N_SECURE_COOKIE: 'true'
N8N_PROXY_HOPS: '1'
```

Acceptance: a workflow that does `HTTP Request → http://postgres-db:5432/` is denied.

---

## 7. Phase 3 — n8n Hardening + DSGVO + Auto-Update

> **Goal:** The appliance survives 5 years of unattended operation, no execution data accumulates, secrets are recoverable, and a customer's DPO is happy.

### 7.1 Execution-data pruning

Add to compose env:

```yaml
EXECUTIONS_DATA_PRUNE_ENABLED: 'true'
EXECUTIONS_DATA_MAX_AGE: '336' # 14 days
EXECUTIONS_DATA_SAVE_ON_SUCCESS: 'none' # only save errors — drastically cuts data at rest
EXECUTIONS_DATA_SAVE_ON_ERROR: 'all'
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: 'false'
```

`SAVE_ON_SUCCESS=none` is the key DSGVO win: today _every_ successful workflow run stores full input/output payloads (Lexware invoices, customer PII) in Postgres for ever. Switching to errors-only keeps the debug story for failure cases without hoarding production data.

After 30-day soak, verify the `n8n.execution_entity` and `n8n.execution_data` tables stay bounded.

### 7.2 Hardening env block

Beyond the SSRF settings from Phase 2.4, add:

```yaml
N8N_DIAGNOSTICS_ENABLED: 'false' # GDPR — no telemetry to n8n.io
N8N_VERSION_NOTIFICATIONS_ENABLED: 'false'
N8N_HIRING_BANNER_ENABLED: 'false'
N8N_PAYLOAD_SIZE_MAX: '4' # MiB, default 16
N8N_DEFAULT_BINARY_DATA_MODE: 'filesystem' # don't keep large blobs in memory on Jetson
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true'
N8N_GIT_NODE_DISABLE_BARE_REPOS: 'true'
N8N_COMMUNITY_PACKAGES_ENABLED: 'false' # block runtime npm install of community nodes
NODES_EXCLUDE: '["n8n-nodes-base.executeCommand","n8n-nodes-base.ssh"]'
```

`N8N_COMMUNITY_PACKAGES_ENABLED: 'false'` closes the supply-chain attack surface (Jan-2026 typosquat incident exfiltrated decrypted OAuth tokens via malicious community nodes). Customers that need a vendor-specific node ship it as a vendored addition to the Arasul image, not via npm install at runtime.

### 7.3 Audit log (Community-edition workaround)

n8n's enterprise Audit Logging feature is not available on Community. Implement a Postgres-trigger-based change log on the n8n schema's `workflow_entity`, `credentials_entity`, and `user` tables. The trigger writes to a new table `n8n_audit_log` (in the `arasul` schema, not `n8n`) with `(timestamp, actor_id, table_name, action, row_id, diff)`. The dashboard surfaces this at `/api/audit/n8n` for the customer's DPO. Required for DSGVO Art-30 records.

Migration: `services/postgres/init/090_n8n_audit_log.sql`.

### 7.4 Backup + key escrow

Nightly job (cron container or a systemd timer on the host):

1. `pg_dump --schema=n8n arasul_db > /backups/n8n-$(date).sql.gz`
2. `cp /run/secrets/n8n_encryption_key /backups/escrow/n8n_encryption_key.<rotation_id>` — encrypted with the customer's GPG key (configured during onboarding).
3. Retention 30 days local, plus an opt-in S3 mirror for off-site (customer-supplied bucket).

Without the encryption key, the dump is useless. Document this loudly in the backup runbook.

### 7.5 Auto-update channel

A weekly cron container (`n8n-updater`) runs:

```sh
docker pull n8nio/n8n:2.x
docker compose up -d n8n
# wait 60s, hit healthz
curl -fsS http://n8n:5678/healthz || alert "n8n update failed"
```

Failure → keep previous container, alert via the dashboard's existing alert pipeline. Successful update → record the new version in a small `service_versions` table for support visibility.

### 7.6 DSGVO documentation

Three new files under `docs/legal/`:

- `AVV_TEMPLATE.md` — Auftragsverarbeitungsvertrag template, customer ↔ Arasul. Marked draft; reviewed by a lawyer before commercial GA.
- `DATENSCHUTZ_N8N.md` — what data n8n processes, retention, customer rights. Referenced from the customer's own privacy policy.
- `DRITTLAND_KONNEKTOREN.md` — list of common third-country connectors customers are likely to add (Microsoft, Google, Slack, Stripe), with the standard SCC + TIA pointer for each.

Linked from the dashboard's privacy page.

---

## 8. Phase 4 — Telegram Critical Fixes

> **Goal:** A customer pastes a token, sees the bot reply within 30 seconds, and the bot survives a container restart without manual intervention.

### 8.1 Polling auto-resume on bootstrap

Root cause: `activePolls: Map<botId, state>` is in-memory; the bootstrap path in `apps/dashboard-backend/src/index.js` does not call `telegramPollingManager.startPolling()` for bots with `is_active=true`.

Fix: in the dashboard-backend startup sequence, after DB readiness, query `SELECT id FROM telegram_bots WHERE is_active = true AND polling_enabled = true` and start polling for each. Log explicitly per bot.

Acceptance: with a bot active, `docker compose restart dashboard-backend` → polling logs reappear within 60 s → a sent Telegram message gets a reply.

### 8.2 PUBLIC_URL is no longer load-bearing for the default path

Long-polling does not need `PUBLIC_URL`. Make polling the default and only construct webhook URLs when the customer explicitly switches to webhook mode in the UI.

Code change in `apps/dashboard-backend/src/routes/telegram/bots.js:343-374` (activate handler): default path = polling, webhook only when `mode === 'webhook'` and `PUBLIC_URL` is non-empty. If webhook is selected without `PUBLIC_URL`, the dashboard returns a 400 with an actionable error: "Set PUBLIC_URL or switch to polling mode."

### 8.3 Token decryption: surface failures to the user

`apps/dashboard-backend/src/services/telegram/telegramIngressService.js:209-223` currently drops messages silently when `getBotToken()` fails. Change:

- On decryption failure: mark the bot row `health_status='token_decrypt_failed'`, last_error_at = now, last_error_message = 'JWT_SECRET rotated since bot was created — re-paste your token to recover.'
- The dashboard polls bot health and shows a red banner on the bot's row: "Bot is broken. Action needed: re-paste token."
- Stop polling for that bot until a new token is supplied (no point hammering api.telegram.org with a dead token).

### 8.4 Polling activation no longer deletes existing webhooks

`telegramIngressService.js:566-590` calls `deleteWebhook` unconditionally on polling activation. Change: only call `deleteWebhook` if the bot record's `mode` was previously `webhook`. If the customer switches polling on while in webhook mode, the dashboard shows a confirmation modal: "Switching to polling will disable your webhook. Continue?"

### 8.5 Smoke test

Recorded screen flow committed under `docs/development/TELEGRAM_SETUP_DEMO.md`:

1. Paste BotFather token in dashboard
2. Click "Activate"
3. Open Telegram, message the bot `/start`
4. Bot replies with the Art-13 notice + consent inline keyboard (Phase 6 covers the consent UX)
5. After consent: free-form chat → LLM reply round-trip ≤ 5 s

---

## 9. Phase 5 — Telegram Architecture Cleanup

> **Goal:** Remove the three-API-paths confusion and replace raw fetch/axios calls with a maintained library.
>
> **Status (2026-05-06):** Phase 5 was split into **5a (shipped)** and **5b (deferred)**:
>
> - **5a — shipped:** `5.3` header-based webhook with timing-safe `secret_token` validation, `setWebhook` migrated to `secret_token` (URL no longer carries the secret); `5.4` customer-facing `/api/telegram-bots/:id/diagnose` endpoint that distils `getMe + getWebhookInfo` into a `{status, summary, details}` verdict the dashboard can render directly. The legacy URL-secret webhook route (`/webhook/:botId/:secret`) is kept until all in-flight bots have re-registered.
> - **5b — deferred:** `5.1` API-surface consolidation (three Express routers + three tables → one) and `5.2` grammY-library migration. Both touch the frontend and require their own iteration with regression tests; running them inside Phase 5 would have ballooned the change-set and destabilised the surface that Phase 4 just stabilised.
>
> See `9.X` below for the deferred-phase contract.

### 9.1 Consolidate to one API surface

| Old surface          | Status after this phase                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/api/telegram`      | Removed. Routes return 410 Gone with `Link: </api/telegram-bots>` header.                                             |
| `/api/telegram-bots` | The single source of truth. All UI calls migrate here.                                                                |
| `/api/telegram-app`  | Removed. The zero-config wizard (which is the only valuable thing here) is folded into `/api/telegram-bots/wizard/*`. |

Database side: `telegram_bots` is the single source of truth. The old `telegram_config` table (id=1 row) is marked deprecated; data migrated into a corresponding `telegram_bots` row by migration `services/postgres/init/0XX_consolidate_telegram_tables.sql`. Old table dropped two releases later once monitoring confirms no reads.

### 9.2 grammY library introduction

Replace direct `fetch`/`axios` calls in `apps/dashboard-backend/src/services/telegram/*` with grammY:

- `telegramIngressService.js` → grammY `Bot` instance per bot, `bot.start({ drop_pending_updates: false })` for polling, `bot.handleUpdate(update)` for webhook.
- `telegramOrchestratorService.js` → grammY's `Api` for `sendMessage`, `getMe`, `getWebhookInfo`, etc.
- One shared `BotRegistry` class holds the `Map<botId, Bot>` for active bots; centralises lifecycle (start/stop/restart) so Phase 4.1's resume-on-bootstrap is a one-liner.

The custom Arasul nodes for n8n are unaffected — this is purely the Telegram-backend code path.

### 9.3 Multi-bot path identification

Webhook URL pattern: `/api/telegram-bots/webhook/<bot_id>`. `bot_id` is a server-generated UUIDv7 from the `telegram_bots.id` column (no exposure of customer-supplied identifiers). Per-bot `secret_token` validated via `crypto.timingSafeEqual` against the `X-Telegram-Bot-Api-Secret-Token` header.

### 9.4 "Test Bot Connection" UI

Dashboard button next to each bot: calls `GET /api/telegram-bots/<id>/diagnose` which:

1. Calls `getMe` → success/auth failure.
2. Calls `getWebhookInfo` → returns `url`, `pending_update_count`, `last_error_date`, `last_error_message`.
3. Returns a structured `{ status, summary, details }` payload.

UI shows the result inline with a copy-button for the raw JSON (for support).

---

## 10. Phase 6 — Telegram DSGVO + Multi-Bot Hardening

> **Goal:** A telegram bot on a Jetson appliance is sellable into German B2B without raising a DPO's hair.

### 10.1 telegram_user_id pseudonymization

Add migration `services/postgres/init/0XX_telegram_user_id_hmac.sql`:

- New column `telegram_user_id_hash CHAR(64)` (HMAC-SHA256, server-side pepper from a Docker secret `telegram_user_id_pepper`).
- Backfill existing rows.
- Drop the plain-text `telegram_user_id` column in a follow-up release (after one full retention cycle).

The HMAC key is stable per-appliance (rotating it would break user continuity). Pepper rotation is documented in the runbook with a re-hash migration.

### 10.2 /start consent flow

Hand-coded in `apps/dashboard-backend/src/services/telegram/commandHandlers/start.js`:

1. On `/start`, send the Art-13 notice as a Markdown message: who is the controller (the customer's company, set during bot creation), what data is processed, retention, third-country transfer to Telegram with risk note (Art. 49(1)(a) opt-in basis), the customer's DPO contact (configured in dashboard).
2. Inline keyboard: "✅ Ich willige ein" / "❌ Ablehnen".
3. On consent: write `(telegram_user_id_hash, bot_id, consented_at)` to a `telegram_user_consent` table; allow chat.
4. On rejection or no response: bot replies with a one-liner "OK — keine Verarbeitung." and stops responding to that user. No history is kept.
5. On `/datenschutz`: re-send the notice. On `/loeschen`: drop the user's consent row + history. On `/auskunft`: export the user's chat history as a Telegram document.

### 10.3 Per-bot rate limiting

Currently rate limiting (if any) is global. Switch to per-bot in the dashboard-backend's middleware layer (Redis-backed token bucket keyed on `bot_id`). Default: 30 messages/min/user, 600/min/bot. Configurable per bot in the dashboard.

### 10.4 Cloudflare-tunnel route (optional, only if customer chose webhook mode)

If `services/cloudflared/config.yml.template` is in use, add a route:

```yaml
- hostname: ${PUBLIC_HOSTNAME}
  path: /api/telegram-bots/webhook/*
  service: http://reverse-proxy:80
```

Plus a Cloudflare Bot-Fight-Mode bypass for the path (the BotFightMode otherwise strips `X-Telegram-Bot-Api-Secret-Token`). Documented in `docs/integrations/CLOUDFLARE_TUNNEL.md`.

### 10.5 Diagnostics surfacing

**Backend side: shipped via Phase 4 + 5a.** The data the dashboard needs is
already in the DB (`telegram_bots.health_status / last_error_at /
last_error_message / last_health_check_at`, populated on every bring-up and
token check) and accessible via `GET /api/telegram-bots/:id/diagnose` and
the existing `/health` and `/debug` endpoints.

**Frontend side: deferred.** Wiring the always-on red banner, the "Test Bot
Connection" button, and "Force re-register webhook" admin action is a
frontend-only change. It belongs in the same iteration as Phase 5b's API
consolidation so the UI doesn't get rewritten twice.

---

## 11. Phase 7 — E2E Tests + Soak + Documentation

> **Goal:** Regressions caught early; the docs match the running system.

### 11.1 Smoke tests (added to `./scripts/test/run-tests.sh`)

- **n8n smoke:** `docker exec n8n n8n execute --workflow-id <smoketest-http-request>` returns success.
- **Telegram smoke:** new mock-bot harness (no live BotFather) — start polling against a fixture stub of api.telegram.org, send a fake update, assert the LLM was called and reply was sent.
- **Forward-auth smoke:** `curl -i https://<host>/n8n/` from a no-cookie context returns 401.

### 11.2 Soak test (24h)

- Active n8n workflow polling httpbin every 5 minutes.
- Active Telegram bot, scripted user sending 1 message per minute.
- Restart `dashboard-backend` once at the 6h mark, `n8n` once at the 12h mark.
- Endpoint: zero dropped messages, zero failed n8n executions, both services back up within 60 s of each restart.

### 11.3 Documentation

- `docs/integrations/N8N_OVERVIEW.md` — the customer-facing "what is n8n" + how to install + first workflow.
- `docs/integrations/TELEGRAM_BOT_SETUP.md` — paste-token-and-go customer guide.
- `docs/legal/AVV_TEMPLATE.md`, `DATENSCHUTZ_N8N.md`, `DRITTLAND_KONNEKTOREN.md` (also listed in Phase 3.6).
- `CLAUDE.md` updates: top-level CLAUDE.md gets a "Integrations" pointer; `apps/dashboard-backend/CLAUDE.md` gets a Telegram section noting grammY + the BotRegistry pattern.

---

## 12. Open Questions / Backlog (not in scope, but tracked)

- **n8n license — Anwaltliche Bestätigung** that the "customer-installs-from-store" position holds. Backlog item, not blocker.
- **Webhook-mode for Telegram** as a polished customer-facing option (vs. today's plan of "supported but not the default"). Likely a small Phase 8 once Phase 4–6 land.
- **n8n external-secrets Vault integration** (Enterprise feature). Only relevant if Arasul ever moves to Enterprise.
- **Per-customer n8n metrics** for cost tracking (workflow count, execution count, failure rate). Nice-to-have for support visibility.

---

## 13. References

Subagent research artifacts that informed this plan (kept here for traceability — these are not durable references):

- n8n compose + egress analysis (Subagent A)
- Traefik + auth analysis (Subagent B)
- Backend↔n8n integration analysis (Subagent C)
- n8n config security review (Subagent D, code-reviewer)
- n8n production best practices, 2025–2026 (Subagent E)
- n8n CVEs + license + audit research (Subagent F)
- Lexware-as-example connector + DSGVO research (Subagent G)
- Telegram backend code-path analysis (Subagent H)
- Telegram routing + egress analysis (Subagent I)
- Telegram library + multi-bot + DSGVO research (Subagent J)
