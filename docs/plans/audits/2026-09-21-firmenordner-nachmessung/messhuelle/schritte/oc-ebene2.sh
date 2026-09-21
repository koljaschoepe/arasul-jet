# Mac. Probe 4 (OpenCloud): ein Nutzer (ben) mit nur einem Ordner der Ebene 2 -- bekommt er ihn
# mit dem Kommandozeilen-Klienten an die echte Stelle im Baum, und was ist mit der Kette darueber?
. "$(dirname "$0")/../mac.sh"
D=$(cat /tmp/j33-oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D")
AD=admin:j33nach-Admin-2026; BEN=6293559f-3a46-4e34-ab3a-14e38557fce5; BP=j33nach-ben-2026
EDIT=fb6c3e19-e378-47e5-b277-9732f9de6e21; VIEW=b1e2218d-eef8-4d4c-b82d-0f1a1b48f3b5
id_von() { curl -ks -u $AD -X PROPFIND -H 'Depth: 0' "$OCB/dav/spaces/$DE/$1" | grep -o '<oc:fileid>[^<]*' | sed 's/<oc:fileid>//'; }
lade() { curl -ks -u $AD -H 'Content-Type: application/json' -X POST "$OCB/graph/v1beta1/drives/$DE/items/$1/invite" -d "{\"recipients\":[{\"objectId\":\"$BEN\",\"@libre.graph.recipient.type\":\"user\"}],\"roles\":[\"$2\"]}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("   ->", "ok" if "value" in d else d)'; }
st() { curl -ks -o /dev/null -w '%{http_code}' -u "ben:$BP" "$@"; }

echo "=== (a) ben bekommt NUR Arbeitsbaum/experiments/010-firmenordner (Bearbeiten)"
lade "$(id_von Arbeitsbaum/experiments/010-firmenordner)" $EDIT
echo "Laufwerke von ben:"; curl -ks -u ben:$BP $OCB/graph/v1.0/me/drives | python3 -c 'import json,sys
for d in json.load(sys.stdin)["value"]: print("  ", d["driveType"], d["name"], d["id"])'
SH=$(curl -ks -u ben:$BP $OCB/graph/v1.0/me/drives | python3 -c 'import json,sys
print([d["id"] for d in json.load(sys.stdin)["value"] if d["driveType"]=="virtual"][0])')
echo "Was in Shares liegt:"; curl -ks -u ben:$BP -X PROPFIND -H 'Depth: 1' "$OCB/dav/spaces/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$SH")/" | grep -o '<d:href>[^<]*' | sed 's/<d:href>//'
mkdir -p /tmp/j33-ben/experiments
echo "--- Klient von ben in /tmp/j33-ben/experiments (Raum: Shares)"
TAIL=6 oc ben $BP "$SH" /tmp/j33-ben/experiments
echo "lokaler Baum von ben:"; (cd /tmp/j33-ben && find . | sort | head -12)
echo "--- Rechte von ben gegenprobiert (Raum Firma)"
echo "  lesen  Arbeitsbaum/company/goal.md            : $(st "$OCB/dav/spaces/$DE/Arbeitsbaum/company/goal.md")"
echo "  lesen  Arbeitsbaum/experiments/003-partnerumfrage : $(st -X PROPFIND -H 'Depth: 0' "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/003-partnerumfrage")"
echo "  lesen  .../010-firmenordner/experiment.md      : $(st "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/010-firmenordner/experiment.md")"
echo "  schreiben .../010-firmenordner/von-ben.md      : $(st -T /tmp/j33-start.txt "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/010-firmenordner/von-ben.md")"
echo "  schreiben Arbeitsbaum/experiments/von-ben.md   : $(st -T /tmp/j33-start.txt "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/von-ben.md")"
echo "--- ben schreibt lokal in die Kette darueber (experiments/) und in den Ordner; Abgleich"
echo "kette" > /tmp/j33-ben/experiments/nur-lokal.md; echo "im ordner" > /tmp/j33-ben/experiments/010-firmenordner/lokal-neu.md
TAIL=3 oc ben $BP "$SH" /tmp/j33-ben/experiments
echo "  Server Ordner-Datei: $(curl -ks -o /dev/null -w '%{http_code}' -u $AD "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/010-firmenordner/lokal-neu.md")   Kette-Datei (Arbeitsbaum/experiments): $(curl -ks -o /dev/null -w '%{http_code}' -u $AD "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/nur-lokal.md")"

echo; echo "=== (b) zusaetzlich: die Kette darueber lesbar machen = 'Arbeitsbaum/experiments' als Betrachter"
lade "$(id_von Arbeitsbaum/experiments)" $VIEW
echo "  ben liest jetzt Arbeitsbaum/experiments/003-partnerumfrage : $(st -X PROPFIND -H 'Depth: 0' "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/003-partnerumfrage")   (Geschwisterordner, den ben nicht haben sollte)"
echo "  ben liest Arbeitsbaum/experiments/STIMME.md : $(st "$OCB/dav/spaces/$DE/Arbeitsbaum/experiments/STIMME.md")"
echo "  ben liest Arbeitsbaum/company/goal.md (Ebene darueber, nicht freigegeben): $(st "$OCB/dav/spaces/$DE/Arbeitsbaum/company/goal.md")"
echo "  Shares von ben jetzt:"; curl -ks -u ben:$BP -X PROPFIND -H 'Depth: 1' "$OCB/dav/spaces/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$SH")/" | grep -o '<d:href>[^<]*' | sed 's/<d:href>//'
