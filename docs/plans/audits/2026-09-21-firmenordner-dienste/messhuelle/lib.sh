#!/usr/bin/env bash
# Gemeinsames der Messung J33. Laeuft AM ORIN, neben dem Produkt.
#
# Schutzregel (Kolja, 21.09.2026): nichts am Produkt anfassen. Alles, was diese
# Messung anlegt, heisst `j33mess-*` (Container, Volumes, Netze, Abbild des
# Klienten) und hat eine RAM-Grenze. Vor und nach jedem Schritt prueft `wacht`,
# ob ein Container, der NICHT so heisst, neu gestartet wurde oder nicht mehr
# gesund ist -- dann bricht die Messung ab.
set -euo pipefail

VORSATZ=j33mess
ERGEBNIS="${ERGEBNIS:-$HOME/j33mess/ergebnis}"
mkdir -p "$ERGEBNIS"

# Zustand aller fremden Container: Name, Startzeit, Neustarts, Gesundheit.
_fremde() {
  docker ps -a --format '{{.Names}}' | grep -v "^${VORSATZ}-" | sort | while read -r n; do
    docker inspect -f '{{.Name}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$n"
  done
}

wacht_merken() { _fremde > "$ERGEBNIS/.fremde-vorher"; }

wacht() {
  _fremde > "$ERGEBNIS/.fremde-jetzt"
  if ! diff -q "$ERGEBNIS/.fremde-vorher" "$ERGEBNIS/.fremde-jetzt" >/dev/null; then
    echo "ABBRUCH: ein Container ausserhalb der Messung hat sich veraendert:" >&2
    diff "$ERGEBNIS/.fremde-vorher" "$ERGEBNIS/.fremde-jetzt" >&2 || true
    exit 99
  fi
}

# Lage des Geraets als Block fuer die Messseite.
lage() {
  echo "### $1 ($(date '+%d.%m.%Y %H:%M:%S'))"
  echo '```'
  free -m
  echo
  df -h / | sed 1d
  echo
  docker ps --format 'table {{.Names}}\t{{.Status}}'
  echo '```'
}

# RAM der Messcontainer eines Kandidaten, in MiB, Summe und je Container.
# docker stats nennt "123.4MiB / 2GiB" oder "1.2GiB / ...".
ram_jetzt() {
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' \
    | grep "^${VORSATZ}-$1" | python3 -c '
import sys, re
def mib(s):
    z, e = re.match(r"([\d.]+)(\w+)", s).groups()
    return float(z) * {"B": 1/1048576, "KiB": 1/1024, "MiB": 1, "GiB": 1024}[e]
summe = 0; cpu = 0; teile = []
for z in sys.stdin:
    n, m, _, _, c = z.split()
    summe += mib(m); cpu += float(c.rstrip("%")); teile.append(f"{n}={mib(m):.0f}")
print(f"{summe:.0f} {cpu:.0f} " + ",".join(teile))'
}

# Im Hintergrund alle 2 s mitschreiben: <epoche> <MiB> <CPU%> <je Container>
ram_mitschreiben() { # <kandidat> <datei>
  ( while true; do echo "$(date +%s) $(ram_jetzt "$1")" >> "$2"; sleep 2; done ) &
  echo $! > "$2.pid"
}
ram_stopp() { kill "$(cat "$1.pid")" 2>/dev/null || true; rm -f "$1.pid"; }
ram_spitze() { awk 'BEGIN{m=0;c=0} {if($2>m)m=$2; if($3>c)c=$3} END{print m" MiB Spitze, "c" % CPU Spitze ("NR" Proben)"}' "$1"; }

# Belegter Platz eines Volumes in MB (liest ueber das Klienten-Abbild).
volumen_mb() {
  docker run --rm --memory 256m --name "${VORSATZ}-du-$$" -v "$1":/v:ro ${VORSATZ}-client:1 du -sm /v | cut -f1
}
