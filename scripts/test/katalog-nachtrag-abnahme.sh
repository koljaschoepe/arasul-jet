#!/bin/bash
# =============================================================================
# Abnahme M5: der Katalog traegt nach, was nur bei Ollama liegt
# =============================================================================
# Die Abnahme des Auftrags katalog-traegt-ollama-nach (05.10.2026). Gemessen
# wird am laufenden Geraet, ohne ein Modell zu laden, herunterzuladen oder zu
# loeschen:
#
#   VOLLSTAENDIG  Jedes Modell in `ollama list` steht im Katalog und in
#                 `GET /api/models/verwaltung` (mit und ohne `:latest`).
#   ZEILE         `ARASUL_MODELL` (Voreinstellung `gemma4:26b`) steht dort mit
#                 Groesse (gleich der von Ollama, `/api/tags`) und mit
#                 Faehigkeiten, die zu `/api/show` passen (Bild, Werkzeuge,
#                 Kontext). Die Zeile ist `ungemessen`.
#   ABGLEICH      Der Nachtrag des Abgleichs (`traegNachModelle`, im Container
#                 gerufen, seit `POST /api/models/sync` weg ist) laeuft, nennt
#                 `nachgetragen` und traegt beim zweiten Mal nichts mehr nach.
#   VON HAND      Die Zeilen, die schon vor dem Abgleich im Katalog standen
#                 (Name, Beschreibung, Groesse, RAM, Aufgabe, `jetson_tested`),
#                 sind danach unveraendert.
#   NICHTS GELADEN  `ollama list` und `ollama ps` sind nachher dieselben wie
#                 vorher; kein Download, kein Laden, kein Loeschen.
#
# Konten: nur das VORHANDENE Probekonto, nie `admin`, keine neuen:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/katalog-nachtrag-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
MODELL="${ARASUL_MODELL:-gemma4:26b}"

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

if [ -z "$GERAET" ]; then
  echo "ARASUL_GERAET fehlt (ssh-Ziel des Geraets, z. B. jetson)."
  exit 1
fi
if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen."
  exit 1
fi

RUMPF_DATEI="$(mktemp)"
trap 'rm -f "$RUMPF_DATEI"' EXIT
CODE=""
ruf() { # token verb pfad
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 120 -X "$2" \
    -H "authorization: Bearer $1" "$BASIS$3")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}
ollama() { # pfad [leib]
  if [ -n "${2:-}" ]; then
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" "curl -s --max-time 30 localhost:11434$1 -d '$2'" 2>/dev/null
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" "curl -s --max-time 30 localhost:11434$1" 2>/dev/null
  fi
}
py() { python3 -c "$1" 2>/dev/null; }
ollama_namen() { ollama /api/tags | py 'import sys,json
print(" ".join(sorted(m["name"] for m in json.load(sys.stdin)["models"])))'; }
ollama_warm() { ollama /api/ps | py 'import sys,json
print(" ".join(sorted(m["name"] for m in json.load(sys.stdin)["models"])))'; }
# Die Zeilen, die ein Abgleich nicht aendern darf (ohne Steckbrief-Spalten).
katalog_stand() {
  db "SELECT id, name, description, size_bytes, ram_required_gb, category, task, jetson_tested, performance_tier
        FROM llm_model_catalog ORDER BY id;"
}

TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"

VORHER_LISTE="$(ollama_namen)"
VORHER_WARM="$(ollama_warm)"
VORHER_KATALOG="$(katalog_stand)"
pruefe 'Ollama am Geraet antwortet und nennt Modelle' "$([ -n "$VORHER_LISTE" ] && echo ja || echo nein)" "$VORHER_LISTE"

# --- 1. Abgleich, zweimal -------------------------------------------------------------
# `POST /api/models/sync` ist mit der Totcode-Pruefung vom 06.10.2026 gefallen;
# der Abgleich laeuft seither nur beim Start und alle MODEL_SYNC_INTERVAL im
# Backend. Gemessen wird deshalb der Schritt, um den es hier geht, direkt im
# Container: `traegNachModelle` mit den Eintraegen aus `/api/tags`, in einem
# eigenen Node-Prozess. Nur der Nachtrag, nicht der ganze Abgleich: der nimmt
# pausierte Downloads wieder auf, und ein Download aus einem Prozess, der
# gleich endet, waere genau das, was diese Abnahme ausschliesst.
abgleich() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" "docker exec -i dashboard-backend node -" <<'JS' 2>/dev/null | tail -n1
const axios = require('axios');
const database = require('./src/database');
const logger = require('./src/utils/logger');
const services = require('./src/config/services');
const { createSyncHelpers } = require('./src/services/llm/modelSyncHelpers');
(async () => {
  const helfer = createSyncHelpers({
    database,
    logger,
    activeDownloadIds: new Set(),
    modelAvailabilityCache: new Map(),
  });
  const antwort = await axios.get(`${services.llm.url}/api/tags`, { timeout: 10000 });
  const nachgetragen = await helfer.traegNachModelle(antwort.data.models || []);
  console.log(JSON.stringify({ success: true, nachgetragen }));
  process.exit(0);
})().catch(fehler => {
  console.log(JSON.stringify({ success: false, error: fehler.message }));
  process.exit(1);
});
JS
}
ERSTES="$(abgleich)"
pruefe 'Der Nachtrag (traegNachModelle) laeuft mit success' \
  "$([ "$(printf '%s' "$ERSTES" | py 'import sys,json; print(json.load(sys.stdin).get("success"))')" = True ] && echo ja || echo nein)" "$(printf '%s' "$ERSTES" | cut -c1-120)"
ZWEITES="$(abgleich | py 'import sys,json; print(len(json.load(sys.stdin).get("nachgetragen", ["?"])))')"
pruefe 'der zweite Abgleich traegt nichts mehr nach' "$(ja_wenn "$ZWEITES" 0)" "nachgetragen: $ZWEITES"

# --- 2. Vollstaendig ------------------------------------------------------------------
ruf "$TOK" GET /api/models/verwaltung
VERWALTUNG="$(rumpf)"
FEHLEN="$(printf '%s' "$VERWALTUNG" | py "import sys,json
ids = {m['id'] for m in json.load(sys.stdin)['modelle']}
namen = '''$VORHER_LISTE'''.split()
def da(n):
    alt = n[:-7] if n.endswith(':latest') else n + ':latest'
    return n in ids or alt in ids
print(' '.join(n for n in namen if not da(n)))")"
pruefe 'jedes Modell von Ollama steht in der Verwaltung' "$([ -z "$FEHLEN" ] && echo ja || echo nein)" "fehlt: ${FEHLEN:-nichts}"
IM_KATALOG="$(db "SELECT count(*) FROM llm_model_catalog WHERE id = '$MODELL' OR ollama_name = '$MODELL';")"
pruefe "$MODELL steht im Katalog" "$(ja_wenn "$IM_KATALOG" 1)"

# --- 3. Die Zeile: Groesse und Faehigkeiten stimmen mit Ollama -------------------------
OLLAMA_GROESSE="$(ollama /api/tags | py "import sys,json
m = next((x for x in json.load(sys.stdin)['models'] if x['name'] == '$MODELL'), None)
print(m['size'] if m else '')")"
ZEILE="$(printf '%s' "$VERWALTUNG" | py "import sys,json
m = next((x for x in json.load(sys.stdin)['modelle'] if x['id'] == '$MODELL'), None)
print(json.dumps(m) if m else '')")"
pruefe "$MODELL steht in der Verwaltung" "$([ -n "$ZEILE" ] && echo ja || echo nein)"
GROESSE="$(printf '%s' "$ZEILE" | py 'import sys,json; print(json.load(sys.stdin).get("groesse_bytes") or "")')"
pruefe 'mit der Groesse, die Ollama meldet' "$(ja_wenn "$GROESSE" "$OLLAMA_GROESSE")" "$GROESSE gegen $OLLAMA_GROESSE"
SHOW="$(ollama /api/show "{\"model\":\"$MODELL\"}")"
SOLL="$(printf '%s' "$SHOW" | py 'import sys,json
c = json.load(sys.stdin).get("capabilities", [])
print("bild=%s werkzeuge=%s" % ("vision" in c, "tools" in c))')"
IST="$(db "SELECT 'bild=' || CASE WHEN supports_vision_input THEN 'True' ELSE 'False' END
                || ' werkzeuge=' || CASE WHEN supports_tools THEN 'True' ELSE 'False' END
           FROM llm_model_catalog WHERE id = '$MODELL' OR ollama_name = '$MODELL' LIMIT 1;")"
pruefe 'Bild und Werkzeuge wie in /api/show' "$(ja_wenn "$IST" "$SOLL")" "Katalog: $IST, Ollama: $SOLL"
KONTEXT_SOLL="$(printf '%s' "$SHOW" | py 'import sys,json
i = json.load(sys.stdin).get("model_info", {})
print(next((int(v) for k, v in i.items() if k.endswith(".context_length")), ""))')"
KONTEXT_IST="$(db "SELECT context_window FROM llm_model_catalog WHERE id = '$MODELL' OR ollama_name = '$MODELL' LIMIT 1;")"
pruefe 'Kontext wie in /api/show' "$(ja_wenn "$KONTEXT_IST" "$KONTEXT_SOLL")" "$KONTEXT_IST gegen $KONTEXT_SOLL"
FAEHIG="$(printf '%s' "$ZEILE" | py 'import sys,json; print(json.load(sys.stdin).get("faehigkeiten"))')"
pruefe 'die Verwaltung nennt Faehigkeiten' "$([ -n "$FAEHIG" ] && [ "$FAEHIG" != None ] && echo ja || echo nein)" "$FAEHIG"

# --- 4. Von Hand Gepflegtes bleibt -----------------------------------------------------
NACHHER_KATALOG="$(katalog_stand)"
# Was vorher da war, steht nachher unveraendert da (neue Zeilen duerfen dazukommen).
VERAENDERT="$(comm -23 <(printf '%s\n' "$VORHER_KATALOG" | sort) <(printf '%s\n' "$NACHHER_KATALOG" | sort) | wc -l | tr -d ' ')"
pruefe 'bestehende Katalogzeilen sind nach dem Abgleich unveraendert' "$(ja_wenn "$VERAENDERT" 0)" "$VERAENDERT veraendert"

# --- 5. Nichts geladen, nichts geloescht ----------------------------------------------
pruefe 'ollama list ist wie vorher (nichts geladen, nichts geloescht)' "$(ja_wenn "$(ollama_namen)" "$VORHER_LISTE")"
pruefe 'ollama ps ist wie vorher (kein Modell warm gemacht)' "$(ja_wenn "$(ollama_warm)" "$VORHER_WARM")"

ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
