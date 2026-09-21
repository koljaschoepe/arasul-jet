# Mac. Probe 2 (OpenCloud): zwei Rechner schreiben gleichzeitig, drei Varianten, mit dem
# opencloudcmd 4.0.0 aus dem Herstellerpaket fuer macOS. A = anna, B = admin, je eigener Ordner.
. "$(dirname "$0")/../mac.sh"
D=$(cat /tmp/j33-oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D")
AN=anna:j33nach-anna-2026; AD=admin:j33nach-Admin-2026
A=${KA:-/tmp/j33-k-a}; B=${KB:-/tmp/j33-k-b}; mkdir -p $A $B
sync_a() { oc anna j33nach-anna-2026 Firma $A --remote-folder konflikt; }
sync_b() { oc admin j33nach-Admin-2026 Firma $B --remote-folder konflikt; }
server() { # Namen im Ordner und der Inhalt jeder Datei
  curl -ks -u $AN -X PROPFIND -H 'Depth: 1' "$OCB/dav/spaces/$DE/konflikt/" | python3 -c '
import sys,re,urllib.parse
for h in re.findall(r"<d:href>([^<]*)</d:href>", sys.stdin.read()):
    n=urllib.parse.unquote(h).split("/konflikt/",1)[-1]
    if n: print(n)' | sort | while read -r n; do
      case "$n" in "$1"*) echo "  Server: $n = $(curl -ks -u $AN "$OCB/dav/spaces/$DE/konflikt/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$n")" | tr '\n' ' ')";; esac; done; }
lokal() { for f in "$2"/"$1"*; do [ -f "$f" ] && echo "  $3: $(basename "$f") = $(tr '\n' ' ' < "$f")"; done; }
zeige() { server "$1"; lokal "$1" $A A; lokal "$1" $B B; }

echo "=== Vorbereitung: konflikt/d1..d3 anlegen, beide Rechner holen sie"
echo start > /tmp/j33-start.txt
for i in 1 2 3; do curl -ks -o /dev/null -w "PUT d$i %{http_code}\n" -u $AN -T /tmp/j33-start.txt "$OCB/dav/spaces/$DE/konflikt/d$i.md"; done
sync_a; sync_b; echo "A:"; ls $A; echo "B:"; ls $B

echo; echo "=== Variante 1: beide aendern dieselbe Datei in derselben Sekunde, gleichen gleichzeitig ab"
( echo "Fassung von A, kurz" > $A/d1.md ) & ( echo "Fassung von B, etwas laenger" > $B/d1.md ) & wait
sync_a > /dev/null & sync_b > /dev/null & wait
echo "nach dem ersten Abgleich:"; zeige d1
sync_a > /dev/null; sync_b > /dev/null; sync_a > /dev/null
echo "nach dem zweiten Abgleich:"; zeige d1

echo; echo "=== Variante 2: Aenderungen drei Sekunden auseinander, Abgleich gleichzeitig"
echo "A um $(date +%T)" > $A/d2.md; sleep 3; echo "B um $(date +%T), drei Sekunden spaeter" > $B/d2.md
sync_a > /dev/null & sync_b > /dev/null & wait
echo "nach dem ersten Abgleich:"; zeige d2
sync_a > /dev/null; sync_b > /dev/null; sync_a > /dev/null
echo "nach dem zweiten Abgleich:"; zeige d2

echo; echo "=== Variante 3: nacheinander -- A gleicht ab, B hatte den Stand nicht geholt und aendert ebenfalls"
echo "A aendert und gleicht ab" > $A/d3.md; sync_a > /dev/null
echo "B aendert auf altem Stand, laenger als A" > $B/d3.md; sync_b > /dev/null
echo "nach B:"; zeige d3
sync_a > /dev/null; sync_b > /dev/null; sync_a > /dev/null
echo "nach dem zweiten Abgleich:"; zeige d3
