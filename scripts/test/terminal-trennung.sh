#!/bin/bash
# =============================================================================
# Terminal: Trennung, einmal ganz (Karte terminal-im-frontend, M5, 21.10.2026)
# =============================================================================
# Laeuft im CI auf einem frischen Ubuntu mit sudo, sshd und Docker
# (.github/workflows/test.yml, Job „Terminal: Trennung"). Nicht am Geraet:
# es richtet Gruppe, sshd-Regel und Firewall ein und baut sie wieder ab.
#
# Was belegt wird, in dieser Reihenfolge:
#   1. einrichten.sh und zwei Nutzer ara-1, ara-2
#   2. die Trennungsprobe fuer ara-1 MIT Netz: fremder Ordner (ara-2), docker,
#      sudo abgewiesen; ein Dienst auf 127.0.0.1:8099 und ein Container
#      abgewiesen, 443 erreichbar
#   3. der Weg des Containers: verbinde.sh mit gueltigem Siegel landet per
#      ssh als ara-1, nur in der Gruppe arasul-terminal, im eigenen Ordner
#   4. ein gefaelschtes Siegel und ein fremder Nutzer kommen nicht durch
#   5. sshd laesst keine Weiterleitung zu (-W) und keinen Schluessel, den der
#      Nutzer sich selbst hinlegt
#   6. Backend und Container rechnen dasselbe Siegel
#   7. entfernen nimmt Nutzer und Ordner weg
# =============================================================================
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"
GEHEIM="$WURZEL/config/secrets/terminal"
FEHLER=0
ok() { echo "ok    $*"; }
rot() {
  echo "ROT   $*"
  FEHLER=1
}

aufraeumen() {
  sudo bash scripts/terminal/nutzer.sh entfernen ara-1 >/dev/null 2>&1 || true
  sudo bash scripts/terminal/nutzer.sh entfernen ara-2 >/dev/null 2>&1 || true
  sudo bash scripts/terminal/einrichten.sh --abbauen >/dev/null 2>&1 || true
  docker rm -f terminal-probe-ziel >/dev/null 2>&1 || true
  sudo pkill -f 'http.server 443' 2>/dev/null || true
  pkill -f 'http.server 8099' 2>/dev/null || true
}
trap aufraeumen EXIT

# Was die Probe sehen soll: eine .env mit Geheimnis, nur fuer den Besitzer.
mkdir -p config/secrets
chmod 0700 config/secrets
[ -f .env ] || printf 'ADMIN_PASSWORD=nur-fuer-den-besitzer\n' >.env
chmod 0600 .env

echo "--- 1. einrichten, zwei Nutzer"
# Im CI kommt der „Container" von 127.0.0.1, deshalb dieses Netz.
sudo env NETZ_TERMINAL=127.0.0.1/32 bash scripts/terminal/einrichten.sh
sudo bash scripts/terminal/nutzer.sh anlegen ara-1
sudo bash scripts/terminal/nutzer.sh anlegen ara-2

echo "--- 2. Trennungsprobe mit Netz"
python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 &
sudo python3 -m http.server 443 --bind 127.0.0.1 >/dev/null 2>&1 &
docker run -d --name terminal-probe-ziel nginx:alpine >/dev/null
sleep 3
if sudo bash scripts/terminal/trennung-pruefen.sh ara-1 --fremd ara-2; then
  ok "Trennungsprobe ara-1"
else
  rot "Trennungsprobe ara-1"
fi

echo "--- 3. der Weg des Containers: verbinde.sh"
siegel() { printf '%s' "$1" | openssl dgst -sha256 -hmac "$(cat "$GEHEIM/tor_geheimnis")" -r | cut -c1-16; }
# known_hosts nennt host.docker.internal; im CI heisst der Host 127.0.0.1.
zeile="$(sed 's/^host.docker.internal /127.0.0.1 /' "$GEHEIM/known_hosts")"
printf '%s\n' "$zeile" >>"$GEHEIM/known_hosts"
install -m 0600 "$GEHEIM/schluessel" /tmp/schluessel
verbinde() { # <TTYD_USER>
  echo 'echo "WER=$(id -un) GRUPPEN=$(id -Gn) ORT=$(pwd)"; exit' |
    TTYD_USER="$1" TERMINAL_EINRICHTUNG="$GEHEIM" TERMINAL_HOST=127.0.0.1 \
      timeout 40 bash services/terminal/verbinde.sh 2>&1 || true
}
aus="$(verbinde "ara-1:$(siegel ara-1)")"
echo "$aus" | grep -E '^WER=' || true
if echo "$aus" | grep -qx 'WER=ara-1 GRUPPEN=arasul-terminal ORT=/home/ara-1'; then
  ok "verbinde.sh landet als ara-1, nur Gruppe arasul-terminal, im eigenen Ordner"
else
  rot "verbinde.sh: $aus"
fi

echo "--- 4. gefaelschtes Siegel, fremder Nutzer"
aus="$(verbinde "ara-2:0000000000000000")"
if echo "$aus" | grep -q 'kennt diese Anmeldung nicht' && ! echo "$aus" | grep -q '^WER='; then
  ok "falsches Siegel abgewiesen"
else
  rot "falsches Siegel: $aus"
fi
aus="$(verbinde "root:$(siegel root)")"
if echo "$aus" | grep -q 'kennt diese Anmeldung nicht' && ! echo "$aus" | grep -q '^WER='; then
  ok "root mit gueltigem Siegel abgewiesen (kein ara-<id>)"
else
  rot "root: $aus"
fi

echo "--- 5. sshd: keine Weiterleitung, kein selbst hingelegter Schluessel"
SSH=(ssh -i /tmp/schluessel -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$GEHEIM/known_hosts" -o ConnectTimeout=10)
if timeout 20 "${SSH[@]}" -W 127.0.0.1:8099 ara-1@127.0.0.1 </dev/null >/dev/null 2>&1; then
  rot "ssh -W (Weiterleitung) ging durch"
else
  ok "ssh -W (Weiterleitung) abgewiesen"
fi
ssh-keygen -q -t ed25519 -N '' -f /tmp/eigener
sudo runuser -u ara-1 -- bash -c "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys" </tmp/eigener.pub
if timeout 20 ssh -i /tmp/eigener -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null ara-1@127.0.0.1 true </dev/null >/dev/null 2>&1; then
  rot "ein selbst hingelegter Schluessel kommt herein"
else
  ok "selbst hingelegter Schluessel abgewiesen (nur /etc/arasul-terminal/schluessel zaehlt)"
fi

echo "--- 6. Backend und Container rechnen dasselbe Siegel"
node_siegel="$(TERMINAL_TOR_GEHEIMNIS_FILE="$GEHEIM/tor_geheimnis" node -e "
  const t = require('./apps/dashboard-backend/src/services/terminal/terminal.js');
  const fs = require('fs');
  process.stdout.write(t.siegel('ara-1', fs.readFileSync(process.env.TERMINAL_TOR_GEHEIMNIS_FILE, 'utf8').trim()));
")"
if [ "$node_siegel" = "$(siegel ara-1)" ]; then
  ok "Siegel gleich ($node_siegel)"
else
  rot "Siegel Backend $node_siegel, Container $(siegel ara-1)"
fi

echo "--- 7. entfernen"
sudo bash scripts/terminal/nutzer.sh entfernen ara-2
if id ara-2 >/dev/null 2>&1 || [ -e /home/ara-2 ] || [ -e /etc/arasul-terminal/schluessel/ara-2 ]; then
  rot "ara-2 ist noch da"
else
  ok "ara-2 samt Ordner und Zugang entfernt"
fi

echo
if [ "$FEHLER" -eq 0 ]; then echo "Terminal: Trennung gruen."; else echo "Terminal: Trennung ROT."; fi
exit "$FEHLER"
