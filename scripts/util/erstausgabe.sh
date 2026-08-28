#!/bin/bash
# =============================================================================
# Die Erstausgabe: was ein Geraet genau einmal sagt (Phase C10, 28.08.2026)
# =============================================================================
# Nach einer Installation gibt es zwei Zeichenketten, die auf diesem Geraet
# NIRGENDS nachzuschlagen sind, weil von beiden nur ein Abdruck gespeichert
# wird:
#
#   * das Startpasswort des Administrators (bcrypt in `admin_users`),
#   * der Deploy-Schluessel fuer das Ara-Kit, Bereich `app:deploy`
#     (bcrypt in `api_keys`, Phase C5).
#
# Bis zum 28.08.2026 standen sie nur auf dem Bildschirm, und zwar erst hinter
# einer Bedingung: der Bootstrap zeigte seine Zusammenfassung nur, wenn der
# Rauchtest gruen war. Am Orin war er rot -- weil er nicht wartete, nicht weil
# etwas fehlte -- und damit wurde ein Kit-Schluessel angelegt, den nie jemand
# gesehen hat. Ein Geheimnis, das der Mensch nicht bekommt, ist kein Geheimnis,
# sondern ein verlorener Schluessel.
#
# Deshalb liegt die Ausgabe hier, in einem Skript mit einer Aufgabe:
#
#   1. Sie erscheint IMMER, unabhaengig vom Ergebnis des Rauchtests, und vor
#      dem Fehlerbericht -- was auf dem Bildschirm zuletzt steht, liest der
#      Mensch zuerst, und das soll nicht der Fehlerbericht sein.
#   2. Sie steht zusaetzlich in `config/secrets/erstausgabe.txt` (0600), damit
#      ein zugescrolltes Terminal keinen Schluessel kostet. Die Datei sagt in
#      ihrer ersten Zeile, dass sie nach dem Lesen zu loeschen ist.
#
# Aufruf (der Bootstrap tut das; von Hand geht es auch):
#
#   bash scripts/util/erstausgabe.sh --passwort 'Ara...9' --schluessel aras_...
#   bash scripts/util/erstausgabe.sh --datei /tmp/probe.txt --nur-datei
#
# Ohne Geheimnis wird KEINE Datei geschrieben und eine vorhandene nicht
# angefasst: ein zweiter Bootstrap-Lauf auf demselben Geraet kennt das
# Startpasswort nicht mehr (es ist aus der `.env` entwertet) und darf die
# Erstausgabe des ersten Laufs nicht ueberschreiben.
#
# Rueckgabe: immer 0. Diese Ausgabe darf keine Installation abbrechen.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

GRUEN='\033[0;32m'; BLAU='\033[0;34m'; GELB='\033[1;33m'; FETT='\033[1m'; AUS='\033[0m'

PASSWORT=""
SCHLUESSEL=""
DATEI="config/secrets/erstausgabe.txt"
NUR_DATEI=false

while [ $# -gt 0 ]; do
  case "$1" in
    --passwort)   PASSWORT="${2:-}"; shift 2 ;;
    --schluessel) SCHLUESSEL="${2:-}"; shift 2 ;;
    --datei)      DATEI="${2:-}"; shift 2 ;;
    --nur-datei)  NUR_DATEI=true; shift ;;
    --hilfe|-h)   sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

# Wie `env_wert` in `arasul`: letztes Vorkommen, Anfuehrungszeichen weg,
# Vorgabe bei leer. Der bcrypt-Hash steht seit dem 28.08.2026 in
# Anfuehrungszeichen, weil docker compose sein `$` sonst als Variable liest.
env_wert() {
  local schluessel="$1" vorgabe="${2:-}" wert=""
  if [ -f .env ]; then
    wert=$(grep "^${schluessel}=" .env 2>/dev/null | tail -1 | cut -d'=' -f2- || true)
  fi
  case "$wert" in
    "'"*"'") wert="${wert#\'}"; wert="${wert%\'}" ;;
    '"'*'"') wert="${wert#\"}"; wert="${wert%\"}" ;;
  esac
  printf '%s' "${wert:-$vorgabe}"
}

BENUTZER="$(env_wert ADMIN_USERNAME admin)"
NETZNAME="$(env_wert MDNS_NAME arasul)"
FASSUNG="$(env_wert SYSTEM_VERSION)"

# Der MagicDNS-Name, falls das Geraet in einem Tailnet ist. Dort antwortet
# Traefik selbst -- `tailscale serve` ist seit dem 28.08.2026 gestrichen, weil
# es tailscaled 443 binden liess (docs/ops/NETZNAME_UND_ZERTIFIKAT.md).
TAILNETZ="$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$//' || true)"

# -----------------------------------------------------------------------------
# Auf den Bildschirm
# -----------------------------------------------------------------------------
if [ "$NUR_DATEI" = false ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${GRUEN}  ARASUL ${FASSUNG:-Vorserie} ist installiert${AUS}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  # Der nackte Name zuerst: den lernt der Router ueber den DHCP-Hostnamen, und
  # so tippt ein Mitarbeiter ihn. `.local` ist der Rueckfall ueber mDNS.
  echo -e "  Oberflaeche   ${BLAU}https://${NETZNAME}/${AUS}"
  echo -e "                ${BLAU}https://${NETZNAME}.local/${AUS} (Rueckfall)"
  [ -n "$TAILNETZ" ] && echo -e "  Von unterwegs ${BLAU}https://${TAILNETZ}${AUS} (Tailscale)"
  echo ""
  echo "  Administrator ${BENUTZER}"
  if [ -n "$PASSWORT" ]; then
    echo -e "  ${FETT}Startpasswort ${PASSWORT}${AUS}"
    echo "                Beim ersten Anmelden wird es gewechselt."
  else
    echo "  Passwort      wie beim Einrichten vergeben"
  fi
  if [ -n "$SCHLUESSEL" ]; then
    echo ""
    echo "  Schluessel fuer das Ara-Kit (Bereich app:deploy)"
    echo -e "  ${FETT}${SCHLUESSEL}${AUS}"
    echo "                Ins Kit eintragen. Ein neuer geht ueber"
    echo "                bash scripts/util/kit-schluessel.sh anlegen"
  fi
  echo ""
  echo "  Der Browser warnt beim ersten Aufruf vor dem Zertifikat. Das hoert"
  echo "  auf, sobald das CA-Zertifikat dieses Geraets verteilt ist:"
  echo "  Einstellungen > Sicherheit > Geraetezertifikat."
  echo "  Anleitung: docs/ops/NETZNAME_UND_ZERTIFIKAT.md"
  echo ""
  echo "  Befehle: ./arasul status | logs | stop | restart"
  echo ""
fi

# -----------------------------------------------------------------------------
# In die Datei
# -----------------------------------------------------------------------------
if [ -z "$PASSWORT" ] && [ -z "$SCHLUESSEL" ]; then
  [ "$NUR_DATEI" = false ] && echo -e "  ${GELB}Kein Geheimnis zu hinterlegen -- ${DATEI} bleibt, wie sie ist.${AUS}"
  exit 0
fi

mkdir -p "$(dirname "$DATEI")" 2>/dev/null || true
chmod 700 "$(dirname "$DATEI")" 2>/dev/null || true

# Erst die Rechte, dann der Inhalt: zwischen `>` und `chmod` laege sonst ein
# Moment, in dem das Startpasswort mit den Vorgaberechten der Umask auf der
# Platte steht.
: >"$DATEI" 2>/dev/null || { echo "Konnte ${DATEI} nicht anlegen." >&2; exit 0; }
chmod 600 "$DATEI" 2>/dev/null || true

{
  echo "Arasul ${FASSUNG:-Vorserie} -- Erstausgabe vom $(date '+%d.%m.%Y %H:%M')"
  echo ""
  echo "DIESE DATEI NACH DEM LESEN LOESCHEN."
  echo "Sie enthaelt die beiden Geheimnisse der Installation im Klartext; auf"
  echo "dem Geraet selbst sind sie sonst nirgends nachzuschlagen."
  echo ""
  echo "    shred -u ${DATEI}   (oder: rm ${DATEI})"
  echo ""
  echo "Oberflaeche     https://${NETZNAME}/   (Rueckfall https://${NETZNAME}.local/)"
  [ -n "$TAILNETZ" ] && echo "Von unterwegs   https://${TAILNETZ}"
  echo ""
  echo "Administrator   ${BENUTZER}"
  if [ -n "$PASSWORT" ]; then
    echo "Startpasswort   ${PASSWORT}"
    echo "                Beim ersten Anmelden wird es gewechselt."
  else
    echo "Passwort        beim Einrichten vergeben, hier nicht hinterlegt"
  fi
  echo ""
  if [ -n "$SCHLUESSEL" ]; then
    echo "Kit-Schluessel  ${SCHLUESSEL}"
    echo "                Bereich app:deploy. Damit rollt das Ara-Kit Apps auf"
    echo "                dieses Geraet (docs/features/APP-PAKET.md)."
    echo "                Neuer Schluessel, alter entwertet:"
    echo "                bash scripts/util/kit-schluessel.sh anlegen \"Kit von ...\""
  else
    echo "Kit-Schluessel  keiner angelegt. Nachholen:"
    echo "                bash scripts/util/kit-schluessel.sh anlegen \"Kit von ...\""
  fi
} >>"$DATEI"

if [ "$NUR_DATEI" = false ]; then
  echo -e "  Beides steht auch in ${FETT}${DATEI}${AUS} (nur fuer den Besitzer lesbar)."
  echo "  Nach dem Notieren loeschen: shred -u ${DATEI}"
  echo ""
fi

exit 0
