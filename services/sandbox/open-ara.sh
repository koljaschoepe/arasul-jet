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

# Default-Konfiguration für den lokalen Ollama-Endpunkt + Coder-Modell (überschreibbar).
export ARASUL_OLLAMA_URL="${ARASUL_OLLAMA_URL:-http://llm-service:11434}"
export ARASUL_MODEL="${ARASUL_MODEL:-qwen3-coder:30b}"

# Preflight gegen den lokalen KI-Dienst — ersetzt den stillen Hänger (Ollama
# blockiert sonst wortlos, wenn der Dienst nicht erreichbar oder das Modell nicht
# da ist) durch eine klare Meldung. python3 ist im Image vorhanden (kein curl-Bedarf).
# Exit 0 = ok · 2 = nicht erreichbar · 3 = Modell fehlt.
preflight() {
    python3 - "$ARASUL_OLLAMA_URL" "$ARASUL_MODEL" <<'PY'
import sys, json, urllib.request
url, model = sys.argv[1].rstrip('/'), sys.argv[2]
# Erreichbarkeit: jeder Verbindungs-/Parse-Fehler hier = "nicht erreichbar".
try:
    with urllib.request.urlopen(url + '/api/tags', timeout=4) as r:
        data = json.load(r)
except Exception:
    sys.exit(2)
# Modell-Präsenz ist nur eine Heuristik — ein unerwartetes (erreichbares!) JSON
# darf den Start NICHT blockieren, also fangen wir hier alles ab und lassen laufen.
try:
    names = [m.get('name', '') for m in data.get('models', [])]
    # Mit Tag (qwen3-coder:30b): exakt oder als Präfix (fängt Quant-Suffixe wie
    # :30b-q4 ab), OHNE die Familie (qwen3-coder-flash:7b) fälschlich zu matchen.
    # Ohne Tag (qwen3-coder): irgendeine Variante mit Doppelpunkt.
    if ':' in model:
        ok = any(n == model or n.startswith(model) for n in names)
    else:
        ok = any(n == model or n.startswith(model + ':') for n in names)
    if model and not ok:
        sys.exit(3)
except Exception:
    pass
sys.exit(0)
PY
}

echo "Prüfe lokalen KI-Dienst (${ARASUL_OLLAMA_URL}) ..."
set +e
preflight
PF=$?
set -e
if [ "$PF" -eq 2 ]; then
    echo "" >&2
    echo "✗ Der lokale KI-Dienst ist nicht erreichbar (${ARASUL_OLLAMA_URL})." >&2
    echo "  Meist läuft dieses Projekt im Netzmodus 'isolated' (nur Internet) —" >&2
    echo "  der lokale Coder braucht 'internal' (oder 'infrastructure')." >&2
    echo "  Im Dashboard: Projekt → Netzwerkmodus umstellen und neu starten." >&2
    exit 1
elif [ "$PF" -eq 3 ]; then
    echo "" >&2
    echo "✗ Modell '${ARASUL_MODEL}' ist auf dem Gerät nicht installiert." >&2
    echo "  Im Dashboard unter Modelle laden — oder ARASUL_MODEL anpassen." >&2
    exit 1
fi
echo "✓ Erreichbar. Starte den lokalen Coder — der erste Aufruf kann das Modell laden (das dauert einen Moment) ..."

if [ ! -d "$TOOLS_DIR" ] || { [ ! -e "$TOOLS_DIR/pyproject.toml" ] && [ ! -e "$TOOLS_DIR/setup.py" ]; }; then
    echo "Open-ARA-Quellen nicht gefunden — Betreiber muss data/sandbox/tools/open-ara bereitstellen." >&2
    echo "(Erwartet unter $TOOLS_DIR im Container; Host-Pfad: data/sandbox/tools/open-ara.)" >&2
    exit 1
fi

# User-Site-Install (kein sudo: die Container laufen mit no-new-privileges,
# sudo ist dort grundsätzlich blockiert). Entry-Points landen in ~/.local/bin.
export PATH="${HOME}/.local/bin:${PATH}"

if [ ! -f "$MARKER" ] || ! command -v arasul >/dev/null 2>&1; then
    echo "Installiere Open-ARA (einmalig) ..."
    # --no-deps, weil die Abhängigkeiten (textual, openai, rich) im Image
    # vorinstalliert sind; --user schreibt nach ~/.local (persistiert im
    # Container-Filesystem über stop/start).
    pip3 install --user --break-system-packages --no-deps --no-build-isolation -e "$TOOLS_DIR"
    touch "$MARKER"
fi

exec arasul "$@"
