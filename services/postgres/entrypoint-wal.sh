#!/bin/sh
# =============================================================================
# Postgres-Einstieg mit vorbereitetem WAL-Archivziel (Plan 023 S5)
# =============================================================================
# Das Volume `arasul-wal` haengt unter /backups/wal und gehoert nach dem
# Anlegen root:root mit 0755. Der Postgres-Server laeuft aber als Nutzer
# `postgres`. Ohne diesen Schritt scheitert `archive_command` bei JEDEM
# Segment mit "Permission denied", Postgres wiederholt es endlos, und pg_wal
# waechst, bis die Platte voll ist und die Datenbank stehenbleibt.
#
# Am 19.08.2026 auf dem Geraet nachgemessen: `touch` als postgres in
# /backups/wal endete mit "Permission denied". Die Archivierung einzuschalten,
# ohne das hier zu tun, waere ein selbst gebauter Ausfall gewesen.
#
# Dieses Skript laeuft als root (der offizielle Einstieg wechselt erst spaeter
# auf `postgres`), setzt den Besitzer und uebergibt dann unveraendert weiter.
# Verzeichnis 0755. Die Segmente selbst legt Postgres mit 0600 an, seine Maske
# ist 077. Der Sicherungsdienst kommt trotzdem heran, weil er als root ohne
# `cap_drop` laeuft und damit DAC_OVERRIDE hat. Am 19.08.2026 nachgemessen:
# Lesen und `tar -czf` ueber /backups/wal gehen durch. Bekaeme dieser Dienst
# jemals `cap_drop=ALL` oder einen Nicht-root-Nutzer, waere die WAL-Sicherung
# still leer.
set -e

if [ -d /backups/wal ]; then
    chown postgres:postgres /backups/wal 2>/dev/null || true
    chmod 755 /backups/wal 2>/dev/null || true
fi

exec docker-entrypoint.sh "$@"
