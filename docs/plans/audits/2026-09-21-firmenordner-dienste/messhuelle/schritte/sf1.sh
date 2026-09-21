cd ~/j33mess && . ./lib.sh
docker compose -f compose.seafile.yaml down -v >/dev/null 2>&1; t0=$(date +%s); docker compose -f compose.seafile.yaml up -d 2>&1 | tail -2; t1=$(date +%s); echo "start $((t1-t0)) s"
for i in $(seq 1 150); do curl -fs -o /dev/null http://127.0.0.1:18083/api2/ping/ && break; sleep 2; done; echo "bereit nach $(( $(date +%s)-t1 )) s"
curl -s http://127.0.0.1:18083/api2/server-info/; echo
wacht && echo wacht-ok
echo "--- Leerlauf"; sleep 30; for i in 1 2 3 4 5 6; do ram_jetzt seafile; sleep 10; done
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep -E "seafile|mariadb|redis"
for v in j33mess-seafile_daten j33mess-seafile_db; do echo "$v $(volumen_mb $v) MB"; done
wacht && echo wacht-ok
