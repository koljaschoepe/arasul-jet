# n8n Integration Guide

> **Audience:** operators of an Arasul appliance who want their customers to use n8n's stock connectors (Microsoft Teams, Slack, OAuth2-based SaaS, HTTP APIs, …) safely.

n8n is shipped as a customer-installable App-Store entry, not as an Arasul-bundled component. This document covers the platform-level wiring that has to be right for any connector to work — beyond that, customers configure their own n8n credentials inside the n8n editor.

---

## 1. Reaching the editor

The editor is at `/n8n/`. There is **one** wall — the Arasul dashboard login — and n8n's own sign-in is never shown to the user (Plan 007):

1. **Dashboard session** — Traefik's `forward-auth` middleware verifies an Arasul dashboard JWT (cookie or `Authorization: Bearer …`). Logged-out visitors get a 401 and never reach `/n8n/` or `/api/automations/session`.
2. **Fixed n8n owner + auto-session** — n8n 2.x enforces a single owner. Arasul provisions **one fixed owner** idempotently at container start (`services/n8n/entrypoint.sh`, `POST /rest/owner/setup`, credentials from the `n8n_owner_email` / `n8n_owner_password` Docker secrets). When the Automationen tab opens, the frontend calls `GET /api/automations/session`; the backend logs that owner in server-side (`POST /rest/login` against n8n) and forwards n8n's `Set-Cookie` (`n8n-auth`) **same-origin** to the browser. The iframe then loads `/n8n/` already authenticated — no visible n8n login.

This is a single-tenant appliance: all dashboard admins share one n8n workspace. n8n's own user management is not surfaced; the security boundary is entirely the dashboard session (forward-auth). Webhooks (`/webhook/*`) stay deliberately public for external triggers.

Implication: an unauth visitor cannot even reach `/n8n/` — they see the dashboard login. This is intentional and matches how `/minio` and `/claude-terminal` are gated.

---

## 2. Outbound connectivity

n8n attaches to two Docker networks (`arasul-frontend`, `arasul-backend`). Neither is `internal: true`, so any connector can reach the public internet on standard ports. **No further egress configuration is required for stock connectors.**

If a customer's corporate firewall blocks outbound 443, only the SaaS-vendor hostname needs to be allowlisted — n8n itself does not require any privileged outbound channel.

---

## 3. Inbound webhooks

External SaaS services (Stripe, Lexware, GitHub, …) reach n8n via:

```
https://<host>/webhook/<workflow-path>
```

The route is **unauthenticated by design** — that is the contract every webhook-issuing service expects. Protections:

- **Rate limit:** 600 req/min (10 req/s) with burst 100, keyed on the real client IP from the trusted proxy chain (`config/traefik/dynamic/middlewares.yml`, `rate-limit-n8n`).
- **Per-webhook secret:** every customer-built webhook should set an `Authentication: Header Auth` credential or a custom HMAC-verifying Code node as its first step. n8n itself does not yet enforce HMAC validation on the webhook node — that is on the customer to wire in. See [the GitHub HMAC template](https://n8n.io/workflows/8906-secure-github-webhooks-with-hmac256-signature-validation/) for the canonical pattern.
- **TLS:** Traefik terminates valid Let's Encrypt certificates. Any SaaS that requires CA-signed TLS will accept these.

**Public reachability:** the appliance must be reachable from the public internet for webhook callbacks. Behind NAT, enable the Cloudflare tunnel (`compose.external.yaml`, profile `tunnel`) and ensure the tunnel config maps the appliance's public hostname to `/webhook/*`.

---

## 4. OAuth2 callbacks

n8n's OAuth2 redirect URL is:

```
https://<host>/n8n/rest/oauth2-credential/callback
```

For this to work end-to-end, three things must be aligned:

1. **`PUBLIC_URL` / `N8N_EXTERNAL_URL`** — set in the host `.env` to the full HTTPS URL (e.g. `https://arasul.acme-corp.de`). Without this, n8n constructs callback URLs containing `localhost` or relative paths, and OAuth providers reject them.
2. **`N8N_PROXY_HOPS=1`** — set in `compose/compose.app.yaml`. Tells n8n that exactly one trusted proxy (Traefik) sits in front of it, so it correctly recognizes its public URL when handling redirects.
3. **Provider-side configuration** — in the SaaS provider's developer console (Microsoft Azure AD, Google Cloud Console, GitHub OAuth Apps, …), register the exact callback URL above. Mismatches cause silent OAuth failures with cryptic provider error messages.

### Smoke test

1. In the n8n editor, create a new credential of type `OAuth2 API` (generic).
2. Use any provider you have a developer account with — GitHub is the easiest.
3. Click `Connect`. The redirect should round-trip back to the n8n editor with a green "Connected" indicator.
4. If it fails: the provider error message in the URL bar (`error_description=…`) tells you whether it's a redirect-URI mismatch (most common), a scope problem, or a TLS issue.

---

## Calling a Workspace agent from n8n (HTTP trigger)

n8n can start a Workspace agent over plain HTTP and read its result. This is the
non-streaming counterpart of the Chat `@agent` flow — see
[`docs/features/AGENTS.md`](../features/AGENTS.md) for the agent format.

1. **Mint a token** (once, in the dashboard or via API). Each Workspace has its
   own bearer token:

   ```
   POST /api/sandbox/projects/<workspace>/agenten/token
   ```

   The plaintext token (`arun_…`) is returned **exactly once**; only its bcrypt
   hash is stored, and each call rotates it. Store it in an n8n _Header Auth_
   credential.

2. **Run the agent** from an n8n _HTTP Request_ node:

   ```
   POST /api/sandbox/projects/<workspace>/agenten/<agent>/run
   Authorization: Bearer arun_…
   Content-Type: application/json

   { "input": "…" }
   ```

   Response: `{ "result": "…", "steps": [ … ], "iterations": 3, "truncated": false, "timestamp": "…" }`.

Every auth failure — missing/unknown workspace, no token set, wrong token —
returns a single `401` (never `404`), so the endpoint never reveals which
workspaces exist. The run executes as the workspace owner and is jailed to that
workspace (files, RAG, terminal).

---

## 5. Hardening posture

The compose-level hardening for n8n is set in `compose/compose.app.yaml` and validated against the [n8n hardening guide](https://docs.n8n.io/hosting/securing/overview/):

| Variable                                | Value                   | Rationale                                                                                                    |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE`          | `true`                  | Code/Function nodes cannot read `process.env`. Closes a credential-leak path via Code node.                  |
| `N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES`    | `true`                  | Code nodes cannot read n8n's own config / encryption-key file.                                               |
| `N8N_RESTRICT_FILE_ACCESS_TO`           | `/data/agent-workspace` | File nodes only see the shared agent-workspace volume (details: [N8N_AGENTS.md](N8N_AGENTS.md)).             |
| `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS` | `true`                  | n8n enforces 0600 on its own settings file.                                                                  |
| `N8N_GIT_NODE_DISABLE_BARE_REPOS`       | `true`                  | Git node hardening (prevents bare-repo pivot attacks).                                                       |
| `N8N_PAYLOAD_SIZE_MAX`                  | `8` (MiB)               | Default 16 — reduced for DoS mitigation. 8 MiB is plenty for stock connectors; raise per-customer if needed. |
| `N8N_DEFAULT_BINARY_DATA_MODE`          | `filesystem`            | Large attachments stay on disk, not in RAM. The Jetson has finite memory.                                    |
| `N8N_PROXY_HOPS`                        | `1`                     | n8n recognises Traefik as exactly one trusted proxy.                                                         |
| `N8N_DIAGNOSTICS_ENABLED`               | `false`                 | GDPR — no telemetry to n8n.io.                                                                               |
| `N8N_VERSION_NOTIFICATIONS_ENABLED`     | `false`                 | Not a security control, but reduces network noise.                                                           |
| `N8N_HIRING_BANNER_ENABLED`             | `false`                 | Customer-facing UI, no n8n-recruiter banners.                                                                |
| `N8N_TEMPLATES_ENABLED`                 | `false`                 | No template-store call-outs to api.n8n.io (GDPR / offline).                                                  |
| `N8N_RUNNERS_MODE`                      | `external`              | Code nodes execute in the `n8n-runners` sidecar, not in the n8n main process.                                |
| `N8N_SSRF_PROTECTION_ENABLED`           | `true`                  | HTTP nodes cannot reach RFC1918/loopback/link-local; internal services via explicit hostname allowlist.      |
| `N8N_DISABLED_MODULES`                  | `mcp`                   | Instance-wide MCP server hard-disabled (MCP _client_ tool node still works).                                 |

Since the 2.x upgrade the former backlog items are enforced: execution-data
retention/pruning, `N8N_COMMUNITY_PACKAGES_ENABLED=false`, external task
runners and instance-wide SSRF protection are all active in
`compose/compose.app.yaml`. Agent-specific hardening (task-runner sidecar,
agent workspace, SSRF allowlist rationale) is documented in
**[N8N_AGENTS.md](N8N_AGENTS.md)**.

---

## 6. Smoke-test workflows

Three reference workflows live under `services/n8n/templates/smoketests/`. Each is a self-contained JSON that can be imported via **n8n editor → Import from File** and run with one click:

| File                       | Tests                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `01-http-egress.json`      | HTTP Request → `httpbin.org/post`. Confirms outbound HTTPS.                             |
| `02-oauth2-skeleton.json`  | OAuth2 credential placeholder + a `getMe`-style call. Customise the credential and run. |
| `03-incoming-webhook.json` | Webhook node + Set node + Respond. Exercises the inbound path.                          |

Run all three after every n8n image bump to catch regressions.

---

## 7. Common failure modes

| Symptom                                                       | Likely cause                                                                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth flow redirects to `https://localhost/...`               | `PUBLIC_URL` / `N8N_EXTERNAL_URL` not set in `.env`.                                                                                                                              |
| OAuth provider returns "redirect_uri_mismatch"                | The exact callback URL is not whitelisted in the provider's developer console.                                                                                                    |
| Webhook returns 404                                           | Workflow not active, or `WEBHOOK_URL` env not set so n8n didn't generate the URL.                                                                                                 |
| Webhook returns 503 Cloudflare                                | Cloudflare BotFightMode treats Stripe/GitHub webhook IPs as bots. Add a path-based bypass for `/webhook/*`.                                                                       |
| `Generated encryption key` warning in n8n logs on first boot  | `n8n_encryption_key` Docker secret not mounted. Check `compose.secrets.yaml`.                                                                                                     |
| HTTP Request to an internal host fails with "Request blocked" | Instance-wide SSRF protection (`N8N_SSRF_PROTECTION_ENABLED=true`) is working as intended. Legitimate internal targets belong in `N8N_SSRF_ALLOWED_HOSTNAMES` (compose.app.yaml). |
| Code node hangs / "no task runner available"                  | `n8n-runners` sidecar down or auth-token mismatch — see [N8N_AGENTS.md](N8N_AGENTS.md) §Troubleshooting.                                                                          |

---

## 8. Where things live in the repo

| File                                                      | Purpose                                                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose/compose.app.yaml` (n8n + n8n-runners)            | Runtime env-vars, hardening flags, task-runner sidecar, agent-workspace volume.                                                                                                        |
| `compose/compose.secrets.yaml` (n8n section)              | Mounts `n8n_encryption_key`, `n8n_runners_auth_token`, and the `n8n_owner_email` / `n8n_owner_password` secrets (also into dashboard-backend for the auto-session).                    |
| `apps/dashboard-backend/src/routes/automations.js`        | `GET /api/automations/session` — logs the fixed owner into n8n and forwards the `n8n-auth` cookie same-origin (Plan 007).                                                              |
| `apps/dashboard-frontend/.../viewers/AutomationenTab.tsx` | Fetches the session before mounting the `/n8n/` iframe; shows a loading/error state instead of n8n's login mask.                                                                       |
| `services/n8n/Dockerfile`                                 | Pinned n8n version (must match the `n8nio/runners` tag), custom-node compilation, entrypoint shim.                                                                                     |
| `services/n8n/entrypoint.sh`                              | Resolves the encryption-key + runners-auth-token secrets into env at boot **and** idempotently provisions the fixed owner (`POST /rest/owner/setup`, gated on `showSetupOnFirstLoad`). |
| `config/traefik/dynamic/routes.yml`                       | `/n8n` (forward-auth + strip-prefix), `/webhook/*` (rate-limited, unauth).                                                                                                             |
| `config/traefik/dynamic/middlewares.yml`                  | `rate-limit-n8n`, `strip-n8n-prefix`, `forward-auth`.                                                                                                                                  |
| `config/traefik/dynamic/websockets.yml`                   | `/n8n-websocket` route for the editor's live updates.                                                                                                                                  |
| `services/n8n/templates/smoketests/*.json`                | Reference workflows for post-deploy verification.                                                                                                                                      |
| `services/n8n/templates/agents/*.json`                    | Agent workflow templates (import: `scripts/util/n8n-import-templates.sh`).                                                                                                             |
| `docs/integrations/N8N_AGENTS.md`                         | Agent workflows, task-runner architecture, upgrade/backup/rollback.                                                                                                                    |
| `docs/legal/N8N_LIZENZ.md`                                | Sustainable-Use-License assessment + mandatory pre-sales gate.                                                                                                                         |
| `docs/plans/archive/2026-07-02_external-integrations.md`  | Full hardening roadmap.                                                                                                                                                                |
