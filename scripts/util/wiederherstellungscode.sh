#!/bin/bash
# =============================================================================
# Der Wiederherstellungscode dieses Geraets (J37, 02.10.2026)
# =============================================================================
# Der Code ist der Sicherungsschluessel in Gruppen zu vier Zeichen. Die
# Erstausgabe nennt ihn einmal bei der Einrichtung; wer ihn damals nicht
# notiert hat (oder ein Geraet von vor J37 betreibt), liest ihn hier nach:
#
#   bash scripts/util/wiederherstellungscode.sh          zeigt den Code
#   bash scripts/util/wiederherstellungscode.sh --pruefen CODE
#                                                        passt CODE zu diesem Geraet?
#
# Das ist ein Weg am Geraet (Konsole), keiner ueber die Oberflaeche: der Code
# oeffnet jede Sicherung, und die Schnittstelle gibt ihn nicht heraus.
# Rueckgabe 0, bei --pruefen 0 nur wenn der Code passt.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHLUESSEL_DATEI="${ARASUL_SCHLUESSEL_DATEI:-${WURZEL}/config/secrets/backup_encryption_key}"
# shellcheck source=../lib/wiederherstellungscode.sh
source "${WURZEL}/scripts/lib/wiederherstellungscode.sh"

if [ ! -s "$SCHLUESSEL_DATEI" ]; then
  echo "Dieses Geraet hat keinen Sicherungsschluessel (${SCHLUESSEL_DATEI} fehlt)." >&2
  exit 1
fi
SCHLUESSEL="$(cat "$SCHLUESSEL_DATEI")"

case "${1:-}" in
  --pruefen)
    eingabe="$(schluessel_aus_code "${2:-}")"
    gross() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }
    if [ -n "$eingabe" ] && { [ "$eingabe" = "$SCHLUESSEL" ] \
         || [ "$(gross "$eingabe")" = "$(gross "$SCHLUESSEL")" ]; }; then
      exit 0
    fi
    exit 1
    ;;
  ""|--zeigen)
    echo ""
    echo "  Wiederherstellungscode dieses Geraets:"
    echo ""
    echo "      $(code_aus_schluessel "$SCHLUESSEL")"
    echo ""
    echo "  Aufschreiben und AUSSERHALB des Geraets aufbewahren."
    echo "  Ohne ihn sind die Sicherungen nach einem Werksreset oder bei"
    echo "  Geraeteverlust nicht mehr zu oeffnen."
    echo ""
    ;;
  *) echo "Aufruf: $0 [--zeigen | --pruefen CODE]" >&2; exit 2 ;;
esac
