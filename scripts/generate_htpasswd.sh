#!/bin/bash
# Generiert htpasswd für Traefik Basic Auth
# Usage: ./generate_htpasswd.sh [username]

set -e

USERNAME="${1:-admin}"

# Secure password input - never accept password as command line argument
echo "🔐 Generating bcrypt hash for user: $USERNAME"
echo ""
read -s -p "Enter password: " PASSWORD
echo ""
read -s -p "Confirm password: " PASSWORD_CONFIRM
echo ""

if [ -z "$PASSWORD" ]; then
  echo "❌ ERROR: Password cannot be empty"
  exit 1
fi

if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
  echo "❌ ERROR: Passwords do not match"
  exit 1
fi

# Check if htpasswd is available
if ! command -v htpasswd &> /dev/null; then
  echo "❌ ERROR: htpasswd command not found"
  echo ""
  echo "Please install apache2-utils:"
  echo "  Ubuntu/Debian: sudo apt-get install apache2-utils"
  echo "  macOS: brew install httpd"
  echo "  Alpine: apk add apache2-utils"
  exit 1
fi

# Generate bcrypt hash (Apache htpasswd format)
# Use -i flag to read password from stdin (avoids password in process list)
HASH=$(echo "$PASSWORD" | htpasswd -niB "$USERNAME" | cut -d: -f2)

# Escape $ for YAML (double $$ in YAML)
ESCAPED_HASH=$(echo "$HASH" | sed 's/\$/\$\$/g')

echo ""
echo "✅ Hash generated successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Add this to config/traefik/dynamic/middlewares.yml:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "    basicAuth-n8n:"
echo "      basicAuth:"
echo "        users:"
echo "          - \"$USERNAME:$ESCAPED_HASH\""
echo "        realm: \"n8n Workflow Engine\""
echo "        removeHeader: true"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Username: $USERNAME"
echo "   (Password not displayed for security)"
echo ""
