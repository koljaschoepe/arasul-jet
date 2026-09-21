# Orin. Probe 1 (Nextcloud): echte Dateien unter lesbarem Pfad? Sieht der Dienst eine von aussen
# geaenderte Datei -- (a) im Teamordner ohne Zutun, (b) nach `occ groupfolders:scan`,
# (c) in einem als "lokaler Speicher" eingebundenen Ordner mit Pruefung bei jedem Zugriff.
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
occ() { docker exec -u www-data j33nach-nextcloud-server php occ "$@"; }
B=http://127.0.0.1:18081/remote.php/dav; U="anna:j33nach-anna-2026"
P=~/j33nach/nextcloud/html/data/__groupfolders/1
echo "--- Pfad am Geraet ohne sudo:"; ls $P 2>&1 | head -2; stat -c '%U:%G %a' ~/j33nach/nextcloud/html/data 2>&1
echo "--- Pfad am Geraet mit sudo:"; sudo ls $P | head -5; sudo stat -c 'Eigentuemer %U (%u), Rechte %a' $P
F=$(sudo find $P -type f -name '*.md' | head -1); R=${F#$P/files/}; echo "Probedatei: $R"
size_api() { curl -s -u "$U" -X PROPFIND -H 'Depth: 0' "$B/files/anna/Firma/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$1")" | grep -o '<d:getcontentlength>[^<]*' | sed 's/.*>//'; }
warte() { # <kommando das 0 liefert wenn gesehen> ; Sekunden bis zum Sehen, max 60
  t0=$(date +%s.%N); for i in $(seq 1 60); do eval "$1" && break; sleep 1; done
  [ $i -lt 60 ] && echo "gesehen nach $(python3 -c "print(round($(date +%s.%N)-$t0,1))") s" || echo "NICHT gesehen in 60 s"; }
echo "--- (a) Datei im Teamordner von aussen veraendern (als www-data, wie ein anderer Prozess mit Recht dort)"
v=$(size_api "$R"); echo "Groesse laut API vorher: $v"
sudo sh -c "echo 'von aussen' >> '$F'"; n=$(stat -c %s "$F" 2>/dev/null || sudo stat -c %s "$F"); echo "Groesse auf der Platte jetzt: $n"
warte '[ "$(size_api "$R")" != "$v" ]'
echo "--- (b) nach occ groupfolders:scan 1"
occ groupfolders:scan 1 2>&1 | tail -2; echo "Groesse laut API: $(size_api "$R")"
echo "--- (a2) neue Datei von aussen"
sudo sh -c "echo neu > $P/files/Arbeitsbaum/von-aussen.txt; chown 33:33 $P/files/Arbeitsbaum/von-aussen.txt"
warte '[ "$(curl -s -o /dev/null -w %{http_code} -u "$U" "$B/files/anna/Firma/Arbeitsbaum/von-aussen.txt")" = 200 ]'
echo "--- (c) lokaler Speicher /mnt/extern mit Pruefung bei jedem Zugriff"
occ app:enable files_external >/dev/null 2>&1
[ -n "$(occ files_external:list | grep Extern)" ] || occ files_external:create Extern local null::null -c datadir=/mnt/extern 2>&1 | tail -1
occ files_external:option 1 filesystem_check_changes 1 >/dev/null; occ files_external:applicable --add-user=anna 1 >/dev/null
mkdir -p ~/j33nach/nextcloud/extern; echo eins > ~/j33nach/nextcloud/extern/a.txt; chmod 666 ~/j33nach/nextcloud/extern/a.txt
echo "Anna sieht: $(curl -s -u "$U" -X PROPFIND -H 'Depth: 1' $B/files/anna/Extern/ | grep -o '<d:href>[^<]*' | tr '\n' ' ')"
echo "zweiter Inhalt von aussen"  >> ~/j33nach/nextcloud/extern/a.txt; echo neu > ~/j33nach/nextcloud/extern/b.txt
warte '[ "$(curl -s -o /dev/null -w %{http_code} -u "$U" "$B/files/anna/Extern/b.txt")" = 200 ]'
echo "a.txt laut API: $(curl -s -u "$U" $B/files/anna/Extern/a.txt | tr '\n' '|')"
wacht && echo wacht-ok
