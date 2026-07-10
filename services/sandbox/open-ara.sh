#!/bin/bash
# ============================================================================
# open-ara — Launcher für den lokalen KI-Coding-Agenten "Open-ARA" (Textual-TUI).
#
# Die Quellen werden vom Betreiber auf dem Jetson unter
#   data/sandbox/tools/open-ara
# abgelegt und vom Backend read-only nach /opt/tools/open-ara gemountet.
# Beim ersten Aufruf wird das Paket editierbar installiert (Python-Deps sind
# im Image vorinstalliert, daher --no-deps); danach wird direkt `arasul`
# gestartet. Idempotent über ein Marker-File im Home-Verzeichnis.
#
# Ollama ist nur im Netzwerkmodus 'internal' erreichbar (llm-service:11434);
# im 'isolated'-Modus schlägt der Verbindungsaufbau mit sauberem Fehler fehl.
# ============================================================================
set -euo pipefail

TOOLS_DIR="/opt/tools/open-ara"
MARKER="${HOME}/.open-ara-installed"

# Default-Konfiguration für den lokalen Ollama-Endpunkt (überschreibbar).
export ARASUL_OLLAMA_URL="${ARASUL_OLLAMA_URL:-http://llm-service:11434}"

if [ ! -d "$TOOLS_DIR" ] || { [ ! -e "$TOOLS_DIR/pyproject.toml" ] && [ ! -e "$TOOLS_DIR/setup.py" ]; }; then
    echo "Open-ARA-Quellen nicht gefunden — Betreiber muss data/sandbox/tools/open-ara bereitstellen." >&2
    echo "(Erwartet unter $TOOLS_DIR im Container; Host-Pfad: data/sandbox/tools/open-ara.)" >&2
    exit 1
fi

if [ ! -f "$MARKER" ] || ! command -v arasul >/dev/null 2>&1; then
    echo "Installiere Open-ARA (einmalig) ..."
    # sudo pip3 ist in /etc/sudoers.d/sandbox freigeschaltet; --no-deps, weil
    # die Abhängigkeiten (textual, openai, rich) im Image vorinstalliert sind.
    sudo pip3 install --break-system-packages --no-deps -e "$TOOLS_DIR"
    touch "$MARKER"
fi

exec arasul "$@"
