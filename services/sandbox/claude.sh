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

# Bewusst NICHT `latest`: eine brandneue CLI-Version kann einen neuen
# OAuth-URL-/Rendering-Bug einschleppen (siehe Plan 015). Standard ist Anthropics
# eigener `stable`-dist-tag (bekannt-gut); per CLAUDE_CLI_VERSION exakt pinnbar.
CLAUDE_CLI_VERSION="${CLAUDE_CLI_VERSION:-stable}"

# Marker enthält die Version → ein Wechsel von CLAUDE_CLI_VERSION erzwingt eine
# Neuinstallation, ohne bestehende Installationen bei gleicher Version anzufassen.
# CLAUDE_CLI_VERSION ist eine vom Betreiber gesetzte Env (kein Nutzer-Input); ein
# Wert mit „/" würde den Marker-Pfad verschieben — bewusst nicht validiert.
MARKER="$HOME/.claude-cli-installed-${CLAUDE_CLI_VERSION}"
BIN="$NPM_CONFIG_PREFIX/bin/claude"

if [ ! -f "$MARKER" ] || [ ! -x "$BIN" ]; then
    echo "Installiere Claude Code CLI ${CLAUDE_CLI_VERSION} (einmalig) ..."
    npm install -g "@anthropic-ai/claude-code@${CLAUDE_CLI_VERSION}"
    touch "$MARKER"
fi

exec "$BIN" "$@"
