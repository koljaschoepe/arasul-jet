#!/bin/bash
# =============================================================================
# Abnahme „Apps laufen in einem eigenen Netz ohne Internet" (J38, 02.10.2026)
# =============================================================================
# Gemessen wird AUS EINEM APP-CONTAINER, nicht aus dem Compose-File:
#
#   - die eigene Datenbank: ja
#   - die Datenbank einer anderen App: nein
#   - die Plattform-Datenbank `arasul_db`: nein
#   - Plattform-API (dashboard-backend:3001) und Traefik (reverse-proxy:443): ja
#   - das Internet (1.1.1.1:443): nein
#
# Davor am Geraet: das Netz `arasul-apps` gibt es und ist `internal`, und jeder
# App-Container haengt NUR dort. Danach, fuer jede App einzeln: laeuft der
# Stand, ist er gesund und lieferbar (Oberflaeche, Backend, Datenbank). Das
# ist die Probe, die nach dem Update ueber `belege-live`, `abschluss`, die
# Probe zu `belege` und jede weitere App sagt, ob eine im neuen Netz
# nicht hochkam.
#
# Die Proben-App ist `tests/probe-daten` unter einer eigenen Kennung; sie bringt
# Node und `pg` mit. WAS ES ANLEGT, RAEUMT ES WEG. Eine fremde App-Datenbank
# wird nur ANGEFRAGT (die Verbindung wird abgewiesen), nie gelesen.
#
# Aufruf vom Arbeitsrechner, als probe-admin (NIE als admin):
#   ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
#   ARASUL_BENUTZER=probe-admin ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#     ARASUL_GERAET=arasul@192.168.0.197 bash scripts/test/app-netz-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-daten"
APP="${ARASUL_PROBE_APP:-probe-j38-netz}"
GERAET="${ARASUL_GERAET:?ARASUL_GERAET (ssh-Ziel) fehlt: gemessen wird im Container am Geraet}"
NETZ="${ARASUL_APP_NETZ:-arasul-platform_arasul-apps}"
GEDULD=900

gruen=0
rot=0
pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
ja_wenn() { [ "$1" = "$2" ] && echo ja || echo nein; }
am_geraet() { ssh -o BatchMode=yes "$GERAET" "$@"; }

ARBEIT="$(mktemp -d)"
SCHLUESSEL=""
KEY_ID=""
TOK=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi

echo "=== Abnahme: Apps im Netz ohne Internet (J38) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung' "$([ -n "$TOK" ] && echo ja || echo nein)" "als $ARASUL_BENUTZER"
[ -z "$TOK" ] && exit 1

# --- 1. Das Netz --------------------------------------------------------------
INTERN=$(am_geraet "docker network inspect $NETZ --format '{{.Internal}}'" 2>/dev/null)
pruefe "das Netz $NETZ gibt es und ist internal" "$(ja_wenn "$INTERN" true)" "Internal=$INTERN"

FALSCH=$(am_geraet "docker ps -q --filter label=arasul.app | xargs -r docker inspect --format '{{.Name}} {{range \$n,\$_ := .NetworkSettings.Networks}}{{\$n}} {{end}}'" 2>/dev/null |
  awk -v netz="$NETZ" '{ if (NF != 2 || $2 != netz) print }')
ANZAHL=$(am_geraet "docker ps -q --filter label=arasul.app | wc -l" 2>/dev/null | tr -d ' ')
pruefe "jeder App-Container haengt NUR in $NETZ" "$([ -z "$FALSCH" ] && echo ja || echo nein)" \
  "${ANZAHL:-?} laufen${FALSCH:+; abweichend: $(printf '%s' "$FALSCH" | tr '\n' ';')}"

# --- 2. Die Proben-App kommt in den Teststand ----------------------------------
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J38 (Netz der Apps)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld data.api_key)
[ -z "$SCHLUESSEL" ] && SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld data.key_id)
[ -z "$KEY_ID" ] && KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1

mkdir -p "$ARBEIT/paket"
cp -R "$QUELLE/backend" "$QUELLE/flows" "$ARBEIT/paket/"
python3 - "$QUELLE/app.json" "$ARBEIT/paket/app.json" "$APP" <<'PY'
import json, sys
quelle, ziel, kennung = sys.argv[1:4]
m = json.load(open(quelle))
m["id"] = kennung
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
# Das neue Feld des Kontraktes 7 gehoert zum Paket: das Geraet muss es annehmen.
m["verbindungen"] = ["api.example.com"]
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$ARBEIT/antwort" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP mit dem Feld verbindungen in den Teststand eingespielt" \
  "$([ "$CODE" = "201" ] || [ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"

CONTAINER="arasul-app-$APP-test"
ende=$((SECONDS + 240))
while [ "$SECONDS" -lt "$ende" ]; do
  [ "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null)" = "healthy" ] && break
  sleep 5
done
pruefe "der Container $CONTAINER ist gesund" \
  "$(ja_wenn "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null)" healthy)"
NETZE=$(am_geraet "docker inspect --format '{{range \$n,\$_ := .NetworkSettings.Networks}}{{\$n}} {{end}}' $CONTAINER" 2>/dev/null | xargs)
pruefe "und haengt nur in $NETZ" "$(ja_wenn "$NETZE" "$NETZ")" "Netze: $NETZE"

# --- 3. Gemessen aus dem Container ---------------------------------------------
# Eine fremde Datenbank: irgendeine andere App-Datenbank des Geraets; gibt es
# keine, ein erfundener Name (auch dann muss die Verbindung scheitern).
EIGEN="arasul_app_$(printf '%s' "$APP" | tr '-' '_')_test"
FREMD=$(am_geraet "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c \"SELECT datname FROM pg_database WHERE datname LIKE 'arasul_app_%' AND datname <> '$EIGEN' ORDER BY datname LIMIT 1\"" 2>/dev/null)
[ -z "$FREMD" ] && FREMD="arasul_app_gibt_es_nicht_live"

cat >"$ARBEIT/messen.js" <<'JS'
const { Client } = require('pg');
const net = require('net');
const eigen = process.env.ARASUL_DB_URL;
const mitDb = name => eigen.replace(/\/[^/]*$/, '/' + name);
async function db(url) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 6000 });
  c.on('error', () => {});
  try {
    await c.connect();
    const r = await c.query('SELECT current_database() AS d');
    await c.end();
    return { ok: true, was: r.rows[0].d };
  } catch (e) {
    return { ok: false, was: String(e.message).slice(0, 100) };
  }
}
const tcp = (host, port) =>
  new Promise(fertig => {
    const s = net.connect({ host, port, timeout: 5000 });
    s.on('connect', () => { s.destroy(); fertig({ ok: true, was: 'verbunden' }); });
    s.on('timeout', () => { s.destroy(); fertig({ ok: false, was: 'Zeitueberschreitung' }); });
    s.on('error', e => fertig({ ok: false, was: e.code || e.message }));
  });
(async () => {
  const [eigene, fremde, plattform, api, traefik, internet, dns] = await Promise.all([
    db(eigen),
    db(mitDb(process.env.FREMD)),
    db(mitDb('arasul_db')),
    tcp('dashboard-backend', 3001),
    tcp('reverse-proxy', 443),
    tcp('1.1.1.1', 443),
    tcp('example.com', 443),
  ]);
  console.log(JSON.stringify({ eigene, fremde, plattform, api, traefik, internet, dns }));
})();
JS
ERGEBNIS=$(am_geraet "docker exec -i -e FREMD=$FREMD -w /app $CONTAINER node -" <"$ARBEIT/messen.js" 2>"$ARBEIT/fehler")
messung() { printf '%s' "$ERGEBNIS" | feld "$1"; }
[ -z "$ERGEBNIS" ] && cat "$ARBEIT/fehler"

pruefe 'eigene Datenbank: ja' "$(ja_wenn "$(messung eigene.ok)" true)" "$(messung eigene.was)"
pruefe 'Datenbank einer anderen App: verweigert' "$(ja_wenn "$(messung fremde.ok)" false)" "$FREMD: $(messung fremde.was)"
pruefe 'Plattform-Datenbank arasul_db: verweigert' "$(ja_wenn "$(messung plattform.ok)" false)" "$(messung plattform.was)"
pruefe 'Plattform-API (dashboard-backend:3001): ja' "$(ja_wenn "$(messung api.ok)" true)" "$(messung api.was)"
pruefe 'Traefik (reverse-proxy:443): ja' "$(ja_wenn "$(messung traefik.ok)" true)" "$(messung traefik.was)"
pruefe 'Internet (1.1.1.1:443): nein' "$(ja_wenn "$(messung internet.ok)" false)" "$(messung internet.was)"
pruefe 'Name im Internet (example.com): nein' "$(ja_wenn "$(messung dns.ok)" false)" "$(messung dns.was)"

# Traefik erreicht das Backend der App ueber das neue Netz: aus dem Traefik-Container
# gefragt, mit dem Namen der App. Eine Antwort der App (auch 401) heisst, der Weg
# steht; gemessen wird NICHT ueber `/apps/<id>/test/api/`, denn dort entscheidet
# zuerst die Anmeldung (403 fuer ein Konto ohne Zugang zu diesem Stand), und das
# ist keine Aussage ueber das Netz.
CODE=$(am_geraet "docker exec reverse-proxy wget -q -T 5 -O /dev/null http://$CONTAINER:8080/gesund >/dev/null 2>&1; echo \$?")
pruefe 'Traefik erreicht das Backend der App im neuen Netz (reverse-proxy -> App)' "$(ja_wenn "$CODE" 0)" "wget Rueckgabe $CODE"

# Die Plattform selbst erreicht ihre Datenbank weiter (zwei Netze, ein Name).
CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 -H "authorization: Bearer $TOK" "$BASIS/api/apps")
pruefe 'die Plattform erreicht ihre eigene Datenbank (GET /api/apps)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Jede laufende App einzeln ----------------------------------------------
echo
echo "--- Jede App, beide Staende ---"
curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/apps" |
  python3 -c 'import sys,json
try: apps = json.load(sys.stdin)["data"]
except Exception: apps = []
if isinstance(apps, dict): apps = apps.get("apps", [])
for a in apps:
    for stand in ("live", "test"):
        s = (a.get("staende") or {}).get(stand)
        if not s: continue
        b = s.get("backend") or {}
        print("%s|%s|%s|%s|%s|%s" % (a.get("id"), stand, s.get("version"), json.dumps(s.get("lieferbar")), b.get("gesundheit") or "-", s.get("mangel") or ""))' \
  >"$ARBEIT/apps.txt"
while IFS='|' read -r id stand version lieferbar gesundheit mangel; do
  [ -z "$id" ] && continue
  [ "$id" = "$APP" ] && continue
  ok=ja
  [ "$lieferbar" = "true" ] || ok=nein
  [ "$gesundheit" = "-" ] || [ "$gesundheit" = "healthy" ] || ok=nein
  pruefe "$id ($stand $version) lieferbar und gesund" "$ok" "lieferbar=$lieferbar gesundheit=$gesundheit${mangel:+ mangel=$mangel}"
done <"$ARBEIT/apps.txt"

echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
