#!/bin/bash
# =============================================================================
# Eine Anmeldung fuer die ganze Abnahme-Reihe (Entscheidung 27.08.2026)
# =============================================================================
# Wird mit `source` eingebunden, nicht aufgerufen.
#
# WARUM ES DIESE DATEI GIBT
#
# `loginLimiter` erlaubt ZEHN Anmeldungen je Viertelstunde und IP, und dabei
# bleibt es: die Drossel schuetzt das Erraten eines Passworts, und sie zu
# lockern, damit die eigenen Messungen bequemer werden, hiesse das Geraet fuer
# den Messaufbau zu schwaechen. Die Abnahmen brauchten zusammen mehr als zehn:
# `rollen-abnahme.sh` drei, `mitarbeiter-abnahme.sh` sechs, `endpunkte-live.py`
# eine, die vier Browser-Abnahmen zusammen eine. Zwei Reihen hintereinander
# sprengten die Drossel, und die Abnahmen meldeten daraufhin Dinge ueber das
# GERAET, die nur ueber den Messaufbau galten (siehe die Messung zu C2,
# "Der Wackler in der Rollen-Abnahme").
#
# Stand nach Phase C4: zwei fuer `rollen`, fuenf fuer `mitarbeiter`, zwei fuer
# `app-anmeldung`, eine geteilte -- zusammen genau zehn. Die Reihe sitzt damit
# auf der Grenze. Wer eine weitere Abnahme mit eigener Anmeldung dazustellt,
# muss vorher hier nachrechnen; sonst faellt mitten in der Reihe ein 429, und
# die Abnahme danach meldet etwas ueber den Messaufbau.
#
# Deshalb meldet sich EINE Stelle an -- `abnahmen.sh` -- und gibt den Token an
# alle weiter. Wer eine Abnahme einzeln fahren will, ruft sie wie bisher auf;
# dann meldet sie sich selbst an und legt den Token fuer die naechste ab.
#
# WAS DIE ABNAHMEN WEITERHIN SELBST TUN
#
# Ihre EIGENEN Zugaenge. `rollen-abnahme.sh` legt einen Abnahme-Admin und einen
# Abnahme-Mitarbeiter an und meldet beide an; das ist der Kern dessen, was sie
# misst, und laesst sich nicht teilen. Geteilt wird der Zugang des
# Administrators, mit dem jede Abnahme anfaengt.
#
# SCHNITTSTELLE
#
#   arasul_token            der Token; meldet an, wenn noetig
#   arasul_anmeldecode      der HTTP-Code der letzten Anmeldung ("" ohne)
#   arasul_token_ablegen    Token in die Datei schreiben (macht arasul_token selbst)
#   arasul_sitzung_bauen    aus dem Token eine Playwright-Sitzung fuer die .mjs
#
# Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TOKEN,
# ARASUL_TOKEN_DATEI, ARASUL_SITZUNG.
# =============================================================================

ARASUL_URL="${ARASUL_URL:-https://localhost:8443}"
ARASUL_BENUTZER="${ARASUL_BENUTZER:-admin}"
ARASUL_PASSWORT="${ARASUL_PASSWORT:-2309}"
ARASUL_TOKEN_DATEI="${ARASUL_TOKEN_DATEI:-${TMPDIR:-/tmp}/arasul-abnahme-token}"
ARASUL_SITZUNG="${ARASUL_SITZUNG:-${TMPDIR:-/tmp}/arasul-abnahme-sitzung.json}"

# Der Code landet in einer DATEI und nicht in einer Variablen: `arasul_token`
# wird als `TOK=$(arasul_token)` aufgerufen, und eine Kommandosubstitution ist
# eine Subshell. Was sie in eine Variable schreibt, ist beim naechsten Befehl
# wieder weg (dieselbe Falle wie in `hole_token`, Messung zu C2).
_ARASUL_CODE_DATEI="${TMPDIR:-/tmp}/arasul-abnahme-code"

arasul_anmeldecode() { cat "$_ARASUL_CODE_DATEI" 2>/dev/null; }

_arasul_json_feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k, {}) if isinstance(d, dict) else {}
print(d if isinstance(d, (str, int)) else "")' "$1" 2>/dev/null
}

# Traegt der Token noch? Eine Anfrage, die keine Anmeldung ist und damit die
# Drossel nicht anfasst.
_arasul_token_gilt() {
  [ -n "$1" ] || return 1
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "authorization: Bearer $1" "$ARASUL_URL/api/auth/me")
  [ "$code" = "200" ]
}

_arasul_anmelden() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -c "$ARASUL_TOKEN_DATEI.cookies" \
    -d "{\"username\":\"$ARASUL_BENUTZER\",\"password\":\"$ARASUL_PASSWORT\"}" \
    "$ARASUL_URL/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$_ARASUL_CODE_DATEI"
  printf '%s' "$antwort" | sed '$d' | _arasul_json_feld token
}

arasul_token_ablegen() {
  printf '%s' "$1" > "$ARASUL_TOKEN_DATEI"
  chmod 600 "$ARASUL_TOKEN_DATEI" 2>/dev/null
}

# Der Token, in dieser Reihenfolge:
#   1. $ARASUL_TOKEN  -- von `abnahmen.sh` gesetzt, keine Anmeldung
#   2. die abgelegte Datei, wenn sie noch gilt
#   3. einmal anmelden
arasul_token() {
  if [ -n "${ARASUL_TOKEN:-}" ]; then
    printf '%s' "$ARASUL_TOKEN"
    return 0
  fi
  local abgelegt
  abgelegt=$(cat "$ARASUL_TOKEN_DATEI" 2>/dev/null)
  if _arasul_token_gilt "$abgelegt"; then
    printf '%s' "$abgelegt"
    return 0
  fi
  local neu
  neu=$(_arasul_anmelden)
  [ -n "$neu" ] && arasul_token_ablegen "$neu"
  printf '%s' "$neu"
}

# Aus dem Token und den Anmelde-Cookies eine Playwright-Sitzung bauen, damit
# die vier Browser-Abnahmen dieselbe Anmeldung benutzen wie die curl-Abnahmen.
#
# Ohne das haetten Browser und Kommandozeile je eine eigene Anmeldung, und
# genau deren Summe hat die Drossel gesprengt. Die Datei enthaelt ein gueltiges
# Sitzungs-Cookie des Geraets; `.gitignore` schliesst sie aus.
arasul_sitzung_bauen() {
  local token="$1"
  [ -n "$token" ] || return 1
  ARASUL_TOKEN="$token" \
  ARASUL_SITZUNG="$ARASUL_SITZUNG" \
  ARASUL_URL="$ARASUL_URL" \
  ARASUL_COOKIES="$ARASUL_TOKEN_DATEI.cookies" \
  python3 - <<'PY'
import json, os, re, urllib.parse

ziel = os.environ["ARASUL_SITZUNG"]
gastgeber = urllib.parse.urlparse(os.environ["ARASUL_URL"]).hostname or "localhost"

# Das Sitzungs-Cookie ist HttpOnly und steht nur im Cookie-Jar von curl; der
# CSRF-Wert steht dort ebenfalls. Fehlt der Jar (Token kam aus $ARASUL_TOKEN
# ohne eigene Anmeldung), reicht das Sitzungs-Cookie aus dem Token: das
# Backend liest `arasul_session` als Bearer-Ersatz, und den CSRF-Wert holt
# sich die Oberflaeche selbst ueber GET /api/auth/csrf.
kekse = [{
    "name": "arasul_session",
    "value": os.environ["ARASUL_TOKEN"],
    "domain": gastgeber,
    "path": "/",
    "expires": -1,
    "httpOnly": True,
    "secure": True,
    "sameSite": "Strict",
}]
jar = os.environ.get("ARASUL_COOKIES", "")
if os.path.exists(jar):
    for zeile in open(jar, encoding="utf-8"):
        if zeile.startswith("#") and not zeile.startswith("#HttpOnly_"):
            continue
        teile = re.sub(r"^#HttpOnly_", "", zeile.strip()).split("\t")
        if len(teile) != 7 or teile[5] == "arasul_session":
            continue
        kekse.append({
            "name": teile[5],
            "value": teile[6],
            "domain": gastgeber,
            "path": teile[2] or "/",
            "expires": -1,
            "httpOnly": False,
            "secure": True,
            "sameSite": "Strict",
        })

with open(ziel, "w", encoding="utf-8") as f:
    json.dump({"cookies": kekse, "origins": []}, f)
os.chmod(ziel, 0o600)
PY
}
