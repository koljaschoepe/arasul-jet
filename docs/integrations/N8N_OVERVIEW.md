# n8n on the Arasul Appliance — Customer Overview

> **Audience:** end customer running an Arasul appliance.
> **For operators:** see [`N8N.md`](N8N.md) (hardening, hardening-flags, smoke tests).

n8n is an automation engine. You connect it to the apps you use — Microsoft
Teams, Slack, Outlook, Google Workspace, Lexware, Stripe, your CRM,
hundreds of others — and it runs **workflows** that move data and trigger
actions automatically.

On the Arasul appliance, n8n runs **locally**. When a workflow does not
explicitly call out to a SaaS, no data leaves your office.

---

## Install it

1. Open the dashboard, go to the **App Store** tab.
2. Find **n8n**, click **Install**. The appliance pulls and starts the
   container.
3. Once installed, click **Open n8n**. You'll be redirected to `/n8n/` and
   prompted to create your own n8n account on first visit. **Use a real
   email** — n8n uses it for password resets.

The appliance does not share your n8n account or workflows with other
customers — n8n on your appliance is private to your company.

---

## Build your first workflow (5 minutes)

1. Click **Workflows → Create new**.
2. Drag a **Manual Trigger** node onto the canvas.
3. Drag an **HTTP Request** node next to it. Connect them.
4. In the HTTP Request node, set:
   - Method: `POST`
   - URL: `https://httpbin.org/post`
   - Send body: on, JSON: `{"hello": "arasul"}`
5. Click **Test workflow**. Both nodes should turn green.

That's it — you just made an outbound HTTPS call from your appliance.
Replace the URL with any real API.

There are three ready-made smoke-test workflows in
`services/n8n/templates/smoketests/` you can import for reference (HTTP
egress, OAuth2 with GitHub, inbound webhook).

---

## What you can connect

n8n has 400+ stock connectors. The ones our customers use most:

- **Microsoft Teams / Outlook / Excel** — via the Microsoft 365 connectors.
- **Google Workspace** (Gmail, Sheets, Drive, Calendar).
- **Slack** — incoming webhooks, posting messages, reactions.
- **Lexware Office** — invoices, contacts, vouchers (HTTP Request + bearer
  token; details in §6 below).
- **Stripe** — payments and event webhooks.
- **HubSpot, Salesforce, Pipedrive** — contacts and deals.
- **Postgres / MySQL / MSSQL** — direct DB access for ETL workflows.
- **OpenAI / Anthropic Claude** — when you want a third-party LLM in addition
  to the appliance's local one.

---

## Authentication

For most SaaS connectors n8n offers **OAuth2 — Connect with [SaaS]**. Click
it, log into the SaaS, click **Connect** — done. The OAuth flow needs the
appliance's public URL (`PUBLIC_URL` set on the appliance) so the SaaS can
redirect back. Your operator should have set this during install.

For SaaS without OAuth (e.g. Lexware Office), you'll paste an **API key**
into a credential. n8n stores credentials AES-encrypted in its local DB.

---

## Webhooks (incoming events)

If a SaaS calls **you** instead of you calling it (Stripe payment events,
Lexware invoice updates, etc.), n8n hosts a webhook endpoint per workflow:

```
https://<your-appliance>/webhook/<workflow-path>
```

You paste this URL into the SaaS provider's developer console.

⚠ Webhooks are **public** by design — anyone with the URL can hit it.
Always:

- Set the workflow's first node to verify a shared secret
  (`Authentication: Header Auth`) or compute an HMAC signature in a Code
  node, then reject mismatches.
- Use `Idempotency-Key` if the SaaS sends one.

The appliance applies a 600 req/min rate limit per source IP at the proxy
layer, so a single SaaS misbehaving cannot DoS the appliance.

---

## Lexware Office (Beispiel)

Lexware Office (formerly lexoffice) has a public REST API at
`https://api.lexware.io`. There is **no production-ready n8n node** for it
as of mid-2026, so use:

1. **Credentials** → Add → **Header Auth**. Name `Authorization`, value
   `Bearer <your-API-key-from-app.lexware.de/addons/public-api>`.
2. **HTTP Request node** → URL e.g. `https://api.lexware.io/v1/contacts`,
   Authentication = the Header Auth credential you just created.
3. Rate-limit: Lexware allows 2 req/s globally. Add a `Wait` node or a
   token-bucket loop if you batch a lot.

For invoices being pushed _from_ Lexware to you, register an **Event
Subscription** in Lexware pointing at your n8n webhook URL.

---

## DSGVO

n8n is on-premise (your appliance) — no n8n cloud is involved. But **every
SaaS you connect** is a separate processing relationship, often with a
third-country transfer:

- For Microsoft / Google / Slack / Stripe etc., your company needs an AVV
  with the SaaS provider directly. Arasul is not in the loop for those.
- The connector documentation in your dashboard's Privacy tab lists the
  most common ones — see also `docs/legal/DRITTLAND_KONNEKTOREN.md`.
- The Arasul-side DSGVO setup (AVV, audit log, encryption) is documented
  in `docs/legal/AVV_TEMPLATE.md` and `DATENSCHUTZ_N8N.md`.

---

## When something doesn't work

The single best diagnostic is the n8n executions log: **Executions** tab in
the n8n editor. It shows every workflow run, errors with full stack, and
the input/output of every node (only failures are kept by default — see
the operator hardening doc for retention details).

Common gotchas:

| Symptom                                                   | Likely cause                                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth flow redirects to `localhost`                       | `PUBLIC_URL` is not configured on the appliance — ask your operator.                                                                                                   |
| Webhook returns 503 from Cloudflare                       | Cloudflare's BotFightMode strips Stripe/GitHub webhook headers. Add a path-based bypass in CF.                                                                         |
| HTTP Request returns ECONNREFUSED to a hostname like `db` | The hostname is internal-only. n8n's HTTP Request node deliberately blocks internal hostnames in the latest hardening pass — use the appliance's external URL instead. |
| Workflow runs once, then never again                      | Workflow is not **Active** — toggle the switch in the top-right of the editor.                                                                                         |
| Credentials disappear after a restart                     | The encryption key was not persisted. Operator should check `n8n_encryption_key` Docker secret.                                                                        |

If none of those match, save the failed execution from the **Executions**
view and send it to your operator — it includes everything they need.
