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
if grep -q '"stop_hook_active":true' <<<"$HOOK_INPUT"; then
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

# Funktion: Gedankenstriche als Trenner (Plan 023 B6)
# Laeuft immer mit, egal welche Auswahl.
run_gedankenstrich_check() {
  echo ""
  echo "-> Pruefe auf Gedankenstriche als Trenner..."
  if python3 "${PROJECT_ROOT}/scripts/test/gedankenstriche.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Der Faden (hoechstens ein Plan in docs/plans/active/)
# Laeuft immer mit. Am 20.08.2026 lagen dort vier Eintraege, drei aus der Zeit
# vor dem laufenden Plan, und CLAUDE.md nannte als "den einen Faden" eine Seite,
# die den laufenden Plan gar nicht kennt. Seit dem 26.08.2026 liegt der laufende
# Plan im Ueberordner; leer ist deshalb gruen, zwei bleiben rot.
run_faden_check() {
  echo ""
  echo "-> Pruefe den Faden (hoechstens ein Plan in docs/plans/active/)..."
  if python3 "${PROJECT_ROOT}/scripts/test/plan-faden.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Selbsttest der Waechter
# Ein Waechter, den niemand prueft, meldet irgendwann Ruhe, ohne dass es
# auffaellt. Zweimal passiert, beide Male spaet gefunden.
run_selbsttest_check() {
  if bash "${PROJECT_ROOT}/scripts/test/waechter-selbsttest.sh"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Baustein-Set (Plan 023 C1 und C2)
# Laeuft immer mit. Vor Phase C fand dieser Waechter 39 Stellen, an denen ein
# Seitenkopf, eine Feldgruppe oder eine Tab-Leiste von Hand gebaut war.
run_bausteine_check() {
  echo ""
  echo "-> Pruefe das Baustein-Set..."
  if python3 "${PROJECT_ROOT}/scripts/test/bausteine.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Marken (Phase D7)
# Laeuft immer mit. Das Designsystem hat zwei Ausgaenge und eine Quelle: die
# Shell uebersetzt `packages/marken/src/` selbst, eine App laedt das
# eingecheckte Buendel `browser/marken.js`. Eine Kopie veraltet lautlos.
run_marken_check() {
  echo ""
  echo "-> Pruefe das Designsystem..."
  if python3 "${PROJECT_ROOT}/scripts/test/marken.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Namensregister (Plan 023 D1)
# Laeuft immer mit. Ein Modellname darf nur ueber modellAnzeigeName in die
# Oberflaeche, sonst sagt der Chat "Gemma", wo der Katalog "Gemma 4 Kompakt"
# sagt. Genau so stand es am 20.08.2026 auf dem Geraet.
run_modellnamen_check() {
  echo ""
  echo "-> Pruefe das Namensregister..."
  if python3 "${PROJECT_ROOT}/scripts/test/modellnamen.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Kurzliste (Phase C8)
# Laeuft immer mit. Die vier Modelle stehen in config/modelle/kurzliste.json und
# muessen an fuenf weiteren Stellen dasselbe sagen -- Migration, Empfehlungskarte,
# Plattformprofile, Setup-Skript, Aufraeum-Skript. Vor dieser Phase drifteten
# genau diese Stellen: acht von siebzehn Kennungen der Empfehlungskarte gab es
# im Katalog gar nicht.
run_kurzliste_check() {
  echo ""
  echo "-> Pruefe die Kurzliste..."
  if python3 "${PROJECT_ROOT}/scripts/test/kurzliste.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Einheiten (Plan 023 D4)
# Laeuft immer mit. Im Produkt standen fuenf Rechnungen fuer Bytegroessen, und
# eine Kachel zeigte dadurch "261 MB" in der Kopfzeile und "~274 MB" im Text
# darunter, fuer dieselbe Datei.
run_einheiten_check() {
  echo ""
  echo "-> Pruefe die Einheiten..."
  if python3 "${PROJECT_ROOT}/scripts/test/einheiten.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Durchreichung der Stellschrauben (Plan 023 E1)
# Laeuft immer mit. Eine dokumentierte Umgebungsvariable, die compose/ nicht
# durchreicht, erreicht den Container nie; der Code faellt still auf seinen
# Vorgabewert zurueck. Gefunden an FLOW_LLM_TIMEOUT_MS, das seit Monaten in der
# Dokumentation steht und auf dem Geraet nichts bewirkt.
run_durchreichung_check() {
  echo ""
  echo "-> Pruefe die Durchreichung der Stellschrauben..."
  if python3 "${PROJECT_ROOT}/scripts/test/durchreichung.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Jede Bind-Quelle unter data/ muss vorher angelegt sein. Legt Docker sie an,
# gehoert sie root, und der Container (uid 1000) kann nicht hinein schreiben.
run_datenordner_check() {
  echo ""
  echo "-> Pruefe, ob jeder gemountete Datenordner vorher angelegt wird..."
  if python3 "${PROJECT_ROOT}/scripts/test/datenordner.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Eine neue Tabelle, die im Werksreset nicht eingeordnet ist, blockiert ihn auf
# JEDEM Geraet. Gemerkt hat das bisher nur der Pruefstand, und den faehrt
# niemand nebenbei hoch.
# Der Rollback im Deploy meldete unbedingt Erfolg, auch wenn kein Schritt
# geklappt hatte. Auf dem kritischsten Pfad des Geraets.
run_rollback_meldung_check() {
  echo ""
  echo "-> Pruefe, ob der Deploy-Rollback die Wahrheit ueber sich sagt..."
  if bash "${PROJECT_ROOT}/scripts/test/rollback-meldung.sh"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_werksreset_tabellen_check() {
  echo ""
  echo "-> Pruefe, ob jede Tabelle im Werksreset eingeordnet ist..."
  if python3 "${PROJECT_ROOT}/scripts/test/werksreset-tabellen.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Derselbe Begriff von "Zustand", von der anderen Seite: was der Werksreset
# loescht, traegt die Uebernahme beim Update mit. Faellt ein Pfad aus der
# einen Liste, laesst ein Artefakt-Update ihn im alten Verzeichnis liegen --
# waehrend die Datenbank ueber den festen Projektnamen mitkommt.
run_zustand_check() {
  echo ""
  echo "-> Pruefe, ob die Uebernahme traegt, was der Reset loescht..."
  if python3 "${PROJECT_ROOT}/scripts/test/zustand.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Drei Waechter liefen bisher NUR in der CI. Wer lokal `run-tests.sh` aufruft,
# sah sie nicht — und ein Zug, der die CI umgeht (Weboberflaeche, --no-verify,
# ein Workflow, der selbst committet), sieht sie dann gar nicht. Am 24.08.2026
# beim Durchzaehlen aufgefallen: von 58 Skripten in scripts/test/ standen
# `pfadfilter.py`, `routenregeln.py` und `stiller-tod.py` nur auf einer der
# beiden Seiten.
run_pfadfilter_check() {
  echo ""
  echo "-> Pruefe die Pfadfilter..."
  if python3 "${PROJECT_ROOT}/scripts/test/pfadfilter.py" --pfad "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_routenregeln_check() {
  echo ""
  echo "-> Pruefe Regel 1 (asyncHandler, keine nackten Fehler in Routen)..."
  if python3 "${PROJECT_ROOT}/scripts/test/routenregeln.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_rollenregeln_check() {
  echo ""
  echo "-> Pruefe, ob jede Route ihre Rolle prueft (Phase C1)..."
  if python3 "${PROJECT_ROOT}/scripts/test/rollenregeln.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_stiller_tod_check() {
  echo ""
  echo "-> Pruefe auf Zuweisungen, die ein Skript wortlos beenden..."
  if python3 "${PROJECT_ROOT}/scripts/test/stiller-tod.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Der Schwesterfall zum stillen Tod: dort traegt `pipefail` eine 1 aus der Pipe
# heraus (grep hat nichts gefunden), hier eine 141 (der Verbraucher stieg aus,
# der Erzeuger schrieb weiter). Am 27.08.2026 hat das den CI-Job
# "Migrationskette" drei Minuten warten und dann "nein" melden lassen, obwohl
# die Kette nach sechs Sekunden durch war.
run_rohrbruch_check() {
  echo ""
  echo "-> Pruefe auf Rohre, die beim ersten Treffer zerreissen..."
  if python3 "${PROJECT_ROOT}/scripts/test/rohrbruch.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Die dritte aus derselben Familie: nicht der Wert einer Pipe, sondern die
# Reihenfolge der Ersetzung. `local a="$1" b="$a"` loest `$a` auf, bevor
# `local` ueberhaupt laeuft -- unter `set -u` das Ende des Skripts. Am
# 27.08.2026 hat das die Abnahme des Deploy-Endpunkts am Orin im ersten
# Schritt angehalten.
run_eigenbezug_check() {
  echo ""
  echo "-> Pruefe auf local-Zeilen, die sich auf sich selbst beziehen..."
  if python3 "${PROJECT_ROOT}/scripts/test/eigenbezug.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Die vierte aus derselben Familie, 28.08.2026: nicht der Rueckgabewert,
# sondern der Pfad. Ein Skript in `scripts/validate/` ging nur EINE Ebene hoch,
# sein `PROJECT_ROOT` zeigte damit auf `scripts/`, und der Bootstrap suchte
# `scripts/docker-compose.yml`. Auf einem Arbeitsgeraet faellt das nie auf, auf
# jedem frischen sofort.
# 28.08.2026, Phase G1: `backup-service` stand im Compose, sein Image war
# gebaut, der Container war nie angelegt -- ein frisch installiertes Geraet kam
# ohne Sicherung hoch. Vier Listen nennen die Dienste, und ausgerechnet die,
# die den Bootstrap steuert, war die falsche.
run_dienste_check() {
  echo ""
  echo "-> Pruefe, ob jeder Dienst des Compose beim Bootstrap hochfaehrt..."
  if python3 "${PROJECT_ROOT}/scripts/test/dienste.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_wurzelpfad_check() {
  echo ""
  echo "-> Pruefe, ob jedes Skript sein Wurzelverzeichnis richtig ausrechnet..."
  if python3 "${PROJECT_ROOT}/scripts/test/wurzelpfad.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

run_endpunkte_check() {
  echo ""
  echo "-> Pruefe, ob jeder Endpunkt eine Beschreibung hat..."
  if python3 "${PROJECT_ROOT}/scripts/test/endpunkte.py" --wurzel "${PROJECT_ROOT}"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: README und CLAUDE.md gegen den Code (Plan 023 K3)
# Prosa bleibt Handarbeit. Geprueft wird, was still falsch wird, ohne dass es
# jemand merkt: Links ins Leere, Pfade, die gewandert sind, Befehle, die es
# nicht mehr gibt, und Dienste hinter einem compose-Profil, die als laufend
# beschrieben werden.
run_anleitungen_check() {
  echo ""
  echo "-> Pruefe README und CLAUDE.md gegen den Code..."
  if python3 "${PROJECT_ROOT}/scripts/test/anleitungen.py"; then
    :
  else
    EXIT_CODE=1
  fi
}

# Funktion: Toter Code (Plan 023 B3)
# Laeuft immer mit, egal welche Auswahl. Eine Datei ohne Importeur ist in
# jedem Teilbereich ein Befund, und einmal von Hand aufraeumen haelt nicht.
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
    elif grep -q "Up" <<<"$(docker compose ps dashboard-frontend 2>/dev/null)"; then
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
      elif grep -q "Up\|running" <<<"$(docker compose ps "$(basename "$service_dir")" 2>/dev/null)"; then
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
run_bausteine_check
run_marken_check
run_modellnamen_check
run_kurzliste_check
run_einheiten_check
run_durchreichung_check
run_datenordner_check
run_werksreset_tabellen_check
run_zustand_check
run_rollback_meldung_check
run_pfadfilter_check
run_routenregeln_check
run_rollenregeln_check
run_stiller_tod_check
run_rohrbruch_check
run_eigenbezug_check
run_wurzelpfad_check
run_dienste_check
run_endpunkte_check
run_anleitungen_check
run_faden_check
run_selbsttest_check

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
else
  # Auto-Detection basierend auf Änderungen
  CHANGES=$(detect_changes)
  RAN_TESTS=false

  if grep -q "apps/dashboard-backend" <<<"$CHANGES"; then
    run_backend_tests
    RAN_TESTS=true
  fi

  if grep -q "apps/dashboard-frontend" <<<"$CHANGES"; then
    run_frontend_tests
    RAN_TESTS=true
  fi

  if grep -qE "(services/.*\.py|tests/)" <<<"$CHANGES"; then
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
