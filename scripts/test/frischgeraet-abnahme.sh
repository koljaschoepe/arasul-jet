#!/bin/bash
# =============================================================================
# Abnahme des fabrikneuen Geraets (Plan 023, Befund vom 20.08.2026)
# =============================================================================
# Beweist genau eine Sache: ein Geraet, das heute die Fabrik verlaesst,
# ueberlebt seinen ersten Neustart.
#
#   scripts/test/frischgeraet-abnahme.sh
#
# Was am 20.08.2026 vorlag, und warum es dieses Skript gibt
# ---------------------------------------------------------
# Der Docker-Init wendet alle Migrationen an, trug ins Migrationsbuch aber nur
# sieben Zeilen ein. Beim naechsten Start hielt der Runner 140 Migrationen fuer
# offen und wendete sie erneut an. Migration 090 legt das Schema `arasul` an,
# der Datenbanknutzer heisst ebenfalls arasul, also loest `search_path` ab da
# zuerst dorthin auf: aus jedem erneuten `CREATE TABLE IF NOT EXISTS` wurde
# eine zweite, leere Tabelle, die die gefuellte in `public` verdeckt.
#
# Gemessen am Pruefstand: EIN Neustart, 47 verdeckte Tabellen. Danach meldete
# die Anmeldung des Kunden "Invalid username or password", `needsSetup` stand
# auf false, und an seiner Stelle sass ein frisch angelegtes Konto `admin` mit
# dem Passwort ab Werk. Die Daten des Kunden lagen unerreichbar in `public`.
#
# Der Neustart in Schritt 6 ist deshalb der Kern der Abnahme, nicht ihr
# Beiwerk. Ein Geraet, das nur beim ersten Einschalten funktioniert, ist keins.
# =============================================================================
set -euo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

BASIS="https://localhost:8443/api"
DB="pruef-postgres-db"
BACKEND="pruef-dashboard-backend"
NUTZER="kunde"
PASSWORT="Fabrikneu-$(date +%s)"

fehler=0
pruefe() { # name, erwartet, tatsaechlich
	if [ "$2" = "$3" ]; then
		printf '  OK    %-52s %s\n' "$1" "$3"
	else
		printf '  FEHLT %-52s erwartet %s, ist %s\n' "$1" "$2" "$3"
		fehler=$((fehler + 1))
	fi
}

sql() { docker exec "$DB" psql -U arasul -d arasul_db -tA -c "$1" | tr -d '[:space:]'; }

# Wo das Buch steht, wird ermittelt und nicht geraten: derselbe Vorrang wie in
# ermittleBuchOrt() im Runner.
buchort() {
	docker exec "$DB" psql -U arasul -d arasul_db -tA -c \
		"SELECT table_schema FROM information_schema.tables
		  WHERE table_name = 'schema_migrations' AND table_schema IN ('arasul','public')
		  ORDER BY CASE table_schema WHEN 'arasul' THEN 0 ELSE 1 END LIMIT 1" | tr -d '[:space:]' |
		{ read -r schema; echo "${schema:-public}.schema_migrations"; }
}

# Gleichnamige Tabellen in beiden Schemata. `schema_migrations` darf das als
# einzige, sie steht auf gewachsenen Geraeten wirklich doppelt.
schatten() {
	docker exec "$DB" psql -U arasul -d arasul_db -tA -c \
		"SELECT count(*) FROM (
		   SELECT table_name FROM information_schema.tables WHERE table_schema = 'arasul'
		   INTERSECT
		   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
		 ) d WHERE table_name <> 'schema_migrations'" | tr -d '[:space:]'
}

warte_auf_backend() {
	local i code
	for i in $(seq 1 120); do
		code=$(curl -sk -o /tmp/frischgeraet-probe.json -w '%{http_code}' "${BASIS}/auth/needs-setup" || true)
		if [ "$code" = "200" ] && python3 -c 'import json,sys; json.load(open("/tmp/frischgeraet-probe.json"))' 2>/dev/null; then
			return 0
		fi
		sleep 2
	done
	echo "ABBRUCH: der Pruefstand antwortet nicht brauchbar auf ${BASIS} (zuletzt HTTP ${code})"
	docker logs --tail 30 "$BACKEND" 2>&1 | sed 's/^/    /'
	exit 1
}

# Wie viele .sql-Migrationen es auf der Platte gibt. Nicht abgeschrieben: eine
# feste Zahl waere bei der naechsten Migration falsch.
migrationen_auf_platte() {
	local anzahl=0 datei roh
	for datei in services/postgres/init/*.sql; do
		roh="$(basename "$datei")"
		roh="${roh%%_*}"
		roh="${roh%[a-z]}"
		[[ "$roh" =~ ^[0-9]+$ ]] || continue
		anzahl=$((anzahl + 1))
	done
	echo "$anzahl"
}

echo "== 1. Pruefstand von Null aufbauen (das ist der Fabrikzustand) =="
scripts/test/pruefstand.sh weg >/dev/null 2>&1 || true

# Der Pruefstand legt `.env.pruefstand` sonst als KOPIE der echten `.env` an,
# und die traegt ADMIN_PASSWORD und ADMIN_HASH des Arbeitsgeraets. Damit war
# der "Fabrikzustand" keiner: bootstrap.js legte daraus ein Konto an, und
# Schritt 4 fand ein Konto ab Werk vor.
#
# Am 23.08.2026 auf dem Orin gesehen:
#   FEHLT Ersteinrichtung faellig            erwartet True, ist False
#   FEHLT kein Konto ab Werk vorhanden       erwartet 0, ist 1
# und danach `Setup already completed, an admin account already exists`.
#
# Das war kein Mangel am Geraet, sondern eine Abnahme, die etwas anderes
# gemessen hat als ihren Namen. Ein echtes Fabrikgeraet hat diese drei Zeilen
# nicht — der Werksreset entwertet sie beim Schritt "Auslieferungszustand",
# und genau dieses Ergebnis wird hier nachgestellt.
#
# Warum nicht in `pruefstand.sh`: die Werksreset-Abnahme braucht den
# umgekehrten Fall, ein Geraet MIT Konto, das sie dann zuruecksetzt.
if [ ! -f .env.pruefstand ]; then
	grep -vE '^(ADMIN_PASSWORD|ADMIN_HASH|ADMIN_USERNAME|ADMIN_EMAIL)=' .env > .env.pruefstand
	chmod 600 .env.pruefstand
	echo "  Fabrik-Umgebung angelegt: .env.pruefstand ohne Zugangsdaten"
fi

# Und dasselbe fuer die Geheimnisse. Die .env allein reicht NICHT: dasselbe
# Erstpasswort kommt als Docker-Secret herein (bootstrap.js, Fund vom
# 19.08.2026). Genau daran ist der erste Anlauf dieser Zeilen gescheitert —
# `.env.pruefstand` war sauber, und trotzdem stand ein Administrator da.
if [ ! -d config/secrets-pruefstand ]; then
	mkdir -p config/secrets-pruefstand
	chmod 700 config/secrets-pruefstand
	cp -a config/secrets/* config/secrets-pruefstand/ 2>/dev/null || true
	# LEER, nicht geloescht: compose verweigert den Start, wenn eine als Secret
	# deklarierte Datei fehlt. `resolveSecrets()` liest sie und macht daraus
	# nach `.trim()` eine leere Zeichenkette — und genau die laesst
	# bootstrap.js keinen Administrator anlegen ("ADMIN_PASSWORD is not
	# available"). Das ist der Fabrikzustand, den ein Kunde vorfindet.
	: > config/secrets-pruefstand/admin_password
	chmod 600 config/secrets-pruefstand/admin_password
	rm -f config/secrets-pruefstand/admin.hash
	echo "  Fabrik-Geheimnisse angelegt: admin_password ist leer"
fi

scripts/test/pruefstand.sh hoch >/dev/null
warte_auf_backend

ORT="$(buchort)"
echo "  Migrationsbuch steht in ${ORT}"

echo "== 2. Das Buch sagt nach dem Erstlauf die Wahrheit =="
# Genau hier lag der Fehler: der Init wendete alles an und trug sieben Zeilen
# ein. Der Runner hielt den Rest fuer offen.
erwartet="$(migrationen_auf_platte)"
pruefe "Eintraege im Buch entsprechen den Dateien" "$erwartet" \
	"$(sql "SELECT count(*) FROM ${ORT}")"
pruefe "keine Migration als gescheitert vermerkt" "0" \
	"$(sql "SELECT count(*) FROM ${ORT} WHERE success = false")"

echo "== 3. Keine verdeckten Tabellen =="
pruefe "gleichnamige Tabellen in arasul und public" "0" "$(schatten)"

echo "== 4. Das Geraet verlangt die Ersteinrichtung =="
pruefe "Ersteinrichtung faellig" "True" \
	"$(curl -sk "${BASIS}/auth/needs-setup" | python3 -c 'import sys,json; print(json.load(sys.stdin)["needsSetup"])')"
pruefe "kein Konto ab Werk vorhanden" "0" "$(sql 'SELECT count(*) FROM admin_users')"

echo "== 5. Der Kunde legt sein Konto an =="
antwort=$(ABNAHME_NUTZER="$NUTZER" ABNAHME_PASSWORT="$PASSWORT" python3 -c 'import json,os; print(json.dumps({"username": os.environ["ABNAHME_NUTZER"], "password": os.environ["ABNAHME_PASSWORT"]}))' |
	curl -sk -X POST "${BASIS}/auth/setup" -H 'Content-Type: application/json' --data-binary @-)
TOKEN=$(echo "$antwort" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
	echo "ABBRUCH: kein Token aus /auth/setup. Antwort ohne Zugangsdaten:"
	echo "$antwort" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error", list(d.keys())))' 2>/dev/null || echo "(keine JSON-Antwort)"
	exit 1
fi
echo "  Konto \"${NUTZER}\" angelegt"

echo "== 6. Neustart des Backends. Das ist der Kern der Abnahme =="
docker restart "$BACKEND" >/dev/null
warte_auf_backend

echo "== 7. Zustand nach dem Neustart =="
pruefe "gleichnamige Tabellen in arasul und public" "0" "$(schatten)"
pruefe "keine Migration als gescheitert vermerkt" "0" \
	"$(sql "SELECT count(*) FROM $(buchort) WHERE success = false")"
pruefe "Konto des Kunden weiterhin genau eins" "1" "$(sql 'SELECT count(*) FROM admin_users')"
pruefe "und es ist seins" "$NUTZER" "$(sql 'SELECT username FROM admin_users')"
pruefe "Ersteinrichtung nicht mehr faellig" "False" \
	"$(curl -sk "${BASIS}/auth/needs-setup" | python3 -c 'import sys,json; print(json.load(sys.stdin)["needsSetup"])')"

# Die Anmeldung ist die Probe, die alles andere zusammenfasst: sie geht nur
# durch, wenn die Anwendung dieselbe Tabelle liest, in der das Konto steht.
anmeldung=$(ABNAHME_NUTZER="$NUTZER" ABNAHME_PASSWORT="$PASSWORT" python3 -c 'import json,os; print(json.dumps({"username": os.environ["ABNAHME_NUTZER"], "password": os.environ["ABNAHME_PASSWORT"]}))' |
	curl -sk -o /dev/null -w '%{http_code}' -X POST "${BASIS}/auth/login" -H 'Content-Type: application/json' --data-binary @-)
pruefe "Kunde kann sich nach dem Neustart anmelden" "200" "$anmeldung"

echo ""
if [ "$fehler" -eq 0 ]; then
	echo "ABNAHME BESTANDEN"
else
	echo "ABNAHME GESCHEITERT: ${fehler} Punkte offen"
fi
exit "$fehler"
