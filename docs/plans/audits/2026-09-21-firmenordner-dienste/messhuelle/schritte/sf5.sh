cd ~/j33mess && . ./lib.sh
set +e
B=http://127.0.0.1:18083; N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026; S=http://seafile.j33mess.test
KA=j33mess-seafile-klient-a; KB=j33mess-seafile-klient-b
TA=$(curl -s -d "username=admin@j33mess.test" -d "password=$AP" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
a() { curl -s -H "Authorization: Token $TA" -H "Accept: application/json" "$@"; }
R3=$(a -X POST $B/api2/repos/ -d name=Firma3 | python3 -c 'import json,sys; print(json.load(sys.stdin)["repo_id"])')
ANNA=$(sed -n 1p $ERGEBNIS/sf-nutzer | awk '{print $1}')
a -o /dev/null -X PUT "$B/api2/repos/$R3/dir/shared_items/?p=/" -d share_type=user -d "username=$ANNA" -d permission=rw
docker exec $KA sh -c 'mkdir -p /arbeit/firma3 && python3 /testordner.py /arbeit/firma3 >/dev/null && printf "*/.git/\n*/node_modules/\n" > /arbeit/firma3/seafile-ignore.txt'
t0=$(date +%s.%N); docker exec $KA seaf-cli sync -l $R3 -s $S -d /arbeit/firma3 -u anna@j33mess.test -p $N >/dev/null 2>&1
for i in $(seq 1 1200); do n=$(a "$B/api/v2.1/repos/$R3/" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("file_count") or 0)'); [ "$n" -ge 2000 ] && break; sleep 0.5; done
t1=$(date +%s.%N); echo "Dauer hoch (bis der Server $n Dateien nennt): $(echo "$t1 - $t0" | bc) s"
wacht && echo wacht-ok
