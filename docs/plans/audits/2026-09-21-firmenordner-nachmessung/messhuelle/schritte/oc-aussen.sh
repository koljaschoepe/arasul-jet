# Orin. Probe 1 (OpenCloud/posix): liegen die Dateien als echte Dateien unter einem lesbaren
# Pfad, und sieht der Dienst eine von aussen geaenderte Datei -- ohne Zutun, wie lange dauert es?
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
B=https://127.0.0.1:18082; U="anna:j33nach-anna-2026"
D=$(cat ~/j33nach/oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D"); SID=${D#*\$}
P=~/j33nach/opencloud/daten/posix/projects/$SID
echo "--- Pfad am Geraet: $P"; ls -la "$P" | head -8; stat -c 'Eigentuemer %U (%u), Rechte %a' "$P"
echo "--- Dateien dort (ohne .oc-nodes) und Metadaten"; find "$P" -type f -not -path '*/.oc-nodes/*' | head -3; find "$P" -name '.oc-nodes' | head -2
F=$(find "$P" -type f -not -path '*/.oc-nodes/*' -name '*.md' | head -1); R=${F#$P/}; echo "Probedatei: $R"; getfattr -d "$F" 2>/dev/null | head -5
size_api() { curl -ks -u "$U" -X PROPFIND -H 'Depth: 0' "$B/dav/spaces/$DE/$1" | grep -o '<d:getcontentlength>[^<]*' | sed 's/.*>//'; }
echo "--- Aenderung von aussen: an eine vorhandene Datei anhaengen"
v=$(size_api "$R"); echo "Groesse laut API vorher: $v"
echo "von aussen $(date +%s)" >> "$F"; t0=$(date +%s.%N)
for i in $(seq 1 60); do n=$(size_api "$R"); [ "$n" != "$v" ] && break; sleep 1; done
echo "Groesse laut API nachher: $n, nach $(python3 -c "print(round($(date +%s.%N)-$t0,1))") s (Schleifen: $i)"
echo "--- neue Datei von aussen anlegen"
echo "neu von aussen" > "$P/von-aussen.txt"; t0=$(date +%s.%N)
for i in $(seq 1 60); do c=$(curl -ks -o /dev/null -w '%{http_code}' -u "$U" "$B/dav/spaces/$DE/von-aussen.txt"); [ "$c" = 200 ] && break; sleep 1; done
echo "GET von-aussen.txt: $c nach $(python3 -c "print(round($(date +%s.%N)-$t0,1))") s"
echo "--- Datei von aussen loeschen"
rm "$P/von-aussen.txt"; t0=$(date +%s.%N)
for i in $(seq 1 60); do c=$(curl -ks -o /dev/null -w '%{http_code}' -u "$U" "$B/dav/spaces/$DE/von-aussen.txt"); [ "$c" = 404 ] && break; sleep 1; done
echo "GET nach Loeschen: $c nach $(python3 -c "print(round($(date +%s.%N)-$t0,1))") s"
echo "--- Ordner von aussen anlegen mit Datei"
mkdir -p "$P/von-aussen-ordner/unten"; echo x > "$P/von-aussen-ordner/unten/d.txt"; t0=$(date +%s.%N)
for i in $(seq 1 60); do c=$(curl -ks -o /dev/null -w '%{http_code}' -u "$U" "$B/dav/spaces/$DE/von-aussen-ordner/unten/d.txt"); [ "$c" = 200 ] && break; sleep 1; done
echo "GET Datei im neuen Ordner: $c nach $(python3 -c "print(round($(date +%s.%N)-$t0,1))") s"
wacht && echo wacht-ok
