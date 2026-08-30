#!/bin/bash
# =============================================================================
# Abnahme der Lizenzgrenze fuer Apps (Auftrag lizenz-grenze-durchsetzen, J30)
# =============================================================================
# Die Zusage: "Die Lizenz weist die vierte App ab, wenn sie drei traegt."
#
# DIE ZAHL STEHT IN KEINER ZEILE DIESES SKRIPTS. Sie kommt aus dem Geraet
# (`GET /api/license/info` -> `features.maxApps`, und das kommt aus der
# Lizenzdatei; ohne eine steht das Geraet auf `community`). Eine Abnahme, die
# "3" erwartet, misst ihre eigene Erinnerung -- am 30.08.2026 lagen drei Apps
# am Orin, die Grenze griff nicht, und die Zahl stimmte trotzdem.
#
# GEMESSEN WIRD MIT WEGWERF-APPS. Zwei Pakete, Frontend-only (`index.html` und
# sonst nichts): ohne `backend` baut das Geraet kein Image, und ein Lauf kostet
# Sekunden statt Minuten. Gemessen wird die Grenze und nicht der Bau -- den
# misst `deploy-abnahme.sh`.
#
# WELCHE DER DREI LAGEN GEMESSEN WIRD, sagt das Geraet, nicht dieses Skript:
#
#   frei >= 1   Probe A geht durch (201). Ist das Kontingent danach voll, wird
#               Probe B abgewiesen (409) -- die Grenze von beiden Seiten. Und
#               eine neue VERSION von Probe A geht trotzdem durch: ein volles
#               Geraet blockiert kein Update.
#   frei == 0   Probe A wird abgewiesen (409). Die Gegenprobe (etwas geht
#               durch) faellt aus, und das steht als uebergangen da -- nicht
#               als gruen.
#   unbegrenzt  Diese Lizenz kennt keine Grenze. Dann gibt es hier nichts zu
#               messen, und das ist kein Fehlschlag.
#
# Am Orin darf `urlaubsantrag` weg, wenn ein Platz fuer den Nachweis fehlt
# (Entscheidung Kolja vom 30.08.2026); `angebot` und `beispielapp` bleiben.
#
# AUFGERAEUMT WIRD IMMER, auch wenn eine Pruefung mittendrin faellt: beide
# Proben mitsamt ihren Dateien weg, der Wegwerf-Schluessel widerrufen. Eine
# Abnahme, die einen Platz der Lizenz belegt zuruecklaesst, macht das Geraet zu
# dem Fall, den sie messen wollte.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/lizenz-abnahme.sh
#
# Auf dem Geraet:
#   ARASUL_URL=https://localhost bash scripts/test/lizenz-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
PROBE_A="${ARASUL_LIZENZ_PROBE:-lizenzprobe-a}"
PROBE_B="${PROBE_A}-b"
GEDULD=120

gruen=0
rot=0
uebergangen=0
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
  uebergangen=$((uebergangen + 1))
  printf '  --   %s%s\n' "$1" "${2:+  ($2)}"
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

# Jede Mustersuche steht als FUNKTION da, und das ist kein Geschmack: unter
# bash 3.2 beendet eine Kommandosubstitution `$(case … in muster) … esac)` an
# der ersten schliessenden Klammer -- also an der des Musters -- und faellt zur
# LAUFZEIT um. macOS liefert bis heute bash 3.2 aus, und gemessen wird von
# einem Mac (Fund aus C3, festgehalten in `apps-abnahme.sh`).
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }
enthaelt_wort() { case " $1 " in *" $2 "*) echo ja ;; *) echo nein ;; esac; }

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF_DATEI`. Bewusst
# ohne Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution waere
# eine Subshell, und `$CODE` waere beim naechsten Befehl wieder weg (Falle aus
# der Messung zu C2).
RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""
sitzungs_ruf() {
  local verb="$1" pfad="$2"
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD" \
    -H "authorization: Bearer $TOK" "$BASIS$pfad")
}
schluessel_ruf() {
  local verb="$1" pfad="$2"
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" "$BASIS$pfad")
}
paket_ruf() {
  local datei="$1"
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$datei" "$BASIS/api/v1/external/apps")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print("" if d is None else (d if isinstance(d,(str,int,float)) else json.dumps(d, ensure_ascii=False)))' "$1" 2>/dev/null
}

# Ein Paket, das nichts kostet: ein Manifest und eine Seite. Ohne `backend`
# baut das Geraet kein Image und startet keinen Container -- gemessen wird die
# Grenze davor.
baue_probe() {
  # Zwei Zeilen, nicht eine: `local` ist ein BEFEHL, und seine Argumente werden
  # alle ersetzt, bevor er laeuft (Fund aus C5, `scripts/test/eigenbezug.py`).
  local kennung="$1"
  local version="$2"
  local ordner="$ARBEIT/$kennung-$version"
  rm -rf "$ordner"
  mkdir -p "$ordner/frontend"
  printf '<!doctype html><title>%s</title><p>Wegwerf-App der Lizenz-Abnahme.\n' \
    "$kennung" >"$ordner/frontend/index.html"
  python3 - "$ordner/app.json" "$kennung" "$version" <<'PY'
import json, sys
ziel, kennung, version = sys.argv[1:4]
json.dump(
    {
        "schema": 1,
        "id": kennung,
        "name": "Lizenz-Abnahme (%s)" % kennung,
        "beschreibung": "Wegwerf-App. Wird von scripts/test/lizenz-abnahme.sh wieder entfernt.",
        "version": version,
        "frontend": {"verzeichnis": "frontend"},
    },
    open(ziel, "w"),
    indent=2,
    ensure_ascii=False,
)
PY
  # COPYFILE_DISABLE: BSD-tar auf macOS legt sonst zu jeder Datei einen
  # `._`-Begleiter mit erweiterten Attributen ins Archiv.
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/$kennung-$version.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/$kennung-$version.tgz"
}

# Was am Geraet steht -- dieselbe Liste, die die Verwaltung zeigt.
namen_apps() {
  sitzungs_ruf GET /api/apps
  rumpf | python3 -c 'import sys,json
try: print(" ".join(a["id"] for a in (json.load(sys.stdin).get("data") or [])))
except Exception: print("")' 2>/dev/null
}
# shellcheck disable=SC2086  # die Wortspaltung IST die Zaehlung
zaehle() { set -- $1; echo $#; }

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Lizenzgrenze fuer Apps (J30) gegen $BASIS ==="
echo

# --- 1. Anmeldung ------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && {
  echo
  echo "Ohne Anmeldung gibt es nichts zu messen."
  exit 1
}

SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  # Erst die Proben weg, dann der Schluessel -- ohne ihn geht das Entfernen
  # nicht mehr. Die Dateien gehen mit: eine Wegwerf-App soll auch keinen Ordner
  # hinterlassen.
  local app
  if [ -n "$SCHLUESSEL" ]; then
    for app in "$PROBE_A" "$PROBE_B"; do
      curl -sk -o /dev/null --max-time 60 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$app?bestaetigung=$app&dateien=true"
    done
  fi
  [ -n "$KEY_ID" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/v1/external/api-keys/$KEY_ID"
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Proben entfernt, Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

# --- 2. Was die Lizenz traegt ------------------------------------------------
# Die eine Zahl, gegen die alles Weitere gemessen wird. Sie steht in der
# Lizenzdatei; ohne eine steht das Geraet auf `community`, und das ist ein
# Zustand und kein Verkaufspaket.
sitzungs_ruf GET /api/license/info
pruefe 'GET /api/license/info antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
GRENZE=$(rumpf | feld features.maxApps)
STUFE=$(rumpf | feld tier)
LIZENZ_FEHLER=$(rumpf | feld error)
pruefe 'Das Geraet nennt seine Zahl fuer maxApps' \
  "$([ -n "$GRENZE" ] && echo ja || echo nein)" \
  "maxApps=${GRENZE:-—}, Stufe=${STUFE:-—}${LIZENZ_FEHLER:+, $LIZENZ_FEHLER}"
[ -z "$GRENZE" ] && {
  echo
  echo "Ohne diese Zahl gibt es nichts zu messen -- sie ist der Massstab."
  exit 1
}

APPS=$(namen_apps)
BELEGT=$(zaehle "$APPS")
pruefe 'GET /api/apps sagt, welche Apps am Geraet stehen' \
  "$(ja_wenn "$CODE" 200)" "$BELEGT: ${APPS:-keine}"

# --- 3. Der Wegwerf-Schluessel ----------------------------------------------
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J30 (lizenz)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Ein Schluessel mit dem Bereich app:deploy entsteht' \
  "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)" "${SCHLUESSEL:0:12}…"
[ -z "$SCHLUESSEL" ] && {
  echo
  echo "Ohne Schluessel gibt es keinen Deploy zu messen."
  echo "$ANTWORT"
  exit 1
}

# --- 4. Der Kontrakt sagt die Regel ------------------------------------------
# Das Kit soll sie kennen, BEVOR es packt und schickt. Sie steht unter
# `paket.regeln`, wortgleich fuer einen Menschen.
schluessel_ruf GET /api/v1/external/contract
REGELN=$(rumpf | feld data.paket.regeln)
pruefe 'Der Kontrakt nennt die Lizenzgrenze unter paket.regeln' \
  "$(enthaelt "$REGELN" 'belegt einen Platz der Lizenz')" \
  "HTTP $CODE"

# --- 5. Die Grenze -----------------------------------------------------------
if [ "$GRENZE" = "-1" ]; then
  uebergehen 'Bei vollem Kontingent wird eine neue App abgewiesen' \
    "diese Lizenz ($STUFE) kennt keine Grenze"
  uebergehen 'Unter der Grenze geht eine neue App durch' 'dito'
  uebergehen 'Eine neue Version einer bekannten App geht trotzdem durch' 'dito'
else
  FREI=$((GRENZE - BELEGT))
  echo "       $BELEGT von $GRENZE belegt, $FREI frei."

  PAKET_A=$(baue_probe "$PROBE_A" "1.0.0")
  pruefe 'Probe-Paket gebaut (Frontend-only, kein Bau am Geraet)' \
    "$([ -n "$PAKET_A" ] && echo ja || echo nein)" "$(basename "${PAKET_A:-—}")"
  [ -z "$PAKET_A" ] && {
    echo
    echo "Ohne Paket gibt es nichts zu schicken."
    exit 1
  }

  # a) Unter der Grenze geht eine neue App durch.
  if [ "$FREI" -ge 1 ]; then
    paket_ruf "$PAKET_A"
    pruefe "Unter der Grenze geht $PROBE_A durch" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
    [ "$CODE" != "201" ] && echo "       Antwort: $(rumpf | head -c 400)"
    APPS=$(namen_apps)
    BELEGT=$(zaehle "$APPS")
    FREI=$((GRENZE - BELEGT))
    echo "       $BELEGT von $GRENZE belegt, $FREI frei."
  else
    uebergehen 'Unter der Grenze geht eine neue App durch' \
      'das Geraet ist voll; erst eine App entfernen, dann noch einmal messen'
  fi

  if [ "$FREI" -le 0 ]; then
    # b) Bei vollem Kontingent kommt eine NEUE App nicht mehr dazu.
    PAKET_B=$(baue_probe "$PROBE_B" "1.0.0")
    paket_ruf "$PAKET_B"
    pruefe 'Bei vollem Kontingent wird eine neue App abgewiesen' \
      "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
    MELDUNG=$(rumpf | feld error.message)
    pruefe 'Die Meldung nennt die Zahl, die die Lizenz traegt' \
      "$(enthaelt "$MELDUNG" "traegt $GRENZE Apps")" \
      "$(printf '%s' "$MELDUNG" | cut -c1-100)"
    pruefe 'und sagt, dass Test- und Livestand zusammen zaehlen' \
      "$(enthaelt "$MELDUNG" 'Test- und Livestand zaehlen zusammen')" \
      "$(printf '%s' "$MELDUNG" | cut -c101-220)"
    D_GRENZE=$(rumpf | feld error.details.grenze)
    D_BELEGT=$(rumpf | feld error.details.belegt)
    D_APPS=$(rumpf | feld error.details.apps)
    pruefe 'Die Zahlen stehen auch als details, fuer das Kit' \
      "$(if [ "$D_GRENZE" = "$GRENZE" ] && [ "$D_BELEGT" = "$BELEGT" ]; then echo ja; else echo nein; fi)" \
      "grenze=$D_GRENZE, belegt=$D_BELEGT, apps=$D_APPS"

    # c) Und die abgewiesene App ist NICHT am Geraet gelandet. Eine Grenze, die
    #    409 sagt und die Zeile trotzdem schreibt, waere schlimmer als keine.
    NACHHER=$(namen_apps)
    pruefe 'Die abgewiesene App steht danach nicht in der Liste' \
      "$(ja_wenn "$(enthaelt_wort "$NACHHER" "$PROBE_B")" nein)" "$NACHHER"

    # d) Ein UPDATE einer App, die schon da ist, geht trotzdem durch. Sonst
    #    blockierte ein volles Geraet genau die Reparatur der App, wegen der
    #    jemand anruft.
    if [ "$(enthaelt_wort "$NACHHER" "$PROBE_A")" = "ja" ]; then
      PAKET_A2=$(baue_probe "$PROBE_A" "1.0.1")
      paket_ruf "$PAKET_A2"
      pruefe 'Eine neue Version einer bekannten App geht trotzdem durch' \
        "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
      [ "$CODE" != "201" ] && echo "       Antwort: $(rumpf | head -c 400)"
    else
      uebergehen 'Eine neue Version einer bekannten App geht trotzdem durch' \
        "$PROBE_A steht nicht am Geraet -- ohne eigene App keine eigene Version"
    fi
  else
    uebergehen 'Bei vollem Kontingent wird eine neue App abgewiesen' \
      "$FREI Plaetze frei; erst eine App entfernen, dann noch einmal messen"
    uebergehen 'Eine neue Version einer bekannten App geht trotzdem durch' 'dito'
  fi
fi

echo
GESAMT=$((gruen + rot))
NACHSATZ=""
[ "$uebergangen" -gt 0 ] && NACHSATZ=", $uebergangen uebergangen"
if [ "$rot" = "0" ]; then
  echo "$gruen von $GESAMT gruen$NACHSATZ"
  exit 0
fi
echo "$gruen von $GESAMT gruen, $rot rot$NACHSATZ"
exit 1
