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

# Bewusst NICHT `latest`: Codex hat keinen `stable`-dist-tag, und eine
# brandneue (evtl. alpha/beta) CLI kann Login-/Rendering-Regressionen bringen.
# Standard ist eine konkrete, bekannt-gute Version; per CODEX_CLI_VERSION
# überschreibbar. CODEX_CLI_VERSION ist Betreiber-Env (kein Nutzer-Input).
CODEX_CLI_VERSION="${CODEX_CLI_VERSION:-0.146.0}"

MARKER="$HOME/.codex-cli-installed-${CODEX_CLI_VERSION}"
BIN="$NPM_CONFIG_PREFIX/bin/codex"

if [ ! -f "$MARKER" ] || [ ! -x "$BIN" ]; then
    echo "Installiere OpenAI Codex CLI ${CODEX_CLI_VERSION} (einmalig) ..."
    npm install -g "@openai/codex@${CODEX_CLI_VERSION}"
    touch "$MARKER"
fi

exec "$BIN" "$@"
