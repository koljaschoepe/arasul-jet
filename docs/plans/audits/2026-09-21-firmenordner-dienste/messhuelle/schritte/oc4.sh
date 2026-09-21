cd ~/j33mess && . ./lib.sh
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); N="j33mess-Nutzer-2026"
KA=j33mess-opencloud-klient-a
docker exec $KA sh -c "mkdir -p /arbeit/probe && echo hallo > /arbeit/probe/x.md"
for url in "https://j33mess-opencloud-server:9200/remote.php/dav/spaces/$D" "https://j33mess-opencloud-server:9200/dav/spaces/$D"; do
  echo "== $url"
  docker exec $KA sh -c "owncloudcmd --trust -h --non-interactive -u anna -p $N /arbeit/probe '$url' >/tmp/probe.log 2>&1; echo rc=\$?; grep -iE 'error|abort|finished|propagat' /tmp/probe.log | tail -4 | cut -c1-250"
done
curl -ks -u "admin:j33mess-Admin-2026" -X PROPFIND -H "Depth: 1" "https://127.0.0.1:18082/dav/spaces/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D")/" | grep -o '<d:href>[^<]*' | tail -5
