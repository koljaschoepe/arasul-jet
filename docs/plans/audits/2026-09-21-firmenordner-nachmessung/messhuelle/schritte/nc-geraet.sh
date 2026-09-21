# Orin. Probe 3 (Nextcloud): ein Ordner, der nie abgeglichen wird und nur am Geraet lesbar ist.
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
occ() { docker exec -u www-data j33nach-nextcloud-server php occ "$@"; }
B=http://127.0.0.1:18081/remote.php/dav; A="admin:j33nach-Admin-2026"; U="anna:j33nach-anna-2026"
echo "--- (a) lokaler Speicher /mnt/geraet, nur fuer admin eingebunden (anna nicht)"
echo "akte" > ~/j33nach/nextcloud/geraet/akte.txt; chmod 666 ~/j33nach/nextcloud/geraet/akte.txt
occ files_external:create Geraet local null::null -c datadir=/mnt/geraet 2>&1 | tail -1
ID=$(occ files_external:list | grep Geraet | awk -F'|' '{print $2}' | tr -d ' '); occ files_external:applicable --add-user=admin $ID >/dev/null
echo "am Geraet ohne sudo lesbar: $(cat ~/j33nach/nextcloud/geraet/akte.txt)   (~/j33nach/nextcloud/geraet/akte.txt)"
echo "admin sieht Geraet/akte.txt: $(curl -s -o /dev/null -w '%{http_code}' -u "$A" $B/files/admin/Geraet/akte.txt)   anna: $(curl -s -o /dev/null -w '%{http_code}' -u "$U" $B/files/anna/Geraet/akte.txt)"
echo "--- (b) Unterordner INNERHALB des Teamordners Firma, per ACL fuer anna unsichtbar (Entziehen nach unten)"
curl -s -o /dev/null -w "MKCOL Kundenakten %{http_code}\n" -u "$A" -X MKCOL $B/files/admin/Firma/Kundenakten
curl -s -o /dev/null -w "PUT akte %{http_code}\n" -u "$A" -T /etc/hostname $B/files/admin/Firma/Kundenakten/akte.txt
curl -s -o /dev/null -w "PROPPATCH ACL anna=nichts %{http_code}\n" -u "$A" -X PROPPATCH $B/files/admin/Firma/Kundenakten -H 'Content-Type: application/xml' --data '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:set><d:prop><nc:acl-list><nc:acl><nc:acl-mapping-type>user</nc:acl-mapping-type><nc:acl-mapping-id>anna</nc:acl-mapping-id><nc:acl-mask>31</nc:acl-mask><nc:acl-permissions>0</nc:acl-permissions></nc:acl></nc:acl-list></d:prop></d:set></d:propertyupdate>'
echo "anna GET Firma/Kundenakten/akte.txt: $(curl -s -o /dev/null -w '%{http_code}' -u "$U" $B/files/anna/Firma/Kundenakten/akte.txt)   anna liest Firma/Arbeitsbaum: $(curl -s -o /dev/null -w '%{http_code}' -u "$U" -X PROPFIND -H 'Depth: 0' $B/files/anna/Firma/Arbeitsbaum)"
echo "anna sieht in Firma/: $(curl -s -u "$U" -X PROPFIND -H 'Depth: 1' $B/files/anna/Firma/ | grep -o '<d:href>[^<]*' | sed 's|.*/Firma/||' | tr '\n' ' ')"
echo "am Geraet (sudo): $(sudo cat ~/j33nach/nextcloud/html/data/__groupfolders/1/files/Kundenakten/akte.txt)"
wacht && echo wacht-ok
