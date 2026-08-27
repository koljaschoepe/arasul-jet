#!/bin/bash
# =============================================================================
# Abnahme der Kurzliste, Phase C8 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "`GET /models` zeigt die Kurzliste, Profile
# aktualisiert." Genau das misst dieses Skript, gegen das laufende Geraet:
#
#   1. `GET /api/models/catalog` (Sitzung) zeigt GENAU die vier Modelle der
#      Kurzliste -- keines fehlt, keines steht zuviel darin.
#   2. `GET /api/v1/external/models` (Schluessel) zeigt nur Modelle der
#      Kurzliste und nennt den Standard.
#   3. `GET /api/models/recommended` empfiehlt fuer jede Rolle ein Modell der
#      Kurzliste. Das ist die Seite der Plattformprofile, die sich am
#      laufenden Geraet ueberhaupt messen laesst.
#   4. Ein Download ausserhalb der Kurzliste geht nicht -- weder ueber
#      `POST /api/models/download` (der Katalog kennt das Modell nicht) noch
#      ueber den frueheren Weg `POST /api/models/katalog`, den es nicht mehr
#      gibt.
#   5. Der Idle-Unload bleibt: `LLM_KEEP_ALIVE_SECONDS` steht am Geraet.
#   6. Am Geraet zusaetzlich: `ollama list` gegen die Kurzliste gehalten --
#      was darueber hinaus liegt, nennt `scripts/util/modelle-aufraeumen.sh`.
#
# Die erwartete Liste wird NICHT hier abgeschrieben, sondern aus
# `config/modelle/kurzliste.json` gelesen. Ein Abnahmeskript mit einer eigenen
# Kopie der Liste misst sich selbst.
#
# WAS DIESES SKRIPT NICHT MISST: dass ein Flow-Lauf mit dem Standardmodell
# durchlaeuft. Das misst `flow-abnahme.sh` (Phase C6) und muss nach dieser
# Phase weiterhin gruen sein -- deshalb steht es im PR-Text als eigener Befehl.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/modelle-abnahme.sh
#
# Auf dem Geraet (dort zaehlt auch `ollama list` mit):
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 bash scripts/test/modelle-abnahme.sh
#
# ANMELDUNGEN: eine, und die entfaellt, wenn `abnahmen.sh` den Lauf startet.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
KURZLISTE="$WURZEL/config/modelle/kurzliste.json"

gruen=0
rot=0
uebersprungen=0
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
uebergehen() {
  uebersprungen=$((uebersprungen + 1))
  printf '  --   %s%s\n' "$1" "${2:+  ($2)}"
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

RUMPF_DATEI="$(mktemp)"
CODE=""
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
trap 'rm -f "$RUMPF_DATEI"' EXIT

sitzungs_ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 60
    -H "authorization: Bearer $TOK")
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}

schluessel_ruf() {
  local verb="$1" pfad="$2"
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 60 \
    -H "x-api-key: $SCHLUESSEL" "$BASIS$pfad")
}

# Die Kennungen der Kurzliste, eine je Zeile.
ERWARTET=$(python3 -c 'import json,sys
for m in json.load(open(sys.argv[1], encoding="utf-8"))["modelle"]:
    print(m["id"])' "$KURZLISTE")
STANDARD=$(python3 -c 'import json,sys
for m in json.load(open(sys.argv[1], encoding="utf-8"))["modelle"]:
    if m["aufgabe"] == "text" and m["standard"]:
        print(m["id"]); break' "$KURZLISTE")

# Die Kennungen aus einer Antwort ziehen. `$1` ist der Pfad zur Liste
# ("models"), gelesen wird das Feld `id`.
ids_aus() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: raise SystemExit
liste = d.get(sys.argv[1]) or []
for m in liste:
    print(m.get("id", ""))' "$1" 2>/dev/null
}

# Zwei Listen vergleichen, sortiert, ohne Leerzeilen.
gleich() {
  [ "$(printf '%s\n' "$1" | sort)" = "$(printf '%s\n' "$2" | sort)" ]
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Kurzliste (Phase C8) gegen $BASIS ==="
echo "Erwartet: $(printf '%s' "$ERWARTET" | tr '\n' ' ')"
echo

# --- 1. Anmeldung ------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

# --- 2. Der Katalog IST die Kurzliste ---------------------------------------
sitzungs_ruf GET /api/models/catalog
pruefe 'GET /api/models/catalog antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
KATALOG=$(rumpf | ids_aus models)
pruefe 'Der Katalog zeigt genau die Kurzliste' \
  "$(gleich "$KATALOG" "$ERWARTET" && echo ja || echo nein)" \
  "$(printf '%s' "$KATALOG" | tr '\n' ' ')"

# Und die Gegenprobe, damit ein leerer Katalog nicht als "genau die Liste"
# durchgeht: die Zahl steht in der Antwort selbst.
ANZAHL=$(rumpf | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("total", ""))
except Exception: print("")' 2>/dev/null)
pruefe 'und nennt vier als Gesamtzahl' \
  "$(ja_wenn "$ANZAHL" "$(printf '%s\n' "$ERWARTET" | wc -l | tr -d ' ')")" "total=$ANZAHL"

# --- 3. Der Standard je Aufgabe ---------------------------------------------
sitzungs_ruf GET /api/models/recommended
pruefe 'GET /api/models/recommended antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
for rolle in recommended_model recommended_fast_model recommended_vision_model \
  recommended_embedding_model; do
  WERT=$(rumpf | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print(d.get(sys.argv[1]) or "")' "$rolle" 2>/dev/null)
  pruefe "Die Empfehlung $rolle steht in der Kurzliste" \
    "$(grep -qxF "$WERT" <<<"$ERWARTET" && echo ja || echo nein)" "${WERT:-—}"
done

# --- 4. Die externe Schnittstelle -------------------------------------------
SCHLUESSEL=""
KEY_ID=""
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme C8 (modelle)","allowed_endpoints":["llm:status"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("api_key",""))
except Exception: print("")' 2>/dev/null)
KEY_ID=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("key_id",""))
except Exception: print("")' 2>/dev/null)

widerrufen() {
  [ -n "$KEY_ID" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/v1/external/api-keys/$KEY_ID"
  rm -f "$RUMPF_DATEI"
}
trap widerrufen EXIT

if [ -z "$SCHLUESSEL" ]; then
  uebergehen 'GET /models (extern) zeigt nur Modelle der Kurzliste' \
    'kein Wegwerf-Schluessel zu bekommen'
else
  schluessel_ruf GET /api/v1/external/models
  pruefe 'GET /api/v1/external/models antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  EXTERN=$(rumpf | ids_aus models)
  FREMD=$(comm -23 <(printf '%s\n' "$EXTERN" | sort -u) <(printf '%s\n' "$ERWARTET" | sort -u))
  # Kein `gleich`: `/models` listet, was INSTALLIERT ist. Ein Modell der
  # Kurzliste, das noch niemand geladen hat, fehlt dort zu Recht. Rot ist nur
  # das Umgekehrte -- etwas, das nicht auf der Liste steht.
  pruefe 'Er zeigt nichts ausserhalb der Kurzliste' \
    "$([ -z "$FREMD" ] && echo ja || echo nein)" \
    "${FREMD:-nur Kurzliste}: $(printf '%s' "$EXTERN" | tr '\n' ' ')"
  DEFAULT=$(rumpf | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("default_model") or "")
except Exception: print("")' 2>/dev/null)
  pruefe 'und nennt den Standard der Kurzliste' "$(ja_wenn "$DEFAULT" "$STANDARD")" \
    "default_model=${DEFAULT:-—}"

  # Welche der vier liegen wirklich am Geraet? Keine Pruefung, eine Ansage:
  # ein Modell nachzuladen ist eine Entscheidung eines Menschen, kein Fehler
  # dieses Standes.
  while IFS= read -r kennung; do
    if grep -qxF "$kennung" <<<"$EXTERN"; then
      printf '  i    installiert: %s\n' "$kennung"
    else
      printf '  i    NICHT installiert: %-40s (docker exec llm-service ollama pull %s)\n' \
        "$kennung" "$kennung"
    fi
  done <<<"$ERWARTET"
fi

# --- 5. Kein Weg an der Kurzliste vorbei ------------------------------------
sitzungs_ruf POST /api/models/download '{"model_id":"tinyllama:1.1b"}'
pruefe 'Ein Download ausserhalb der Kurzliste wird abgewiesen' \
  "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

sitzungs_ruf POST /api/models/katalog '{"quelle":"llama3.2:3b"}'
pruefe 'Den Weg „Modell ueber einen Link hinzufuegen" gibt es nicht mehr' \
  "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

# --- 6. Der Idle-Unload bleibt ----------------------------------------------
# Er ist der Grund, warum ein Geraet mit 61 GB mehrere Modelle im Katalog haben
# darf: Ollama gibt das Modell nach Ruhe selbst frei. Die Phase aendert daran
# nichts, und "nichts geaendert" ist eine Zusage wie jede andere.
if ! docker ps >/dev/null 2>&1; then
  uebergehen 'Der Idle-Unload steht (LLM_KEEP_ALIVE_SECONDS)' \
    'nur am Geraet: docker nicht erreichbar'
else
  KEEP=$(docker exec llm-service printenv OLLAMA_KEEP_ALIVE 2>/dev/null)
  [ -n "$KEEP" ] || KEEP=$(grep -E '^LLM_KEEP_ALIVE_SECONDS=' "$WURZEL/.env" 2>/dev/null | cut -d= -f2)
  pruefe 'Der Idle-Unload steht' "$([ -n "$KEEP" ] && echo ja || echo nein)" \
    "keep_alive=${KEEP:-nicht gesetzt}"
fi

# --- 7. Was am Geraet zuviel liegt ------------------------------------------
if ! docker exec llm-service ollama list >/dev/null 2>&1; then
  uebergehen 'Am Geraet liegt nur die Kurzliste' \
    'nur am Geraet: docker exec llm-service nicht erreichbar'
else
  UEBER=$(bash "$WURZEL/scripts/util/modelle-aufraeumen.sh" --zeigen 2>/dev/null |
    sed -n '/^Wuerden geloescht/,/^$/p' | tail -n +2 | awk 'NF {print $1}')
  # Dass die gestrichenen Gewichte noch auf der Platte liegen, ist ABSICHT
  # (Entscheidung 27.08.2026: geloescht wird von Hand, nach gruener Abnahme).
  # Deshalb ist das hier keine Pruefung -- eine, die in beiden Faellen gruen
  # meldet, waere keine. Es ist eine Meldung, und sie nennt den naechsten
  # Schritt.
  if [ -z "$UEBER" ]; then
    pruefe 'Am Geraet liegt nur die Kurzliste' ja 'nichts aufzuraeumen'
  else
    uebergehen 'Am Geraet liegt nur die Kurzliste' \
      "noch $(printf '%s\n' "$UEBER" | wc -l | tr -d ' ') gestrichene, von Hand: bash scripts/util/modelle-aufraeumen.sh"
  fi
fi

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
