cd ~/j33mess && . ./lib.sh
occ() { docker exec -u www-data j33mess-nextcloud-server php occ "$@"; }
occ app:install groupfolders 2>&1 | tail -2
occ app:list 2>/dev/null | grep -E "activity|groupfolders|files_sharing" 
for u in anna ben; do docker exec -u www-data -e OC_PASS=j33mess-Nutzer-2026 j33mess-nextcloud-server php occ user:add --password-from-env $u | tail -1; done
occ group:add firma; occ group:adduser firma anna; occ group:adduser firma ben; occ group:adduser firma admin
occ background:cron >/dev/null
echo "--- Leerlauf, 6 Proben ueber 60 s"
sleep 30
for i in 1 2 3 4 5 6; do ram_jetzt nextcloud; sleep 10; done
echo "--- Platte"
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep -E "^nextcloud|^postgres:16-alpine"
for v in j33mess-nextcloud_daten j33mess-nextcloud_db; do echo "$v $(volumen_mb $v) MB"; done
wacht && echo wacht-ok
