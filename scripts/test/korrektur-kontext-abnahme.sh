#!/bin/bash
# =============================================================================
# Abnahme M5: die Korrektur des Menschen erreicht den naechsten Schritt
# =============================================================================
# Die Abnahme des Auftrags korrektur-erreicht-den-naechsten-schritt
# (07.10.2026), Probe-App `tests/probe-korrektur-kontext`: ein erkennender Flow `beleg`
# (Art `ergebnis_bestaetigen`), dessen Schritt `lesen` den Beleg liest (PNG,
# Betrag 23,80), und ein Schritt `satz`, in dem das ECHTE Modell des Geraets
# einen Satz ueber die Buchung schreibt. Ein Mensch (A) bestaetigt die Freigabe
# mit dem Betrag 23,90; der Satz des naechsten Schritts muss die Aenderung
# nennen, und der Lauf darf nicht sagen, es habe keine gegeben.
#
#   LESEN      Die Freigabe zeigt den Betrag 23,80 aus dem Bild.
#   KORREKTUR  B startet den Lauf, A bestaetigt mit {"felder":{"betrag":"23,90"}};
#              die Korrektur steht in approvals.korrekturen (GET /api/laeufe/<id>).
#   KONTEXT    Der Auftrag des Schritts `satz` im Protokoll enthaelt den Abschnitt
#              „Änderungen durch einen Menschen" mit Vorschlag 23,80 und Wert 23,90.
#   SATZ       Der Satz des Modells nennt 23,90 und kein „keine menschlichen
#              Aenderungen" (Modellausgabe, daher zweiter Versuch moeglich).
#   KONTROLLE  Ein zweiter Lauf, ohne Korrektur bestaetigt: kein Abschnitt.
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter
# nur als Umgebungsvariable des einen Befehls, aus Bitwarden mit `geheim`:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   bash scripts/test/korrektur-kontext-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-kk-<MMDD>` (samt Image und
# Ordner), die Freigaben der App an die drei Konten, den Wegwerf-Schluessel.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================

set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-korrektur-kontext"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_KORREKTUR_APP:-probe-kk-$STEMPEL}"
VERSION="1.0.0"
GEDULD=900
HALT_GEDULD=420

A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"
B="${ARASUL_B:-}"
B_PASS="${ARASUL_B_PASSWORT:-}"

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
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
mind_wenn() { if [ "${1:-}" -ge "$2" ] 2>/dev/null; then echo ja; else echo nein; fi; }

if [ -z "$A" ] || [ -z "$A_PASS" ] || [ -z "$B" ] || [ -z "$B_PASS" ]; then
  echo "ARASUL_A, ARASUL_A_PASSWORT, ARASUL_B, ARASUL_B_PASSWORT fehlen (vorhandene Probekonten)."
  exit 1
fi
for wer in "$ARASUL_BENUTZER" "$A" "$B"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist ein echtes Konto. Probekonten nehmen."
    exit 1
  fi
done

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) argumente+=(-H "x-api-key: ${wer#schluessel:}") ;;
    *) argumente+=(-H "authorization: Bearer $wer") ;;
  esac
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

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
print("" if d is None else (json.dumps(d, ensure_ascii=False) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Korrektur (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Den Flow `beleg` als A starten: `starten <original> [titel]`. Setzt $LAUF.
LAUF=""
starten() {
  local abfrage
  abfrage="original=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1")"
  [ -n "${2:-}" ] && abfrage="$abfrage&titel=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$2")"
  LAUF=""
  ruf "$TOK_B" POST "/apps/$APP/api/starten?$abfrage"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_B" POST "/apps/$APP/api/starten?$abfrage"
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || { echo "        Antwort der App: HTTP $CODE $(rumpf)"; return 1; }
}

STATUS=""
warte_status() {
  local gesucht="$1" geduld="${2:-$HALT_GEDULD}"
  local ende=$((SECONDS + geduld))
  STATUS=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_B" GET "/apps/$APP/api/lauf?lauf=$LAUF"
    STATUS=$(rumpf | feld status)
    case "|$gesucht|" in *"|$STATUS|"*) return 0 ;; esac
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen | nicht_uebergeben) return 1 ;; esac
    sleep 3
  done
  return 1
}

# Alle offenen Anfragen des Laufs in der Liste von A. Setzt $ANFRAGEN (Zahl),
# $ANFRAGE (id der ersten) und $ANFRAGE_JSON.
ANFRAGE=""
ANFRAGE_JSON=""
ANFRAGEN=0
anfragen_des_laufs() {
  local ende=$((SECONDS + 60))
  ANFRAGE=""
  ANFRAGE_JSON=""
  ANFRAGEN=0
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_A" GET /api/freigabe-anfragen
    ANFRAGEN=$(rumpf | python3 -c 'import sys,json
lauf = int(sys.argv[1])
print(sum(1 for a in json.load(sys.stdin)["data"] if int(a.get("run_id", -1)) == lauf))' "$LAUF" 2>/dev/null)
    ANFRAGE_JSON=$(rumpf | python3 -c 'import sys,json
lauf = int(sys.argv[1])
a = next((a for a in json.load(sys.stdin)["data"] if int(a.get("run_id", -1)) == lauf), None)
print(json.dumps(a, ensure_ascii=False) if a else "")' "$LAUF" 2>/dev/null)
    if [ -n "$ANFRAGE_JSON" ]; then
      ANFRAGE=$(printf '%s' "$ANFRAGE_JSON" | feld id)
      return 0
    fi
    sleep 3
  done
  return 1
}

# Ein Feld der Anfrage: `wert lieferant`.
wert() {
  printf '%s' "$ANFRAGE_JSON" | python3 -c 'import sys,json
a = json.load(sys.stdin); f = next((x for x in (a.get("felder") or []) if x["name"] == sys.argv[1]), {})
print(f.get("vorschlag") or "")' "$1" 2>/dev/null
}


# Der Betrag ohne Waehrung, Punkt wie Komma: „23.80 EUR" -> „23,80".
betrag_norm() { printf '%s' "$1" | sed -E 's/[[:space:]]*(EUR|€)//g; s/\./,/g; s/[[:space:]]//g'; }

# Ein Schritt des Protokolls, benannt nach seiner Rolle: `schritt <rolle> <feld>` (input.auftrag, output).
schritt() {
  printf '%s' "$PROTOKOLL_JSON" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
s = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == sys.argv[1]), {})
v = s.get(sys.argv[2])
if sys.argv[2] == "input": v = (v or {}).get("auftrag") or ""
print(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))' "$1" "$2" 2>/dev/null
}

# Ein Lauf bis zur Freigabe: B startet, A sieht sie. Setzt $LAUF und $ANFRAGE.
bis_zur_freigabe() {
  if ! starten 'api/belege/2026-0815.png'; then pruefe "$1: Lauf gestartet" nein; return 1; fi
  warte_status wartend
  pruefe "$1: der Lauf haelt zur Bestaetigung an" "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
  anfragen_des_laufs
  pruefe "$1: $A sieht genau eine Freigabe des Laufs" "$(ja_wenn "$ANFRAGEN" 1)" "anzahl=${ANFRAGEN:-0}"
  [ -n "$ANFRAGE" ]
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: die Korrektur erreicht den naechsten Schritt, $APP gegen $BASIS ==="
echo

# --- 1. Zugaenge ---------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
TOK_A=$(anmelden "$A" "$A_PASS")
TOK_B=$(anmelden "$B" "$B_PASS")
pruefe "$A und $B melden sich an" "$([ -n "$TOK_A" ] && [ -n "$TOK_B" ] && echo ja || echo nein)"
{ [ -z "$TOK_A" ] || [ -z "$TOK_B" ]; } && exit 1

ruf "$TOK" GET /api/benutzer
benutzer_feld() {
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((str(b[sys.argv[2]]) for b in d if b["username"] == sys.argv[1]), ""))' "$1" "$2"
}
ID_ADMIN=$(benutzer_feld "$ARASUL_BENUTZER" id)
ID_A=$(benutzer_feld "$A" id)
ID_B=$(benutzer_feld "$B" id)
pruefe 'Drei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
  for id in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$id"
  done
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Freigaben zurueckgenommen, %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Korrektur ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 3. Einspielen, live, drei Freigaben --------------------------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

codes=""
for id in "$ID_ADMIN" "$ID_A" "$ID_B"; do
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$id}"
  codes="$codes $CODE"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$id")
done
pruefe "Die App ist $ARASUL_BENUTZER, $A und $B freigegeben" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "HTTP$codes"

if arasul_warte_auf_app "/apps/$APP/api/gesund" 180 "$TOK_A"; then
  pruefe 'Die App antwortet' ja
else
  pruefe 'Die App antwortet' nein 'Zeitgrenze 180s'; exit 1
fi


# --- 4. Mit Korrektur: B startet, A aendert den Betrag auf 23,90 und bestaetigt ---
if bis_zur_freigabe 'Korrektur'; then
  pruefe 'Korrektur: Betrag aus dem Bild ist 23,80' "$(ja_wenn "$(betrag_norm "$(wert betrag)")" '23,80')" "$(wert betrag)"
  ruf "$TOK_A" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{"felder":{"betrag":"23,90"}}'
  pruefe "Korrektur: $A bestaetigt mit Betrag 23,90" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status fertig
  pruefe 'Korrektur: der Lauf endet fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"

  ruf "$TOK" GET "/api/laeufe/$LAUF"
  PROTOKOLL_JSON="$(rumpf)"
  AUFTRAG_SATZ="$(schritt schreiber input)"
  SATZ="$(schritt schreiber output)"
  ERGEBNIS="$(printf '%s' "$PROTOKOLL_JSON" | feld data.result)"
  pruefe 'Kontext: der Auftrag des Schritts „satz" hat den Abschnitt „Änderungen durch einen Menschen"' \
    "$(grep -q 'Änderungen durch einen Menschen' <<<"$AUFTRAG_SATZ" && echo ja || echo nein)" "$(printf '%s' "$AUFTRAG_SATZ" | tr '\n' ' ' | head -c 160)"
  pruefe 'Kontext: er nennt Vorschlag 23,80 und neuen Wert 23,90' \
    "$(grep -q '23,80' <<<"$AUFTRAG_SATZ" && grep -q 'auf „23,90"' <<<"$AUFTRAG_SATZ" && echo ja || echo nein)"
  pruefe 'Kontext: der Schritt „lesen" gibt den Wert 23,90 weiter' \
    "$(grep -q 'betrag: 23,90' <<<"$AUFTRAG_SATZ" && echo ja || echo nein)"
  # Das Modell: der Satz nennt den neuen Wert; „keine menschlichen Aenderungen" waere falsch.
  echo "        Satz des Modells: $SATZ"
  pruefe 'Satz: nennt den korrigierten Betrag 23,90' "$(grep -q '23,90' <<<"$SATZ" && echo ja || echo nein)"
  pruefe 'Satz: nennt die Aenderung des Menschen (alter Wert oder Aenderung/Korrektur)' \
    "$(grep -qiE '23,80|ändert|korrigiert|angepasst|berichtigt|änderung' <<<"$SATZ" && echo ja || echo nein)"
  pruefe 'Satz: sagt nicht „keine menschlichen Änderungen"' \
    "$(grep -qiE 'keine (menschlichen )?(änderung|korrektur)' <<<"$SATZ$ERGEBNIS" && echo nein || echo ja)"
fi

# --- 5. Kontrolle: ohne Korrektur kein Abschnitt ----------------------------------
if bis_zur_freigabe 'Kontrolle'; then
  ruf "$TOK_A" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  warte_status fertig
  pruefe 'Kontrolle: ohne Korrektur bestaetigt, fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
  ruf "$TOK" GET "/api/laeufe/$LAUF"
  PROTOKOLL_JSON="$(rumpf)"
  pruefe 'Kontrolle: im Auftrag des Schritts „satz" steht kein Abschnitt über Änderungen' \
    "$(grep -q 'Änderungen durch einen Menschen' <<<"$(schritt schreiber input)" && echo nein || echo ja)"
  pruefe 'Kontrolle: der Betrag bleibt 23,80' "$(grep -q 'betrag: 23,80' <<<"$(schritt schreiber input)" && echo ja || echo nein)"
fi

# --- 6. Aufraeumen ist Teil der Messung ------------------------------------------------
fehl=""
for id in "${FREIGEGEBEN[@]:-}"; do
  [ -n "$id" ] || continue
  ruf "$TOK" DELETE "/api/freigaben/$APP/$id"
  [[ "$CODE" =~ ^20[04]$ ]] || fehl="$fehl $id:$CODE"
done
FREIGEGEBEN=()
pruefe 'Die vergebenen Freigaben sind zurueckgenommen' "$([ -z "$fehl" ] && echo ja || echo nein)" "${fehl:-alle drei}"
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App samt Ordnern' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Danach kennt das Geraet die App nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
