#!/bin/bash
# =============================================================================
# Abnahme des Werksresets auf dem Pruefstand (Plan 023 B5)
# =============================================================================
# Der Werksreset laesst sich nicht auf dem laufenden Geraet nachweisen: dort
# liegt Arbeitsstand. Dieses Skript weist ihn auf dem zweiten Stack nach
# (scripts/test/pruefstand.sh) und ist bewusst ein Skript und kein Protokoll:
# eine Abnahme, die man nicht wiederholen kann, ist eine Behauptung.
#
#   scripts/test/werksreset-abnahme.sh
#
# Ablauf: Pruefstand hoch, Erstadministrator anlegen, Inhalte erzeugen,
# Vorschau lesen, Stufe "auslieferung" ausfuehren, Ergebnis pruefen, Stack neu
# starten, Ergebnis erneut pruefen. Der Neustart ist kein Beiwerk: ein Reset,
# den ein Neustart zurueckdreht, ist keiner.
# =============================================================================
set -euo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

BASIS="https://localhost:8443/api"
DB="pruef-postgres-db"
BACKEND="pruef-dashboard-backend"
NUTZER="abnahme"
PASSWORT="Abnahme-$(date +%s)"

fehler=0
pruefe() { # name, erwartet, tatsaechlich
    if [ "$2" = "$3" ]; then
        printf '  OK    %-46s %s\n' "$1" "$3"
    else
        printf '  FEHLT %-46s erwartet %s, ist %s\n' "$1" "$2" "$3"
        fehler=$((fehler + 1))
    fi
}

api() { curl -sk -H "Authorization: Bearer ${TOKEN}" "$@"; }
sql() { docker exec "$DB" psql -U arasul -d arasul_db -tA -c "$1" | tr -d '[:space:]'; }

warte_auf_backend() {
    local i
    for i in $(seq 1 90); do
        if curl -sk "${BASIS}/auth/needs-setup" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    echo "ABBRUCH: der Pruefstand antwortet nicht auf ${BASIS}"
    exit 1
}

echo "== 1. Pruefstand hochfahren =="
scripts/test/pruefstand.sh hoch >/dev/null
warte_auf_backend

echo "== 2. Erstadministrator anlegen =="
antwort=$(curl -sk -X POST "${BASIS}/auth/setup" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${NUTZER}\",\"password\":\"${PASSWORT}\"}")
TOKEN=$(echo "$antwort" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')
if [ -z "$TOKEN" ]; then
    echo "ABBRUCH: kein Token aus /auth/setup: $antwort"
    exit 1
fi

echo "== 3. Inhalte erzeugen, damit es etwas zu loeschen gibt =="
docker exec "$BACKEND" sh -c 'mkdir -p /arasul/flows /arasul/extensions/abnahme-app &&
    printf -- "---\nname: abnahme\nbeschreibung: Abnahme\n---\n\nText\n" > /arasul/flows/abnahme.md &&
    printf "{\"id\":\"abnahme-app\",\"name\":\"Abnahme\"}" > /arasul/extensions/abnahme-app/manifest.json'
sql "INSERT INTO chat_conversations (id, user_id, title) VALUES (gen_random_uuid(), 1, 'Abnahme')" >/dev/null
sql "UPDATE system_settings SET hostname = 'pruefstand', setup_completed = true WHERE id = 1" >/dev/null

chats_vorher=$(sql "SELECT count(*) FROM chat_conversations")
admins_vorher=$(sql "SELECT count(*) FROM admin_users")
pruefe "Chats vor dem Reset" "1" "$chats_vorher"
pruefe "Administratoren vor dem Reset" "1" "$admins_vorher"

echo "== 4. Vorschau =="
vorschau=$(api "${BASIS}/werksreset/vorschau?stufe=auslieferung")
durchfuehrbar=$(echo "$vorschau" | python3 -c 'import sys,json; print(json.load(sys.stdin)["durchfuehrbar"])')
unbekannt=$(echo "$vorschau" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["unbekannteTabellen"]))')
name=$(echo "$vorschau" | python3 -c 'import sys,json; print(json.load(sys.stdin)["geraetename"])')
pruefe "Vorschau durchfuehrbar" "True" "$durchfuehrbar"
pruefe "nicht eingeordnete Tabellen" "0" "$unbekannt"
pruefe "Geraetename aus den Einstellungen" "pruefstand" "$name"

echo "== 5. Falsche Bestaetigung wird abgewiesen =="
code=$(curl -sk -o /dev/null -w '%{http_code}' -X POST "${BASIS}/werksreset" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d '{"stufe":"auslieferung","bestaetigung":"falsch"}')
pruefe "HTTP-Code bei falschem Namen" "400" "$code"
pruefe "Chats danach unveraendert" "1" "$(sql 'SELECT count(*) FROM chat_conversations')"

echo "== 6. Fehlende Stufe wird abgewiesen =="
code=$(curl -sk -o /dev/null -w '%{http_code}' -X POST "${BASIS}/werksreset" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d '{"bestaetigung":"pruefstand"}')
pruefe "HTTP-Code ohne Stufe" "400" "$code"

echo "== 7. Werksreset, Stufe Auslieferungszustand =="
bericht=$(curl -sk -X POST "${BASIS}/werksreset" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d '{"stufe":"auslieferung","bestaetigung":"pruefstand"}')
echo "$bericht" | python3 -m json.tool > /tmp/werksreset-bericht.json 2>/dev/null || echo "$bericht"
zeilen=$(echo "$bericht" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("zeilenGesamt","-"))')
echo "  Bericht: ${zeilen} Zeilen entfernt, vollstaendig in /tmp/werksreset-bericht.json"

echo "== 8. Zustand direkt nach dem Reset =="
pruefe "Chats" "0" "$(sql 'SELECT count(*) FROM chat_conversations')"
pruefe "Administratoren" "0" "$(sql 'SELECT count(*) FROM admin_users')"
pruefe "Erweiterungen" "0" "$(sql 'SELECT count(*) FROM arasul.extensions')"
pruefe "n8n-Workflows" "0" "$(sql 'SELECT count(*) FROM n8n.workflow_entity' 2>/dev/null || echo 0)"
pruefe "Ersteinrichtung faellig" "false" "$(sql 'SELECT setup_completed FROM system_settings')"
pruefe "Modellkatalog bleibt" "true" "$(sql 'SELECT count(*) > 0 FROM llm_model_catalog')"
pruefe "Schema-Buchfuehrung bleibt" "true" "$(sql 'SELECT count(*) > 0 FROM arasul.schema_migrations')"
pruefe "Flow-Dateien" "0" "$(docker exec "$BACKEND" sh -c 'ls -A /arasul/flows | wc -l' | tr -d '[:space:]')"
pruefe "Erweiterungs-Ordner" "0" "$(docker exec "$BACKEND" sh -c 'ls -A /arasul/extensions | wc -l' | tr -d '[:space:]')"
pruefe "Erstpasswort entwertet" "1" "$(grep -c '^ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP' .env.pruefstand || echo 0)"
pruefe "Erstpasswort im Normalbetrieb unberuehrt" "0" "$(grep -c '^ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP' .env || echo 0)"
pruefe "alter Token gilt nicht mehr" "401" \
    "$(curl -sk -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${TOKEN}" "${BASIS}/auth/me")"

echo "== 9. Neustart, das Ergebnis muss ihn ueberleben =="
scripts/test/pruefstand.sh runter >/dev/null
scripts/test/pruefstand.sh hoch >/dev/null
warte_auf_backend
pruefe "Ersteinrichtung nach Neustart" "True" \
    "$(curl -sk "${BASIS}/auth/needs-setup" | python3 -c 'import sys,json; print(json.load(sys.stdin)["needsSetup"])')"
pruefe "Administratoren nach Neustart" "0" "$(sql 'SELECT count(*) FROM admin_users')"
pruefe "Flow-Dateien nach Neustart" "0" "$(docker exec "$BACKEND" sh -c 'ls -A /arasul/flows | wc -l' | tr -d '[:space:]')"

echo ""
if [ "$fehler" -eq 0 ]; then
    echo "ABNAHME BESTANDEN"
else
    echo "ABNAHME GESCHEITERT: ${fehler} Punkte offen"
fi
exit "$fehler"
