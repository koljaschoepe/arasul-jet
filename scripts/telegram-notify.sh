#!/bin/bash
# Telegram Notification Helper für Claude Autonomous
# Sendet Benachrichtigungen an einen Telegram-Bot oder loggt lokal

MESSAGE="${1:-Keine Nachricht}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Telegram-Credentials aus Umgebung
# Falls nicht gesetzt, versuche aus .env zu laden
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

  if [ -f "$PROJECT_ROOT/.env" ]; then
    # Nur TELEGRAM-Variablen extrahieren (sicher)
    TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
    TELEGRAM_CHAT_ID=$(grep -E '^TELEGRAM_CHAT_ID=' "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
  fi
fi

# Log-Verzeichnis sicherstellen
LOG_DIR="$HOME/logs/claude"
mkdir -p "$LOG_DIR"

# Fallback: Nur loggen wenn keine Telegram-Credentials
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "[$TIMESTAMP] NOTIFICATION: $MESSAGE" >> "$LOG_DIR/notifications.log"
  echo "[$TIMESTAMP] Logged locally (Telegram not configured)"
  exit 0
fi

# Nachricht formatieren
FORMATTED_MSG="<b>Arasul Claude</b>
<code>$TIMESTAMP</code>

$MESSAGE"

# Senden
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  -d text="$FORMATTED_MSG" \
  -d parse_mode="HTML" 2>&1)

# Erfolg prüfen
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "[$TIMESTAMP] Telegram notification sent"
  echo "[$TIMESTAMP] SENT: $MESSAGE" >> "$LOG_DIR/notifications.log"
else
  echo "[$TIMESTAMP] Telegram send failed, logged locally"
  echo "[$TIMESTAMP] FAILED: $MESSAGE" >> "$LOG_DIR/notifications.log"
fi

exit 0
