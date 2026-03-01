# Context: Telegram Bot Integration

## Quick Reference

**Service:** `services/telegram-bot/`
**Entry Point:** `bot.py`
**Health:** Port 8090 (`/health`)
**Config:** `.env` → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`

---

## Architecture

```
Telegram API
     │
     ▼
telegram-bot (8090)
├── bot.py          # Main bot + handlers
├── health.py       # Flask health endpoint
├── config.py       # Environment config
├── commands/       # Command modules
│   ├── disk.py
│   ├── logs.py
│   ├── services.py
│   └── status.py
└── src/
    ├── handlers/   # Callback handlers
    ├── middleware/ # Audit middleware
    └── services/   # Business logic
```

---

## Add New Command

### 1. Create Command Module

```python
# commands/example.py
from telegram import Update
from telegram.ext import ContextTypes
import logging

logger = logging.getLogger(__name__)

async def example_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /example command"""
    chat_id = update.effective_chat.id
    user = update.effective_user

    logger.info(f"Example command from {user.username} (chat: {chat_id})")

    try:
        # Your logic here
        result = "Example response"

        await update.message.reply_text(
            f"📋 *Example Result*\n\n{result}",
            parse_mode='Markdown'
        )
    except Exception as e:
        logger.error(f"Example command error: {e}")
        await update.message.reply_text(f"❌ Error: {str(e)}")
```

### 2. Register in bot.py

```python
# bot.py
from commands.example import example_command

# In setup_handlers():
application.add_handler(CommandHandler("example", example_command))
```

---

## Send Notification from Backend

### Backend API Call

```javascript
// apps/dashboard-backend/src/routes/telegram.js
router.post(
  '/send',
  auth,
  asyncHandler(async (req, res) => {
    const { message, chatId } = req.body;

    await axios.post(`${TELEGRAM_BOT_URL}/send`, {
      chat_id: chatId || process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(',')[0],
      message: message,
    });

    res.json({ success: true, timestamp: new Date().toISOString() });
  })
);
```

### Direct Telegram API

```python
# From any Python service
import requests

def send_telegram_message(message: str, chat_id: str = None):
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = chat_id or os.getenv('TELEGRAM_ALLOWED_CHAT_IDS').split(',')[0]

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    requests.post(url, json=payload)
```

---

## Message Formatting

```python
# HTML format (recommended)
message = """
<b>🚨 Alert</b>

<b>Service:</b> dashboard-backend
<b>Status:</b> Down
<b>Time:</b> 2026-01-25 10:30:00

<i>Auto-recovery initiated</i>
"""

await update.message.reply_text(message, parse_mode='HTML')

# Markdown format
message = """
*🚨 Alert*

*Service:* dashboard-backend
*Status:* Down
*Time:* 2026-01-25 10:30:00

_Auto-recovery initiated_
"""

await update.message.reply_text(message, parse_mode='Markdown')
```

---

## Inline Keyboards

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

keyboard = [
    [
        InlineKeyboardButton("✅ Approve", callback_data='approve'),
        InlineKeyboardButton("❌ Reject", callback_data='reject')
    ],
    [InlineKeyboardButton("📋 Details", callback_data='details')]
]
reply_markup = InlineKeyboardMarkup(keyboard)

await update.message.reply_text(
    "Choose an action:",
    reply_markup=reply_markup
)
```

---

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321

# Optional
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
```

---

## Testing Locally

```bash
# Check bot health
curl http://localhost:8090/health

# View logs
docker compose logs -f telegram-bot

# Restart bot
docker compose restart telegram-bot
```

---

## Checklist

- [ ] Command module created in `commands/`
- [ ] Handler registered in `bot.py`
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Message uses proper formatting (HTML/Markdown)
- [ ] Chat ID validation (if needed)
