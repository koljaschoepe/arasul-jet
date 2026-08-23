#!/bin/bash
# =============================================================================
# Wie viel Luft haben die Healthchecks bis zu ihrem Timeout?
# =============================================================================
# Der Anlass, 23.08.2026: n8n wurde nachts um 00:59 ungesund, waehrend auf
# demselben Geraet der Pruefstand baute. n8n hat zwei Sekunden
# Healthcheck-Timeout, und der Verdacht lag nahe, dass das unter Build-Last
# nicht reicht.
#
# Der Verdacht liess sich im Leerlauf NICHT belegen: n8n antwortet dort in
# 42 Millisekunden, das sind 2 Prozent seines Timeouts. Alle fuenfzehn Dienste
# lagen zwischen 0 und 7 Prozent. Deshalb wurde kein einziger Timeout
# geaendert — was nicht belegt kaputt ist, wird nicht repariert.
#
# Interessant wird die Messung erst unter Last. Ein Deploy ist die groesste
# Lastquelle des Geraets, also: dieses Skript starten, dann deployen lassen,
# danach auswerten. `docker inspect` haelt nur die letzten fuenf Proben je
# Container vor, deshalb wird regelmaessig abgeholt und dupliziert abgelegt.
#
# Aufruf:
#   scripts/test/healthcheck-luft.sh hoch [stunden]    Vorgabe: 1
#   scripts/test/healthcheck-luft.sh stand             Auswertung
#   scripts/test/healthcheck-luft.sh weg               anhalten
#
# Die Grenzen liest die Auswertung aus `docker inspect`, nicht aus einer
# Tabelle in dieser Datei. Eine abgeschriebene Grenze waere beim naechsten
# Compose-Zug falsch.
# =============================================================================
set -uo pipefail

HOST="${ARASUL_SSH:-jetson}"
FERN="${ARASUL_GERAET_PFAD:-/home/arasul/arasul/arasul-jet}"
PROJEKT="${ARASUL_COMPOSE_PROJEKT:-arasul-platform}"
PROTOKOLL="${FERN}/logs/health-dauer.log"
LAEUFER="/tmp/healthcheck-luft.sh"
PIDDATEI="/tmp/healthcheck-luft.pid"
STUNDEN="${2:-1}"

case "${1:-}" in
  hoch)
    if ssh -n "$HOST" "test -f ${PIDDATEI} && kill -0 \$(cat ${PIDDATEI}) 2>/dev/null"; then
      echo "Laeuft bereits. Stand:  $0 stand"
      exit 0
    fi
    # Ohne `-n`, weil das Skript ueber die Standardeingabe kommt.
    ssh "$HOST" "cat > ${LAEUFER}" <<FERNSKRIPT
#!/bin/bash
AUS="${PROTOKOLL}"
mkdir -p "\$(dirname "\$AUS")"
ENDE=\$(( \$(date +%s) + ${STUNDEN} * 3600 ))
while [ "\$(date +%s)" -lt "\$ENDE" ]; do
  for c in \$(docker ps --filter label=com.docker.compose.project=${PROJEKT} --format '{{.Names}}'); do
    # Je Probe EINE Zeile mit | als Trenner. Der erste Wurf haengte die Proben
    # durch Leerzeichen aneinander — und Go schreibt Zeitstempel als
    # "2026-08-23 22:27:10.756 +0200 CEST", also mit Leerzeichen darin. Die
    # Zeile liess sich danach nicht mehr eindeutig zerlegen.
    docker inspect "\$c" --format "{{range .State.Health.Log}}\$c|{{.Start}}|{{.End}}|{{.ExitCode}}{{println}}{{end}}" 2>/dev/null
  done >> "\$AUS"
  sleep 45
done
FERNSKRIPT
    ssh -n "$HOST" "chmod +x ${LAEUFER} && nohup ${LAEUFER} >/dev/null 2>&1 & echo \$! > ${PIDDATEI}; sleep 1"
    echo "Messe ${STUNDEN} h. Protokoll: ${PROTOKOLL}"
    echo "Fuer den Lasttest jetzt einen Deploy laufen lassen, dann:  $0 stand"
    ;;

  stand)
    grenzen=$(ssh -n "$HOST" "for c in \$(docker ps --filter label=com.docker.compose.project=${PROJEKT} --format '{{.Names}}'); do echo \"\$c \$(docker inspect \$c --format '{{if .Config.Healthcheck}}{{.Config.Healthcheck.Timeout}}{{else}}0{{end}}')\"; done")
    export GRENZEN="$grenzen"
    ssh -n "$HOST" "cat ${PROTOKOLL} 2>/dev/null" | python3 -c '
import sys, collections, re, os
grenze = {}
for zeile in os.environ.get("GRENZEN", "").splitlines():
    t = zeile.split()
    if len(t) == 2:
        m = re.match(r"([0-9.]+)([a-z]+)", t[1])
        if m:
            f = {"ns": 1e-9, "us": 1e-6, "ms": 1e-3, "s": 1, "m0s": 60}
            wert = float(m.group(1))
            grenze[t[0]] = wert * f.get(m.group(2), 1)

def zeit(s):
    # Go gibt "2026-08-23 22:17:21.858645144 +0200 CEST" aus, ISO kann das nicht.
    d, u = s.split()[0], s.split()[1]
    h, mi, se = u.split(":")
    return int(h) * 3600 + int(mi) * 60 + float(se[:9])

daten = collections.defaultdict(set)
fehl = collections.Counter()
for zeile in sys.stdin:
    t = zeile.strip().split("|")
    if len(t) != 4:
        continue
    name = t[0]
    try:
        a, e = zeit(t[1]), zeit(t[2])
    except Exception:
        continue
    if e < a:
        e += 86400
    # Als Menge, nicht als Liste: `docker inspect` haelt die letzten fuenf
    # Proben vor, und bei 45 s Takt sehen wir dieselbe Probe mehrfach.
    probe = (t[1], round(e - a, 4))
    # Dieselbe Probe kommt mehrfach an: `docker inspect` haelt die letzten
    # fuenf vor, abgefragt wird alle 45 Sekunden. Die Dauern lagen deshalb
    # schon immer in einer Menge — die Fehlschlaege aber wurden bei jedem
    # Wiedersehen erneut gezaehlt. n8n stand mit "3" da, obwohl es zwei
    # Fehlschlaege waren (24.08.2026).
    if probe not in daten[name]:
        daten[name].add(probe)
        if t[3] != "0":
            fehl[name] += 1

if not daten:
    print("Noch keine Messwerte.")
    sys.exit(0)

kopf = ("Dienst".ljust(22) + "Proben".rjust(6) + "Median".rjust(9)
        + "Max".rjust(9) + "Grenze".rjust(8) + "Max/Grenze".rjust(12) + "  Fehl")
print(kopf)
def enge(n):
    return -max(w for _, w in daten[n]) / (grenze.get(n) or 3)
for name in sorted(daten, key=enge):
    werte = sorted(w for _, w in daten[name])
    g = grenze.get(name) or 3
    mx = werte[-1]
    print(f"{name:22} {len(werte):6} {werte[len(werte)//2]:8.3f} {mx:8.3f} {g:7.0f} {mx/g*100:10.0f}%  {fehl[name]}")
'
    ;;

  weg)
    ssh -n "$HOST" "test -f ${PIDDATEI} && kill \$(cat ${PIDDATEI}) 2>/dev/null && rm -f ${PIDDATEI} && echo angehalten || echo 'lief nicht'"
    ;;

  *)
    sed -n '/^# Aufruf:/,/^# =\{10,\}$/p' "$0" | sed 's/^# \{0,2\}//'
    exit 1
    ;;
esac
