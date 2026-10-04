#!/bin/bash
# =============================================================================
# Abnahme M5: Modell und Faehigkeiten je Schritt
# =============================================================================
# Die Abnahme des Auftrags modell-je-schritt (04.10.2026, Migration 205).
# Eine Probe-App aus `tests/probe-modell` mit einem Flow, dessen Schritte Modell
# und Faehigkeiten nennen:
#
#   erkennen  Modell `probe-fehlt:1b` (liegt nicht am Geraet), braucht Text,
#             Bild und Werkzeuge
#   rechnen   Modell `gemma4:e4b`, braucht Text, Werkzeuge, Kontext ab 8192
#   frei      kein Modell genannt, braucht Text
#
# OHNE ECHTE MODELLANTWORT. Gemessen werden Wahl und Zuordnung am Geraet, nicht
# Antworten. Der eine Lauf (Zeitplan, jede Minute) haelt als ersten Schritt an
# einer Freigabe: kein Modell rechnet, und der Vermerk ueber das fehlende
# Modell steht schon vorn im Lauf. Gemessen wird er dort und wird abgebrochen.
# Es werden keine Modelle geladen, geloescht oder heruntergeladen; die
# Faehigkeiten kommen aus dem Katalog der am Geraet installierten Modelle.
#
#   ANZEIGE    Je Schritt: das Original (was der Entwickler nennt), was
#              gilt, die Faehigkeiten, die wahlbaren Modelle. Zur Wahl stehen
#              genau die installierten Modelle, die ALLE Faehigkeiten erfuellen
#              (gegen die Faehigkeiten gerechnet, die das Geraet selbst nennt).
#   WAHL       Ein Modell, das nicht am Geraet liegt, eines ohne Bild, eines
#              ohne Werkzeuge, eines ohne Text: 400. Ein passendes: 200, es
#              gilt, der Hinweis verschwindet. Zuruecknehmen: das Original.
#   PROMPT     Der Auftrag an das Modell ist nicht aenderbar: die Wahl nimmt nur
#              ein Modell, ein Feld `prompt` weist das Geraet ab, der Prompt der
#              Flow-Datei bleibt, wie er war.
#   UPDATE     Die Wahl ueberlebt ein Update der App (neue Fassung in Test und
#              Live).
#   HINWEIS    Fehlt das genannte Modell, steht der Hinweis an der App-Seite und
#              in der Liste fuer die Startseite des Admins; im Lauf steht er als
#              Schritt `hinweis` vorn, mit dem Standardmodell als Modell.
#   RECHTE     Alle Wege sind Admin-Wege; ohne Anmeldung 401.
#
# ZAEHLT NUR EIGENES: Laeufe ab dem eigenen Start (`BEGINN`, die Uhr des
# GERAETS aus dem Kopf `Date`) und nur die der eigenen App; Hinweise nur zu ihr.
#
# Konten: nur das VORHANDENE Probekonto, nie `admin`, keine neuen. Passwort nur
# zur Laufzeit:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/modell-je-schritt-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-modell-<MMDD>` (samt Image und
# Ordner), offene Laeufe ab dem eigenen Start, den Wegwerf-Schluessel.
#
# Dauer: etwa 4 Minuten (ein Lauf nach Zeitplan, ein Update). Rueckgabe 0, wenn
# jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-modell"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_MODELL_APP:-probe-modell-$STEMPEL}"
FLOW="schritte"
GERAET="${ARASUL_GERAET:-}"
GEDULD=900
LAUF_GEDULD=150

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
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

if [ -z "$GERAET" ]; then
  echo "ARASUL_GERAET fehlt (ssh-Ziel des Geraets, z. B. jetson): die Messung liest die Datenbank des Geraets."
  exit 1
fi
if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen."
  exit 1
fi

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

# ruf <token|schluessel:…> <verb> <pfad> [leib] -- setzt $CODE, Rumpf in $RUMPF_DATEI
ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) argumente+=(-H "x-api-key: ${wer#schluessel:}") ;;
    ohne) ;;
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

# SQL am Geraet, ueber stdin. Ausgabe: Spalten mit |.
db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}

# Wartet, bis der Befehl $2 gelingt (Geduld $1 Sekunden, alle 3 s).
warte_bis() {
  local ende=$((SECONDS + $1))
  while [ "$SECONDS" -lt "$ende" ]; do
    if eval "$2"; then return 0; fi
    sleep 3
  done
  return 1
}

# Das Paket der Probe-App in Fassung $1.
baue_paket() {
  local version="$1" ordner="$ARBEIT/paket-$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$version" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Modell je Schritt (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_VERSION"] = version
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$version.tgz" -C "$ordner" .
  echo "$ARBEIT/paket-$version.tgz"
}

einspielen() { # version
  local paket
  paket=$(baue_paket "$1")
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "$BASIS/api/v1/external/apps")
}
schalten_live() {
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
}

# Die Auskunft des Geraets zu den Schritten dieser App, als JSON in $UEBERSICHT.
UEBERSICHT=""
uebersicht() {
  ruf "$TOK" GET "/api/apps/$APP/schritt-modelle"
  UEBERSICHT=$(rumpf)
}
# Ein Feld eines Schritts aus $UEBERSICHT: schritt feld
schritt_feld() {
  printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
f = next((x for x in d["flows"] if x["name"] == sys.argv[1]), {"schritte": []})
s = next((x for x in f["schritte"] if x["name"] == sys.argv[2]), {})
v = s.get(sys.argv[3])
print("" if v is None else (json.dumps(v, ensure_ascii=False) if isinstance(v,(bool,dict,list)) else v))' "$FLOW" "$1" "$2" 2>/dev/null
}
# Die Modelle, die nach den Faehigkeiten des Geraets zu einer Forderung passen
# (text bild werkzeuge mindestkontext, je 0/1 bzw. Zahl), sortiert, mit Leerzeichen.
passende() {
  printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
t, b, w, k = (int(x) for x in sys.argv[1:5])
ok = []
for m in d["modelle"]:
    f = m["faehigkeiten"]
    if t and not f["text"]: continue
    if b and not f["bild"]: continue
    if w and not f["werkzeuge"]: continue
    if k and not (f["kontext"] and f["kontext"] >= k): continue
    ok.append(m["id"])
print(" ".join(sorted(ok)))' "$1" "$2" "$3" "$4" 2>/dev/null
}
modelle_aufgabe() { # ein Modell mit dieser Eigenschaft: bild|werkzeuge|text, 0 = hat sie nicht
  printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
feld, soll = sys.argv[1], sys.argv[2] == "1"
print(next((m["id"] for m in d["modelle"] if bool(m["faehigkeiten"][feld]) == soll), ""))' "$1" "$2" 2>/dev/null
}
moegliche() { # schritt -> sortiert, mit Leerzeichen
  printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
f = next(x for x in d["flows"] if x["name"] == sys.argv[1])
s = next(x for x in f["schritte"] if x["name"] == sys.argv[2])
print(" ".join(sorted(s["moegliche"])))' "$FLOW" "$1" 2>/dev/null
}

wahl() { # schritt modell|null
  local m="$2"
  [ "$m" != null ] && m="\"$m\""
  ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/schritte/$1/modell" "{\"modell\":$m}"
}

# Die Hinweise der Startseite zu einem Schritt DIESER App, als Anzahl.
hinweis_zu_schritt() { # schritt
  ruf "$TOK" GET /api/apps/modell-hinweise
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(sum(1 for h in d if h["app_id"] == sys.argv[1] and h["schritt"] == sys.argv[2]))' "$APP" "$1" 2>/dev/null
}
prompt_der_datei() {
  ruf "$TOK" GET "/api/apps/$APP/flows/$FLOW?stand=live"
  rumpf | feld data.prompt
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

# Ab wann gezaehlt wird: die UHR DES GERAETS aus dem Kopf `Date` seiner Antwort,
# ohne Spiel (Vorfall 04.10.2026, Uhr dieses Rechners minus 30 Sekunden).
BEGINN=$(curl -skI --max-time 15 "$BASIS/api/health" | python3 -c 'import sys
from email.utils import parsedate_to_datetime
from datetime import timezone
for z in sys.stdin:
    if z.lower().startswith("date:"):
        print(parsedate_to_datetime(z.split(":", 1)[1].strip()).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))
        break' 2>/dev/null)
if [ -z "$BEGINN" ]; then
  echo "Das Geraet nennt keine Uhrzeit (Kopf Date fehlt); ohne sie zaehlt die Abnahme nicht nur Eigenes."
  exit 1
fi

echo "=== Abnahme M5: Modell je Schritt, $APP gegen $BASIS ==="
echo "gezaehlt ab $BEGINN (Uhr des Geraets, UTC)"
echo

# --- 1. Zugaenge -----------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
[ "$(db 'SELECT 1;')" = 1 ] || { pruefe 'ssh-Zugang zum Geraet und seine Datenbank' nein; exit 1; }
pruefe 'Migration 205 ist am Geraet angewendet' \
  "$([ "$(db "SELECT count(*) FROM schema_migrations WHERE version = 205 AND success;")" = 1 ] && echo ja || echo nein)"

SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  if [ -n "$TOK" ]; then
    # Erst den Zeitplan anhalten, dann die offenen Laeufe ab dem eigenen Start.
    curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK" \
      -H 'content-type: application/json' -d '{"pausiert":true}' \
      "$BASIS/api/apps/$APP/flows/$FLOW/zeitplan"
    for id in $(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND status IN ('laeuft','wartend');"); do
      curl -sk -o /dev/null --max-time 30 -X POST -H "authorization: Bearer $TOK" \
        "$BASIS/api/flows/laeufe/$id/abbrechen"
    done
  fi
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
  printf 'aufgeraeumt  Zeitplan angehalten, offene Laeufe abgebrochen, %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Modell je Schritt ($APP)\",\"allowed_endpoints\":[\"app:deploy\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Einspielen, Zeitplan ruht, bis die Messung ihn braucht ----------------------
einspielen 1.0.0
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/zeitplan" '{"pausiert":true}'
pruefe 'Der Zeitplan ruht, bevor der Livestand steht' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
schalten_live
pruefe "$APP live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 3. Rechte ---------------------------------------------------------------------
ruf ohne GET "/api/apps/$APP/schritt-modelle"
pruefe 'Ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf ohne PUT "/api/apps/$APP/flows/$FLOW/schritte/erkennen/modell" '{"modell":null}'
pruefe 'Die Wahl ohne Anmeldung: 401 (oder 403 ohne Token)' \
  "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo ja || echo nein)" "HTTP $CODE"

# --- 4. Anzeige: Original, was gilt, was zur Wahl steht ------------------------------
uebersicht
pruefe 'GET schritt-modelle antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Die Liste nennt genau die drei Schritte mit Modell, nicht freigeben (Werkzeug)' \
  "$(printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
f = next((x for x in d["flows"] if x["name"] == sys.argv[1]), None)
print("ja" if f and sorted(s["name"] for s in f["schritte"]) == ["erkennen", "frei", "rechnen"] else "nein")' "$FLOW" 2>/dev/null)"
INSTALLIERT=$(printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
print(" ".join(sorted(m["id"] for m in json.load(sys.stdin)["data"]["modelle"])))' 2>/dev/null)
DB_INSTALLIERT=$(db "SELECT string_agg(id, ' ' ORDER BY id) FROM llm_installed_models WHERE status = 'available';")
pruefe 'Die Modelle der Liste sind genau die am Geraet installierten (Datenbank des Geraets)' \
  "$(ja_wenn "$INSTALLIERT" "$DB_INSTALLIERT")" "$INSTALLIERT"

pruefe 'erkennen: Original ist probe-fehlt:1b, es liegt nicht am Geraet' \
  "$([ "$(schritt_feld erkennen original)" = "probe-fehlt:1b" ] && [ "$(schritt_feld erkennen original_vorhanden)" = false ] && echo ja || echo nein)"
pruefe 'erkennen: es laeuft mit dem Standardmodell, Herkunft standard_weil_fehlt' \
  "$([ "$(schritt_feld erkennen herkunft)" = standard_weil_fehlt ] && [ "$(schritt_feld erkennen gilt_ist_standard)" = true ] && echo ja || echo nein)" "gilt $(schritt_feld erkennen gilt)"
pruefe 'erkennen: der Hinweis nennt das fehlende Modell' "$(enthaelt "$(schritt_feld erkennen hinweis)" 'probe-fehlt:1b')"
pruefe 'erkennen: die Faehigkeiten stehen da (Text, Bild, Werkzeuge)' \
  "$(ja_wenn "$(schritt_feld erkennen faehigkeiten)" '{"text": true, "bild": true, "werkzeuge": true}')" "$(schritt_feld erkennen faehigkeiten)"
pruefe 'erkennen: zur Wahl stehen genau die installierten Modelle mit Text, Bild und Werkzeugen' \
  "$(ja_wenn "$(moegliche erkennen)" "$(passende 1 1 1 0)")" "$(moegliche erkennen)"
pruefe 'rechnen: Original gemma4:e4b, vorhanden, es laeuft damit (Herkunft paket), kein Hinweis' \
  "$([ "$(schritt_feld rechnen original)" = "gemma4:e4b" ] && [ "$(schritt_feld rechnen herkunft)" = paket ] && [ "$(schritt_feld rechnen gilt)" = "gemma4:e4b" ] && [ -z "$(schritt_feld rechnen hinweis)" ] && echo ja || echo nein)"
pruefe 'rechnen: zur Wahl stehen genau die mit Text, Werkzeugen und Kontext ab 8192' \
  "$(ja_wenn "$(moegliche rechnen)" "$(passende 1 0 1 8192)")" "$(moegliche rechnen)"
pruefe 'frei: kein Original, es gilt das Standardmodell, kein Hinweis' \
  "$([ -z "$(schritt_feld frei original)" ] && [ "$(schritt_feld frei herkunft)" = standard ] && [ -z "$(schritt_feld frei hinweis)" ] && echo ja || echo nein)"
pruefe 'frei: zur Wahl stehen genau die mit Text' "$(ja_wenn "$(moegliche frei)" "$(passende 1 0 0 0)")" "$(moegliche frei)"
pruefe 'Ein Modell ohne Bild ist fuer erkennen keine Wahl, eines ohne Werkzeuge auch nicht' \
  "$(python3 - "$(moegliche erkennen)" "$(modelle_aufgabe bild 0)" "$(modelle_aufgabe werkzeuge 0)" <<'PY'
import sys
w = sys.argv[1].split()
print("ja" if all(m not in w for m in sys.argv[2:] if m) else "nein")
PY
)"

# --- 5. Hinweise des Admins ---------------------------------------------------------
pruefe 'Hinweis fuer die Startseite: erkennen (Modell fehlt)' "$(ja_wenn "$(hinweis_zu_schritt erkennen)" 1)"
pruefe 'Kein Hinweis fuer rechnen und frei' "$(ja_wenn "$(( $(hinweis_zu_schritt rechnen) + $(hinweis_zu_schritt frei) ))" 0)"

# --- 6. Der Lauf vermerkt es: Zeitplan startet einen Lauf, der an der Freigabe haelt --
PROMPT_VOR=$(prompt_der_datei)
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/zeitplan" '{"pausiert":false}'
pruefe 'Zeitplan fortgesetzt, der Lauf entsteht in der naechsten Minute' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
LAUF=""
lauf_suchen() {
  LAUF=$(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = '$FLOW' ORDER BY id LIMIT 1;")
  [ -n "$LAUF" ]
}
warte_bis "$LAUF_GEDULD" lauf_suchen
pruefe 'Der Zeitplan startet den Lauf' "$([ -n "$LAUF" ] && echo ja || echo nein)" "Lauf ${LAUF:-—}"
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/zeitplan" '{"pausiert":true}'
if [ -n "$LAUF" ]; then
  warte_bis 60 '[ "$(db "SELECT status FROM flow_runs WHERE id = $LAUF;")" = wartend ]'
  pruefe "Der Lauf gehoert $ARASUL_BENUTZER, nicht admin" \
    "$(ja_wenn "$(db "SELECT u.username FROM flow_runs r JOIN admin_users u ON u.id = r.user_id WHERE r.id = $LAUF;")" "$ARASUL_BENUTZER")"
  pruefe 'Der Lauf haelt an der Freigabe: es hat noch kein Modell gerechnet' \
    "$(ja_wenn "$(db "SELECT status FROM flow_runs WHERE id = $LAUF;")" wartend)"
  VERMERK=$(db "SELECT count(*) FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis' AND name = 'modell';")
  pruefe 'Im Lauf steht genau ein Hinweis zum Modell, nur zu erkennen' \
    "$([ "$VERMERK" = 1 ] && [ "$(db "SELECT input->>'schritt' FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis' AND name = 'modell';")" = erkennen ] && echo ja || echo nein)" "$VERMERK Hinweis(e)"
  pruefe 'Der Hinweis nennt das fehlende Modell und das Standardmodell, mit dem der Schritt laeuft' \
    "$([ "$(db "SELECT input->>'original' FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis';")" = probe-fehlt:1b ] && [ "$(db "SELECT input->>'modell' FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis';")" = "$(schritt_feld erkennen gilt)" ] && echo ja || echo nein)" "$(db "SELECT input->>'modell' FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis';")"
  pruefe 'Der Hinweis steht vor dem ersten Schritt (Position 0)' \
    "$(ja_wenn "$(db "SELECT position FROM flow_run_steps WHERE run_id = $LAUF AND kind = 'hinweis' AND name = 'modell';")" 0)"
  ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
  pruefe 'Die Seite der App zeigt den Hinweis im Lauf' \
    "$(enthaelt "$(rumpf)" 'probe-fehlt:1b')"
  ruf "$TOK" POST "/api/flows/laeufe/$LAUF/abbrechen"
  pruefe 'Der Lauf ist abgebrochen, bevor ein Modell gerechnet hat' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
fi
pruefe 'Alle Laeufe dieser App seit dem Start haben die Probe als Flow und kein Modell gerechnet (kein Modellschritt)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_run_steps s JOIN flow_runs r ON r.id = s.run_id WHERE r.created_at >= '$BEGINN' AND r.app_id = '$APP' AND s.kind = 'modell';")" 0)"

# --- 7. Die Wahl: nur passende installierte Modelle ----------------------------------
wahl erkennen "probe-gibt-es-nicht:1b"
pruefe 'Ein Modell, das nicht am Geraet liegt: 400' \
  "$([ "$CODE" = 400 ] && [ "$(enthaelt "$(rumpf)" 'nicht an diesem Gerät')" = ja ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-80)"
OHNE_BILD=$(modelle_aufgabe bild 0)
if [ -n "$OHNE_BILD" ]; then
  wahl erkennen "$OHNE_BILD"
  pruefe "Ein installiertes Modell ohne Bild ($OHNE_BILD): 400, mit Grund" \
    "$([ "$CODE" = 400 ] && [ "$(enthaelt "$(rumpf)" 'erfüllt nicht alle Fähigkeiten')" = ja ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-100)"
fi
OHNE_WERKZEUGE=$(modelle_aufgabe werkzeuge 0)
if [ -n "$OHNE_WERKZEUGE" ]; then
  wahl rechnen "$OHNE_WERKZEUGE"
  pruefe "Ein installiertes Modell ohne Werkzeuge ($OHNE_WERKZEUGE) fuer rechnen: 400" "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
fi
OHNE_TEXT=$(printf '%s' "$UEBERSICHT" | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((m["id"] for m in d["modelle"] if not m["faehigkeiten"]["text"]), ""))' 2>/dev/null)
if [ -n "$OHNE_TEXT" ]; then
  wahl frei "$OHNE_TEXT"
  pruefe "Ein installiertes Modell ohne Text ($OHNE_TEXT) fuer frei: 400" "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
fi
wahl gibtsnicht gemma4:e4b
pruefe 'Ein Schritt, den der Flow nicht hat: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/schritte/freigeben/modell" '{"modell":"gemma4:e4b"}'
pruefe 'Ein Werkzeug-Schritt ruft kein Modell: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/flows/gibt-es-nicht/schritte/erkennen/modell" '{"modell":"gemma4:e4b"}'
pruefe 'Ein Flow, den die App nicht hat: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/schritte/erkennen/modell" '{"modell":"gemma4:e4b","prompt":"Tu etwas anderes."}'
pruefe 'Ein Feld prompt weist das Geraet ab: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
uebersicht
pruefe 'Die abgewiesenen Versuche haben nichts veraendert' \
  "$([ -z "$(schritt_feld erkennen gewaehlt)" ] && [ "$(schritt_feld erkennen herkunft)" = standard_weil_fehlt ] && [ "$(db "SELECT count(*) FROM public.flow_schritt_modelle WHERE app_id = '$APP';")" = 0 ] && echo ja || echo nein)"

WAHL=$(moegliche erkennen | awk '{print $1}')
if [ -n "$WAHL" ]; then
  wahl erkennen "$WAHL"
  pruefe "Ein passendes Modell ($WAHL): 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE $(rumpf | cut -c1-100)"
  uebersicht
  pruefe 'erkennen: die Wahl steht da und gilt, Herkunft gewaehlt' \
    "$([ "$(schritt_feld erkennen gewaehlt)" = "$WAHL" ] && [ "$(schritt_feld erkennen gilt)" = "$WAHL" ] && [ "$(schritt_feld erkennen herkunft)" = gewaehlt ] && echo ja || echo nein)"
  pruefe 'erkennen: das Original bleibt sichtbar (probe-fehlt:1b)' "$(ja_wenn "$(schritt_feld erkennen original)" probe-fehlt:1b)"
  pruefe 'erkennen: der Hinweis ist weg, auch bei den Hinweisen der Startseite' \
    "$([ -z "$(schritt_feld erkennen hinweis)" ] && [ "$(hinweis_zu_schritt erkennen)" = 0 ] && echo ja || echo nein)"
  pruefe 'Die Wahl liegt in flow_schritt_modelle, mit dem Menschen, der sie traf' \
    "$([ "$(db "SELECT modell FROM public.flow_schritt_modelle WHERE app_id = '$APP' AND flow_name = '$FLOW' AND schritt = 'erkennen' AND geaendert_von IS NOT NULL;")" = "$WAHL" ] && echo ja || echo nein)"
  pruefe 'Der Prompt der Flow-Datei ist unveraendert' "$(ja_wenn "$(prompt_der_datei)" "$PROMPT_VOR")"
else
  pruefe 'Es gibt ein installiertes Modell mit Text, Bild und Werkzeugen' nein
fi

# --- 8. Die Wahl ueberlebt ein Update der App -----------------------------------------
einspielen 1.1.0
pruefe 'Eine neue Fassung 1.1.0 in den Teststand' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
schalten_live
pruefe 'Fassung 1.1.0 live' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/zeitplan" '{"pausiert":true}'
uebersicht
pruefe 'Nach dem Update gilt die Wahl noch' \
  "$([ -n "$WAHL" ] && [ "$(schritt_feld erkennen gewaehlt)" = "$WAHL" ] && [ "$(schritt_feld erkennen herkunft)" = gewaehlt ] && echo ja || echo nein)"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Beide Staende tragen die neue Fassung' \
  "$(ja_wenn "$(rumpf | feld data.staende.live.version)/$(rumpf | feld data.staende.test.version)" 1.1.0/1.1.0)" "$(rumpf | feld data.staende.live.version)"

# --- 9. Zuruecknehmen ----------------------------------------------------------------
wahl erkennen null
pruefe 'Die Wahl zuruecknehmen: 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
uebersicht
pruefe 'Danach gilt wieder das Original-Verhalten: Standardmodell, Hinweis zurueck' \
  "$([ -z "$(schritt_feld erkennen gewaehlt)" ] && [ "$(schritt_feld erkennen herkunft)" = standard_weil_fehlt ] && [ -n "$(schritt_feld erkennen hinweis)" ] && echo ja || echo nein)"
pruefe 'Die Zeile ist weg (keine leere Zeile)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM public.flow_schritt_modelle WHERE app_id = '$APP';")" 0)"
pruefe 'Der Hinweis der Startseite ist wieder da' "$(ja_wenn "$(hinweis_zu_schritt erkennen)" 1)"

# --- 10. Nur Eigenes, und die Anmeldung steht ----------------------------------------
FREMD=$(db "SELECT count(*) FROM public.flow_schritt_modelle WHERE app_id <> '$APP' AND geaendert_am >= '$BEGINN';")
pruefe 'Diese Messung hat keine Wahl an einer fremden App hinterlassen' "$(ja_wenn "$FREMD" 0)"
ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
