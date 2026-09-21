cd ~/j33mess && . ./lib.sh
B=https://127.0.0.1:18082; A="admin:j33mess-Admin-2026"; N="j33mess-Nutzer-2026"
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D")
g() { curl -ks -u "$A" -H "Content-Type: application/json" "$@"; }
ANNA=ed2382f7-d392-4d70-a0bc-5569e14bc35a; BEN=1f44d65c-bdff-4681-ac80-1c648e47592f
for p in Vertraulich Projekte Projekte/proj-geheim Projekte/proj-offen; do curl -ks -o /dev/null -w "MKCOL $p %{http_code}\n" -u "$A" -X MKCOL "$B/dav/spaces/$DE/$p"; done
for p in Vertraulich/gehalt.md Projekte/proj-geheim/a.md Projekte/proj-offen/b.md; do curl -ks -o /dev/null -w "PUT $p %{http_code}\n" -u "$A" -T /etc/hostname "$B/dav/spaces/$DE/$p"; done
id_von() { curl -ks -u "$A" -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/$1" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//'; }
lade() { # <item-id|root> <nutzer-id> <rolle>
  local ziel="items/$1"; [ "$1" = root ] && ziel=root
  g -X POST "$B/graph/v1beta1/drives/$DE/$ziel/invite" -d "{\"recipients\":[{\"objectId\":\"$2\",\"@libre.graph.recipient.type\":\"user\"}],\"roles\":[\"$3\"]}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("   ->", "ok" if "value" in d else d)'
}
echo "--- anna: Mitglied des Raums, darf bearbeiten"; lade root $ANNA 58c63c02-1d89-4572-916a-870abc5a1b7d
echo "--- ben: Ebene 1 'Projekte' nur lesen"; lade "$(id_von Projekte)" $BEN b1e2218d-eef8-4d4c-b82d-0f1a1b48f3b5
echo "--- ben: Ebene 2 'Projekte/proj-offen' bearbeiten (MEHR als der Elternordner)"; lade "$(id_von Projekte/proj-offen)" $BEN fb6c3e19-e378-47e5-b277-9732f9de6e21
echo "--- ben: Ebene 2 'Projekte/proj-geheim' verweigern (WENIGER als der Elternordner) -- Rolle 'Denied' aus oCIS"; lade "$(id_von Projekte/proj-geheim)" $BEN 63e64e19-8d43-42ec-a738-2b6af2610efa
echo "--- Gegenprobe als Nutzer (GET / PUT) ueber /dav/spaces/<Raum>"
for u in anna ben; do for p in Vertraulich/gehalt.md Projekte/proj-geheim/a.md Projekte/proj-offen/b.md; do
  r=$(curl -ks -o /dev/null -w "%{http_code}" -u "$u:$N" "$B/dav/spaces/$DE/$p"); s=$(curl -ks -o /dev/null -w "%{http_code}" -u "$u:$N" -T /etc/hostname "$B/dav/spaces/$DE/$p")
  echo "$u $p lesen=$r schreiben=$s"; done; done
echo "--- was ben als Laufwerke sieht"
curl -ks -u "ben:$N" "$B/graph/v1.0/me/drives" | python3 -c '
import json,sys
for d in json.load(sys.stdin)["value"]: print("  ", d["driveType"], d["name"], d["id"])'
wacht && echo wacht-ok
