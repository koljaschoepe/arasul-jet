#!/bin/bash
# =============================================================================
# Beobachtet ueber Stunden, ob ein Container nach draussen verbindet
# =============================================================================
# Die Souveraenitaets-Abnahme (`souveraenitaet-abnahme.sh`) misst waehrend EINES
# Laufs der Kernkette, also ein paar Minuten. Fuer einen seltenen Fall reicht
# das nicht.
#
# Der Anlass, 23.08.2026: `llm-service` hielt einmal rund eine Minute lang eine
# Verbindung zu `ollama.com`. Danach vier Versuche, es zu wiederholen — im
# Leerlauf, ueber drei Ollama-Endpunkte, mit einem zweiten Lauf der Kernkette
# und zwei Stunden Beobachtung. Viermal nichts. Vier negative Ergebnisse sind
# kein Beweis, dass es nicht passiert; sie zeigen nur, dass es selten ist.
#
# Warum als Skript im Repo und nicht als Befehlszeile: der erste Lauscher lag
# in /tmp und war nur mir bekannt. Ein Beobachter, den niemand starten und
# niemand auslesen kann, ist keine Messung, sondern eine Erinnerung.
#
# Das Protokoll liegt unter `logs/` und damit im Bind-Mount des Geraets: es
# ueberlebt einen Neustart des Containers UND des Geraets.
#
# Aufruf:
#   scripts/test/ausgang-lauscher.sh hoch [container] [stunden]   Vorgabe: llm-service 24
#   scripts/test/ausgang-lauscher.sh stand [container]            was bisher gesehen wurde
#   scripts/test/ausgang-lauscher.sh weg [container]              anhalten
#
# Gegenprobe, bevor man einem leeren Protokoll glaubt (das kostet eine Minute
# und haette am 23.08.2026 einen blinden Lauscher sofort entlarvt):
#
#   scripts/test/ausgang-lauscher.sh hoch searxng 1
#   ssh jetson "docker exec dashboard-backend sh -c 'wget -qO- \
#     \"http://searxng:8080/search?q=berlin&format=json\" >/dev/null'"
#   scripts/test/ausgang-lauscher.sh stand searxng    # muss Treffer zeigen
#
# `state connected` und nicht `state established`: eine halb geschlossene
# Verbindung (CLOSE-WAIT) ist der Beweis, dass gesprochen WURDE. Genau daran
# ist die Abnahme am 23.08. vorbeigelaufen.
# =============================================================================
set -uo pipefail

HOST="${ARASUL_SSH:-jetson}"
FERN="${ARASUL_GERAET_PFAD:-/home/arasul/arasul/arasul-jet}"
CONTAINER="${2:-llm-service}"
STUNDEN="${3:-24}"
PROTOKOLL="${FERN}/logs/ausgang-${CONTAINER}.log"
LAEUFER="/tmp/ausgang-lauscher-${CONTAINER}.sh"
# PID-Datei und nicht `pgrep -f`: das Muster steht in der eigenen ssh-Zeile,
# also findet pgrep sich selbst und meldet "laeuft bereits", obwohl nichts
# laeuft. Am 23.08.2026 beim ersten Aufruf genau so passiert.
PIDDATEI="/tmp/ausgang-lauscher-${CONTAINER}.pid"

case "${1:-}" in
  hoch)
    # Ein zweiter Lauscher auf denselben Container waere kein Fehler, aber die
    # doppelten Zeilen verwirren beim Auswerten mehr, als sie nuetzen.
    if ssh -n "$HOST" "test -f ${PIDDATEI} && kill -0 \$(cat ${PIDDATEI}) 2>/dev/null"; then
      echo "Laeuft bereits fuer ${CONTAINER}. Stand:  $0 stand ${CONTAINER}"
      exit 0
    fi
    # HIER ohne `-n`: das Skript kommt ueber die Standardeingabe, und `-n`
    # leitet die von /dev/null. Beim ersten Versuch landete deshalb eine LEERE
    # Datei auf dem Geraet, der Lauscher endete sofort, und die PID-Datei zeigte
    # auf einen toten Prozess (23.08.2026). Ueberall sonst bleibt `-n` Pflicht:
    # in einer Schleife liest ssh sonst deren Eingabe mit auf.
    ssh "$HOST" "cat > ${LAEUFER}" <<FERNSKRIPT
#!/bin/bash
AUS="${PROTOKOLL}"
mkdir -p "\$(dirname "\$AUS")"
echo "START \$(date '+%d.%m. %H:%M:%S') container=${CONTAINER} stunden=${STUNDEN}" >> "\$AUS"
ENDE=\$(( \$(date +%s) + ${STUNDEN} * 3600 ))
while [ \$(date +%s) -lt \$ENDE ]; do
  PID=\$(docker inspect -f '{{.State.Pid}}' ${CONTAINER} 2>/dev/null)
  if [ -n "\$PID" ] && [ "\$PID" != "0" ]; then
    # NUR die Gegenstelle pruefen, nicht die ganze Zeile. Der erste Wurf hatte
    # hier ein grep ueber die GANZE Zeile, und die lokale Adresse jedes
    # Containers liegt im Bereich 172.30.x — also flog jede Zeile raus, und der
    # Lauscher meldete stundenlang "keine einzige Verbindung nach draussen",
    # waehrend nebenan Verbindungen offen standen. Am 23.08.2026 mit einer
    # ausgeloesten Websuche nachgewiesen: `ss` zeigte ESTAB nach 142.250.181.238,
    # der Lauscher zeigte nichts.
    #
    # Ein Beobachter, der nie etwas sieht, ist von einem Beobachter, der nichts
    # zu sehen bekommt, nicht zu unterscheiden. Deshalb steht in der Anleitung
    # jetzt auch, wie man ihn gegenprueft.
    sudo -n nsenter -t \$PID -n ss -tn state connected 2>/dev/null \
      | tail -n +2 \
      | awk -v t="\$(date '+%d.%m. %H:%M:%S')" '
          NF>=5 {
            peer=\$5
            sub(/^\[::ffff:/,"",peer); sub(/\]/,"",peer)
            n=split(peer,a,":"); ip=a[1]
            if (ip=="" || ip=="*") next
            if (ip ~ /^127\./ || ip ~ /^10\./ || ip ~ /^192\.168\./ || ip ~ /^169\.254\./) next
            if (ip ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) next
            if (ip ~ /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./) next
            if (ip ~ /^::1$/ || ip ~ /^fe80/ || ip ~ /^f[cd]/ || ip=="[") next
            print t, \$1, \$5
          }' >> "\$AUS"
  fi
  sleep 20
done
echo "ENDE \$(date '+%d.%m. %H:%M:%S')" >> "\$AUS"
FERNSKRIPT
    ssh -n "$HOST" "chmod +x ${LAEUFER} && nohup ${LAEUFER} >/dev/null 2>&1 & echo \$! > ${PIDDATEI}; sleep 2"
    echo "Lauscher laeuft ${STUNDEN} h fuer ${CONTAINER}."
    echo "Protokoll: ${PROTOKOLL}  (im Bind-Mount, ueberlebt einen Neustart)"
    echo "Stand ansehen:  $0 stand ${CONTAINER}"
    ;;

  stand)
    if ! ssh -n "$HOST" "test -f ${PROTOKOLL}"; then
      echo "Kein Protokoll fuer ${CONTAINER}. Erst:  $0 hoch ${CONTAINER}"
      exit 1
    fi
    laeuft=$(ssh -n "$HOST" "test -f ${PIDDATEI} && kill -0 \$(cat ${PIDDATEI}) 2>/dev/null && echo ja || echo nein")
    echo "=== Ausgang-Lauscher, ${CONTAINER} ==="
    # NUR den laufenden Abschnitt zeigen, also ab dem letzten START. Das
    # Protokoll ueberlebt jeden Neustart und sammelt deshalb alte Laeufe an.
    # Am 24.08.2026 stand hier "ENDE 23.08. 22:32" direkt ueber "laeuft
    # gerade: ja" — das ENDE gehoerte zu einem Lauscher, der laengst
    # abgeloest war, und der Widerspruch hat mich erst einmal suchen lassen.
    # Den letzten START zeigen, nicht die letzte START-oder-ENDE-Zeile: ein
    # abgeloester Lauscher schreibt sein ENDE, NACHDEM der neue schon gestartet
    # ist, und `tail -1` erwischt dann genau das falsche.
    ssh -n "$HOST" "grep -E '^START' ${PROTOKOLL} | tail -1" | sed 's/^/  /'
    if [ "$laeuft" = "nein" ]; then
      ssh -n "$HOST" "grep -E '^ENDE' ${PROTOKOLL} | tail -1" | sed 's/^/  /'
    fi
    frueher=$(ssh -n "$HOST" "grep -cE '^START' ${PROTOKOLL}" | tr -d ' ')
    if [ "${frueher:-1}" -gt 1 ]; then
      echo "  Hinweis: $((frueher - 1)) abgeloeste(r) Lauf im selben Protokoll,"
      echo "  die Zeilen unten koennen also aus mehreren Laeufen stammen."
    fi
    echo "  laeuft gerade: ${laeuft}"
    echo ""
    treffer=$(ssh -n "$HOST" "grep -cvE '^(START|ENDE)' ${PROTOKOLL} 2>/dev/null" | tr -d ' ')
    if [ "${treffer:-0}" = "0" ]; then
      echo "  Keine einzige Verbindung nach draussen."
      exit 0
    fi
    echo "  ${treffer} Zeilen mit einer Verbindung nach draussen:"
    # Je Ziel eine Zeile, mit Namen. `ssh -n` in der Schleife ist Pflicht: ohne
    # das liest ssh die Eingabe mit auf und die Schleife endet nach dem ersten
    # Eintrag (am 23.08.2026 genau so in der Souveraenitaets-Abnahme gefunden).
    # Eine Protokollzeile sieht so aus:  23.08. 21:32:03 ESTAB 185.15.59.224:443
    # Also: $1 Datum, $2 Uhrzeit, $3 Zustand, $4 Gegenstelle. Beim ersten Wurf
    # stand hier $4,$5 — $5 ist leer, und `getent hosts ""` antwortet mit
    # "localhost". Jedes Ziel hiess deshalb localhost (23.08.2026).
    ssh -n "$HOST" "grep -vE '^(START|ENDE)' ${PROTOKOLL} | awk '{print \$3, \$4}' | sort | uniq -c | sort -rn | head -20" |
      while IFS= read -r zeile; do
        ip=$(printf '%s' "$zeile" | awk '{print $3}' | sed 's/:[0-9]*$//' | tr -d '[]')
        name=$(ssh -n "$HOST" "getent hosts ${ip} 2>/dev/null | awk '{print \$2}'" | head -1)
        echo "    ${zeile}  ${name:-}"
      done
    echo ""
    echo "  Erste und letzte Beobachtung dieses Ziels:"
    ssh -n "$HOST" "grep -vE '^(START|ENDE)' ${PROTOKOLL} | head -1; grep -vE '^(START|ENDE)' ${PROTOKOLL} | tail -1" | sed 's/^/    /'
    ;;

  weg)
    ssh -n "$HOST" "test -f ${PIDDATEI} && kill \$(cat ${PIDDATEI}) 2>/dev/null && rm -f ${PIDDATEI} && echo angehalten || echo 'lief nicht'"
    echo "Das Protokoll bleibt liegen: ${PROTOKOLL}"
    ;;

  *)
    sed -n '/^# Aufruf:/,/^# =\{10,\}$/p' "$0" | sed 's/^# \{0,2\}//'
    exit 1
    ;;
esac
