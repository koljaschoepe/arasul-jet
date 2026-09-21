cd ~/j33mess && . ./lib.sh
B=https://127.0.0.1:18082; A="admin:j33mess-Admin-2026"; N="j33mess-Nutzer-2026"
g() { curl -ks -u "$A" -H "Content-Type: application/json" "$@"; }
echo "--- Leerlauf, 6 Proben ueber 60 s"; sleep 20
for i in 1 2 3 4 5 6; do ram_jetzt opencloud; sleep 10; done
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep opencloud
for v in j33mess-opencloud_daten j33mess-opencloud_config; do echo "$v $(volumen_mb $v) MB"; done
echo "--- Nutzer ueber Graph"
for u in anna ben; do g -X POST $B/graph/v1.0/users -d "{\"onPremisesSamAccountName\":\"$u\",\"displayName\":\"$u\",\"mail\":\"$u@j33mess.test\",\"passwordProfile\":{\"password\":\"$N\"}}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("onPremisesSamAccountName"), d.get("id"), d.get("error",""))'; done
echo "--- Raum 'Firma'"
g -X POST $B/graph/v1.0/drives -d '{"name":"Firma","driveType":"project"}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id"), d.get("error",""))' | tee $ERGEBNIS/oc-drive
echo "--- Rollen, die der Dienst kennt"
g $B/graph/v1beta1/roleManagement/permissions/roleDefinitions | python3 -c '
import json,sys
for r in json.load(sys.stdin): print("  ", r["id"], r["displayName"])'
wacht && echo wacht-ok
