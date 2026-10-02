#!/bin/bash
# =============================================================================
# Was ein Update nicht veraendern darf: die Zaehlung vorher und nachher (J39)
# =============================================================================
# Laeuft AM GERAET, nur lesend, ohne Passwort und ohne Sitzung. Schreibt eine
# Zeile je Gegenstand; zweimal aufgerufen (vor und nach dem Einspielen) und mit
# `diff` verglichen, ist die Frage "unveraendert?" beantwortet:
#
#   bash scripts/test/fassung-zaehlung.sh > vorher.txt
#   ... einspielen ...
#   bash scripts/test/fassung-zaehlung.sh > nachher.txt
#   diff vorher.txt nachher.txt && echo unveraendert
#
# Die Gegenstaende sind die der Karte `update-wie-ein-kunde`: Konten, Lizenz,
# Apps (Staende, Container, Dateien), Datenbankzeilen der Apps, Flows, Modelle,
# Firmenordner. Was sich von selbst aendert, steht NICHT darin (Zeitstempel,
# Laufzeitdateien des Firmenordner-Dienstes, Container-IDs).
#
# Der Ort ist der Ordner, aus dem der Stapel laeuft -- Docker sagt ihn
# (`scripts/lib/installation.sh`), und er wechselt mit dem Update.
# =============================================================================
set -uo pipefail

PROJEKT="${ARASUL_PROJEKT:-arasul-platform}"
PG="${ARASUL_PG_CONTAINER:-postgres-db}"
LLM="${ARASUL_LLM_CONTAINER:-llm-service}"

WURZEL="$(docker ps --filter "label=com.docker.compose.project=${PROJEKT}" \
  --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | sort | uniq -c | sort -rn | sed -n '1s/^ *[0-9]* *//p')"
[ -d "$WURZEL" ] || { echo "kein Geraet gefunden (Projekt ${PROJEKT})" >&2; exit 1; }

zeile() { printf '%-26s %s\n' "$1" "$2"; }
psql_() { docker exec "$PG" psql -U arasul -At "$@" 2>/dev/null; }
hash_baum() {
  # Inhalt eines Verzeichnisses: Anzahl Dateien und ein Hash ueber Namen und Inhalte.
  local d="$1"
  [ -d "$d" ] || { echo "0 -"; return; }
  local n h
  n="$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
  h="$(cd "$d" && find . -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -c1-16)"
  echo "$n $h"
}

# --- Konten -----------------------------------------------------------------
zeile konten "$(psql_ -d arasul_db -c "select count(*) || ' ' || coalesce(left(md5(string_agg(username || ':' || role || ':' || is_active::text, ',' order by username)), 12), '-') from admin_users")"

# --- Lizenz -----------------------------------------------------------------
zeile lizenz "$(bash "${WURZEL}/scripts/util/lizenz-geraet.sh" status 2>/dev/null)"

# --- Apps -------------------------------------------------------------------
zeile app_staende "$(psql_ -d arasul_db -c "select count(*) || ' ' || coalesce(left(md5(string_agg(app_id || '/' || stand || '/' || version, ',' order by app_id, stand)), 12), '-') from app_staende")"
zeile app_container "$(docker ps -a --filter 'name=arasul-app-' --format '{{.Names}}={{.State}}/{{.Status}}' | sed 's/ (.*//; s/\/Up.*/\/Up/' | sort | tr '\n' ' ')"
zeile app_container_gesund "$(docker ps --filter 'name=arasul-app-' --filter 'health=healthy' -q | wc -l | tr -d ' ') von $(docker ps -a --filter 'name=arasul-app-' -q | wc -l | tr -d ' ')"
zeile app_dateien "$(hash_baum "${WURZEL}/data/apps")"

# --- Datenbankzeilen der Apps -------------------------------------------------
# Je Datenbank jede Tabelle mit ihrer EXAKTEN Zeilenzahl (nicht n_live_tup).
for db in $(psql_ -d arasul_db -c "select datenbank from app_datenbanken order by datenbank"); do
  zeilen="$(psql_ -d "$db" -c "
    select coalesce(string_agg(table_schema || '.' || table_name || '=' ||
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text,
      ' ' order by table_schema, table_name), '(keine Tabellen)')
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE'")"
  zeile "db:${db#arasul_app_}" "$zeilen"
done

# --- Flows --------------------------------------------------------------------
zeile flows_dateien "$(hash_baum "${WURZEL}/data/flows")"
zeile app_flows "$(psql_ -d arasul_db -c "select count(*) from app_flows")"

# --- Modelle ------------------------------------------------------------------
zeile modelle "$(docker exec "$LLM" ollama list 2>/dev/null | awk 'NR>1 {print $1 "=" $2}' | sort | tr '\n' ' ')"
zeile modelle_dateien "$(hash_baum "${WURZEL}/data/models" | cut -d' ' -f1)"

# --- Firmenordner ---------------------------------------------------------------
# Namen und Groessen der Dateien in der Ablage (die Daten des Kunden), nicht die
# Laufzeitdateien des Dienstes: die aendern sich von selbst.
if [ -d "${WURZEL}/data/firmenordner/ablage" ]; then
  zeile firmenordner_ablage "$(cd "${WURZEL}/data/firmenordner/ablage" && find . -type f -printf '%P %s\n' 2>/dev/null | sort | sha256sum | cut -c1-16) ($(find "${WURZEL}/data/firmenordner/ablage" -type f | wc -l | tr -d ' ') Dateien)"
else
  zeile firmenordner_ablage "(keine)"
fi
zeile firmenordner_dienst "$(docker ps --filter 'name=firmenordner' --filter 'health=healthy' -q | wc -l | tr -d ' ') gesund"

# --- Geheimnisse und Zertifikat -------------------------------------------------
zeile geheimnisse "$(cd "${WURZEL}/config/secrets" 2>/dev/null && find . -type f ! -name 'erstausgabe.txt' -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -c1-16)"
zeile geraete_ca "$(sha256sum "${WURZEL}/config/traefik/certs/arasul-ca.crt" 2>/dev/null | cut -c1-16)"
