#!/usr/bin/env bash
# DER FUND VOM ERNTEN, NACHGESTELLT: der Purge wird nach `ZEITGRENZE_MS`
# abgeschnitten -- genau das, was `ordnerdienst.js` mit seinen zehn Sekunden
# tut. Danach die Frage, die den Tag entscheidet: kommt der Dienst von selbst
# wieder, oder braucht es einen Neustart?
#
#   ./03-abgebrochen.sh <kennung> <sekunden>
set -euo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="${1:-abbruch}"
SCHNITT="${2:-10}"
raum=$(cat "$ROH/raum-$KENNUNG.id")
weg="/graph/v1.0/drives/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$raum")"
zaehle() { find "$WURZEL/ablage/posix/projects/$KENNUNG" -type f 2>/dev/null | wc -l; }
in_liste() {
  curl -sk -u "$ADMIN:$PASSWORT" "$BASIS/graph/v1.0/drives" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print(sum(1 for x in d.get("value",[]) if x.get("id")==sys.argv[1]))' "$raum"
}
ruf() {
  local grenze="$1"; shift
  curl -sk -u "$ADMIN:$PASSWORT" -X DELETE --max-time "$grenze" \
    -w '\n<<status %{http_code} dauer %{time_total}>>' "$@" "$BASIS$weg" 2>&1 | tail -c 400
  echo
}

marke=$(date +%s)
echo "== vorher: $(zaehle) Dateien, $(in_liste)x in der Liste"
echo "== DELETE (trash):"; ruf 60
echo "== DELETE (purge), abgeschnitten nach ${SCHNITT}s:"; ruf "$SCHNITT" -H 'Purge: T'
echo "== sofort danach: $(zaehle) Dateien, $(in_liste)x in der Liste"

for versuch in 1 2 3; do
  sleep 5
  echo "== Wiederholung $versuch (Purge, 120 s Grenze):"; ruf 120 -H 'Purge: T'
  echo "   Zustand: $(zaehle) Dateien, $(in_liste)x in der Liste"
done

echo "== Log seit dem Abbruch:"
docker logs --since "$marke" j33grenze-firmenordner 2>&1 | grep -iE 'error|cancel|purge|delete' | tail -20
