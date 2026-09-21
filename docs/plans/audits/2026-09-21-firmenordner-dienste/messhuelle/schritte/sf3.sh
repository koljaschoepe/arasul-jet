cd ~/j33mess && . ./lib.sh
set +e
R=$(cat $ERGEBNIS/sf-repo); N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026; S=http://seafile.j33mess.test
KA=j33mess-seafile-klient-a; KB=j33mess-seafile-klient-b
docker cp testordner.py $KA:/testordner.py >/dev/null
docker exec $KA sh -c 'mkdir -p /arbeit/firma && python3 /testordner.py /arbeit/firma && printf ".git/\nnode_modules/\n" > /arbeit/firma/seafile-ignore.txt'
docker exec $KB mkdir -p /arbeit/firma
for k in $KA $KB; do docker exec $k sh -c 'mkdir -p /arbeit/seaf && seaf-cli init -d /arbeit/seaf >/dev/null 2>&1; seaf-cli start >/dev/null 2>&1; sleep 3; seaf-cli status | tail -1'; done
warte() { # <container>: bis "synchronized"
  for i in $(seq 1 1800); do s=$(docker exec $1 seaf-cli status 2>/dev/null | grep -v '^#' | tail -1); case "$s" in *synchronized*) return 0;; *error*|*Error*) echo "   FEHLER: $s"; return 1;; esac; sleep 1; done; echo "   ZEIT UM: $s"; return 1; }
echo "--- Abgleich hoch (Klient A, anna)"
ram_mitschreiben seafile "$ERGEBNIS/seafile-hoch.ram"
t0=$(date +%s.%N); docker exec $KA seaf-cli sync -l $R -s $S -d /arbeit/firma -u anna@j33mess.test -p $N 2>&1 | tail -1; warte $KA; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/seafile-hoch.ram"
echo "Dauer hoch: $(echo "$t1 - $t0" | bc) s"
wacht
echo "--- Abgleich herunter (Klient B, admin)"
ram_mitschreiben seafile "$ERGEBNIS/seafile-runter.ram"
t0=$(date +%s.%N); docker exec $KB seaf-cli sync -l $R -s $S -d /arbeit/firma -u admin@j33mess.test -p $AP 2>&1 | tail -1; warte $KB; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/seafile-runter.ram"
echo "Dauer herunter: $(echo "$t1 - $t0" | bc) s"
docker exec $KB sh -c 'cd /arbeit/firma; echo "bei B: datei-* $(find . -type f -name "datei-*" | wc -l)  .git: $(find . -path "*/.git/*" -type f | wc -l)  node_modules: $(find . -path "*/node_modules/*" -type f | wc -l)  .claude: $(find . -path "*/.claude/*" -type f | wc -l)"'
python3 spitze.py $ERGEBNIS/seafile-*.ram
for v in j33mess-seafile_daten j33mess-seafile_db; do echo "$v $(volumen_mb $v) MB"; done
sleep 20; ram_jetzt seafile
wacht && echo wacht-ok
