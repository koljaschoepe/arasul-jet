#!/bin/bash
# ============================================================
# verify-hooks.sh - Claude Code Hook Healthcheck
# ============================================================
# Prüft ob alle Hooks korrekt konfiguriert und funktionsfähig sind
#
# Verwendung:
#   ./scripts/verify-hooks.sh
#
# Exit-Codes:
#   0 = Alle Checks bestanden
#   1 = Warnungen (nicht kritisch)
#   2 = Fehler (Hooks werden nicht funktionieren)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "============================================================"
echo "  Claude Code Hook Verification"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
echo ""

WARNINGS=0
ERRORS=0

# ============================================================
# 1. Settings-Datei prüfen
# ============================================================
echo "1. Checking settings file..."

# Versuche verschiedene mögliche Locations
SETTINGS_LOCAL="$PROJECT_ROOT/.claude/settings.local.json"
SETTINGS_HOME="$HOME/.claude/settings.local.json"
SETTINGS_FOUND=""

if [ -f "$SETTINGS_LOCAL" ]; then
  SETTINGS_FOUND="$SETTINGS_LOCAL"
  echo "   [OK] Settings file found: $SETTINGS_LOCAL"
elif [ -f "$SETTINGS_HOME" ]; then
  SETTINGS_FOUND="$SETTINGS_HOME"
  echo "   [OK] Settings file found: $SETTINGS_HOME"
else
  echo "   [ERROR] No settings file found!"
  echo "   Checked: $SETTINGS_LOCAL"
  echo "   Checked: $SETTINGS_HOME"
  ERRORS=$((ERRORS + 1))
fi

# ============================================================
# 2. Hooks-Konfiguration prüfen
# ============================================================
echo ""
echo "2. Checking hooks configuration..."

if [ -n "$SETTINGS_FOUND" ]; then
  # Hooks-Section vorhanden?
  if grep -q '"hooks"' "$SETTINGS_FOUND"; then
    echo "   [OK] Hooks section present"

    # Stop hooks?
    if grep -q '"Stop"' "$SETTINGS_FOUND"; then
      echo "   [OK] Stop hooks configured"

      # Timeout konfiguriert?
      if grep -q '"timeout"' "$SETTINGS_FOUND"; then
        echo "   [OK] Timeout values configured"
      else
        echo "   [WARN] No timeout values configured (default: 60s)"
        echo "         Consider adding timeout for long-running hooks"
        WARNINGS=$((WARNINGS + 1))
      fi
    else
      echo "   [WARN] No Stop hooks configured"
      WARNINGS=$((WARNINGS + 1))
    fi

    # PostToolUse hooks?
    if grep -q '"PostToolUse"' "$SETTINGS_FOUND"; then
      echo "   [OK] PostToolUse hooks configured"
    fi

    # Notification hooks?
    if grep -q '"Notification"' "$SETTINGS_FOUND"; then
      echo "   [OK] Notification hooks configured"
    fi
  else
    echo "   [WARN] No hooks section in settings"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "   [SKIP] Cannot check - no settings file"
fi

# ============================================================
# 3. Script-Executability prüfen
# ============================================================
echo ""
echo "3. Checking script executability..."

for script in ./scripts/run-tests.sh ./scripts/telegram-notify.sh ./scripts/run-typecheck.sh; do
  if [ -f "$script" ]; then
    if [ -x "$script" ]; then
      echo "   [OK] $script is executable"
    else
      echo "   [ERROR] $script is NOT executable"
      echo "         Fix: chmod +x $script"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "   [WARN] $script not found"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# ============================================================
# 4. Dependencies prüfen
# ============================================================
echo ""
echo "4. Checking dependencies..."

# npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version 2>/dev/null)
  echo "   [OK] npm available: v$NPM_VERSION"
elif [ -f "$HOME/.nvm/nvm.sh" ]; then
  echo "   [OK] nvm available (npm via nvm)"
  echo "         Note: Scripts should source nvm.sh"
else
  echo "   [WARN] npm not found in PATH"
  echo "         Tests may run in Docker instead"
  WARNINGS=$((WARNINGS + 1))
fi

# Docker
if command -v docker &> /dev/null; then
  if docker info &> /dev/null; then
    echo "   [OK] Docker available and running"
  else
    echo "   [WARN] Docker installed but not accessible"
    echo "         Check: Is Docker daemon running?"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "   [WARN] Docker not found"
  WARNINGS=$((WARNINGS + 1))
fi

# jq (für JSON-Parsing)
if command -v jq &> /dev/null; then
  echo "   [OK] jq available"
else
  echo "   [INFO] jq not available (optional)"
fi

# ============================================================
# 5. Log-Verzeichnis prüfen
# ============================================================
echo ""
echo "5. Checking log directory..."

LOG_DIR="$HOME/logs/claude"
if [ -d "$LOG_DIR" ]; then
  echo "   [OK] Log directory exists: $LOG_DIR"

  # Letzte Log-Einträge zeigen
  LOG_FILE="$LOG_DIR/stop_hooks.log"
  if [ -f "$LOG_FILE" ]; then
    LAST_ENTRY=$(tail -1 "$LOG_FILE" 2>/dev/null)
    echo "   [INFO] Last log entry:"
    echo "         $LAST_ENTRY"
  fi
else
  echo "   [INFO] Log directory will be created on first run"
fi

# ============================================================
# 6. Claude Code Version prüfen
# ============================================================
echo ""
echo "6. Checking Claude Code version..."

if command -v claude &> /dev/null; then
  VERSION=$(claude --version 2>/dev/null | head -1 || echo "unknown")
  echo "   [INFO] Claude Code version: $VERSION"

  # Warnung für bekannte problematische Versionen
  if [[ "$VERSION" == *"2.1.5"* ]]; then
    echo "   [WARN] v2.1.5 has known Stop hook bugs!"
    echo "         See: https://github.com/anthropics/claude-code/issues/17805"
    WARNINGS=$((WARNINGS + 1))
  fi
  if [[ "$VERSION" == *"2.0.76"* ]]; then
    echo "   [WARN] v2.0.76 has Stop hook output display issues"
    echo "         See: https://github.com/anthropics/claude-code/issues/16227"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "   [INFO] Claude Code not in PATH (normal for external execution)"
fi

# ============================================================
# 7. Test-Script Syntax prüfen
# ============================================================
echo ""
echo "7. Checking script syntax..."

for script in ./scripts/run-tests.sh ./scripts/telegram-notify.sh; do
  if [ -f "$script" ]; then
    if bash -n "$script" 2>/dev/null; then
      echo "   [OK] $script has valid syntax"
    else
      echo "   [ERROR] $script has syntax errors!"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# ============================================================
# 8. Infinite-Loop-Protection prüfen
# ============================================================
echo ""
echo "8. Checking infinite-loop protection..."

if [ -f "./scripts/run-tests.sh" ]; then
  if grep -q "stop_hook_active" "./scripts/run-tests.sh"; then
    echo "   [OK] Infinite-loop protection implemented"
  else
    echo "   [WARN] No infinite-loop protection detected"
    echo "         Consider adding check for stop_hook_active"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ============================================================
# Zusammenfassung
# ============================================================
echo ""
echo "============================================================"
echo "  Verification Summary"
echo "============================================================"

if [ $ERRORS -gt 0 ]; then
  echo "  [CRITICAL] $ERRORS error(s) found - hooks may not work!"
  EXIT_CODE=2
elif [ $WARNINGS -gt 0 ]; then
  echo "  [WARNING] $WARNINGS warning(s) found - review recommended"
  EXIT_CODE=1
else
  echo "  [SUCCESS] All checks passed"
  EXIT_CODE=0
fi

echo ""
echo "  Errors:   $ERRORS"
echo "  Warnings: $WARNINGS"
echo "============================================================"

# ============================================================
# Hinweise
# ============================================================
echo ""
echo "Notes:"
echo "- Stop hooks do NOT run on user interrupts (Ctrl+C, browser close)"
echo "- Stop hooks do NOT run in headless mode (-p flag)"
echo "- Check logs at: $HOME/logs/claude/stop_hooks.log"
echo ""

exit $EXIT_CODE
