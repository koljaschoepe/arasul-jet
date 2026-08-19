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
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

PROJEKT="arasul-pruefstand"
UMGEBUNG="compose/pruefstand.vars"
DIENSTE=(postgres-db minio dashboard-backend dashboard-frontend reverse-proxy n8n)

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
    grep -v '\.' |
    sort -u)
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

case "${1:-}" in
  hoch)
    eigene_env
    sicherheitsnetz
    mkdir -p data-pruefstand logs-pruefstand
    ordner_anlegen
    compose up -d --build "${DIENSTE[@]}"
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
    rm -rf data-pruefstand logs-pruefstand .env.pruefstand
    echo "Pruefstand und seine Daten entfernt. Der Arbeitsstand ist unberuehrt."
    ;;
  *)
    sed -n '/^#   scripts/,/^#$/p' "$0" | sed 's/^# \{0,2\}//'
    exit 1
    ;;
esac
