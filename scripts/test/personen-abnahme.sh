#!/bin/bash
# =============================================================================
# Abnahme der Personen-Verwaltung, Karte M5 (verwaltung-personen), 03.10.2026
# =============================================================================
# Prueft ohne Browser, was die Karte verlangt, gegen das laufende Geraet:
#
#   1. probe-admin legt eine Person mit Vorname, Nachname und E-Mail an; das
#      Startpasswort steht EINMAL in der Antwort und danach nirgends mehr.
#   2. Die Person meldet sich an und muss ein eigenes Passwort setzen
#      (`passwortWechselNoetig`); Name und Bild stehen zum Pruefen bereit
#      (`anzeigeName`, `hatBild`, `GET /api/profil/bild`).
#   3. Sie pflegt ihr Profil (Funktion, Kuerzel, Bild) und waehlt ein eigenes
#      Passwort; das Startpasswort gilt danach nicht mehr.
#   4. Sperren nimmt den Zugang UND die angemeldeten Rechner: der Token der
#      Person gilt sofort nicht mehr, die Anmeldung antwortet 403; die Zeile
#      bleibt stehen. Wieder zulassen oeffnet den Zugang.
#   5. Der Schalter „Verwaltung" macht die Person zum Admin (sie sieht dann
#      `GET /api/benutzer`) und nimmt es wieder (403).
#   6. Beide Freigabe-Tabellen haben ihre Daten (Apps: `/api/freigaben`,
#      Ordner: `/api/firmenordner/rechte`) -- der Admin liest sie, die Person
#      nicht.
#
# NICHT HIER GEMESSEN, mit Grund: dass der LETZTE Admin sich das Recht nicht
# entziehen kann. Am Geraet gaebe es nur den Weg, vorher alle anderen Admins
# zu sperren -- das ist Koljas Arbeitsgeraet. Die Pruefung steht im Backend
# (`benutzerService.setzeVerwaltung`, unter dem Riegel `arasul:letzteradmin`)
# und ist in `__tests__/unit/benutzer.test.js` belegt.
#
# KONTEN: nur `probe-admin`. Die Person traegt einen Stempel im Namen
# (probe-personen-<Sekunden>) und wird am Ende geloescht, auch bei Rot. Nichts
# anderes wird angefasst. Keine Passwoerter in Dateien: sie leben in
# Variablen dieses Prozesses.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#     bash scripts/test/personen-abnahme.sh
#
# Eine Anmeldung des Admins und fuenf der Person (alle gelungen; die Drossel
# zaehlt nur Fehlschlaege, ausser den beiden absichtlichen: Anmeldung mit
# Startpasswort nach dem Wechsel, Anmeldung der gesperrten Person).
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail

URL="${ARASUL_URL:-https://localhost:8443}"
ADMIN="${ARASUL_BENUTZER:-}"
ADMIN_PW="${ARASUL_PASSWORT:-}"
if [ "$ADMIN" != "probe-admin" ] || [ -z "$ADMIN_PW" ]; then
  echo "ROT    Nur mit ARASUL_BENUTZER=probe-admin und ARASUL_PASSWORT (nie das Konto admin)."
  exit 1
fi

STEMPEL="$(date +%s)"
MAIL="probe-personen-$STEMPEL@example.test"
VORNAME="Probe"
NACHNAME="Personen-$STEMPEL"
EIGENES_PW="Eigenes-Passwort-$STEMPEL!x"

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
ja() { [ "$1" = "$2" ] && echo ja || echo nein; }

# JSON-Feld lesen: feld '<punkt.pfad>' aus stdin.
feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
print("" if d is None else (str(d).lower() if isinstance(d, bool) else d))' "$1" 2>/dev/null
}

# api <Token> <Verb> <Pfad> [Rumpf]  ->  Rumpf der Antwort, Code in $CODE
CODE=""
api() {
  local tok="$1" verb="$2" pfad="$3" rumpf="${4:-}" antwort
  local args=(-sk -w '\n%{http_code}' --max-time 30 -X "$verb" -H "Authorization: Bearer $tok")
  [ -n "$rumpf" ] && args+=(-H 'content-type: application/json' -d "$rumpf")
  antwort=$(curl "${args[@]}" "$URL$pfad")
  CODE=$(printf '%s' "$antwort" | tail -n1)
  printf '%s' "$antwort" | sed '$d'
}

# login <Name> <Passwort>  ->  Rumpf; Code in $CODE
login() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' --max-time 30 -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" "$URL/api/auth/login")
  CODE=$(printf '%s' "$antwort" | tail -n1)
  printf '%s' "$antwort" | sed '$d'
}

PERSON_ID=""
ADMIN_TOK=""
aufraeumen() {
  if [ -n "$PERSON_ID" ] && [ -n "$ADMIN_TOK" ]; then
    api "$ADMIN_TOK" DELETE "/api/benutzer/$PERSON_ID" > /dev/null
    if [ "$CODE" = "200" ]; then
      echo "       aufgeraeumt: $MAIL geloescht"
    else
      echo "ROT    aufraeumen: $MAIL liess sich nicht loeschen (HTTP $CODE), Kennung $PERSON_ID"
      rot=$((rot + 1))
    fi
  fi
}
trap aufraeumen EXIT

# --- Anmeldung des Admins ----------------------------------------------------
ADMIN_TOK=$(login "$ADMIN" "$ADMIN_PW" | feld token)
if [ -z "$ADMIN_TOK" ]; then
  echo "ROT    probe-admin meldet sich nicht an (HTTP $CODE); ohne ihn gibt es nichts zu messen."
  exit 1
fi
pruefe "probe-admin meldet sich an" ja

# --- 1. Anlegen --------------------------------------------------------------
ANTWORT=$(api "$ADMIN_TOK" POST /api/benutzer \
  "{\"vorname\":\"$VORNAME\",\"nachname\":\"$NACHNAME\",\"email\":\"$MAIL\"}")
pruefe "Person mit Vorname, Nachname, E-Mail anlegen: 201" "$(ja "$CODE" 201)" "HTTP $CODE"
PERSON_ID=$(printf '%s' "$ANTWORT" | feld data.id)
START_PW=$(printf '%s' "$ANTWORT" | feld startpasswort)
if grep -Eq '^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$' <<<"$START_PW"; then
  pruefe "Antwort traegt das Startpasswort (abtippbar, 3 mal 4)" ja
else
  pruefe "Antwort traegt das Startpasswort (abtippbar, 3 mal 4)" nein
fi
pruefe "Das Startpasswort steckt nicht in der Person" \
  "$(ja "$(printf '%s' "$ANTWORT" | feld data.startpasswort)" "")"
[ -z "$PERSON_ID" ] && { echo "ROT    ohne Kennung nichts weiter zu messen"; exit 1; }

LISTE=$(api "$ADMIN_TOK" GET /api/benutzer)
ZEILE=$(printf '%s' "$LISTE" | python3 -c 'import sys,json
mail=sys.argv[1]
z=[x for x in json.load(sys.stdin)["data"] if x["email"]==mail]
print(json.dumps(z[0]) if z else "{}")' "$MAIL")
pruefe "Liste zeigt Vorname und Nachname" \
  "$(ja "$(printf '%s' "$ZEILE" | feld vorname) $(printf '%s' "$ZEILE" | feld nachname)" "$VORNAME $NACHNAME")"
pruefe "Liste markiert das Startpasswort" "$(ja "$(printf '%s' "$ZEILE" | feld passwort_vom_admin)" true)"
pruefe "Neue Person ist kein Admin" "$(ja "$(printf '%s' "$ZEILE" | feld role)" mitarbeiter)"

# Das Startpasswort steht nirgends mehr: eine zweite Abfrage der Liste kennt es nicht.
if grep -qF "$START_PW" <<<"$LISTE"; then
  pruefe "Startpasswort steht nach dem Anlegen nirgends mehr" nein
else
  pruefe "Startpasswort steht nach dem Anlegen nirgends mehr" ja
fi

# --- 2. Erste Anmeldung ------------------------------------------------------
ANTWORT=$(login "$MAIL" "$START_PW")
TOK=$(printf '%s' "$ANTWORT" | feld token)
pruefe "Person meldet sich mit E-Mail und Startpasswort an" "$(ja "$CODE" 200)" "HTTP $CODE"
pruefe "Sie muss ein eigenes Passwort setzen" \
  "$(ja "$(printf '%s' "$ANTWORT" | feld user.passwortWechselNoetig)" true)"
pruefe "Name zum Pruefen: anzeigeName" \
  "$(ja "$(printf '%s' "$ANTWORT" | feld user.anzeigeName)" "$VORNAME $NACHNAME")"
pruefe "Bild zum Pruefen: noch keins (hatBild false)" \
  "$(ja "$(printf '%s' "$ANTWORT" | feld user.hatBild)" false)"
api "$TOK" GET /api/benutzer > /dev/null
pruefe "Als Mitarbeiter keine Verwaltung (GET /api/benutzer: 403)" "$(ja "$CODE" 403)" "HTTP $CODE"
api "$TOK" GET /api/freigaben > /dev/null
pruefe "Als Mitarbeiter keine Freigaben der Apps (403)" "$(ja "$CODE" 403)" "HTTP $CODE"
api "$TOK" GET /api/firmenordner/rechte > /dev/null
pruefe "Als Mitarbeiter keine Rechte der Ordner (403)" "$(ja "$CODE" 403)" "HTTP $CODE"

# --- 3. Profil, Bild, eigenes Passwort ---------------------------------------
ANTWORT=$(api "$TOK" PUT /api/profil \
  "{\"vorname\":\"$VORNAME\",\"nachname\":\"$NACHNAME\",\"funktion\":\"Pruefstand\",\"kuerzel\":\"PP\"}")
pruefe "Profil: Funktion und Kuerzel setzen" "$(ja "$CODE" 200)" "HTTP $CODE"
pruefe "Profil: Kuerzel kommt zurueck" "$(ja "$(printf '%s' "$ANTWORT" | feld data.kuerzel)" PP)"
api "$TOK" PUT /api/profil '{"vorname":"Probe","nachname":"Personen","kuerzel":"ZUVIELEZEICHEN"}' > /dev/null
pruefe "Profil: ein Kuerzel ueber 8 Zeichen wird abgewiesen (400)" "$(ja "$CODE" 400)" "HTTP $CODE"

PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
ANTWORT=$(api "$TOK" PUT /api/profil/bild "{\"bild\":\"$PIXEL\"}")
pruefe "Bild setzen" "$(ja "$CODE" 200)" "HTTP $CODE"
pruefe "Bild: hatBild true" "$(ja "$(printf '%s' "$ANTWORT" | feld data.hatBild)" true)"
TYP=$(curl -sk --max-time 30 -o /dev/null -w '%{http_code} %{content_type}' \
  -H "Authorization: Bearer $TOK" "$URL/api/profil/bild")
pruefe "Bild abrufen: image/png" "$(ja "$TYP" "200 image/png")" "$TYP"
ADMIN_TYP=$(curl -sk --max-time 30 -o /dev/null -w '%{http_code} %{content_type}' \
  -H "Authorization: Bearer $ADMIN_TOK" "$URL/api/benutzer/$PERSON_ID/bild")
pruefe "Admin sieht das Bild der Person (Liste)" "$(ja "$ADMIN_TYP" "200 image/png")" "$ADMIN_TYP"
api "$TOK" PUT /api/profil/bild '{"bild":"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="}' > /dev/null
pruefe "Bild: SVG wird abgewiesen (400)" "$(ja "$CODE" 400)" "HTTP $CODE"

api "$TOK" POST /api/auth/change-password \
  "{\"currentPassword\":\"$START_PW\",\"newPassword\":\"$EIGENES_PW\"}" > /dev/null
pruefe "Eigenes Passwort waehlen" "$(ja "$CODE" 200)" "HTTP $CODE"
api "$TOK" GET /api/auth/me > /dev/null
pruefe "Der Token vor dem Wechsel gilt nicht mehr (401)" "$(ja "$CODE" 401)" "HTTP $CODE"
login "$MAIL" "$START_PW" > /dev/null
pruefe "Das Startpasswort gilt nicht mehr (401)" "$(ja "$CODE" 401)" "HTTP $CODE"
ANTWORT=$(login "$MAIL" "$EIGENES_PW")
TOK=$(printf '%s' "$ANTWORT" | feld token)
pruefe "Anmeldung mit dem eigenen Passwort" "$(ja "$CODE" 200)" "HTTP $CODE"
pruefe "Kein Zwangswechsel mehr" "$(ja "$(printf '%s' "$ANTWORT" | feld user.passwortWechselNoetig)" false)"
pruefe "Profil und Bild fahren mit der Anmeldung" \
  "$(ja "$(printf '%s' "$ANTWORT" | feld user.hatBild)/$(printf '%s' "$ANTWORT" | feld user.funktion)" "true/Pruefstand")"

# --- 4. Sperren --------------------------------------------------------------
api "$TOK" GET /api/auth/me > /dev/null
pruefe "Vor dem Sperren gilt der Token (200)" "$(ja "$CODE" 200)"
api "$ADMIN_TOK" PUT "/api/benutzer/$PERSON_ID/aktiv" '{"aktiv":false}' > /dev/null
pruefe "Admin sperrt die Person" "$(ja "$CODE" 200)" "HTTP $CODE"
api "$TOK" GET /api/auth/me > /dev/null
pruefe "Gesperrt: der angemeldete Rechner fliegt raus (401)" "$(ja "$CODE" 401)" "HTTP $CODE"
login "$MAIL" "$EIGENES_PW" > /dev/null
pruefe "Gesperrt: keine neue Anmeldung (403)" "$(ja "$CODE" 403)" "HTTP $CODE"
ZEILE=$(api "$ADMIN_TOK" GET /api/benutzer | python3 -c 'import sys,json
mail=sys.argv[1]
z=[x for x in json.load(sys.stdin)["data"] if x["email"]==mail]
print(json.dumps(z[0]) if z else "{}")' "$MAIL")
pruefe "Gesperrt: die Person bleibt in der Liste, ihr Profil mit ihr" \
  "$(ja "$(printf '%s' "$ZEILE" | feld is_active)/$(printf '%s' "$ZEILE" | feld funktion)" "false/Pruefstand")"
api "$ADMIN_TOK" PUT "/api/benutzer/$PERSON_ID/aktiv" '{"aktiv":true}' > /dev/null
pruefe "Admin laesst die Person wieder zu" "$(ja "$CODE" 200)" "HTTP $CODE"
ANTWORT=$(login "$MAIL" "$EIGENES_PW")
TOK=$(printf '%s' "$ANTWORT" | feld token)
pruefe "Wieder zugelassen: Anmeldung geht" "$(ja "$CODE" 200)" "HTTP $CODE"

# --- 5. Schalter Verwaltung --------------------------------------------------
ANTWORT=$(api "$ADMIN_TOK" PUT "/api/benutzer/$PERSON_ID/verwaltung" '{"verwaltung":true}')
pruefe "Schalter Verwaltung an: Rolle admin" \
  "$(ja "$CODE/$(printf '%s' "$ANTWORT" | feld data.role)" "200/admin")" "HTTP $CODE"
api "$TOK" GET /api/benutzer > /dev/null
pruefe "Als Admin sieht die Person die Verwaltung (200, ohne neue Anmeldung)" "$(ja "$CODE" 200)" "HTTP $CODE"
ANTWORT=$(api "$ADMIN_TOK" PUT "/api/benutzer/$PERSON_ID/verwaltung" '{"verwaltung":false}')
pruefe "Schalter Verwaltung aus: Rolle mitarbeiter" \
  "$(ja "$CODE/$(printf '%s' "$ANTWORT" | feld data.role)" "200/mitarbeiter")" "HTTP $CODE"
api "$TOK" GET /api/benutzer > /dev/null
pruefe "Danach wieder 403" "$(ja "$CODE" 403)" "HTTP $CODE"
api "$ADMIN_TOK" PUT "/api/benutzer/$PERSON_ID/verwaltung" '{"verwaltung":"ja"}' > /dev/null
pruefe "Schalter: kein Wahrheitswert wird abgewiesen (400)" "$(ja "$CODE" 400)" "HTTP $CODE"

# --- 6. Die Daten der zwei Tabellen ------------------------------------------
api "$ADMIN_TOK" GET /api/freigaben > /dev/null
pruefe "Tabelle Apps: Admin liest die Freigaben (200)" "$(ja "$CODE" 200)" "HTTP $CODE"
api "$ADMIN_TOK" GET /api/firmenordner/rechte > /dev/null
pruefe "Tabelle Ordner: Admin liest die Rechte (200)" "$(ja "$CODE" 200)" "HTTP $CODE"

# --- Aufraeumen: Person loeschen, Zeile weg ----------------------------------
api "$ADMIN_TOK" DELETE "/api/benutzer/$PERSON_ID" > /dev/null
pruefe "Aufraeumen: Person loeschen" "$(ja "$CODE" 200)" "HTTP $CODE"
if [ "$CODE" = "200" ]; then
  PERSON_ID=""
  LISTE=$(api "$ADMIN_TOK" GET /api/benutzer)
  if grep -qF "$MAIL" <<<"$LISTE"; then
    pruefe "Aufraeumen: Zeile ist weg" nein
  else
    pruefe "Aufraeumen: Zeile ist weg" ja
  fi
fi

echo
echo "Personen-Abnahme: $gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
