#!/bin/bash
# =============================================================================
# zzz_migrationsbuch_fuellen.sh — das Migrationsbuch sagt nach dem Erstlauf die
# Wahrheit (Plan 023, Befund vom 20.08.2026)
# =============================================================================
# Laeuft AUSSCHLIESSLICH beim allerersten Postgres-Init und dort als LETZTES.
# Der Runtime-Runner des Backends ignoriert die Datei, er verarbeitet nur .sql
# (siehe migrationRunner.js).
#
# Warum es diese Datei gibt
# -------------------------
# Der Docker-Init wendet alle .sql in init/ an. Ins Buch trug er bis zum
# 20.08.2026 aber nur die sieben Zeilen ein, die einzelne Dateien selbst
# schreiben (0, 57, 71, 74, 75, 76, 84). Beim naechsten Start las der Runner
# das Buch, hielt 140 Migrationen fuer offen und wendete sie erneut an.
#
# Das ist nicht folgenlos, sondern zerstoerend: Migration 090 legt das Schema
# `arasul` an, der Datenbanknutzer heisst ebenfalls arasul, also loest
# `search_path = "$user", public` ab da zuerst auf `arasul` auf. Ein erneutes
# `CREATE TABLE IF NOT EXISTS chat_messages` prueft dann nur `arasul`, findet
# dort nichts und legt eine ZWEITE, leere Tabelle an, die die gefuellte in
# `public` verdeckt. Am 20.08.2026 auf dem Pruefstand gemessen: ein einziger
# Neustart eines fabrikneuen Geraets erzeugte 47 solcher Schattentabellen. Der
# Kunde konnte sich danach nicht mehr anmelden, seine Daten lagen unerreichbar
# in `public`, und an seiner Stelle stand ein frisch angelegtes Konto `admin`
# mit dem Passwort ab Werk.
#
# Die Reparatur ist keine Heuristik, sondern eine Aussage: der Init weiss, dass
# er alles angewendet hat, also schreibt er das auch hin. Erreicht das Skript
# seine erste Zeile, sind alle .sql fehlerfrei durchgelaufen — der
# Postgres-Einstiegspunkt bricht die Initialisierung bei jedem Fehler ab
# (ON_ERROR_STOP=1). Nur deshalb darf hier "erledigt" stehen.
#
# Warum der Name keine Nummer hat
# -------------------------------
# Der Docker-Einstiegspunkt arbeitet die Dateien alphabetisch ab, `zzz_` ist
# damit sicher die letzte. Eine Nummer waere hier falsch: `services/postgres/
# CLAUDE.md` legt fest, dass die naechste Migration die hoechste Nummer plus
# eins ist, und eine 999 wuerde diese Regel unbrauchbar machen. Diese Datei ist
# keine Migration, sie ist die Schlussnotiz darueber.
# =============================================================================
set -euo pipefail

verzeichnis="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Denselben Ort waehlen wie ermittleBuchOrt() im Runner: gibt es das Buch schon
# in `arasul`, bleibt es dort, sonst `public`. Beim Erstlauf ist es `public`,
# weil 000_schema_migrations.sql laeuft, bevor 090 das Schema arasul anlegt.
schema=$(psql -v ON_ERROR_STOP=1 -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	SELECT COALESCE(
	  (SELECT table_schema FROM information_schema.tables
	    WHERE table_name = 'schema_migrations'
	      AND table_schema IN ('arasul', 'public')
	    ORDER BY CASE table_schema WHEN 'arasul' THEN 0 ELSE 1 END
	    LIMIT 1),
	  'public');
EOSQL
)
# Der volle Name, nicht nur das Schema. Genau daran ist der erste Anlauf am
# 20.08.2026 gescheitert: `INSERT INTO public` ist keine Tabelle, psql brach ab,
# der Postgres-Einstiegspunkt riss die Initialisierung mit, und der Container
# startete in einen Zustand, in dem das Schema vollstaendig, das Buch aber leer
# war. Also genau der Schaden, den diese Datei verhindern soll.
ort="${schema}.schema_migrations"

# Eine Anweisung je .sql-Datei, in einem Rutsch. Die Pruefsumme wird genauso
# gebildet wie im Runner: sha256 des Inhalts, die ersten 16 Zeichen.
# `ON CONFLICT DO NOTHING` deckt den einen Fall ab, in dem sich zwei Dateien
# eine Version teilen (108 und 108a); die .sh ist ohnehin nicht dabei.
anweisungen=$(
	for datei in "$verzeichnis"/*.sql; do
		name="$(basename "$datei")"
		# Bewusst ohne sed: `sed -E` ist im Alpine-Bild busybox und nicht in
		# jeder Fassung dabei. Bash kann das hier allein.
		roh="${name%%_*}"   # "006_llm_jobs_schema.sql" -> "006", "108a_x.sql" -> "108a"
		roh="${roh%[a-z]}"  # "108a" -> "108"
		# Keine fuehrende Nummer: keine Migration, nichts einzutragen.
		[[ "$roh" =~ ^[0-9]+$ ]] || continue
		version=$((10#$roh)) # fuehrende Nullen weg, ohne Oktal-Falle
		pruefsumme="$(sha256sum "$datei" | cut -c1-16)"
		printf "INSERT INTO %s (version, filename, checksum, execution_ms, success) VALUES (%s, '%s', '%s', 0, true) ON CONFLICT (version) DO NOTHING;\n" \
			"$ort" "$version" "$name" "$pruefsumme"
	done
)

printf '%s\n' "$anweisungen" |
	psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" >/dev/null

eingetragen=$(psql -v ON_ERROR_STOP=1 -tA --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
	-c "SELECT count(*) FROM ${ort}")

echo "zzz: Migrationsbuch in ${ort} gefuellt, ${eingetragen} Eintraege."
