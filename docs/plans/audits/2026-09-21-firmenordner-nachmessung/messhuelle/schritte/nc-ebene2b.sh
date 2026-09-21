# Mac. Probe 4b (Nextcloud): derselbe Zweck, aber so wie es geht -- die Kette lesbar machen und
# jeden Geschwisterordner einzeln SPERREN (das ist das Entziehen nach unten, das Kolja nicht
# will; gemessen wird, was es kostet und ob der Klient danach den Baum an der echten Stelle legt).
. "$(dirname "$0")/../mac.sh"
AD=admin:j33nach-Admin-2026; BEN=ben:j33nach-ben-2026; W=$NCB/remote.php/dav/files; N=0
acl() { N=$((N+1)); curl -s -o /dev/null -w "%{http_code} " -u $AD -X PROPPATCH "$W/admin/Firma/$1" -H 'Content-Type: application/xml' --data "<?xml version=\"1.0\"?><d:propertyupdate xmlns:d=\"DAV:\" xmlns:nc=\"http://nextcloud.org/ns\"><d:set><d:prop><nc:acl-list><nc:acl><nc:acl-mapping-type>user</nc:acl-mapping-type><nc:acl-mapping-id>ben</nc:acl-mapping-id><nc:acl-mask>31</nc:acl-mask><nc:acl-permissions>$2</nc:acl-permissions></nc:acl></nc:acl-list></d:prop></d:set></d:propertyupdate>"; }
st() { curl -s -o /dev/null -w '%{http_code}' -u $BEN "$@"; }
namen() { curl -s -u $AD -X PROPFIND -H 'Depth: 1' "$W/admin/Firma${1:+/$1}/" | grep -o '<d:href>[^<]*' | sed "s|<d:href>/remote.php/dav/files/admin/Firma/${1:+$1/}||; s|/\$||" | grep -v '^$' | python3 -c 'import sys,urllib.parse;[print(urllib.parse.unquote(l.strip())) for l in sys.stdin]'; }
echo "=== Kette lesbar (Wurzel, Arbeitsbaum, experiments = nur lesen), Blatt frei, alle Geschwister gesperrt"
acl "" 1; acl "Arbeitsbaum/experiments/010-firmenordner" 31
for n in $(namen Arbeitsbaum); do [ "$n" = experiments ] || acl "Arbeitsbaum/$n" 0; done
for n in $(namen Arbeitsbaum/experiments); do [ "$n" = 010-firmenordner ] || acl "Arbeitsbaum/experiments/$n" 0; done
for n in $(namen); do [ "$n" = Arbeitsbaum ] || acl "$n" 0; done
echo; echo "Regeln gesetzt (PROPPATCH): $N"
sieht() { curl -s -u $BEN -X PROPFIND -H 'Depth: 1' "$W/ben/Firma/$1" | grep -o '<d:href>[^<]*' | sed "s|<d:href>/remote.php/dav/files/ben/Firma/||" | tr '\n' ' '; }
echo "ben sieht in Firma/:               $(sieht '')"
echo "ben sieht in Arbeitsbaum/:         $(sieht Arbeitsbaum/)"
echo "ben sieht in .../experiments/:     $(sieht Arbeitsbaum/experiments/)"
echo "ben liest company/goal.md: $(st $W/ben/Firma/Arbeitsbaum/company/goal.md)   experiments/STIMME.md: $(st $W/ben/Firma/Arbeitsbaum/experiments/STIMME.md)   003-partnerumfrage: $(st -X PROPFIND -H 'Depth: 0' $W/ben/Firma/Arbeitsbaum/experiments/003-partnerumfrage)   Blatt/experiment.md: $(st $W/ben/Firma/Arbeitsbaum/experiments/010-firmenordner/experiment.md)"
echo "ben schreibt in die Kette (experiments/x.md): $(st -T /tmp/j33-start.txt $W/ben/Firma/Arbeitsbaum/experiments/x.md)   ins Blatt (y.md): $(st -T /tmp/j33-start.txt $W/ben/Firma/Arbeitsbaum/experiments/010-firmenordner/y.md)"
echo "--- Klient am Mac fuer ben: --path /Firma -> /tmp/j33-nben3"
mkdir -p /tmp/j33-nben3; find /tmp/j33-nben3 -mindepth 1 -delete 2>/dev/null; TAIL=2 ncs ben j33nach-ben-2026 /tmp/j33-nben3 --path /Firma
echo "lokaler Baum:"; (cd /tmp/j33-nben3 && find . -not -name '.sync*' | sort | head -14)
echo "--- ben legt lokal in der Kette (experiments/) und im Blatt je eine Datei an; Abgleich"
echo kette > /tmp/j33-nben3/Arbeitsbaum/experiments/nur-lokal.md; echo blatt > /tmp/j33-nben3/Arbeitsbaum/experiments/010-firmenordner/lokal-neu.md
TAIL=4 ncs ben j33nach-ben-2026 /tmp/j33-nben3 --path /Firma
echo "  Server Kette-Datei: $(curl -s -o /dev/null -w '%{http_code}' -u $AD $W/admin/Firma/Arbeitsbaum/experiments/nur-lokal.md)   Blatt-Datei: $(curl -s -o /dev/null -w '%{http_code}' -u $AD $W/admin/Firma/Arbeitsbaum/experiments/010-firmenordner/lokal-neu.md)"
echo "  lokal in experiments/ danach: $(ls /tmp/j33-nben3/Arbeitsbaum/experiments | tr '\n' ' ')"
