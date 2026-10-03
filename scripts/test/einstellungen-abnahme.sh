#!/bin/bash
# =============================================================================
# Abnahme der persoenlichen Einstellungen, Karte M5 (einstellungen-persoenlich),
# 03.10.2026
# =============================================================================
# Prueft ohne Browser, was die Karte verlangt, gegen das laufende Geraet. Den
# Rest (die vier Abschnitte, das Kontomenue, die Bilder) misst der Browser.
#
#   1. Das Erscheinungsbild kennt drei Wahlen: system, light, dark. Jede geht
#      an das Geraet und kommt mit der naechsten Sitzungsabfrage zurueck; ein
#      anderes Wort wird abgewiesen (400).
#   2. Profil: Vorname, Nachname, Funktion, Kuerzel und Bild stehen in der
#      Sitzung (`/api/auth/me`), das eigene Profil laesst sich unveraendert
#      zurueckschreiben.
#   3. Angemeldete Rechner: `GET /api/ausweise` liefert die eigene Liste, ohne
#      den Wert eines Ausweises (Praefix ja, Klartext nie). Fuer den
#      Mitarbeiter genauso wie fuer den Admin.
#   4. Die Oberflaeche, wie das Geraet sie ausliefert, nennt „Angemeldete
#      Rechner" und kennt weder „Meine Ausweise" noch „Mein Profil" noch
#      „Einstellungen verwaltet Ihr Administrator".
#
# KONTEN: nur `probe-admin` und, wenn ARASUL_MITARBEITER und
# ARASUL_MITARBEITER_PASSWORT gesetzt sind, ein vorhandener Mitarbeiter
# (probe-j36-a). Es wird kein Konto angelegt, das Erscheinungsbild am Ende auf
# den alten Wert zurueckgestellt. Keine Passwoerter in Dateien.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_MITARBEITER=probe-j36-a ARASUL_MITARBEITER_PASSWORT="..." \
#     bash scripts/test/einstellungen-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail

URL="${ARASUL_URL:-https://localhost:8443}"
ADMIN="${ARASUL_BENUTZER:-}"
ADMIN_PW="${ARASUL_PASSWORT:-}"
MA="${ARASUL_MITARBEITER:-}"
MA_PW="${ARASUL_MITARBEITER_PASSWORT:-}"
if [ "$ADMIN" != "probe-admin" ] || [ -z "$ADMIN_PW" ]; then
  echo "ROT    Nur mit ARASUL_BENUTZER=probe-admin und ARASUL_PASSWORT (nie das Konto admin)."
  exit 1
fi

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

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
print("" if d is None else (str(d).lower() if isinstance(d, bool) else d))' "$1" 2>/dev/null
}

# Der HTTP-Code steht in einer Datei: `$(api ...)` laeuft in einer Subshell.
CODE_DATEI="$(mktemp)"
code() { cat "$CODE_DATEI"; }

api() {
  local tok="$1" verb="$2" pfad="$3" rumpf="${4:-}" antwort c
  local args=(-sk -w '\n%{http_code}' --max-time 30 -X "$verb" -H "Authorization: Bearer $tok")
  [ -n "$rumpf" ] && args+=(-H 'content-type: application/json' -d "$rumpf")
  antwort=$(curl "${args[@]}" "$URL$pfad")
  c=$(printf '%s' "$antwort" | tail -n1)
  printf '%s' "$c" > "$CODE_DATEI"
  printf '%s' "$antwort" | sed '$d'
}

login() {
  local antwort c
  antwort=$(curl -sk -w '\n%{http_code}' --max-time 30 -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" "$URL/api/auth/login")
  c=$(printf '%s' "$antwort" | tail -n1)
  printf '%s' "$c" > "$CODE_DATEI"
  printf '%s' "$antwort" | sed '$d'
}

ADMIN_TOK=""
THEME_ALT=""
MA_TOK=""
MA_THEME_ALT=""
aufraeumen() {
  if [ -n "$MA_TOK" ] && [ -n "$MA_THEME_ALT" ]; then
    api "$MA_TOK" PUT /api/darstellung "{\"theme\":\"$MA_THEME_ALT\"}" > /dev/null
    echo "       aufgeraeumt: Erscheinungsbild von $MA wieder $MA_THEME_ALT ($(code))"
  fi
  if [ -n "$ADMIN_TOK" ] && [ -n "$THEME_ALT" ]; then
    api "$ADMIN_TOK" PUT /api/darstellung "{\"theme\":\"$THEME_ALT\"}" > /dev/null
    echo "       aufgeraeumt: Erscheinungsbild von probe-admin wieder $THEME_ALT ($(code))"
  fi
  rm -f "$CODE_DATEI"
}
trap aufraeumen EXIT

ADMIN_TOK=$(login "$ADMIN" "$ADMIN_PW" | feld token)
if [ -z "$ADMIN_TOK" ]; then
  echo "ROT    probe-admin meldet sich nicht an (HTTP $(code)); ohne ihn gibt es nichts zu messen."
  ADMIN_TOK=""
  exit 1
fi
pruefe "probe-admin meldet sich an" ja

# --- 1. Erscheinungsbild -----------------------------------------------------
ME=$(api "$ADMIN_TOK" GET /api/auth/me)
THEME_ALT=$(printf '%s' "$ME" | feld user.theme)
pruefe "Sitzung traegt das Erscheinungsbild" "$([ -n "$THEME_ALT" ] && echo ja || echo nein)" "$THEME_ALT"
for wahl in system dark light system; do
  ANTWORT=$(api "$ADMIN_TOK" PUT /api/darstellung "{\"theme\":\"$wahl\"}")
  pruefe "Erscheinungsbild $wahl setzen" "$(ja "$(code)/$(printf '%s' "$ANTWORT" | feld data.theme)" "200/$wahl")" "HTTP $(code)"
  zurueck=$(api "$ADMIN_TOK" GET /api/auth/me | feld user.theme)
  pruefe "  und die naechste Sitzungsabfrage nennt $wahl" "$(ja "$zurueck" "$wahl")"
done
api "$ADMIN_TOK" PUT /api/darstellung '{"theme":"schwarz"}' > /dev/null
pruefe "Ein anderes Wort wird abgewiesen (400)" "$(ja "$(code)" 400)" "HTTP $(code)"

# --- 2. Profil ---------------------------------------------------------------
ME=$(api "$ADMIN_TOK" GET /api/auth/me)
for f in vorname nachname funktion kuerzel hatBild anzeigeName; do
  if printf '%s' "$ME" | python3 -c 'import sys,json; sys.exit(0 if sys.argv[1] in json.load(sys.stdin)["user"] else 1)' "$f"; then
    pruefe "Sitzung kennt $f" ja
  else
    pruefe "Sitzung kennt $f" nein
  fi
done
V=$(printf '%s' "$ME" | feld user.vorname)
N=$(printf '%s' "$ME" | feld user.nachname)
if [ -n "$V" ] && [ -n "$N" ]; then
  api "$ADMIN_TOK" PUT /api/profil \
    "{\"vorname\":\"$V\",\"nachname\":\"$N\",\"funktion\":\"$(printf '%s' "$ME" | feld user.funktion)\",\"kuerzel\":\"$(printf '%s' "$ME" | feld user.kuerzel)\"}" > /dev/null
  pruefe "Eigenes Profil unveraendert zurueckschreiben (200)" "$(ja "$(code)" 200)" "HTTP $(code)"
else
  echo "       Profil ohne Vor- und Nachname, Zurueckschreiben uebersprungen"
fi

# --- 3. Angemeldete Rechner --------------------------------------------------
liste_pruefen() {
  local wer="$1" tok="$2" roh
  roh=$(api "$tok" GET /api/ausweise)
  pruefe "$wer: eigene Liste der Rechner (200)" "$(ja "$(code)" 200)" "HTTP $(code)"
  if printf '%s' "$roh" | python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]
sys.exit(0 if all("ausweis" not in x and "token" not in x and "hash" not in x for x in d) else 1)'; then
    pruefe "$wer: kein Wert eines Ausweises in der Liste" ja
  else
    pruefe "$wer: kein Wert eines Ausweises in der Liste" nein
  fi
  api "$tok" DELETE /api/ausweise/0 > /dev/null
  pruefe "$wer: abmelden eines fremden oder fehlenden Rechners trifft nichts (nicht 200)" \
    "$([ "$(code)" != "200" ] && echo ja || echo nein)" "HTTP $(code)"
}
liste_pruefen "probe-admin" "$ADMIN_TOK"

if [ -n "$MA" ] && [ -n "$MA_PW" ]; then
  MA_TOK=$(login "$MA" "$MA_PW" | feld token)
  if [ -n "$MA_TOK" ]; then
    pruefe "$MA meldet sich an" ja
    MA_THEME_ALT=$(api "$MA_TOK" GET /api/auth/me | feld user.theme)
    liste_pruefen "$MA" "$MA_TOK"
    api "$MA_TOK" PUT /api/darstellung '{"theme":"system"}' > /dev/null
    pruefe "$MA darf sein Erscheinungsbild setzen (200)" "$(ja "$(code)" 200)" "HTTP $(code)"
    api "$MA_TOK" GET /api/benutzer > /dev/null
    pruefe "$MA sieht keine Personenverwaltung (403)" "$(ja "$(code)" 403)" "HTTP $(code)"
  else
    pruefe "$MA meldet sich an" nein "HTTP $(code)"
  fi
else
  echo "       kein Mitarbeiter angegeben (ARASUL_MITARBEITER), der Teil entfaellt"
fi

# --- 4. Die Oberflaeche, wie das Geraet sie ausliefert -----------------------
BUENDEL=$(python3 "$(dirname "${BASH_SOURCE[0]}")/einstellungen_buendel.py" "$URL")
tauchtauf() { grep -qF -- "$1" <<<"$BUENDEL" && echo ja || echo nein; }
pruefe "Oberflaeche nennt „Angemeldete Rechner\"" "$(tauchtauf 'Angemeldete Rechner')"
for weg in 'Meine Ausweise' 'Mein Profil' 'Einstellungen verwaltet Ihr Administrator' 'Name des Rechners' 'reset-password.sh'; do
  pruefe "Oberflaeche kennt „$weg\" nicht mehr" "$([ "$(tauchtauf "$weg")" = nein ] && echo ja || echo nein)"
done

echo
echo "Einstellungen-Abnahme: $gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
