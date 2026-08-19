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
# Verzeichnis 0755 und Dateien mit der Standardmaske 0644, damit der
# Sicherungsdienst sie lesen kann, auch wenn ihm `cap_drop=ALL` das Uebergehen
# von Dateirechten nimmt.
set -e

if [ -d /backups/wal ]; then
    chown postgres:postgres /backups/wal 2>/dev/null || true
    chmod 755 /backups/wal 2>/dev/null || true
fi

exec docker-entrypoint.sh "$@"
