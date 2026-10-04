#!/bin/bash
# =============================================================================
# Abnahme M5: Verwaltung Modelle
# =============================================================================
# Die Abnahme des Auftrags verwaltung-modelle (04.10.2026, Migration 206).
# Gemessen wird am laufenden Geraet, was die Karte verlangt:
#
#   ZEILEN      `GET /api/models/verwaltung` nennt je installiertem Modell Name,
#               Groesse, Faehigkeiten, warm und die Flows, die es nutzen. Die
#               Modelle sind genau die am Geraet installierten (Datenbank), warm
#               stimmt mit `ollama ps`, die Faehigkeiten Bild und Werkzeuge mit
#               dem, was Ollama aus den Gewichten meldet (die Unstimmigkeit
#               `qwen3.8:27b-q4_K_M` ohne Bild ist behoben). Darueber die Zeile
#               Speicher fuer KI (`/api/models/memory-budget`).
#   NUTZUNG     Die Probe-App `$APP` (aus `tests/probe-modell`, ihr Schritt
#               `rechnen` nennt `gemma4:e4b`) steht in der Zeile dieses
#               Modells; ihr Flow ohne Modell im Kopf steht beim Standardmodell.
#   SPERRE      Entfernen von `gemma4:e4b` (ein Flow nutzt es) und des
#               Standardmodells: 409, die Meldung nennt den Flow, das Modell
#               liegt danach weiter am Geraet (Ollama und Datenbank).
#   PRUEFUNG    Ein zu grosses Modell (`$RIESE`) wird ueber die Pruefung
#               abgewiesen, in zwei Saetzen, und NICHT heruntergeladen: `pruefen`
#               und `download` antworten 400, es entsteht keine Katalogzeile.
#               Ein Name, den es nicht gibt: 404.
#   HINZUFUEGEN Ein kleines Modell (`$KLEIN`, unter 1 GB) wird geprueft, geladen,
#               steht dann als ungemessen in der Liste (nutzt kein Flow,
#               nicht gesperrt), wird einmal warm gemacht (warm: ja) und am Ende
#               wieder entfernt. War es schon am Geraet, wird es NICHT angefasst.
#   KEIN LADEN  `/:id/load`, `/unload`, `/activate`, `/deactivate`: 404.
#   RECHTE      Alle Wege sind Admin-Wege; ohne Anmeldung 401.
#
# KEINES der installierten Modelle wird geloescht oder ersetzt. Gezaehlt wird nur
# Eigenes: die eigene App, das eine kleine Modell ab dem eigenen Start (`BEGINN`,
# die Uhr des GERAETS aus dem Kopf `Date`); am Ende sind die installierten
# Modelle dieselben wie vorher.
#
# Konten: nur das VORHANDENE Probekonto, nie `admin`, keine neuen:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/verwaltung-modelle-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-modelle-<MMDD>` (samt Image und
# Ordner), das kleine Modell, den Wegwerf-Schluessel.
#
# Dauer: etwa 3 Minuten. Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-modell"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_MODELL_APP:-probe-modelle-$STEMPEL}"
FLOW="schritte"
KLEIN="${ARASUL_KLEINES_MODELL:-qwen2.5:0.5b}"
RIESE="${ARASUL_ZU_GROSSES_MODELL:-llama3.1:405b}"
GERAET="${ARASUL_GERAET:-}"
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


# Die Zeile eines Modells aus der Verwaltung: id feld
VERWALTUNG=""
verwaltung() {
  ruf "$TOK" GET /api/models/verwaltung
  VERWALTUNG=$(rumpf)
}
zeile() { # id feld
  printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
d = json.load(sys.stdin)
m = next((x for x in d["modelle"] if x["id"] == sys.argv[1]), None)
if m is None: print(""); raise SystemExit
v = m.get(sys.argv[2])
print("" if v is None else (json.dumps(v, ensure_ascii=False) if isinstance(v,(bool,dict,list)) else v))' "$1" "$2" 2>/dev/null
}
ids() { # alle Modell-Kennungen der Verwaltung, sortiert
  printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
print(" ".join(sorted(m["id"] for m in json.load(sys.stdin)["modelle"])))' 2>/dev/null
}

# Ollama am Geraet (lauscht dort auf 127.0.0.1:11434).
ollama() { # pfad [leib]
  if [ -n "${2:-}" ]; then
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" "curl -s --max-time 120 localhost:11434$1 -d '$2'" 2>/dev/null
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" "curl -s --max-time 30 localhost:11434$1" 2>/dev/null
  fi
}
ollama_modelle() { # sortierte Namen aus /api/tags
  ollama /api/tags | python3 -c 'import sys,json
print(" ".join(sorted(m["name"] for m in json.load(sys.stdin)["models"])))' 2>/dev/null
}
ollama_hat() { # name -> ja/nein, mit und ohne :latest
  local n="$1"
  case " $(ollama_modelle) " in *" $n "*|*" $n:latest "*) echo ja ;; *) echo nein ;; esac
}
ollama_faehigkeit() { # name faehigkeit -> true/false
  ollama /api/show "{\"model\":\"$1\"}" | python3 -c 'import sys,json
d = json.load(sys.stdin)
print("true" if sys.argv[1] in d.get("capabilities", []) else "false")' "$2" 2>/dev/null
}
ollama_warm() { # sortierte Namen aus /api/ps
  ollama /api/ps | python3 -c 'import sys,json
print(" ".join(sorted(m["name"] for m in json.load(sys.stdin).get("models", []))))' 2>/dev/null
}


if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

# Ab wann gezaehlt wird: die UHR DES GERAETS aus dem Kopf `Date` seiner Antwort.
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

echo "=== Abnahme M5: Verwaltung Modelle, $APP gegen $BASIS ==="
echo "gezaehlt ab $BEGINN (Uhr des Geraets, UTC)"
echo

# --- 1. Zugaenge -----------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
[ "$(db 'SELECT 1;')" = 1 ] || { pruefe 'ssh-Zugang zum Geraet und seine Datenbank' nein; exit 1; }
pruefe 'Migration 206 ist am Geraet angewendet' \
  "$([ "$(db "SELECT count(*) FROM schema_migrations WHERE version = 206 AND success;")" = 1 ] && echo ja || echo nein)"

# Was vorher am Geraet liegt: danach muss es dasselbe sein (ohne das kleine Modell).
VORHER_OLLAMA=$(ollama_modelle)
VORHER_DB=$(db "SELECT string_agg(id, ' ' ORDER BY id) FROM llm_installed_models WHERE status = 'available';")
KLEIN_WAR_SCHON_DA=$(ollama_hat "$KLEIN")
pruefe 'Ollama am Geraet antwortet und fuehrt Modelle' "$([ -n "$VORHER_OLLAMA" ] && echo ja || echo nein)" "$VORHER_OLLAMA"

SCHLUESSEL=""
KEY_ID=""
KLEIN_VON_UNS="nein"
aufraeumen() {
  # Das kleine Modell, nur wenn wir es geholt haben.
  if [ "$KLEIN_VON_UNS" = ja ] && [ "$(ollama_hat "$KLEIN")" = ja ] && [ -n "$TOK" ]; then
    ollama /api/generate "{\"model\":\"$KLEIN\",\"keep_alive\":0}" >/dev/null
    curl -sk -o /dev/null --max-time 120 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/models/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$KLEIN")"
  fi
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ] && [ -n "$TOK" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt (mit Ordnern), das kleine Modell weg (wenn von uns), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Verwaltung Modelle ($APP)\",\"allowed_endpoints\":[\"app:deploy\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Probe-App: ein Flow nutzt gemma4:e4b, der Zeitplan ruht ----------------------
einspielen 1.0.0
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/zeitplan" '{"pausiert":true}'
pruefe 'Der Zeitplan ruht, bevor der Livestand steht (kein Lauf, kein Modell rechnet)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
schalten_live
pruefe "$APP live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 3. Rechte und kein Laden von Hand ---------------------------------------------
ruf ohne GET /api/models/verwaltung
pruefe 'Verwaltung ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf ohne POST /api/models/pruefen '{"model_id":"gemma4:e4b"}'
pruefe 'Pruefung ohne Anmeldung: 401 (oder 403 ohne Token)' \
  "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo ja || echo nein)" "HTTP $CODE"
for weg in load unload activate deactivate; do
  ruf "$TOK" POST "/api/models/gemma4%3Ae4b/$weg" '{}'
  pruefe "POST /api/models/:id/$weg gibt es nicht mehr: 404" "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
done

# --- 4. Zeilen: Name, Groesse, Faehigkeiten, warm, Flows --------------------------
verwaltung
pruefe 'GET /api/models/verwaltung antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Die Zeilen sind genau die am Geraet installierten Modelle (Datenbank des Geraets)' \
  "$(ja_wenn "$(ids)" "$VORHER_DB")" "$(ids)"
pruefe 'Jede Zeile hat Name, Groesse, Faehigkeiten (text, bild, werkzeuge, kontext) und warm' \
  "$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
d = json.load(sys.stdin)
ok = bool(d["modelle"])
for m in d["modelle"]:
    f = m.get("faehigkeiten") or {}
    ok = ok and bool(m.get("name")) and (m.get("groesse_bytes") or 0) > 0 \
        and all(k in f for k in ("text", "bild", "werkzeuge", "kontext")) \
        and isinstance(m.get("warm"), bool) and isinstance(m.get("flows"), list)
print("ja" if ok else "nein")' 2>/dev/null)"
STANDARD=$(printf '%s' "$VERWALTUNG" | feld standard)
pruefe 'Genau ein Modell ist der Standard der Flows' \
  "$(ja_wenn "$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
d = json.load(sys.stdin)
print(sum(1 for m in d["modelle"] if m["ist_standard"]))' 2>/dev/null)" 1)" "$STANDARD"

# Faehigkeiten gegen Ollama gehalten, je installiertem Modell des Katalogs.
ABWEICHUNG=""
for id in $(ids); do
  name=$(db "SELECT COALESCE(ollama_name, id) FROM llm_model_catalog WHERE id = '$id';")
  [ -z "$(ollama_faehigkeit "$name" vision)" ] && continue
  bild_o=$(ollama_faehigkeit "$name" vision)
  werk_o=$(ollama_faehigkeit "$name" tools)
  [ "$(zeile "$id" faehigkeiten | feld bild)" = "$bild_o" ] || ABWEICHUNG="$ABWEICHUNG $id:bild"
  [ "$(zeile "$id" faehigkeiten | feld werkzeuge)" = "$werk_o" ] || ABWEICHUNG="$ABWEICHUNG $id:werkzeuge"
done
pruefe 'Faehigkeiten Bild und Werkzeuge stimmen mit dem, was Ollama meldet, bei jedem Modell' \
  "$([ -z "$ABWEICHUNG" ] && echo ja || echo nein)" "Abweichung:${ABWEICHUNG:- keine}"
pruefe 'Das Standardmodell qwen3.8:27b-q4_K_M liest Bilder (Katalog und Ollama stimmen ueberein)' \
  "$([ "$(zeile qwen3.8:27b-q4_K_M faehigkeiten | feld bild)" = true ] && [ "$(db "SELECT supports_vision_input FROM llm_model_catalog WHERE id = 'qwen3.8:27b-q4_K_M';")" = t ] && echo ja || echo nein)"

WARM_OLLAMA=$(ollama_warm)
WARM_ZEILEN=$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
print(" ".join(sorted(m["id"] for m in json.load(sys.stdin)["modelle"] if m["warm"])))' 2>/dev/null)
pruefe 'warm in den Zeilen stimmt mit ollama ps (Katalogkennungen gegen Ollama-Namen)' \
  "$(python3 - "$WARM_ZEILEN" "$WARM_OLLAMA" <<'PY'
import sys
zeilen = sorted(x.split(":latest")[0] for x in sys.argv[1].split())
ollama = sorted(x.split(":latest")[0] for x in sys.argv[2].split())
print("ja" if zeilen == ollama or not ollama and not zeilen else "nein")
PY
)" "Zeilen: ${WARM_ZEILEN:-keine}; ollama ps: ${WARM_OLLAMA:-keine}"

ruf "$TOK" GET /api/models/memory-budget
pruefe 'Die Zeile Speicher fuer KI: Gesamt, belegt, Reserve, frei' \
  "$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)
print("ja" if d.get("totalBudgetMb", 0) > 0 and all(k in d for k in ("usedMb", "safetyBufferMb", "availableMb")) else "nein")' 2>/dev/null)" \
  "$(rumpf | feld totalBudgetMb) MB gesamt"

pruefe "Der Flow der Probe-App steht beim Modell, das ihr Schritt nennt (gemma4:e4b)" \
  "$(ja_wenn "$(zeile gemma4:e4b flows | python3 -c 'import sys,json
f = json.load(sys.stdin)
print(sum(1 for x in f if x["app_id"] == sys.argv[1] and x["flow"] == sys.argv[2]))' "$APP" "$FLOW" 2>/dev/null)" 1)"
pruefe 'Er steht auch beim Standardmodell (er nennt im Kopf kein Modell)' \
  "$(ja_wenn "$(zeile "$STANDARD" flows | python3 -c 'import sys,json
f = json.load(sys.stdin)
print(sum(1 for x in f if x["app_id"] == sys.argv[1] and x["flow"] == sys.argv[2]))' "$APP" "$FLOW" 2>/dev/null)" 1)"
pruefe 'Ein Modell, das niemand nennt, hat keine Flows und keine Sperre (aus der DB gelesen)' \
  "$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
d = json.load(sys.stdin)
frei = [m for m in d["modelle"] if not m["flows"] and not m["ist_standard"]]
print("ja" if all(m["sperre"] is None for m in frei) else "nein")' 2>/dev/null)"

# --- 5. Sperre beim Entfernen ------------------------------------------------------
ruf "$TOK" DELETE "/api/models/gemma4%3Ae4b"
pruefe 'gemma4:e4b entfernen, solange ein Flow es nutzt: 409' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
pruefe 'Die Meldung nennt den Flow der Probe-App' \
  "$([ "$(enthaelt "$(rumpf)" "$FLOW")" = ja ] && [ "$(enthaelt "$(rumpf)" 'ein Flow es nutzt')" = ja ] && echo ja || echo nein)" "$(rumpf | feld error.message | cut -c1-110)"
pruefe 'Das Gerät nennt den Grund maschinenlesbar: IN_NUTZUNG mit dem Flow' \
  "$([ "$(rumpf | feld error.details.grund)" = IN_NUTZUNG ] && [ "$(enthaelt "$(rumpf | feld error.details.flows)" "$APP")" = ja ] && echo ja || echo nein)"
verwaltung
pruefe 'Die Zeile von gemma4:e4b traegt die Sperre mit dem Flow' \
  "$([ "$(enthaelt "$(zeile gemma4:e4b sperre)" "$FLOW")" = ja ] && echo ja || echo nein)"
ruf "$TOK" DELETE "/api/models/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$STANDARD")"
pruefe 'Das Standardmodell entfernen: 409' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
pruefe 'Nach beiden Versuchen liegen alle Modelle weiter am Geraet (Ollama und Datenbank)' \
  "$([ "$(ollama_modelle)" = "$VORHER_OLLAMA" ] && [ "$(db "SELECT string_agg(id, ' ' ORDER BY id) FROM llm_installed_models WHERE status = 'available';")" = "$VORHER_DB" ] && echo ja || echo nein)"

# --- 6. Pruefung beim Hinzufuegen: zu gross, gibt es nicht ----------------------------
ruf "$TOK" POST /api/models/pruefen "{\"model_id\":\"$RIESE\"}"
pruefe "Pruefung von $RIESE: passt nicht" \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld passt)" = false ] && echo ja || echo nein)" "HTTP $CODE"
GRUND=$(rumpf | feld grund)
pruefe 'Der Grund steht in zwei Saetzen und nennt die Groesse' \
  "$(python3 - "$GRUND" <<'PY'
import re, sys
g = sys.argv[1]
saetze = [s for s in re.split(r"(?<=[.!?])\s+", g.strip()) if s]
print("ja" if len(saetze) == 2 and re.search(r"\d+[.,]\d GB", g) and "zu groß" in g else "nein")
PY
)" "$GRUND"
ruf "$TOK" POST /api/models/download "{\"model_id\":\"$RIESE\"}"
pruefe "Herunterladen von $RIESE wird abgewiesen: 400, kein Strom, kein Download" \
  "$([ "$CODE" = 400 ] && [ "$(ollama_hat "$RIESE")" = nein ] && echo ja || echo nein)" "HTTP $CODE"
pruefe 'Es entstand keine Katalogzeile und keine Installationszeile fuer das zu grosse Modell' \
  "$(ja_wenn "$(db "SELECT (SELECT count(*) FROM llm_model_catalog WHERE id = '$RIESE') + (SELECT count(*) FROM llm_installed_models WHERE id = '$RIESE');")" 0)"
ruf "$TOK" POST /api/models/pruefen '{"model_id":"probe-gibt-es-nicht:1b"}'
pruefe 'Ein Name, den es nicht gibt: 404 mit Satz' \
  "$([ "$CODE" = 404 ] && [ -n "$(rumpf | feld error.message)" ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-80)"
verwaltung
pruefe 'Die geprueften Modelle der Liste tragen das Ergebnis der Pruefung (passt oder nicht)' \
  "$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
d = json.load(sys.stdin)
print("ja" if all(m.get("passt") in (True, False, None) and ("grund" in m) for m in d["liste"]) else "nein")' 2>/dev/null)" \
  "$(printf '%s' "$VERWALTUNG" | python3 -c 'import sys,json
print(len(json.load(sys.stdin)["liste"]), "Eintraege")' 2>/dev/null)"

# --- 7. Hinzufuegen: ein kleines Modell, geprueft, geladen, warm, entfernt ------------
if [ "$KLEIN_WAR_SCHON_DA" = ja ]; then
  pruefe "$KLEIN liegt schon am Geraet: es wird nicht angefasst, Hinzufuegen nicht gemessen" nein
else
  ruf "$TOK" POST /api/models/pruefen "{\"model_id\":\"$KLEIN\"}"
  pruefe "Pruefung von $KLEIN: passt" \
    "$([ "$CODE" = 200 ] && [ "$(rumpf | feld passt)" = true ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | cut -c1-100)"
  pruefe "$KLEIN ist unter 1 GB" \
    "$([ "$(rumpf | feld groesse_bytes)" -lt 1000000000 ] 2>/dev/null && echo ja || echo nein)" "$(rumpf | feld groesse_bytes) Bytes"
  KLEIN_VON_UNS=ja
  FORTSCHRITT=$(curl -sk -N --max-time 600 -X POST -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' -d "{\"model_id\":\"$KLEIN\"}" "$BASIS/api/models/download")
  pruefe "Hinzufuegen von $KLEIN: der Strom endet mit Erfolg" \
    "$([ "$(enthaelt "$FORTSCHRITT" '"success":true')" = ja ] && echo ja || echo nein)" "$(printf '%s' "$FORTSCHRITT" | tail -c 120 | tr '\n' ' ')"
  pruefe "$KLEIN liegt jetzt bei Ollama" "$(ollama_hat "$KLEIN")"
  verwaltung
  pruefe "$KLEIN steht in der Verwaltung, als ungemessen gekennzeichnet" \
    "$([ "$(zeile "$KLEIN" ungemessen)" = true ] && echo ja || echo nein)" "Zeilen: $(ids)"
  pruefe "Die Zeile von $KLEIN: Name, Groesse unter 1 GB, Text, keine Flows, keine Sperre" \
    "$([ -n "$(zeile "$KLEIN" name)" ] && [ "$(zeile "$KLEIN" groesse_bytes)" -lt 1000000000 ] 2>/dev/null && [ "$(zeile "$KLEIN" faehigkeiten | feld text)" = true ] && [ "$(zeile "$KLEIN" flows)" = '[]' ] && [ -z "$(zeile "$KLEIN" sperre)" ] && echo ja || echo nein)"
  pruefe "$KLEIN ist als frei geladen im Katalog vermerkt" \
    "$(ja_wenn "$(db "SELECT frei_geladen FROM llm_model_catalog WHERE id = '$KLEIN';")" t)"
  # Der Abgleich der Faehigkeiten laeuft nach einem Sync; hier einmal anstossen.
  ruf "$TOK" POST /api/models/sync '{}'
  sleep 15
  verwaltung
  pruefe 'Die Faehigkeiten der neuen Zeile stimmen mit Ollama (Bild, Werkzeuge) nach dem Abgleich' \
    "$([ "$(zeile "$KLEIN" faehigkeiten | feld bild)" = "$(ollama_faehigkeit "$KLEIN" vision)" ] && [ "$(zeile "$KLEIN" faehigkeiten | feld werkzeuge)" = "$(ollama_faehigkeit "$KLEIN" tools)" ] && echo ja || echo nein)" \
    "bild $(zeile "$KLEIN" faehigkeiten | feld bild), werkzeuge $(zeile "$KLEIN" faehigkeiten | feld werkzeuge)"

  # warm: das Modell des Auftrags einmal kurz benutzen (nicht Laden von Hand ueber
  # die Verwaltung, sondern wie ein Flow es taete: eine Anfrage an Ollama).
  ollama /api/generate "{\"model\":\"$KLEIN\",\"prompt\":\"Hallo\",\"stream\":false,\"keep_alive\":\"2m\",\"options\":{\"num_predict\":4}}" >/dev/null
  verwaltung
  pruefe "Nach einer Anfrage ist $KLEIN warm: ja (ollama ps stimmt)" \
    "$([ "$(zeile "$KLEIN" warm)" = true ] && [ "$(enthaelt "$(ollama_warm)" "$KLEIN")" = ja ] && echo ja || echo nein)" "ollama ps: $(ollama_warm)"
  ollama /api/generate "{\"model\":\"$KLEIN\",\"keep_alive\":0}" >/dev/null
  sleep 3
  verwaltung
  pruefe "Danach (Ollama entlaedt) ist es warm: nein" "$([ "$(zeile "$KLEIN" warm)" = false ] && echo ja || echo nein)"

  ruf "$TOK" DELETE "/api/models/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$KLEIN")"
  pruefe "Entfernen von $KLEIN (kein Flow nutzt es): 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE $(rumpf | cut -c1-100)"
  verwaltung
  pruefe "$KLEIN ist aus der Verwaltung, aus Ollama und aus dem Katalog verschwunden" \
    "$([ -z "$(zeile "$KLEIN" id)" ] && [ "$(ollama_hat "$KLEIN")" = nein ] && [ "$(db "SELECT count(*) FROM llm_model_catalog WHERE id = '$KLEIN';")" = 0 ] && echo ja || echo nein)"
  KLEIN_VON_UNS=nein
fi

# --- 8. Nichts Fremdes angefasst, die Anmeldung steht --------------------------------
pruefe 'Die Modelle am Geraet sind dieselben wie vor der Abnahme (Ollama und Datenbank)' \
  "$([ "$(ollama_modelle)" = "$VORHER_OLLAMA" ] && [ "$(db "SELECT string_agg(id, ' ' ORDER BY id) FROM llm_installed_models WHERE status = 'available';")" = "$VORHER_DB" ] && echo ja || echo nein)"
pruefe 'Diese Messung hat keinen Lauf gestartet (kein Modell hat gerechnet)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP';")" 0)"
ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
