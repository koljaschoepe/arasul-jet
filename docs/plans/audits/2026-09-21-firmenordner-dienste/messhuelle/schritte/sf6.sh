cd ~/j33mess && . ./lib.sh
set +e
B=http://127.0.0.1:18083; N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026
KA=j33mess-seafile-klient-a; KB=j33mess-seafile-klient-b; R2=$(cat $ERGEBNIS/sf-repo2)
TA=$(curl -s -d "username=admin@j33mess.test" -d "password=$AP" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
a() { curl -s -H "Authorization: Token $TA" -H "Accept: application/json" "$@"; }
zeig() { for k in $KA $KB; do echo "[$k]"; docker exec $k sh -c "cd /arbeit/firma2/Projekte/proj-01 && for f in $1*; do echo \"  \$f: \$(cat \"\$f\")\"; done"; done
  echo "[Server] $(a "$B/api2/repos/$R2/dir/?p=/Projekte/proj-01" | python3 -c 'import json,sys; print([e["name"] for e in json.load(sys.stdin) if e["name"].startswith("konflikt")])')"; }
echo "=== Variante 1: beide aendern in derselben Sekunde, die Dienste gleichen von selbst ab"
F=Projekte/proj-01/konflikt.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma2/$F"; sleep 25
docker exec $KB cat /arbeit/firma2/$F
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma2/$F" & docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma2/$F" & wait
sleep 40; zeig konflikt
echo "   Verlauf der Datei am Server:"; a "$B/api/v2.1/repos/$R2/file/new_history/?path=/$F" | python3 -c '
import json,sys
for h in json.load(sys.stdin).get("data",[]): print("     ", h["ctime"], h["creator_name"], h["size"], "Bytes")'
echo "=== Variante 3: A aendert bei getrenntem B (Dienst von B steht), B aendert danach und startet wieder"
F=Projekte/proj-01/konflikt3.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma2/$F"; sleep 25
docker exec $KB seaf-cli stop >/dev/null 2>&1
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma2/$F"; sleep 2
docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma2/$F"; sleep 15
docker exec $KB seaf-cli start >/dev/null 2>&1; sleep 40; zeig konflikt3
echo "=== Aenderungsprotokoll: /api/v2.1/activities/ als admin und als ben"
for wer in "admin@j33mess.test $AP" "ben@j33mess.test $N"; do set -- $wer
  T=$(curl -s -d "username=$1" -d "password=$2" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
  for s in 1 2 3; do curl -s -H "Authorization: Token $T" "$B/api/v2.1/activities/?page=$s&per_page=100"; echo; done | python3 -c '
import json,sys,collections
z=collections.Counter(); n=0; bsp=[]
for l in sys.stdin:
    l=l.strip()
    if not l: continue
    for e in json.loads(l).get("events",[]):
        n+=1; z[e["author_name"]]+=1
        if len(bsp)<3: bsp.append((e["time"][:19], e["author_name"], e["op_type"], e["obj_type"], e.get("path","")[:60], e.get("repo_name")))
print("  ", sys.argv[1], "sieht", n, "Eintraege", dict(z))
for b in bsp: print("      ", *b)' "$1"
done
echo "   Admin-Protokoll (Datei-Audit, laut Handbuch Pro): $(a -o /dev/null -w '%{http_code}' "$B/api/v2.1/admin/logs/file-update-logs/")"
wacht && echo wacht-ok
