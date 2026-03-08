#!/bin/bash
# ============================================================================
# Validate file permissions for database migrations and scripts
# Ensures PostgreSQL Docker container can read init files
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INIT_DIR="$PROJECT_ROOT/services/postgres/init"

ERRORS=0

echo "=== Validating Migration File Permissions ==="

# Check SQL files are world-readable (644 or more permissive)
while IFS= read -r file; do
    if [ -n "$file" ]; then
        echo "ERROR: $file is not world-readable (needs chmod 644)"
        ERRORS=$((ERRORS + 1))
    fi
done < <(find "$INIT_DIR" -name "*.sql" ! -perm -o=r -print 2>/dev/null)

# Check shell scripts are world-executable (755 or more permissive)
while IFS= read -r file; do
    if [ -n "$file" ]; then
        echo "ERROR: $file is not executable (needs chmod 755)"
        ERRORS=$((ERRORS + 1))
    fi
done < <(find "$INIT_DIR" -name "*.sh" ! -perm -o=x -print 2>/dev/null)

# Check .env is not world-readable (should be 600)
ENV_FILE="$PROJECT_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
    PERMS=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null)
    if [ "$PERMS" != "600" ] && [ "$PERMS" != "640" ]; then
        echo "WARNING: .env has permissions $PERMS (recommend 600)"
    fi
fi

# Summary
if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "FAILED: $ERRORS permission error(s) found."
    echo "Fix with:"
    echo "  chmod 644 services/postgres/init/*.sql"
    echo "  chmod 755 services/postgres/init/*.sh"
    exit 1
else
    echo "OK: All migration file permissions are correct."
fi
