#!/bin/bash
# =============================================================================
# Abnahme des Firmenordners (J33, 22.09.2026)
# =============================================================================
# Gemessen wird gegen das laufende Geraet, und zwar die vier Zusagen, die diese
# Karte gibt:
#
#   1. DER DIENST STEHT, hinter Traefik, mit dem Zertifikat der Geraete-CA, mit
#      RAM- und CPU-Grenze, auf seinem eigenen Einstiegspunkt -- und auf diesem
#      Einstiegspunkt gibt es NICHTS SONST (kein Dashboard, keine App).
#   2. EIN MENSCH WIRD GESPIEGELT. Ein Wegwerf-Mitarbeiter, am Geraet angelegt,
#      meldet sich beim Dateidienst mit demselben Passwort an -- ohne dass
#      jemand dort etwas eingerichtet haette. Und wer am Geraet gesperrt wird,
#      kommt dort nicht mehr herein.
#   3. RECHTE WERDEN NUR VERGEBEN. Zwei Ebenen, zwei Menschen: einer bekommt
#      den Bereich, einer nur ein Projekt darin. Der zweite sieht den Bereich
#      NICHT -- auch seinen Namen nicht. Und die Bitte, ihm auf dem Projekt
#      weniger zu geben als auf dem Bereich, wird abgewiesen.
#   4. DER ORDNER AM GERAET IST KEINEM SICHTBAR. Er taucht in keiner Antwort
#      auf, und der Dienst gibt ihn keinem Nutzer heraus.
#
# DIE WICHTIGSTEN MESSUNGEN SIND DIE NEGATIVEN, wie immer: „sieht nicht",
# „kommt nicht herein", „taucht nicht auf". Eine Schnittstelle, die etwas
# hergibt, prueft sich leicht; eine, die etwas verschweigt, nur so.
#
# WAS SIE AM GERAET HINTERLAESST: nichts. Die zwei Menschen werden geloescht,
# die drei Ordner weggeworfen. Wer den Lauf abbricht, raeumt mit
# `--nur-aufraeumen` nach.
#
# ANMELDEDROSSEL: `loginLimiter` zaehlt seit H7 nur Fehlschlaege (30 je
# Viertelstunde und IP). Dieser Lauf braucht drei gelungene Anmeldungen am
# Geraet und zwei am Dateidienst; er rechnet deshalb nicht in der Reihe aus
# `abnahmen.sh` mit und laeuft daneben.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel (ZWEI Ports, denn der
# Firmenordner hat seinen eigenen):
#   ssh -f -N -L 8443:localhost:443 -L 18443:localhost:8443 jetson
#   ARASUL_PASSWORT=... ARASUL_FIRMENORDNER=https://localhost:18443 \
#     bash scripts/test/firmenordner-abnahme.sh
#
# Auf dem Geraet selbst genuegt:
#   ARASUL_URL=https://localhost ARASUL_FIRMENORDNER=https://localhost:8443 \
#     bash scripts/test/firmenordner-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
# Die Adresse des Dateidienstes. Sie ist NICHT aus `$BASIS` ableitbar: durch
# einen Tunnel liegt sie auf einem anderen Port als am Geraet.
DIENST="${ARASUL_FIRMENORDNER:-https://localhost:8443}"

STEMPEL="$(date +%s)"
BEREICH="j33b-$STEMPEL"
PROJEKT="j33p-$STEMPEL"
GERAETORDNER="j33g-$STEMPEL"
WEIT="j33-weit-$STEMPEL"   # sieht den ganzen Bereich
ENG="j33-eng-$STEMPEL"     # sieht nur das Projekt darin
PASSWORT="Firmenordner-$STEMPEL"

NUR_AUFRAEUMEN=false
[ "${1:-}" = "--nur-aufraeumen" ] && NUR_AUFRAEUMEN=true

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
ja_nein() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
nicht() { if [ "$1" != "$2" ]; then echo ja; else echo nein; fi; }
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

RUMPF="$(mktemp)"
CODE=""

# Ein Aufruf mit der Sitzung eines Menschen. `$CODE` und `$RUMPF` ueberleben
# ihn -- bewusst ohne Kommandosubstitution, dieselbe Falle wie in
# `ausweis-abnahme.sh`.
ruf() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time 30 -X "$verb"
    -H "authorization: Bearer $token" -H 'content-type: application/json')
  [ -n "$leib" ] && a+=(-d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
}

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
    if d is None: print(""); raise SystemExit
print("true" if d is True else "false" if d is False else d if isinstance(d,(str,int,float)) else "")' \
    "$1" < "$RUMPF" 2>/dev/null
}

# Die Kennungen der Ordner, die ein Mensch in seiner Antwort sieht -- als eine
# Zeile mit Kommas, damit `enthaelt` darauf zeigen kann.
meine_ordner() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]["ordner"]
except Exception: print(""); raise SystemExit
print(",".join(o.get("pfad","") for o in d))' < "$RUMPF" 2>/dev/null
}

anmelden() {
  curl -sk --max-time 30 -X POST -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" "$BASIS/api/auth/login" |
    python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("token") or "")
except Exception: print("")' 2>/dev/null
}

# Eine Anfrage AN DEN DATEIDIENST, mit Name und Passwort. WebDAV und nicht die
# Oberflaeche: der Abgleich laeuft darueber, und genau das soll gemessen
# werden.
dienst_code() {
  curl -sk -o /dev/null -w '%{http_code}' --max-time 30 -u "$1:$2" \
    -X PROPFIND -H 'Depth: 0' "$DIENST${3:-/remote.php/dav/files/$1}"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme des Firmenordners (J33) gegen $BASIS, Dienst $DIENST ==="
echo

TOK=$(arasul_token)
if [ -z "$TOK" ]; then
  echo "Ohne Anmeldung als Administrator gibt es nichts zu messen (HTTP $(arasul_anmeldecode))."
  exit 1
fi

# ---------------------------------------------------------------------------
# Aufraeumen -- und zwar am Anfang definiert, damit jeder Ausstieg ihn findet
# ---------------------------------------------------------------------------
# DIE REIHENFOLGE IST DIE UMGEKEHRTE DES AUFBAUS, und sie muss es sein: ein
# Ordner mit Rechten laesst sich nicht wegwerfen (das ist der Riegel, den
# dieser Lauf weiter unten misst). Erst die Menschen -- mit ihnen fallen die
# Rechte per CASCADE --, dann die Ordner von unten nach oben.
aufraeumen() {
  echo
  echo "--- Aufraeumen ---"
  local id
  for name in "$ENG" "$WEIT"; do
    ruf GET "/api/benutzer" "$TOK"
    id=$(python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: raise SystemExit
for u in d:
    if u.get("username") == sys.argv[1]: print(u["id"])' "$name" < "$RUMPF" 2>/dev/null)
    if [ -n "$id" ]; then
      ruf DELETE "/api/benutzer/$id" "$TOK"
      echo "   Benutzer $name weg (HTTP $CODE)"
    fi
  done
  for kennung in "$PROJEKT" "$BEREICH" "$GERAETORDNER"; do
    ruf GET "/api/firmenordner/ordner" "$TOK"
    id=$(python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: raise SystemExit
for o in d:
    if o.get("kennung") == sys.argv[1]: print(o["id"])' "$kennung" < "$RUMPF" 2>/dev/null)
    if [ -n "$id" ]; then
      ruf DELETE "/api/firmenordner/ordner/$id?kennung=$kennung" "$TOK"
      echo "   Ordner $kennung weg (HTTP $CODE)"
    fi
  done
}

if [ "$NUR_AUFRAEUMEN" = true ]; then
  aufraeumen
  exit 0
fi
trap aufraeumen EXIT

# ===========================================================================
# 1. Der Dienst steht
# ===========================================================================
echo "--- Der Dienst ---"

ruf GET "/api/firmenordner/ordner" "$TOK"
pruefe 'GET /api/firmenordner/ordner antwortet' "$(ja_nein "$CODE" 200)" "HTTP $CODE"
AN=$(feld zustand.an)
ERREICHBAR=$(feld zustand.erreichbar)
ADRESSE=$(feld zustand.adresse)
pruefe 'das Geraet kennt einen Firmenordner' "$(ja_nein "$AN" true)" \
  "an=$AN${AN:+}${AN:-keine Antwort}"
pruefe 'und erreicht ihn' "$(ja_nein "$ERREICHBAR" true)" \
  "erreichbar=$ERREICHBAR, grund=$(feld zustand.grund)"
pruefe 'und nennt seine Adresse' "$(nicht "$ADRESSE" '')" "$ADRESSE"
if [ "$AN" != true ] || [ "$ERREICHBAR" != true ]; then
  echo
  echo "Ohne laufenden Dienst gibt es nichts weiter zu messen."
  echo "Einschalten: COMPOSE_PROFILES=firmenordner in der .env, dann"
  echo "docker compose up -d firmenordner. Siehe docs/features/FIRMENORDNER.md."
  exit 1
fi

# Das Zertifikat: dasselbe wie auf 443, also aus der Geraete-CA. Gemessen wird
# der Aussteller, nicht die Gueltigkeit -- ein selbstsigniertes Zertifikat
# waere hier gerade richtig, eins von IRGENDWOHER nicht.
AUSSTELLER=$(echo | openssl s_client -connect "${DIENST#https://}" -showcerts 2>/dev/null |
  openssl x509 -noout -issuer 2>/dev/null)
pruefe 'der Dienst zeigt das Zertifikat der Geraete-CA' \
  "$(enthaelt "$AUSSTELLER" 'Arasul')" "${AUSSTELLER:-kein Zertifikat gelesen}"

# Und was es auf diesem Einstiegspunkt NICHT gibt. Traefik schickt dort jeden
# Weg an den Dateidienst; das Dashboard und die Schnittstelle des Geraets
# haengen an `websecure` und nur dort.
API_DORT=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$DIENST/api/health")
pruefe 'auf dem Port des Firmenordners gibt es die Schnittstelle des Geraets nicht' \
  "$(nicht "$API_DORT" 200)" "GET /api/health -> HTTP $API_DORT"

# ===========================================================================
# 2. Ein Mensch wird gespiegelt
# ===========================================================================
echo
echo "--- Die Spiegelung eines Menschen ---"

ruf POST "/api/benutzer" "$TOK" \
  "{\"username\":\"$WEIT\",\"password\":\"$PASSWORT\",\"rolle\":\"mitarbeiter\"}"
pruefe "Mitarbeiter $WEIT angelegt" "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_WEIT=$(feld data.id)
ruf POST "/api/benutzer" "$TOK" \
  "{\"username\":\"$ENG\",\"password\":\"$PASSWORT\",\"rolle\":\"mitarbeiter\"}"
pruefe "Mitarbeiter $ENG angelegt" "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_ENG=$(feld data.id)

# DIE KERNMESSUNG DIESES ABSCHNITTS: niemand hat im Dateidienst etwas
# eingerichtet. Wenn der Mensch dort hereinkommt, hat die Spiegelung
# funktioniert -- und zwar Nutzer UND Passwort.
CODE_DIENST=$(dienst_code "$WEIT" "$PASSWORT")
pruefe "$WEIT meldet sich am Dateidienst mit demselben Passwort an" \
  "$(ja_nein "$CODE_DIENST" 207)" "PROPFIND -> HTTP $CODE_DIENST"

CODE_FALSCH=$(dienst_code "$WEIT" "falsch-$STEMPEL")
pruefe 'und mit einem falschen Passwort nicht' "$(nicht "$CODE_FALSCH" 207)" \
  "HTTP $CODE_FALSCH"

# Sperren am Geraet sperrt im Dienst. Danach wieder zulassen, denn der Lauf
# braucht diesen Menschen noch.
ruf PUT "/api/benutzer/$ID_WEIT/aktiv" "$TOK" '{"aktiv":false}'
CODE_GESPERRT=$(dienst_code "$WEIT" "$PASSWORT")
pruefe 'wer am Geraet gesperrt wird, kommt auch im Dateidienst nicht mehr herein' \
  "$(nicht "$CODE_GESPERRT" 207)" "HTTP $CODE_GESPERRT"
ruf PUT "/api/benutzer/$ID_WEIT/aktiv" "$TOK" '{"aktiv":true}'
CODE_ZURUECK=$(dienst_code "$WEIT" "$PASSWORT")
pruefe 'und nach dem Zulassen wieder' "$(ja_nein "$CODE_ZURUECK" 207)" "HTTP $CODE_ZURUECK"

# ===========================================================================
# 3. Zwei Ebenen, Rechte nur vergeben
# ===========================================================================
echo
echo "--- Ordner und Rechte ---"

ruf POST "/api/firmenordner/ordner" "$TOK" \
  "{\"kennung\":\"$BEREICH\",\"name\":\"Abnahme-Bereich\",\"ebene\":1}"
pruefe 'ein Ordner der Ebene 1 entsteht' "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_BEREICH=$(feld data.id)
pruefe 'und der Dienst kennt seinen Raum' "$(nicht "$(feld data.raum_id)" '')" \
  "raum_id=$(feld data.raum_id)"

ruf POST "/api/firmenordner/ordner" "$TOK" \
  "{\"kennung\":\"$PROJEKT\",\"name\":\"Abnahme-Projekt\",\"ebene\":2,\"eltern\":\"$BEREICH\"}"
pruefe 'ein Ordner der Ebene 2 darunter entsteht' "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_PROJEKT=$(feld data.id)

ruf POST "/api/firmenordner/ordner" "$TOK" \
  "{\"kennung\":\"$GERAETORDNER\",\"name\":\"Abnahme am Geraet\",\"ebene\":1,\"art\":\"am_geraet\"}"
pruefe 'und ein Ordner AM GERAET' "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_GERAET=$(feld data.id)

ruf POST "/api/firmenordner/rechte" "$TOK" \
  "{\"ordner_id\":$ID_BEREICH,\"benutzer_id\":$ID_WEIT,\"recht\":\"schreiben\"}"
pruefe "$WEIT bekommt den ganzen Bereich" "$(ja_nein "$CODE" 201)" "HTTP $CODE"

ruf POST "/api/firmenordner/rechte" "$TOK" \
  "{\"ordner_id\":$ID_PROJEKT,\"benutzer_id\":$ID_ENG,\"recht\":\"schreiben\"}"
pruefe "$ENG bekommt NUR das Projekt darin" "$(ja_nein "$CODE" 201)" "HTTP $CODE"

# Die Regel selbst. `$WEIT` hat auf dem Bereich `schreiben`; ihm auf dem
# Projekt `lesen` zu geben waere Entziehen nach unten.
ruf POST "/api/firmenordner/rechte" "$TOK" \
  "{\"ordner_id\":$ID_PROJEKT,\"benutzer_id\":$ID_WEIT,\"recht\":\"lesen\"}"
pruefe 'weniger auf dem Kind als auf dem Elternteil wird abgewiesen' \
  "$(ja_nein "$CODE" 409)" "HTTP $CODE"
pruefe 'und der Satz nennt den Ausweg' "$(enthaelt "$(cat "$RUMPF")" 'einzeln')" \
  "$(feld error.message)"

# Und auf einen Ordner am Geraet gibt es gar kein Recht.
ruf POST "/api/firmenordner/rechte" "$TOK" \
  "{\"ordner_id\":$ID_GERAET,\"benutzer_id\":$ID_WEIT,\"recht\":\"lesen\"}"
pruefe 'auf einen Ordner am Geraet gibt es kein Recht' "$(ja_nein "$CODE" 400)" "HTTP $CODE"

# ===========================================================================
# 4. Was jeder sieht -- und vor allem, was er nicht sieht
# ===========================================================================
echo
echo "--- Die Sicht der zwei Menschen ---"

TOK_WEIT=$(anmelden "$WEIT" "$PASSWORT")
TOK_ENG=$(anmelden "$ENG" "$PASSWORT")
pruefe 'beide melden sich am Geraet an' \
  "$([ -n "$TOK_WEIT" ] && [ -n "$TOK_ENG" ] && echo ja || echo nein)"

ruf GET "/api/firmenordner" "$TOK_WEIT"
SICHT_WEIT=$(meine_ordner)
pruefe "$WEIT sieht den Bereich" "$(enthaelt "$SICHT_WEIT" "$BEREICH")" "$SICHT_WEIT"

ruf GET "/api/firmenordner" "$TOK_ENG"
SICHT_ENG=$(meine_ordner)
# ZWEI AUSSAGEN IN EINER ZEILE WAEREN EINE ZU VIEL, deshalb drei Pruefungen:
# der Pfad steht an seiner echten Stelle, der Bereich als eigener Eintrag kommt
# nicht vor, und der Ordner am Geraet auch nicht.
pruefe "$ENG bekommt das Projekt an seiner echten Stelle im Baum" \
  "$(enthaelt "$SICHT_ENG" "$BEREICH/$PROJEKT")" "$SICHT_ENG"
pruefe "und den Bereich NICHT als eigenen Ordner" \
  "$(ja_nein "$(enthaelt "$SICHT_ENG" "$BEREICH,")" nein)" "$SICHT_ENG"
pruefe 'niemand sieht den Ordner am Geraet' \
  "$(ja_nein "$(enthaelt "$SICHT_WEIT$SICHT_ENG" "$GERAETORDNER")" nein)" \
  "$SICHT_WEIT | $SICHT_ENG"

# Und dieselbe Frage AM DIENST, nicht an der Schnittstelle des Geraets: was
# gibt er diesem Menschen wirklich heraus? Ein Gerät, das „du siehst das nicht"
# sagt, waehrend der Dienst es herausgibt, waere die gefaehrlichste Form eines
# gruenen Feldes.
RAEUME=$(curl -sk --max-time 30 -u "$ENG:$PASSWORT" \
  "$DIENST/graph/v1.0/me/drives" 2>/dev/null)
pruefe "der Dienst nennt $ENG den Ordner am Geraet nicht" \
  "$(ja_nein "$(enthaelt "$RAEUME" "$GERAETORDNER")" nein)"
pruefe "und den Bereich als eigenen Raum ebenfalls nicht" \
  "$(ja_nein "$(enthaelt "$RAEUME" "\"name\":\"$BEREICH\"")" nein)"

# ===========================================================================
# 5. Echte Dateien am Geraet
# ===========================================================================
echo
echo "--- Echte Dateien ---"

# Ueber SSH, weil die Frage genau die ist: liegt da auf der PLATTE ein Ordner,
# den ein Flow lesen kann? Ohne `ARASUL_GERAET` faellt der Abschnitt weg --
# aus dem Tunnel heraus ist er nicht zu beantworten, und eine Vermutung ist
# keine Messung.
if [ -n "${ARASUL_GERAET:-}" ]; then
  ABLAGE="${ARASUL_ABLAGE:-\$HOME/arasul*/data/firmenordner/ablage}"
  BAUM=$(ssh "$ARASUL_GERAET" "ls -d $ABLAGE/posix/projects/* 2>/dev/null" 2>/dev/null)
  pruefe 'die Raeume liegen als echte Ordner unter projects/' \
    "$(enthaelt "$BAUM" "$BEREICH")" "$(echo "$BAUM" | tr '\n' ' ')"
  pruefe 'und der Ordner am Geraet liegt daneben, nicht darin' \
    "$(enthaelt "$BAUM" "$GERAETORDNER")"
  LESBAR=$(ssh "$ARASUL_GERAET" "cat $ABLAGE/posix/projects/$BEREICH/.keep >/dev/null 2>&1; ls $ABLAGE/posix/projects/$BEREICH >/dev/null 2>&1 && echo ja || echo nein" 2>/dev/null)
  pruefe 'und das Konto des Geraets liest sie OHNE sudo' "$(ja_nein "$LESBAR" ja)"
else
  echo "   (uebersprungen: ARASUL_GERAET nicht gesetzt -- ohne SSH keine Aussage ueber die Platte)"
fi

# ===========================================================================
# 6. Die Sicherung nimmt ihn mit
# ===========================================================================
echo
echo "--- Sicherung ---"

ruf GET "/api/backup/status" "$TOK"
BERICHT=$(cat "$RUMPF")
pruefe 'der Sicherungsbericht nennt den Firmenordner' \
  "$(enthaelt "$BERICHT" 'firmenordner')" \
  "$(feld data.letzteSicherung.firmenordner)"

# ===========================================================================
# 7. Der Riegel am Wegwerfen
# ===========================================================================
echo
echo "--- Wegwerfen ---"

ruf DELETE "/api/firmenordner/ordner/$ID_BEREICH?kennung=falsch" "$TOK"
pruefe 'ohne die richtige Kennung geht nichts weg' "$(ja_nein "$CODE" 400)" "HTTP $CODE"

ruf DELETE "/api/firmenordner/ordner/$ID_BEREICH?kennung=$BEREICH" "$TOK"
pruefe 'und solange ein Ordner der Ebene 2 darin liegt, auch nicht' \
  "$(ja_nein "$CODE" 409)" "HTTP $CODE"

echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ] || exit 1
