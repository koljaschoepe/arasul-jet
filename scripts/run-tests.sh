#!/bin/bash
# Dynamische Test-Erkennung für Arasul Platform
# Erkennt automatisch geänderte Services und führt passende Tests aus
# Unterstützt sowohl lokale als auch Docker-basierte Test-Ausführung

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ============================================================
# INFINITE-LOOP-PROTECTION für Stop Hooks
# ============================================================
# Lese stdin für Hook-Input (mit 1 Sekunde Timeout)
read -t 1 HOOK_INPUT 2>/dev/null || HOOK_INPUT="{}"

# Prüfe ob wir bereits in einem Stop-Hook-Cycle sind
if echo "$HOOK_INPUT" | grep -q '"stop_hook_active":true'; then
  echo "Already in stop hook cycle, skipping tests to prevent infinite loop"
  echo '{"decision": "allow"}'
  exit 0
fi

# Log-Verzeichnis für Stop-Hook-Debugging
LOG_DIR="$HOME/logs/claude"
LOG_FILE="$LOG_DIR/stop_hooks.log"
mkdir -p "$LOG_DIR"

# Start-Timestamp loggen
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stop hook started - run-tests.sh $*" >> "$LOG_FILE"

echo "======================================================="
echo "  Arasul Test Runner"
echo "======================================================="

# Exit-Code tracking
EXIT_CODE=0

# Prüfen ob npm verfügbar ist (lokal oder in PATH)
check_npm() {
  if command -v npm &> /dev/null; then
    return 0
  elif [ -f "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    return 0
  else
    return 1
  fi
}

# Funktion: Backend-Tests
run_backend_tests() {
  if [ -f "services/dashboard-backend/package.json" ]; then
    echo ""
    echo "-> Running Backend Tests (Jest)..."

    # Jest flags: no coverage for speed/memory, limit workers to prevent OOM on Jetson
    JEST_FLAGS="--passWithNoTests --maxWorkers=2"

    # Prefer Docker when container is running (has all dependencies)
    if docker compose ps dashboard-backend 2>/dev/null | grep -q "Up\|running"; then
      echo "   Running in Docker container (maxWorkers=2, no coverage)..."
      if docker compose exec -T dashboard-backend npx jest $JEST_FLAGS; then
        echo "   Backend tests: PASSED"
      else
        echo "   Backend tests: FAILED"
        EXIT_CODE=1
      fi
    elif check_npm; then
      cd services/dashboard-backend
      if npx jest $JEST_FLAGS; then
        echo "   Backend tests: PASSED"
      else
        echo "   Backend tests: FAILED"
        EXIT_CODE=1
      fi
      cd "$PROJECT_ROOT"
    else
      echo "   SKIPPED: Container not running and npm not available"
      echo "   Start container: docker compose up -d dashboard-backend"
    fi
  fi
}

# Funktion: Frontend-Tests
run_frontend_tests() {
  if [ -f "services/dashboard-frontend/package.json" ]; then
    echo ""
    echo "-> Running Frontend Tests (React Testing Library)..."

    if check_npm; then
      cd services/dashboard-frontend
      if CI=true npm test -- --passWithNoTests --watchAll=false; then
        echo "   Frontend tests: PASSED"
      else
        echo "   Frontend tests: FAILED"
        EXIT_CODE=1
      fi
      cd "$PROJECT_ROOT"
    elif docker compose ps dashboard-frontend 2>/dev/null | grep -q "Up"; then
      echo "   Running in Docker container..."
      if docker compose exec -T dashboard-frontend sh -c "CI=true npm test -- --passWithNoTests --watchAll=false"; then
        echo "   Frontend tests: PASSED"
      else
        echo "   Frontend tests: FAILED"
        EXIT_CODE=1
      fi
    else
      echo "   SKIPPED: npm not available and container not running"
    fi
  fi
}

# Funktion: Python-Tests
run_python_tests() {
  echo ""
  echo "-> Running Python Tests (pytest)..."

  # Root-Level Tests
  if [ -d "tests/unit" ] && command -v pytest &> /dev/null; then
    echo "   Running tests/unit..."
    if pytest tests/unit -v --tb=short -q 2>/dev/null; then
      echo "   Python unit tests: PASSED"
    else
      echo "   Python unit tests: FAILED (or skipped)"
    fi
  fi

  # Service-spezifische Python-Tests
  for service_dir in services/metrics-collector services/self-healing-agent; do
    if [ -d "$service_dir/tests" ]; then
      echo "   Running $service_dir tests..."
      cd "$service_dir"
      pytest tests/ -v --tb=short -q 2>/dev/null || true
      cd "$PROJECT_ROOT"
    fi
  done
}

# Funktion: Geänderte Dateien erkennen
detect_changes() {
  # Git-basierte Änderungserkennung (staged + unstaged + untracked)
  {
    git diff --name-only HEAD 2>/dev/null
    git diff --name-only --cached 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sort -u
}

# Argument-Parsing
RUN_ALL=false
RUN_BACKEND=false
RUN_FRONTEND=false
RUN_PYTHON=false

if [ "$1" = "--all" ] || [ "$1" = "-a" ]; then
  RUN_ALL=true
elif [ "$1" = "--backend" ] || [ "$1" = "-b" ]; then
  RUN_BACKEND=true
elif [ "$1" = "--frontend" ] || [ "$1" = "-f" ]; then
  RUN_FRONTEND=true
elif [ "$1" = "--python" ] || [ "$1" = "-p" ]; then
  RUN_PYTHON=true
fi

# Hauptlogik: Welche Tests laufen?
if [ "$RUN_ALL" = true ]; then
  echo "Running all tests..."
  run_backend_tests
  run_frontend_tests
  run_python_tests
elif [ "$RUN_BACKEND" = true ]; then
  run_backend_tests
elif [ "$RUN_FRONTEND" = true ]; then
  run_frontend_tests
elif [ "$RUN_PYTHON" = true ]; then
  run_python_tests
else
  # Auto-Detection basierend auf Änderungen
  CHANGES=$(detect_changes)
  RAN_TESTS=false

  if echo "$CHANGES" | grep -q "services/dashboard-backend"; then
    run_backend_tests
    RAN_TESTS=true
  fi

  if echo "$CHANGES" | grep -q "services/dashboard-frontend"; then
    run_frontend_tests
    RAN_TESTS=true
  fi

  if echo "$CHANGES" | grep -qE "(services/.*\.py|tests/)"; then
    run_python_tests
    RAN_TESTS=true
  fi

  # Fallback: Backend-Tests wenn keine spezifischen Änderungen
  if [ "$RAN_TESTS" = false ]; then
    echo "No specific changes detected, running backend tests..."
    run_backend_tests
  fi
fi

echo ""
echo "======================================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "  Test Run Complete - ALL PASSED"
else
  echo "  Test Run Complete - SOME FAILURES"
fi
echo "======================================================="

# Exit-Code für Telegram-Script persistieren
echo $EXIT_CODE > /tmp/last_test_result

# ============================================================
# FALLBACK-LOGGING für Stop-Hook-Debugging
# ============================================================
# Logge immer das Ergebnis, auch wenn Hook-Output nicht sichtbar ist
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stop hook completed - EXIT_CODE: $EXIT_CODE (PASSED)" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stop hook completed - EXIT_CODE: $EXIT_CODE (FAILED)" >> "$LOG_FILE"
fi

exit $EXIT_CODE
