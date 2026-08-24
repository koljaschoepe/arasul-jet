#!/bin/bash
# Arasul autonomer Lauf — laenger arbeitender /work-Lauf, VON HAND gestartet.
#
# WICHTIG: dieses Skript hat keine Zeitsteuerung, und das ist die Entscheidung
# vom 24.08.2026. Bis dahin lag hier eine launchd-Vorlage
# (`com.arasul.nightly.plist`, 02:30), die nie installiert war — `launchctl
# list | grep arasul` war leer, `~/Library/LaunchAgents/` existierte nicht.
# Trotzdem fuehrte die Uebergabeseite den Nachtlauf als etwas, das ohne Sitzung
# weiterlaeuft. Eine Vorlage, die niemand installiert hat, ist keine Mechanik,
# sondern eine Behauptung. Sie ist geloescht.
#
# Ein Lauf startet, weil Kolja ihn startet, und er startet erst, wenn ein
# freigegebener Plan existiert (`/plan` schreibt ihn, `/work` fuehrt ihn aus).
# Impulse kommen aus dem Steuer-Repo, der Plan entsteht HIER — Regel 7.
#
# Was der Lauf tut:
#   1. Bricht ab, wenn der Arbeitsbaum nicht sauber ist (nie ueber Tagesarbeit).
#   2. Holt frisches main.
#   3. Startet Claude Code headless mit /work --autonom (mehrere freigegebene
#      Plaene, ein Merge je Plan-Phase, Telegram-Bericht am Ende — siehe
#      .claude/skills/work/SKILL.md, "Autonomer Modus").
#   4. Prueft danach die Endpunkte live gegen das Geraet.
#   5. Protokoll: ~/logs/claude/autonom-<datum>.log; Telegram bei hartem Fehler.
#
# Starten:
#   ./scripts/util/autonom-run.sh
#
# Laenger als fuenf Stunden (ein Lauf darf ein bis zwei Tage dauern):
#   ARASUL_LAUF_STUNDEN=30 ARASUL_MAX_TURNS=2000 ./scripts/util/autonom-run.sh
#
# Die Voreinstellung sind fuenf Stunden, weil das ein Nutzungsfenster ist. Wer
# mehr setzt, teilt sich das Kontingent mit seiner eigenen Sitzung — dann
# entweder das eine oder das andere.
#
# Voraussetzungen: `claude` und `gh` im PATH, Tailscale hoch (Jetson-Verify),
# Telegram-Zugang in .env (optional, sonst nur Protokoll).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$HOME/logs/claude"
LOG_FILE="$LOG_DIR/autonom-$(date '+%Y%m%d').log"
NOTIFY="$SCRIPT_DIR/telegram-notify.sh"
MAX_SECONDS=$(( ${ARASUL_LAUF_STUNDEN:-5} * 3600 ))   # Voreinstellung 5h, siehe Kopf
MAX_TURNS=${ARASUL_MAX_TURNS:-400}

mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1
echo "===== autonom-run $(date '+%Y-%m-%d %H:%M:%S') ====="

cd "$REPO_ROOT"

# Guard 1: never run over uncommitted day work.
if [ -n "$(git status --porcelain)" ]; then
  echo "ABBRUCH: Arbeitsbaum nicht sauber — autonomer Lauf uebersprungen."
  "$NOTIFY" "Autonomer Lauf übersprungen: Working Tree ist nicht sauber (Tagesarbeit liegt uncommitted im Repo)." "Autonom" || true
  exit 0
fi

# Guard 2: start from fresh main.
git fetch origin main
git checkout main
git merge --ff-only origin/main

# Keep the Mac awake for the duration; run Claude headless.
# bypassPermissions is required for unattended gh/ssh/docker calls;
# .claude/hooks/block-destructive.sh still guards destructive commands.
set +e
caffeinate -dims -t "$MAX_SECONDS" \
  claude -p "/work --autonom" \
    --permission-mode bypassPermissions \
    --max-turns "$MAX_TURNS"
CLAUDE_EXIT=$?
set -e

echo "claude exit code: $CLAUDE_EXIT"

if [ "$CLAUDE_EXIT" -ne 0 ]; then
  "$NOTIFY" "Autonomer Lauf hart fehlgeschlagen (exit $CLAUDE_EXIT) — Log: $LOG_FILE" "Autonom" || true
fi
# Der Erfolgsfall schickt seinen Telegram-Bericht aus /work --autonom selbst.

# Die Live-Pruefung der Endpunkte. Sie gehoert hierher und nicht in die CI:
# sie braucht ein laufendes Geraet mit echter Datenbank. Genau diese Klasse von
# Fehlern findet kein Jest-Lauf, weil dort `db.query` nachgebildet ist — am
# 23.08.2026 antworteten drei Endpunkte auf JEDEM Geraet mit HTTP 500, alle
# drei von gruenen Unit-Tests gedeckt.
echo "----- Endpunkte live -----"
# Ein selbst geoeffneter Tunnel bleibt stehen. Das ist gewollt: der naechste
# Lauf benutzt ihn wieder, und ihn zu schliessen hiesse, seine PID zu raten.
if ! nc -z localhost 8443 2>/dev/null; then
  ssh -f -N -L 8443:localhost:443 jetson 2>/dev/null && sleep 2 || true
fi
if nc -z localhost 8443 2>/dev/null; then
  set +e
  python3 scripts/test/endpunkte-live.py
  ENDPUNKTE_EXIT=$?
  set -e
  if [ "$ENDPUNKTE_EXIT" -ne 0 ]; then
    "$NOTIFY" "Endpunkt-Pruefung rot: mindestens ein Endpunkt antwortet mit 5xx. Log: $LOG_FILE" "Autonom" || true
  fi
else
  # Ausdruecklich gemeldet und nicht stillschweigend uebersprungen: eine
  # Pruefung, die nicht lief, ist kein bestandener Punkt.
  echo "NICHT GELAUFEN: kein Tunnel auf 8443, das Geraet war nicht erreichbar."
  "$NOTIFY" "Endpunkt-Pruefung NICHT gelaufen: kein Tunnel auf 8443." "Autonom" || true
fi

# Das Repo auf sauberem main zuruecklassen.
git checkout main >/dev/null 2>&1 || true
echo "===== autonom-run done $(date '+%Y-%m-%d %H:%M:%S') ====="
exit "$CLAUDE_EXIT"
