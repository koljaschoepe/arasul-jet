#!/usr/bin/env bash
# Den Raum wegwerfen -- die zwei Aufrufe, die `ordnerdienst.loescheRaum` macht,
# einzeln gemessen: Dauer, Status, Antwort, RAM-Gipfel, und danach die drei
# Fragen an den Zustand (Platte, Liste, Suchindex).
#
#   ./02-wegwerfen.sh <kennung>
set -euo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="${1:-wegwerf}"
raum=$(cat "$ROH/raum-$KENNUNG.id")
weg="/graph/v1.0/drives/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$raum")"

zaehle() { find "$WURZEL/ablage/posix/projects/$KENNUNG" -type f 2>/dev/null | wc -l; }
im_index() { grep -roa "messdatei-[0-9]*" "$WURZEL/ablage/search" 2>/dev/null | wc -l; }
in_liste() {
  curl -sk -u "$ADMIN:$PASSWORT" "$BASIS/graph/v1.0/drives" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print(sum(1 for x in d.get("value",[]) if x.get("id")==sys.argv[1]))' "$raum"
}

echo "vorher: $(zaehle) Dateien, $(im_index) Indexeintraege, $(in_liste)x in der Liste"

ruf() {
  local marke="$1"; shift
  local anfang=$(date +%s.%N)
  local aus
  aus=$(curl -sk -u "$ADMIN:$PASSWORT" -X DELETE --max-time "${J33_MAXTIME:-1800}" \
        -w '\n<<status %{http_code} dauer %{time_total}>>' "$@" "$BASIS$weg" 2>&1) || true
  local ende=$(date +%s.%N)
  printf '%s\n' "$aus" | tail -c 600 | tee "$ROH/$marke.txt"
  echo "  (Wanduhr: $(python3 -c "print(round($ende-$anfang,1))") s)"
}

ram_gipfel "$KENNUNG-trash" ruf "$KENNUNG-trash"
echo "nach dem ersten DELETE: $(zaehle) Dateien, $(in_liste)x in der Liste"

ram_gipfel "$KENNUNG-purge" ruf "$KENNUNG-purge" -H 'Purge: T'
echo "nach dem Purge: $(zaehle) Dateien, $(im_index) Indexeintraege, $(in_liste)x in der Liste"

echo "--- RAM-Gipfel"
for m in "$KENNUNG-trash" "$KENNUNG-purge"; do
  echo -n "$m: "; sort -h "$ROH/$m.ram" 2>/dev/null | tail -1 || echo "(keine Probe)"
done
