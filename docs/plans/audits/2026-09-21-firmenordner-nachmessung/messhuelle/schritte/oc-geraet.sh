# Orin. Probe 3 (OpenCloud): ein Ordner, der nie abgeglichen wird und nur am Geraet lesbar ist.
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
B=https://127.0.0.1:18082; A="admin:j33nach-Admin-2026"; U="anna:j33nach-anna-2026"
g() { curl -ks -u "$A" -H 'Content-Type: application/json' "$@"; }
echo "--- eigener Raum 'Geraet', an niemanden freigegeben (ausser dem Administrator, der ihn anlegt)"
G=$(g -X POST $B/graph/v1.0/drives -d '{"name":"Geraet","driveType":"project"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])'); echo "$G" > ~/j33nach/oc-geraet-id
GE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$G")
curl -ks -o /dev/null -w "MKCOL %{http_code}\n" -u "$A" -X MKCOL "$B/dav/spaces/$GE/Kundenakten"
curl -ks -o /dev/null -w "PUT %{http_code}\n" -u "$A" -T /etc/hostname "$B/dav/spaces/$GE/Kundenakten/akte.txt"
P=~/j33nach/opencloud/daten/posix/projects/${G#*\$}
echo "am Geraet lesbar: $(cat $P/Kundenakten/akte.txt)  ($P/Kundenakten/akte.txt)"
echo "--- was anna (Mitglied von 'Firma') sieht"
curl -ks -u "$U" $B/graph/v1.0/me/drives | python3 -c 'import json,sys
for d in json.load(sys.stdin)["value"]: print("  ", d["driveType"], d["name"])'
echo "anna GET Geraet/Kundenakten/akte.txt: $(curl -ks -o /dev/null -w '%{http_code}' -u "$U" "$B/dav/spaces/$GE/Kundenakten/akte.txt")"
echo "anna PROPFIND Geraet: $(curl -ks -o /dev/null -w '%{http_code}' -u "$U" -X PROPFIND -H 'Depth: 1' "$B/dav/spaces/$GE/")"
echo "--- ein Unterordner INNERHALB von 'Firma', den Mitglied anna nicht sieht: geht das? Es gibt nur Erweitern (Einladung), keine Sperre nach unten."
echo "  (Rolle 'Denied' aus oCIS wird abgelehnt -- siehe erste Messung)"
wacht && echo wacht-ok
