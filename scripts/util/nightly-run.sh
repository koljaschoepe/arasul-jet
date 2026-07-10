#!/bin/bash
# Arasul nightly run — executes the approved plan queue + repo chores overnight.
#
# What it does:
#   1. Refuses to run if the working tree is dirty (never trample day work).
#   2. Checks out fresh main.
#   3. Runs Claude Code headless with /work --nightly (up to 3 approved plans,
#      then Dependabot bucket-triage + PR sweep; Telegram summary at the end —
#      see .claude/skills/work/SKILL.md, "Nightly mode specifics").
#   4. Logs to ~/logs/claude/nightly-<date>.log; Telegram on hard failure.
#
# Install (macOS, launchd — runs at 02:30 if the Mac is awake/plugged in):
#   cp scripts/util/com.arasul.nightly.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.arasul.nightly.plist
# Uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.arasul.nightly.plist
# Manual test run:
#   ./scripts/util/nightly-run.sh
#
# Requirements: `claude` and `gh` on PATH (plist sets PATH explicitly),
# Tailscale up (Jetson verify), Telegram creds in .env (optional, logs otherwise).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$HOME/logs/claude"
LOG_FILE="$LOG_DIR/nightly-$(date '+%Y%m%d').log"
NOTIFY="$SCRIPT_DIR/telegram-notify.sh"
MAX_SECONDS=$(( 5 * 3600 ))   # hard cap: 5h

mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1
echo "===== nightly-run $(date '+%Y-%m-%d %H:%M:%S') ====="

cd "$REPO_ROOT"

# Guard 1: never run over uncommitted day work.
if [ -n "$(git status --porcelain)" ]; then
  echo "ABORT: working tree dirty — skipping nightly run."
  "$NOTIFY" "Nightly übersprungen: Working Tree ist nicht sauber (Tagesarbeit liegt uncommitted im Repo)." "Nightly" || true
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
  claude -p "/work --nightly" \
    --permission-mode bypassPermissions \
    --max-turns 400
CLAUDE_EXIT=$?
set -e

echo "claude exit code: $CLAUDE_EXIT"

if [ "$CLAUDE_EXIT" -ne 0 ]; then
  "$NOTIFY" "Nightly-Run hart fehlgeschlagen (exit $CLAUDE_EXIT) — Log: $LOG_FILE" "Nightly" || true
fi
# Success path sends its own Telegram summary from inside /work --nightly.

# Leave the repo on clean main for the morning.
git checkout main >/dev/null 2>&1 || true
echo "===== nightly-run done $(date '+%Y-%m-%d %H:%M:%S') ====="
exit "$CLAUDE_EXIT"
