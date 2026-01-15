#!/bin/bash
# Type-Checking für Arasul Platform
# Läuft nach jeder Edit/Write Operation (via PostToolUse Hook)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Nur bei tatsächlichen Änderungen laufen
CHANGES=$(git diff --name-only HEAD 2>/dev/null || echo "")

# ESLint für JavaScript/React (Frontend)
if echo "$CHANGES" | grep -q "services/dashboard-frontend"; then
  if [ -f "services/dashboard-frontend/node_modules/.bin/eslint" ]; then
    echo "-> ESLint Check (Frontend)..."
    cd services/dashboard-frontend
    npx eslint src/ --ext .js,.jsx --max-warnings 20 --quiet 2>/dev/null || true
    cd "$PROJECT_ROOT"
  fi
fi

# ESLint für Backend (wenn konfiguriert)
if echo "$CHANGES" | grep -q "services/dashboard-backend"; then
  if [ -f "services/dashboard-backend/.eslintrc.json" ] || [ -f "services/dashboard-backend/.eslintrc.js" ]; then
    echo "-> ESLint Check (Backend)..."
    cd services/dashboard-backend
    npx eslint src/ --ext .js --max-warnings 20 --quiet 2>/dev/null || true
    cd "$PROJECT_ROOT"
  fi
fi

# Python Type Hints Check (mypy) - optional, nur wenn installiert
if echo "$CHANGES" | grep -qE "\.py$"; then
  if command -v mypy &> /dev/null; then
    for service_dir in services/metrics-collector services/self-healing-agent services/document-indexer; do
      if echo "$CHANGES" | grep -q "$service_dir"; then
        if [ -f "$service_dir/py.typed" ] || [ -f "$service_dir/mypy.ini" ]; then
          echo "-> mypy Check ($service_dir)..."
          mypy "$service_dir" --ignore-missing-imports --no-error-summary 2>/dev/null || true
        fi
      fi
    done
  fi
fi

# Immer erfolgreich beenden (Type-Check soll nicht blockieren)
exit 0
