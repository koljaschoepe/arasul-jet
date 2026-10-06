#!/bin/bash
# =============================================================================
# Abnahme M5: die Erkennung liest das Original (Kontrakt 14)
# =============================================================================
# Die Abnahme des Auftrags erkennung-liest-das-original (06.10.2026), Probe-App
# `tests/probe-original`: ein erkennender Flow `beleg` (Rolle `leser`, Felder
# lieferant, betrag und datum), Art `ergebnis_bestaetigen`, das Original als
# Argument. Der Auftrag nennt keinen der drei Werte: sie kommen nur aus dem
# Bild, gelesen vom ECHTEN Bildmodell des Geraets (gemma4:e4b).
#
#   KONTRAKT   Fassung 14, die Regel „Das Modell liest das Original".
#   PNG        Der Beispielbeleg als PNG aus dem Backend der App: Lieferant,
#              Betrag und Datum stehen in den Feldern der Freigabe. Genau eine
#              Freigabe, auch wenn alles sicher erkannt ist; ihr Titel beginnt
#              mit dem Titel aus den erkannten Feldern. Die App sah den Abruf
#              mit dem Menschen des Laufs. Nach der Bestaetigung: fertig, keine
#              zweite Pruefung.
#   PDF        Derselbe Beleg als PDF (zwei Seiten): dieselben drei Werte.
#   FRONTEND   Ein Original aus den Dateien des Frontends, mit `titel` beim
#              Start: der Titel der App steht vorn.
#   FEHLT      Ein Original, das es nicht gibt: Freigabe „Original fehlt" mit
#              dem Grund, kein Modellaufruf.
#   ZU GROSS   Ein Original ueber 10 MB: Freigabe „Original zu groß".
#   PROTOKOLL  Der Schritt der Rolle nennt Art, Seiten und Modell des Originals.
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   bash scripts/test/original-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-original-<MMDD>` (samt Image und
# Ordner), die Freigaben der App an die drei Konten, den Wegwerf-Schluessel.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-original"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_ORIGINAL_APP:-probe-original-$STEMPEL}"
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
m["name"] = "Probe: Original (%s)" % kennung.rsplit("-", 1)[-1]
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
  ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
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
    ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
    STATUS=$(rumpf | feld status)
    case "|$gesucht|" in *"|$STATUS|"*) return 0 ;; esac
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen | nicht_uebergeben) return 1 ;; esac
    sleep 3
  done
  return 1
}

# Alle offenen Anfragen des Laufs in der Liste von B. Setzt $ANFRAGEN (Zahl),
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
    ruf "$TOK_B" GET /api/freigabe-anfragen
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

# Betrag ohne Waehrung, Punkt wie Komma: „17.40 EUR" -> „17,40".
betrag_norm() { printf '%s' "$1" | sed -E 's/[[:space:]]*(EUR|€)//g; s/\./,/g; s/[[:space:]]//g'; }

# Die drei Werte des Beispielbelegs aus der Anfrage.
liest_den_beleg() {
  local wo="$1"
  local lieferant betrag datum
  lieferant="$(wert lieferant)"
  betrag="$(betrag_norm "$(wert betrag)")"
  datum="$(wert datum)"
  pruefe "$wo: Lieferant aus dem Bild" \
    "$(grep -qi 'sonnenschein' <<<"$lieferant" && echo ja || echo nein)" "$lieferant"
  pruefe "$wo: Betrag aus dem Bild" "$(ja_wenn "$betrag" '17,40')" "$(wert betrag)"
  pruefe "$wo: Datum aus dem Bild" "$(ja_wenn "$datum" '03.10.2026')" "$datum"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: die Erkennung liest das Original, $APP gegen $BASIS ==="
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
  -d "{\"name\":\"Abnahme M5 Original ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Kontrakt 14 ---------------------------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
KONTRAKT=$(rumpf | feld data.kontrakt)
[ -z "$KONTRAKT" ] && KONTRAKT=$(rumpf | feld kontrakt)
pruefe 'Der Kontrakt hat mindestens Fassung 14' "$(mind_wenn "$KONTRAKT" 14)" "kontrakt=${KONTRAKT:-—}"
pruefe 'Die Regeln sagen, dass das Modell das Original liest' \
  "$(grep -q 'Das Modell liest das Original' "$RUMPF_DATEI" && echo ja || echo nein)"

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

# --- 4. PNG aus dem Backend der App -------------------------------------------------
if starten 'api/belege/2026-0815.png'; then
  warte_status wartend
  pruefe 'PNG: der Lauf haelt zur Bestaetigung an' "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
  anfragen_des_laufs
  pruefe "PNG: $B sieht genau eine Freigabe des Laufs" "$(ja_wenn "$ANFRAGEN" 1)" "anzahl=${ANFRAGEN:-0}"
  liest_den_beleg PNG
  TITEL=$(printf '%s' "$ANFRAGE_JSON" | feld titel)
  # Der Grund hinter dem Strich haengt an der Sicherheit des Modells
  # („Ergebnis bestätigen" oder „Erkennung unsicher"); gemessen wird der Titel vorn.
  pruefe 'PNG: der Titel nennt den Beleg vorn' \
    "$(grep -qi '^[^–]*sonnenschein[^–]* – ' <<<"$TITEL" && echo ja || echo nein)" "$TITEL"
  pruefe 'PNG: das Original ist eine Adresse der App' \
    "$(ja_wenn "$(printf '%s' "$ANFRAGE_JSON" | feld original)" "/apps/$APP/api/belege/2026-0815.png")"
  ruf "$TOK_A" GET "/apps/$APP/api/abrufe"
  ABRUF=$(rumpf | python3 -c 'import sys,json
lauf = sys.argv[1]
a = next((x for x in json.load(sys.stdin)["data"] if x.get("lauf") == lauf), {})
print("%s|%s" % (a.get("pfad"), a.get("benutzer")))' "$LAUF" 2>/dev/null)
  pruefe "PNG: die App sah den Abruf im Namen von $A" "$(ja_wenn "$ABRUF" "/belege/2026-0815.png|$A")" "$ABRUF"

  ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
  PROTOKOLL=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
s = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == "leser"), {})
o = (s.get("input") or {}).get("original") or {}
print("%s|%s|%s" % (o.get("art"), o.get("seiten"), o.get("modell")))' 2>/dev/null)
  pruefe 'PNG: das Protokoll nennt Art, Seiten und das Bildmodell' \
    "$(grep -qE '^png\|1\|.+' <<<"$PROTOKOLL" && ! grep -q '|None$' <<<"$PROTOKOLL" && echo ja || echo nein)" "$PROTOKOLL"

  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  pruefe "PNG: $B bestaetigt" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status fertig
  pruefe 'PNG: der Lauf endet fertig, ohne zweite Pruefung' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
else
  pruefe 'PNG: beleg gestartet' nein
fi

# --- 5. PDF ------------------------------------------------------------------------
if starten 'api/belege/2026-0815.pdf'; then
  warte_status wartend
  anfragen_des_laufs
  pruefe 'PDF: genau eine Freigabe' "$(ja_wenn "$ANFRAGEN" 1)" "status=${STATUS:-—} anzahl=${ANFRAGEN:-0}"
  liest_den_beleg PDF
  ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
  PROTOKOLL=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
s = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == "leser"), {})
o = (s.get("input") or {}).get("original") or {}
print("%s|%s|%s" % (o.get("art"), o.get("seiten"), o.get("gesamt")))' 2>/dev/null)
  pruefe 'PDF: beide Seiten als Bild' "$(ja_wenn "$PROTOKOLL" 'pdf|2|2')" "$PROTOKOLL"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  warte_status fertig
  pruefe 'PDF: bestaetigt, fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
else
  pruefe 'PDF: beleg gestartet' nein
fi

# --- 6. Frontend der App, Titel von der App ----------------------------------------
if starten 'beispiel-beleg.png' 'Beleg 2026-0815'; then
  warte_status wartend
  anfragen_des_laufs
  TITEL=$(printf '%s' "$ANFRAGE_JSON" | feld titel)
  pruefe 'Frontend: der Titel der App steht vorn' \
    "$(grep -q '^Beleg 2026-0815 – ' <<<"$TITEL" && echo ja || echo nein)" "$TITEL"
  pruefe 'Frontend: Betrag aus dem Bild' "$(ja_wenn "$(betrag_norm "$(wert betrag)")" '17,40')" "$(wert betrag)"
  ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
  pruefe 'Frontend: GET flows/runs/:id nennt den Titel' "$(ja_wenn "$(rumpf | feld titel)" 'Beleg 2026-0815')"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{"begruendung":"Abnahme M5 Original: genug"}'
  warte_status abgebrochen 60
else
  pruefe 'Frontend: beleg gestartet' nein
fi

# --- 7. Das Original fehlt, oder es ist zu gross -----------------------------------
for fall in 'api/belege/9999.png|Original fehlt|404' 'api/belege/gross.png|Original zu groß|10,0 MB'; do
  IFS='|' read -r pfad titel grund <<<"$fall"
  if starten "$pfad"; then
    warte_status wartend 120
    anfragen_des_laufs
    pruefe "$titel: Freigabe mit diesem Titel" \
      "$(grep -q " – $titel\$\|^$titel\$" <<<"$(printf '%s' "$ANFRAGE_JSON" | feld titel)" && echo ja || echo nein)" \
      "$(printf '%s' "$ANFRAGE_JSON" | feld titel)"
    pruefe "$titel: der Grund steht als Satz dabei" \
      "$(grep -q "$grund" <<<"$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang)" && echo ja || echo nein)" \
      "$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang | head -c 110)"
    pruefe "$titel: die Felder sind leer und fehlen" \
      "$([ -z "$(wert lieferant)$(wert betrag)$(wert datum)" ] && echo ja || echo nein)"
    ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
    pruefe "$titel: kein Modellaufruf" \
      "$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
s = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == "leser"), {})
print("ja" if (s.get("output") or "").startswith("Kein Modellaufruf") else "nein")' 2>/dev/null)"
    ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{"begruendung":"Abnahme M5 Original: Fehlfall"}'
    warte_status abgebrochen 60
    pruefe "$titel: abgelehnt, der Lauf endet abgebrochen" "$(ja_wenn "$STATUS" abgebrochen)" "status=${STATUS:-—}"
  else
    pruefe "$titel: beleg gestartet" nein
  fi
done

# --- 8. Aufraeumen ist Teil der Messung ------------------------------------------------
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
