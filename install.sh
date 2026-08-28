#!/bin/bash
# =============================================================================
# Der Einstiegspunkt des Auslieferungsartefakts (Phase C10, 27.08.2026)
# =============================================================================
# Ein Mensch mit einem frischen Jetson tippt eine Zeile:
#
#   curl -fsSL https://arasul.de/api/install | bash
#
# Die Website laedt das Artefakt hinter ihrem Token, packt es aus und ruft
# GENAU DIESE DATEI auf. Ihr Name steht im Artefakt selbst
# (`arasul-release.json`, Feld `einstiegspunkt`), damit weder das Ara-Kit noch
# die Website ihn raten muss. Wer das Artefakt von Hand herunterlaedt, macht
# dasselbe zu Fuss:
#
#   tar xzf arasul-<Fassung>.tar.gz
#   cd arasul-<Fassung>
#   ./install.sh
#
# WAS DIESE DATEI IST: eine duenne Schicht ueber `./arasul bootstrap`. Sie legt
# an, was der Bootstrap voraussetzt und was ein unbeaufsichtigter Lauf nicht
# erfragen kann -- die `.env`, den Netznamen, die Fassung aus dem Bau -- und
# uebergibt dann. Was danach passiert (Hardware pruefen, Zertifikate, Images
# bauen, Datenbank, Admin, Kit-Schluessel), steht im Bootstrap und nur dort.
# Zwei Installationswege waeren zwei Orte, an denen ein Geraet anders aussieht.
#
# Aufruf:
#   ./install.sh                              Startpasswort wird erzeugt und gezeigt
#   ./install.sh --passwort 'Geheim123'       Passwort vorgeben
#   ./install.sh --name werkstatt             anderer Netzname als `arasul`
#   ./install.sh --nur-vorbereiten            .env schreiben, Bootstrap NICHT starten
#   ./install.sh --hilfe
#
# `--nur-vorbereiten` ist fuer die Pruefung da, nicht fuer den Kunden: es
# durchlaeuft alles, was ohne die Hardware eines Jetson geht -- Fassung,
# Voraussetzungen, `.env` -- und haelt vor dem Bootstrap an. Die CI faehrt
# damit bei jedem Zug eine Installation auf einem leeren Rechner durch
# (`.github/workflows/test.yml`, Job "Installation"). Ohne diesen Lauf war der
# einzige Test der Auslieferung ein Werksreset am Orin von Hand, und genau
# deshalb fiel am 28.08.2026 erst dort auf, dass der Bootstrap gar nicht
# durchlaeuft.
# =============================================================================
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WURZEL"

# shellcheck source=scripts/lib/fassung.sh
source "${WURZEL}/scripts/lib/fassung.sh"

ROT='\033[0;31m'; GRUEN='\033[0;32m'; GELB='\033[1;33m'; BLAU='\033[0;34m'; FETT='\033[1m'; AUS='\033[0m'
sagen()   { echo -e "${BLAU}[INSTALL]${AUS} $*"; }
gut()     { echo -e "${GRUEN}[INSTALL]${AUS} $*"; }
achtung() { echo -e "${GELB}[INSTALL]${AUS} $*"; }
fehler()  { echo -e "${ROT}[INSTALL]${AUS} $*" >&2; }

PASSWORT="${ADMIN_PASSWORD:-}"
NETZNAME="${ARASUL_NETZNAME:-arasul}"
NUR_VORBEREITEN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --passwort) PASSWORT="$2"; shift 2 ;;
    --name)     NETZNAME="$2"; shift 2 ;;
    --nur-vorbereiten) NUR_VORBEREITEN=true; shift ;;
    --hilfe|-h)
      sed -n '2,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) fehler "Unbekannte Option: $1"; exit 2 ;;
  esac
done

echo ""
echo -e "${FETT}  Arasul wird installiert${AUS}"
echo ""

# -----------------------------------------------------------------------------
# 1. Fassung aus dem Bau
# -----------------------------------------------------------------------------
# Zuerst, nicht zuletzt: wenn das Artefakt seine eigene Fassung nicht kennt,
# faengt die Installation gar nicht erst an. Ein Geraet ohne Fassung nimmt
# spaeter keine Aktualisierung an (`validateManifest`), und das faellt erst
# Monate spaeter auf.
FASSUNG="$(fassung_aus_bau "$WURZEL")"
HASH="$(bau_hash "$WURZEL")"
if [ -z "$FASSUNG" ]; then
  fehler "Dieses Verzeichnis nennt keine Fassung."
  fehler "  Erwartet: arasul-release.json (aus dem Artefakt) oder ein Git-Verzeichnis."
  fehler "  Ein Artefakt baut scripts/deploy/artefakt-bauen.sh."
  exit 1
fi
gut "Fassung ${FASSUNG} (Stand ${HASH:-unbekannt})"

# -----------------------------------------------------------------------------
# 2. Voraussetzungen
# -----------------------------------------------------------------------------
fehlt=0
for programm in docker openssl curl; do
  if ! command -v "$programm" >/dev/null 2>&1; then
    fehler "Es fehlt: ${programm}"
    fehlt=1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  fehler "Es fehlt: docker compose (Plugin V2)"
  fehlt=1
fi
if ! docker info >/dev/null 2>&1; then
  fehler "Docker antwortet nicht. Laeuft der Dienst, und darf dieser Benutzer ihn ansprechen?"
  fehler "  sudo systemctl start docker && sudo usermod -aG docker \$USER   (danach neu anmelden)"
  fehlt=1
fi
[ "$fehlt" -eq 0 ] || exit 1
gut "Docker ist da und antwortet"

# -----------------------------------------------------------------------------
# 3. Konfiguration (.env)
# -----------------------------------------------------------------------------
if [ -f "${WURZEL}/.env" ]; then
  sagen ".env ist schon da, sie bleibt unveraendert (bis auf Fassung und Netzname)"
else
  if [ -z "$PASSWORT" ]; then
    # 19 Zeichen aus dem Zufallsgenerator des Systems, mit garantiert einem
    # Grossbuchstaben, einem Kleinbuchstaben und einer Ziffer -- sonst weist
    # `validate_password` es zurueck, und der Installer bliebe an seiner
    # eigenen Regel haengen.
    #
    # `cut` und nicht `head -c`: `head` steigt nach 15 Zeichen aus, `tr`
    # schreibt in ein geschlossenes Rohr und endet mit 141, und unter
    # `pipefail` waere diese Zuweisung das stille Ende des Installers
    # (scripts/test/rohrbruch.py kennt den Fall). `cut` liest zu Ende.
    PASSWORT="Ara$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-15)9"
  fi
  sagen "Schreibe .env"
  ADMIN_PASSWORD="$PASSWORT" \
  ARASUL_NETZNAME="$NETZNAME" \
    bash "${WURZEL}/scripts/interactive_setup.sh" --non-interactive
fi

env_setzen "${WURZEL}/.env" SYSTEM_VERSION "$FASSUNG"
env_setzen "${WURZEL}/.env" BUILD_HASH "${HASH:-unbekannt}"
env_setzen "${WURZEL}/.env" MDNS_NAME "$NETZNAME"
gut "Fassung ${FASSUNG} steht in der .env"

# -----------------------------------------------------------------------------
# 4. Netzname
# -----------------------------------------------------------------------------
# Unter welchem Namen ein Mitarbeiter das Geraet erreicht. `setup-mdns.sh`
# setzt beides: den Hostnamen des Systems -- den meldet der DHCP-Client dem
# Router an, und daher kommt `https://arasul/` OHNE `.local` -- und Avahi fuer
# den Rueckfall `https://arasul.local/`, falls der Router keine Namen aus DHCP
# aufloest.
#
# Vor dem Bootstrap, weil das Zertifikat auf diesen Namen ausgestellt wird.
# Braucht root; ohne sudo ohne Rueckfrage bleibt es beim Namen, den das System
# schon hat, und das Geraet ist ueber seine IP erreichbar.
if [ "$NUR_VORBEREITEN" = true ]; then
  sagen "Netzname wird nicht gesetzt (--nur-vorbereiten)."
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  if sudo MDNS_NAME="$NETZNAME" bash "${WURZEL}/scripts/setup/setup-mdns.sh" >/dev/null 2>&1; then
    gut "Netzname ${NETZNAME} gesetzt (DHCP-Hostname und mDNS)"
  else
    achtung "Netzname nicht gesetzt. Das Geraet bleibt ueber seine IP erreichbar."
  fi
else
  achtung "Kein sudo ohne Rueckfrage: Netzname nicht gesetzt. Nachholen mit"
  achtung "  sudo MDNS_NAME=${NETZNAME} bash ${WURZEL}/scripts/setup/setup-mdns.sh"
fi

# -----------------------------------------------------------------------------
# Halt fuer die Pruefung
# -----------------------------------------------------------------------------
# Bis hierher wurde nichts am System veraendert -- nur die `.env` geschrieben.
# Alles Weitere (systemd-Unit, Bootstrap) greift ein und braucht ein Geraet.
if [ "$NUR_VORBEREITEN" = true ]; then
  echo ""
  gut "Vorbereitet. Der Bootstrap ist auf Wunsch ausgelassen (--nur-vorbereiten)."
  echo "  Weiter ginge es mit: ./arasul bootstrap"
  echo ""
  exit 0
fi

# -----------------------------------------------------------------------------
# 5. Beim Neustart wieder hochfahren
# -----------------------------------------------------------------------------
# Die Compose-Dienste tragen `restart: always`, kommen nach einem Stromausfall
# also von selbst zurueck, SOBALD der Docker-Dienst laeuft. Die Unit hier ist
# die Stufe darueber: sie faehrt den Stapel in der richtigen Reihenfolge hoch
# (`ordered-startup.sh`) statt alle dreizehn Container gleichzeitig auf einen
# gerade erst gestarteten Orin loszulassen.
#
# VOR dem Bootstrap, seit dem 28.08.2026: der Bootstrap endet mit der
# Erstausgabe -- Startpasswort und Kit-Schluessel --, und was danach noch auf
# den Bildschirm laeuft, schiebt genau die beiden Zeilen nach oben, die der
# Mensch abschreiben soll.
if command -v systemctl >/dev/null 2>&1; then
  UNIT_QUELLE="${WURZEL}/packaging/arasul-platform/etc/systemd/system/arasul-platform.service"
  if [ -f "$UNIT_QUELLE" ]; then
    if sed -e "s|/opt/arasul|${WURZEL}|g" \
           -e "s|^User=.*|User=$(id -un)|" \
           -e "s|^Group=.*|Group=$(id -gn)|" \
           "$UNIT_QUELLE" | sudo tee /etc/systemd/system/arasul-platform.service >/dev/null 2>&1; then
      sudo systemctl daemon-reload >/dev/null 2>&1 || true
      sudo systemctl enable arasul-platform.service >/dev/null 2>&1 || true
      gut "Startet nach einem Neustart von selbst (arasul-platform.service)"
    else
      achtung "arasul-platform.service nicht installiert (kein sudo ohne Rueckfrage)."
      achtung "  Ohne sie startet die Plattform nach einem Stromausfall trotzdem"
      achtung "  (die Container tragen restart: always), aber ohne geordnete Reihenfolge."
    fi
  fi
fi

# -----------------------------------------------------------------------------
# 6. Der Bootstrap macht den Rest -- und sagt das letzte Wort
# -----------------------------------------------------------------------------
# Hardware, Zertifikate, Images, Datenbank, Administrator, Kit-Schluessel,
# Rauchtest. Und zum Schluss die Erstausgabe: Startpasswort und
# Kit-Schluessel, auf dem Bildschirm und in `config/secrets/erstausgabe.txt`
# (scripts/util/erstausgabe.sh). Sie stand hier bis zum 28.08.2026 ein zweites
# Mal -- an zwei Orten, von denen der eine bei rotem Rauchtest gar nicht erst
# erreicht wurde. Jetzt sagt sie der Bootstrap, und nur der.
sagen "Bootstrap laeuft. Das dauert, weil die Images am Geraet gebaut werden."
echo ""
exec bash "${WURZEL}/arasul" bootstrap
