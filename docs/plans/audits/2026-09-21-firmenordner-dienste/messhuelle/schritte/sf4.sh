cd ~/j33mess && . ./lib.sh
set +e
B=http://127.0.0.1:18083; N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026; S=http://seafile.j33mess.test
KA=j33mess-seafile-klient-a; KB=j33mess-seafile-klient-b
TA=$(curl -s -d "username=admin@j33mess.test" -d "password=$AP" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
a() { curl -s -H "Authorization: Token $TA" -H "Accept: application/json" "$@"; }
R2=$(a -X POST $B/api2/repos/ -d name=Firma2 | python3 -c 'import json,sys; print(json.load(sys.stdin)["repo_id"])'); echo "$R2" > $ERGEBNIS/sf-repo2
ANNA=$(sed -n 1p $ERGEBNIS/sf-nutzer | awk '{print $1}')
a -o /dev/null -X PUT "$B/api2/repos/$R2/dir/shared_items/?p=/" -d share_type=user -d "username=$ANNA" -d permission=rw
docker exec $KA sh -c 'mkdir -p /arbeit/firma2 && python3 /testordner.py /arbeit/firma2 >/dev/null && printf "*/.git/\n*/node_modules/\n.git/\nnode_modules/\n" > /arbeit/firma2/seafile-ignore.txt'
docker exec $KB mkdir -p /arbeit/firma2
st() { docker exec $1 seaf-cli status 2>/dev/null | grep Firma2 | awk -F'\t' '{print $2}' | tr -d ' '; }
warte2() { # erst einen Zustand sehen, der NICHT synchronized ist, dann synchronized
  local gesehen=0 s
  for i in $(seq 1 3600); do s=$(st $1)
    case "$s" in synchronized) [ $gesehen -eq 1 ] && return 0;; "") ;; *) gesehen=1;; esac
    [ $gesehen -eq 0 ] && [ $i -gt 120 ] && { echo "   nie etwas anderes als '$s' gesehen"; return 0; }
    sleep 0.5; done; echo "   ZEIT UM ($s)"; }
echo "--- Abgleich hoch (Klient A, anna), frische Bibliothek"
ram_mitschreiben seafile "$ERGEBNIS/seafile-hoch2.ram"
t0=$(date +%s.%N); docker exec $KA seaf-cli sync -l $R2 -s $S -d /arbeit/firma2 -u anna@j33mess.test -p $N >/dev/null 2>&1
# der erste "synchronized" ist der leere Abruf; danach beginnt das Hochladen
sleep 2; warte2 $KA; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/seafile-hoch2.ram"
echo "Dauer hoch: $(echo "$t1 - $t0" | bc) s   (Zustand: $(st $KA))"
echo "   am Server: $(a "$B/api/v2.1/repos/$R2/" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("file_count"), "Dateien,", d.get("size"), "Bytes")')"
wacht
echo "--- Abgleich herunter (Klient B, admin)"
ram_mitschreiben seafile "$ERGEBNIS/seafile-runter2.ram"
t0=$(date +%s.%N); docker exec $KB seaf-cli sync -l $R2 -s $S -d /arbeit/firma2 -u admin@j33mess.test -p $AP >/dev/null 2>&1; warte2 $KB; t1=$(date +%s.%N); ram_stopp "$ERGEBNIS/seafile-runter2.ram"
echo "Dauer herunter: $(echo "$t1 - $t0" | bc) s"
docker exec $KB sh -c 'cd /arbeit/firma2; echo "bei B: datei-* $(find . -type f -name "datei-*" | wc -l)  .git: $(find . -path "*/.git/*" -type f | wc -l)  node_modules: $(find . -path "*/node_modules/*" -type f | wc -l)  .claude: $(find . -path "*/.claude/*" -type f | wc -l)"'
python3 spitze.py $ERGEBNIS/seafile-hoch2.ram $ERGEBNIS/seafile-runter2.ram
for v in j33mess-seafile_daten j33mess-seafile_db; do echo "$v $(volumen_mb $v) MB"; done
wacht && echo wacht-ok
