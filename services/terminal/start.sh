#!/bin/bash
# Startet ttyd unter /terminal/ (Karte terminal-im-frontend, M5).
#
# Ohne Einrichtung am Geraet (`sudo ./scripts/terminal/einrichten.sh`) gibt es
# keinen Schluessel und kein Geheimnis; dann endet der Container mit einem
# Satz, statt eine Tuer zu oeffnen, hinter der nichts geht.
set -euo pipefail

ORDNER="${TERMINAL_EINRICHTUNG:-/run/terminal}"
for datei in schluessel known_hosts tor_geheimnis; do
  if [ ! -s "$ORDNER/$datei" ] || [ ! -r "$ORDNER/$datei" ]; then
    echo "Das Terminal ist am Geraet nicht eingerichtet: $ORDNER/$datei fehlt oder ist nicht lesbar."
    echo "Einrichten: sudo ./scripts/terminal/einrichten.sh (docs/features/TERMINAL.md)."
    exit 1
  fi
done

# ssh nimmt den Schluessel nur, wenn niemand sonst ihn lesen kann.
install -m 0600 "$ORDNER/schluessel" /tmp/schluessel

# --auth-header   der Nutzer kommt aus der Kopfzeile, die die Tuer
#                 (Forward-Auth) setzt; ohne sie antwortet ttyd 401. Eine
#                 mitgeschickte gleichnamige Kopfzeile loescht Traefik, bevor
#                 er die Antwort der Tuer einsetzt.
# --check-origin  nur Verbindungen, deren Origin zum Host passt (ein
#                 WebSocket kennt keine CORS-Pruefung).
# --writable      ttyd ist seit 1.7 sonst nur zum Zusehen.
# --ping-interval alle 30 s ein Ping, damit eine stille Sitzung offen bleibt.
# --max-clients   hoechstens so viele Terminals zugleich am Geraet.
exec /usr/local/bin/ttyd \
  --port 7681 \
  --base-path /terminal \
  --auth-header X-Arasul-Terminal-Nutzer \
  --check-origin \
  --writable \
  --ping-interval 30 \
  --max-clients "${TERMINAL_HOECHSTENS:-20}" \
  --client-option titleFixed=Terminal \
  --client-option disableLeaveAlert=true \
  --client-option "fontSize=${TERMINAL_SCHRIFTGROESSE:-14}" \
  /usr/local/bin/verbinde.sh
