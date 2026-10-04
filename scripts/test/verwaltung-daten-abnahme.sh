#!/bin/bash
# =============================================================================
# Abnahme M5: Verwaltung Daten
# =============================================================================
# Die Abnahme des Auftrags verwaltung-daten (04.10.2026). Gemessen wird am
# laufenden Geraet, was die Karte verlangt (der Browser-Teil steht in
# `verwaltung-daten-bilder.mjs`):
#
#   AUSKUNFT    `GET /api/gdpr/export?benutzer=<id>` liefert dem Administrator die
#               Auskunft ueber EINE ANDERE Person (Kopf `_meta.username`, Dateiname,
#               Abfragen nach ihrer Kennung); `/api/gdpr/categories?benutzer=` zaehlt
#               fuer sie; eine unbekannte Kennung ist 404, eine Nicht-Zahl 400; ohne
#               `benutzer` gilt weiter der Aufrufer. Ein Mitarbeiter bekommt
#               fuer eine andere Person 403 und fuer sich selbst 200. Der Abruf steht
#               im Pruefprotokoll (`gdpr_data_export`, `fuer` = die Person).
#   LOESCHEN    Die Probe-Person `probe-daten-1004-<Stempel>` wird von dieser
#               Abnahme selbst angelegt und geloescht: danach gibt es sie weder in
#               der Liste noch in der Datenbank. Das eigene Konto weist das Geraet
#               ab (400), ein unbekanntes ist 404. NIE eine bestehende Person.
#   WERKSRESET  wird NIE ausgefuehrt. Gemessen wird nur die Ablehnung: ein falsches
#               Bestaetigungswort (400), eine fehlende Stufe (400); danach sind
#               Konten, Laeufe und Apps dieselben wie vorher. Die Vorschau
#               (GET, aendert nichts) nennt den Geraetenamen.
#   SICHERUNG   Der Zustand (`/api/backup/status`) und die Staende
#               (`/api/backup/staende`) lassen sich lesen; `jetzt sichern` laeuft
#               EINMAL (mit ARASUL_SICHERN=nein ausgelassen), danach steht die
#               letzte Sicherung nach dem Beginn dieser Abnahme. KEIN Stand wird
#               geloescht, nichts wird zurueckgeholt.
#   RECHTE      Alle Wege sind Admin-Wege; ohne Anmeldung 401.
#
# Gezaehlt wird nur Eigenes: ab `BEGINN`, der Uhr des GERAETS (Kopf `Date`).
#
# Konten: nur das VORHANDENE Probekonto, nie `admin`, keine Dauerkonten:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/verwaltung-daten-abnahme.sh
#
# Was es anlegt, raeumt es weg (die Probe-Person, auch bei Abbruch).
# Dauer: wenige Minuten (die Sicherung ist der laengste Teil). Rueckgabe 0, wenn
# jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
SICHERN="${ARASUL_SICHERN:-ja}"
STEMPEL="${ARASUL_STEMPEL:-$(date +%H%M%S)}"
EMAIL="probe-daten-1004-$STEMPEL@probe.example"
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
KOPF_DATEI="$(mktemp)"
CODE=""

# ruf <token|ohne> <verb> <pfad> [leib] -- setzt $CODE, Rumpf in $RUMPF_DATEI, Koepfe in $KOPF_DATEI
ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -D "$KOPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
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

echo "=== Abnahme M5: Verwaltung Daten gegen $BASIS ==="
echo "gezaehlt ab $BEGINN (Uhr des Geraets, UTC), Probe-Person $EMAIL"
echo

# --- 1. Zugaenge -----------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
[ "$(db 'SELECT 1;')" = 1 ] || { pruefe 'ssh-Zugang zum Geraet und seine Datenbank' nein; exit 1; }

ICH=$(curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/benutzer" |
  python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$ARASUL_BENUTZER")
pruefe 'Die eigene Kennung ist bekannt' "$([ -n "$ICH" ] && echo ja || echo nein)" "id $ICH"

# Was vorher am Geraet liegt (fuer „nichts Fremdes angefasst").
VORHER_KONTEN=$(db "SELECT count(*) FROM admin_users WHERE username NOT LIKE 'probe-daten-1004-%';")
VORHER_LAEUFE=$(db "SELECT count(*) FROM flow_runs;")
VORHER_APPS=$(db "SELECT count(*) FROM apps;" || echo "")

ID_PERSON=""
aufraeumen() {
  # Die Probe-Person, falls die Abnahme vor dem Loeschen abbricht. Nur sie.
  if [ -n "$ID_PERSON" ] && [ -n "$TOK" ]; then
    curl -sk -o /dev/null --max-time 60 -X DELETE -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID_PERSON"
  fi
  rm -f "$RUMPF_DATEI" "$KOPF_DATEI"
  printf 'aufgeraeumt  Probe-Person weg (wenn noch da)\n'
}
trap aufraeumen EXIT

# --- 2. Rechte ---------------------------------------------------------------------
ruf ohne GET "/api/gdpr/export?benutzer=1"
pruefe 'Auskunft ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf ohne GET "/api/gdpr/categories"
pruefe 'Uebersicht ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf ohne DELETE "/api/benutzer/1"
pruefe 'Loeschen ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf ohne GET "/api/werksreset/vorschau?stufe=inhalte"
pruefe 'Werksreset-Vorschau ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"

# --- 3. Die Probe-Person (von uns angelegt, mit Stempel) ------------------------------
ruf "$TOK" POST /api/benutzer "{\"vorname\":\"Probe\",\"nachname\":\"Daten-1004-$STEMPEL\",\"email\":\"$EMAIL\"}"
pruefe "Probe-Person $EMAIL angelegt" "$(ja_wenn "$CODE" 201)" "HTTP $CODE $(rumpf | cut -c1-120)"
ID_PERSON=$(rumpf | feld data.id)
STARTPASSWORT=$(rumpf | feld startpasswort)
[ -z "$ID_PERSON" ] && { echo "Ohne Probe-Person keine Auskunft und kein Loeschen."; exit 1; }
case "$EMAIL" in probe-daten-1004-*) ;; *) echo "Stempel falsch"; exit 1 ;; esac

# --- 4. Auskunft je Person -------------------------------------------------------------
ruf "$TOK" GET "/api/gdpr/export?benutzer=$ID_PERSON"
pruefe 'Auskunft ueber die Probe-Person: 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe '_meta nennt die Person, nicht den Aufrufer' \
  "$([ "$(rumpf | feld _meta.username)" = "$EMAIL" ] && [ "$(rumpf | feld _meta.userId)" = "$ID_PERSON" ] && echo ja || echo nein)" \
  "$(rumpf | feld _meta.username)"
pruefe 'Das Profil im Export ist das der Probe-Person' \
  "$([ "$(rumpf | feld profile.username)" = "$EMAIL" ] && echo ja || echo nein)"
pruefe 'Der Dateiname nennt die Person' \
  "$(enthaelt "$(grep -i content-disposition "$KOPF_DATEI")" "$EMAIL")"
pruefe 'Keine Kategorie ist unvollstaendig' "$([ "$(rumpf | feld _meta.unvollstaendig)" = "[]" ] && echo ja || echo nein)" "$(rumpf | feld _meta.unvollstaendig)"

ruf "$TOK" GET "/api/gdpr/categories?benutzer=$ID_PERSON"
pruefe 'Uebersicht fuer die Probe-Person: 200 mit Kategorien' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld categories.0.name)" = Profil ] && echo ja || echo nein)" "HTTP $CODE"

ruf "$TOK" GET "/api/gdpr/export?benutzer=99999999"
pruefe 'Unbekannte Person: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" GET "/api/gdpr/export?benutzer=abc"
pruefe 'Keine Zahl als Kennung: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" GET "/api/gdpr/export"
pruefe 'Ohne `benutzer` gilt der Aufrufer (probe-admin)' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld _meta.username)" = "$ARASUL_BENUTZER" ] && echo ja || echo nein)" "$(rumpf | feld _meta.username)"

pruefe 'Der Abruf steht im Pruefprotokoll (gdpr_data_export, fuer = Probe-Person)' \
  "$([ "$(db "SELECT count(*) FROM audit_logs WHERE action = 'gdpr_data_export' AND timestamp >= '$BEGINN' AND details->>'fuer' = '$EMAIL';")" -ge 1 ] && echo ja || echo nein)"

# Ein Mitarbeiter (die Probe-Person mit ihrem Startpasswort): fremde Auskunft 403, eigene 200.
MITARBEITER=$(curl -sk --max-time 30 -X POST -H 'content-type: application/json' \
  -d "{\"username\":\"$EMAIL\",\"password\":\"$STARTPASSWORT\"}" "$BASIS/api/auth/login" | feld token)
if [ -n "$MITARBEITER" ]; then
  ruf "$MITARBEITER" GET "/api/gdpr/export?benutzer=$ICH"
  pruefe 'Ein Mitarbeiter bekommt fuer eine andere Person 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$MITARBEITER" GET "/api/gdpr/export?benutzer=$ID_PERSON"
  pruefe 'Ein Mitarbeiter bekommt fuer sich selbst 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  ruf "$MITARBEITER" DELETE "/api/benutzer/$ICH"
  pruefe 'Ein Mitarbeiter kann niemanden loeschen: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
else
  printf 'uebersprungen  Anmeldung der Probe-Person (Startpasswort-Pflicht), keine Rollenpruefung als Mitarbeiter\n'
fi

# --- 5. Werksreset: NIE ausfuehren, nur die Ablehnung --------------------------------
ruf "$TOK" GET "/api/werksreset/vorschau?stufe=inhalte"
GERAETENAME=$(rumpf | feld geraetename)
pruefe 'Die Vorschau (aendert nichts) nennt den Geraetenamen' "$([ "$CODE" = 200 ] && [ -n "$GERAETENAME" ] && echo ja || echo nein)" "$GERAETENAME"
ruf "$TOK" POST /api/werksreset "{\"stufe\":\"inhalte\",\"bestaetigung\":\"falsch-$STEMPEL\"}"
pruefe 'Falsches Bestaetigungswort: abgelehnt (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE $(rumpf | cut -c1-110)"
ruf "$TOK" POST /api/werksreset "{\"bestaetigung\":\"falsch-$STEMPEL\"}"
pruefe 'Fehlende Stufe: abgelehnt (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
pruefe 'Nichts ist verschwunden: Konten, Laeufe und Apps wie vorher (plus die Probe-Person)' \
  "$([ "$(db "SELECT count(*) FROM admin_users WHERE username NOT LIKE 'probe-daten-1004-%';")" = "$VORHER_KONTEN" ] && [ "$(db "SELECT count(*) FROM flow_runs;")" -ge "$VORHER_LAEUFE" ] && [ "$(db "SELECT count(*) FROM apps;")" = "$VORHER_APPS" ] && echo ja || echo nein)" \
  "Konten $VORHER_KONTEN, Laeufe $VORHER_LAEUFE, Apps $VORHER_APPS"

# --- 6. Person loeschen ------------------------------------------------------------------
ruf "$TOK" DELETE "/api/benutzer/$ICH"
pruefe 'Das eigene Konto weist das Geraet ab (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE $(rumpf | cut -c1-120)"
ruf "$TOK" DELETE "/api/benutzer/99999999"
pruefe 'Eine unbekannte Person: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" DELETE "/api/benutzer/$ID_PERSON"
pruefe 'Die Probe-Person loeschen: 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE $(rumpf | cut -c1-120)"
ID_PERSON=""
pruefe 'Danach gibt es sie in der Datenbank nicht mehr' \
  "$(ja_wenn "$(db "SELECT count(*) FROM admin_users WHERE username = '$EMAIL';")" 0)"
ruf "$TOK" GET /api/benutzer
pruefe 'Und nicht mehr in der Liste' \
  "$([ "$CODE" = 200 ] && [ "$(enthaelt "$(rumpf)" "$EMAIL")" = nein ] && echo ja || echo nein)"
pruefe 'Das Loeschen steht im Pruefprotokoll (benutzer_geloescht)' \
  "$([ "$(db "SELECT count(*) FROM audit_logs WHERE action = 'benutzer_geloescht' AND timestamp >= '$BEGINN' AND details->>'deleted_user' = '$EMAIL';")" -ge 1 ] && echo ja || echo nein)"
pruefe 'Keine bestehende Person ist verschwunden' \
  "$(ja_wenn "$(db "SELECT count(*) FROM admin_users WHERE username NOT LIKE 'probe-daten-1004-%';")" "$VORHER_KONTEN")"

# --- 7. Sicherung ----------------------------------------------------------------------------
ruf "$TOK" GET /api/backup/status
pruefe 'Der Sicherungszustand laesst sich lesen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET /api/backup/staende
pruefe 'Die Staende lassen sich lesen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
STAENDE_VORHER=$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin); print(len(d.get("data", d if isinstance(d,list) else [])))' 2>/dev/null)
if [ "$SICHERN" = ja ]; then
  ruf "$TOK" POST /api/backup/sicherung
  pruefe 'Jetzt sichern (einmal): 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  ruf "$TOK" GET /api/backup/status
  ZEIT=$(rumpf | feld data.letzteSicherung.zeitpunkt)
  pruefe 'Die letzte Sicherung steht nach dem Beginn dieser Abnahme' \
    "$(python3 -c 'import sys
from datetime import datetime, timezone
z = sys.argv[1].replace("Z", "+00:00")
b = datetime.strptime(sys.argv[2], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
try:
    t = datetime.fromisoformat(z)
    if t.tzinfo is None: t = t.replace(tzinfo=timezone.utc)
    print("ja" if t >= b else "nein")
except Exception:
    print("nein")' "$ZEIT" "$BEGINN")" "$ZEIT"
else
  printf 'uebersprungen  Jetzt sichern (ARASUL_SICHERN=nein)\n'
fi
ruf "$TOK" GET /api/backup/staende
STAENDE_NACHHER=$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin); print(len(d.get("data", d if isinstance(d,list) else [])))' 2>/dev/null)
pruefe 'Kein Stand wurde geloescht (Zahl gleich oder groesser)' \
  "$([ -n "$STAENDE_VORHER" ] && [ "${STAENDE_NACHHER:-0}" -ge "$STAENDE_VORHER" ] && echo ja || echo nein)" "$STAENDE_VORHER -> $STAENDE_NACHHER"

# --- 8. Die Anmeldung steht -------------------------------------------------------------------
ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
