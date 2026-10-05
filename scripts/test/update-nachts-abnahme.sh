#!/bin/bash
# =============================================================================
# Abnahme M5: Aktualisierung nachts auf Wunsch (Auftrag update-nachts)
# =============================================================================
# SICHERHEIT: Am Geraet wird KEINE Fassung eingespielt, nichts gesichert und der
# Stapel nicht neu gestartet. Gemessen wird nur, was ohne das geht:
#
#   SCHALTER     aus als Vorgabe; an und wieder aus; ein Wert, der kein
#                Wahrheitswert ist, wird abgewiesen; ohne Anmeldung 401.
#   FENSTER      02:00 bis 04:00 in der Zeitzone des Geraets; der naechste
#                Beginn liegt in der Zukunft und zeigt in dieser Zeitzone 02:00;
#                mitten im Fenster ist es der der naechsten Nacht und
#                `laeuftGerade` ist wahr (`laufendBis` nennt das Ende).
#   TROCKENLAUF  prueft und berichtet; danach laeuft nichts, es gibt keinen
#                Hilfscontainer, keine neue Zeile einer echten Nacht und keine
#                Sicherung (Zahl der Staende bleibt).
#   MORGEN       Eine Zeile `uebersprungen` einer vergangenen Nacht wird als
#                Hinweis geliefert, bis sie als gelesen markiert ist; danach
#                nicht mehr. (Die Zeile legt die Messung selbst an und raeumt
#                sie weg: eine echte Nacht gibt es hier nicht.)
#
# Das echte Einspielen und der Rueckfall sind NICHT Teil dieser Messung: sie
# stehen in den Tests der CI (`nachtUpdate.test.js`, `fassungsdienst.test.js`).
#
# DAS SCHALTEN AN IST GEFAEHRLICH, WENN ES IM FENSTER GESCHIEHT: dann spielte
# das Geraet im naechsten Takt wirklich ein. Die Messung schaltet deshalb nur
# an, wenn das naechste Fenster mehr als 30 Minuten entfernt ist und gerade
# keines offen ist; sonst bricht sie ab. Der Schalter steht am Ende AUS (auch
# bei Abbruch).
#
# Gebraucht wird ein ssh-Zugang zum Geraet (ARASUL_GERAET): die Messung liest und
# raeumt `update_nacht_laeufe` und zaehlt die Staende der Sicherung.
# Konto: das vorhandene `probe-admin`, nie `admin`; Passwort nur zur Laufzeit.
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson bash scripts/test/update-nachts-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
SICHERER_ABSTAND_MIN=30

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
CODE=""
TOK=""

ruf() { # verb pfad [leib] -- setzt $CODE, Rumpf in $RUMPF_DATEI
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a a=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 120)
  [ -n "$TOK" ] && a+=(-H "authorization: Bearer $TOK")
  [ -n "$leib" ] && a+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
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
db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}

ausschalten() {
  [ -z "$TOK" ] && return 0
  ruf PUT /api/update/fassung/nachts '{"aktiv":false}' >/dev/null
}
aufraeumen() {
  ausschalten
  db "DELETE FROM public.update_nacht_laeufe WHERE grund LIKE 'Abnahme update-nachts:%' OR (trocken AND gestartet >= '$BEGINN');" >/dev/null
  rm -f "$RUMPF_DATEI"
}
trap aufraeumen EXIT

BEGINN="$(db "SELECT now();")"
[ -z "$BEGINN" ] && { echo "Das Geraet ist ueber ssh nicht zu erreichen oder die Tabelle fehlt (Migration 208)."; exit 1; }

TOK="$(arasul_token)"
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && exit 1

# ---------------------------------------------------------------------------
# Ohne Anmeldung
# ---------------------------------------------------------------------------
TOK_MERKEN="$TOK"; TOK=""
ruf GET /api/update/fassung/nachts
pruefe "ohne Anmeldung: 401" "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
TOK="$TOK_MERKEN"

# ---------------------------------------------------------------------------
# Vorgabe und Fenster
# ---------------------------------------------------------------------------
ruf GET /api/update/fassung/nachts
pruefe "GET liefert 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
AKTIV_VORHER="$(rumpf | feld data.aktiv)"
pruefe "Schalter steht aus (Vorgabe)" "$(ja_wenn "$AKTIV_VORHER" false)" "aktiv=$AKTIV_VORHER"
pruefe "Fenster 02:00 bis 04:00" "$(ja_wenn "$(rumpf | feld data.fenster.von)-$(rumpf | feld data.fenster.bis)" 02:00-04:00)"
ZONE="$(rumpf | feld data.fenster.zeitzone)"
pruefe "Zeitzone des Geraets genannt" "$([ -n "$ZONE" ] && echo ja || echo nein)" "$ZONE"
BEGINN_ISO="$(rumpf | feld data.fenster.beginn)"
OFFEN="$(rumpf | feld data.fenster.laeuftGerade)"

# Der Beginn, gerechnet in der Zeitzone des Geraets: 02:00 Uhr, und in der Zukunft.
RECHNUNG="$(python3 - "$BEGINN_ISO" "$ZONE" <<'PY'
import sys, datetime
from zoneinfo import ZoneInfo
b = datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
l = b.astimezone(ZoneInfo(sys.argv[2]))
jetzt = datetime.datetime.now(datetime.timezone.utc)
minuten = int((b - jetzt).total_seconds() // 60)
print(f"{l:%H:%M}|{minuten}|{l:%Y-%m-%d}")
PY
)"
LOKAL="${RECHNUNG%%|*}"; REST="${RECHNUNG#*|}"; MINUTEN="${REST%%|*}"; TAG="${REST#*|}"
pruefe "naechster Beginn zeigt in der Zeitzone des Geraets 02:00" "$(ja_wenn "$LOKAL" 02:00)" "$BEGINN_ISO = $LOKAL am $TAG"
# Auch im Fenster: dann laeuft es gerade (laeuftGerade), und der Beginn ist der der naechsten Nacht.
pruefe "naechster Beginn liegt in der Zukunft" "$([ "$MINUTEN" -gt 0 ] && echo ja || echo nein)" "in $MINUTEN min"
pruefe "laeuftGerade ist ein Wahrheitswert" "$([ "$OFFEN" = true ] || [ "$OFFEN" = false ] && echo ja || echo nein)" "laeuftGerade=$OFFEN"
if [ "$OFFEN" = true ]; then
  BIS_ISO="$(rumpf | feld data.fenster.laufendBis)"
  pruefe "im Fenster: es nennt, bis wann es laeuft" "$([ -n "$BIS_ISO" ] && echo ja || echo nein)" "laufendBis=$BIS_ISO"
fi

# ---------------------------------------------------------------------------
# Schalter an und aus -- nur mit Abstand zum Fenster
# ---------------------------------------------------------------------------
ruf PUT /api/update/fassung/nachts '{"aktiv":"ja"}'
pruefe "ein Wert, der kein Wahrheitswert ist: 400" "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

if [ "$OFFEN" = true ] || [ "$MINUTEN" -le "$SICHERER_ABSTAND_MIN" ]; then
  pruefe "Schalter an: nicht gemessen, das Fenster ist zu nah" nein "in $MINUTEN min; die Messung schaltet nie im oder vor dem Fenster an"
else
  ruf PUT /api/update/fassung/nachts '{"aktiv":true}'
  pruefe "Schalter an: 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  pruefe "danach steht er an" "$(ja_wenn "$(rumpf | feld data.aktiv)" true)"
  ruf GET /api/update/fassung/nachts
  pruefe "GET bestaetigt: an" "$(ja_wenn "$(rumpf | feld data.aktiv)" true)"
  ruf PUT /api/update/fassung/nachts '{"aktiv":false}'
  pruefe "Schalter aus: 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  ruf GET /api/update/fassung/nachts
  pruefe "GET bestaetigt: aus" "$(ja_wenn "$(rumpf | feld data.aktiv)" false)"
fi

# ---------------------------------------------------------------------------
# Trockenlauf: prueft, berichtet, aendert nichts
# ---------------------------------------------------------------------------
echte_vorher="$(db "SELECT count(*) FROM public.update_nacht_laeufe WHERE NOT trocken;")"
ruf GET "/api/backup/staende?quelle=lokal"
staende_vorher="$(rumpf | feld anzahl)"
stand_vorher="$(ruf GET /api/update/fassung >/dev/null; rumpf | feld data.lauf.lauf)"

ruf POST /api/update/fassung/nachts/trockenlauf '{}'
pruefe "Trockenlauf: 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ERG="$(rumpf | feld data.ergebnis)"
GRUND="$(rumpf | feld data.grund)"
pruefe "Trockenlauf ist als solcher vermerkt" "$(ja_wenn "$(rumpf | feld data.trocken)" true)"
case "$ERG" in
  trockenlauf|uebersprungen|nichts_zu_tun) pruefe "Trockenlauf berichtet mit Ergebnis und Satz" "$([ -n "$GRUND" ] && echo ja || echo nein)" "$ERG: $GRUND" ;;
  *) pruefe "Trockenlauf berichtet mit Ergebnis und Satz" nein "unerwartet: $ERG ($GRUND)" ;;
esac

ruf GET /api/update/fassung
pruefe "danach laeuft keine Aktualisierung" "$(ja_wenn "$(rumpf | feld data.laeuft)" false)"
pruefe "der Lauf des Geraets ist unveraendert" "$(ja_wenn "$(rumpf | feld data.lauf.lauf)" "$stand_vorher")"
HILFE="$(ssh -o BatchMode=yes "$GERAET" "docker ps -a --filter name=arasul-aktualisierung -q" 2>/dev/null)"
pruefe "kein Hilfscontainer der Aktualisierung" "$([ -z "$HILFE" ] && echo ja || echo nein)"
echte_nachher="$(db "SELECT count(*) FROM public.update_nacht_laeufe WHERE NOT trocken;")"
pruefe "keine Zeile einer echten Nacht entstanden" "$(ja_wenn "$echte_nachher" "$echte_vorher")" "$echte_vorher -> $echte_nachher"
ruf GET "/api/backup/staende?quelle=lokal"
staende_nachher="$(rumpf | feld anzahl)"
pruefe "keine Sicherung geschrieben (Zahl der Staende gleich)" "$(ja_wenn "$staende_nachher" "$staende_vorher")" "$staende_vorher -> $staende_nachher"
ruf GET /api/update/fassung/nachts
pruefe "der Trockenlauf macht keinen Hinweis fuer den Morgen" "$(ja_wenn "$(rumpf | feld data.hinweis)" "")"

# ---------------------------------------------------------------------------
# Der Hinweis am Morgen
# ---------------------------------------------------------------------------
db "INSERT INTO public.update_nacht_laeufe (fenster, ergebnis, grund, von, nach, beendet)
    VALUES ('2000-01-01', 'uebersprungen', 'Abnahme update-nachts: zu wenig Platz', '0.0.1', '0.0.2', now());" >/dev/null
ruf GET /api/update/fassung/nachts
pruefe "Hinweis: die Nacht liefert ihr Ergebnis samt Grund" "$(ja_wenn "$(rumpf | feld data.hinweis.ergebnis)|$(rumpf | feld data.hinweis.grund)" 'uebersprungen|Abnahme update-nachts: zu wenig Platz')"
ruf POST /api/update/fassung/nachts/gesehen '{}'
pruefe "als gelesen markieren: 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf GET /api/update/fassung/nachts
pruefe "danach kein Hinweis mehr" "$(ja_wenn "$(rumpf | feld data.hinweis)" "")"

# ---------------------------------------------------------------------------
# Am Ende: aus
# ---------------------------------------------------------------------------
ausschalten
ruf GET /api/update/fassung/nachts
pruefe "Schalter steht am Ende AUS" "$(ja_wenn "$(rumpf | feld data.aktiv)" false)"

echo
echo "gruen: $gruen  rot: $rot"
[ "$rot" -eq 0 ]
