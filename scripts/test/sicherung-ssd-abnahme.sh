#!/bin/bash
# =============================================================================
# sicherung-ssd-abnahme.sh — die SSD am Orin, ohne Handgriff (J37, 02.10.2026)
# =============================================================================
# Die Frage ist die, an der der Kundenweg KW7 haengt: steckt ein Kanzlei-Admin
# eine SSD an, sieht im Frontend, dass gesichert wurde, und holt eine App ohne
# Kommandozeile zurueck?
#
# Gemessen wird am echten Geraet, mit EINER Probe-App und EINEM Datentraeger mit
# Stempel im Namen -- nie an einer App, einem Ordner oder einer Sicherung des
# Kunden. Angemeldet wird als `probe-admin` (nie als `admin`):
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson bash scripts/test/sicherung-ssd-abnahme.sh
#
# DER DATENTRAEGER. `ARASUL_STICK` waehlt, wie er entsteht:
#
#   schleife  (Vorgabe) ein Abbild unter /home/arasul mit Stempel im Namen, mit
#             ext4 und dem Namen ARASUL-PROBEnnnn formatiert, per losetup als
#             Blockgeraet angesteckt. udev und systemd erkennen es genau wie
#             eine echte SSD -- das ist der Beweis fuer die ERKENNUNG ohne
#             Handgriff. Danach Loop-Geraet und Abbild weg. (Braucht sudo ohne
#             Rueckfrage am Geraet; das Formatieren trifft nur die Abbilddatei.)
#   tmpfs     ein tmpfs unter /mnt/arasul-sicherung und eine zustand.json von
#             Hand, so wie das Einhaengeskript sie schreibt. Das belegt alles
#             DAHINTER (Sicherung nur verschluesselt, Frontend, App
#             zurueckholen), NICHT die Erkennung durch udev.
#   echt      ein wirklich angesteckter Datentraeger; ARASUL_DATENTRAEGER nennt
#             seinen Namen. Es wird nichts erzeugt und nichts entfernt.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die Probe-App samt Datenbank und Image, den
# Wegwerf-Schluessel, den Datentraeger, ihre Sicherungsdateien und den Stand
# vor dem Zurueckholen. Die neue Sicherung des Geraets selbst bleibt (eine
# Sicherung zu loeschen ist riskanter, als eine zu behalten).
#
# Rueckgabe 0, wenn jede Pruefung gruen war.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

if [ -z "${ARASUL_BENUTZER:-}" ] || [ "${ARASUL_BENUTZER}" = "admin" ]; then
  echo "Nie als admin: das ist Koljas Konto. ARASUL_BENUTZER=probe-admin und das Passwort aus Bitwarden." >&2
  exit 2
fi

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-jetson}"
STICK="${ARASUL_STICK:-schleife}"
QUELLE="$WURZEL/tests/probe-daten"
ZEIT="$(date +%H%M%S)"
STEMPEL="probe-ssd-$(date +%Y%m%d)${ZEIT}"
APP="${ARASUL_PROBE_APP:-probe-j37-${ZEIT}}"
APPDB="${APP//-/_}"
LABEL="ARASUL-PROBE${ZEIT:2:4}"
ABBILD="/home/arasul/${STEMPEL}.img"
ZIEL="/mnt/arasul-sicherung"
GEDULD=1500
ARBEIT="$(mktemp -d)"
RUMPF="$ARBEIT/rumpf"

gruen=0
rot=0
pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1)); printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1)); printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
am_geraet() { ssh -o BatchMode=yes "$GERAET" "$@"; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, list):
        try: d = d[int(k)]
        except Exception: d = None
    elif isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}
zaehle_eintraege() {
  python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["eintraege"]))
except Exception: print("?")' 2>/dev/null
}

CODE=""
ruf() { # token|schluessel:… verb pfad [leib]
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) a+=(-H "x-api-key: ${wer#schluessel:}") ;;
    *) a+=(-H "authorization: Bearer $wer") ;;
  esac
  [ -n "$leib" ] && a+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF" 2>/dev/null; }

# Wo die Sicherungen und die Apps am Geraet liegen (aus den Mounts, nicht geraten).
quelle_von() { # Container, Ziel im Container
  am_geraet "docker inspect $1 -f '{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}'"
}

SCHLUESSEL=""
KEY_ID=""
SCHLEIFE=""
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
  case "$STICK" in
    schleife)
      am_geraet "sudo -n umount -l $ZIEL 2>/dev/null; [ -z '$SCHLEIFE' ] || sudo -n losetup -d '$SCHLEIFE' 2>/dev/null; rm -f '$ABBILD'; sudo -n rm -f /run/arasul-sicherung/zustand.json" >/dev/null 2>&1 ;;
    tmpfs)
      am_geraet "sudo -n umount -l $ZIEL 2>/dev/null; sudo -n rm -f /run/arasul-sicherung/zustand.json" >/dev/null 2>&1 ;;
  esac
  # Was die Probe-App an Sicherungsdateien und Staenden hinterlassen hat --
  # nur Dateien mit dem Stempel ihrer Kennung.
  SICH="$(quelle_von backup-service /backups 2>/dev/null)"
  [ -n "$SICH" ] && am_geraet "cd '$SICH' && rm -f postgres/apps/arasul_app_${APPDB}_* vor_wiederherstellung/arasul_app_${APPDB}_* vor_wiederherstellung/paket_${APP}_*" >/dev/null 2>&1
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s, Wegwerf-Schluessel, Datentraeger (%s)\n' "$APP" "$STICK"
}
trap aufraeumen EXIT

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi
echo "=== SSD am Orin (J37): Datentraeger '${STICK}', Probe-App ${APP} gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe "Anmeldung als ${ARASUL_BENUTZER}" "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && exit 1

# --- 1. Der Datentraeger kommt ------------------------------------------------
if [ "$STICK" != echt ] && am_geraet "mountpoint -q $ZIEL"; then
  echo "Unter $ZIEL haengt schon etwas. Nicht anfassen."
  STICK=keiner
  exit 2
fi
case "$STICK" in
  schleife)
    pruefe "Regel und Einheit sind installiert" \
      "$(am_geraet 'test -f /etc/udev/rules.d/99-arasul-sicherung.rules && test -f /etc/systemd/system/arasul-sicherung@.service && echo ja || echo nein')"
    SCHLEIFE=$(am_geraet "truncate -s 512M '$ABBILD' && mkfs.ext4 -q -F -L '$LABEL' '$ABBILD' && sudo -n losetup --find --show '$ABBILD'")
    pruefe "Abbild mit Dateisystem und Namen ${LABEL} als ${SCHLEIFE:-?} angesteckt" "$([ -n "$SCHLEIFE" ] && echo ja || echo nein)"
    ;;
  tmpfs)
    am_geraet "sudo -n mount -t tmpfs -o size=512m tmpfs $ZIEL && sudo -n mkdir -p /run/arasul-sicherung && printf '{\"name\":\"$LABEL\",\"label\":\"$LABEL\",\"dateisystem\":\"tmpfs\",\"geraet\":\"tmpfs\",\"uuid\":\"\",\"seit\":\"$(date -Iseconds)\"}' | sudo -n tee /run/arasul-sicherung/zustand.json >/dev/null"
    ;;
  echt) LABEL="${ARASUL_DATENTRAEGER:?ARASUL_DATENTRAEGER (Name des echten Datentraegers) fehlt}" ;;
  *) echo "Unbekannt: ARASUL_STICK=$STICK (schleife, tmpfs, echt)"; STICK=keiner; exit 2 ;;
esac

ende=$((SECONDS + 40))
while [ "$SECONDS" -lt "$ende" ]; do
  am_geraet "mountpoint -q $ZIEL" && break
  sleep 1
done
pruefe "Der Datentraeger ist ohne Handgriff unter $ZIEL eingehaengt" "$(am_geraet "mountpoint -q $ZIEL && echo ja || echo nein")" "$(am_geraet "findmnt -n -o SOURCE,FSTYPE $ZIEL" 2>/dev/null)"
if [ "$STICK" = schleife ]; then
  pruefe "Die systemd-Einheit hat ihn eingehaengt (nicht von Hand)" \
    "$(am_geraet "systemctl list-units 'arasul-sicherung@*' --no-legend 2>/dev/null | grep -c active" | awk '{print ($1>0)?"ja":"nein"}')" "$(am_geraet "systemctl list-units 'arasul-sicherung@*' --no-legend 2>/dev/null | head -1")"
fi
pruefe "zustand.json nennt den Namen" "$(ja_wenn "$(am_geraet 'cat /run/arasul-sicherung/zustand.json 2>/dev/null' | feld name)" "$LABEL")"
IM_DIENST=$(am_geraet "docker exec backup-service sh -c 'stat -c %d /arasul/extern; stat -c %d /backups'" | tr '\n' ' ')
set -- $IM_DIENST
pruefe "Der Sicherungsdienst sieht ihn (andere Geraetenummer als /backups), ohne Neustart" "$([ -n "${1:-}" ] && [ "${1:-}" != "${2:-}" ] && echo ja || echo nein)" "$IM_DIENST"

# --- 2. Das Dashboard nennt Name und freien Platz ----------------------------
ende=$((SECONDS + 30))
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK" GET /api/backup/status
  [ "$(rumpf | feld data.ausserhalb.datentraeger.angesteckt)" = "true" ] && break
  sleep 2
done
pruefe "GET /api/backup/status: Datentraeger angesteckt" "$(ja_wenn "$(rumpf | feld data.ausserhalb.datentraeger.angesteckt)" true)"
pruefe "... mit dem Namen ${LABEL}" "$(ja_wenn "$(rumpf | feld data.ausserhalb.datentraeger.name)" "$LABEL")"
FREI="$(rumpf | feld data.ausserhalb.datentraeger.frei)"
pruefe "... und freiem Platz" "$([ -n "$FREI" ] && [ "$FREI" -gt 0 ] 2>/dev/null && echo ja || echo nein)" "frei=$FREI"

# --- 3. Eine Probe-App ---------------------------------------------------------
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"name":"Abnahme J37 (SSD)","allowed_endpoints":["app:deploy"]}' "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld data.api_key); [ -z "$SCHLUESSEL" ] && SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld data.key_id); [ -z "$KEY_ID" ] && KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe "Wegwerf-Schluessel mit app:deploy" "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1
mkdir -p "$ARBEIT/paket"
cp -R "$QUELLE/backend" "$QUELLE/flows" "$ARBEIT/paket/"
python3 - "$QUELLE/app.json" "$ARBEIT/paket/app.json" "$APP" <<'PY'
import json, sys
quelle, ziel, kennung = sys.argv[1:4]
m = json.load(open(quelle)); m["id"] = kennung
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time "$GEDULD" -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP eingespielt" "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ja || echo nein)" "HTTP $CODE"
TEST="/apps/$APP/test/api"
# Die Anmeldung der App (Forward-Auth) kennt nur, wem sie freigegeben ist: der
# Probe-Admin ist Tester (Teststand) seiner eigenen Probe-App.
ruf "$TOK" GET /api/auth/me
ICH="$(rumpf | feld user.id)"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ICH,\"stand\":\"test\"}"
pruefe "Die Probe-App ist dem Probe-Admin im Teststand freigegeben" "$([ "$CODE" = 200 ] || [ "$CODE" = 201 ] && echo ja || echo nein)" "HTTP $CODE"
ende=$((SECONDS + 240)); gesund=nein
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK" GET "$TEST/gesund"; [ "$CODE" = 200 ] && { gesund=ja; break; }; sleep 4
done
ruf "$TOK" GET "/api/apps/$APP"
pruefe "Die Probe-App antwortet" "$gesund" "$([ "$gesund" = ja ] || printf 'HTTP %s, Stand: %s' "$CODE" "$(rumpf | head -c 400)")"
for i in 1 2 3 4 5; do ruf "$TOK" POST "$TEST/eintrag?text=vor-der-sicherung-$i"; done
ruf "$TOK" GET "$TEST/eintraege"
pruefe "Fuenf Eintraege in der Datenbank der App" "$(ja_wenn "$(rumpf | zaehle_eintraege)" 5)"
APPS_QUELLE="$(quelle_von dashboard-backend /arasul/apps)"
PAKET_PFAD="${APPS_QUELLE}/${APP}/1.0.0/backend/server.js"
SUMME_VORHER="$(am_geraet "sha256sum '$PAKET_PFAD' | cut -d' ' -f1")"
pruefe "Das Paket der Probe-App liegt am Geraet" "$([ -n "$SUMME_VORHER" ] && echo ja || echo nein)" "$PAKET_PFAD"

# --- 4. 'Jetzt sichern': nur Verschluesseltes auf dem Datentraeger --------------
ruf "$TOK" POST /api/backup/sicherung
pruefe "POST /api/backup/sicherung (Jetzt sichern): erfolg" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE"
pruefe "extern_status kopiert" "$(ja_wenn "$(rumpf | feld data.bericht.extern_status)" kopiert)"
pruefe "extern_klartext ist 0" "$(ja_wenn "$(rumpf | feld data.bericht.extern_klartext)" 0)"
DATEIEN=$(am_geraet "sudo -n find $ZIEL/arasul-sicherung -type f ! -name MANIFEST.json | wc -l" | tr -d ' ')
pruefe "Auf dem Datentraeger liegen Dateien" "$([ "${DATEIEN:-0}" -ge 7 ] && echo ja || echo nein)" "$DATEIEN"
KOEPFE=$(am_geraet "sudo -n sh -c 'for f in \$(find $ZIEL/arasul-sicherung -type f ! -name MANIFEST.json); do head -c 8 \$f; echo; done' | sort | uniq -c")
FREMDE=$(printf '%s\n' "$KOEPFE" | grep -vc 'Salted__' || true)
pruefe "Jede Datei beginnt mit 'Salted__' (openssl enc)" "$([ "$FREMDE" = 0 ] && echo ja || echo nein)" "$(printf '%s' "$KOEPFE" | tr -s ' \n' ' ')"
GZIP=$(am_geraet "sudo -n sh -c 'for f in \$(find $ZIEL/arasul-sicherung -type f ! -name MANIFEST.json); do [ \"\$(head -c 2 \$f | od -An -tx1 | tr -d \" \\n\")\" = 1f8b ] && echo \$f; done'")
TARK=$(am_geraet "sudo -n sh -c 'for f in \$(find $ZIEL/arasul-sicherung -type f ! -name MANIFEST.json); do [ \"\$(tail -c +258 \$f | head -c 5)\" = ustar ] && echo \$f; done'")
pruefe "Kein gzip-Kopf (1f8b) auf dem Datentraeger" "$([ -z "$GZIP" ] && echo ja || echo nein)" "$GZIP"
pruefe "Kein tar-Kopf (ustar) auf dem Datentraeger" "$([ -z "$TARK" ] && echo ja || echo nein)" "$TARK"
ruf "$TOK" GET /api/backup/extern/inhalt
pruefe "GET /api/backup/extern/inhalt nennt die Probe-App" "$(grep -qF "\"id\":\"$APP\"" "$RUMPF" && echo ja || echo nein)"
ruf "$TOK" GET /api/backup/status
pruefe "Status: verschluesselt gemeldet, kein Klartext auf dem Datentraeger" \
  "$([ "$(rumpf | feld data.ausserhalb.klartextDateien)" = 0 ] && [ "$(rumpf | feld data.letzteSicherung.verschluesselt)" = true ] && echo ja || echo nein)"

# --- 5. Schaden, dann im Frontend zurueckholen ---------------------------------
for i in 6 7 8; do ruf "$TOK" POST "$TEST/eintrag?text=nach-der-sicherung-$i"; done
am_geraet "rm -f '$PAKET_PFAD'" >/dev/null 2>&1
pruefe "Schaden gesetzt: drei Eintraege zu viel, ein Stueck des Pakets fehlt" "$(am_geraet "test ! -f '$PAKET_PFAD' && echo ja || echo nein")"

# Die Wege ohne Bestaetigung tun nichts.
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" '{"quelle":"extern"}'
pruefe "Ohne Bestaetigung: abgewiesen (400)" "$(ja_wenn "$CODE" 400)"
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" '{"bestaetigung":"falsch","quelle":"extern"}'
pruefe "Mit falscher Kennung: abgewiesen (400)" "$(ja_wenn "$CODE" 400)"
ruf "$TOK" GET "$TEST/eintraege"
pruefe "... und nichts wurde angefasst (noch acht Eintraege)" "$(ja_wenn "$(rumpf | zaehle_eintraege)" 8)"

# Der Browser: Liste, Dialog, doppelte Bestaetigung, Bericht.
if command -v node >/dev/null 2>&1 && [ -z "${ARASUL_OHNE_BROWSER:-}" ]; then
  arasul_sitzung_bauen "$TOK" >/dev/null 2>&1
  ARASUL_URL="$BASIS" ARASUL_SITZUNG="$ARASUL_SITZUNG" ARASUL_DATENTRAEGER="$LABEL" ARASUL_PROBE_APP="$APP" \
    node "$WURZEL/scripts/test/sicherung-ssd-bilder.mjs" | tee "$ARBEIT/browser.txt"
  ROTE=$(grep -c '^ROT' "$ARBEIT/browser.txt" || true)
  pruefe "Im Frontend: Name, freier Platz, doppelte Bestaetigung und Bericht" \
    "$([ "$ROTE" = 0 ] && grep -q 'gruen' "$ARBEIT/browser.txt" && echo ja || echo nein)"
else
  ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "{\"bestaetigung\":\"$APP\",\"quelle\":\"extern\",\"paket\":true}"
  pruefe "Zurueckgeholt ueber die Schnittstelle: erfolg" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE"
fi

# --- 6. Danach ist alles wieder da ----------------------------------------------
ende=$((SECONDS + 240)); gesund=nein
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK" GET "$TEST/eintraege"; [ "$CODE" = 200 ] && { gesund=ja; break; }; sleep 4
done
pruefe "Die Probe-App antwortet wieder" "$gesund"
pruefe "Ihre Daten: wieder genau die fuenf von vor der Sicherung" \
  "$(ja_wenn "$(rumpf | zaehle_eintraege)" 5)" "$(rumpf | head -c 200)"
pruefe "Ihr Paket: das fehlende Stueck ist Byte fuer Byte zurueck" \
  "$(ja_wenn "$(am_geraet "sha256sum '$PAKET_PFAD' 2>/dev/null | cut -d' ' -f1")" "$SUMME_VORHER")"
SICH="$(quelle_von backup-service /backups)"
pruefe "Der Stand von vorher liegt unter vor_wiederherstellung/" \
  "$(am_geraet "cd '$SICH' && compgen -G 'vor_wiederherstellung/arasul_app_${APPDB}_test_*' >/dev/null && echo ja || echo nein")"

# --- 7. Abziehen ------------------------------------------------------------------
if [ "$STICK" = schleife ]; then
  # Ein Abbild kennt kein Abziehen: `losetup -d` auf ein eingehaengtes Geraet
  # setzt nur autoclear, das Geraet bleibt. Den Abzug meldet der Kernel bei einem
  # echten Stick als remove-Ereignis -- das wird hier nachgestellt, die Regel
  # (config/udev) muss darauf die Einheit stoppen.
  am_geraet "sudo -n losetup -d '$SCHLEIFE'; sudo -n udevadm trigger --action=remove --sysname-match='${SCHLEIFE#/dev/}'; sudo -n udevadm settle" >/dev/null 2>&1
  ende=$((SECONDS + 30))
  while [ "$SECONDS" -lt "$ende" ]; do am_geraet "mountpoint -q $ZIEL" || break; sleep 1; done
  SCHLEIFE=""
  pruefe "Abgezogen: der Einhaengepunkt ist leer, die zustand.json weg" \
    "$(am_geraet "! mountpoint -q $ZIEL && ! test -f /run/arasul-sicherung/zustand.json && echo ja || echo nein")"
  ruf "$TOK" GET /api/backup/status
  pruefe "Das Dashboard sagt: kein Datentraeger angesteckt" "$(ja_wenn "$(rumpf | feld data.ausserhalb.datentraeger.angesteckt)" false)"
fi

echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
