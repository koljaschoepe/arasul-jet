#!/bin/bash
# =============================================================================
# Die systemd-Einheiten des Geraets, auf DIESEN Fassungsordner geschrieben
# (Auftrag J35, 25.09.2026)
# =============================================================================
# Die Vorlagen unter `packaging/arasul-platform/etc/systemd/system/` tragen
# `/opt/arasul` -- einen Ordner, den es auf keinem Geraet gibt: installiert
# wird nach `~/arasul-<fassung>`. Bis J35 schrieb `install.sh` nur die
# Plattform-Einheit um, und `./arasul bootstrap` kopierte Deadman-Switch und
# Docker-Watchdog UNVERAENDERT. Am Orin (25.09.2026) stand damit:
#
#   arasul-platform.service   203/EXEC in einer Neustartschleife, obwohl ihr
#                             Skript unter ~/arasul-0.4.0 lag -- `ProtectHome=yes`
#                             versteckt /home vor dem Dienst, und ein Skript,
#                             das der Dienst nicht sieht, ist "No such file".
#   deadman-switch.service    failed, /opt/arasul/scripts/... gibt es nicht
#   docker-watchdog.service   failed, dito
#
# Ein Neustart des Geraets haette die Plattform nicht geordnet hochgebracht.
# Dieses Skript ist jetzt der EINE Ort, an dem aus den Vorlagen Einheiten
# werden: `install.sh` ruft es (nur die Plattform, vor dem Bootstrap), der
# Bootstrap ruft es (alle, nach dem Rauchtest), und der Deploy ruft es (alle,
# damit ein Bestandsgeraet ohne Neuinstallation heilt).
#
#   --nur-plattform   nur arasul-platform.service (ohne die Timer)
#   --ausgabe DIR     nur erzeugen, nach DIR schreiben; kein sudo, kein
#                     systemctl (fuer den Test: scripts/test/einheiten.sh)
#
# Rueckgabe 0, wenn geschrieben wurde; 3, wenn kein sudo ohne Rueckfrage da
# ist (der Aufrufer entscheidet, ob das schlimm ist); 1 bei einem Fehler.
# =============================================================================
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUELLE="${WURZEL}/packaging/arasul-platform/etc/systemd/system"
NUR_PLATTFORM=false
AUSGABE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --nur-plattform) NUR_PLATTFORM=true ;;
    --ausgabe)
      AUSGABE="${2:?--ausgabe braucht ein Verzeichnis}"
      shift
      ;;
    *)
      echo "einheiten-installieren.sh: unbekanntes Argument $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$NUR_PLATTFORM" = true ]; then
  EINHEITEN=(arasul-platform.service)
else
  EINHEITEN=(arasul-platform.service deadman-switch.service deadman-switch.timer
    docker-watchdog.service docker-watchdog.timer)
fi

# Wer den Stapel betreibt: der Mensch, dem der Fassungsordner gehoert -- nicht
# unbedingt der, der dieses Skript aufruft (der Deploy laeuft als derselbe,
# `sudo bash …` aber als root).
BENUTZER="$(stat -c '%U' "$WURZEL" 2>/dev/null || id -un)"
GRUPPE="$(stat -c '%G' "$WURZEL" 2>/dev/null || id -gn)"

# `ProtectHome=yes` macht /home fuer den Dienst unsichtbar. Liegt das Geraet
# darunter -- und das tut es, seit C10 nach `~/arasul-<fassung>` installiert
# wird --, ist `read-only` die Stufe, die noch geht: gelesen wird dort
# (`.env`, `~/.docker`), geschrieben nur in `ReadWritePaths`, dem
# Fassungsordner. Am Orin gegengeprueft: `docker compose up` laeuft so.
case "$WURZEL/" in
  /home/* | /root/*) SCHUTZ_HOME="read-only" ;;
  *) SCHUTZ_HOME="yes" ;;
esac

erzeuge() {
  local name="$1"
  sed -e "s|/opt/arasul|${WURZEL}|g" \
    -e "s|^User=.*|User=${BENUTZER}|" \
    -e "s|^Group=.*|Group=${GRUPPE}|" \
    -e "s|^ProtectHome=.*|ProtectHome=${SCHUTZ_HOME}|" \
    "${QUELLE}/${name}"
}

ZWISCHEN="$(mktemp -d)"
trap 'rm -rf "$ZWISCHEN"' EXIT
for e in "${EINHEITEN[@]}"; do
  [ -f "${QUELLE}/${e}" ] || { echo "Vorlage fehlt: ${QUELLE}/${e}" >&2; exit 1; }
  erzeuge "$e" >"${ZWISCHEN}/${e}"
  # Was ein Dienst startet, muss es geben. Ein ExecStart ins Leere ist genau
  # der Fehler, den dieses Skript abschafft -- er wird hier laut und nicht
  # erst beim naechsten Stromausfall.
  while IFS= read -r programm; do
    [ -x "$programm" ] || { echo "${e}: ExecStart ${programm} ist nicht ausfuehrbar" >&2; exit 1; }
  done < <(sed -n 's|^ExecStart=\(/[^ ]*\).*|\1|p' "${ZWISCHEN}/${e}")
done

if [ -n "$AUSGABE" ]; then
  mkdir -p "$AUSGABE"
  cp "${ZWISCHEN}"/* "$AUSGABE"/
  exit 0
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "Kein systemd auf diesem Rechner; keine Einheiten geschrieben." >&2
  exit 3
fi
if [ "$(id -u)" -eq 0 ]; then
  ALS_ROOT=()
elif sudo -n true 2>/dev/null; then
  ALS_ROOT=(sudo -n)
else
  echo "Kein sudo ohne Rueckfrage; die Einheiten zeigen weiter, wohin sie zeigten." >&2
  exit 3
fi

for e in "${EINHEITEN[@]}"; do
  "${ALS_ROOT[@]}" install -m 0644 "${ZWISCHEN}/${e}" "/etc/systemd/system/${e}"
done
"${ALS_ROOT[@]}" systemctl daemon-reload
"${ALS_ROOT[@]}" systemctl enable arasul-platform.service >/dev/null 2>&1
if [ "$NUR_PLATTFORM" = false ]; then
  "${ALS_ROOT[@]}" systemctl enable --now docker-watchdog.timer deadman-switch.timer >/dev/null 2>&1
fi
# Eine Einheit, die bisher scheiterte, steht sonst weiter als `failed` in
# `systemctl --failed`, obwohl ihre Datei jetzt stimmt.
"${ALS_ROOT[@]}" systemctl reset-failed "${EINHEITEN[@]}" >/dev/null 2>&1 || true
echo "Einheiten auf ${WURZEL} geschrieben: ${EINHEITEN[*]}"
