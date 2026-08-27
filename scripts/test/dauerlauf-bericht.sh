#!/bin/bash
# ============================================================================
# dauerlauf-bericht.sh — die Beweislage fuer Gate G7 (sieben Tage
# unbeaufsichtigt), aus dem laufenden Geraet gelesen.
#
# G7 fragt nicht "laeuft es gerade", sondern "lief es sieben Tage ohne dass
# jemand eingreifen musste". Das ist keine Momentaufnahme, sondern eine
# Zeitreihe, und sie entsteht nur, wenn man rechtzeitig anfaengt zu messen.
#
# Fuenf Fragen, fuenf Quellen:
#
#   1. Ist ueberhaupt alles da?                  Die zwoelf Dienste aus
#      `docker-compose.yml` plus die App-Container, die das Backend selbst
#      anlegt. Bis zum 27.08.2026 fehlte diese Frage, und gezaehlt wurde, was
#      `docker ps` zeigt -- ein Dienst, der weg ist, taucht dort nicht auf. Ein
#      Geraet mit acht statt zwoelf Containern meldete "geprueft: 8 Dienste,
#      keiner musste neu starten" und sah damit gruen aus.
#   2. Musste ein Dienst neu gestartet werden?   Dockers RestartCount.
#      Ein `docker compose up` beim Deploy zaehlt NICHT mit — RestartCount
#      steigt nur, wenn Docker selbst neu startet, also nach einem Absturz.
#      Genau das ist die Frage.
#   3. Musste sich das Geraet selbst heilen?     self_healing_events.
#   4. Hat es weiter gesichert, und liegt eine Kopie ausser Haus?
#      Die vier Arten von Sicherung (Datenbank, App-Pakete, Flows,
#      Konfiguration), der Merker der Kopie ausserhalb und der letzte
#      Wiederherstellungstest.
#   5. Lief die Messung durch?                   Luecken in metrics_cpu. Eine
#      Luecke heisst: entweder war das Geraet weg, oder der Sammler war es.
#      Beides zaehlt gegen G7.
#
# Aufruf:  bash scripts/test/dauerlauf-bericht.sh [tage]
# Vorgabe: 7 Tage. SSH-Ziel ueber ARASUL_SSH, Vorgabe "jetson".
# ============================================================================
set -uo pipefail

HOST="${ARASUL_SSH:-jetson}"
TAGE="${1:-7}"
REPO="/home/arasul/arasul/arasul-jet"

# Die Zeitzone des GERAETS, aus dem Geraet gelesen und nicht hier
# hingeschrieben. Postgres laeuft im Container mit UTC, das Geraet steht auf
# Europe/Berlin. Der Bericht gab deshalb Zeiten aus, die zwei Stunden in der
# Vergangenheit zu liegen schienen: "Zeitraum bis 23.08. 22:17", waehrend auf
# dem Geraet 00:17 war. Wer das liest, haelt die Messreihe fuer abgerissen —
# am 24.08.2026 genau so passiert, und ich habe erst nachgemessen, bevor ich
# es geglaubt habe.
GERAETE_TZ="$(ssh -n "$HOST" "cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value 2>/dev/null" 2>/dev/null | head -1)"
GERAETE_TZ="${GERAETE_TZ:-UTC}"

# `-n` ist Pflicht: ohne das liest ssh die Standardeingabe mit auf, und eine
# `while read`-Schleife um einen sql-Aufruf herum endet nach dem ersten
# Eintrag. Genau dieser Fehler steckte in der Souveraenitaets-Abnahme und hat
# dort monatelang dafuer gesorgt, dass nur EIN Ziel geprueft wurde.
# Die Zone kommt ueber PGOPTIONS und nicht als `SET TIME ZONE` vor der
# Abfrage: psql gibt fuer SET die Zeile "SET" aus, auch mit `-t -A`. Die
# landete beim ersten Versuch mitten in der Auswertung ("Messpunkte: SET").
sql() {
  ssh -n "$HOST" "docker exec -e PGOPTIONS='-c timezone=${GERAETE_TZ}' postgres-db psql -U arasul -d arasul_db -t -A -F'|' -c \"$1\"" 2>/dev/null
}

echo "=== Dauerlauf-Bericht, letzte ${TAGE} Tage ==="
echo "Gelesen am: $(date '+%Y-%m-%d %H:%M %Z')  (Zeiten unten in ${GERAETE_TZ})"
echo ""

# --- 0. Die eigentliche G7-Zahl ---------------------------------------------
# Wie lange laeuft das Geraet am Stueck? Alles andere in diesem Bericht ist
# Beiwerk, wenn diese Zahl unter sieben Tagen liegt.
LAUFZEIT=$(ssh "$HOST" "cat /proc/uptime" 2>/dev/null | cut -d' ' -f1 | cut -d. -f1)
BOOT_EPOCH=$(( $(date +%s) - ${LAUFZEIT:-0} ))
TAGE_AM_STUECK=$(( ${LAUFZEIT:-0} / 86400 ))
echo "--- Laufzeit am Stueck ---"
echo "  ${TAGE_AM_STUECK} Tage ($(( ${LAUFZEIT:-0} / 3600 )) Stunden)"
echo "  letzter Neustart: $(date -r "$BOOT_EPOCH" '+%d.%m. %H:%M' 2>/dev/null || date -d "@$BOOT_EPOCH" '+%d.%m. %H:%M' 2>/dev/null)"
if [ "$TAGE_AM_STUECK" -lt 7 ]; then
  echo "  G7 verlangt sieben Tage. Noch $(( 7 - TAGE_AM_STUECK )) Tage."
fi
echo ""

# --- 1. Die Dienste, die da sein muessen ------------------------------------
# ZWEI Fragen, und bis zum 27.08.2026 stellte dieser Bericht nur die zweite:
#
#   a) LAEUFT ueberhaupt alles? Gezaehlt wurde vorher, was `docker ps` zeigt --
#      und ein Dienst, der weg ist, taucht dort nicht auf. Ein Geraet mit acht
#      statt zwoelf Containern meldete "geprueft: 8 Dienste, keiner musste neu
#      starten" und sah damit gruen aus. Deshalb steht die Soll-Liste jetzt
#      HIER, und es wird gegen sie gezaehlt.
#   b) Musste einer von selbst neu starten? Dockers RestartCount.
#
# Die zwoelf sind die aus `docker-compose.yml` (`compose/compose.*.yaml`).
# `cloudflared` laeuft nur mit dem Profil `tunnel` und fehlt auf einem Geraet
# ohne Fernzugriff zu Recht -- es steht deshalb getrennt.
#
# Dazu die APP-CONTAINER. Sie stehen in keiner Compose-Datei: das Backend legt
# sie an, je App und Stand: `arasul-app-<id>-<stand>`
# (`services/app/appContainer.js`, `containerName`).
# Fuer G7 zaehlen sie mit -- eine App, die jede Nacht abstuerzt und neu
# startet, ist kein unbeaufsichtigter Betrieb.
#
# Der Pruefstand (pruef-*) ist ein zweiter Stack fuer Abnahmen und gehoert
# nicht zum Produkt. Er wird ausgeblendet, sonst faelscht er das Bild.
SOLL_DIENSTE="postgres-db docker-proxy reverse-proxy llm-service embedding-service document-indexer dashboard-backend dashboard-frontend metrics-collector self-healing-agent backup-service"
SOLL_MIT_PROFIL="cloudflared"

echo "--- Die Dienste ---"
LAUFEN=$(ssh -n "$HOST" "docker ps --format '{{.Names}}' | grep -v '^pruef-'" 2>/dev/null)
FEHLEN=""
for dienst in $SOLL_DIENSTE; do
  if ! grep -qx "$dienst" <<<"$LAUFEN"; then
    FEHLEN="${FEHLEN} ${dienst}"
  fi
done
ANZ_SOLL=$(echo "$SOLL_DIENSTE" | wc -w | tr -d ' ')
echo "  von ${ANZ_SOLL} erwarteten laufen: $(( ANZ_SOLL - $(echo "$FEHLEN" | wc -w | tr -d ' ') ))"
if [ -n "$FEHLEN" ]; then
  echo "  ACHTUNG, es fehlen:${FEHLEN}"
fi
for dienst in $SOLL_MIT_PROFIL; do
  if grep -qx "$dienst" <<<"$LAUFEN"; then
    echo "  ${dienst}: laeuft (Profil tunnel)"
  else
    echo "  ${dienst}: nicht gestartet (Profil tunnel, ohne Fernzugriff richtig so)"
  fi
done

# Die App-Container: was das Backend selbst angelegt hat.
APPS=$(grep '^arasul-app-' <<<"$LAUFEN" || true)
if [ -n "$APPS" ]; then
  echo "  App-Container: $(echo "$APPS" | wc -l | tr -d ' ') ($(echo "$APPS" | tr '\n' ' '))"
else
  echo "  App-Container: keiner"
fi
echo ""

echo "--- Dienste, die von selbst neu starten mussten ---"
# Ein `docker compose up` beim Deploy zaehlt NICHT mit: RestartCount steigt nur,
# wenn Docker selbst neu startet, also nach einem Absturz. Genau das ist die
# Frage.
NEUSTARTS=$(ssh -n "$HOST" "docker inspect \$(docker ps --format '{{.Names}}' | grep -v '^pruef-') --format '{{.Name}} {{.RestartCount}}' 2>/dev/null | sed 's|^/||'" 2>/dev/null)
SCHLECHT=$(echo "$NEUSTARTS" | awk '$2 > 0 {print "  " $1 ": " $2 " Neustart(s)"}')
if [ -z "$SCHLECHT" ]; then
  echo "  keiner (das ist die gute Antwort)"
else
  echo "$SCHLECHT"
fi
ANZ_DIENSTE=$(echo "$NEUSTARTS" | grep -c . )
echo "  geprueft: ${ANZ_DIENSTE} laufende Container"
echo ""

# --- 2. Selbstheilung ------------------------------------------------------
echo "--- Selbstheilung ---"
HEIL=$(sql "SELECT count(*), count(*) FILTER (WHERE success IS NOT TRUE) FROM public.self_healing_events WHERE timestamp > now() - interval '${TAGE} days';")
GESAMT="${HEIL%%|*}"; MISS="${HEIL##*|}"
echo "  in ${TAGE} Tagen: ${GESAMT:-0} Eingriffe, davon fehlgeschlagen: ${MISS:-0}"

# Das Urteil haengt am DAUERLAUF, nicht an sieben Kalendertagen. G7 fragt: seit
# dem letzten Neustart, musste jemand eingreifen? Ereignisse von davor gehoeren
# zu einem anderen Lauf und wuerden den Bericht auf immer rot halten
# (23.08.2026).
SEIT_BOOT=$(sql "SELECT count(*), count(*) FILTER (WHERE success IS NOT TRUE) FROM public.self_healing_events WHERE timestamp > to_timestamp(${BOOT_EPOCH});")
GESAMT_B="${SEIT_BOOT%%|*}"; MISS_B="${SEIT_BOOT##*|}"
echo "  seit dem letzten Neustart: ${GESAMT_B:-0} Eingriffe, davon fehlgeschlagen: ${MISS_B:-0}"
if [ "${MISS_B:-0}" -gt 0 ]; then
  echo "  die fehlgeschlagenen:"
  sql "SELECT to_char(timestamp,'DD.MM. HH24:MI')||' '||coalesce(service_name,'-')||' '||action_taken FROM public.self_healing_events WHERE timestamp > to_timestamp(${BOOT_EPOCH}) AND success IS NOT TRUE ORDER BY timestamp DESC LIMIT 5;" | sed 's/^/    /'

  # Steht der letzte Fehlschlag VOR dem Start des jetzt laufenden
  # Selbstheilungs-Agenten, dann hat die aktuelle Fassung ihn nicht verursacht.
  # Das aendert das Urteil NICHT — G7 fragt nach dem ganzen Dauerlauf, nicht
  # nach der neuesten Fassung. Aber wer den Bericht liest, muss sehen koennen,
  # ob das Problem noch besteht oder abgestellt ist.
  #
  # Grund fuer die Zeile, 23.08.2026: die fuenf Fehlschlaege der Nacht kamen
  # alle aus derselben Ursache (ein Deploy sah aus wie ein Ausfall, #570), und
  # nach dem Fix ist keiner mehr dazugekommen. Ohne diese Zeile liest sich der
  # Bericht in zwei Tagen so, als waere das noch offen.
  LETZTER=$(sql "SELECT extract(epoch FROM max(timestamp))::bigint FROM public.self_healing_events WHERE timestamp > to_timestamp(${BOOT_EPOCH}) AND success IS NOT TRUE;")
  AGENT_START=$(ssh "$HOST" "docker inspect self-healing-agent --format '{{.State.StartedAt}}'" 2>/dev/null)
  AGENT_EPOCH=$(ssh "$HOST" "date -d '${AGENT_START}' +%s" 2>/dev/null)
  if [ -n "${LETZTER:-}" ] && [ -n "${AGENT_EPOCH:-}" ] && [ "${LETZTER}" -lt "${AGENT_EPOCH}" ]; then
    STUNDEN=$(( ( $(date +%s) - LETZTER ) / 3600 ))
    echo "  Hinweis: der letzte Fehlschlag liegt ${STUNDEN} h zurueck und damit VOR"
    echo "           dem Start des jetzigen Agenten. Seither keiner mehr."
  fi
fi
sql "SELECT to_char(timestamp,'DD.MM. HH24:MI')||' '||coalesce(service_name,'-')||' '||action_taken||' ('||severity||')' FROM public.self_healing_events WHERE timestamp > now() - interval '${TAGE} days' ORDER BY timestamp DESC LIMIT 5;" | sed 's/^/  /'
echo ""

# --- 3. Sicherungen --------------------------------------------------------
# Seit Phase C9 sind es vier Arten, und drei davon fehlten hier: die Pakete der
# Apps, die Flow-Dateien, die Konfiguration. Ein Bericht, der nur die Datenbank
# zaehlt, sagt ueber die Wiederherstellbarkeit eines Geraets wenig -- die
# Datenbank nennt Apps, deren Dateien in keinem Archiv stehen.
echo "--- Sicherungen ---"
for art in postgres apps flows config; do
  ZEILE=$(ssh -n "$HOST" "ls -1t ${REPO}/data/backups/${art} 2>/dev/null | grep -v latest | head -1" 2>/dev/null)
  ANZ=$(ssh -n "$HOST" "ls -1 ${REPO}/data/backups/${art} 2>/dev/null | grep -v latest | wc -l" 2>/dev/null)
  printf '  %-9s %s\n' "$art" "${ZEILE:-(keine)}${ZEILE:+  (${ANZ// /} Stueck)}"
done

# Die Kopie AUSSERHALB des Geraets. Sie ist der einzige Teil der Sicherung, der
# einen Plattenausfall ueberlebt -- und der einzige, den ein Mensch vergessen
# kann (Stick abgezogen und nicht wieder angesteckt).
EXTERN=$(ssh -n "$HOST" "cat ${REPO}/data/backups/extern_bericht.json 2>/dev/null" 2>/dev/null)
if [ -n "$EXTERN" ]; then
  echo "  ausserhalb: $(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("zeitpunkt","?"), d.get("bytes",0), "Bytes,", d.get("dateien",0), "Dateien")' <<<"$EXTERN" 2>/dev/null)"
else
  echo "  ausserhalb: noch nie eine Kopie (kein Datentraeger angesteckt?)"
fi

# Der Wiederherstellungstest. Er laeuft woechentlich; steht hier nichts, ist
# noch nie einer gelaufen -- und dann ist ueber die Sicherungen oben nichts
# bewiesen ausser, dass es sie gibt.
DRILL=$(ssh -n "$HOST" "cat ${REPO}/data/backups/restore_drill_report.json 2>/dev/null" 2>/dev/null)
if [ -n "$DRILL" ]; then
  echo "  Wiederherstellungstest: $(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status","?"), d.get("timestamp",""), "-", d.get("detail",""))' <<<"$DRILL" 2>/dev/null)"
else
  echo "  Wiederherstellungstest: nie gelaufen"
fi
echo ""

# --- 4. Luecken in der Messreihe -------------------------------------------
echo "--- Luecken in der Messreihe (metrics_cpu) ---"
LUECKE=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*), coalesce(max(extract(epoch FROM timestamp - vorher))::int, 0) FROM t WHERE vorher IS NOT NULL;")
PUNKTE="${LUECKE%%|*}"; MAXL="${LUECKE##*|}"
echo "  Messpunkte: ${PUNKTE:-0}"
echo "  groesste Luecke: ${MAXL:-0} s"

# Eine Luecke, in der das Geraet neu gestartet ist, ist erklaert. Ohne diese
# Unterscheidung stand der Bericht dauerhaft auf ROT wegen eines Neustarts vom
# 19.08.2026, den man an der Laufzeit oben ohnehin sieht (23.08.2026).
LUECKE_UNERKLAERT=0
if [ "${MAXL:-0}" -gt 900 ]; then
  UEBER_BOOT=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*) FROM t WHERE extract(epoch FROM timestamp - vorher) > 900 AND to_timestamp(${BOOT_EPOCH}) BETWEEN vorher - interval '5 minutes' AND timestamp + interval '5 minutes';")
  ALLE_GROSS=$(sql "WITH t AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS vorher FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days') SELECT count(*) FROM t WHERE extract(epoch FROM timestamp - vorher) > 900;")
  LUECKE_UNERKLAERT=$(( ${ALLE_GROSS:-0} - ${UEBER_BOOT:-0} ))
  echo "  Luecken ueber 15 min: ${ALLE_GROSS:-0}, davon durch den Neustart erklaert: ${UEBER_BOOT:-0}"
  if [ "$LUECKE_UNERKLAERT" -gt 0 ]; then
    echo "  ACHTUNG: ${LUECKE_UNERKLAERT} unerklaerte Luecke(n). Entweder war das"
    echo "  Geraet weg oder der Sammler. Beides zaehlt gegen G7."
  fi
fi
sql "SELECT to_char(min(timestamp),'DD.MM. HH24:MI')||' bis '||to_char(max(timestamp),'DD.MM. HH24:MI') FROM public.metrics_cpu WHERE timestamp > now() - interval '${TAGE} days';" | sed 's/^/  Zeitraum: /'
echo ""

# --- Urteil ----------------------------------------------------------------
echo "--- Urteil ---"
ROT=0
[ -n "$FEHLEN" ] && { echo "  ROT: es fehlen Dienste:${FEHLEN}"; ROT=1; }
[ -n "$SCHLECHT" ] && { echo "  ROT: mindestens ein Dienst musste neu starten"; ROT=1; }
[ "${MISS_B:-0}" -gt 0 ] && { echo "  ROT: seit dem Neustart ist eine Selbstheilung fehlgeschlagen"; ROT=1; }
[ "${LUECKE_UNERKLAERT:-0}" -gt 0 ] && { echo "  ROT: die Messreihe hat eine unerklaerte Luecke"; ROT=1; }
if [ "$ROT" = "0" ]; then
  echo "  Nichts Rotes in diesem Zeitraum."
  if [ "$TAGE_AM_STUECK" -ge 7 ]; then
    echo "  GRUEN fuer G7: sieben Tage am Stueck, ohne Eingriff."
  else
    echo "  NOCH NICHT GRUEN fuer G7: das Geraet laeuft erst ${TAGE_AM_STUECK} Tage am Stueck."
  fi
fi
exit "$ROT"
