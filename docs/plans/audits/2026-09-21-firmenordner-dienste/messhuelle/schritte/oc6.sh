cd ~/j33mess && . ./lib.sh
python3 spitze.py $ERGEBNIS/opencloud-*.ram
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D"); N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026
S=https://j33mess-opencloud-server:9200; U="$S/dav/spaces/$D"; B=https://127.0.0.1:18082
KA=j33mess-opencloud-klient-a; KB=j33mess-opencloud-klient-b
sync_() { docker exec -e LANG=C.UTF-8 $1 sh -c "owncloudcmd --trust --sync-hidden-files --non-interactive --exclude /aus.lst -u $2 -p $3 --server $S /arbeit/firma '$U' >/tmp/sync.log 2>&1; echo $1 rc=\$?"; }
F=Projekte/proj-01/konflikt.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma/$F"
sync_ $KA anna $N; sync_ $KB admin $AP
echo "--- beide aendern, beide gleichen GLEICHZEITIG ab"
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma/$F"
docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma/$F"
sync_ $KA anna $N & sync_ $KB admin $AP & wait
sync_ $KA anna $N; sync_ $KB admin $AP; sync_ $KA anna $N
for k in $KA $KB; do echo "[$k]"; docker exec $k sh -c "cd /arbeit/firma/Projekte/proj-01 && for f in konflikt*; do echo \"  \$f: \$(cat \"\$f\")\"; done"; done
echo "[Server]"; curl -ks -u admin:$AP -X PROPFIND -H "Depth: 1" "$B/dav/spaces/$DE/Projekte/proj-01/" | grep -o "proj-01/konflikt[^<]*" | sort -u
echo "  Inhalt am Server: $(curl -ks -u admin:$AP "$B/dav/spaces/$DE/$F")"
FID=$(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/$F" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//')
echo "  Versionen am Server: $(curl -ks -u admin:$AP -X PROPFIND -H 'Depth: 1' "$B/dav/meta/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$FID")/v" | grep -c '<d:response>')  (erste Antwort ist der Ordner selbst)"
echo "--- Aenderungsprotokoll: Graph activities, als admin, fuer die Datei und fuer den Ordner proj-01"
PID=$(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/Projekte/proj-01" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//')
for i in "$FID" "$PID"; do
curl -ks -u admin:$AP -G "$B/graph/v1beta1/extensions/org.libregraph/activities" --data-urlencode "kql=itemid:$i AND depth:2" | python3 -c '
import json,sys,collections
d=json.load(sys.stdin); v=d.get("value",[])
print("   Eintraege:", len(v), d.get("error",""))
z=collections.Counter()
for a in v:
    va=a["template"]["variables"]; z[va.get("user",{}).get("displayName")]+=1
for a in v[:4]:
    va=a["template"]["variables"]; print("    ", a["times"]["recordedTime"][:19], va.get("user",{}).get("displayName"), "|", a["template"]["message"], "|", va.get("resource",{}).get("name"))
print("    je Nutzer:", dict(z))'
done
echo "--- ganzer Raum, als admin"
RID=$(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//')
curl -ks -u admin:$AP -G "$B/graph/v1beta1/extensions/org.libregraph/activities" --data-urlencode "kql=itemid:$RID AND depth:-1 AND limit:3000" | python3 -c '
import json,sys,collections
v=json.load(sys.stdin).get("value",[]); print("   Eintraege:", len(v), dict(collections.Counter(a["template"]["variables"].get("user",{}).get("displayName") for a in v)))'
echo "--- ben fragt nach Vertraulich"
VID=$(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/Vertraulich" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//')
curl -ks -o /dev/null -w "   HTTP %{http_code}\n" -u ben:$N -G "$B/graph/v1beta1/extensions/org.libregraph/activities" --data-urlencode "kql=itemid:$VID"
wacht && echo wacht-ok
