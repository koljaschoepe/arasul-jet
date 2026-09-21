cd ~/j33mess && . ./lib.sh
docker compose -f compose.opencloud.yaml up -d 2>&1 | grep -E "Recreate|Running" | head -5
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026
S=https://j33mess-opencloud-server:9200; U="$S/dav/spaces/$D"
KA=j33mess-opencloud-klient-a; KB=j33mess-opencloud-klient-b
docker cp testordner.py $KA:/testordner.py >/dev/null
docker exec $KA sh -c 'mkdir -p /arbeit/firma && python3 /testordner.py /arbeit/firma'
docker exec $KB mkdir -p /arbeit/firma
printf '.git\nnode_modules\n' > /tmp/j33-aus.lst
docker cp /tmp/j33-aus.lst $KA:/aus.lst >/dev/null; docker cp /tmp/j33-aus.lst $KB:/aus.lst >/dev/null
sync_() { docker exec -e LANG=C.UTF-8 $1 sh -c "owncloudcmd --trust --sync-hidden-files --non-interactive --exclude /aus.lst -u $2 -p $3 --server $S /arbeit/firma '$U' >/tmp/sync.log 2>&1; echo $1 rc=\$?"; }
echo "--- Abgleich hoch (Klient A, anna)"
ram_mitschreiben opencloud "$ERGEBNIS/opencloud-hoch.ram"
t0=$(date +%s.%N); sync_ $KA anna $N; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/opencloud-hoch.ram"
echo "Dauer hoch: $(echo "$t1 - $t0" | bc) s"
wacht
echo "--- Abgleich herunter (Klient B, admin)"
ram_mitschreiben opencloud "$ERGEBNIS/opencloud-runter.ram"
t0=$(date +%s.%N); sync_ $KB admin $AP; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/opencloud-runter.ram"
echo "Dauer herunter: $(echo "$t1 - $t0" | bc) s"
docker exec $KB sh -c 'cd /arbeit/firma; echo "bei B: datei-* $(find . -type f -name "datei-*" | wc -l)  .git: $(find . -path "*/.git/*" -type f | wc -l)  node_modules: $(find . -path "*/node_modules/*" -type f | wc -l)  .claude: $(find . -path "*/.claude/*" -type f | wc -l)"'
t0=$(date +%s.%N); sync_ $KA anna $N; t1=$(date +%s.%N); echo "Dauer Leerabgleich: $(echo "$t1 - $t0" | bc) s"
for v in j33mess-opencloud_daten; do echo "$v $(volumen_mb $v) MB"; done
ram_jetzt opencloud
wacht && echo wacht-ok
