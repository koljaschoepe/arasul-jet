# Telegram Bot Service

Telegram Bot for Arasul Platform system notifications and command interface.

## Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 |
| Framework | python-telegram-bot v21 |
| Health Port | 8090 |
| Mode | Polling (default) |

## Features

- **System Notifications**: Startup, errors, resource warnings
- **Commands**: `/status`, `/health`, `/metrics`, `/help`
- **User Access Control**: Optional whitelist via `TELEGRAM_ALLOWED_USERS`
- **Health Endpoint**: Flask-based `/health` for Docker healthchecks

## Files

| File | Description |
|------|-------------|
| `bot.py` | Main bot application |
| `config.py` | Environment variable handling |
| `health.py` | Flask health check server |
| `Dockerfile` | Container build definition |
| `requirements.txt` | Python dependencies |

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_CHAT_ID` | - | Default chat for notifications |
| `TELEGRAM_ALLOWED_USERS` | - | Comma-separated user IDs |
| `TELEGRAM_BOT_PORT` | 8090 | Health check port |
| `TELEGRAM_NOTIFY_STARTUP` | true | Send startup message |
| `TELEGRAM_NOTIFY_ERRORS` | true | Send error notifications |
| `DASHBOARD_BACKEND_URL` | http://dashboard-backend:3001 | Backend API URL |
| `LOG_LEVEL` | INFO | Logging level |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and user ID |
| `/help` | Command reference |
| `/status` | System status overview |
| `/health` | Backend health check |
| `/metrics` | CPU, RAM, GPU, Disk metrics |
| `/info` | Bot information |

## Setup

### 1. Create Bot via @BotFather

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow prompts
3. Copy the bot token

### 2. Get Your Chat ID

1. Start your bot
2. Send `/start`
3. Note the "Your User ID" in the response

### 3. Configure Environment

Add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TELEGRAM_ALLOWED_USERS=123456789,987654321
```

### 4. Start Service

```bash
docker compose up -d telegram-bot
```

## Security

- **Token Security**: Bot token is never logged (masked in output)
- **User Whitelist**: Optional `TELEGRAM_ALLOWED_USERS` restricts access
- **Non-root Container**: Runs as `botuser` (UID 1000)

## Health Check

The service exposes a health endpoint at `http://localhost:8090/health`:

```bash
curl http://localhost:8090/health
```

Response:
```json
{
  "status": "healthy",
  "service": "telegram-bot",
  "bot_running": true,
  "uptime_seconds": 123.45,
  "messages_sent": 10,
  "messages_received": 5,
  "errors": 0
}
```

## Development

### Local Testing

```bash
cd services/telegram-bot
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN=your_token
python bot.py
```

### Logs

```bash
docker compose logs -f telegram-bot
```

## Troubleshooting

### Bot not responding

1. Check token is correct
2. Verify bot is running: `docker compose ps telegram-bot`
3. Check logs: `docker compose logs telegram-bot`

### "Access denied" message

Add your user ID to `TELEGRAM_ALLOWED_USERS` in `.env`

### Backend commands fail

Ensure `dashboard-backend` is healthy and accessible
