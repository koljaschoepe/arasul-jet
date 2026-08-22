#!/bin/bash
# =============================================================================
# Abnahme J1 (Passwortwechsel) und J4 (Loeschung nach Art. 17), Plan 023
# =============================================================================
# Beide Abnahmen sind ZERSTOEREND. J1 aendert die Zugaenge des Geraets, J4
# loescht den gesamten Datenbestand eines Zugangs. Auf dem Arbeitsgeraet waere
# das kein Test, sondern ein Schaden. Deshalb laeuft dieses Skript
# ausschliesslich gegen den Pruefstand.
#
#   scripts/test/pruefstand.sh hoch
#   scripts/test/passwort-loeschung-abnahme.sh
#
# Die Reihenfolge ist nicht beliebig: erst J1, dann J4. Der Passwortwechsel
# braucht einen Zugang mit Daten, und die Loeschung raeumt genau die weg.
#
# Was geprueft wird, woertlich aus dem Plan:
#
#   J1: "Beide Passwoerter geaendert, neu angemeldet, Dateizugriff geprueft,
#        alter Zugang abgelehnt. Fehlerfaelle mit verstaendlicher Meldung."
#   J4: "Loeschung entfernt Dokumente, Anhaenge, Chats, Wissensraeume und
#        Projekte des Zugangs. Eine anschliessende Auskunft liefert leere
#        Kategorien. Vorher ein Export, nachher ein Vergleich."
#
# Der MinIO-Teil von J1 ist der eigentliche Grund, warum es diese Abnahme gibt:
# bis #504 hielt das Backend einen zwischengespeicherten Client mit dem ALTEN
# Geheimnis fest, und jeder Dateizugriff scheiterte danach still mit
# SignatureDoesNotMatch, bis jemand das Dashboard neu startete.
# =============================================================================
set -uo pipefail

BASIS="${ARASUL_PRUEFSTAND_URL:-https://localhost:8443}"
NUTZER="${ARASUL_BENUTZER:-admin}"
PASS_ALT="${ARASUL_PASSWORT:-2309}"
PASS_NEU="${ARASUL_PASSWORT_NEU:-Pruefstand-2026!}"
MINIO_ALT="${ARASUL_MINIO_PASSWORT:-}"
MINIO_NEU="${ARASUL_MINIO_PASSWORT_NEU:-Pruefstand-Minio-2026!}"

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

hole_token() {
  curl -sk -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login" |
    python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); raise SystemExit
print(d.get("token") or d.get("data", {}).get("token") or "")' 2>/dev/null
}

# --- Wachhund: nur gegen den Pruefstand ---------------------------------------
# Ein Tippfehler in ARASUL_PRUEFSTAND_URL wuerde sonst das Arbeitsgeraet
# leerraeumen. Der Pruefstand haengt an Port 8443, das Arbeitsgeraet an 443.
case "$BASIS" in
  *:8443*) : ;;
  *)
    echo "ABBRUCH: $BASIS ist nicht der Pruefstand (Port 8443)."
    echo "Diese Abnahme loescht Daten. Sie laeuft nur gegen den Pruefstand."
    exit 2
    ;;
esac

echo "=== Abnahme J1 und J4 gegen $BASIS ==="
echo

# --- J1, Teil 1: Dashboard-Passwort ------------------------------------------
TOK=$(hole_token "$NUTZER" "$PASS_ALT")
pruefe 'J1: Anmeldung mit dem alten Passwort' "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter."; exit 1; }

ANTWORT=$(curl -sk -o /dev/null -w '%{http_code}' -X POST \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "{\"currentPassword\":\"$PASS_ALT\",\"newPassword\":\"kurz\"}" \
  "$BASIS/api/settings/password/dashboard")
pruefe 'J1: ein zu kurzes Passwort wird abgelehnt' \
  "$([ "$ANTWORT" = "400" ] && echo ja || echo nein)" "HTTP $ANTWORT"

MELDUNG=$(curl -sk -X POST \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "{\"currentPassword\":\"falsch-falsch\",\"newPassword\":\"$PASS_NEU\"}" \
  "$BASIS/api/settings/password/dashboard" |
  python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("error",{}).get("message",""))
except Exception: print("")' 2>/dev/null)
pruefe 'J1: ein falsches altes Passwort nennt den Grund' \
  "$([ -n "$MELDUNG" ] && echo ja || echo nein)" "${MELDUNG:0:70}"

ANTWORT=$(curl -sk -o /dev/null -w '%{http_code}' -X POST \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "{\"currentPassword\":\"$PASS_ALT\",\"newPassword\":\"$PASS_NEU\"}" \
  "$BASIS/api/settings/password/dashboard")
pruefe 'J1: Dashboard-Passwort geaendert' \
  "$([ "$ANTWORT" = "200" ] && echo ja || echo nein)" "HTTP $ANTWORT"

sleep 3
TOK_ALT=$(hole_token "$NUTZER" "$PASS_ALT")
pruefe 'J1: der alte Zugang wird abgelehnt' \
  "$([ -z "$TOK_ALT" ] && echo ja || echo nein)"

TOK=$(hole_token "$NUTZER" "$PASS_NEU")
pruefe 'J1: Anmeldung mit dem neuen Passwort' \
  "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { echo; echo "Ohne neuen Zugang geht nichts weiter."; exit 1; }

# --- J1, Teil 2: MinIO, und der Dateizugriff DANACH --------------------------
if [ -n "$MINIO_ALT" ]; then
  ANTWORT=$(curl -sk -o /dev/null -w '%{http_code}' -X POST \
    -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
    -d "{\"currentPassword\":\"$MINIO_ALT\",\"newPassword\":\"$MINIO_NEU\"}" \
    "$BASIS/api/settings/password/minio")
  pruefe 'J1: MinIO-Passwort geaendert' \
    "$([ "$ANTWORT" = "200" ] && echo ja || echo nein)" "HTTP $ANTWORT"

  # DER Punkt dieser Abnahme. Ohne #504 scheiterte hier jeder Dateizugriff mit
  # SignatureDoesNotMatch, OHNE dass das Dashboard neu gestartet wurde.
  sleep 8
  ANTWORT=$(curl -sk -o /dev/null -w '%{http_code}' \
    -H "authorization: Bearer $TOK" "$BASIS/api/documents?limit=1")
  pruefe 'J1: Dateizugriff ueberlebt den MinIO-Wechsel OHNE Neustart' \
    "$([ "$ANTWORT" = "200" ] && echo ja || echo nein)" "HTTP $ANTWORT"
else
  echo 'hinweis  J1: MinIO uebersprungen, ARASUL_MINIO_PASSWORT nicht gesetzt'
fi

# --- J4: vorher ein Export ----------------------------------------------------
VORHER=$(curl -sk -H "authorization: Bearer $TOK" "$BASIS/api/gdpr/export")
ZAEHLUNG_VORHER=$(printf '%s' "$VORHER" | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print("{}"); raise SystemExit
d = d.get("data", d)
print(json.dumps({k: (len(v) if isinstance(v, list) else 1) for k, v in d.items() if k != "_meta"}))' 2>/dev/null)
pruefe 'J4: Auskunft vor der Loeschung' \
  "$([ -n "$ZAEHLUNG_VORHER" ] && [ "$ZAEHLUNG_VORHER" != "{}" ] && echo ja || echo nein)" \
  "$ZAEHLUNG_VORHER"

# --- J4: loeschen -------------------------------------------------------------
FALSCH=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"confirm":"ja bitte"}' \
  "$BASIS/api/gdpr/me")
pruefe 'J4: ohne die richtige Bestaetigung wird nicht geloescht' \
  "$([ "$FALSCH" = "400" ] && echo ja || echo nein)" "HTTP $FALSCH"

# Die Bestaetigung steht als Konstante im Code (DELETE_CONFIRMATION_TOKEN).
# Sie hier abzuschreiben waere ein zweiter Ort; abgeglichen wird sie durch den
# Test, der bei falschem Wort einen 400 erwartet.
ANTWORT=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"confirm":"LOESCHEN-BESTAETIGT"}' \
  "$BASIS/api/gdpr/me")
pruefe 'J4: Loeschung angenommen' \
  "$([ "$ANTWORT" = "200" ] || [ "$ANTWORT" = "202" ] && echo ja || echo nein)" "HTTP $ANTWORT"

sleep 5

# --- J4: nachher ein Vergleich ------------------------------------------------
NACHHER=$(curl -sk -H "authorization: Bearer $TOK" "$BASIS/api/gdpr/export")
LEER=$(printf '%s' "$NACHHER" | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print("fehler"); raise SystemExit
d = d.get("data", d)
voll = [k for k, v in d.items() if k not in ("_meta", "profile") and isinstance(v, list) and v]
print(",".join(voll) if voll else "alle leer")' 2>/dev/null)
pruefe 'J4: die Auskunft danach ist leer' \
  "$([ "$LEER" = "alle leer" ] && echo ja || echo nein)" "$LEER"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
