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
#   arasul_geraet_erreichbar  horcht, ob unter ARASUL_URL ueberhaupt etwas ist
#   arasul_warte_auf_app    wartet, bis der Container einer App selbst antwortet
#
# Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TOKEN,
# ARASUL_TOKEN_DATEI, ARASUL_SITZUNG.
# =============================================================================

ARASUL_URL="${ARASUL_URL:-https://localhost:8443}"
ARASUL_BENUTZER="${ARASUL_BENUTZER:-admin}"
ARASUL_PASSWORT="${ARASUL_PASSWORT:-2309}"
ARASUL_TOKEN_DATEI="${ARASUL_TOKEN_DATEI:-${TMPDIR:-/tmp}/arasul-abnahme-token}"
ARASUL_SITZUNG="${ARASUL_SITZUNG:-${TMPDIR:-/tmp}/arasul-abnahme-sitzung.json}"

# ---------------------------------------------------------------------------
# Ist unter dieser Adresse ueberhaupt ein Geraet?
# ---------------------------------------------------------------------------
# Fuenf Abnahmen trugen dafuer dieselbe Zeile:
#
#   nc -z "$(echo "$BASIS" | sed -E 's#https?://##; s#:.*##')" \
#         "$(echo "$BASIS" | sed -E 's#.*:##')"
#
# Sie geht genau so lange gut, wie in der Adresse ein Port steht. Ohne ihn --
# `ARASUL_URL=https://localhost`, der Aufruf AUF dem Geraet -- frisst `s#.*:##`
# gierig bis zum letzten Doppelpunkt, und der steht in `https:`. Heraus kommt
# der Port `//localhost`, `nc` weist ihn ab, und jede der fuenf Abnahmen meldet
# "Kein Geraet", waehrend das Geraet danebensteht und laeuft (gemessen am Orin
# am 27.08.2026).
#
# Ein fehlender Port ist kein Sonderfall, sondern die Voreinstellung des
# Schemas: `https` ist 443, `http` ist 80. Genau das steht hier.
#
# Rueckgabe 0, wenn jemand horcht.
arasul_geraet_erreichbar() {
  local adresse="${1:-$ARASUL_URL}"
  local schema="${adresse%%://*}"
  local rest="${adresse#*://}"
  rest="${rest%%/*}"          # alles ab dem ersten / gehoert nicht mehr zur Adresse
  local rechner="${rest%%:*}"
  local port=""
  # Nur wenn nach dem Rechnernamen wirklich ein Doppelpunkt kam, steht dort ein
  # Port. `${rest#*:}` gaebe sonst den Rechnernamen selbst zurueck.
  if [ "$rest" != "$rechner" ]; then
    port="${rest##*:}"
  fi
  if [ -z "$port" ]; then
    if [ "$schema" = "http" ]; then port=80; else port=443; fi
  fi
  nc -z "$rechner" "$port" 2>/dev/null
}

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

# ---------------------------------------------------------------------------
# Warten, bis die APP selbst antwortet
# ---------------------------------------------------------------------------
# Gefunden bei der C6-Abnahme am Orin (27.08.2026): `flow-abnahme.sh` schaltete
# live und startete den Flow eine Sekunde spaeter. Traefik kannte den Router des
# frisch gestarteten Containers da noch nicht, und `/apps/<id>/api/flow` fiel
# an den Auffangpfad von Arasul -- HTTP 404, `Endpoint not found`. Die Abnahme
# meldete daraufhin etwas ueber den MESSAUFBAU und schrieb es der App zu.
#
# DRITTE FASSUNG (Phase C8, 27.08.2026). Die zweite arbeitete mit einer
# Ausschlussliste: 000, 502, 503 und das eine 404 mit `Endpoint not found`
# hiessen "noch nicht da", alles andere "die App antwortet". Bei der
# C7-Abnahme meldete sie "erreichbar nach 8s", und der Aufruf DIREKT DANACH
# bekam 404 `Endpoint not found` aus Arasuls Auffangpfad. Eine Ausschlussliste
# ist an dieser Stelle die falsche Form: sie muss jede Antwort kennen, die
# Traefik und Arasul im Hochlauf geben koennen, und 504 stand nicht darin.
#
# Diese Fassung fragt umgekehrt: was ist ein Beweis, dass die APP geantwortet
# hat? Zwei Dinge, und nur die:
#
#   1. Ein Code aus dem 2xx-Bereich. Weder Traefik noch Arasuls Auffangpfad
#      antworten so, solange der Router des Containers fehlt.
#   2. Ein JSON-Rumpf, der NICHT von Arasul stammt. Die App antwortet auf
#      `GET /apps/<id>/api/flow` ohne `?lauf=` mit ihrer eigenen Meldung
#      (HTTP 400, `{"fehler":"..."}`); Arasul antwortet in jedem Fehlerfall mit
#      `{"error":{"code":...}}` (`middleware/errorHandler.js`). Traefik
#      antwortet mit Klartext ("Bad Gateway", "404 page not found") -- also gar
#      keinem JSON.
#
# Alles andere heisst "noch nicht da", ohne dass diese Datei wissen muss,
# welche Fehlercodes Traefik im Hochlauf produziert.
#
# GRENZE, ehrlich benannt: wer nach dem Schalten wartet, waehrend ein ALTER
# Livestand noch laeuft, bekommt womoeglich dessen Antwort. Fuer den Weg
# „einspielen, schalten, benutzen" -- den diese Abnahmen gehen -- gibt es
# vorher nichts, was antworten koennte.
#
#   arasul_warte_auf_app <pfad> [zeitgrenze_s] [token]
#
# Rueckgabe 0, sobald die App antwortet; 1, wenn die Zeitgrenze reisst.

# Ist der Rumpf JSON, das NICHT aus Arasuls Fehlerbehandlung stammt?
# Rueckgabe 0 = von der App.
_arasul_rumpf_von_app() {
  python3 -c 'import sys, json
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    raise SystemExit(1)          # kein JSON -> Traefik-Klartext
if isinstance(d, dict) and isinstance(d.get("error"), dict) and "code" in d["error"]:
    raise SystemExit(1)          # Arasuls Fehlerumschlag
raise SystemExit(0)' "$1" 2>/dev/null
}

arasul_warte_auf_app() {
  local pfad="$1" grenze="${2:-120}" token="${3:-${ARASUL_TOKEN:-}}"
  local ende=$((SECONDS + grenze)) code
  local datei
  datei="$(mktemp)"
  local -a argumente
  while :; do
    argumente=(-sk -o "$datei" -w '%{http_code}' --max-time 20)
    [ -n "$token" ] && argumente+=(-H "authorization: Bearer $token")
    code=$(curl "${argumente[@]}" "$ARASUL_URL$pfad")
    case "$code" in
      2??) rm -f "$datei"; return 0 ;;
      *)
        if _arasul_rumpf_von_app "$datei"; then
          rm -f "$datei"
          return 0
        fi
        ;;
    esac
    if [ "$SECONDS" -ge "$ende" ]; then
      rm -f "$datei"
      return 1
    fi
    sleep 2
  done
}
