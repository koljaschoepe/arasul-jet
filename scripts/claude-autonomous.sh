#!/bin/bash
# Claude Autonomous Session Manager
# Startet eine tmux-Session für autonomes Arbeiten

set -e

# Konfiguration
PROJECT_DIR="${1:-$(pwd)}"
LOG_DIR="$HOME/logs/claude"
SESSION_NAME="claude-auto"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Hilfe-Text
show_help() {
  echo "Usage: $0 [PROJECT_DIR] [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --help, -h     Show this help"
  echo "  --attach, -a   Start and immediately attach to session"
  echo "  --kill, -k     Kill existing session"
  echo "  --status, -s   Show session status"
  echo ""
  echo "Examples:"
  echo "  $0                    # Start in current directory"
  echo "  $0 ~/arasul/arasul-jet  # Start in specific directory"
  echo "  $0 --attach           # Start and attach"
  echo "  $0 --kill             # Kill existing session"
}

# Session-Status prüfen
check_status() {
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}Session '$SESSION_NAME' is running${NC}"
    echo ""
    echo "Commands:"
    echo "  Attach:  tmux attach -t $SESSION_NAME"
    echo "  Kill:    tmux kill-session -t $SESSION_NAME"
    return 0
  else
    echo -e "${RED}Session '$SESSION_NAME' is not running${NC}"
    return 1
  fi
}

# Session beenden
kill_session() {
  if tmux kill-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}Session '$SESSION_NAME' killed${NC}"
  else
    echo -e "${RED}Session '$SESSION_NAME' not found${NC}"
  fi
}

# Argument-Parsing
ATTACH_MODE=false
case "${1:-}" in
  --help|-h)
    show_help
    exit 0
    ;;
  --status|-s)
    check_status
    exit $?
    ;;
  --kill|-k)
    kill_session
    exit 0
    ;;
  --attach|-a)
    ATTACH_MODE=true
    shift
    PROJECT_DIR="${1:-$(pwd)}"
    ;;
esac

# Logging vorbereiten
mkdir -p "$LOG_DIR"
LOGFILE="$LOG_DIR/session-$TIMESTAMP.log"

echo -e "${BLUE}=======================================================${NC}"
echo -e "${BLUE}  Claude Autonomous Session Setup${NC}"
echo -e "${BLUE}=======================================================${NC}"
echo ""

# Prüfen ob tmux installiert ist
if ! command -v tmux &> /dev/null; then
  echo -e "${RED}Error: tmux is not installed${NC}"
  echo "Install with: sudo apt install tmux"
  exit 1
fi

# Prüfen ob claude installiert ist
if ! command -v claude &> /dev/null; then
  echo -e "${RED}Error: claude CLI is not installed${NC}"
  exit 1
fi

# Bestehende Session beenden
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "Killing existing session..."
  tmux kill-session -t "$SESSION_NAME"
fi

# Neue tmux Session starten
echo "Creating new session..."
tmux new-session -d -s "$SESSION_NAME" -c "$PROJECT_DIR"

# Claude Code mit Instruktionen starten
CLAUDE_PROMPT='Lies tasks.md und arbeite alle Tasks unter Priority 1 ab.

Fuer jeden Task:
1. Implementiere die Aenderung
2. Fuehre passende Tests aus (npm test / pytest)
3. Bei gruenen Tests: git add . && git commit -m "[Task-Beschreibung]"
4. Hake den Task in tasks.md ab
5. Fahre mit dem naechsten Task fort

Bei blockierenden Problemen:
- Dokumentiere in docs/blockers.md
- Fuehre aus: ./scripts/telegram-notify.sh "BLOCKER: [Beschreibung]"
- Stoppe die Session

Arbeite bis alle Priority-1-Tasks erledigt sind.'

tmux send-keys -t "$SESSION_NAME" "claude -p '$CLAUDE_PROMPT' 2>&1 | tee '$LOGFILE'" Enter

echo ""
echo -e "${GREEN}Session gestartet!${NC}"
echo ""
echo "  Session:  $SESSION_NAME"
echo "  Projekt:  $PROJECT_DIR"
echo "  Logfile:  $LOGFILE"
echo ""
echo "Befehle:"
echo "  Attach:   tmux attach -t $SESSION_NAME"
echo "  Detach:   Ctrl+B, dann D"
echo "  Kill:     tmux kill-session -t $SESSION_NAME"
echo "  Status:   $0 --status"
echo ""
echo -e "${BLUE}=======================================================${NC}"

# Start-Notification senden (falls konfiguriert)
if [ -x "$PROJECT_DIR/scripts/telegram-notify.sh" ]; then
  "$PROJECT_DIR/scripts/telegram-notify.sh" "Claude Autonomous Session gestartet" 2>/dev/null || true
fi

# Bei --attach sofort verbinden
if [ "$ATTACH_MODE" = true ]; then
  echo ""
  echo "Attaching to session..."
  sleep 1
  tmux attach -t "$SESSION_NAME"
fi
