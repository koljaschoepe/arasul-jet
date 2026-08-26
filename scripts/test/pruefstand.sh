#!/bin/bash
# =============================================================================
# Pruefstand hoch- und runterfahren (Plan 023 B5)
# =============================================================================
# Ein zweiter, vollstaendig getrennter Stack auf demselben Geraet. Gedacht fuer
# genau eine Frage: tut der Werksreset das, was er verspricht, und sieht der
# Auslieferungszustand danach aus wie versprochen.
#
# Bewusst OHNE die GPU-Dienste (llm-service, embedding-service, document-indexer):
# der Werksreset raeumt Datenbank, Objektspeicher und Dateien auf, dafuer braucht
# es kein Modell. Zwei Ollama-Instanzen auf einem Orin wuerden sich nur um den
# Speicher streiten.
#
#   scripts/test/pruefstand.sh hoch      Stack starten (baut bei Bedarf)
#   scripts/test/pruefstand.sh stand     Was laeuft gerade
#   scripts/test/pruefstand.sh runter    Stack stoppen, Daten behalten
#   scripts/test/pruefstand.sh weg       Stack UND alle Pruefstand-Daten loeschen
#
# Erreichbar unter http://<geraet>:8081 bzw. https://<geraet>:8443.
# =============================================================================
set -euo pipefail

# Das Wartungsfenster teilt sich dieses Skript mit `deploy-local.sh`.
# Hart abbrechen, wenn die Bibliothek fehlt. Hier bricht `set -e` zwar ohnehin ab,
# aber die Aussage soll an beiden Stellen dieselbe sein: ein gescheitertes `source` wuerde den Lauf
# nicht anhalten, `wartung_an` waere nur ein "command not found", und der
# Lauf liefe gruen durch — mit einem Wartungsfenster, das nie aufgeht. Ein
# Schutz, der still ausfaellt, ist schlimmer als keiner, weil man sich auf ihn
# verlaesst.
WARTUNG_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/wartungsfenster.sh"
if ! source "$WARTUNG_LIB"; then
  echo "ABBRUCH: ${WARTUNG_LIB} nicht ladbar. Ohne Wartungsfenster wird nicht gebaut." >&2
  exit 1
fi
WARTUNG_GRUND="pruefstand-build"
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"
WARTUNG_FALLBACK_DIR="${WURZEL}/logs"
# Ohne `trap` bleibt die Wartungsdatei liegen, sobald irgendetwas schiefgeht —
# und dieses Skript laeuft mit `set -e`, bricht also mitten im Lauf ab. Am
# 23.08.2026 um 23:41 genau so passiert: der Bau lief durch, das Hochfahren
# scheiterte an einem belegten Port 8090, `wartung_aus` wurde nie erreicht.
# Die Selbstheilung haette bis zum Ablauf des Deckels geschwiegen, also eine
# halbe Stunde, ohne dass jemand es gemerkt haette.
#
# Der Deckel hat also getan, wofuer er da ist. Er ist trotzdem das Netz und
# nicht der Boden: `deploy-local.sh` hat diesen `trap` von Anfang an, hier
# hatte ich ihn vergessen.
trap wartung_aus EXIT

# Dieses Skript spricht `docker compose` DIREKT an, also laeuft es auf dem
# Geraet und nicht vom Arbeitsrechner aus. Ohne diese Zeile war die Auskunft
# `docker: command not found` — richtig, aber unbrauchbar (23.08.2026).
if ! command -v docker >/dev/null 2>&1; then
  echo "ABBRUCH: kein docker erreichbar."
  echo "Der Pruefstand laeuft AUF DEM GERAET. Von hier aus:"
  echo "  ssh jetson 'cd /home/arasul/arasul/arasul-jet && scripts/test/pruefstand.sh $*'"
  exit 2
fi

PROJEKT="arasul-pruefstand"
UMGEBUNG="compose/pruefstand.vars"
DIENSTE=(postgres-db dashboard-backend dashboard-frontend reverse-proxy n8n)

# Dieselbe docker-compose.yml wie im Normalbetrieb, nur mit eigener Umgebung
# und eigenem Projektnamen. Eine eigene Dateiliste waere ein zweiter Ort, der
# abdriftet: compose.secrets.yaml ueberlagert Dienste aus compose.monitoring.yaml,
# und eine Teilliste scheitert schon an der Pruefung ("has neither an image nor
# a build context"). Gestartet wird trotzdem nur die Teilmenge in DIENSTE.
compose() {
  docker compose \
    --env-file .env --env-file "$UMGEBUNG" \
    -p "$PROJEKT" \
    "$@"
}

sicherheitsnetz() {
  # Der Pruefstand darf NIE auf die echten Daten zeigen. Wenn diese Pruefung
  # faellt, ist die Trennung kaputt und ein Werksreset wuerde den Arbeitsstand
  # loeschen. Lieber gar nicht starten.
  local gerendert pfad envdatei
  gerendert=$(compose config 2>/dev/null || true)

  pfad=$(echo "$gerendert" | grep -oE "source: ${WURZEL}/data(/|$)" | head -1 || true)
  if [ -n "$pfad" ]; then
    echo "ABBRUCH: der Pruefstand zeigt auf ${WURZEL}/data, also auf die echten Daten."
    echo "DATA_PATH in ${UMGEBUNG} pruefen."
    exit 1
  fi

  # Die .env ist keine Nebensache: der Werksreset SCHREIBT in sie und entwertet
  # ADMIN_PASSWORD. Zeigt der Pruefstand auf die echte, nimmt ein Testlauf dem
  # Normalbetrieb sein Erstpasswort.
  envdatei=$(echo "$gerendert" | grep -oE "source: ${WURZEL}/\.env$" | head -1 || true)
  if [ -n "$envdatei" ]; then
    echo "ABBRUCH: der Pruefstand zeigt auf ${WURZEL}/.env, also auf die echte Umgebungsdatei."
    echo "ENV_DATEI in ${UMGEBUNG} pruefen."
    exit 1
  fi

  # Und die Geheimnisse. Zeigt der Pruefstand darauf, traegt sein
  # "Fabrikzustand" das Erstpasswort des Arbeitsgeraets, und ein Werksreset
  # dort fasst die echten Dateien an.
  local geheim
  geheim=$(echo "$gerendert" | grep -oE "file: ${WURZEL}/config/secrets/" | head -1 || true)
  if [ -n "$geheim" ]; then
    echo "ABBRUCH: der Pruefstand zeigt auf ${WURZEL}/config/secrets, also auf die echten Geheimnisse."
    echo "SECRETS_PFAD in ${UMGEBUNG} pruefen."
    exit 1
  fi
}

# Alle Bind-Mount-Ordner vorher anlegen, und zwar als der aufrufende Benutzer.
# Legt Docker sie selbst an, gehoeren sie root, und das Backend laeuft als node
# (uid 1000). Es kann dann weder einen Flow noch eine Erweiterung schreiben.
# Im Normalbetrieb gehoeren dieselben Ordner arasul (uid 1000), dort faellt das
# nie auf. Die Liste wird aus dem gerenderten Compose gezogen, nicht gepflegt:
# eine Liste von Hand waere beim naechsten neuen Mount falsch.
ordner_anlegen() {
  local pfad
  while read -r pfad; do
    [ -n "$pfad" ] || continue
    mkdir -p "$pfad"
  done < <(compose config 2>/dev/null |
    grep -oE "source: ${WURZEL}/(data|logs)-pruefstand[^ ]*" |
    sed 's/^source: //' |
    # Datei-Mounts aussortieren, an ihrer Endung erkannt. Ein Ordner mit Punkt
    # im Namen faellt hier faelschlich mit heraus; unter data-pruefstand gibt es
    # keinen, und ein neuer waere ohnehin ein Grund, hier nachzusehen.
    grep -vE '\.[a-z]{2,5}$' |
    sort -u)
}

# Die GPU-Dienste kommen ueber depends_on mit hoch, obwohl sie nicht in DIENSTE
# stehen. Auf dem Orin ist das nicht harmlos: eine zweite Ollama-Instanz streitet
# mit der echten um den Speicher, und im Normalbetrieb stand danach ein
# ungesunder pruef-llm-service in der Containerliste. Der Werksreset raeumt
# Datenbank, Objektspeicher und Dateien, dafuer braucht es kein Modell.
ohne_gpu() {
  local dienst
  for dienst in llm-service embedding-service document-indexer; do
    compose rm -sf "$dienst" >/dev/null 2>&1 || true
  done
}

# Eigene .env fuer den Pruefstand, einmalig als Kopie. Sie darf abweichen, aber
# sie muss existieren, bevor der Stack startet: Compose bindet eine fehlende
# Datei sonst als leeres VERZEICHNIS ein.
eigene_env() {
  local ziel="${WURZEL}/.env.pruefstand"
  if [ ! -f "$ziel" ]; then
    cp "${WURZEL}/.env" "$ziel"
    chmod 600 "$ziel"
    echo "Eigene Umgebungsdatei angelegt: .env.pruefstand"
  fi
}

# Siebte Trennung: eigene Geheimnisse. Ein Werksreset auf dem Pruefstand fasst
# sonst die echten an, und der "Fabrikzustand" traegt das Erstpasswort des
# Arbeitsgeraets als Docker-Secret mit (23.08.2026 gemessen).
#
# Als KOPIE und nicht leer: die meisten Dienste starten ohne ihr Geheimnis gar
# nicht. Wer einen Fabrikzustand will, laesst gezielt eine Datei weg — das tut
# `frischgeraet-abnahme.sh` mit `admin_password`.
eigene_geheimnisse() {
  local quelle="${WURZEL}/config/secrets"
  local ziel="${WURZEL}/config/secrets-pruefstand"
  [ -d "$ziel" ] && return 0
  mkdir -p "$ziel"
  chmod 700 "$ziel"
  cp -a "$quelle"/* "$ziel"/ 2>/dev/null || true
  echo "Eigene Geheimnisse angelegt: config/secrets-pruefstand"
}

# Ein belegter Port faellt sonst erst nach dem Bauen auf, und die Meldung von
# Docker ("Bind for 0.0.0.0:8090 failed: port is already allocated") sagt zwar
# WAS klemmt, aber nicht WER es haelt. Am 23.08.2026 war es `jetcam`, ein
# drittes Projekt auf demselben Geraet — das zu finden hat laenger gedauert als
# der ganze Bau.
#
# Container mit dem eigenen Praefix zaehlen nicht: die gehoeren zum Pruefstand
# selbst und werden gleich ersetzt.
ports_frei() {
  local fehler=0 name wert wer praefix
  # Den Praefix aus derselben Datei lesen wie die Ports. Ihn hier
  # hinzuschreiben waere eine zweite Quelle fuer dieselbe Angabe.
  praefix="$(grep -E '^CONTAINER_PREFIX=' "$UMGEBUNG" | cut -d= -f2 | tr -d ' ' || true)"
  while IFS='=' read -r name wert; do
    wert="${wert%%[!0-9]*}"
    [ -n "$wert" ] || continue
    # `|| true` ist hier Pflicht, nicht Kosmetik: findet `grep` nichts, ist der
    # Exit-Code der Zuweisung 1, und `set -e` beendet das Skript WORTLOS. Beim
    # ersten Lauf am 24.08.2026 kam genau das heraus — Rueckgabewert 1, keine
    # Zeile Ausgabe, kein Hinweis worauf. Ein freier Port ist der Normalfall,
    # also stirbt das Skript ausgerechnet dann, wenn alles in Ordnung ist.
    wer="$(docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E ":${wert}->" | cut -f1 | head -1 || true)"
    case "$wer" in
      ''|"${praefix}"*) ;;
      *) echo "  Port ${wert} (${name}) haelt bereits: ${wer}"; fehler=1 ;;
    esac
  done < <(grep -E '^[A-Z_]+_PORT=[0-9]+' "$UMGEBUNG")

  if [ "$fehler" -ne 0 ]; then
    echo ""
    echo "ABBRUCH: mindestens ein Port ist belegt."
    echo "Entweder den fremden Container anhalten oder den Port in"
    echo "${UMGEBUNG} aendern. Fremde Stacks werden hier NICHT angefasst."
    exit 3
  fi
}

case "${1:-}" in
  hoch)
    ports_frei
    eigene_env
    eigene_geheimnisse
    sicherheitsnetz
    mkdir -p data-pruefstand logs-pruefstand
    ordner_anlegen
    # Der Bau des zweiten Stacks laeuft auf DEMSELBEN Geraet wie der erste. Am
    # 23.08.2026 um 00:59 wurde n8n dabei ungesund, die Selbstheilung des
    # Produktstacks startete ihn neu, und die Kette lief bis zur
    # Neustart-Entscheidung durch. Dass das Geraet oben blieb, lag allein
    # daran, dass SELF_HEALING_REBOOT_ENABLED aus stand.
    #
    # `--build` blockiert am Stueck, kann also selbst nicht nachfassen —
    # deshalb der Herzschlag im Hintergrund. Das Fenster gilt NUR fuer den
    # ersten Stack; der Pruefstand hat keine eigene Selbstheilung.
    wartung_herzschlag_an
    compose up -d --build "${DIENSTE[@]}"
    wartung_aus   # der `trap` oben faengt den Abbruchfall, das hier den Normalfall
    ohne_gpu
    echo ""
    echo "Pruefstand laeuft. Oberflaeche: https://$(hostname):8443"
    ;;
  stand)
    compose ps
    ;;
  runter)
    compose down
    ;;
  weg)
    compose down -v
    rm -rf data-pruefstand logs-pruefstand .env.pruefstand config/secrets-pruefstand
    echo "Pruefstand und seine Daten entfernt. Der Arbeitsstand ist unberuehrt."
    ;;
  *)
    sed -n '/^#   scripts/,/^#$/p' "$0" | sed 's/^# \{0,2\}//'
    exit 1
    ;;
esac
