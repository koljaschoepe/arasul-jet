#!/usr/bin/env bash
# Welche Laeufe wie geendet sind (Plan 023 E1).
#
# Die eine Frage, die vor E1 niemand beantworten konnte: "warum bricht der Chat
# ab". Sie war nicht schwer, sie war unbeantwortbar, weil nichts aufgeschrieben
# wurde. Dieses Skript liest die beiden Orte, an denen es jetzt steht, und legt
# sie nebeneinander.
#
#   Datenbank   bleibt. Grund, Kennung und Zeitpunkt je Job.
#   Protokoll   rollt weg, traegt dafuer das Detail und die Quelle im Code.
#
# Auf dem Geraet aufrufen:  ./scripts/util/abbrueche.sh [Stunden]
# Von aussen:               ssh jetson 'cd /home/arasul/arasul/arasul-jet && ./scripts/util/abbrueche.sh'

set -euo pipefail
STUNDEN="${1:-24}"

echo "== Abbrueche der letzten ${STUNDEN} Stunden, aus der Datenbank =="
docker exec postgres-db psql -U arasul -d arasul_db -P pager=off -c "
  SELECT abbruch_grund AS grund,
         count(*)      AS anzahl,
         max(abbruch_am) AS zuletzt
    FROM public.llm_jobs
   WHERE abbruch_am > NOW() - INTERVAL '${STUNDEN} hours'
   GROUP BY 1
   ORDER BY 2 DESC;"

echo "== Die einzelnen Laeufe =="
docker exec postgres-db psql -U arasul -d arasul_db -P pager=off -c "
  SELECT abbruch_kennung AS kennung,
         abbruch_grund   AS grund,
         requested_model AS modell,
         left(coalesce(abbruch_detail,''), 70) AS detail,
         abbruch_am      AS wann
    FROM public.llm_jobs
   WHERE abbruch_am > NOW() - INTERVAL '${STUNDEN} hours'
   ORDER BY abbruch_am DESC
   LIMIT 40;"

echo "== Dieselben Faelle im Protokoll, mit Quelle im Code =="
docker logs dashboard-backend --since "${STUNDEN}h" 2>&1 | grep -F '[ABBRUCH]' | tail -40 || echo "(keine)"

echo "== Wartezeit auf das erste Zeichen, gegen die Grenze =="
# Die Zahl, an der sich entscheidet, ob ein stiller Strom ein totes Modell war
# oder ein zu knapp gesetztes Zeitlimit. Steht nur im Protokoll, nicht in der
# Datenbank: sie faellt bei JEDER Runde an, auch bei den gelungenen.
docker logs dashboard-backend --since "${STUNDEN}h" 2>&1 | grep -F '[VORLAUF]' | tail -20 || echo "(keine)"

echo "== Werkzeugfehler =="
docker logs dashboard-backend --since "${STUNDEN}h" 2>&1 | grep -F '[WERKZEUGFEHLER]' | tail -20 || echo "(keine)"
