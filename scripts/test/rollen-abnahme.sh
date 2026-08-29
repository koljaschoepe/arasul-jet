#!/bin/bash
# =============================================================================
# Abnahme der Rollen, Phase C1 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Skript gruen: Mitarbeiter bekommt auf jede
# Admin-Route 403." Genau das prueft dieses Skript, und zwar gegen das
# laufende Geraet, nicht gegen einen Mock.
#
# Welche Routen Admin-Routen sind, sagt der Code selbst: rollenregeln.py liest
# jede Route mit ihrem requireRole aus apps/dashboard-backend/src/routes/.
# Die Liste hier abzuschreiben waere ein zweiter Ort, der driftet; eine neue
# Admin-Route ist damit automatisch Teil der Abnahme.
#
# Das Skript legt zwei Benutzer an (einen Admin, einen Mitarbeiter), meldet
# beide an, ruft jede Admin-Route mit dem Mitarbeiter auf und erwartet 403,
# prueft beim Admin und beim Mitarbeiter ein paar Routen, die gehen muessen,
# und loescht beide Benutzer wieder, auch wenn unterwegs etwas rot war.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/rollen-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin.
#
# ANMELDUNGEN: zwei eigene (Abnahme-Admin, Abnahme-Mitarbeiter) plus die des
# Administrators. Die dritte entfaellt, wenn `abnahmen.sh` den Lauf startet:
# seit dem 27.08.2026 teilt sich die ganze Reihe einen Token, und diese Abnahme
# nimmt ihn aus `ARASUL_TOKEN`. Die Drossel bleibt bei dreissig Fehlschlaege je Viertelstunde
# und IP; die zwei eigenen Zugaenge lassen sich nicht teilen, sie sind der Kern
# dessen, was hier gemessen wird.
#
# Nicht zerstoerend: mit dem Mitarbeiter wird jede Admin-Route zwar
# aufgerufen, auch POST /api/werksreset, aber requireRole steht in jeder
# Kette VOR der Arbeit, und das 403 ist genau der Beleg dafuer. Mit dem Admin
# werden nur GETs aufgerufen.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Der geteilte Token der Reihe (Entscheidung 27.08.2026). Steht ARASUL_TOKEN
# in der Umgebung, meldet sich diese Abnahme fuer den Administrator NICHT an.
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
# Ein Zufallsteil, damit ein abgebrochener Lauf keinen Namenskonflikt beim
# naechsten hinterlaesst.
STEMPEL="$(date +%s)"
ABN_ADMIN="abnahme-admin-$STEMPEL"
ABN_MITARB="abnahme-mitarbeiter-$STEMPEL"
ABN_PASS="Abnahme-$STEMPEL!"

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

json_feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k, {}) if isinstance(d, dict) else {}
print(d if isinstance(d, (str, int)) else "")' "$1" 2>/dev/null
}

# Anmelden und dabei sagen, WARUM es nicht geht.
#
# GEFUNDEN AM 27.08.2026 (Phase C2): diese Funktion gab nur den Token zurueck.
# War er leer, meldete die Abnahme "Abnahme-Admin meldet sich an" als ROT ohne
# jede Angabe, und danach "Ohne beide Sitzungen gibt es nichts zu messen." Ein
# 429 der Anmeldedrossel, ein 401 bei falschem Passwort und ein 403 bei
# stillgelegtem Konto sahen dabei alle gleich aus.
#
# Das ist die wahrscheinlichste Erklaerung fuer den einen Fall, der beim ersten
# Lauf rot und beim zweiten gruen war: `loginLimiter` erlaubt DREISSIG Fehlschlaege
# je Viertelstunde und IP, diese Abnahme braucht drei, und wer sich vorher im
# Browser ein paarmal angemeldet hat, hat sieben davon schon verbraucht. Der
# zweite Lauf eine Viertelstunde spaeter trifft ein leeres Fenster und ist
# gruen. Nachstellen laesst sich das nicht mehr, benennen schon: seit heute
# steht der Code an der Pruefung, und ein 429 heisst 429.
#
# Der Code landet in einer DATEI, nicht in einer Variablen: `hole_token` wird
# als `TOK=$(hole_token ...)` aufgerufen, und eine Kommandosubstitution ist eine
# Subshell. Was sie in eine Variable schreibt, ist beim naechsten Befehl wieder
# weg -- der erste Entwurf meldete deshalb "HTTP " ohne Zahl.
ANM_DATEI="$(mktemp)"
# Bis das eigentliche Aufraeumen steht, raeumt wenigstens die Datei sich selbst.
trap 'rm -f "$ANM_DATEI"' EXIT
hole_token() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d' | json_feld token
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

# Ein Aufruf, der den HTTP-Code liefert. Wiederholt wird bei 429 (Drossel) und
# bei 000 (Zeitueberschreitung oder abgebrochene Verbindung): beides sagt etwas
# ueber den Zeitpunkt, nichts ueber die Rolle. `000` galt bis zum 27.08.2026 als
# endgueltige Antwort, und eine Box, auf der nebenher ein Flow die GPU haelt,
# braucht fuer eine Sammel-Auskunft schon mal laenger als die zwanzig Sekunden.
rufe() {
  local verb="$1" pfad="$2" token="$3" code versuch
  for versuch in 1 2 3; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X "$verb" --max-time 30 \
      -H "authorization: Bearer $token" -H 'content-type: application/json' \
      -d '{}' "$BASIS$pfad")
    case "$code" in
      429) sleep 20 ;;
      000) sleep 5 ;;
      *) break ;;
    esac
  done
  echo "$code"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Rollen (Phase C1) gegen $BASIS ==="
echo

# --- 1. Admin anmelden -------------------------------------------------------
# `arasul_token` nimmt den geteilten Token, den abgelegten oder meldet einmal an.
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (HTTP $(arasul_anmeldecode); 429 heisst Anmeldedrossel)."; exit 1; }

ROLLE=$(curl -sk -H "authorization: Bearer $TOK" "$BASIS/api/auth/me" | json_feld user.role)
pruefe '/api/auth/me nennt die Rolle admin' "$([ "$ROLLE" = "admin" ] && echo ja || echo nein)" "role=$ROLLE"

# --- 2. Zwei Benutzer anlegen, Aufraeumen sicherstellen ----------------------
ID_ADMIN=""
ID_MITARB=""
aufraeumen() {
  rm -f "$ANM_DATEI"
  local code
  for id in "$ID_ADMIN" "$ID_MITARB"; do
    [ -z "$id" ] && continue
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$id")
    printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$id" "$code"
  done
}
trap aufraeumen EXIT

lege_an() {
  curl -sk -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$ABN_PASS\",\"email\":\"$1@abnahme.local\",\"rolle\":\"$2\"}" \
    "$BASIS/api/benutzer" | json_feld data.id
}
ID_ADMIN=$(lege_an "$ABN_ADMIN" admin)
pruefe 'Abnahme-Admin angelegt' "$([ -n "$ID_ADMIN" ] && echo ja || echo nein)" "id=$ID_ADMIN"
ID_MITARB=$(lege_an "$ABN_MITARB" mitarbeiter)
pruefe 'Abnahme-Mitarbeiter angelegt' "$([ -n "$ID_MITARB" ] && echo ja || echo nein)" "id=$ID_MITARB"
[ -z "$ID_ADMIN" ] || [ -z "$ID_MITARB" ] && { echo; echo "Ohne die zwei Benutzer gibt es nichts zu messen."; exit 1; }

TOK_ADMIN=$(hole_token "$ABN_ADMIN" "$ABN_PASS")
pruefe 'Abnahme-Admin meldet sich an' "$([ -n "$TOK_ADMIN" ] && echo ja || echo nein)" "HTTP $(anm_code)"
# Der Mitarbeiter meldet sich mit seiner E-Mail-Adresse an: so steht es in
# der Vision, "Mitarbeiter melden sich mit E-Mail und Passwort an".
TOK_MITARB=$(hole_token "$ABN_MITARB@abnahme.local" "$ABN_PASS")
pruefe 'Abnahme-Mitarbeiter meldet sich mit E-Mail an' "$([ -n "$TOK_MITARB" ] && echo ja || echo nein)" "HTTP $(anm_code)"
[ -z "$TOK_ADMIN" ] || [ -z "$TOK_MITARB" ] && { echo; echo "Ohne beide Sitzungen gibt es nichts zu messen (letzter Anmeldecode $(anm_code); 429 heisst Anmeldedrossel, dreissig Fehlschlaege je Viertelstunde und IP)."; exit 1; }

ROLLE=$(curl -sk -H "authorization: Bearer $TOK_MITARB" "$BASIS/api/auth/me" | json_feld user.role)
pruefe 'Mitarbeiter sieht seine Rolle' "$([ "$ROLLE" = "mitarbeiter" ] && echo ja || echo nein)" "role=$ROLLE"

# --- 3. Jede Admin-Route mit dem Mitarbeiter: 403 ----------------------------
# Die Liste kommt aus dem Code. Pfadparameter werden mit `1` gefuellt; die
# Rollenpruefung steht vor jeder Parameterpruefung, also ist der Wert egal.
ADMIN_ROUTEN=$(python3 "$WURZEL/scripts/test/rollenregeln.py" --wurzel "$WURZEL" --json |
  python3 -c 'import sys,json
for r in json.load(sys.stdin):
    if r["rollen"] == ["admin"]:
        print(r["verb"], r["pfad"].replace(":x", "1"))')
ANZAHL=$(printf '%s\n' "$ADMIN_ROUTEN" | grep -c .)
pruefe 'Admin-Routen aus dem Code gelesen' "$([ "$ANZAHL" -gt 100 ] && echo ja || echo nein)" "$ANZAHL Routen"

FALSCH=""
n=0
while read -r verb pfad; do
  [ -z "$verb" ] && continue
  n=$((n + 1))
  code=$(rufe "$verb" "$pfad" "$TOK_MITARB")
  if [ "$code" != "403" ]; then
    FALSCH="$FALSCH
         $verb $pfad -> HTTP $code"
  fi
  # llmLimiter (10/s) auf /flows, /embeddings: kurz Luft lassen.
  case "$pfad" in */flows*|*/embeddings*) sleep 0.15 ;; esac
done <<< "$ADMIN_ROUTEN"
pruefe "Mitarbeiter bekommt auf jede der $n Admin-Routen 403" \
  "$([ -z "$FALSCH" ] && echo ja || echo nein)"
[ -n "$FALSCH" ] && printf '       nicht 403:%s\n' "$FALSCH"

# --- 4. Der Mitarbeiter darf, was ihm zusteht ---------------------------------
for pfad in /api/auth/me /api/auth/sessions /api/flows /api/flows/laeufe /api/gdpr/export; do
  code=$(rufe GET "$pfad" "$TOK_MITARB")
  pruefe "Mitarbeiter: GET $pfad" "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"
done

# --- 5. Der Abnahme-Admin kommt durch, wo der Mitarbeiter 403 bekam ----------
for pfad in /api/benutzer /api/system/status /api/models/installed /api/ops/overview; do
  code=$(rufe GET "$pfad" "$TOK_ADMIN")
  pruefe "Abnahme-Admin: GET $pfad" "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"
done

# --- 6. Der Mitarbeiter kann keine Benutzer anlegen ---------------------------
code=$(curl -sk -o /dev/null -w '%{http_code}' -X POST \
  -H "authorization: Bearer $TOK_MITARB" -H 'content-type: application/json' \
  -d "{\"username\":\"schmuggel-$STEMPEL\",\"password\":\"$ABN_PASS\",\"rolle\":\"admin\"}" \
  "$BASIS/api/benutzer")
pruefe 'Mitarbeiter kann sich keinen Admin anlegen' "$([ "$code" = "403" ] && echo ja || echo nein)" "HTTP $code"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
