#!/bin/bash
# =============================================================================
# Abnahme der Auslieferung, Phase C10 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase (Vorstufe zu Abnahme A2): "Werksreset am Orin,
# Installation nur aus dem Artefakt ueber `curl arasul.de/api/install`, danach
# Oberflaeche unter ihrem Namen erreichbar."
#
# ES SIND ZWEI TEILE, UND DAS IST KEINE BEQUEMLICHKEIT. Der Werksreset und die
# Installation selbst lassen sich nicht ueber die Schnittstelle messen -- ein
# Geraet, das gerade zurueckgesetzt wird, beantwortet keine Anfragen. Deshalb:
#
#   dieses Skript   alles, was NACH der Installation ueber die API messbar ist
#   von Hand        Werksreset und `install.sh`, am Geraet (siehe unten)
#
# Was hier gemessen wird:
#
#   1. Das Geraet kennt seine eigene Fassung, und sie kommt aus dem Bau.
#      Ohne sie nimmt es keine Aktualisierung an (`validateManifest`), und
#      genau das war der Stand vor dieser Phase.
#   2. Dieselbe Fassung steht in `/api/system/info`, und der Bau-Hash ist nicht
#      der Platzhalter `dev`.
#   3. Das CA-Zertifikat laesst sich aus der Oberflaeche laden, ist eine CA und
#      hat das ausgelieferte Zertifikat unterschrieben.
#   4. Das Zertifikat traegt die Namen, unter denen das Geraet erreichbar ist
#      -- den nackten Netznamen, `<name>.local`, `localhost` -- und laeuft
#      nicht laenger als 825 Tage (mehr lehnt Apple ab).
#   5. TLS ueber eine IP-Adresse: ein Handschlag OHNE Namen im ClientHello
#      bekommt ein Zertifikat statt eines Abbruchs.
#   6. Der Kit-Schluessel aus dem Bootstrap oeffnet den Vertrag des Ara-Kits
#      (nur mit ARASUL_KIT_SCHLUESSEL).
#   7. Der Einstiegspunkt des Artefakts ist da und laeuft durch `bash -n`.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/auslieferung-abnahme.sh
#
# Auf dem Geraet, unter seinem Namen (misst dann auch die Namensaufloesung):
#   ARASUL_URL=https://arasul bash scripts/test/auslieferung-abnahme.sh
#
# Was dieses Skript NICHT beweist, und das gehoert dazu: dass die Installation
# aus dem Artefakt kam. Es sieht nur das Ergebnis. Der Beweis dafuer ist der
# Ablauf am Geraet:
#
#   sudo bash scripts/setup/factory-reset.sh          (Werksreset)
#   curl -fsSL https://arasul.de/api/install | bash   (oder aus dem Release)
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
NETZNAME="${ARASUL_NETZNAME:-arasul}"

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

RUMPF_DATEI="$(mktemp)"
ZERT_DATEI="$(mktemp)"
CA_DATEI="$(mktemp)"
CODE=""

ruf() {
  local verb="$1" pfad="$2"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 30
    -H "authorization: Bearer $TOK")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (d if isinstance(d,(str,int,float,bool)) else json.dumps(d)))' "$1" 2>/dev/null
}

aufraeumen() { rm -f "$RUMPF_DATEI" "$ZERT_DATEI" "$CA_DATEI"; }
trap aufraeumen EXIT

# Rechner und Port aus der Adresse, mit den Vorgaben des Schemas. Dieselbe
# Zerlegung wie in `arasul_geraet_erreichbar`, hier fuer `openssl s_client`.
RECHNER="${BASIS#*://}"; RECHNER="${RECHNER%%/*}"
PORT="443"
if [ "$RECHNER" != "${RECHNER%%:*}" ]; then
  PORT="${RECHNER##*:}"
  RECHNER="${RECHNER%%:*}"
fi

# Sieht das nach einer Fassung aus dem Bau aus? Zwei erlaubte Formen:
# ein Tag (`1.2.0`) oder Datum plus SHA (`20260827-a1b2c3d`). Alles andere --
# vor allem das Wort "Vorserie" -- ist keine.
fassung_aus_bau_form() {
  case "$1" in
    Vorserie|'') return 1 ;;
    [0-9]*.[0-9]*.[0-9]*) return 0 ;;
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Auslieferung (Phase C10) gegen $BASIS ==="
echo

# --- 1. Die Fassung ----------------------------------------------------------
echo "--- 1. Kennt das Geraet seine eigene Fassung? ---"

curl -sk --max-time 20 "$BASIS/api/health" -o "$RUMPF_DATEI"
FASSUNG=$(feld version < "$RUMPF_DATEI")
if fassung_aus_bau_form "$FASSUNG"; then
  pruefe '/api/health nennt eine Fassung aus dem Bau' ja "$FASSUNG"
else
  pruefe '/api/health nennt eine Fassung aus dem Bau' nein \
    "${FASSUNG:-leer} -- SYSTEM_VERSION ist am Geraet nicht gesetzt"
fi

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung bleibt der Rest ungemessen."; exit 1; }

echo
echo "--- 2. Dieselbe Fassung, und ein Bau-Hash ---"
ruf GET /api/system/info
INFO_FASSUNG=$(feld version < "$RUMPF_DATEI")
INFO_HASH=$(feld build_hash < "$RUMPF_DATEI")
pruefe '/api/system/info nennt dieselbe Fassung' "$(ja_wenn "$INFO_FASSUNG" "$FASSUNG")" \
  "${INFO_FASSUNG:-leer}"
if [ -n "$INFO_HASH" ] && [ "$INFO_HASH" != "dev" ] && [ "$INFO_HASH" != "unknown" ]; then
  pruefe 'Der Bau-Hash ist kein Platzhalter' ja "$INFO_HASH"
else
  pruefe 'Der Bau-Hash ist kein Platzhalter' nein "${INFO_HASH:-leer}"
fi

# --- 3. Das CA-Zertifikat ----------------------------------------------------
echo
echo "--- 3. Das CA-Zertifikat aus der Oberflaeche ---"

ruf GET /api/system/ca-zertifikat
cp "$RUMPF_DATEI" "$CA_DATEI"
pruefe 'GET /api/system/ca-zertifikat antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

if [ "$CODE" = "200" ] && openssl x509 -in "$CA_DATEI" -noout >/dev/null 2>&1; then
  CA_NAME=$(openssl x509 -in "$CA_DATEI" -noout -subject 2>/dev/null | sed 's/.*CN *= *//')
  CA_IST_CA=$(openssl x509 -in "$CA_DATEI" -noout -text 2>/dev/null | grep -c 'CA:TRUE' || true)
  pruefe 'Die Datei ist ein CA-Zertifikat' "$(ja_wenn "$([ "${CA_IST_CA:-0}" -gt 0 ] && echo 1 || echo 0)" 1)" \
    "${CA_NAME:-ohne Namen}"

  # Ohne den privaten Schluessel danebenliegend: das CA-Zertifikat ist
  # oeffentlich, der Schluessel bleibt am Geraet. Kaeme er ueber diesen Weg
  # mit, waere die CA in dem Moment wertlos, in dem der Admin die Datei
  # weitergibt.
  if grep -q 'PRIVATE KEY' "$CA_DATEI"; then
    pruefe 'Der private Schluessel bleibt am Geraet' nein 'die Antwort enthaelt einen Schluessel'
  else
    pruefe 'Der private Schluessel bleibt am Geraet' ja
  fi
else
  uebergehen 'Die Datei ist ein CA-Zertifikat' 'keine Antwort'
  uebergehen 'Der private Schluessel bleibt am Geraet' 'keine Antwort'
fi

# --- 4. Das Zertifikat des Geraets -------------------------------------------
echo
echo "--- 4. Das Zertifikat, das der Browser sieht ---"

if openssl s_client -connect "${RECHNER}:${PORT}" -servername "$RECHNER" </dev/null 2>/dev/null \
     | openssl x509 -out "$ZERT_DATEI" 2>/dev/null; then
  NAMEN=$(openssl x509 -in "$ZERT_DATEI" -noout -ext subjectAltName 2>/dev/null | tr -d ' ')
  for erwartet in "DNS:${NETZNAME}," "DNS:${NETZNAME}.local," "DNS:localhost"; do
    kurz="${erwartet%,}"
    if grep -q "${erwartet%,}" <<<"${NAMEN},"; then
      pruefe "Das Zertifikat traegt ${kurz#DNS:}" ja
    else
      pruefe "Das Zertifikat traegt ${kurz#DNS:}" nein "SAN: ${NAMEN:-leer}"
    fi
  done

  if grep -q 'IP Address:' <<<"$(openssl x509 -in "$ZERT_DATEI" -noout -ext subjectAltName 2>/dev/null)"; then
    pruefe 'Das Zertifikat traegt mindestens eine IP-Adresse' ja
  else
    pruefe 'Das Zertifikat traegt mindestens eine IP-Adresse' nein "SAN: ${NAMEN:-leer}"
  fi

  # Nicht laenger als 825 Tage: Apple lehnt seit September 2020 jedes
  # Serverzertifikat darueber ab, auch von einer vertrauten CA.
  BEGINN=$(openssl x509 -in "$ZERT_DATEI" -noout -startdate | cut -d= -f2)
  ENDE=$(openssl x509 -in "$ZERT_DATEI" -noout -enddate | cut -d= -f2)
  TAGE=$(python3 - "$BEGINN" "$ENDE" <<'PY'
import sys
from datetime import datetime
form = '%b %d %H:%M:%S %Y %Z'
try:
    a = datetime.strptime(sys.argv[1], form)
    b = datetime.strptime(sys.argv[2], form)
    print((b - a).days)
except Exception:
    print(-1)
PY
)
  if [ "$TAGE" -gt 0 ] && [ "$TAGE" -le 825 ]; then
    pruefe 'Laufzeit hoechstens 825 Tage (sonst lehnt Apple ab)' ja "$TAGE Tage"
  else
    pruefe 'Laufzeit hoechstens 825 Tage (sonst lehnt Apple ab)' nein "$TAGE Tage"
  fi

  if openssl x509 -in "$ZERT_DATEI" -noout -checkend 0 >/dev/null 2>&1; then
    pruefe 'Das Zertifikat ist noch gueltig' ja "bis $ENDE"
  else
    pruefe 'Das Zertifikat ist noch gueltig' nein "abgelaufen $ENDE"
  fi

  if [ -s "$CA_DATEI" ] && openssl verify -CAfile "$CA_DATEI" "$ZERT_DATEI" >/dev/null 2>&1; then
    pruefe 'Die geladene CA hat dieses Zertifikat unterschrieben' ja
  else
    pruefe 'Die geladene CA hat dieses Zertifikat unterschrieben' nein \
      'ein verteiltes CA-Zertifikat wuerde die Warnung NICHT abstellen'
  fi
else
  uebergehen 'Das Zertifikat, das der Browser sieht' "kein TLS-Handschlag zu ${RECHNER}:${PORT}"
fi

# --- 5. TLS ohne Namen (der Weg ueber eine IP) -------------------------------
echo
echo "--- 5. TLS ueber eine IP-Adresse ---"
# Ein Browser auf `https://192.168.1.50/` schickt KEINEN Namen mit (eine IP ist
# keine SNI). Traefik muss dafuer ein Vorgabezertifikat haben; ohne das bricht
# der Handschlag ab, und zwar mit `internal error` -- der Meldung, die am
# 27.08.2026 an der Tailscale-Adresse gemessen wurde (dort war es tailscaled,
# nicht Traefik, siehe docs/ops/NETZNAME_UND_ZERTIFIKAT.md).
if openssl s_client -connect "${RECHNER}:${PORT}" -noservername </dev/null 2>/dev/null \
     | openssl x509 -noout -subject >/dev/null 2>&1; then
  pruefe 'Handschlag ohne Namen liefert ein Zertifikat' ja
else
  pruefe 'Handschlag ohne Namen liefert ein Zertifikat' nein \
    'ohne Vorgabezertifikat ist der Weg ueber die IP tot'
fi

# --- 6. Der Kit-Schluessel ---------------------------------------------------
echo
echo "--- 6. Der Schluessel aus dem Bootstrap ---"
if [ -n "${ARASUL_KIT_SCHLUESSEL:-}" ]; then
  KIT_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
    -H "x-api-key: ${ARASUL_KIT_SCHLUESSEL}" "$BASIS/api/v1/external/contract")
  pruefe 'Der Kit-Schluessel oeffnet den Vertrag' "$(ja_wenn "$KIT_CODE" 200)" "HTTP $KIT_CODE"
else
  uebergehen 'Der Kit-Schluessel oeffnet den Vertrag' \
    'ARASUL_KIT_SCHLUESSEL nicht gesetzt (er erscheint einmal, beim Bootstrap)'
fi

# --- 7. Der Einstiegspunkt des Artefakts -------------------------------------
echo
echo "--- 7. Der Einstiegspunkt, den das Artefakt nennt ---"
if [ -f "$WURZEL/install.sh" ]; then
  if bash -n "$WURZEL/install.sh" 2>/dev/null; then
    pruefe 'install.sh liegt im Wurzelverzeichnis und ist lesbar' ja
  else
    pruefe 'install.sh liegt im Wurzelverzeichnis und ist lesbar' nein 'bash -n schlaegt fehl'
  fi
else
  pruefe 'install.sh liegt im Wurzelverzeichnis und ist lesbar' nein 'Datei fehlt'
fi

echo
echo "=== $gruen gruen, $rot rot, $uebersprungen uebersprungen ==="
if [ "$rot" -gt 0 ]; then
  exit 1
fi
echo
echo "Was dieses Skript NICHT gemessen hat, und was die Abnahme braucht:"
echo "  1. Werksreset am Geraet:  sudo bash scripts/setup/factory-reset.sh"
echo "  2. Installation NUR aus dem Artefakt:"
echo "     curl -fsSL https://arasul.de/api/install | bash"
echo "  3. Danach im Browser:     https://${NETZNAME}/  (oder https://${NETZNAME}.local/)"
exit 0
