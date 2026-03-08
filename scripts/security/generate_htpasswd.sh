#!/bin/bash
# Generiert htpasswd für Traefik Basic Auth
# Usage: ./generate_htpasswd.sh [username]
# Supports: htpasswd (apache2-utils) or python3+bcrypt as fallback

set -e

USERNAME="${1:-admin}"

# Secure password input - never accept password as command line argument
echo "Generating bcrypt hash for user: $USERNAME"
echo ""
read -s -p "Enter password: " PASSWORD
echo ""
read -s -p "Confirm password: " PASSWORD_CONFIRM
echo ""

if [ -z "$PASSWORD" ]; then
  echo "ERROR: Password cannot be empty"
  exit 1
fi

if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
  echo "ERROR: Passwords do not match"
  exit 1
fi

# Generate bcrypt hash (htpasswd preferred, Python fallback)
if command -v htpasswd &> /dev/null; then
  HASH=$(echo "$PASSWORD" | htpasswd -niB "$USERNAME" | cut -d: -f2)
elif command -v python3 &> /dev/null && python3 -c "import bcrypt" 2>/dev/null; then
  HASH=$(python3 -c "
import bcrypt, sys
h = bcrypt.hashpw(sys.stdin.buffer.readline().strip(), bcrypt.gensalt(rounds=10)).decode()
print(h)
" <<< "$PASSWORD")
else
  echo "ERROR: Neither htpasswd nor python3+bcrypt found"
  echo ""
  echo "Install one of:"
  echo "  Ubuntu/Debian: sudo apt-get install apache2-utils"
  echo "  Python:        pip3 install bcrypt"
  exit 1
fi

# Escape $ for YAML (double $$ in YAML)
ESCAPED_HASH=$(echo "$HASH" | sed 's/\$/\$\$/g')

echo ""
echo "Hash generated successfully!"
echo ""
echo "Add this to config/traefik/dynamic/middlewares.yml:"
echo ""
echo "    basicAuth-traefik:"
echo "      basicAuth:"
echo "        users:"
echo "          - '$USERNAME:$ESCAPED_HASH'"
echo "        realm: 'Traefik Dashboard'"
echo "        removeHeader: true"
echo ""
echo "    basicAuth-n8n:"
echo "      basicAuth:"
echo "        users:"
echo "          - '$USERNAME:$ESCAPED_HASH'"
echo "        realm: 'n8n Workflow Engine'"
echo "        removeHeader: true"
echo ""
echo "Username: $USERNAME"
echo "(Password not displayed for security)"
echo ""

# Optionally auto-apply to middlewares.yml
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIDDLEWARES_FILE="$(dirname "$SCRIPT_DIR")/../config/traefik/dynamic/middlewares.yml"

if [ -f "$MIDDLEWARES_FILE" ] && grep -q "PLACEHOLDER" "$MIDDLEWARES_FILE" 2>/dev/null; then
  read -p "Apply to middlewares.yml automatically? [y/N] " APPLY
  if [[ "$APPLY" =~ ^[yYjJ]$ ]]; then
    FULL_HASH="$USERNAME:$ESCAPED_HASH"
    sed -i "s|'admin:\$apr1\$PLACEHOLDER\$REPLACE_WITH_GENERATED_HASH'|'${FULL_HASH}'|" "$MIDDLEWARES_FILE"
    sed -i "s|'admin:\$\$2y\$\$05\$\$PLACEHOLDER_REPLACE_WITH_GENERATED_HASH'|'${FULL_HASH}'|" "$MIDDLEWARES_FILE"
    echo "Applied to $MIDDLEWARES_FILE"
    echo "Restart Traefik: docker compose restart traefik"
  fi
fi
