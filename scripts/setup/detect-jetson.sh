#!/bin/bash
# =============================================================================
# Backward-compat forwarder (Plan 020, Schritt 2)
# detect-jetson.sh wurde zu detect-platform.sh. Dieser Shim haelt aeltere
# Aufrufe und Sourcing am Leben, damit kein Call-Site bricht. Neue Aufrufer
# nutzen bitte direkt detect-platform.sh.
# =============================================================================

_DETECT_PLATFORM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/detect-platform.sh"

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Direkt ausgefuehrt: an das neue Skript durchreichen.
    exec "$_DETECT_PLATFORM" "$@"
else
    # Gesourced: nur die Funktionen laden (main() feuert dort nicht beim Sourcen).
    # shellcheck source=/dev/null
    source "$_DETECT_PLATFORM"
fi
