#!/usr/bin/env bash
# Einen Raum anlegen und mit N Dateien fuellen.
#
# DIE DATEIEN KOMMEN UEBER DIE PLATTE, NICHT UEBER WEBDAV, und das ist
# Absicht: so entsteht derselbe Baum wie beim Abgleich eines Menschen, aber in
# Sekunden statt in einer Viertelstunde, und der Beobachter des Dienstes
# (`STORAGE_USERS_POSIX_WATCH_FS`) nimmt sie auf -- genau der Weg, den die
# Karte als Eigenschaft dieses Dienstes nennt.
#
#   ./01-raum-fuellen.sh <kennung> <anzahl>
set -euo pipefail
. "$(dirname "$0")/../lib.sh"

KENNUNG="${1:-wegwerf}"
ANZAHL="${2:-6000}"

antwort=$(curl -sk -u "$ADMIN:$PASSWORT" -X POST "$BASIS/graph/v1.0/drives" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$KENNUNG\",\"description\":\"Messung J33\"}")
raum=$(printf '%s' "$antwort" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo "Raum $KENNUNG = $raum"

ziel="$WURZEL/ablage/posix/projects/$KENNUNG"
for i in $(seq 1 120); do [ -d "$ziel" ] && break; sleep 1; done
[ -d "$ziel" ] || { echo "Der Raum liegt nicht unter $ziel" >&2; exit 1; }

# Zwanzig Unterordner, damit der Baum nicht flach ist -- ein Arbeitsbaum ist
# es auch nicht, und ein Loeschlauf haengt an der Tiefe.
python3 - "$ziel" "$ANZAHL" "$KENNUNG" <<'PY'
import os, sys
ziel, anzahl, marke = sys.argv[1], int(sys.argv[2]), sys.argv[3]
for n in range(anzahl):
    unter = os.path.join(ziel, f"teil{n % 20:02d}")
    os.makedirs(unter, exist_ok=True)
    with open(os.path.join(unter, f"{marke}-{n:05d}.md"), "w") as f:
        f.write(f"# Messdatei {n}\nj33grenzenmarke\n")
PY
echo "Dateien auf der Platte: $(find "$ziel" -type f | wc -l)"
echo "$raum" > "$ROH/raum-$KENNUNG.id"
