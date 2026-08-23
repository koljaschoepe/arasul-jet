#!/bin/bash
# ============================================================================
# dauerlauf-bericht.sh — die Beweislage fuer Gate G7 (sieben Tage
# unbeaufsichtigt), aus dem laufenden Geraet gelesen.
#
# G7 fragt nicht "laeuft es gerade", sondern "lief es sieben Tage ohne dass
# jemand eingreifen musste". Das ist keine Momentaufnahme, sondern eine
# Zeitreihe, und sie entsteht nur, wenn man rechtzeitig anfaengt zu messen.
#
# Vier Fragen, vier Quellen:
#
#   1. Musste ein Dienst neu gestartet werden?   Dockers RestartCount.
#      Ein `docker compose up` beim Deploy zaehlt NICHT mit — RestartCount
#      steigt nur, wenn Docker selbst neu startet, also nach einem Absturz.
#      Genau das ist die Frage.
#   2. Musste sich das Geraet selbst heilen?     self_healing_events.
#   3. Hat es weiter gesichert?                  Die Sicherungen der letzten Tage.
#   4. Lief die Messung durch?                   Luecken in metrics_cpu. Eine
#      Luecke heisst: entweder war das Geraet weg, oder der Sammler war es.
#      Beides zaehlt gegen G7.
#
# Aufruf:  bash scripts/test/dauerlauf-bericht.sh [tage]
# Vorgabe: 7 Tage. SSH-Ziel ueber ARASUL_SSH, Vorgabe "jetson".
# ============================================================================
set -uo pipefail

HOST="${ARASUL_SSH:-jetson}"
TAGE="${1:-7}"
REPO="/home/arasul/arasul/arasul-jet"

sql() {
  ssh "$HOST" "docker exec postgres-db psql -U arasul -d arasul_db -t -A -F'|' -c \"$1\"" 2>/dev/null
}

echo "=== Dauerlauf-Bericht, letzte ${TAGE} Tage ==="
echo "Gelesen am: $(date '+%Y-%m-%d %H:%M')"
echo ""

# --- 0. Die eigentliche G7-Zahl ---------------------------------------------
# Wie lange laeuft das Geraet am Stueck? Alles andere in diesem Bericht ist
# Beiwerk, wenn diese Zahl unter sieben Tagen liegt.
LAUFZEIT=$(ssh "$HOST" "cat /proc/uptime" 2>/dev/null | cut -d' ' -f1 | cut -d. -f1)
BOOT_EPOCH=$(( $(date +%s) - ${LAUFZEIT:-0} ))
TAGE_AM_STUECK=$(( ${LAUFZEIT:-0} / 86400 ))
echo "--- Laufzeit am Stueck ---"
echo "  ${TAGE_AM_STUECK} Tage ($(( ${LAUFZEIT:-0} / 3600 )) Stunden)"
echo "  letzter Neustart: $(date -r "$BOOT_EPOCH" '+%d.%m. %H:%M' 2>/dev/null || date -d "@$BOOT_EPOCH" '+%d.%m. %H:%M' 2>/dev/null)"
if [ "$TAGE_AM_STUECK" -lt 7 ]; then
  echo "  G7 verlangt sieben Tage. Noch $(( 7 - TAGE_AM_STUECK )) Tage."
fi
echo ""

# --- 1. Neustarts ----------------------------------------------------------
# Der Pruefstand (pruef-*) ist ein zweiter Stack fuer Abnahmen und gehoert
# nicht zum Produkt. Er wird hier ausgeblendet, sonst faelscht er das Bild.
echo "--- Dienste, die von selbst neu starten mussten ---"
NEUSTARTS=$(ssh "$HOST" "docker inspect \$(docker ps --format '{{.Names}}' | grep -v '^pruef-' | grep -v '^arasul-sandbox-') --format '{{.Name}} {{.RestartCount}}' 2>/dev/null | sed 's|^/||'" 2>/dev/null)
SCHLECHT=$(echo "$NEUSTARTS" | awk '$2 > 0 {print "  " $1 ": " $2 " Neustart(s)"}')
if [ -z "$SCHLECHT" ]; then
  echo "  keiner (das ist die gute Antwort)"
else
  echo "$SCHLECHT"
fi
ANZ_DIENSTE=$(echo "$NEUSTARTS" | grep -c . )
echo "  geprueft: ${ANZ_DIENSTE} Dienste"
echo ""

# --- 2. Selbstheilung ------------------------------------------------------
echo "--- Selbstheilung ---"
HEIL=$(sql "SELECT count(*), count(*) FILTER (WHERE success IS NOT TRUE) FROM public.self_healing_events WHERE timestamp > now() - interval '${TAGE} days';")
GESAMT="${HEIL%%|*}"; MISS="${HEIL##*|}"
echo "  in ${TAGE} Tagen: ${GESAMT:-0} Eingriffe, davon fehlgeschlagen: ${MISS:-0}"

# Das Urteil haengt am DAUERLAUF, nicht an sieben Kalendertagen. G7 fragt: seit
# dem letzten Neustart, musste jemand eingreifen? Ereignisse von davor gehoeren
# zu einem anderen Lauf und wuerden den Bericht auf immer rot halten
# (23.08.2026).
SEIT_BOOT=$(sql "SELECT count(*), count(*) FILTER (WHERE success IS NOT TRUE) FROM public.self_healing_events WHERE timestamp > to_timestamp(${BOOT_EPOCH});")
GESAMT_B="${SEIT_BOOT%%|*}"; MISS_B="${SEIT_BOOT##*|}"
echo "  seit dem letzten Neustart: ${GESAMT_B:-0} Eingriffe, davon fehlgeschlagen: ${MISS_B:-0}"
if [ "${MISS_B:-0}" -gt 0 ]; then
  echo "  die fehlgeschlagenen:"
  sql "SELECT to_char(timestamp,'DD.MM. HH24:MI')||' '||coalesce(service_name,'-')||' '||action_taken FROM public.self_healing_events WHERE timestamp > to_timestamp(${BOOT_EPOCH}) AND success IS NOT TRUE ORDER BY timestamp DESC LIMIT 5;" | sed 's/^/    /'
fi
sql "SELECT to_char(timestamp,'DD.MM. HH24:MI')||' '||coalesce(service_name,'-')||' '||action_taken||' ('||severity||')' FROM public.self_healing_events WHERE timestamp > now() - interval '${TAGE} days' ORDER BY timestamp DESC LIMIT 5;" | sed 's/^/  /'
echo ""

# --- 3. Sicherungen --------------------------------------------------------
echo "--- Sicherungen ---"
ssh "$HOST" "ls -1t ${REPO}/data/backups/postgres 2>/dev/null | head -3 | sed 's/^/  /'; echo '  Anzahl gesamt: '\$(ls -1 ${REPO}/data/backups/postgres 2>/dev/null | wc -l)" 2>/dev/null
echo ""

# --- 4. Luecken in der Messreihe -------------------------------------------
echo "--- Luecken in der Messreihe (metrics_cpu) ---"
LUECKE=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*), coalesce(max(extract(epoch FROM timestamp - vorher))::int, 0) FROM t WHERE vorher IS NOT NULL;")
PUNKTE="${LUECKE%%|*}"; MAXL="${LUECKE##*|}"
echo "  Messpunkte: ${PUNKTE:-0}"
echo "  groesste Luecke: ${MAXL:-0} s"

# Eine Luecke, in der das Geraet neu gestartet ist, ist erklaert. Ohne diese
# Unterscheidung stand der Bericht dauerhaft auf ROT wegen eines Neustarts vom
# 19.08.2026, den man an der Laufzeit oben ohnehin sieht (23.08.2026).
LUECKE_UNERKLAERT=0
if [ "${MAXL:-0}" -gt 900 ]; then
  UEBER_BOOT=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*) FROM t WHERE extract(epoch FROM timestamp - vorher) > 900 AND to_timestamp(${BOOT_EPOCH}) BETWEEN vorher - interval '5 minutes' AND timestamp + interval '5 minutes';")
  ALLE_GROSS=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*) FROM t WHERE extract(epoch FROM timestamp - vorher) > 900;")
  LUECKE_UNERKLAERT=$(( ${ALLE_GROSS:-0} - ${UEBER_BOOT:-0} ))
  echo "  Luecken ueber 15 min: ${ALLE_GROSS:-0}, davon durch den Neustart erklaert: ${UEBER_BOOT:-0}"
  if [ "$LUECKE_UNERKLAERT" -gt 0 ]; then
    echo "  ACHTUNG: ${LUECKE_UNERKLAERT} unerklaerte Luecke(n). Entweder war das"
    echo "  Geraet weg oder der Sammler. Beides zaehlt gegen G7."
  fi
fi
sql "SELECT to_char(min(timestamp),'DD.MM. HH24:MI')||' bis '||to_char(max(timestamp),'DD.MM. HH24:MI') FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days';" | sed 's/^/  Zeitraum: /'
echo ""

# --- Urteil ----------------------------------------------------------------
echo "--- Urteil ---"
ROT=0
[ -n "$SCHLECHT" ] && { echo "  ROT: mindestens ein Dienst musste neu starten"; ROT=1; }
[ "${MISS_B:-0}" -gt 0 ] && { echo "  ROT: seit dem Neustart ist eine Selbstheilung fehlgeschlagen"; ROT=1; }
[ "${LUECKE_UNERKLAERT:-0}" -gt 0 ] && { echo "  ROT: die Messreihe hat eine unerklaerte Luecke"; ROT=1; }
if [ "$ROT" = "0" ]; then
  echo "  Nichts Rotes in diesem Zeitraum."
  if [ "$TAGE_AM_STUECK" -ge 7 ]; then
    echo "  GRUEN fuer G7: sieben Tage am Stueck, ohne Eingriff."
  else
    echo "  NOCH NICHT GRUEN fuer G7: das Geraet laeuft erst ${TAGE_AM_STUECK} Tage am Stueck."
  fi
fi
exit "$ROT"
