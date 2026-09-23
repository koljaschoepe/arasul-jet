#!/bin/bash
# =============================================================================
# Abnahme der Testlizenz (Auftrag testlizenz-ohne-stripe, J32, 23.09.2026)
# =============================================================================
# Die Zusage: "Eine selbst signierte Lizenz hebt die Grenze auf die Zahl, die
# sie traegt, und danach ist das Geraet wieder community." Ohne Stripe, ohne
# Kauf, ohne eine Zahlung, die zurueckerstattet wuerde.
#
# Solange am Geraet nur `community` lag, war die Lizenzgrenze nur fuer 3
# belegt, und die bezahlten Stufen kannten nur -1 -- `lizenz-abnahme.sh`
# uebergeht bei -1 die Proben von unten und oben. Deshalb traegt die
# Testlizenz eine ENDLICHE Zahl: belegt + 1. Dann geht genau eine Probe durch
# (von unten) und die naechste wird abgewiesen (von oben).
#
# DER ABLAUF
#   1. Das Geraet steht auf `community`. Sonst Abbruch -- eine Abnahme, die
#      eine gekaufte Lizenz ueberschreibt und am Ende wegwirft, waere der
#      teuerste Fehler, den sie machen kann.
#   2. Fingerabdruck und belegte Apps holen, die Lizenz signieren
#      (`scripts/util/lizenz-signieren.js`, privater Schluessel aus dem
#      Schluesselbund, gebunden an DIESES Geraet, einen Tag gueltig).
#   3. Einspielen; `GET /api/license/info` nennt Stufe, Zahl und Kunden aus
#      der Datei.
#   4. `lizenz-abnahme.sh` misst die neue Grenze von unten und oben, mit ihren
#      eigenen Wegwerf-Apps, die sie selbst wieder entfernt.
#   5. IMMER, auch nach einem Fehler: `DELETE /api/license`, danach
#      `community` mit maxApps 3 -- gemessen, nicht angenommen.
#
# Die Lizenz steht nur in einer Variablen dieses Prozesses; sie ist kein
# Geheimnis (sie gilt nur fuer dieses Geraet und einen Tag), aber sie landet
# trotzdem in keiner Datei.
#
# Aufruf (vom Mac, der den Schluesselbund traegt):
#   ARASUL_URL=https://arasul ARASUL_PASSWORT=... bash scripts/test/testlizenz-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="testlizenz-j32-$(date +%Y%m%d-%H%M%S)"

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
# Als Funktion, nicht als `$(case … esac)`: unter bash 3.2 (macOS) endet die
# Kommandosubstitution an der Klammer des Musters (siehe lizenz-abnahme.sh).
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

RUMPF_DATEI="$(mktemp)"
CODE=""
ruf() {
  local verb="$1" pfad="$2" daten="${3:-}"
  if [ -n "$daten" ]; then
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 60 \
      -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
      --data-binary @- "$BASIS$pfad" <<<"$daten")
  else
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 60 \
      -H "authorization: Bearer $TOK" "$BASIS$pfad")
  fi
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (d if isinstance(d,(str,int,float)) else json.dumps(d)))' "$1" 2>/dev/null
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme der Testlizenz (J32) gegen $BASIS, Stempel $STEMPEL ==="
echo

TOK=$(arasul_token)
# Nicht `${ARASUL_TOKEN:-…}` in der Meldung: das ist der Token selbst, wenn er
# gesetzt ist, und stand so im Protokoll jeder Reihe mit geteiltem Token.
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "$(if [ -n "${ARASUL_TOKEN:-}" ]; then echo 'geteilter Token'; else echo "HTTP $(arasul_anmeldecode)"; fi)"
[ -z "$TOK" ] && exit 1
# Die Lizenz-Abnahme darunter nimmt denselben Token, statt sich neu anzumelden.
export ARASUL_TOKEN="$TOK"

# --- 1. Vorher: community ----------------------------------------------------
ruf GET /api/license/info
STUFE_VORHER=$(rumpf | feld tier)
GRENZE_VORHER=$(rumpf | feld features.maxApps)
pruefe 'Vorher steht das Geraet auf community' "$(ja_wenn "$STUFE_VORHER" community)" \
  "Stufe=${STUFE_VORHER:-—}, maxApps=${GRENZE_VORHER:-—}"
if [ "$STUFE_VORHER" != "community" ]; then
  echo
  echo "Am Geraet liegt eine Lizenz ($STUFE_VORHER). Diese Abnahme ueberschreibt"
  echo "keine Lizenz und wirft keine weg -- erst klaeren, wem sie gehoert."
  rm -f "$RUMPF_DATEI"
  exit 1
fi

EINGESPIELT=""
aufraeumen() {
  if [ -n "$EINGESPIELT" ]; then
    ruf DELETE /api/license
    local entfernt stufe grenze
    entfernt=$(rumpf | feld entfernt)
    pruefe 'DELETE /api/license nimmt die Testlizenz vom Geraet' \
      "$(if [ "$CODE" = "200" ] && [ "$entfernt" = "True" ]; then echo ja; else echo nein; fi)" \
      "HTTP $CODE, entfernt=$entfernt"
    ruf GET /api/license/info
    stufe=$(rumpf | feld tier)
    grenze=$(rumpf | feld features.maxApps)
    pruefe 'Danach ist das Geraet wieder community mit maxApps 3' \
      "$(if [ "$stufe" = "community" ] && [ "$grenze" = "3" ]; then echo ja; else echo nein; fi)" \
      "Stufe=$stufe, maxApps=$grenze"
  fi
  rm -f "$RUMPF_DATEI"
  echo
  if [ "$rot" = "0" ]; then
    echo "$gruen von $gruen gruen"
  else
    echo "$gruen von $((gruen + rot)) gruen, $rot rot"
  fi
}
trap aufraeumen EXIT

# --- 2. Signieren -------------------------------------------------------------
ruf GET /api/license/fingerprint
GERAET=$(rumpf | feld hardwareFingerprint)
ruf GET /api/apps
BELEGT=$(rumpf | python3 -c 'import sys,json
try: print(len(json.load(sys.stdin).get("data") or []))
except Exception: print("")' 2>/dev/null)
pruefe 'Fingerabdruck und belegte Apps vom Geraet' \
  "$([ -n "$GERAET" ] && [ -n "$BELEGT" ] && echo ja || echo nein)" \
  "Geraet=${GERAET:-—}, belegt=${BELEGT:-—}"
[ -z "$GERAET" ] || [ -z "$BELEGT" ] && exit 1
ZAHL=$((BELEGT + 1))

LIZENZ=$(node "$WURZEL/scripts/util/lizenz-signieren.js" --kunde "$STEMPEL" \
  --stufe professional --max-apps "$ZAHL" --tage 1 --geraet "$GERAET")
pruefe "Das Werkzeug signiert eine Lizenz mit maxApps $ZAHL, ohne Stripe" \
  "$([ -n "$LIZENZ" ] && echo ja || echo nein)" "${#LIZENZ} Zeichen"
[ -z "$LIZENZ" ] && exit 1

# --- 3. Einspielen -------------------------------------------------------------
KOERPER=$(LIZENZ="$LIZENZ" python3 -c 'import json,os; print(json.dumps({"licenseKey": os.environ["LIZENZ"]}))')
ruf POST /api/license/activate "$KOERPER"
unset LIZENZ KOERPER
pruefe 'POST /api/license/activate nimmt sie an' "$(ja_wenn "$CODE" 200)" \
  "HTTP $CODE$([ "$CODE" != 200 ] && printf ', %s' "$(rumpf | feld error.message)")"
[ "$CODE" = "200" ] && EINGESPIELT=ja
[ -z "$EINGESPIELT" ] && exit 1

ruf GET /api/license/info
STUFE=$(rumpf | feld tier)
GRENZE=$(rumpf | feld features.maxApps)
KUNDE=$(rumpf | feld customer)
pruefe 'GET /api/license/info nennt Stufe, Zahl und Kunden aus der Datei' \
  "$(if [ "$STUFE" = professional ] && [ "$GRENZE" = "$ZAHL" ] && [ "$KUNDE" = "$STEMPEL" ]; then echo ja; else echo nein; fi)" \
  "Stufe=$STUFE, maxApps=$GRENZE, Kunde=$KUNDE"

# --- 4. Die Grenze von unten und oben ------------------------------------------
echo
echo "--- lizenz-abnahme.sh gegen maxApps $ZAHL"
# `lizenz-abnahme.sh` gibt 0 auch dann, wenn sie eine Probe UEBERGEHT (das
# Geraet voll, oder -1). Hier ist ein Uebergehen der Befund selbst: die
# Testlizenz ist genau dafuer da, dass beide Seiten gemessen werden.
AUSGABE=$(bash "$WURZEL/scripts/test/lizenz-abnahme.sh")
UNTER_CODE=$?
printf '%s\n' "$AUSGABE" | sed 's/^/   | /'
pruefe "lizenz-abnahme.sh ist gruen" "$(ja_wenn "$UNTER_CODE" 0)" "Rueckgabe $UNTER_CODE"
pruefe 'und hat dabei nichts uebergangen' \
  "$(ja_wenn "$(enthaelt "$AUSGABE" uebergangen)" nein)"
pruefe 'Von unten: eine neue App geht durch' \
  "$(enthaelt "$AUSGABE" 'gruen  Unter der Grenze geht')"
pruefe "Von oben: bei $ZAHL belegt wird die naechste abgewiesen, mit der Zahl $ZAHL" \
  "$(enthaelt "$AUSGABE" 'gruen  Die Meldung nennt die Zahl')"
echo
# Die Rueckgabe kommt aus `aufraeumen` (trap): erst dort ist der letzte Satz
# gemessen.
trap - EXIT
aufraeumen
[ "$rot" = "0" ]
