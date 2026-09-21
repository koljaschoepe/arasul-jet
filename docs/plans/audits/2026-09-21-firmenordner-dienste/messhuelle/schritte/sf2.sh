cd ~/j33mess && . ./lib.sh
set +e
docker compose -f compose.seafile.yaml down -v >/dev/null 2>&1; docker compose -f compose.seafile.yaml up -d >/dev/null 2>&1
for i in $(seq 1 150); do curl -fs -o /dev/null http://127.0.0.1:18083/api2/ping/ && break; sleep 2; done; sleep 5
B=http://127.0.0.1:18083; N="j33mess-Nutzer-2026"
tok() { curl -s -d "username=$1" -d "password=$2" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token","-"))'; }
TA=$(tok admin@j33mess.test j33mess-Admin-2026); echo "Admin-Token: ${TA:0:6}..."
a() { curl -s -H "Authorization: Token $TA" -H "Accept: application/json" "$@"; }
echo "--- Nutzer"
for u in anna ben; do a -X POST $B/api/v2.1/admin/users/ -d "email=$u@j33mess.test" -d "password=$N" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  ", d.get("email"), d.get("contact_email"), d.get("error_msg",""))'; done | tee $ERGEBNIS/sf-nutzer
ANNA=$(sed -n 1p $ERGEBNIS/sf-nutzer | awk '{print $1}'); BEN=$(sed -n 2p $ERGEBNIS/sf-nutzer | awk '{print $1}')
echo "--- Bibliothek Firma"
R=$(a -X POST $B/api2/repos/ -d name=Firma | python3 -c 'import json,sys; print(json.load(sys.stdin)["repo_id"])'); echo "$R" > $ERGEBNIS/sf-repo; echo "   $R"
for p in /Vertraulich /Projekte /Projekte/proj-geheim /Projekte/proj-offen; do a -o /dev/null -w "mkdir $p %{http_code}\n" -X POST "$B/api2/repos/$R/dir/?p=$p" -d operation=mkdir; done
for p in /Vertraulich /Projekte/proj-geheim /Projekte/proj-offen; do L=$(a "$B/api2/repos/$R/upload-link/?p=$p" | tr -d '"' | sed "s#http://seafile.j33mess.test#$B#"); curl -s -o /dev/null -w "upload $p %{http_code}\n" -H "Authorization: Token $TA" -F file=@/etc/hostname -F parent_dir=$p "$L"; done
teile() { a -X PUT "$B/api2/repos/$R/dir/shared_items/?p=$1" -d share_type=user -d "username=$2" -d permission=$3 | cut -c1-200; echo; }
echo "--- anna: ganze Bibliothek rw"; teile / $ANNA rw
echo "--- ben: Ebene 1 /Projekte nur lesen"; teile /Projekte $BEN r
echo "--- ben: Ebene 2 /Projekte/proj-offen rw"; teile /Projekte/proj-offen $BEN rw
echo "--- ben: Ebene 2 /Projekte/proj-geheim einschraenken (Ordnerrecht, laut Handbuch nur Pro)"
a -w " HTTP %{http_code}\n" -X POST "$B/api2/repos/$R/user-folder-perm/" -d "user_email=$BEN" -d folder_path=/Projekte/proj-geheim -d permission=r | cut -c1-200
echo "--- was ben sieht"
TB=$(tok ben@j33mess.test $N)
curl -s -H "Authorization: Token $TB" "$B/api2/repos/" | python3 -c '
import json,sys
for r in json.load(sys.stdin): print("  ", r["type"], r["name"], r["permission"], r["id"], r.get("origin_path",""))' | tee $ERGEBNIS/sf-ben
echo "--- Gegenprobe ben: lesen/schreiben je geteiltem Ordner"
while read -r typ name perm id rest; do
  l=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Token $TB" "$B/api2/repos/$id/dir/?p=/")
  s=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Token $TB" -X POST "$B/api2/repos/$id/dir/?p=/von-ben" -d operation=mkdir)
  g=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Token $TB" "$B/api2/repos/$id/dir/?p=/proj-geheim")
  echo "   $name ($perm): lesen=$l schreiben=$s  /proj-geheim darin lesen=$g"
done < $ERGEBNIS/sf-ben
echo "   ben direkt auf die Bibliothek: $(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Token $TB" "$B/api2/repos/$R/dir/?p=/Vertraulich")"
wacht && echo wacht-ok
