#!/bin/bash
# 108a_n8n_default_disabled_fresh.sh — n8n bei FRISCHER Installation aus
#
# Läuft AUSSCHLIESSLICH beim allerersten Postgres-Init (docker-entrypoint-
# initdb.d, leeres Datenverzeichnis) und wird vom Runtime-Migration-Runner des
# Backends ignoriert (der verarbeitet nur .sql — siehe migrationRunner.js).
# Genau deshalb ist dies das saubere Mittel für "frische Box = aus, ohne je
# eine bestehende Box anzufassen":
#
#   - Frische Box: 100_sandbox_infrastructure_apps.sql seedet n8n zuerst mit
#     enabled=TRUE; dieses Skript läuft danach (alphabetisch nach 108_*.sql)
#     und setzt n8n auf FALSE → lizenzsauberer Default.
#   - Bestehende Box: Postgres-Init läuft nicht erneut, der Runner überspringt
#     .sh → der gespeicherte n8n-Flag-Wert bleibt exakt wie er ist.
#
# Nur n8n (fair-code) wird auf aus gesetzt; telegram/database bleiben unberührt.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
  UPDATE platform_apps
  SET enabled = FALSE, updated_at = now()
  WHERE id = 'n8n';
EOSQL

echo "108a: n8n auf frischer Installation deaktiviert (lizenzsauberer Default)."
