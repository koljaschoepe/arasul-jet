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
# Bis zum 26.08.2026 pruefte diese Abnahme auch den MinIO-Passwortwechsel
# (Fund #504: ein zwischengespeicherter Client mit dem alten Geheimnis). Mit
# Phase B4 des Rueckbaus ist MinIO samt der Route
# /api/settings/password/minio weg; J1 ist nur noch das Administrator-Passwort.
# =============================================================================
set -uo pipefail

# -----------------------------------------------------------------------------
# Sicherheitsnetz: dieses Skript zielt sonst auf das Arbeitsgeraet
# -----------------------------------------------------------------------------
# Am 23.08.2026 selbst hineingelaufen. Der Kopf sagt "laeuft ausschliesslich
# gegen den Pruefstand", die Vorgabe war aber `https://localhost:8443` — und
# das ist NUR auf dem Geraet der Pruefstand. Vom Arbeitsrechner aus zeigt
# dieselbe Adresse durch den SSH-Tunnel auf das ECHTE Geraet.
#
# Der Lauf hat dort das Administrator-Passwort zu aendern versucht. Verhindert
# hat es die Anmeldedrossel (HTTP 429), also Zufall, nicht Vorsorge. Ein Satz
# im Kommentar ist kein Sicherheitsnetz.
#
# Jetzt wird der Pruefstand NACHGEWIESEN, bevor irgendetwas passiert: es muss
# ein laufender Container `pruef-reverse-proxy` geben, der Port 443 nach 8443
# veroeffentlicht. Kein docker, kein Container, kein Lauf.
if ! command -v docker >/dev/null 2>&1; then
  echo "ABBRUCH: kein docker erreichbar."
  echo "Diese Abnahme ist zerstoerend und laeuft AUF DEM GERAET, nicht vom"
  echo "Arbeitsrechner aus. Dort ist https://localhost:8443 der Pruefstand;"
  echo "hier waere es durch den Tunnel das echte Geraet."
  exit 2
fi

PRUEF_CONTAINER="${ARASUL_PRUEFSTAND_CONTAINER:-pruef-reverse-proxy}"
PRUEF_HAFEN=$(docker port "$PRUEF_CONTAINER" 443 2>/dev/null | head -1)
case "$PRUEF_HAFEN" in
  *:8443) : ;;
  *)
    echo "ABBRUCH: kein Pruefstand gefunden."
    echo "Erwartet: ein laufender Container '$PRUEF_CONTAINER', der 443 nach 8443"
    echo "veroeffentlicht. Gefunden: ${PRUEF_HAFEN:-nichts}."
    echo "Erst hochfahren:  scripts/test/pruefstand.sh hoch"
    exit 2
    ;;
esac

BASIS="${ARASUL_PRUEFSTAND_URL:-https://localhost:8443}"
NUTZER="${ARASUL_BENUTZER:-admin}"
PASS_ALT="${ARASUL_PASSWORT:-2309}"
PASS_NEU="${ARASUL_PASSWORT_NEU:-Pruefstand-2026!}"

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

# --- J4: erst Daten anlegen ---------------------------------------------------
# Ohne diesen Abschnitt loeschte die Abnahme NICHTS und war trotzdem gruen.
# Auf einem frischen Pruefstand gibt es keine Chats und keine Wissensraeume;
# "alle Kategorien leer" war danach kein Beweis, sondern eine Selbstaussage
# (23.08.2026). Eine Loeschung, die nichts zu loeschen hat, gelingt immer.
CHAT_ID=$(curl -sk -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"title":"Abnahme-Chat"}' "$BASIS/api/chats" |
  python3 -c 'import sys,json
try: print(json.load(sys.stdin)["chat"]["id"])
except Exception: print("")' 2>/dev/null)
if [ -n "$CHAT_ID" ]; then
  curl -sk -o /dev/null -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
    -d '{"role":"user","content":"Diese Nachricht muss die Loeschung entfernen."}' \
    "$BASIS/api/chats/$CHAT_ID/messages"
fi
curl -sk -o /dev/null -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"name":"Abnahme-Raum","description":"Wissensraum der Abnahme"}' "$BASIS/api/spaces"

pruefe 'J4: es gibt ueberhaupt etwas zu loeschen' \
  "$([ -n "$CHAT_ID" ] && echo ja || echo nein)" "Chat $CHAT_ID"

# --- J4: vorher ein Export ----------------------------------------------------
VORHER=$(curl -sk -H "authorization: Bearer $TOK" "$BASIS/api/gdpr/export")
# Dieselbe Formel wie nachher. Vorher `1` fuer jedes Objekt zu zaehlen und
# nachher die Schluessel war der Grund, warum die Zahlen NACH der Loeschung
# hoeher aussahen als davor.
ZAEHLUNG_VORHER=$(printf '%s' "$VORHER" | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print("{}"); raise SystemExit
d = d.get("data", d)
def zahl(v):
    if isinstance(v, list): return len(v)
    if isinstance(v, dict):
        if "count" in v: return int(v["count"] or 0)
        if "data" in v: return len(v["data"] or [])
        return len(v)
    return 0 if v in (None, "") else 1
print(json.dumps({k: zahl(v) for k, v in d.items() if k != "_meta"}))' 2>/dev/null)
pruefe 'J4: Auskunft vor der Loeschung' \
  "$([ -n "$ZAEHLUNG_VORHER" ] && [ "$ZAEHLUNG_VORHER" != "{}" ] && echo ja || echo nein)" \
  "$ZAEHLUNG_VORHER"

# --- J4: loeschen -------------------------------------------------------------
# Der Zeitpunkt wird gebraucht, um nachher Altes von Neuem zu trennen.
VOR_LOESCHUNG=$(date -u '+%Y-%m-%dT%H:%M:%S')
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
# Neu anmelden: die Loeschung verwirft alle Sitzungen des Zugangs, und das ist
# richtig so. Der alte Token liefert danach einen Fehler, und der sah in der
# Zeile unten aus wie ein nicht geleerter Bestand.
TOK=$(hole_token "$NUTZER" "$PASS_NEU")
NACHHER=$(curl -sk -H "authorization: Bearer $TOK" "$BASIS/api/gdpr/export")
# Gezaehlt wird der INHALT einer Kategorie, nicht ihre Huelle.
#
# Zwei Anlaeufe waren falsch, und zwar in entgegengesetzte Richtungen. Der
# erste zaehlte `isinstance(v, list) and v`. Der Export liefert je Kategorie
# aber ein Objekt `{"count": 0, "data": []}`, also zaehlte er nichts und
# meldete "alle leer", waehrend die Loeschung an einem Fremdschluessel
# gescheitert war (23.08.2026, frueh).
#
# Der zweite zaehlte bei einem Objekt dessen SCHLUESSEL. Eine leere Kategorie
# hat aber immer zwei oder drei davon (`count`, `data`, manchmal `note`), also
# stand danach `{"documents": 3}` da, obwohl `count` 0 war (23.08.2026, spaet).
#
# Richtig ist: `count` lesen, sonst die Laenge von `data`, und erst wenn beides
# fehlt die Schluessel. Ein falsches Gruen wiese einen Rechtsverstoss als
# erledigt aus, ein falsches Rot schickt einen vier Stunden in die Irre.
ZAEHLUNG_NACHHER=$(printf '%s' "$NACHHER" | ARASUL_STICHTAG="$VOR_LOESCHUNG" python3 -c 'import sys,json,os
try: d = json.load(sys.stdin)
except Exception: print("fehler"); raise SystemExit
d = d.get("data", d)
stichtag = os.environ.get("ARASUL_STICHTAG", "")

# Gezaehlt wird, was AELTER ist als die Loeschung.
#
# Die Abnahme muss sich nach der Loeschung neu anmelden (der alte Token gilt
# nicht mehr, und das ist richtig so). Diese Anmeldung und der Abruf danach
# erzeugen selbst Eintraege: eine Anmeldung, eine Sitzung, zwei
# Sicherheitsereignisse. Sie auf "leer" zu pruefen hiess, die eigene Messung
# als Verstoss zu buchen — das war am 23.08.2026 ein falsches Rot.
#
# Sie einfach auszunehmen waere die andere Falle: dann faende die Abnahme auch
# eine echte Anmeldehistorie von VOR der Loeschung nicht mehr. Deshalb der
# Zeitstempel: Art. 17 verlangt, dass das Alte weg ist, nicht dass danach
# nichts mehr passiert.
ZEITFELDER = ("timestamp", "attempted_at", "created_at", "occurred_at", "last_activity")

def alt_eintrag(e):
    if not isinstance(e, dict):
        return True
    for f in ZEITFELDER:
        wert = e.get(f)
        if isinstance(wert, str) and wert:
            return wert[:19] < stichtag
    return True  # kein Zeitstempel: im Zweifel als alt zaehlen

def zahl(v):
    if isinstance(v, list): return sum(1 for e in v if alt_eintrag(e))
    if isinstance(v, dict):
        if isinstance(v.get("data"), list): return sum(1 for e in v["data"] if alt_eintrag(e))
        if "count" in v: return int(v["count"] or 0)
        return len(v)
    return 0 if v in (None, "") else 1

voll = {k: zahl(v) for k, v in d.items() if k not in ("_meta", "profile")}
uebrig = {k: n for k, n in voll.items() if n}
print(json.dumps(uebrig) if uebrig else "nichts von vor der Loeschung")' 2>/dev/null)
pruefe 'J4: nichts von vor der Loeschung ist uebrig' \
  "$([ "$ZAEHLUNG_NACHHER" = "nichts von vor der Loeschung" ] && echo ja || echo nein)" "$ZAEHLUNG_NACHHER"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
