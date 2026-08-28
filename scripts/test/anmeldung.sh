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
#   arasul_drossel_merken   den Stand einer Drossel aus einer Antwort festhalten
#   arasul_drossel_abwarten warten, bis eine Drossel wieder Platz hat
#   arasul_pruefbenutzer_anlegen  den Pruefbenutzer am Geraet anlegen (idempotent)
#
# Umgebung: ARASUL_URL, ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_TOKEN,
# ARASUL_TOKEN_DATEI, ARASUL_SITZUNG, ARASUL_DROSSEL_DATEI, ARASUL_GERAET.
# =============================================================================

ARASUL_URL="${ARASUL_URL:-https://localhost:8443}"
ARASUL_BENUTZER="${ARASUL_BENUTZER:-admin}"
ARASUL_PASSWORT="${ARASUL_PASSWORT:-2309}"
ARASUL_TOKEN_DATEI="${ARASUL_TOKEN_DATEI:-${TMPDIR:-/tmp}/arasul-abnahme-token}"
ARASUL_SITZUNG="${ARASUL_SITZUNG:-${TMPDIR:-/tmp}/arasul-abnahme-sitzung.json}"
# Dieselbe Datei, die `scripts/test/drossel.mjs` liest und schreibt: `os.tmpdir()`
# von Node und `${TMPDIR:-/tmp}` sind derselbe Ordner, nur ohne den Schraegstrich
# am Ende, den macOS an TMPDIR haengt.
ARASUL_DROSSEL_DATEI="${ARASUL_DROSSEL_DATEI:-${TMPDIR:-/tmp}/arasul-abnahme-drossel}"
ARASUL_DROSSEL_DATEI="${ARASUL_DROSSEL_DATEI//\/\//\/}"

# ---------------------------------------------------------------------------
# Die drei Drosseln des Geraets, als EINE Sache
# ---------------------------------------------------------------------------
# Bis zum 28.08.2026 kannte diese Datei genau eine Drossel, die Anmeldedrossel.
# Das Geraet hat DREI auf den Wegen, die jede Seitenladung nimmt
# (`middleware/rateLimit.js`, dort nachzulesen und nicht hier zu glauben):
#
#   anmeldung   POST /api/auth/login, /setup        10 je 15 min   loginLimiter
#   auth        GET  /api/auth/needs-setup,         30 je 60 s     generalAuthLimiter
#               POST /api/auth/logout
#   sitzung     GET  /api/auth/session              120 je 60 s    sessionProbeLimiter
#
# Der Stand steht je Drossel in EINER Datei (JSON, `reset` als Zeitpunkt in ms),
# geschrieben aus den Kopfzeilen jeder Antwort, die eine Drossel traegt; die
# Browser-Abnahmen (`drossel.mjs`) lesen und schreiben dieselbe. Die Logik
# steht hier ein zweites Mal in Python, weil ein Shell-Skript kein Node-Modul
# laden kann; die ZAHLEN stehen in beiden und werden von
# `scripts/test/drosselzahlen.py` gegen `rateLimit.js` gehalten.
_arasul_drossel_py() {
  ARASUL_DROSSEL_DATEI="$ARASUL_DROSSEL_DATEI" python3 - "$@" <<'PY'
import json, os, re, sys, time

DATEI = os.environ["ARASUL_DROSSEL_DATEI"]
DROSSELN = {
    "anmeldung": (10, 15 * 60 * 1000),
    "auth": (30, 60 * 1000),
    "sitzung": (120, 60 * 1000),
}

def name_fuer(methode, pfad):
    methode = methode.upper()
    if methode == "POST" and pfad in ("/api/auth/login", "/api/auth/setup"):
        return "anmeldung"
    if (methode == "GET" and pfad == "/api/auth/needs-setup") or \
       (methode == "POST" and pfad == "/api/auth/logout"):
        return "auth"
    if methode == "GET" and pfad == "/api/auth/session":
        return "sitzung"
    return None

def lesen():
    try:
        roh = json.load(open(DATEI, encoding="utf-8"))
    except Exception:
        return {}
    if isinstance(roh, dict) and "reset" in roh and "anmeldung" not in roh:
        return {"anmeldung": {"rest": roh.get("rest", 0), "reset": roh.get("reset", 0)}}
    return roh if isinstance(roh, dict) else {}

def zahl(w):
    try:
        return float(w)
    except (TypeError, ValueError):
        return None

def merken(methode, pfad, kopfdatei, status):
    name = name_fuer(methode, pfad)
    if not name:
        return
    kopf = {}
    try:
        for zeile in open(kopfdatei, encoding="utf-8", errors="replace"):
            if ":" in zeile:
                k, v = zeile.split(":", 1)
                kopf[k.strip().lower()] = v.strip()
    except OSError:
        pass
    gebuendelt = kopf.get("ratelimit", "")
    m_rest = re.search(r"remaining=(\d+)", gebuendelt)
    m_reset = re.search(r"reset=(\d+)", gebuendelt)
    rest = zahl(kopf.get("ratelimit-remaining")) if "ratelimit-remaining" in kopf \
        else (zahl(m_rest.group(1)) if m_rest else None)
    sek = zahl(kopf.get("ratelimit-reset")) if "ratelimit-reset" in kopf \
        else (zahl(m_reset.group(1)) if m_reset else zahl(kopf.get("retry-after")))
    if rest is None and sek is None:
        if status != 429:
            return
        rest, sek = 0, DROSSELN[name][1] / 1000
    stand = {"rest": rest or 0, "reset": int(time.time() * 1000 + (sek or 0) * 1000)}
    if status == 429:
        stand["rest"] = 0
    alles = lesen()
    alles[name] = stand
    try:
        fd = os.open(DATEI, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(alles, f)
    except OSError:
        pass

def restzeit(name, brauche):
    stand = lesen().get(name)
    if not stand:
        return 0
    bleibt = float(stand.get("reset", 0)) - time.time() * 1000
    if bleibt <= 0 or float(stand.get("rest", 0)) >= brauche:
        return 0
    return int(min(bleibt + 1000, DROSSELN[name][1]) / 1000) + 1

was = sys.argv[1]
if was == "merken":
    merken(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5] or 0))
elif was == "restzeit":
    print(restzeit(sys.argv[2], int(sys.argv[3])))
PY
}

# arasul_drossel_merken <methode> <pfad> <kopfzeilen-datei> <http-code>
arasul_drossel_merken() { _arasul_drossel_py merken "$1" "$2" "$3" "${4:-0}"; }

# arasul_drossel_abwarten <anmeldung|auth|sitzung> [brauche]
# Wartet laut, wenn die Drossel laut letzter Antwort noch zu ist. Irrt sich das,
# weil jemand anders dazwischen war, faengt der 429 danach es ab.
arasul_drossel_abwarten() {
  local name="$1" brauche="${2:-1}" s
  s=$(_arasul_drossel_py restzeit "$name" "$brauche")
  if [ "${s:-0}" -gt 0 ] 2>/dev/null; then
    echo "warte  ${s} s auf die Drossel \"$name\" (siehe middleware/rateLimit.js)" >&2
    sleep "$s"
  fi
}

# Vor einer Seitenladung im Browser: eine Frage aus `auth` (needs-setup) und
# eine Sitzungsprobe, und danach oft gleich die naechste. Platz fuer zwei.
arasul_seitenladung_abwarten() {
  arasul_drossel_abwarten auth 2
  arasul_drossel_abwarten sitzung 2
}

# ---------------------------------------------------------------------------
# Der Pruefbenutzer, wenn er fehlt
# ---------------------------------------------------------------------------
# Der Werksreset von G1 loescht jeden Benutzer, auch den, mit dem die Abnahmen
# sich anmelden (28.08.2026, 11:55: `pruefer` weg, danach kam keine
# Browser-Abnahme mehr durch). Ein 401 fuer ARASUL_BENUTZER heisst seither
# nicht "Ende", sondern: einmal anlegen, einmal wiederholen. Der Weg geht ueber
# `scripts/util/pruefbenutzer.sh`, idempotent, am Geraet oder ueber ssh.
arasul_pruefbenutzer_anlegen() {
  local wurzel
  wurzel="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  echo "Der Benutzer $ARASUL_BENUTZER meldet sich nicht an (HTTP $(arasul_anmeldecode)). Lege ihn an ..." >&2
  ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_PASSWORT="$ARASUL_PASSWORT" \
    bash "$wurzel/scripts/util/pruefbenutzer.sh" >&2
}

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

# Ein Versuch. Haelt den Code und den Stand der Anmeldedrossel fest.
_arasul_anmelden_einmal() {
  local antwort kopf
  kopf="$(mktemp)"
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -c "$ARASUL_TOKEN_DATEI.cookies" -D "$kopf" \
    -d "{\"username\":\"$ARASUL_BENUTZER\",\"password\":\"$ARASUL_PASSWORT\"}" \
    "$ARASUL_URL/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$_ARASUL_CODE_DATEI"
  arasul_drossel_merken POST /api/auth/login "$kopf" "$(arasul_anmeldecode)"
  rm -f "$kopf"
  printf '%s' "$antwort" | sed '$d' | _arasul_json_feld token
}

# Die Anmeldung, mit dem, was ein Mensch auch taete: vor dem Klopfen nachsehen,
# ob die Drossel zu ist, ein 429 abwarten und einmal wiederholen, und einen
# fehlenden Pruefbenutzer einmal anlegen. Jeder dieser drei Faelle war vorher
# ein rotes Feld ueber den Messaufbau.
_arasul_anmelden() {
  local token angelegt=0
  arasul_drossel_abwarten anmeldung 1
  token=$(_arasul_anmelden_einmal)
  case "$(arasul_anmeldecode)" in
    429)
      arasul_drossel_abwarten anmeldung 1
      token=$(_arasul_anmelden_einmal)
      ;;
    401)
      if arasul_pruefbenutzer_anlegen; then
        angelegt=1
        arasul_drossel_abwarten anmeldung 1
        token=$(_arasul_anmelden_einmal)
      fi
      ;;
  esac
  [ "$angelegt" = 1 ] && [ -n "$token" ] && echo "Pruefbenutzer $ARASUL_BENUTZER angelegt und angemeldet." >&2
  printf '%s' "$token"
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
