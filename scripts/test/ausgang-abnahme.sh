#!/bin/bash
# =============================================================================
# Abnahme „Ausgangs-Proxy und Verbindungsseite" (J38, 02.10.2026)
# =============================================================================
# Gemessen wird AUS EINEM APP-CONTAINER, nicht aus dem Compose-File:
#
#   - eine Probe-App mit `verbindungen: [example.org]` erreicht example.org
#     ueber den Proxy (CONNECT 200, TLS-Handshake, HTTP-Antwort),
#   - example.com und 1.1.1.1 (nicht eingetragen) werden abgewiesen (403),
#   - ohne den Proxy kommt sie nirgends hin (direkt example.org: nein),
#   - ein Zugang einer anderen App (falscher Token) geht nicht durch (407),
#   - Admin > Verbindungen (`GET /api/ausgang`) zeigt eingetragen, genutzt mit
#     Anzahl und zuletzt, abgewiesen,
#   - das Protokoll steht nach einem Neustart von Proxy UND Backend noch da,
#   - die Last des Proxys im Leerlauf (docker stats, 10 Messungen),
#   - belege-live, abschluss und probe-faktum-belege laufen weiter (jede App
#     einzeln: lieferbar und gesund; die zwei Namen werden genannt, wenn da).
#
# WAS ES ANLEGT, RAEUMT ES WEG (die Probe-App samt Datenbank, den Schluessel).
# Die Zaehler der Probe-App (Zeilen in `ausgang_zaehler`) bleiben nicht: das
# Entfernen der App loescht sie nicht, deshalb raeumt das Skript sie am Ende
# selbst weg.
#
# Aufruf vom Arbeitsrechner, als probe-admin (NIE als admin):
#   ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
#   ARASUL_BENUTZER=probe-admin ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#     ARASUL_GERAET=arasul@192.168.0.197 bash scripts/test/ausgang-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-daten"
APP="${ARASUL_PROBE_APP:-probe-j38-ausgang}"
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
  am_geraet "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c \"DELETE FROM public.ausgang_zaehler WHERE app_id = '$APP'\"" >/dev/null 2>&1
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Zaehler geloescht, Wegwerf-Schluessel widerrufen\n' "$APP"
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

echo "=== Abnahme: Ausgangs-Proxy und Verbindungsseite (J38) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung' "$([ -n "$TOK" ] && echo ja || echo nein)" "als $ARASUL_BENUTZER"
[ -z "$TOK" ] && exit 1

# --- 1. Der Proxy laeuft ------------------------------------------------------
PROXY=egress-proxy
pruefe 'egress-proxy laeuft und ist gesund' \
  "$(ja_wenn "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' $PROXY" 2>/dev/null)" healthy)"
NETZE=$(am_geraet "docker inspect --format '{{range \$n,\$_ := .NetworkSettings.Networks}}{{\$n}} {{end}}' $PROXY" 2>/dev/null | tr ' ' '\n' | sort | xargs)
pruefe "egress-proxy haengt in arasul-apps und arasul-frontend" \
  "$(ja_wenn "$NETZE" "$NETZ ${NETZ%apps}frontend")" "Netze: $NETZE"
pruefe 'egress-proxy veroeffentlicht keinen Port am Host' \
  "$(ja_wenn "$(am_geraet "docker port $PROXY" 2>/dev/null | wc -l | tr -d ' ')" 0)"

# --- 2. Die Proben-App mit verbindungen [example.org] -----------------------------
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J38 (Ausgang)","allowed_endpoints":["app:deploy"]}' \
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
m["verbindungen"] = ["example.org"]
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$ARBEIT/antwort" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP mit verbindungen [example.org] in den Teststand eingespielt" \
  "$([ "$CODE" = "201" ] || [ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"

CONTAINER="arasul-app-$APP-test"
ende=$((SECONDS + 240))
while [ "$SECONDS" -lt "$ende" ]; do
  [ "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null)" = "healthy" ] && break
  sleep 5
done
pruefe "der Container $CONTAINER ist gesund" \
  "$(ja_wenn "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null)" healthy)"
ENV_PROXY=$(am_geraet "docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $CONTAINER" 2>/dev/null | grep -c '^HTTPS_PROXY=http://')
pruefe 'HTTPS_PROXY steht in der Umgebung der App' "$(ja_wenn "$ENV_PROXY" 1)"

# Der Proxy holt Regeln alle zehn Sekunden: warten, bis er sie kennt.
sleep 12

# --- 3. Gemessen aus dem Container ---------------------------------------------
cat >"$ARBEIT/messen.js" <<'JS'
const net = require('net');
const tls = require('tls');
const http = require('http');
const proxy = new URL(process.env.HTTPS_PROXY);
const zugang = (user, token) =>
  'Basic ' + Buffer.from(decodeURIComponent(user) + ':' + token).toString('base64');

// Ein HTTPS-Aufruf ueber den Proxy: CONNECT, dann TLS, dann GET /.
function ueberProxy(host, token = proxy.password) {
  return new Promise(fertig => {
    const q = http.request({
      host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: host + ':443',
      headers: { 'Proxy-Authorization': zugang(proxy.username, token), Host: host + ':443' },
      timeout: 15000,
    });
    q.on('timeout', () => { q.destroy(); fertig({ connect: 0, was: 'Zeitueberschreitung' }); });
    q.on('error', e => fertig({ connect: 0, was: e.code || e.message }));
    q.on('connect', (res, sock) => {
      if (res.statusCode !== 200) { sock.destroy(); return fertig({ connect: res.statusCode }); }
      const t = tls.connect({ socket: sock, servername: host }, () => {
        t.write('GET / HTTP/1.1\r\nHost: ' + host + '\r\nConnection: close\r\n\r\n');
      });
      let kopf = '';
      t.on('data', d => { kopf += d.toString('latin1').slice(0, 200); t.destroy(); });
      t.on('close', () => fertig({ connect: 200, http: Number((kopf.split(' ')[1]) || 0) }));
      t.on('error', e => fertig({ connect: 200, was: 'TLS: ' + (e.code || e.message) }));
    });
    q.end();
  });
}
const direkt = (host) =>
  new Promise(fertig => {
    const s = net.connect({ host, port: 443, timeout: 5000 });
    s.on('connect', () => { s.destroy(); fertig({ ok: true }); });
    s.on('timeout', () => { s.destroy(); fertig({ ok: false, was: 'Zeitueberschreitung' }); });
    s.on('error', e => fertig({ ok: false, was: e.code || e.message }));
  });
(async () => {
  const eingetragen = [];
  for (let i = 0; i < 3; i++) eingetragen.push(await ueberProxy('example.org'));
  const andere = [await ueberProxy('example.com'), await ueberProxy('example.com')];
  const ip = await ueberProxy('1.1.1.1');
  const fremderToken = await ueberProxy('example.org', 'f'.repeat(64));
  const ohneProxy = await direkt('example.org');
  const ohneProxyIp = await direkt('1.1.1.1');
  console.log(JSON.stringify({ eingetragen, andere, ip, fremderToken, ohneProxy, ohneProxyIp }));
})();
JS
ERGEBNIS=$(am_geraet "docker exec -i -w /app $CONTAINER node -" <"$ARBEIT/messen.js" 2>"$ARBEIT/fehler")
messung() { printf '%s' "$ERGEBNIS" | feld "$1"; }
[ -z "$ERGEBNIS" ] && cat "$ARBEIT/fehler"

pruefe 'example.org (eingetragen) ueber den Proxy: CONNECT 200' "$(ja_wenn "$(messung eingetragen.0.connect)" 200)" "$(messung eingetragen.0.was)"
pruefe 'example.org: TLS-Handshake und HTTP-Antwort 200' "$(ja_wenn "$(messung eingetragen.0.http)" 200)" "$(messung eingetragen.0.was)"
pruefe 'example.com (nicht eingetragen): 403' "$(ja_wenn "$(messung andere.0.connect)" 403)"
pruefe '1.1.1.1 (nicht eingetragen, IP): 403' "$(ja_wenn "$(messung ip.connect)" 403)"
pruefe 'Zugang einer anderen App (falscher Token): 407' "$(ja_wenn "$(messung fremderToken.connect)" 407)"
pruefe 'ohne Proxy erreicht die App example.org nicht' "$(ja_wenn "$(messung ohneProxy.ok)" false)" "$(messung ohneProxy.was)"
pruefe 'ohne Proxy erreicht die App 1.1.1.1 nicht' "$(ja_wenn "$(messung ohneProxyIp.ok)" false)" "$(messung ohneProxyIp.was)"

# Die eigene Datenbank und die Plattform-API gehen weiter, am Proxy vorbei.
CODE=$(am_geraet "docker exec $CONTAINER node -e \"require('net').connect({host:'dashboard-backend',port:3001,timeout:4000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))\"; echo \$?")
pruefe 'Plattform-API (dashboard-backend:3001) bleibt erreichbar' "$(ja_wenn "$CODE" 0)"

# --- 4. Die Verbindungsseite ------------------------------------------------------
abfrage() {
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/ausgang" |
    python3 -c 'import sys,json
app = sys.argv[1]
try: d = json.load(sys.stdin)["data"]
except Exception: print("kein-ergebnis"); raise SystemExit
a = next((x for x in d["apps"] if x["id"] == app), None)
if not a: print("keine-app"); raise SystemExit
def z(l, h):
    e = next((x for x in l if x["host"] == h), None)
    return "%s/%s" % (e["anzahl"], "ja" if e["zuletzt"] else "nein") if e else "-"
print("|".join([",".join(x["host"] for x in a["eingetragen"]) or "-", z(a["genutzt"], "example.org"), z(a["abgewiesen"], "example.com"), z(a["abgewiesen"], "1.1.1.1"), z(a["genutzt"], "example.com")]))' "$APP"
}
# Der Proxy meldet alle fuenf Sekunden: bis zu 30 s warten.
ende=$((SECONDS + 30))
while [ "$SECONDS" -lt "$ende" ]; do
  A=$(abfrage)
  case "$A" in *"|3/ja|2/ja|1/ja|-") break ;; esac
  sleep 3
done
IFS='|' read -r EINGETRAGEN GENUTZT ABG_COM ABG_IP GENUTZT_COM <<<"$A"
pruefe 'Verbindungen: eingetragen = example.org' "$(ja_wenn "$EINGETRAGEN" example.org)"
pruefe 'Verbindungen: genutzt example.org, 3 Aufrufe, mit Zeitpunkt' "$(ja_wenn "$GENUTZT" 3/ja)" "$GENUTZT"
pruefe 'Verbindungen: abgewiesen example.com, 2 Aufrufe' "$(ja_wenn "$ABG_COM" 2/ja)" "$ABG_COM"
pruefe 'Verbindungen: abgewiesen 1.1.1.1, 1 Aufruf' "$(ja_wenn "$ABG_IP" 1/ja)" "$ABG_IP"
pruefe 'Verbindungen: abgewiesenes Ziel steht NICHT unter genutzt' "$(ja_wenn "$GENUTZT_COM" -)"

CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "$BASIS/api/ausgang")
pruefe 'GET /api/ausgang ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 -H 'x-egress-token: falsch' "$BASIS/api/ausgang/regeln")
pruefe 'GET /api/ausgang/regeln mit falschem Token: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"

# --- 5. Das Protokoll ueberlebt einen Neustart ------------------------------------
am_geraet "docker restart $PROXY dashboard-backend" >/dev/null 2>&1
ende=$((SECONDS + 180))
while [ "$SECONDS" -lt "$ende" ]; do
  [ "$(am_geraet "docker inspect --format '{{.State.Health.Status}}' dashboard-backend" 2>/dev/null)" = "healthy" ] && break
  sleep 5
done
TOK=$(arasul_token)
A=$(abfrage)
IFS='|' read -r EINGETRAGEN GENUTZT ABG_COM ABG_IP GENUTZT_COM <<<"$A"
pruefe 'nach dem Neustart von Proxy und Backend: genutzt, abgewiesen, eingetragen noch da' \
  "$(ja_wenn "$EINGETRAGEN|$GENUTZT|$ABG_COM|$ABG_IP" 'example.org|3/ja|2/ja|1/ja')" "$A"

# Und der Proxy geht nach dem Neustart wieder an die Arbeit (Regeln neu geholt).
sleep 15
ERGEBNIS=$(am_geraet "docker exec -i -w /app $CONTAINER node -" <"$ARBEIT/messen.js" 2>/dev/null)
pruefe 'nach dem Neustart erreicht die App example.org weiter' "$(ja_wenn "$(messung eingetragen.0.connect)" 200)"
pruefe 'und example.com bleibt abgewiesen' "$(ja_wenn "$(messung andere.0.connect)" 403)"

# --- 6. Last des Proxys im Leerlauf ------------------------------------------------
sleep 20
STATS=$(am_geraet "for i in 1 2 3 4 5 6 7 8 9 10; do docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' $PROXY; sleep 1; done" 2>/dev/null)
CPU_MAX=$(printf '%s\n' "$STATS" | awk '{ gsub("%","",$1); if ($1+0 > m) m = $1+0 } END { printf "%.2f", m }')
MEM=$(printf '%s\n' "$STATS" | tail -1 | awk '{print $2 $3}')
printf 'MESSUNG  Leerlauf des Proxys: CPU hoechstens %s %% (10 Messungen), Speicher %s\n' "$CPU_MAX" "$MEM"
pruefe 'Leerlauf: CPU unter 5 %' "$(awk -v c="$CPU_MAX" 'BEGIN { print (c < 5) ? "ja" : "nein" }')" "$CPU_MAX %"

# --- 7. Laufende Apps ohne Eintrag duerfen nicht kaputt sein -----------------------
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
for erwartet in belege abschluss probe-faktum-belege; do
  grep -q "^$erwartet|" "$ARBEIT/apps.txt" && printf 'gesehen  %s steht auf dem Geraet\n' "$erwartet" || printf 'hinweis  %s ist auf diesem Geraet nicht eingespielt\n' "$erwartet"
done

echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
