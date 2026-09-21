cd ~/j33mess && . ./lib.sh
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); q() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }; DE=$(q "$D"); AP=j33mess-Admin-2026; B=https://127.0.0.1:18082
for f in konflikt konflikt2 konflikt3; do
  FID=$(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 0" "$B/dav/spaces/$DE/Projekte/proj-01/$f.md" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//')
  echo "== $f.md"
  curl -ks -u admin:$AP -X PROPFIND -H "Depth: 1" "$B/dav/meta/$(q "$FID")/v" | grep -o '<d:href>[^<]*' | sed 1d | while read -r h; do h=${h#<d:href>}; echo "   Version: $(curl -ks -u admin:$AP "$B$h")"; done
done
