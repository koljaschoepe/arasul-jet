#!/usr/bin/env bash
# DER VORSCHLAG: erst die Kinder wegwerfen, dann den Raum.
#
# Gefragt wird beides auf einmal -- ob die Dauer je Aufruf klein bleibt (statt
# einer einzigen langen Anfrage) UND ob der Suchindex die Namen danach
# verliert. Der Unterschied zum Purge allein ist der Ereignisweg: ein
# geloeschter ORDNER erreicht den Suchdienst, ein weggeworfener RAUM nicht.
#
#   ./04-erst-leeren.sh <kennung>
set -uo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="${1:-sauber}"
raum=$(cat "$ROH/raum-$KENNUNG.id")
enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$raum")
zaehle() { find "$WURZEL/ablage/posix/projects/$KENNUNG" -type f 2>/dev/null | wc -l; }
im_index() { grep -roa "$KENNUNG-[0-9]*" "$WURZEL/ablage/search" 2>/dev/null | wc -l; }
suchtreffer() {
  local body="<?xml version=\"1.0\"?><oc:search-files xmlns:oc=\"http://owncloud.org/ns\" xmlns:d=\"DAV:\"><d:prop><d:displayname/></d:prop><oc:search><oc:pattern>$KENNUNG</oc:pattern><oc:limit>200</oc:limit></oc:search></oc:search-files>"
  curl -sk -u "$ADMIN:$PASSWORT" -X REPORT "$BASIS/dav/spaces" -H 'Content-Type: application/xml' -d "$body" \
    | grep -o '<d:href>' | wc -l
}

echo "vorher: $(zaehle) Dateien, $(im_index) Indexbytes, $(suchtreffer) Suchtreffer"

kinder=$(curl -sk -u "$ADMIN:$PASSWORT" -X PROPFIND "$BASIS/dav/spaces/$enc" -H 'Depth: 1' \
  | grep -o "<d:href>[^<]*</d:href>" | sed 's/<[^>]*>//g' | grep -v "/$enc/$" | sed 's#.*/##')
echo "Kinder: $(printf '%s\n' "$kinder" | wc -l)"

anfang=$(date +%s.%N)
for k in $kinder; do
  curl -sk -u "$ADMIN:$PASSWORT" -X DELETE -o /dev/null -w "$k %{http_code} %{time_total}s\n" \
    --max-time 300 "$BASIS/dav/spaces/$enc/$k"
done
leeren=$(python3 -c "print(round($(date +%s.%N)-$anfang,1))")
echo "Kinder weg in ${leeren}s -- auf der Platte noch $(zaehle) Dateien"

anfang=$(date +%s.%N)
curl -sk -u "$ADMIN:$PASSWORT" -X DELETE -o /dev/null -w "trash %{http_code} %{time_total}s\n" --max-time 300 "$BASIS/graph/v1.0/drives/$enc"
curl -sk -u "$ADMIN:$PASSWORT" -X DELETE -H 'Purge: T' -o /dev/null -w "purge %{http_code} %{time_total}s\n" --max-time 900 "$BASIS/graph/v1.0/drives/$enc"
echo "Raum weg in $(python3 -c "print(round($(date +%s.%N)-$anfang,1))")s -- auf der Platte noch $(zaehle) Dateien"

for w in 5 30 60 180 300; do
  sleep "$w"
  echo "nach +${w}s: $(im_index) Indexbytes, $(suchtreffer) Suchtreffer"
done
