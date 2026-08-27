#!/bin/bash
# =============================================================================
# Die Geraete-CA und das Zertifikat des Geraets (Phase C10, 27.08.2026)
# =============================================================================
# Aufruf:
#   scripts/security/geraete-zertifikat.sh [Zertifikatsordner] [Netzname] [Tage]
#   FORCE_OVERWRITE=true scripts/security/geraete-zertifikat.sh ...   erneuert
#
# WARUM EINE EIGENE CA UND NICHT WEITER EIN SELBSTSIGNIERTES ZERTIFIKAT:
# Ein selbstsigniertes Zertifikat muss JEDER Mitarbeiter an JEDEM Geraet
# einzeln als Ausnahme bestaetigen, und in Chrome und auf iOS geht das seit
# Jahren nur noch ueber Umwege. Mit einer eigenen CA verteilt der Admin EINE
# Datei (`arasul-ca.crt`) an die Rechner der Firma, und danach ist jeder Name
# dieses Geraets vertraut, auch nach einer Erneuerung des Zertifikats. Das
# CA-Zertifikat laedt er in der Oberflaeche herunter:
# Einstellungen > Sicherheit > Geraetezertifikat.
#
# DER PRIVATE SCHLUESSEL DER CA BLEIBT AUF DEM GERAET. Er ist nur fuer dieses
# eine Geraet zustaendig; wer ihn hat, kann sich als DIESES Geraet ausgeben und
# sonst nichts. Es gibt keine Firmen-CA, die alle Kunden unterschreibt -- die
# waere ein einziger Punkt, an dem alle Kunden gleichzeitig verlieren.
#
# ZWEI LAUFZEITEN, MIT ABSICHT VERSCHIEDEN:
#   CA          zehn Jahre. Sie wird verteilt; ein Wechsel kostet den Admin
#               einen zweiten Rundgang durch die Firma.
#   Zertifikat  800 Tage. Apple lehnt seit September 2020 jedes Serverzertifikat
#               mit mehr als 825 Tagen Laufzeit ab, auch wenn die CA vertraut
#               ist (iOS 13, macOS 10.15). Ein Zertifikat ueber zehn Jahre
#               waere auf jedem iPhone der Firma ungueltig.
# Die 800 Tage erneuert die Selbstheilung von selbst, sobald weniger als 60
# Tage bleiben (`services/self-healing-agent/healing_engine.py`,
# `check_tls_cert_expiry`). Die CA bleibt dabei dieselbe, und genau deshalb
# muss der Admin nichts neu verteilen.
# =============================================================================
set -euo pipefail

ZERT_ORDNER="${1:-/arasul/config/traefik/certs}"
NETZNAME="${2:-arasul}"
NETZNAME="${NETZNAME%.local}"
ZERT_TAGE="${3:-800}"
CA_TAGE="${CA_TAGE:-3650}"

CA_SCHLUESSEL="${ZERT_ORDNER}/arasul-ca.key"
CA_ZERT="${ZERT_ORDNER}/arasul-ca.crt"
SCHLUESSEL="${ZERT_ORDNER}/arasul.key"
ZERT="${ZERT_ORDNER}/arasul.crt"
CA_NAME="Arasul Geraete-CA (${NETZNAME})"

mkdir -p "$ZERT_ORDNER"
chmod 755 "$ZERT_ORDNER"

echo "Zertifikat fuer dieses Geraet"
echo "  Netzname:  ${NETZNAME}"
echo "  Ordner:    ${ZERT_ORDNER}"

# -----------------------------------------------------------------------------
# 1. Die CA. Einmal im Leben des Geraets.
# -----------------------------------------------------------------------------
# Sie wird NIE ueberschrieben, auch nicht mit FORCE_OVERWRITE. Der Admin hat
# sie verteilt; eine neue CA hiesse, jeden Rechner der Firma noch einmal
# anzufassen. Wer sie wirklich wechseln will, loescht die zwei Dateien von
# Hand und weiss dann, was er tut.
if [ -f "$CA_SCHLUESSEL" ] && [ -f "$CA_ZERT" ]; then
  echo "  CA:        vorhanden, bleibt ($(openssl x509 -in "$CA_ZERT" -noout -enddate | cut -d= -f2))"
else
  echo "  CA:        wird angelegt"
  openssl genrsa -out "$CA_SCHLUESSEL" 4096 2>/dev/null
  chmod 600 "$CA_SCHLUESSEL"
  openssl req -x509 -new -nodes \
    -key "$CA_SCHLUESSEL" \
    -sha256 -days "$CA_TAGE" \
    -out "$CA_ZERT" \
    -subj "/C=DE/O=Arasul/OU=Geraete-CA/CN=${CA_NAME}" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    2>/dev/null
  chmod 644 "$CA_ZERT"
fi

# -----------------------------------------------------------------------------
# 2. Das Zertifikat des Geraets
# -----------------------------------------------------------------------------
if [ -f "$ZERT" ] && [ -f "$SCHLUESSEL" ] && [ "${FORCE_OVERWRITE:-}" != "true" ]; then
  # Traegt das vorhandene Zertifikat noch die Unterschrift der CA? Ein Geraet
  # aus der Zeit vor dieser Phase hat ein selbstsigniertes. Das wird ersetzt,
  # sonst bliebe die frisch angelegte CA fuer immer wirkungslos.
  aussteller=$(openssl x509 -in "$ZERT" -noout -issuer 2>/dev/null | sed 's/.*CN *= *//')
  if [ "$aussteller" = "$CA_NAME" ]; then
    echo "  Zertifikat: vorhanden und von der CA ausgestellt, bleibt"
    echo "              gueltig bis $(openssl x509 -in "$ZERT" -noout -enddate | cut -d= -f2)"
    exit 0
  fi
  echo "  Zertifikat: vorhanden, aber nicht von dieser CA. Wird ersetzt."
fi

# Die Namen und Adressen, unter denen das Geraet erreichbar ist. Alles, was
# hier fehlt, gibt im Browser eine Warnung, obwohl die CA vertraut ist.
SAN="DNS:${NETZNAME},DNS:${NETZNAME}.local,DNS:localhost"
#   ${NETZNAME}         der Name, den der Router per DHCP lernt: https://arasul/
#   ${NETZNAME}.local   der Rueckfall ueber mDNS, wenn der Router das nicht tut
#   localhost           der Weg ueber einen SSH-Tunnel

SAN="${SAN},IP:127.0.0.1"
adressen=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)
for adresse in $adressen; do
  [ "$adresse" = "127.0.0.1" ] && continue
  SAN="${SAN},IP:${adresse}"
done
# Die Docker-Bruecken: ueber sie spricht ein Container das Geraet an.
for bruecke in 172.17.0.1 172.18.0.1 172.19.0.1 172.30.0.1; do
  case ",${SAN}," in
    *",IP:${bruecke},"*) continue ;;
  esac
  SAN="${SAN},IP:${bruecke}"
done

echo "  Namen:     ${SAN}"

ANTRAG="$(mktemp)"
ERWEITERUNG="$(mktemp)"
trap 'rm -f "$ANTRAG" "$ERWEITERUNG"' EXIT

cat > "$ERWEITERUNG" <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=${SAN}
EOF

openssl genrsa -out "$SCHLUESSEL" 4096 2>/dev/null
chmod 600 "$SCHLUESSEL"

openssl req -new \
  -key "$SCHLUESSEL" \
  -out "$ANTRAG" \
  -subj "/C=DE/O=Arasul/CN=${NETZNAME}" \
  2>/dev/null

openssl x509 -req \
  -in "$ANTRAG" \
  -CA "$CA_ZERT" -CAkey "$CA_SCHLUESSEL" -CAcreateserial \
  -out "$ZERT" \
  -days "$ZERT_TAGE" -sha256 \
  -extfile "$ERWEITERUNG" \
  2>/dev/null

# Die CA hinter das Zertifikat: Traefik reicht beides an den Browser, und
# Android verlangt die Kette, statt sie sich aus dem eigenen Speicher zu holen.
cat "$CA_ZERT" >> "$ZERT"
chmod 644 "$ZERT"

echo "  Zertifikat: neu, gueltig bis $(openssl x509 -in "$ZERT" -noout -enddate | cut -d= -f2)"
echo ""
echo "  Der Browser warnt weiter, bis das CA-Zertifikat verteilt ist."
echo "  Herunterladen: Einstellungen > Sicherheit > Geraetezertifikat"
echo "  Anleitung:     docs/ops/NETZNAME_UND_ZERTIFIKAT.md"
