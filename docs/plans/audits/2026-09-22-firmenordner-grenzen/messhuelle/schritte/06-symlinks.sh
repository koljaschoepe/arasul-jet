#!/usr/bin/env bash
# WAS MACHT DER DIENST MIT EINEM SYMLINK IM BAUM?
#
# Die Frage kommt aus der Wirklichkeit: ein Arbeitsbaum am Rechner eines
# Menschen traegt Symlinks (`node_modules/.bin`, ein Ordner, der woandershin
# zeigt), und der Ablagetreiber `posix` liest den Baum so, wie er auf der
# Platte liegt. Gemessen werden drei Sorten: auf eine Datei daneben, auf einen
# Ordner daneben, und ins Leere.
#
#   ./06-symlinks.sh <kennung>
set -uo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="${1:-linkprobe}"
raum=$(cat "$ROH/raum-$KENNUNG.id")
enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$raum")
ziel="$WURZEL/ablage/posix/projects/$KENNUNG"

echo "echte-datei" > "$ziel/echt.txt"
mkdir -p "$ziel/echter-ordner" && echo "drin" > "$ziel/echter-ordner/drin.txt"
ln -sfn echt.txt "$ziel/link-auf-datei.txt"
ln -sfn echter-ordner "$ziel/link-auf-ordner"
ln -sfn /gibt-es-nicht "$ziel/link-ins-leere.txt"
ln -sfn /etc/hostname "$ziel/link-nach-draussen.txt"
echo "auf der Platte:"; ls -la "$ziel" | grep -E 'link|echt'

sleep 30
echo "--- PROPFIND Tiefe 1:"
curl -sk -u "$ADMIN:$PASSWORT" -X PROPFIND "$BASIS/dav/spaces/$enc" -H 'Depth: 1' \
  | grep -o '<d:href>[^<]*</d:href>' | sed 's/<[^>]*>//g' | sed "s#/dav/spaces/$enc##"

for n in link-auf-datei.txt link-ins-leere.txt link-nach-draussen.txt link-auf-ordner/drin.txt; do
  echo -n "GET $n -> "
  curl -sk -u "$ADMIN:$PASSWORT" -o /dev/null -w '%{http_code}\n' "$BASIS/dav/spaces/$enc/$n"
done

echo "--- Suche nach link:"
body="<?xml version=\"1.0\"?><oc:search-files xmlns:oc=\"http://owncloud.org/ns\" xmlns:d=\"DAV:\"><d:prop><d:displayname/></d:prop><oc:search><oc:pattern>link</oc:pattern><oc:limit>20</oc:limit></oc:search></oc:search-files>"
curl -sk -u "$ADMIN:$PASSWORT" -X REPORT "$BASIS/dav/spaces" -H 'Content-Type: application/xml' -d "$body" \
  | grep -o '<d:href>[^<]*</d:href>' | sed 's/<[^>]*>//g'
echo "(Ende)"
