#!/bin/bash
# ============================================================================
# codex — Launcher für die OpenAI-Codex-CLI in der Arasul-Sandbox.
#
# Muster wie claude.sh/open-ara.sh: Erststart installiert die CLI ohne sudo
# in den User-npm-Prefix (~/.npm-global), idempotent über ein Marker-File;
# danach Direktstart. exec über absoluten Pfad (dieses Skript liegt selbst
# als /usr/local/bin/codex im Image).
# ============================================================================
set -euo pipefail

export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

MARKER="$HOME/.codex-cli-installed"
BIN="$NPM_CONFIG_PREFIX/bin/codex"

if [ ! -f "$MARKER" ] || [ ! -x "$BIN" ]; then
    echo "Installiere OpenAI Codex CLI (einmalig) ..."
    npm install -g @openai/codex
    touch "$MARKER"
fi

exec "$BIN" "$@"
