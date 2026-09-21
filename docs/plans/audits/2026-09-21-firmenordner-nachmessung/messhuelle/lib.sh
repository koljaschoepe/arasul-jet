#!/usr/bin/env bash
# Gemeinsames der Nachmessung J33 (zweite Karte). Laeuft AM ORIN, neben dem Produkt.
#
# Schutzregel (Kolja, 21.09.2026): nichts am Produkt anfassen. Alles, was diese
# Messung anlegt, heisst `j33nach-*` (Container, Volumes, Netze) und hat eine
# RAM- und CPU-Grenze. `wacht` prueft, ob ein Container, der NICHT so heisst,
# neu gestartet wurde oder nicht mehr gesund ist -- dann bricht die Messung ab.
# Neu gegenueber der ersten Messung: `fehler_bericht` zaehlt die Fehlerzeilen im
# Log der zwei Dienste, die das Produkt nach aussen tragen (Backend, Traefik).
# Sie bricht nichts ab -- eine Zeile im Log ist kein Ausfall --, sie steht am Ende
# in der Messseite. Waehrend der Messung wurde sie NICHT aufgerufen, sondern einmal
# danach von Hand mit dem Zeitpunkt aus `.seit` (siehe MESSUNG.md, "Der Waechter").
set -euo pipefail

VORSATZ=j33nach
ERGEBNIS="${ERGEBNIS:-$HOME/j33nach/ergebnis}"
mkdir -p "$ERGEBNIS"

_fremde() {
  docker ps -a --format '{{.Names}}' | grep -v "^${VORSATZ}-" | sort | while read -r n; do
    docker inspect -f '{{.Name}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$n"
  done
}
_fehler() { # Fehlerzeilen der Logs seit dem Merken; Zeitpunkt steht in .seit
  for c in dashboard-backend reverse-proxy; do
    echo "$c $(docker logs --since "$(cat "$ERGEBNIS/.seit")" "$c" 2>&1 | grep -ciE 'error|fatal|panic' || true)"
  done
}

fehler_bericht() { _fehler; }

wacht_merken() { date -u +%Y-%m-%dT%H:%M:%SZ > "$ERGEBNIS/.seit"; _fremde > "$ERGEBNIS/.fremde-vorher"; _fehler > "$ERGEBNIS/.fehler-vorher"; }

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

# docker stats -> "<Summe MiB> <Summe CPU%> <je Container>", nur Container des Kandidaten,
# ohne Klienten (die laufen am Mac, hier nur der Dienst).
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
ram_mitschreiben() { # <kandidat> <datei>
  ( while true; do echo "$(date +%s) $(ram_jetzt "$1")" >> "$2"; sleep 2; done ) &
  echo $! > "$2.pid"
}
ram_stopp() { kill "$(cat "$1.pid")" 2>/dev/null || true; rm -f "$1.pid"; }
ram_spitze() { awk 'BEGIN{m=0;c=0} {if($2>m)m=$2; if($3>c)c=$3} END{print m" MiB Spitze, "c" % CPU Spitze ("NR" Proben)"}' "$1"; }
