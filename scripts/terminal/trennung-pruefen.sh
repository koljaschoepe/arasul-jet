#!/bin/bash
# =============================================================================
# Trennungsprobe der Terminal-Nutzer (Karte terminal-im-frontend, M5, 21.10.2026)
# =============================================================================
#   sudo ./scripts/terminal/trennung-pruefen.sh <nutzer> [--fremd <nutzer>]... [--ohne-netz]
#
# Prueft ALS dieser Nutzer (runuser), was die Abnahme verlangt: ein fremder
# Ordner, docker und sudo werden abgewiesen, der eigene Ordner ist
# schreibbar. Dazu die Geheimnisse der Installation, Schreiben ausserhalb des
# eigenen Ordners und, ohne `--ohne-netz`, die Firewall: jeder Dienst, der am
# Geraet lauscht, ist zu ausser DNS und den Ports der Oberflaeche, und kein
# Container ist direkt erreichbar.
#
# Jede Zeile nennt Erwartung und Ergebnis; am Ende eine Summe. Rueckgabe 0
# nur, wenn alles wie erwartet war. Laeuft am Geraet und im CI
# (.github/workflows/test.yml, Job „Terminal: Trennung").
#
# `--fremd` ist der Ordner eines anderen Menschen (Vorgabe: jeder andere
# Ordner unter /home). `--ohne-netz` laesst die Firewall aus, fuer ein
# Geraet, auf dem `einrichten.sh` noch nicht lief; die Summe sagt das dann.
# =============================================================================
set -uo pipefail

WURZEL="${ARASUL_WURZEL:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ERLAUBT="${TERMINAL_ERLAUBTE_PORTS:-80 443 8443}"

[ "$(id -u)" -eq 0 ] || {
  echo "Bitte mit sudo aufrufen."
  exit 2
}
NUTZER="${1:-}"
shift || true
[ -n "$NUTZER" ] && id "$NUTZER" >/dev/null 2>&1 || {
  echo "Aufruf: trennung-pruefen.sh <nutzer> [--fremd <nutzer>]... [--ohne-netz]"
  exit 2
}
FREMDE=()
NETZ=1
while [ $# -gt 0 ]; do
  case "$1" in
    --fremd)
      FREMDE+=("$2")
      shift 2
      ;;
    --ohne-netz)
      NETZ=0
      shift
      ;;
    *)
      echo "Unbekannt: $1"
      exit 2
      ;;
  esac
done
HEIM="$(getent passwd "$NUTZER" | cut -d: -f6)"
if [ ${#FREMDE[@]} -eq 0 ]; then
  for d in /home/*; do
    [ -d "$d" ] && [ "$d" != "$HEIM" ] && FREMDE+=("$(basename "$d")")
  done
fi

GUT=0
SCHLECHT=0
als() { runuser -u "$NUTZER" -- env -i HOME="$HEIM" PATH=/usr/local/bin:/usr/bin:/bin bash -c "$1" >/dev/null 2>&1; }
zeile() { printf '%-6s %-58s %s\n' "$1" "$2" "$3"; }
abgewiesen() { # <beschreibung> <befehl>
  if als "$2"; then
    zeile ROT "$1" "ging durch"
    SCHLECHT=$((SCHLECHT + 1))
  else
    zeile ok "$1" "abgewiesen"
    GUT=$((GUT + 1))
  fi
}
erlaubt() { # <beschreibung> <befehl>
  if als "$2"; then
    zeile ok "$1" "geht"
    GUT=$((GUT + 1))
  else
    zeile ROT "$1" "geht nicht"
    SCHLECHT=$((SCHLECHT + 1))
  fi
}
verbindung() { echo "timeout 3 bash -c 'exec 3<>/dev/tcp/$1/$2'"; }

echo "Trennungsprobe fuer $NUTZER ($(id "$NUTZER")), $(date -u +%Y-%m-%dT%H:%M:%SZ), $(hostname)"
echo

echo "Eigener Ordner"
erlaubt "schreiben in $HEIM" "touch '$HEIM/.trennungsprobe' && rm '$HEIM/.trennungsprobe'"

echo "Fremde Ordner"
for f in "${FREMDE[@]}"; do
  fheim="$(getent passwd "$f" | cut -d: -f6 || true)"
  [ -n "$fheim" ] || fheim="/home/$f"
  [ -d "$fheim" ] || continue
  abgewiesen "lesen: ls $fheim" "ls '$fheim'"
  abgewiesen "schreiben: touch $fheim/x" "touch '$fheim/.trennungsprobe'"
done

echo "Docker"
if [ -S /var/run/docker.sock ]; then
  # Wer in den Socket schreiben darf, steuert Docker und damit das Geraet.
  abgewiesen "Docker-Socket beschreibbar" "test -w /var/run/docker.sock"
  if command -v docker >/dev/null 2>&1; then
    abgewiesen "docker ps" "docker ps"
  fi
else
  zeile "-" "Docker-Socket" "gibt es hier nicht"
fi

echo "sudo und Gruppen"
abgewiesen "sudo -n true" "sudo -n true"
abgewiesen "sudo -l (Rechte auflisten)" "sudo -n -l"
abgewiesen "in Gruppe sudo, docker, adm, admin oder wheel" 'grep -qwE "sudo|docker|adm|admin|wheel" <<<"$(id -Gn)"'
abgewiesen "su root" "echo | timeout 5 su -c true root"

echo "Installation und System"
abgewiesen "lesen: $WURZEL/config/secrets" "ls '$WURZEL/config/secrets'"
if [ -e "$WURZEL/.env" ]; then
  abgewiesen "lesen: $WURZEL/.env" "cat '$WURZEL/.env'"
fi
abgewiesen "schreiben in $WURZEL" "touch '$WURZEL/.trennungsprobe'"
abgewiesen "schreiben in /etc" "touch /etc/.trennungsprobe"
abgewiesen "schreiben in /opt" "touch /opt/.trennungsprobe"
abgewiesen "lesen: /etc/shadow" "cat /etc/shadow"
abgewiesen "lesen: /etc/arasul-terminal/schluessel (andere Zugaenge aendern)" "touch /etc/arasul-terminal/schluessel/.trennungsprobe"

if [ "$NETZ" -eq 1 ]; then
  echo "Netz (Firewall der Gruppe)"
  if ! iptables -w -S ARASUL_TERMINAL >/dev/null 2>&1; then
    zeile ROT "Kette ARASUL_TERMINAL" "fehlt (einrichten.sh)"
    SCHLECHT=$((SCHLECHT + 1))
  fi
  # Die Adresse des Geraets im Netz: dorthin geht `arasul.mjs call` gegen den
  # Namen des Geraets, und dort schreibt Docker das Ziel per DNAT um, bevor
  # die Firewall es sieht. Ein Dienst auf 0.0.0.0 wird deshalb zweimal
  # geprueft, auf 127.0.0.1 und hier.
  netzadresse="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  pruefe_dienst() { # <ziel> <port>
    if [[ " $ERLAUBT " == *" $2 "* ]]; then
      erlaubt "Geraet $1:$2 (Oberflaeche)" "$(verbindung "$1" "$2")"
    else
      abgewiesen "Geraet $1:$2" "$(verbindung "$1" "$2")"
    fi
  }
  # Jeder Dienst, der am Geraet auf TCP lauscht.
  while read -r adresse port; do
    [ -n "$port" ] || continue
    [ "$port" = 53 ] && continue
    case "$adresse" in
      0.0.0.0 | '*' | '[::]' | '::')
        pruefe_dienst 127.0.0.1 "$port"
        [ -n "$netzadresse" ] && pruefe_dienst "$netzadresse" "$port"
        ;;
      *:*) ;; # nur IPv6, hier nicht einzeln
      *) pruefe_dienst "$adresse" "$port" ;;
    esac
  done < <(ss -ltnH | awk '{print $4}' | sed -E 's/%[^:]*//; s/^(.*):([0-9]+)$/\1 \2/' | sort -u)
  # Container direkt (ihre Adressen in den Docker-Netzen). Nur Ziele, die
  # root von hier aus erreicht: sonst hiesse „abgewiesen" nur, dass dort
  # niemand lauscht.
  if command -v docker >/dev/null 2>&1; then
    n=0
    while read -r ip port; do
      [ -n "$port" ] || continue
      timeout 3 bash -c "exec 3<>/dev/tcp/$ip/$port" 2>/dev/null || continue
      abgewiesen "Container $ip:$port direkt" "$(verbindung "$ip" "$port")"
      n=$((n + 1))
      [ "$n" -ge 8 ] && break
    done < <(docker ps -q 2>/dev/null | xargs -r docker inspect -f '{{$p := ""}}{{range $k, $v := .Config.ExposedPorts}}{{$p = $k}}{{end}}{{range .NetworkSettings.Networks}}{{.IPAddress}} {{$p}}{{"\n"}}{{end}}' 2>/dev/null | sed -E 's#/(tcp|udp)$##' | grep -E '^[0-9.]+ [0-9]+$' | sort -u)
  fi
fi

echo
echo "Summe: $GUT wie erwartet, $SCHLECHT nicht.$([ "$NETZ" -eq 0 ] && echo ' Netz nicht geprueft (--ohne-netz).')"
[ "$SCHLECHT" -eq 0 ]
