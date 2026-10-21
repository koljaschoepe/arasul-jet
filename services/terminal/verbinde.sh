#!/bin/bash
# Eine Verbindung: der Entwickler landet per ssh als SEIN Linux-Nutzer am
# Geraet (Karte terminal-im-frontend, M5). ttyd ruft das je Browserfenster auf
# und setzt TTYD_USER aus der Kopfzeile der Tuer: `ara-<id>:<siegel>`.
#
# Das Siegel sind die ersten 16 Hex-Zeichen von HMAC-SHA256(Geheimnis,
# `ara-<id>`) (Backend: services/terminal/terminal.js, hier: siegel.sh). Es
# zaehlt, weil jeder Prozess am Geraet diesen Container im Docker-Netz
# erreicht und die Kopfzeile selbst schreiben koennte; das Geheimnis hat er
# nicht. Verglichen wird nicht in konstanter Zeit: wer raten will, braucht je
# Versuch eine Verbindung und wartet danach fuenf Sekunden.
set -uo pipefail

ORDNER="${TERMINAL_EINRICHTUNG:-/run/terminal}"
# shellcheck source=siegel.sh
. "$(dirname "${BASH_SOURCE[0]}")/siegel.sh"

wert="${TTYD_USER:-}"
nutzer="${wert%%:*}"
gesiegelt="${wert#*:}"

abweisen() {
  echo "Das Terminal kennt diese Anmeldung nicht."
  sleep 5
  exit 1
}

[[ "$nutzer" =~ ^ara-[1-9][0-9]{0,7}$ ]] || abweisen
[[ "$gesiegelt" =~ ^[0-9a-f]{16}$ ]] || abweisen
[ "$(siegel "$nutzer" "$ORDNER/tor_geheimnis")" = "$gesiegelt" ] || abweisen

ssh -t \
  -i "${TERMINAL_SCHLUESSEL:-/tmp/schluessel}" \
  -o IdentitiesOnly=yes \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$ORDNER/known_hosts" \
  -o ConnectTimeout=10 \
  -o ServerAliveInterval=30 \
  -o LogLevel=ERROR \
  -p "${TERMINAL_SSH_PORT:-22}" \
  "$nutzer@${TERMINAL_HOST:-host.docker.internal}"
code=$?

# 255 ist der Fehler von ssh selbst; die Zeile darueber sagt, welcher. Meist
# fehlt der Zugang, nach einer Neuinstallation des Geraets kann es auch der
# Schluessel des Geraets sein (dann einrichten.sh noch einmal).
if [ "$code" -eq 255 ]; then
  echo
  echo "Die Verbindung zum Gerät kam nicht zustande (siehe die Zeile darüber)."
  echo "Meist fehlt Ihr Zugang am Gerät ($nutzer). Bitten Sie die Verwaltung:"
  echo "  sudo ./scripts/terminal/nutzer.sh anlegen $nutzer"
  sleep 30
fi
exit "$code"
