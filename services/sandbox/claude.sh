#!/bin/bash
# ============================================================================
# claude — Launcher für Claude Code (Anthropic) in der Arasul-Sandbox.
#
# Muster wie open-ara.sh: Erststart installiert die CLI ohne sudo in den
# User-npm-Prefix (~/.npm-global — no-new-privileges, CapDrop ALL!),
# idempotent über ein Marker-File; danach Direktstart. Die Installation
# braucht Internetzugriff (in allen Netzwerkmodi vorhanden).
#
# Wichtig: exec über den absoluten Pfad, nicht über PATH-Lookup — dieses
# Skript liegt selbst als /usr/local/bin/claude im Image.
# ============================================================================
set -euo pipefail

export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

MARKER="$HOME/.claude-cli-installed"
BIN="$NPM_CONFIG_PREFIX/bin/claude"

if [ ! -f "$MARKER" ] || [ ! -x "$BIN" ]; then
    echo "Installiere Claude Code CLI (einmalig) ..."
    npm install -g @anthropic-ai/claude-code
    touch "$MARKER"
fi

exec "$BIN" "$@"
