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

# Eine .env und config/secrets, die fuer alle lesbar sind, wie nach einer
# Installation mit umask 022: einrichten.sh muss sie schliessen (Review
# 21.10.2026, sonst bestuende die Probe nur, weil der Test vorher aufraeumt).
mkdir -p config/secrets
chmod 0755 config/secrets
[ -f .env ] || printf 'ADMIN_PASSWORD=nur-fuer-den-besitzer\n' >.env
chmod 0644 .env
# /opt ist auf dem GitHub-Laeufer fuer alle beschreibbar (Werkzeug-Cache des
# Laeufers). Am Geraet ist es das nicht (am Orin am 21.10.2026 gemessen), und
# dort soll die Probe es melden; hier wird der Laeufer wie ein Geraet gestellt.
sudo chmod o-w /opt

echo "--- 1. einrichten, zwei Nutzer"
# Im CI kommt der „Container" von 127.0.0.1, deshalb dieses Netz.
sudo env NETZ_TERMINAL=127.0.0.1/32 bash scripts/terminal/einrichten.sh
sudo bash scripts/terminal/nutzer.sh anlegen ara-1
sudo bash scripts/terminal/nutzer.sh anlegen ara-2
for pfad in .env config/secrets; do
  if [ -n "$(find "$pfad" -maxdepth 0 -perm /o=rwx)" ]; then
    rot "$pfad ist nach einrichten.sh noch fuer andere offen ($(stat -c %a "$pfad"))"
  else
    ok "$pfad nach einrichten.sh fuer andere zu ($(stat -c %a "$pfad"))"
  fi
done

echo "--- 2. Trennungsprobe mit Netz"
python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 &
sudo python3 -m http.server 443 --bind 127.0.0.1 >/dev/null 2>&1 &
# Ein Container mit veroeffentlichtem Port 8443, wie Traefik am Geraet: ueber
# die Adresse des Laeufers im Netz geht das per DNAT, und das muss durch.
docker run -d --name terminal-probe-ziel -p 8443:80 nginx:alpine >/dev/null
sleep 3
if sudo bash scripts/terminal/trennung-pruefen.sh ara-1 --fremd ara-2; then
  ok "Trennungsprobe ara-1"
else
  rot "Trennungsprobe ara-1"
fi

echo "--- 3. der Weg des Containers: verbinde.sh"
# Eine unabhaengige Rechnung fuer den Test (hier darf das Geheimnis in der
# Befehlszeile stehen, es ist ein Wegwerf-Geheimnis im CI).
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
if grep -qx 'WER=ara-1 GRUPPEN=arasul-terminal ORT=/home/ara-1' <<<"$aus"; then
  ok "verbinde.sh landet als ara-1, nur Gruppe arasul-terminal, im eigenen Ordner"
else
  rot "verbinde.sh: $aus"
fi

echo "--- 4. gefaelschtes Siegel, fremder Nutzer"
aus="$(verbinde "ara-2:0000000000000000")"
if grep -q 'kennt diese Anmeldung nicht' <<<"$aus" && ! grep -q '^WER=' <<<"$aus"; then
  ok "falsches Siegel abgewiesen"
else
  rot "falsches Siegel: $aus"
fi
aus="$(verbinde "root:$(siegel root)")"
if grep -q 'kennt diese Anmeldung nicht' <<<"$aus" && ! grep -q '^WER=' <<<"$aus"; then
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
# Der Pfad steht ausgeschrieben: unter sudo und runuser zeigt ~ auf /root.
sudo runuser -u ara-1 -- bash -c "mkdir -p /home/ara-1/.ssh && cat >>/home/ara-1/.ssh/authorized_keys" </tmp/eigener.pub
if timeout 20 ssh -i /tmp/eigener -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null ara-1@127.0.0.1 true </dev/null >/dev/null 2>&1; then
  rot "ein selbst hingelegter Schluessel kommt herein"
else
  ok "selbst hingelegter Schluessel abgewiesen (nur /etc/arasul-terminal/schluessel zaehlt)"
fi

echo "--- 5b. das Geheimnis steht in keiner Befehlszeile"
# Jeder Prozess am Geraet ist in /proc/<pid>/cmdline lesbar, auch fuer einen
# Terminal-Nutzer. strace zeichnet jeden Programmstart von verbinde.sh auf.
geheim="$(cat "$GEHEIM/tor_geheimnis")"
echo 'exit' | TTYD_USER="ara-1:$(siegel ara-1)" TERMINAL_EINRICHTUNG="$GEHEIM" TERMINAL_HOST=127.0.0.1 \
  timeout 40 strace -f -s 4096 -e trace=execve -o /tmp/programmstarts bash services/terminal/verbinde.sh >/dev/null 2>&1 || true
starts="$(grep -c execve /tmp/programmstarts || true)"
if [ "${starts:-0}" -gt 3 ] && ! grep -qF "$geheim" /tmp/programmstarts; then
  ok "$starts Programmstarts, das Geheimnis in keinem"
else
  rot "Geheimnis in einer Befehlszeile oder keine Aufzeichnung ($starts Programmstarts)"
fi

echo "--- 6. Backend und Container rechnen dasselbe Siegel"
node_siegel="$(TERMINAL_TOR_GEHEIMNIS_FILE="$GEHEIM/tor_geheimnis" node -e "
  const t = require('./apps/dashboard-backend/src/services/terminal/terminal.js');
  const fs = require('fs');
  process.stdout.write(t.siegel('ara-1', fs.readFileSync(process.env.TERMINAL_TOR_GEHEIMNIS_FILE, 'utf8').trim()));
")"
container_siegel="$(bash -c '. services/terminal/siegel.sh; siegel ara-1 "$1"' _ "$GEHEIM/tor_geheimnis")"
if [ "$node_siegel" = "$(siegel ara-1)" ] && [ "$container_siegel" = "$node_siegel" ]; then
  ok "Siegel gleich: Backend, siegel.sh und openssl ($node_siegel)"
else
  rot "Siegel Backend $node_siegel, siegel.sh $container_siegel, openssl $(siegel ara-1)"
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
