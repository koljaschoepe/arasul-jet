cd ~/j33mess && . ./lib.sh
set +e
B=http://127.0.0.1:18083; AP=j33mess-Admin-2026
T=$(curl -s -d "username=admin@j33mess.test" -d "password=$AP" $B/api2/auth-token/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Token $T" "$B/api/v2.1/activities/?page=1&per_page=100" | python3 -c '
import json,sys,collections
ev=json.load(sys.stdin)["events"]
print(collections.Counter((e["author_name"],e["op_type"],e["obj_type"],e["repo_name"]) for e in ev).most_common(12))
print([k for k in ev[-1].keys()])'
ram_jetzt seafile
