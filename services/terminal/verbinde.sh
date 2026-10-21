#!/bin/bash
# Eine Verbindung: der Entwickler landet per ssh als SEIN Linux-Nutzer am
# Geraet (Karte terminal-im-frontend, M5). ttyd ruft das je Browserfenster auf
# und setzt TTYD_USER aus der Kopfzeile der Tuer: `ara-<id>:<siegel>`.
#
# Das Siegel sind die ersten 16 Hex-Zeichen von HMAC-SHA256(Geheimnis,
# `ara-<id>`) (Backend: services/terminal/terminal.js). Es zaehlt, weil jeder
# Prozess am Geraet diesen Container im Docker-Netz erreicht und die
# Kopfzeile selbst schreiben koennte; das Geheimnis hat er nicht.
set -uo pipefail

ORDNER="${TERMINAL_EINRICHTUNG:-/run/terminal}"
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

geheim="$(cat "$ORDNER/tor_geheimnis")"
erwartet="$(printf '%s' "$nutzer" | openssl dgst -sha256 -hmac "$geheim" -r | cut -c1-16)"
[ "$erwartet" = "$gesiegelt" ] || abweisen

ssh -t \
  -i /tmp/schluessel \
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

# 255 ist der Fehler von ssh selbst: kein Nutzer, kein Schluessel, sshd weist ab.
if [ "$code" -eq 255 ]; then
  echo
  echo "Für Sie ist am Gerät noch kein Zugang eingerichtet ($nutzer)."
  echo "Bitten Sie die Verwaltung, ihn anzulegen:"
  echo "  sudo ./scripts/terminal/nutzer.sh anlegen $nutzer"
  sleep 30
fi
exit "$code"
