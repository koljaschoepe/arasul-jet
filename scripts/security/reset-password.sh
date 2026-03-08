#!/bin/bash
###############################################################################
# Arasul Platform - Admin Password Reset
# Resets the admin password directly in the database.
# Requires SSH/physical access to the Jetson (no email needed).
#
# Usage:
#   ./scripts/security/reset-password.sh [username]
#
# Default username: admin
###############################################################################

set -euo pipefail

USERNAME="${1:-admin}"

echo "========================================"
echo "  Arasul - Admin Password Reset"
echo "========================================"
echo ""
echo "  User: $USERNAME"
echo ""

# Check if postgres container is running
if ! docker compose ps postgres-db 2>/dev/null | grep -q "Up\|running"; then
  echo "ERROR: PostgreSQL container is not running."
  echo "Start it with: docker compose up -d postgres-db"
  exit 1
fi

# Verify user exists
USER_EXISTS=$(docker exec postgres-db psql -U arasul -d arasul_db -tAc \
  "SELECT COUNT(*) FROM admin_users WHERE username = '${USERNAME}';" 2>/dev/null)

if [ "$USER_EXISTS" = "0" ]; then
  echo "ERROR: User '$USERNAME' not found."
  echo ""
  echo "Available users:"
  docker exec postgres-db psql -U arasul -d arasul_db -tAc \
    "SELECT username FROM admin_users;" 2>/dev/null | sed 's/^/  - /'
  exit 1
fi

# Get new password
read -s -p "New password: " PASSWORD
echo ""
read -s -p "Confirm password: " PASSWORD_CONFIRM
echo ""

if [ -z "$PASSWORD" ]; then
  echo "ERROR: Password cannot be empty."
  exit 1
fi

if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
  echo "ERROR: Passwords do not match."
  exit 1
fi

if [ ${#PASSWORD} -lt 8 ]; then
  echo "ERROR: Password must be at least 8 characters."
  exit 1
fi

# Generate bcrypt hash using the backend container (same bcrypt config as app)
if docker compose ps dashboard-backend 2>/dev/null | grep -q "Up\|running"; then
  # Use Node.js in backend container (matches app's bcrypt salt rounds)
  HASH=$(docker compose exec -T dashboard-backend node -e "
    const bcrypt = require('bcrypt');
    bcrypt.hash(process.argv[1], 12).then(h => process.stdout.write(h));
  " "$PASSWORD" 2>/dev/null)
elif command -v python3 &>/dev/null && python3 -c "import bcrypt" 2>/dev/null; then
  # Python fallback
  HASH=$(python3 -c "
import bcrypt, sys
h = bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt(rounds=12)).decode()
print(h, end='')
" "$PASSWORD")
else
  echo "ERROR: Neither backend container nor python3+bcrypt available."
  echo "Start backend: docker compose up -d dashboard-backend"
  exit 1
fi

if [ -z "$HASH" ]; then
  echo "ERROR: Failed to generate password hash."
  exit 1
fi

# Update password in database
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "UPDATE admin_users SET password_hash = '$HASH', updated_at = NOW() WHERE username = '$USERNAME';" \
  >/dev/null 2>&1

# Clear all sessions (force re-login)
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "DELETE FROM user_sessions WHERE user_id = (SELECT id FROM admin_users WHERE username = '$USERNAME');" \
  >/dev/null 2>&1

echo ""
echo "Password reset successful for user: $USERNAME"
echo "All active sessions have been invalidated."
echo "Please log in with the new password."
echo ""
