# Arasul n8n Smoke Tests

Three reference workflows that exercise the three integration paths n8n needs to work
end-to-end. Run all three after every n8n image bump.

| File                       | What it proves                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| `01-http-egress.json`      | n8n can reach the public internet over HTTPS (POST to httpbin.org). |
| `02-oauth2-skeleton.json`  | OAuth2 round-trip works (callback URL is correctly constructed).    |
| `03-incoming-webhook.json` | Inbound webhook path works (Traefik → n8n → response).              |

## How to run

1. Open the n8n editor (`/n8n/`), click **Import from File**, select the JSON.
2. For 02: configure the GitHub OAuth2 credential first (see notes inside the workflow).
3. Click **Test workflow** (manual-trigger workflows) or **Activate** + send a `curl` (webhook).
4. All three should return success.

## What "success" means

- **01:** httpbin echoes the JSON body back. Status 200.
- **02:** GitHub returns the authenticated user JSON. Status 200.
- **03:** `curl` returns `{"echoed":"...","received_at":"..."}`. Status 200.

## When this fails

See `docs/integrations/N8N.md` §7 for the canonical failure-mode table.
