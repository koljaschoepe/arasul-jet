cd ~/j33mess && . ./lib.sh
B=http://127.0.0.1:18081
curl -s -u anna:j33mess-Nutzer-2026 -H "OCS-APIRequest: true" -H "Accept: application/json" "$B/ocs/v2.php/apps/activity/api/v2/activity/all?limit=200" | python3 -c '
import json,sys,collections
d=json.load(sys.stdin)["ocs"]["data"]
print("anna sieht:", dict(collections.Counter(a["user"] for a in d)), "| Beispiel:", d[0]["datetime"], d[0]["user"], d[0]["subject"][:80])'
echo "Server-Spitze ohne Klienten (MiB):"
for f in hoch runter; do python3 - "$ERGEBNIS/nextcloud-$f.ram" <<'PY'
import sys,re
m=0
for z in open(sys.argv[1]):
    t=z.split()
    if len(t)<4: continue
    s=sum(int(x.split("=")[1]) for x in t[3].split(",") if "klient" not in x)
    k=sum(int(x.split("=")[1]) for x in t[3].split(",") if "klient" in x)
    m=max(m,s); 
print(" ", sys.argv[1].split("/")[-1], "Server+DB Spitze", m, "MiB")
PY
done
