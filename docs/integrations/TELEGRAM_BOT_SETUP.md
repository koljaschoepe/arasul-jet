# Telegram Bot Setup

> **Audience:** customers configuring a Telegram bot on their Arasul appliance.
> **Default mode:** long-polling. No public hostname required.

A Telegram bot lets users chat with the appliance's local LLM directly from
Telegram on their phone or desktop. Audio messages are transcribed, RAG over
indexed documents is included automatically.

---

## 1. Get a bot token from BotFather

1. Open Telegram, search for `@BotFather`, send `/start`.
2. `/newbot` → choose a name (display) → choose a username (must end in `bot`).
3. BotFather sends back an HTTP API token of the form `1234567890:ABCdef…`.
4. Keep this token private — anyone with it can act as your bot.

Recommended bot settings (BotFather menu):

- **/setprivacy** → `Disabled` (so the bot sees all messages, not just `/commands`).
- **/setjoingroups** → `Disable` unless the customer wants group support.
- **/setcommands** → paste:
  ```
  start - Bot starten / Datenschutz-Hinweis
  help - Hilfe anzeigen
  new - Neuer Chat
  status - System-Status
  datenschutz - Datenschutzerklärung
  loeschen - Meine Daten löschen
  ```

---

## 2. Wire it into the dashboard

1. Open the Arasul dashboard → **Telegram** tab.
2. Click **Add bot**, paste the BotFather token.
3. Click **Save**. The dashboard:
   - encrypts the token under the appliance's `JWT_SECRET`,
   - calls Telegram `getMe` to verify the token,
   - stores the bot row with `health_status='healthy'`.
4. Click **Activate**. The bot starts long-polling within ~30 seconds.

You don't need `PUBLIC_URL` set on the appliance to use polling — outbound
HTTPS to `api.telegram.org` is enough. Webhook mode is opt-in (see §6).

---

## 3. Smoke test (the 30-second sanity check)

1. Open Telegram, search for your bot's username, hit **Start**.
2. The bot should reply within ~5 seconds with the Art-13 data-protection
   notice + an inline keyboard "Zustimmen / Ablehnen".
3. Click **Zustimmen**.
4. Type `Hallo`. The bot replies via the local LLM. End-to-end loop confirmed.

If any of these fails, jump to §5 (troubleshooting).

---

## 4. What happens on container restart

On every `dashboard-backend` boot, `telegramPollingManager.initialize()` runs
once. It:

1. queries `SELECT * FROM telegram_bots WHERE is_active = true`,
2. for each bot **without** an explicit webhook configuration, calls
   `startPolling(bot.id)`,
3. for each bot **with** an explicit webhook config (`webhook_url IS NOT NULL`
   AND `PUBLIC_URL` set in env), logs that webhook mode is in effect and
   skips polling — Telegram pushes updates directly.

This is the fix for the failure mode where bots showed "active" in the UI
but silently received nothing after a restart, because polling state lived
only in memory.

---

## 5. Troubleshooting

The dashboard surfaces health state per bot. Use that as the first stop.

| Health status          | What it means                                            | Fix                                                   |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `unknown`              | Bot was created but never run.                           | Click Activate.                                       |
| `healthy`              | Last bring-up succeeded.                                 | —                                                     |
| `token_decrypt_failed` | `JWT_SECRET` was rotated since the bot was added.        | Re-paste the BotFather token in the dashboard.        |
| `token_invalid`        | Telegram returned 401 on `getMe`. Token revoked or typo. | Generate a new token in BotFather, paste it.          |
| `unreachable`          | Network error reaching `api.telegram.org`.               | Check appliance outbound HTTPS / corporate firewall.  |
| `webhook_error`        | Telegram delivery failed (webhook mode only).            | Read the error in the bot details — usually TLS/path. |
| `paused`               | Operator-paused due to repeated failures.                | Address the underlying cause, then Re-activate.       |

If polling silently stops after some time, this is almost always the
`token_decrypt_failed` path. The dashboard now stops polling immediately on
that error — re-pasting the token resets the state.

### Direct API checks (for support)

```bash
# Verify the appliance can reach Telegram outbound
docker exec dashboard-backend curl -sI https://api.telegram.org/

# Check if the bot's token is valid (replace TOKEN)
curl -s "https://api.telegram.org/bot$TOKEN/getMe" | jq

# Check if a webhook is set (only matters in webhook mode)
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | jq
```

`getWebhookInfo` is the most useful single command. The fields `url`,
`pending_update_count`, `last_error_date`, and `last_error_message` answer
90% of "why doesn't it work" questions immediately.

---

## 6. Webhook mode (optional, advanced)

Long-polling is the right default — webhook mode buys ~1–2 seconds of
latency at the cost of needing public reachability.

To enable webhook mode on a bot:

1. Set `PUBLIC_URL=https://your-appliance.example.de` in the appliance's
   `.env` and restart `dashboard-backend`.
2. In the dashboard, open the bot's settings → **Mode: Webhook**.
3. The dashboard calls `setWebhook` with the URL
   `https://your-appliance.example.de/api/telegram-bots/webhook/<bot_id>`,
   plus a per-bot `secret_token` validated as the
   `X-Telegram-Bot-Api-Secret-Token` header.
4. From this point Telegram pushes updates directly. Polling is automatically
   disabled for this bot.

Caveats:

- Webhook URL must be HTTPS, valid CA-signed cert, on port 443/80/88/8443.
  Self-signed certs require uploading the cert via `setWebhook?certificate=`.
- Behind Cloudflare, the BotFightMode WAF strips the `X-Telegram-…` header.
  Add a Cloudflare bypass rule for the path `/api/telegram-bots/webhook/*`.
- Switching from webhook to polling automatically calls `deleteWebhook`
  Telegram-side and clears `webhook_url` in the DB — that's intentional,
  Telegram does not allow both at once.

---

## 7. DSGVO

The bot is a third-country processor (Telegram FZ-LLC, Dubai/UK) — see
`docs/legal/DRITTLAND_KONNEKTOREN.md` for the full posture. Operationally:

- The `/start` command serves the Art-13 notice **before** any LLM call.
- Telegram user IDs are HMAC-pseudonymised in the DB (no plaintext IDs).
- `/datenschutz`, `/loeschen`, `/auskunft` are reserved bot commands and must
  remain functional in any deployment.
- Set the **Verantwortlicher** field in the dashboard per bot — that's the
  legal entity shown on `/datenschutz`.

The customer's own privacy policy must mention that Telegram is used as a
communication channel and that users can fall back to the dashboard's web
chat if they don't want to use Telegram.
