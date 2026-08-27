#!/bin/bash
# =============================================================================
# dr-drill.sh — sichern, loeschen, wiederherstellen (Abnahme A6)
# =============================================================================
# DIESES SKRIPT LOESCHT. Es ist der zerstoerende Teil der Betriebs-Abnahme und
# laeuft AM GERAET, nicht ueber die Schnittstelle: es nimmt der Datenbank ihre
# Zeilen, den Apps ihre Pakete und ihre Images weg und laesst danach den Weg
# zurueck den Beweis antreten.
#
# Die Frage, die es beantwortet, ist die einzige, die bei einer Sicherung
# zaehlt: BEKOMMT DER KUNDE SEINE SACHEN WIEDER? Nicht "gibt es Dateien" und
# nicht "laesst sich irgendetwas einspielen", sondern: laeuft die Beispielapp
# danach wieder, und ist ihr Flow wieder da?
#
# WARUM ER AM GERAET LOESCHT UND NICHT ÜBER DIE API. Der Weg ueber die
# Schnittstelle (`scripts/test/betrieb-abnahme.sh`) kann sichern, auflisten und
# wiederherstellen -- aber er kann nicht glaubhaft LOESCHEN. Eine
# Wiederherstellung auf ein Geraet, dem nichts fehlt, beweist nichts: sie
# koennte jeden ihrer Schritte ueberspringen und saehe gleich aus. Erst der
# Verlust macht die Rueckkehr zu einer Aussage.
#
# GEGEN WELCHEN STACK. Voreinstellung ist der PRUEFSTAND
# (`compose/pruefstand.vars`, Praefix `pruef-`), nicht der Betrieb. Wer den
# Betrieb meint, sagt es ausdruecklich:
#
#   bash scripts/test/dr-drill.sh                    # Pruefstand
#   ARASUL_STACK=betrieb bash scripts/test/dr-drill.sh
#
# Vorher steht nichts von selbst bereit: dieses Skript verlangt, dass eine App
# eingespielt und live geschaltet ist (`scripts/test/beispielapp.sh` oder
# `apps-abnahme.sh`), sonst hat der Drill keinen Gegenstand und sagt das.
#
# Rueckgabe 0, wenn nach der Wiederherstellung alles wieder da ist, sonst 1.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL" || exit 1

STACK="${ARASUL_STACK:-pruefstand}"
if [ "$STACK" = "betrieb" ]; then
    PREFIX=""
    DATEN="${WURZEL}/data"
else
    PREFIX="pruef-"
    DATEN="${WURZEL}/data-pruefstand"
fi
PG="${PREFIX}postgres-db"
SICHERUNG="${PREFIX}backup-service"
BACKEND="${PREFIX}dashboard-backend"
SICHERUNGSORDNER="${DATEN}/backups"

APP="${ARASUL_DRILL_APP:-beispielapp}"

gruen=0
rot=0
pruefe() {
    local was="$1" ok="$2" detail="${3:-}"
    if [ "$ok" = "ja" ]; then
        gruen=$((gruen + 1))
        printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
    else
        rot=$((rot + 1))
        printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
    fi
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

sql() {
    docker exec "$PG" psql -U arasul -d arasul_db -tAc "$1" 2>/dev/null | tr -d ' \r'
}

echo "=== Drill: sichern, loeschen, wiederherstellen (Stack: ${STACK}) ==="
echo

# --- 0. Steht ueberhaupt etwas zum Verlieren da? -----------------------------
if ! docker ps --format '{{.Names}}' | grep -qx "$PG"; then
    echo "Kein ${PG}. Erst den Stack hochfahren."
    exit 1
fi

APP_ZEILEN=$(sql "SELECT count(*) FROM public.app_staende WHERE app_id = '${APP}'")
if [ "${APP_ZEILEN:-0}" = "0" ]; then
    echo "Die App '${APP}' ist an diesem Stack nicht eingespielt."
    echo "Ohne sie hat der Drill keinen Gegenstand: er wuerde beweisen, dass"
    echo "nichts wiederkommt, was nie da war."
    echo "  bash scripts/test/beispielapp.sh   (oder apps-abnahme.sh)"
    exit 1
fi

VORHER_NUTZER=$(sql "SELECT count(*) FROM public.admin_users")
VORHER_APPS=$(sql "SELECT count(*) FROM public.apps")
VORHER_FREIGABEN=$(sql "SELECT count(*) FROM public.app_members")
VORHER_FLOWS=$(sql "SELECT count(*) FROM public.app_flows")
VORHER_LAEUFE=$(sql "SELECT count(*) FROM arasul.flow_runs")
VORHER_EINSTELLUNGEN=$(sql "SELECT count(*) FROM public.flow_settings")
echo "Vorher: ${VORHER_NUTZER} Nutzer, ${VORHER_APPS} Apps, ${VORHER_FREIGABEN} Freigaben,"
echo "        ${VORHER_FLOWS} App-Flows, ${VORHER_LAEUFE} Laeufe, ${VORHER_EINSTELLUNGEN} Modell-Ueberschreibungen"
echo

if [ "${ARASUL_DRILL_JA:-}" != "ja" ]; then
    printf 'Das loescht die Daten dieses Stacks. Zum Fortfahren LOESCHEN tippen: '
    read -r antwort
    [ "$antwort" = "LOESCHEN" ] || { echo "Abgebrochen."; exit 0; }
fi

# --- 1. Sichern --------------------------------------------------------------
echo "--- 1. Sichern ---"
if docker exec "$SICHERUNG" /usr/local/bin/backup.sh > /tmp/drill-sicherung.log 2>&1; then
    pruefe 'Sicherung gelaufen' ja
else
    pruefe 'Sicherung gelaufen' nein "$(tail -3 /tmp/drill-sicherung.log | tr '\n' ' ')"
    echo "Ohne Sicherung kein Drill."
    exit 1
fi

for art in postgres apps flows config; do
    # `arasul_db_latest.sql.gz` beim Abzug, `<art>_latest.tar.gz` bei den
    # Archiven -- der Zeiger heisst nicht ueberall gleich, deshalb gesucht
    # statt geraten.
    zeiger=$(find "${SICHERUNGSORDNER}/${art}" -maxdepth 1 -name '*_latest.*' 2>/dev/null | head -1)
    if [ -n "$zeiger" ] && [ -e "$zeiger" ]; then
        groesse=$(du -h "$(readlink -f "$zeiger")" 2>/dev/null | cut -f1)
        pruefe "Archiv ${art} liegt vor" ja "$groesse"
    else
        pruefe "Archiv ${art} liegt vor" nein
    fi
done

# --- 2. Loeschen -------------------------------------------------------------
# Es wird ECHT geloescht und nicht nur eine Tabelle geleert: die Zeilen, die
# Pakete auf der Platte und die am Geraet gebauten Images. Ein Drill, der die
# Images stehen laesst, misst den Weg zurueck nur zur Haelfte -- und genau die
# fehlende Haelfte (ein Image aus dem gesicherten Paket NEU bauen) ist die,
# die auf einem frischen Geraet gebraucht wird.
echo
echo "--- 2. Loeschen ---"

# `arasul-app-<id>-<stand>` -- die Regel steht in
# `services/app/appContainer.js`, `containerName`.
for stand in test live; do
    docker rm -f "arasul-app-${APP}-${stand}" >/dev/null 2>&1 || true
done
pruefe 'App-Container entfernt' ja

IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^(arasul-)?${APP}:" || true)
if [ -n "$IMAGES" ]; then
    # shellcheck disable=SC2086
    docker rmi -f $IMAGES >/dev/null 2>&1 || true
fi
pruefe 'App-Images entfernt' ja "$(echo "$IMAGES" | tr '\n' ' ')"

rm -rf "${DATEN:?}/apps/${APP}"
pruefe 'Pakete der App von der Platte entfernt' \
    "$(ja_wenn "$([ -d "${DATEN}/apps/${APP}" ] && echo da || echo weg)" weg)"

# Die Datenbank: alles, was den Kunden ausmacht. `apps` nimmt ueber
# ON DELETE CASCADE die Staende, die Freigaben, die Schluessel und die Flows
# mit -- das ist die Buchfuehrung dieses Geraets, und sie wird hier auf die
# Probe gestellt.
sql "DELETE FROM public.apps" >/dev/null
sql "DELETE FROM arasul.flow_runs" >/dev/null
NACH_LOESCHEN=$(sql "SELECT count(*) FROM public.apps")
pruefe 'Datenbank: keine App mehr' "$(ja_wenn "${NACH_LOESCHEN:-x}" 0)"

# --- 3. Wiederherstellen -----------------------------------------------------
echo
echo "--- 3. Wiederherstellen ---"
START=$(date +%s)
if docker exec "$SICHERUNG" /usr/local/bin/wiederherstellen.sh > /tmp/drill-zurueck.log 2>&1; then
    pruefe 'Wiederherstellung gelaufen' ja "$(( $(date +%s) - START ))s"
else
    pruefe 'Wiederherstellung gelaufen' nein "$(tail -5 /tmp/drill-zurueck.log | tr '\n' ' ')"
fi

# --- 4. Ist es wieder da? ----------------------------------------------------
echo
echo "--- 4. Ist es wieder da? ---"
pruefe 'Nutzer zurueck' "$(ja_wenn "$(sql 'SELECT count(*) FROM public.admin_users')" "$VORHER_NUTZER")" \
    "erwartet ${VORHER_NUTZER}"
pruefe 'Apps zurueck' "$(ja_wenn "$(sql 'SELECT count(*) FROM public.apps')" "$VORHER_APPS")" \
    "erwartet ${VORHER_APPS}"
pruefe 'Freigaben zurueck' "$(ja_wenn "$(sql 'SELECT count(*) FROM public.app_members')" "$VORHER_FREIGABEN")" \
    "erwartet ${VORHER_FREIGABEN}"
pruefe 'Flows der Apps zurueck' "$(ja_wenn "$(sql 'SELECT count(*) FROM public.app_flows')" "$VORHER_FLOWS")" \
    "erwartet ${VORHER_FLOWS}"
pruefe 'Laeufe zurueck' "$(ja_wenn "$(sql 'SELECT count(*) FROM arasul.flow_runs')" "$VORHER_LAEUFE")" \
    "erwartet ${VORHER_LAEUFE}"
# Die Ueberschreibungen des Administrators (welches Modell ein Flow nimmt).
# Sie stehen bewusst in einer eigenen Tabelle, damit ein App-Update sie nicht
# anfasst -- eine Wiederherstellung darf sie erst recht nicht verlieren.
pruefe 'Modell-Ueberschreibungen zurueck' \
    "$(ja_wenn "$(sql 'SELECT count(*) FROM public.flow_settings')" "$VORHER_EINSTELLUNGEN")" \
    "erwartet ${VORHER_EINSTELLUNGEN}"

pruefe 'Pakete der App wieder auf der Platte' \
    "$(ja_wenn "$([ -d "${DATEN}/apps/${APP}" ] && echo da || echo weg)" da)"

# --- 5. Und die Container? ---------------------------------------------------
# Das Skript im Sicherungs-Container holt Daten und Dateien zurueck; die
# Container baut das BACKEND neu (`POST /api/backup/wiederherstellung` ->
# `sicherungsdienst.baueAppsNeu`). Auf diesem Weg -- Drill von Hand am Geraet --
# ist das Backend nicht beteiligt, also wird es hier angestossen.
echo
echo "--- 5. Die App wieder hochbringen ---"
echo "Das Image wird aus dem gesicherten Paket NEU gebaut. Am Jetson dauert das."
if docker exec "$BACKEND" node -e '
  const d = require("/app/apps/dashboard-backend/src/services/betrieb/sicherungsdienst");
  d.baueAppsNeu(null).then(r => {
    for (const a of r) {
      console.log((a.erfolg ? "ok   " : "FEHL ") + a.app_id + " " + a.version + " (" + a.stand + ")" + (a.grund ? ": " + a.grund : ""));
    }
    process.exit(r.every(a => a.erfolg) ? 0 : 1);
  }).catch(e => { console.error(e.message); process.exit(1); });
'; then
    pruefe 'App-Container aus dem gesicherten Paket neu gebaut' ja
else
    pruefe 'App-Container aus dem gesicherten Paket neu gebaut' nein
fi

LAEUFT=$(docker ps --format '{{.Names}}' | grep -c "^arasul-app-${APP}-" || true)
pruefe 'App-Container laeuft' "$(ja_wenn "$([ "${LAEUFT:-0}" -gt 0 ] && echo ja || echo nein)" ja)" \
    "${LAEUFT} Container"

echo
echo "=== ${gruen} gruen, ${rot} rot ==="
if [ "$rot" = "0" ]; then
    echo "Der Drill ist durch: geloescht und vollstaendig zurueckgeholt."
else
    echo "Protokolle: /tmp/drill-sicherung.log, /tmp/drill-zurueck.log"
    echo "            ${SICHERUNGSORDNER}/wiederherstellung.log"
fi
[ "$rot" = "0" ] || exit 1
