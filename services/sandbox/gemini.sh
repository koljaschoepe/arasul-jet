#!/bin/bash
# ============================================================================
# gemini — Launcher für die Google-Gemini-CLI in der Arasul-Sandbox.
#
# Muster wie claude.sh/open-ara.sh: Erststart installiert die CLI ohne sudo
# in den User-npm-Prefix (~/.npm-global), idempotent über ein Marker-File;
# danach Direktstart. exec über absoluten Pfad (dieses Skript liegt selbst
# als /usr/local/bin/gemini im Image).
# ============================================================================
set -euo pipefail

export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"

MARKER="$HOME/.gemini-cli-installed"
BIN="$NPM_CONFIG_PREFIX/bin/gemini"

if [ ! -f "$MARKER" ] || [ ! -x "$BIN" ]; then
    echo "Installiere Google Gemini CLI (einmalig) ..."
    npm install -g @google/gemini-cli
    touch "$MARKER"
fi

exec "$BIN" "$@"
