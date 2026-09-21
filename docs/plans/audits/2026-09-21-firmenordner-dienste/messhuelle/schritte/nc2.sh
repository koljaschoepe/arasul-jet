cd ~/j33mess && . ./lib.sh
B=http://127.0.0.1:18081; A="admin:j33mess-Admin-2026"; N="j33mess-Nutzer-2026"
ocs() { curl -s -u "$A" -H "OCS-APIRequest: true" -H "Accept: application/json" "$@"; echo; }
echo "--- Teamordner ueber die OCS-Schnittstelle"
ocs -X POST $B/apps/groupfolders/folders -d mountpoint=Firma
ocs -X POST $B/apps/groupfolders/folders/1/groups -d group=firma
ocs -X POST $B/apps/groupfolders/folders/1/groups/firma -d permissions=31
ocs -X POST $B/apps/groupfolders/folders/1/acl -d acl=1
ocs -X POST $B/apps/groupfolders/folders/1/manageACL -d mappingType=user -d mappingId=admin -d manageAcl=1
echo "--- Ordner auf zwei Ebenen"
for p in Firma/Vertraulich Firma/Projekte Firma/Projekte/proj-geheim Firma/Projekte/proj-offen; do curl -s -o /dev/null -w "MKCOL $p %{http_code}\n" -u "$A" -X MKCOL "$B/remote.php/dav/files/admin/$p"; done
for p in Firma/Vertraulich/gehalt.md Firma/Projekte/proj-geheim/a.md Firma/Projekte/proj-offen/b.md; do curl -s -o /dev/null -w "PUT $p %{http_code}\n" -u "$A" -T /etc/hostname "$B/remote.php/dav/files/admin/$p"; done
acl() { # <pfad> <nutzer> <maske> <rechte>
  curl -s -o /dev/null -w "ACL $1 $2 maske=$3 rechte=$4 -> %{http_code}\n" -u "$A" -X PROPPATCH "$B/remote.php/dav/files/admin/$1" -H "Content-Type: application/xml" --data "<?xml version=\"1.0\"?><d:propertyupdate xmlns:d=\"DAV:\" xmlns:nc=\"http://nextcloud.org/ns\"><d:set><d:prop><nc:acl-list><nc:acl><nc:acl-mapping-type>user</nc:acl-mapping-type><nc:acl-mapping-id>$2</nc:acl-mapping-id><nc:acl-mask>$3</nc:acl-mask><nc:acl-permissions>$4</nc:acl-permissions></nc:acl></nc:acl-list></d:prop></d:set></d:propertyupdate>"
}
echo "--- Rechte: Ebene 1 (Vertraulich: ben nichts), Ebene 2 (proj-geheim: ben nichts; proj-offen: ben nur lesen)"
acl Firma/Vertraulich ben 31 0
acl Firma/Projekte/proj-geheim ben 31 0
acl Firma/Projekte/proj-offen ben 31 1
echo "--- Gegenprobe als Nutzer (GET / PUT)"
for u in anna ben; do for p in Firma/Vertraulich/gehalt.md Firma/Projekte/proj-geheim/a.md Firma/Projekte/proj-offen/b.md; do
  g=$(curl -s -o /dev/null -w "%{http_code}" -u "$u:$N" "$B/remote.php/dav/files/$u/$p")
  s=$(curl -s -o /dev/null -w "%{http_code}" -u "$u:$N" -T /etc/hostname "$B/remote.php/dav/files/$u/$p")
  echo "$u $p lesen=$g schreiben=$s"; done; done
wacht && echo wacht-ok
