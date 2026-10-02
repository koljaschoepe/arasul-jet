#!/bin/bash
# =============================================================================
# Eine neue Fassung auf dieses Geraet spielen -- und wieder zurueck (J39)
# =============================================================================
# Aufruf (vom Aktualisierungsdienst des Backends, auf dem HOST):
#
#   fassung-einspielen.sh einspielen <artefakt.tar.gz> <fassung> <lauf-id>
#   fassung-einspielen.sh zurueck <lauf-id>
#
# WARUM EIN SKRIPT AM HOST. Eine Fassung einspielen heisst `install.sh` der
# neuen Fassung laufen lassen, und das braucht `docker`, `docker compose`,
# `sudo` und die Verzeichnisse des Benutzers -- nichts davon gibt es im
# Backend-Container. Bis J39 blieb dafuer nur SSH: das Kit (`upgrade.mjs`)
# brauchte einen Fernzugriff und `sudo reboot`. Das Backend startet dieses
# Skript jetzt ueber einen kurzlebigen Hilfscontainer (`nsenter` in den Host,
# `services/betrieb/fassungsdienst.js`), und es ueberlebt, was es selbst tut:
# der Stapel samt Backend wird mitten im Lauf abgeschaltet und neu gestartet.
#
# DAS SKRIPT GEHOERT DER LAUFENDEN FASSUNG, nicht der neuen. Es liegt im
# Verzeichnis, aus dem das Geraet gerade laeuft, und ein Artefakt, das noch
# keines kennt, laesst sich trotzdem damit einspielen.
#
# WAS ES TUT, in dieser Reihenfolge:
#   1. Das neue Artefakt neben das laufende Verzeichnis auspacken
#      (`arasul-<fassung>/`) und pruefen, dass es die Fassung ist, die es sein soll.
#   2. `install.sh` darin laufen lassen. Das uebernimmt den Zustand (rename,
#      keine Kopie), baut die Images WAEHREND der alte Stapel noch laeuft und
#      schaltet erst danach um -- docs/ops/AUSLIEFERUNG.md.
#   3. Warten, bis die Container gesund sind.
#   4. Aufraeumen: abgegebene Fassungsordner bis auf den letzten Vorgaenger,
#      alte Artefakte, verwaiste Images.
#
# GEHT ETWAS SCHIEF, geht es auf die vorige Fassung zurueck: ihr Ordner traegt
# nur noch das Programm (`ABGEGEBEN.txt`), `install.sh` darin zieht den Zustand
# zurueck. Das ist derselbe Weg wie `zurueck` auf Wunsch.
#
# WAS DER RUECKWEG NICHT KANN: Daten zurueckdrehen. Er holt das PROGRAMM der
# vorigen Fassung; was die neue an der Datenbank geaendert hat (Migrationen
# sind additiv), bleibt. Die Sicherung vor dem Einspielen liegt bereit, wenn
# auch die Daten zurueck sollen -- das ist eine Wiederherstellung und eine
# eigene Entscheidung eines Menschen.
#
# DER STATUS steht in `data/updates/fassung/status.json`, das Protokoll daneben
# in `lauf.log`. Beides zieht mit dem Zustand um; das Backend liest es von dort
# (`/arasul/updates/fassung/`), auch nachdem es neu gestartet ist.
#
# Fuer die Pruefung (CI, `scripts/test/fassung-einspielen-abnahme.sh`):
#   FASSUNG_NUR_VORBEREITEN=1   install.sh mit --nur-vorbereiten, ohne Bootstrap
#   FASSUNG_OHNE_GESUNDHEIT=1   nicht auf gesunde Container warten
# =============================================================================
set -uo pipefail

SKRIPT_ORDNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALT="$(cd "${SKRIPT_ORDNER}/../.." && pwd)"
ELTERN="$(dirname "$ALT")"
ABGEGEBEN='ABGEGEBEN.txt'

# shellcheck source=../lib/fassung.sh
source "${ALT}/scripts/lib/fassung.sh"

ART="${1:-}"
LAUF=""
ARTEFAKT=""
NACH=""
NEU=""

case "$ART" in
  einspielen) ARTEFAKT="${2:-}"; NACH="${3:-}"; LAUF="${4:-}" ;;
  zurueck)    LAUF="${2:-}" ;;
  *)
    echo "Aufruf: $0 einspielen <artefakt.tar.gz> <fassung> <lauf-id> | zurueck <lauf-id>" >&2
    exit 2
    ;;
esac
LAUF="${LAUF:-$(date +%s)}"

# -----------------------------------------------------------------------------
# Status und Protokoll
# -----------------------------------------------------------------------------
STATUS_STATUS='laeuft'
STATUS_SCHRITT='start'
STATUS_MELDUNG=''
GESTARTET="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BEENDET=''
VON=''
VORIGE_ORDNER=''
VORIGE_FASSUNG=''
JETZT_ORDNER="$ALT"

json_text() {
  # Anfuehrungszeichen und Rueckstriche maskieren, Steuerzeichen weg.
  printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037' | tr '\n\t' '  ' \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Wo der Status JETZT liegt. Vor dem Umzug im alten Ordner, danach im neuen --
# `data/` zieht um, und mit ihm `updates/fassung/`.
statusordner() {
  local kandidat
  for kandidat in "${ALT}/data/updates/fassung" "${NEU:-/nicht/da}/data/updates/fassung"; do
    if [ -d "$kandidat" ]; then
      printf '%s\n' "$kandidat"
      return 0
    fi
  done
  return 1
}

status() {
  # status <status> <schritt> [meldung]
  STATUS_STATUS="$1"
  STATUS_SCHRITT="$2"
  STATUS_MELDUNG="${3:-}"
  case "$1" in laeuft) ;; *) BEENDET="$(date -u +%Y-%m-%dT%H:%M:%SZ)" ;; esac

  local ordner
  ordner="$(statusordner)" || return 0
  local tmp="${ordner}/.status.json.tmp"
  {
    printf '{\n'
    printf '  "lauf": "%s",\n' "$(json_text "$LAUF")"
    printf '  "art": "%s",\n' "$ART"
    printf '  "status": "%s",\n' "$STATUS_STATUS"
    printf '  "schritt": "%s",\n' "$(json_text "$STATUS_SCHRITT")"
    printf '  "meldung": "%s",\n' "$(json_text "$STATUS_MELDUNG")"
    printf '  "von": "%s",\n' "$(json_text "$VON")"
    printf '  "nach": "%s",\n' "$(json_text "$NACH")"
    printf '  "ordner": "%s",\n' "$(json_text "$JETZT_ORDNER")"
    printf '  "vorigeFassung": "%s",\n' "$(json_text "$VORIGE_FASSUNG")"
    printf '  "vorigerOrdner": "%s",\n' "$(json_text "$VORIGE_ORDNER")"
    printf '  "gestartet": "%s",\n' "$GESTARTET"
    printf '  "beendet": %s\n' "$([ -n "$BEENDET" ] && printf '"%s"' "$BEENDET" || printf 'null')"
    printf '}\n'
  } > "$tmp" 2>/dev/null && mv -f "$tmp" "${ordner}/status.json" 2>/dev/null
  return 0
}

sagen() { echo "[$(date +%H:%M:%S)] $*"; }

# Alles ab hier ins Protokoll. Der Dateideskriptor bleibt gueltig, auch wenn
# `data/` mitten im Lauf in ein anderes Verzeichnis umzieht (rename).
PROTOKOLL_ORDNER="${ALT}/data/updates/fassung"
mkdir -p "$PROTOKOLL_ORDNER" 2>/dev/null || true
if [ -d "$PROTOKOLL_ORDNER" ]; then
  exec >> "${PROTOKOLL_ORDNER}/lauf.log" 2>&1
fi
sagen "=== ${ART} (Lauf ${LAUF}) aus ${ALT}"

# -----------------------------------------------------------------------------
# Hilfen
# -----------------------------------------------------------------------------
env_wert() {
  # env_wert <datei> <schluessel>
  [ -f "$1" ] || return 0
  sed -n "s/^$2=//p" "$1" | sed -n '1p'
}

# Die Fassung eines Programmordners: Bau-Datei, sonst Git, sonst die `.env`.
fassung_von() {
  local ordner="$1" f
  f="$(fassung_aus_bau "$ordner")"
  [ -n "$f" ] || f="$(env_wert "${ordner}/.env" SYSTEM_VERSION)"
  printf '%s\n' "$f"
}

# Ein Fassungsordner, der nicht aus dem Artefakt stammt (der Deploy legt Staende
# in ein Verzeichnis, das einmal ein Artefakt war), traegt keine
# `arasul-release.json`. Ohne sie nimmt `install.sh` darin keine Rueckkehr an
# ("Dieses Verzeichnis nennt keine Fassung"). Sie wird hier nachgetragen --
# mit dem, was die `.env` sagt, nicht mit etwas Erfundenem.
release_nachtragen() {
  local ordner="$1" fassung="$2"
  [ -f "${ordner}/arasul-release.json" ] && return 0
  [ -n "$fassung" ] || return 0
  local hash
  hash="$(env_wert "${ordner}/.env" BUILD_HASH)"
  {
    printf '{\n'
    printf '  "fassung": "%s",\n' "$(json_text "$fassung")"
    printf '  "commit": "%s",\n' "$(json_text "${hash:-unbekannt}")"
    printf '  "gebaut": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "einstiegspunkt": "install.sh",\n'
    printf '  "nachgetragen": "J39: vor dem Einspielen einer neuen Fassung aus der .env"\n'
    printf '}\n'
  } > "${ordner}/arasul-release.json" 2>/dev/null || true
}

loeschen() {
  # Ein Programmordner oder eine Datei weg; ohne Erfolg mit sudo ohne Rueckfrage.
  rm -rf "$1" 2>/dev/null && return 0
  sudo -n rm -rf "$1" 2>/dev/null && return 0
  return 1
}

# Warten, bis jeder Container dieses Projekts mit Gesundheitspruefung gesund ist.
gesund_warten() {
  [ "${FASSUNG_OHNE_GESUNDHEIT:-}" = 1 ] && return 0
  local projekt="${ARASUL_PROJEKT:-arasul-platform}" versuche=60 unten
  while [ "$versuche" -gt 0 ]; do
    unten="$(docker ps -a --filter "label=com.docker.compose.project=${projekt}" \
      --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -E 'unhealthy|starting|Exited|Restarting' || true)"
    if [ -z "$unten" ] && [ -n "$(docker ps --filter "label=com.docker.compose.project=${projekt}" \
        --filter 'name=dashboard-backend' --filter 'health=healthy' -q 2>/dev/null)" ]; then
      return 0
    fi
    versuche=$((versuche - 1))
    sleep 5
  done
  sagen "Nicht gesund geworden:"
  printf '%s\n' "$unten"
  return 1
}

# -----------------------------------------------------------------------------
# Zurueck auf die vorige Fassung
# -----------------------------------------------------------------------------
# <ziel>: der Ordner der vorigen Fassung, <jetzt>: der Ordner, aus dem das Geraet
# gerade laeuft (oder laufen soll).
rueckweg() {
  local ziel="$1" jetzt="$2" name
  name="$(env_wert "${jetzt}/.env" MDNS_NAME)"

  if [ -f "${ALT}/.env" ] && [ "$ziel" = "$ALT" ]; then
    sagen "Der Zustand liegt noch im alten Ordner: das Geraet laeuft unveraendert weiter."
    return 0
  fi
  if [ ! -f "${ziel}/install.sh" ]; then
    sagen "Der Ordner der vorigen Fassung ist nicht mehr da (${ziel}): kein Rueckweg."
    return 1
  fi

  rm -f "${ziel}/${ABGEGEBEN}"
  sagen "Rueckweg: ${ziel} uebernimmt das Geraet aus ${jetzt}"
  local zusatz=()
  [ "${FASSUNG_NUR_VORBEREITEN:-}" = 1 ] && zusatz+=(--nur-vorbereiten)
  [ -n "$name" ] && zusatz+=(--name "$name")
  (cd "$ziel" && bash ./install.sh --uebernehmen "$jetzt" --ssh-behalten "${zusatz[@]}")
  local ergebnis=$?
  if [ "$ergebnis" -ne 0 ]; then
    sagen "Der Rueckweg ist mit ${ergebnis} gescheitert."
    return 1
  fi
  JETZT_ORDNER="$ziel"
  return 0
}

# -----------------------------------------------------------------------------
# Aufraeumen: bis auf den letzten Vorgaenger
# -----------------------------------------------------------------------------
aufraeumen() {
  local jetzt="$1" vorige="$2" ordner behalten=0 entfernt=0
  for ordner in "$ELTERN"/arasul-*/; do
    ordner="${ordner%/}"
    [ -d "$ordner" ] || continue
    [ "$ordner" = "$jetzt" ] && continue
    [ "$ordner" = "$vorige" ] && { behalten=$((behalten + 1)); continue; }
    # Nur, was seinen Zustand abgegeben hat. Ein Ordner ohne diesen Vermerk
    # koennte ein Geraet sein.
    [ -f "${ordner}/${ABGEGEBEN}" ] || continue
    if loeschen "$ordner"; then
      entfernt=$((entfernt + 1))
      sagen "Aufgeraeumt: ${ordner}"
    else
      sagen "Nicht aufgeraeumt (keine Rechte): ${ordner}"
    fi
  done

  # Artefakte: das eingespielte bleibt, alle anderen im Ablageordner gehen.
  local ablage
  ablage="$(statusordner)" && ablage="$(dirname "$ablage")/fassungen"
  if [ -d "${ablage:-/nicht/da}" ]; then
    local datei
    for datei in "$ablage"/arasul-*.tar.gz "$ablage"/arasul-*.tar.gz.sha256; do
      [ -e "$datei" ] || continue
      case "$datei" in *"arasul-${NACH:-@}.tar.gz"*) continue ;; esac
      rm -f "$datei"
    done
  fi

  # Verwaiste Images: nur, was keinen Namen mehr traegt und von keinem Container
  # gebraucht wird. Zusammen mit dem Weg zurueck vertraeglich -- ein Image der
  # vorigen Fassung hat seinen Namen.
  docker image prune -f >/dev/null 2>&1 || true
  sagen "Aufgeraeumt: ${entfernt} Fassungsordner, davon bleibt der letzte Vorgaenger (${behalten})."
}

# -----------------------------------------------------------------------------
# zurueck
# -----------------------------------------------------------------------------
if [ "$ART" = zurueck ]; then
  VON="$(fassung_von "$ALT")"
  # Der Vorgaenger: der Ordner, der laut seinem Vermerk an DIESEN abgegeben hat.
  ZIEL=""
  for ordner in "$ELTERN"/arasul-*/; do
    ordner="${ordner%/}"
    [ -f "${ordner}/${ABGEGEBEN}" ] || continue
    if grep -qxF "    ${ALT}" "${ordner}/${ABGEGEBEN}" 2>/dev/null; then
      ZIEL="$ordner"
    fi
  done
  if [ -z "$ZIEL" ]; then
    status fehlgeschlagen zurueck 'Es gibt keine vorige Fassung, auf die das Gerät zurück könnte.'
    sagen "Kein Vorgaenger gefunden."
    exit 1
  fi
  NACH="$(fassung_von "$ZIEL")"
  VORIGE_ORDNER="$ALT"
  VORIGE_FASSUNG="$VON"
  NEU="$ZIEL"
  status laeuft zurueck "Zurück auf ${NACH}"
  release_nachtragen "$ZIEL" "$NACH"
  if rueckweg "$ZIEL" "$ALT" && gesund_warten; then
    status fertig fertig "Zurück auf ${NACH}"
    sagen "Zurueck auf ${NACH}."
    exit 0
  fi
  status fehlgeschlagen zurueck "Der Weg zurück auf ${NACH} ist nicht gelungen. Protokoll: lauf.log"
  exit 1
fi

# -----------------------------------------------------------------------------
# einspielen
# -----------------------------------------------------------------------------
VON="$(fassung_von "$ALT")"
VORIGE_ORDNER="$ALT"
VORIGE_FASSUNG="$VON"
NEU="${ELTERN}/arasul-${NACH}"
status laeuft auspacken "Das Paket ${NACH} wird ausgepackt"

if [ ! -f "$ARTEFAKT" ]; then
  status fehlgeschlagen auspacken 'Das Paket liegt nicht mehr da.'
  exit 1
fi
if [ -z "$NACH" ] || [ "$NEU" = "$ALT" ]; then
  status fehlgeschlagen auspacken "Das Gerät läuft schon aus arasul-${NACH}."
  exit 1
fi

# Ein Rest eines frueheren Versuchs oder der Ordner einer abgegebenen Fassung
# (die Rueckkehr auf eine Fassung, die schon einmal da war) darf weichen; ein
# Ordner, der KEIN abgegebener ist, nicht -- er koennte ein Geraet sein.
if [ -e "$NEU" ]; then
  if [ -f "${NEU}/${ABGEGEBEN}" ] || [ ! -f "${NEU}/.env" ]; then
    sagen "Ein alter Ordner ${NEU} wird ersetzt."
    loeschen "$NEU"
  fi
fi
if [ -e "$NEU" ]; then
  status fehlgeschlagen auspacken "${NEU} gibt es schon und ist kein abgegebener Fassungsordner."
  exit 1
fi

if ! tar xzf "$ARTEFAKT" -C "$ELTERN"; then
  status fehlgeschlagen auspacken 'Das Paket lässt sich nicht auspacken.'
  loeschen "$NEU"
  exit 1
fi
if [ ! -f "${NEU}/install.sh" ] || [ "$(fassung_aus_bau "$NEU")" != "$NACH" ]; then
  status fehlgeschlagen auspacken "Das Paket ist nicht die Fassung ${NACH}."
  loeschen "$NEU"
  exit 1
fi
sagen "Ausgepackt nach ${NEU}"

# Der Ordner, den das Geraet abgibt, muss den Rueckweg tragen koennen.
release_nachtragen "$ALT" "$VON"

NETZNAME="$(env_wert "${ALT}/.env" MDNS_NAME)"
zusatz=(--ssh-behalten)
[ "${FASSUNG_NUR_VORBEREITEN:-}" = 1 ] && zusatz+=(--nur-vorbereiten)
[ -n "$NETZNAME" ] && zusatz+=(--name "$NETZNAME")

status laeuft installieren "Die Images werden gebaut, das Gerät läuft solange weiter"
sagen "install.sh in ${NEU}"
(cd "$NEU" && bash ./install.sh --uebernehmen "$ALT" "${zusatz[@]}")
ERGEBNIS=$?
JETZT_ORDNER="$NEU"

if [ "$ERGEBNIS" -eq 0 ]; then
  status laeuft pruefen "Das Gerät wird geprüft"
  if gesund_warten; then
    status laeuft aufraeumen "Aufräumen"
    aufraeumen "$NEU" "$ALT"
    status fertig fertig "Das Gerät läuft mit ${NACH}"
    sagen "Fertig: ${NACH}"
    exit 0
  fi
  sagen "Die neue Fassung ist nicht gesund geworden."
else
  sagen "install.sh ist mit ${ERGEBNIS} gescheitert."
fi

# Etwas ging schief: zurueck.
status laeuft rueckweg "Etwas ist schiefgegangen, das Gerät geht auf ${VON} zurück"
if rueckweg "$ALT" "$NEU" && gesund_warten; then
  JETZT_ORDNER="$ALT"
  status zurueckgerollt fertig "Die Fassung ${NACH} ließ sich nicht einspielen. Das Gerät läuft wieder mit ${VON}."
  # Der halbe neue Ordner traegt nur Programm; weg damit, er wird bei Bedarf
  # frisch ausgepackt. Liegt der Zustand noch im alten Ordner, hat er ohnehin
  # nie ein Geraet getragen.
  if [ -f "${NEU}/${ABGEGEBEN}" ] || [ -f "${ALT}/.env" ]; then loeschen "$NEU"; fi
  exit 1
fi
status rueckweg_fehlgeschlagen rueckweg "Die Fassung ${NACH} ließ sich nicht einspielen, und auch der Weg zurück ist gescheitert. Protokoll: lauf.log"
exit 1
