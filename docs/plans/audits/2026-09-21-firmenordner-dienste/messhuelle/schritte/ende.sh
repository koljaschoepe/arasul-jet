cd ~/j33mess && . ./lib.sh
set +e
docker compose -f compose.seafile.yaml down -v 2>&1 | tail -1
docker rmi seafileltd/seafile-mc:13.0-latest mariadb:10.11 redis:7-alpine j33mess-client:1 j33mess-client:2 2>&1 | grep -c -E "Untagged|Deleted" 
echo "--- Reste mit dem Vorsatz:"; docker ps -a --filter name=j33mess --format '{{.Names}}'; docker volume ls -q | grep j33mess; docker network ls --format '{{.Name}}' | grep j33mess; docker images --format '{{.Repository}}:{{.Tag}}' | grep j33mess
echo "--- Abbilder, die vorher nicht da waren:"; docker images --format "{{.Repository}}:{{.Tag}}" | sort | comm -13 ergebnis/abbilder-vorher.txt -
echo "--- Volumes, die vorher nicht da waren:"; docker volume ls -q | sort | comm -13 ergebnis/volumes-vorher.txt -
docker buildx du 2>/dev/null | tail -3
wacht && echo wacht-ok
lage "Nach der letzten Messung" | tee ergebnis/lage-nachher.md
