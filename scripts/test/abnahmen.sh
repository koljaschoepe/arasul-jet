#!/bin/bash
# =============================================================================
# abnahmen.sh — die ganze Abnahme-Reihe gegen das laufende Geraet.
#
# Jede einzelne Abnahme belegt eine Zusage im Browser, gegen den Orin. Zusammen
# sind sie der Beleg fuer Gate G1 ("alle Funktionen arbeiten nachweislich").
# Einzeln aufgerufen vergisst man eine; deshalb dieser eine Befehl.
#
# Sie laufen NACHEINANDER, nicht parallel: mehrere Browser gegen dasselbe
# Modell wuerden sich um die GPU streiten, und die Messungen waeren dann eine
# Aussage ueber die Warteschlange, nicht ueber die Funktion.
#
# Voraussetzung: ein SSH-Tunnel auf das Geraet.
#   ssh -f -N -L 8443:localhost:443 jetson
#   bash scripts/test/abnahmen.sh              alle
#   bash scripts/test/abnahmen.sh csp bruecke  nur diese
#
# Rueckgabe 0, wenn jede Abnahme gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

# Phase B2 (26.08.2026): chat, terminal, dokument, modell und rueckfrage sind
# aus der Reihe gefallen. Sie massen den Agent-Chat, das Terminal und den
# Datei-Explorer, und die gibt es in der Oberflaeche nicht mehr. D4 schneidet
# Rueckfrage und Modellwahl je Flow neu.
ALLE=(csp fernzugriff erweiterung bruecke paket modell-link rueckmeldung oberflaeche)
GEWAEHLT=("$@")
[ ${#GEWAEHLT[@]} -eq 0 ] && GEWAEHLT=("${ALLE[@]}")

BERICHT="${ARASUL_BERICHT:-$(mktemp -d)}/abnahmen"
mkdir -p "$BERICHT"

if ! nc -z localhost 8443 2>/dev/null; then
  echo "Kein Tunnel auf localhost:8443. Erst:"
  echo "  ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme-Reihe, $(date '+%d.%m. %H:%M') ==="
echo ""

FEHLER=0
for name in "${GEWAEHLT[@]}"; do
  datei="scripts/test/${name}-abnahme.mjs"
  if [ ! -f "$datei" ]; then
    printf '  %-14s %s\n' "$name" "gibt es nicht ($datei)"
    FEHLER=1
    continue
  fi
  start=$(date +%s)
  node "$datei" > "$BERICHT/$name.log" 2>&1
  code=$?
  dauer=$(( $(date +%s) - start ))
  letzte=$(grep -E 'gruen$|von [0-9]+ gruen' "$BERICHT/$name.log" | tail -1)
  [ -z "$letzte" ] && letzte=$(tail -1 "$BERICHT/$name.log")
  if [ "$code" = "0" ]; then
    printf '  OK    %-14s %-24s %4ds\n' "$name" "$letzte" "$dauer"
  else
    printf '  ROT   %-14s %-24s %4ds\n' "$name" "$letzte" "$dauer"
    FEHLER=1
    # Die roten Zeilen gleich mitgeben, sonst muss man die Datei suchen.
    grep -E '^ROT|^ROT  |^ROT   ' "$BERICHT/$name.log" | head -4 | sed 's/^/          /'
  fi
done

echo ""
echo "Protokolle: $BERICHT"
if [ "$FEHLER" = "0" ]; then
  echo "Alles gruen."
else
  echo "Mindestens eine Abnahme ist rot."
fi
exit "$FEHLER"
