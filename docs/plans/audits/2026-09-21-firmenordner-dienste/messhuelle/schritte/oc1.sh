cd ~/j33mess && . ./lib.sh
t0=$(date +%s); docker compose -f compose.opencloud.yaml up -d 2>&1 | tail -2; t1=$(date +%s); echo "pull+start $((t1-t0)) s"
for i in $(seq 1 60); do curl -kfs https://127.0.0.1:18082/status.php >/dev/null && break; sleep 2; done; echo "bereit nach $(( $(date +%s)-t1 )) s"
curl -ks https://127.0.0.1:18082/status.php; echo
docker logs j33mess-opencloud-server 2>&1 | tail -5 | cut -c1-200
wacht && echo wacht-ok
