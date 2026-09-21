cd ~/j33mess && . ./lib.sh
N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026; S=http://j33mess-nextcloud-server; B=http://127.0.0.1:18081
KA=j33mess-nextcloud-klient-a; KB=j33mess-nextcloud-klient-b
sync_() { docker exec $1 sh -c "nextcloudcmd -h --non-interactive -u $2 -p $3 --path /Firma /arbeit/firma $S >/tmp/sync.log 2>&1; echo $1 rc=\$?"; }
F=Projekte/proj-01/konflikt.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma/$F"
sync_ $KA anna $N; sync_ $KB admin $AP
echo "--- beide Rechner aendern dieselbe Datei, beide gleichen GLEICHZEITIG ab"
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma/$F"
docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma/$F"
sync_ $KA anna $N & sync_ $KB admin $AP & wait
echo "--- zweite Runde, damit jeder sieht, was der andere hochlud"
sync_ $KA anna $N; sync_ $KB admin $AP; sync_ $KA anna $N
for k in $KA $KB; do echo "[$k]"; docker exec $k sh -c "cd /arbeit/firma/Projekte/proj-01 && for f in konflikt*; do echo \"  \$f: \$(cat \"\$f\")\"; done"; done
echo "[Server]"; curl -s -u admin:$AP -X PROPFIND -H "Depth: 1" "$B/remote.php/dav/files/admin/Firma/Projekte/proj-01/" | grep -o "proj-01/konflikt[^<]*" | sort -u
echo "  Inhalt am Server: $(curl -s -u admin:$AP $B/remote.php/dav/files/admin/Firma/$F)"
echo "  Versionen am Server: $(curl -s -u admin:$AP -X PROPFIND -H 'Depth: 1' "$B/remote.php/dav/versions/admin/versions/$(curl -s -u admin:$AP -X PROPFIND -H 'Depth: 0' --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' $B/remote.php/dav/files/admin/Firma/$F | grep -o '<oc:fileid>[0-9]*' | grep -o '[0-9]*')" | grep -c '<d:response>')"
echo "--- Aenderungsprotokoll ueber die API (OCS activity v2), als admin, letzte 8"
curl -s -u admin:$AP -H "OCS-APIRequest: true" -H "Accept: application/json" "$B/ocs/v2.php/apps/activity/api/v2/activity/all?limit=8" | python3 -c '
import json,sys
for a in json.load(sys.stdin)["ocs"]["data"]:
    print("  ", a["datetime"], a["user"], a["type"], a["subject"][:90])'
echo "--- dasselbe nach Nutzer gefiltert? (Parameter gibt es nicht; gezaehlt wird am Feld user, 200 Eintraege)"
curl -s -u admin:$AP -H "OCS-APIRequest: true" -H "Accept: application/json" "$B/ocs/v2.php/apps/activity/api/v2/activity/all?limit=200" | python3 -c '
import json,sys,collections
print("  ", dict(collections.Counter(a["user"] for a in json.load(sys.stdin)["ocs"]["data"])))'
echo "--- sieht ben, was er nicht sehen darf?"
curl -s -u ben:$N -H "OCS-APIRequest: true" -H "Accept: application/json" "$B/ocs/v2.php/apps/activity/api/v2/activity/all?limit=200" | python3 -c '
import json,sys
d=json.load(sys.stdin)["ocs"]["data"]; t=json.dumps(d)
print("   Eintraege:", len(d), "| nennt Vertraulich:", "Vertraulich" in t, "| nennt proj-geheim:", "proj-geheim" in t)'
wacht && echo wacht-ok
