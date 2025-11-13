#!/bin/bash
# Generiert htpasswd für Traefik Basic Auth
# Usage: ./generate_htpasswd.sh <username> <password>

set -e

USERNAME="${1:-admin}"
PASSWORD="${2}"

if [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <username> <password>"
  echo "Example: $0 admin MySecurePassword123"
  echo ""
  echo "Generates a bcrypt password hash suitable for Traefik Basic Auth"
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
echo "🔐 Generating bcrypt hash for user: $USERNAME"
HASH=$(htpasswd -nbB "$USERNAME" "$PASSWORD" | cut -d: -f2)

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
echo "📋 Credentials:"
echo "   Username: $USERNAME"
echo "   Password: $PASSWORD"
echo ""
