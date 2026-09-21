# Mac. Probe 4 (Nextcloud): ben mit nur einem Ordner der Ebene 2 (Arbeitsbaum/experiments/010-firmenordner).
# Teamordner-ACL ist der einzige Weg, der auch "nach unten" einschraenkt; Kolja hat am 21.09.2026
# entschieden, dass Rechte nur vergeben werden. Gemessen wird deshalb erst, ob es mit REINEM VERGEBEN
# geht (wurzel gesperrt, Blatt frei), dann was es kostet, die Kette darueber lesbar zu machen.
. "$(dirname "$0")/../mac.sh"
AD=admin:j33nach-Admin-2026; BEN=ben:j33nach-ben-2026; W=$NCB/remote.php/dav/files
acl() { # <pfad> <benutzer> <rechte 0..31>
  curl -s -o /dev/null -w "  ACL $2=$3 auf $1: %{http_code}\n" -u $AD -X PROPPATCH "$W/admin/Firma/$1" -H 'Content-Type: application/xml' --data "<?xml version=\"1.0\"?><d:propertyupdate xmlns:d=\"DAV:\" xmlns:nc=\"http://nextcloud.org/ns\"><d:set><d:prop><nc:acl-list><nc:acl><nc:acl-mapping-type>user</nc:acl-mapping-type><nc:acl-mapping-id>$2</nc:acl-mapping-id><nc:acl-mask>31</nc:acl-mask><nc:acl-permissions>$3</nc:acl-permissions></nc:acl></nc:acl-list></d:prop></d:set></d:propertyupdate>"; }
st() { curl -s -o /dev/null -w '%{http_code}' -u $BEN "$@"; }
sieht() { curl -s -u $BEN -X PROPFIND -H 'Depth: 1' "$W/ben/Firma/$1" | grep -o '<d:href>[^<]*' | sed "s|<d:href>/remote.php/dav/files/ben/Firma/||" | tr '\n' ' '; }
ssh $ORIN 'docker exec -u www-data j33nach-nextcloud-server php occ group:adduser alle ben' | tail -1
echo "=== (a) NUR VERGEBEN: Wurzel Firma fuer ben gesperrt, nur das Blatt 010-firmenordner frei"
acl "" ben 0
acl Arbeitsbaum/experiments/010-firmenordner ben 31
echo "ben sieht in Firma/:                               $(sieht '')"
echo "ben liest Firma/Arbeitsbaum/company/goal.md:        $(st $W/ben/Firma/Arbeitsbaum/company/goal.md)"
echo "ben liest .../010-firmenordner/experiment.md:       $(st $W/ben/Firma/Arbeitsbaum/experiments/010-firmenordner/experiment.md)"
echo "--- (b) Kette darueber lesbar: Arbeitsbaum und experiments nur lesen (1); Blatt bleibt 31"
acl Arbeitsbaum ben 1
acl Arbeitsbaum/experiments ben 1
echo "ben sieht in Firma/Arbeitsbaum:                    $(sieht Arbeitsbaum/)"
echo "ben sieht in .../experiments:                      $(sieht Arbeitsbaum/experiments/)"
echo "ben liest Arbeitsbaum/company/goal.md:              $(st $W/ben/Firma/Arbeitsbaum/company/goal.md)   (Geschwister der Kette)"
echo "ben liest .../experiments/STIMME.md:                $(st $W/ben/Firma/Arbeitsbaum/experiments/STIMME.md)   (Datei neben dem Blatt)"
echo "ben liest .../experiments/003-partnerumfrage:       $(st -X PROPFIND -H 'Depth: 0' $W/ben/Firma/Arbeitsbaum/experiments/003-partnerumfrage)   (Geschwisterordner)"
echo "ben schreibt in die Kette (.../experiments/x.md):   $(st -T /tmp/j33-start.txt $W/ben/Firma/Arbeitsbaum/experiments/x.md)"
echo "ben schreibt ins Blatt (.../010-firmenordner/y.md): $(st -T /tmp/j33-start.txt $W/ben/Firma/Arbeitsbaum/experiments/010-firmenordner/y.md)"
echo "--- (c) Klient am Mac fuer ben: --path /Firma  ->  /tmp/j33-nben"
mkdir -p /tmp/j33-nben; TAIL=3 ncs ben j33nach-ben-2026 /tmp/j33-nben --path /Firma
echo "lokaler Baum:"; (cd /tmp/j33-nben && find . -not -name '.sync*' | sort | head -14)
echo "--- (d) ben legt lokal in der Kette eine Datei an und im Blatt eine; Abgleich"
echo kette > /tmp/j33-nben/Arbeitsbaum/experiments/nur-lokal.md; echo blatt > /tmp/j33-nben/Arbeitsbaum/experiments/010-firmenordner/lokal-neu.md
TAIL=3 ncs ben j33nach-ben-2026 /tmp/j33-nben --path /Firma
echo "  Server Kette-Datei: $(curl -s -o /dev/null -w '%{http_code}' -u $AD $W/admin/Firma/Arbeitsbaum/experiments/nur-lokal.md)   Blatt-Datei: $(curl -s -o /dev/null -w '%{http_code}' -u $AD $W/admin/Firma/Arbeitsbaum/experiments/010-firmenordner/lokal-neu.md)"
echo "  lokal nach dem Abgleich: $(ls /tmp/j33-nben/Arbeitsbaum/experiments | tr '\n' ' ')"
