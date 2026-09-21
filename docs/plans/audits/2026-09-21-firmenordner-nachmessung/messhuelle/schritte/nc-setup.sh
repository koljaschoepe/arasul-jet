# Orin. Nextcloud einrichten: Teamordner-App, Nutzer, Gruppe, Teamordner "Firma" mit ACL.
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
occ() { docker exec -u www-data j33nach-nextcloud-server php occ "$@"; }
echo "--- App groupfolders"; occ app:install groupfolders 2>&1 | tail -2
occ config:system:set trusted_domains 5 --value=localhost:18083 >/dev/null
occ config:system:set overwriteprotocol --value=http >/dev/null
for u in anna ben; do docker exec -u www-data -e OC_PASS=j33nach-$u-2026 j33nach-nextcloud-server php occ user:add --password-from-env --display-name=$u $u 2>&1 | tail -1; done
occ group:add alle >/dev/null; occ group:adduser alle admin; occ group:adduser alle anna
ID=$(occ groupfolders:create Firma | tail -1); echo "Teamordner-ID: $ID"; echo $ID > ~/j33nach/nc-gf-id
occ groupfolders:group $ID alle write share delete
occ groupfolders:permissions $ID --enable
occ groupfolders:list
occ app:list --enabled 2>/dev/null | grep -i -E 'groupfolders|files_external|activity' 
wacht && echo wacht-ok
