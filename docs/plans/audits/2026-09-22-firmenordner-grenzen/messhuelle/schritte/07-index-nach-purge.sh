#!/usr/bin/env bash
# DIE ENTSCHEIDENDE FRAGE ZUM SUCHINDEX: haelt er die Namen, weil ein Purge
# ihn nicht erreicht -- oder weil der Purge ABGESCHNITTEN wurde?
#
# Zwei Laeufe, sonst gleich: einer mit Zeit, einer nach `SCHNITT` Sekunden
# abgeschnitten (die zehn Sekunden, die `ordnerdienst.js` bis zum 22.09.2026
# hatte). Gemessen wird beides Mal die SUCHE (was ein Mensch findet) und der
# GREP auf die Indexdateien (was auf der Platte steht) -- zwei verschiedene
# Fragen, und die Verwechslung war der Grund, warum der Befund so aussah.
#
#   ./07-index-nach-purge.sh <kennung> [schnitt-in-s]
set -uo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="$1"
SCHNITT="${2:-0}"
raum=$(cat "$ROH/raum-$KENNUNG.id")
enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$raum")
im_index() { grep -roa "$KENNUNG-[0-9]*" "$WURZEL/ablage/search" 2>/dev/null | wc -l; }
suchtreffer() {
  local body="<?xml version=\"1.0\"?><oc:search-files xmlns:oc=\"http://owncloud.org/ns\" xmlns:d=\"DAV:\"><d:prop><d:displayname/></d:prop><oc:search><oc:pattern>$KENNUNG</oc:pattern><oc:limit>500</oc:limit></oc:search></oc:search-files>"
  curl -sk -u "$ADMIN:$PASSWORT" -X REPORT "$BASIS/dav/spaces" -H 'Content-Type: application/xml' -d "$body" \
    | grep -o '<d:href>' | wc -l
}
zaehle() { find "$WURZEL/ablage/posix/projects/$KENNUNG" -type f 2>/dev/null | wc -l; }

echo "vorher: $(zaehle) Dateien, $(im_index) Indexbytes, $(suchtreffer) Suchtreffer"
curl -sk -u "$ADMIN:$PASSWORT" -X DELETE -o /dev/null -w "trash %{http_code} %{time_total}s\n" "$BASIS/graph/v1.0/drives/$enc"
grenze=$([ "$SCHNITT" -gt 0 ] && echo "$SCHNITT" || echo 900)
curl -sk -u "$ADMIN:$PASSWORT" -X DELETE -H 'Purge: T' -o /dev/null --max-time "$grenze" \
  -w "purge %{http_code} %{time_total}s\n" "$BASIS/graph/v1.0/drives/$enc"
echo "(Purge-Grenze war ${grenze}s)"
for w in 10 60 180; do
  sleep "$w"
  echo "nach +${w}s: $(zaehle) Dateien, $(im_index) Indexbytes, $(suchtreffer) Suchtreffer"
done
