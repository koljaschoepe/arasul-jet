#!/bin/bash
# Dynamische Test-Erkennung für Arasul Platform
# Erkennt automatisch geänderte Services und führt passende Tests aus
# Unterstützt sowohl lokale als auch Docker-basierte Test-Ausführung

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
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
  if [ -f "apps/dashboard-backend/package.json" ]; then
    echo ""
    echo "-> Running Backend Tests (Jest)..."

    # Jest flags: no coverage for speed/memory, limit workers to prevent OOM on Jetson
    JEST_FLAGS="--passWithNoTests --maxWorkers=2"

    # Strategy: prefer local `npx jest` (fastest, watches work). Otherwise build
    # the dedicated test image (multi-stage `test` target in the backend
    # Dockerfile) — the prod container is --omit=dev so it has no jest binary.
    if check_npm; then
      cd apps/dashboard-backend
      # Die Ausgabe wird mitgeschrieben, weil zwei Befunde nicht im Rueckgabewert
      # stehen. Erstens Arbeit, die nach dem Abbau einer Testumgebung
      # weiterläuft: ein Zeitgeber aus Datei A feuert, während Datei B dran
      # ist, und was er auslöst, fällt B zur Last. Zweitens ein Arbeitsprozess,
      # der sich nicht beendet. Beides hat den Lauf lange sporadisch rot gemacht,
      # ohne dass eine einzige Zusage verletzt war (R30, 20.08.2026).
      # Die sechs X sind Pflicht: GNU-mktemp verlangt sie in der Vorlage, BSD-mktemp
      # auf dem Mac kommt auch ohne aus. Das Skript laeuft auf beidem.
      BACKEND_LOG="$(mktemp -t arasul-backend-tests.XXXXXX)"
      # Die Pipeline steht in einem `if`, und das ist kein Stil, sondern noetig:
      # das Skript laeuft mit `set -euo pipefail`. Als nackte Anweisung wuerde ein
      # roter Jest-Lauf hier sofort das ganze Skript beenden, und dann liefen
      # weder die beiden Pruefungen unten noch bei `--all` Frontend, Python und
      # die Qualitaetstore. Bedingungen sind von `set -e` ausgenommen.
      if npx jest $JEST_FLAGS 2>&1 | tee "$BACKEND_LOG"; then
        echo "   Backend tests: PASSED"
      else
        echo "   Backend tests: FAILED"
        EXIT_CODE=1
      fi
      if grep -q "after the Jest environment has been torn down" "$BACKEND_LOG"; then
        echo "   Backend tests: FAILED — es läuft Arbeit über das Ende einer Testdatei hinaus."
        echo "   Die Meldung nennt die Datei. Dort aufräumen (afterAll) oder den Dienst mocken."
        EXIT_CODE=1
      fi
      if grep -q "failed to exit gracefully" "$BACKEND_LOG"; then
        echo "   Backend tests: FAILED — ein Arbeitsprozess hat sich nicht beendet."
        echo "   Ursache finden mit: npx jest __tests__/unit --detectOpenHandles"
        EXIT_CODE=1
      fi
      rm -f "$BACKEND_LOG"
      cd "$PROJECT_ROOT"
    elif command -v docker &> /dev/null; then
      echo "   Building backend test image (--target test) ..."
      if ! docker build --target test \
          -t arasul-backend-test:latest \
          -f apps/dashboard-backend/Dockerfile . >/dev/null 2>&1; then
        echo "   Backend test image build FAILED — rerun with 'docker build --target test -f apps/dashboard-backend/Dockerfile .' to see errors"
        EXIT_CODE=1
      else
        echo "   Running tests in arasul-backend-test (maxWorkers=2, no coverage)..."
        if docker run --rm arasul-backend-test:latest npx jest $JEST_FLAGS; then
          echo "   Backend tests: PASSED"
        else
          echo "   Backend tests: FAILED"
          EXIT_CODE=1
        fi
      fi
    else
      echo "   SKIPPED: neither npm nor docker available on host"
    fi
  fi
}

# Funktion: Toter Code (Plan 023 B3)
# Laeuft immer mit, egal welche Auswahl. Eine Datei ohne Importeur ist in
# jedem Teilbereich ein Befund, und einmal von Hand aufraeumen haelt nicht.
run_gedankenstrich_check() {
  echo ""
  echo "-> Pruefe auf Gedankenstriche als Trenner..."
  if python3 "${PROJECT_ROOT}/scripts/test/gedankenstriche.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_totercode_check() {
  echo ""
  echo "-> Pruefe auf toten Code..."
  if bash "${PROJECT_ROOT}/scripts/test/toter-code.sh"; then
    echo "   Toter Code: KEINER"
  else
    echo "   Toter Code: GEFUNDEN"
    EXIT_CODE=1
  fi
}

# Funktion: Frontend-Tests
run_frontend_tests() {
  if [ -f "apps/dashboard-frontend/package.json" ]; then
    echo ""
    echo "-> Running Frontend Tests (Vitest)..."

    if check_npm; then
      cd apps/dashboard-frontend
      if npx vitest run --reporter=verbose; then
        echo "   Frontend tests: PASSED"
      else
        echo "   Frontend tests: FAILED"
        EXIT_CODE=1
      fi
      cd "$PROJECT_ROOT"
    elif docker compose ps dashboard-frontend 2>/dev/null | grep -q "Up"; then
      echo "   Running in Docker container..."
      if docker compose exec -T dashboard-frontend sh -c "npx vitest run --reporter=verbose"; then
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
#
# Bewusst NICHT blockierend, und zwar aus einem Grund, der in die Ausgabe
# gehoert: Auf dem Entwicklungsrechner fehlen die Abhaengigkeiten der Dienste
# (psycopg2, requests, docker, PyMuPDF …). Ein Fehlschlag hier heisst also
# meistens "hier nicht pruefbar", nicht "kaputt". Verbindlich geprueft wird
# Python in der CI (.github/workflows/test.yml, Job `python-services`) — dort
# sind die Abhaengigkeiten installiert und ein Fehlschlag bricht den Lauf.
#
# Was sich am 19.08.2026 geaendert hat: Vorher verschwand dieser Unterschied
# spurlos. Der Lauf meldete "ALL PASSED", obwohl `tests/unit` sich nicht einmal
# einsammeln liess. Jetzt wird das Ergebnis mitgezaehlt und im Schlussbanner
# genannt, damit niemand mehr eine Zusicherung liest, die es nicht gibt.
PYTHON_UNGEPRUEFT=0
WURZELTESTS_UNGEPRUEFT=0

run_python_tests() {
  echo ""
  echo "-> Running Python Tests (pytest, nicht blockierend — verbindlich ist die CI)..."

  # Root-Level Tests. ACHTUNG: fuer diesen Ordner gibt es KEINEN CI-Job — die
  # Matrix in .github/workflows/test.yml deckt nur die drei Dienste unter
  # services/ ab. Was hier durchfaellt, faellt nirgends sonst auf.
  if [ -d "tests/unit" ]; then
    if command -v pytest &> /dev/null; then
      echo "   Running tests/unit..."
      if pytest tests/unit -v --tb=short -q 2>/dev/null; then
        echo "   Python unit tests: PASSED"
      else
        echo "   Python unit tests: NICHT BESTANDEN oder hier nicht pruefbar"
        PYTHON_UNGEPRUEFT=$((PYTHON_UNGEPRUEFT + 1))
        WURZELTESTS_UNGEPRUEFT=1
      fi
    else
      echo "   tests/unit: UEBERSPRUNGEN (pytest nicht installiert)"
      PYTHON_UNGEPRUEFT=$((PYTHON_UNGEPRUEFT + 1))
      WURZELTESTS_UNGEPRUEFT=1
    fi
  fi

  # Service-spezifische Python-Tests — discover all services with tests/ dirs
  for service_dir in services/*/; do
    if [ -d "${service_dir}tests" ]; then
      echo "   Running ${service_dir} tests..."
      cd "$PROJECT_ROOT/$service_dir"
      if command -v pytest &> /dev/null; then
        if pytest tests/ -v --tb=short -q 2>/dev/null; then
          echo "   ${service_dir}: PASSED"
        else
          echo "   ${service_dir}: NICHT BESTANDEN oder nicht pruefbar (siehe CI)"
          PYTHON_UNGEPRUEFT=$((PYTHON_UNGEPRUEFT + 1))
        fi
      elif docker compose ps "$(basename "$service_dir")" 2>/dev/null | grep -q "Up\|running"; then
        if docker compose exec -T "$(basename "$service_dir")" pytest tests/ -v --tb=short -q 2>/dev/null; then
          echo "   ${service_dir}: PASSED"
        else
          echo "   ${service_dir}: NICHT BESTANDEN oder nicht pruefbar (siehe CI)"
          PYTHON_UNGEPRUEFT=$((PYTHON_UNGEPRUEFT + 1))
        fi
      else
        echo "   SKIPPED: pytest not available and container not running"
        PYTHON_UNGEPRUEFT=$((PYTHON_UNGEPRUEFT + 1))
      fi
      cd "$PROJECT_ROOT"
    fi
  done
}

# Funktion: E2E-Tests (Playwright)
run_e2e_tests() {
  if [ -d "apps/dashboard-frontend/e2e" ]; then
    echo ""
    echo "-> Running E2E Tests (Playwright)..."

    if check_npm; then
      cd apps/dashboard-frontend
      if npx playwright test --reporter=list 2>/dev/null; then
        echo "   E2E tests: PASSED"
      else
        echo "   E2E tests: FAILED"
        EXIT_CODE=1
      fi
      cd "$PROJECT_ROOT"
    else
      echo "   SKIPPED: npm not available for Playwright"
    fi
  fi
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
RUN_QUALITY=false
RUN_E2E=false

arg="${1:-}"
if [ "$arg" = "--all" ] || [ "$arg" = "-a" ]; then
  RUN_ALL=true
elif [ "$arg" = "--backend" ] || [ "$arg" = "-b" ]; then
  RUN_BACKEND=true
elif [ "$arg" = "--frontend" ] || [ "$arg" = "-f" ]; then
  RUN_FRONTEND=true
elif [ "$arg" = "--python" ] || [ "$arg" = "-p" ]; then
  RUN_PYTHON=true
elif [ "$arg" = "--quality" ] || [ "$arg" = "-q" ]; then
  RUN_QUALITY=true
elif [ "$arg" = "--e2e" ] || [ "$arg" = "-e" ]; then
  RUN_E2E=true
fi

# Funktion: Quality Gates (Design System + Code Quality)
run_quality_gates() {
  echo ""
  echo "-> Running Quality Gates (Design System + Code Quality)..."
  if node "$SCRIPT_DIR/check-design-system.js" && node "$SCRIPT_DIR/check-code-quality.js"; then
    echo "   Quality gates: PASSED"
  else
    echo "   Quality gates: FAILED"
    EXIT_CODE=1
  fi
}

# Toter Code laeuft immer, unabhaengig von der Auswahl.
run_totercode_check
run_gedankenstrich_check

# Hauptlogik: Welche Tests laufen?
if [ "$RUN_ALL" = true ]; then
  echo "Running all tests..."
  run_backend_tests
  run_frontend_tests
  run_python_tests
  run_quality_gates
elif [ "$RUN_BACKEND" = true ]; then
  run_backend_tests
elif [ "$RUN_FRONTEND" = true ]; then
  run_frontend_tests
elif [ "$RUN_PYTHON" = true ]; then
  run_python_tests
elif [ "$RUN_QUALITY" = true ]; then
  run_quality_gates
elif [ "$RUN_E2E" = true ]; then
  run_e2e_tests
else
  # Auto-Detection basierend auf Änderungen
  CHANGES=$(detect_changes)
  RAN_TESTS=false

  if echo "$CHANGES" | grep -q "apps/dashboard-backend"; then
    run_backend_tests
    RAN_TESTS=true
  fi

  if echo "$CHANGES" | grep -q "apps/dashboard-frontend"; then
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
if [ $EXIT_CODE -ne 0 ]; then
  echo "  Test Run Complete - SOME FAILURES"
elif [ "$PYTHON_UNGEPRUEFT" -gt 0 ]; then
  echo "  Test Run Complete - blockierende Tests bestanden"
  echo "  ACHTUNG: $PYTHON_UNGEPRUEFT Python-Suite(n) nicht bestanden oder hier nicht pruefbar."
  echo "  Fuer services/* ist die CI verbindlich (Job 'Python · <dienst>')."
  if [ "$WURZELTESTS_UNGEPRUEFT" -eq 1 ]; then
    echo "  Fuer tests/unit gibt es KEINEN CI-Job — dort prueft niemand nach."
  fi
else
  echo "  Test Run Complete - ALL PASSED"
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
