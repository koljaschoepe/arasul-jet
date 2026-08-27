#!/bin/bash
# =============================================================================
# Abnahme des Betriebs, Phase C9 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase (Abnahme A6): "Drill sichert, loescht, stellt her,
# Beispielapp laeuft danach."
#
# ES SIND ZWEI TEILE, UND DAS IST KEINE BEQUEMLICHKEIT. Der Ueberordner misst
# derzeit nur durch einen Tunnel (`https://localhost:8443`, kein SSH, solange
# Tailscale nicht bestaetigt ist). Ueber die Schnittstelle laesst sich sichern,
# auflisten, wiederherstellen und danach die App befragen -- LOESCHEN laesst
# sich so nicht glaubhaft. Deshalb:
#
#   dieses Skript          alles, was ueber die API geht (Teil 1 bis 6)
#   scripts/test/dr-drill.sh   der zerstoerende Teil, AM GERAET
#
# Und das ist ehrlich so zu sagen: eine Wiederherstellung auf ein Geraet, dem
# nichts fehlt, beweist nur, dass sie durchlaeuft. Dass sie etwas ZURUECKHOLT,
# beweist erst der Drill. Dieses Skript sagt am Ende, welcher Befehl am Geraet
# noch fehlt, statt so zu tun, als waere A6 damit erledigt.
#
# Was hier gemessen wird:
#
#   1. Der Zustand ist lesbar: sichert das Geraet wirklich, wann lag zuletzt
#      eine Kopie AUSSERHALB (leer, wenn nie -- und das muss lesbar leer sein).
#   2. Eine Sicherung laesst sich anstossen und nimmt alles mit: Datenbank,
#      App-Pakete, Flow-Dateien, Konfiguration.
#   3. Die Liste nennt Name, Groesse und Datum jeder Sicherung.
#   4. Der Wiederherstellungstest laeuft gegen eine Wegwerf-Datenbank und
#      zaehlt die Tabellen des neuen Datenmodells nach.
#   5. Eine Wiederherstellung laesst sich anstossen, und danach antwortet die
#      Beispielapp wieder.
#   6. Der Update-Weg sagt die Wahrheit ueber die eigene Fassung.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/betrieb-abnahme.sh
#
# Auf dem Geraet:
#   ARASUL_URL=https://localhost:443 bash scripts/test/betrieb-abnahme.sh
#
# Ohne `ARASUL_WIEDERHERSTELLEN=ja` bleibt Teil 5 aus: er ersetzt die ganze
# Datenbank durch die Sicherung, die Teil 2 gerade angelegt hat. Auf einem
# Geraet, an dem nichts passiert ist, ist das folgenlos -- aber es ist nichts,
# was von selbst passieren darf.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_DRILL_APP:-beispielapp}"

# Eine Sicherung zieht die ganze Datenbank ab und packt die App-Pakete; auf
# einem Jetson mit ein paar Gigabyte ist das kein Augenblick.
GEDULD=1800

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

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF_DATEI`.
# Bewusst ohne Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution
# waere eine Subshell, und `$CODE` waere beim naechsten Befehl wieder weg
# (Falle aus der Messung zu C2).
RUMPF_DATEI="$(mktemp)"
CODE=""

ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD"
    -H "authorization: Bearer $TOK")
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
print("" if d is None else (d if isinstance(d,(str,int,float,bool)) else json.dumps(d)))' "$1" 2>/dev/null
}

# Wie viele Sicherungen einer Art stehen in der Liste, und wie gross ist die
# neueste davon?
art_zaehlen() {
  python3 -c 'import sys,json
art = sys.argv[1]
try: d = json.load(sys.stdin)["data"]
except Exception: print("0 0"); raise SystemExit
treffer = [s for s in d if s.get("art") == art]
print(len(treffer), max((s.get("bytes", 0) for s in treffer), default=0))' "$1" 2>/dev/null
}

aufraeumen() { rm -f "$RUMPF_DATEI"; }
trap aufraeumen EXIT

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme des Betriebs (Phase C9) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

# --- 1. Der Zustand ----------------------------------------------------------
echo
echo "--- 1. Sichert dieses Geraet? ---"
ruf GET /api/backup/status
pruefe 'Zustand lesbar' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

SICHERT=$(rumpf | feld data.sichertWirklich)
pruefe 'Das Geraet sichert wirklich' "$(ja_wenn "$SICHERT" True)" \
  "letzte: $(rumpf | feld data.letzteSicherung.zeitpunkt), Alter $(rumpf | feld data.letzteSicherung.alterStunden) h"

# Die Kopie AUSSERHALB. Sie ist in dieser Phase ausdruecklich NICHT gemessen
# (Entscheidung Kolja, 27.08.2026: erst spaeter), aber sie muss schon jetzt
# lesbar sein -- und leer, wenn es keine gibt. Genau das wird hier geprueft:
# dass die Frage eine Antwort hat, nicht dass die Antwort "ja" lautet.
AUSSEN=$(rumpf | feld data.ausserhalb.vorhanden)
if [ "$AUSSEN" = "True" ]; then
  pruefe 'Datum und Groesse der Kopie ausserhalb lesbar' \
    "$(ja_wenn "$([ -n "$(rumpf | feld data.ausserhalb.zeitpunkt)" ] && echo ja || echo nein)" ja)" \
    "$(rumpf | feld data.ausserhalb.zeitpunkt), $(rumpf | feld data.ausserhalb.bytes) Bytes"
else
  # Leer ist eine gueltige Antwort und muss als leer dastehen -- nicht als
  # fehlendes Feld, ueber das ein Ara-Kit stolpert.
  pruefe 'Kopie ausserhalb: leer, aber beantwortet' \
    "$(ja_wenn "$(rumpf | feld data.ausserhalb.zeitpunkt)" '')" \
    "letzter Versuch: $(rumpf | feld data.ausserhalb.letzterVersuch)"
fi

# --- 2. Sichern --------------------------------------------------------------
echo
echo "--- 2. Jetzt sichern ---"
echo "     (Datenbank, App-Pakete, Flows, Konfiguration -- das dauert)"
START=$(date +%s)
ruf POST /api/backup/sicherung
DAUER=$(( $(date +%s) - START ))
pruefe 'Sicherung angestossen und durchgelaufen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE, ${DAUER}s"
pruefe 'Sicherung meldet sich als vollstaendig' \
  "$(ja_wenn "$(rumpf | feld data.bericht.status)" completed)" \
  "$(rumpf | feld data.bericht.total_size)"

# Die drei Archive neben der Datenbank. `true` heisst: angelegt und
# gegengelesen. `skipped` heisst: der Ordner ist nicht eingehaengt -- und das
# ist auf einem Geraet, das Apps hat, ein Fehler und keine Nebensache.
for teil in apps flows config; do
  WERT=$(rumpf | feld "data.bericht.${teil}_status")
  pruefe "Archiv ${teil} angelegt" "$(ja_wenn "$WERT" true)" "${WERT:-(kein Wert)}"
done

# --- 3. Die Liste ------------------------------------------------------------
echo
echo "--- 3. Was liegt da? ---"
ruf GET /api/backup/sicherungen
pruefe 'Liste lesbar' "$(ja_wenn "$CODE" 200)" \
  "$(rumpf | feld anzahl) Sicherungen, $(rumpf | feld bytes) Bytes"

for art in postgres apps flows config; do
  read -r ANZ GROESSE <<<"$(rumpf | art_zaehlen "$art")"
  pruefe "Liste nennt ${art} mit Groesse" \
    "$(ja_wenn "$([ "${ANZ:-0}" -gt 0 ] && [ "${GROESSE:-0}" -gt 0 ] && echo ja || echo nein)" ja)" \
    "${ANZ} Stueck, neueste ${GROESSE} Bytes"
done

# Jede Sicherung traegt ein Datum. Ohne das ist die Liste eine Ansammlung von
# Dateinamen und niemand kann sagen, welche die aktuelle ist.
pruefe 'Jede Sicherung traegt ein Datum' \
  "$(ja_wenn "$(rumpf | feld data.0.zeitpunkt | cut -c1-2)" 20)" \
  "neueste: $(rumpf | feld data.0.name) vom $(rumpf | feld data.0.zeitpunkt)"

# --- 4. Der Wiederherstellungstest -------------------------------------------
echo
echo "--- 4. Laesst sich die Sicherung ueberhaupt einspielen? ---"
echo "     (Wegwerf-Datenbank, der Betrieb wird nicht angefasst)"
ruf POST /api/backup/test
pruefe 'Test gelaufen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Test bestanden' "$(ja_wenn "$(rumpf | feld data.bericht.status)" ok)" \
  "$(rumpf | feld data.bericht.detail)"
pruefe 'Die Pakete der Apps stehen im Archiv' \
  "$(ja_wenn "$(rumpf | feld data.bericht.apps_status)" ok)" \
  "$(rumpf | feld data.bericht.apps_dateien) Manifeste"

# --- 5. Wiederherstellen -----------------------------------------------------
echo
echo "--- 5. Der Weg zurueck ---"
if [ "${ARASUL_WIEDERHERSTELLEN:-}" != "ja" ]; then
  uebergehen 'Wiederherstellung angestossen' 'ARASUL_WIEDERHERSTELLEN=ja setzen'
  uebergehen 'Beispielapp antwortet danach' 'siehe oben'
else
  START=$(date +%s)
  ruf POST /api/backup/wiederherstellung '{"bestaetigung":"wiederherstellen"}'
  DAUER=$(( $(date +%s) - START ))
  pruefe 'Wiederherstellung angestossen und durchgelaufen' "$(ja_wenn "$CODE" 200)" \
    "HTTP $CODE, ${DAUER}s"
  pruefe 'Datenbank und Dateien zurueck' \
    "$(ja_wenn "$(rumpf | feld data.bericht.status)" fertig)" \
    "$(rumpf | feld data.bericht.tabellen) Tabellen, apps: $(rumpf | feld data.bericht.apps)"
  pruefe 'Jeder App-Stand neu gebaut' "$(ja_wenn "$(rumpf | feld data.erfolg)" True)" \
    "$(rumpf | feld data.apps)"

  # Und jetzt die Frage, um die es wirklich geht.
  if arasul_warte_auf_app "/apps/${APP}/api/gesund" 300 "$TOK"; then
    pruefe "Die App ${APP} antwortet nach der Wiederherstellung" ja
  else
    pruefe "Die App ${APP} antwortet nach der Wiederherstellung" nein 'auch nach 300s nicht'
  fi
fi

# --- 6. Der Update-Weg -------------------------------------------------------
echo
echo "--- 6. Was sagt der Update-Weg ueber sich selbst? ---"
ruf GET /api/update/status
pruefe 'Zustand lesbar' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

BEKANNT=$(rumpf | feld fassung.bekannt)
if [ "$BEKANNT" = "True" ]; then
  pruefe 'Die Fassung kommt aus dem Bau' ja "$(rumpf | feld fassung.version)"
else
  # Der Stand, den diese Phase erwartet: `SYSTEM_VERSION` setzt erst C10. Bis
  # dahin ist die richtige Antwort "unbekannt" -- und nicht eine 0.0.0, gegen
  # die dann jedes Paket mit `min_version` abgelehnt wird, ohne dass jemand
  # den Grund erkennt.
  pruefe 'Ohne Fassung aus dem Bau sagt der Weg genau das' \
    "$(ja_wenn "$(rumpf | feld fassung.version)" '')" \
    "Anzeige: $(rumpf | feld fassung.anzeige)"
fi
pruefe 'Der Weg sagt, ob er hier ueberhaupt einspielen kann' \
  "$(ja_wenn "$([ -n "$(rumpf | feld einspielenMoeglich)" ] && echo ja || echo nein)" ja)" \
  "$(rumpf | feld einspielenMoeglich)$(rumpf | feld einspielenGrund | cut -c1-70)"

ruf GET /api/update/check
pruefe 'Aktualisierungspruefung antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
if [ "$BEKANNT" != "True" ]; then
  pruefe 'Ohne eigene Fassung wird der Server gar nicht erst gefragt' \
    "$(ja_wenn "$(rumpf | feld versionBekannt)" False)" \
    "$(rumpf | feld error | cut -c1-70)"
fi

# --- Ergebnis ----------------------------------------------------------------
echo
echo "=== ${gruen} gruen, ${rot} rot, ${uebersprungen} uebersprungen ==="
echo
echo "Der zerstoerende Teil von A6 fehlt hier und gehoert AN DAS GERAET."
echo "Ueber die Schnittstelle laesst sich nicht glaubhaft loeschen; eine"
echo "Wiederherstellung auf ein vollstaendiges Geraet beweist nur, dass sie"
echo "durchlaeuft. Am Geraet:"
echo
echo "    cd ~/arasul/arasul-jet"
echo "    ARASUL_STACK=betrieb bash scripts/test/dr-drill.sh"
echo
[ "$rot" = "0" ] || exit 1
