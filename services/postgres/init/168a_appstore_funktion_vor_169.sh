#!/bin/bash
# =============================================================================
# 168a_appstore_funktion_vor_169.sh — raeumt 169 den Weg frei, aber nur beim
# allerersten Init (Phase C3, zweiter Anlauf, 27.08.2026)
# =============================================================================
# Laeuft AUSSCHLIESSLICH beim allerersten Postgres-Init (docker-entrypoint-
# initdb.d, leeres Datenverzeichnis) und wird vom Migrations-Runner des
# Backends ignoriert: der verarbeitet nur .sql (siehe migrationRunner.js).
# Dieselbe Bauart wie `032a` und `108a`.
#
# WARUM
#
# Migration 169 laesst die Typen `app_status` und `app_type` fallen, ohne
# CASCADE und mit einer namentlichen Liste dessen, was vorher weg muss. In
# dieser Liste fehlt `check_app_dependencies(character varying)` aus Migration
# 014: ihr Rueckgabetyp nennt `app_status`, sie haengt also am Typ, und das
# Loeschen der Tabellen nimmt sie nicht mit (Postgres sieht in einen
# Funktionsrumpf nicht hinein, in eine Signatur sehr wohl).
#
#   ERROR: cannot drop type app_status because other objects depend on it
#
# Am 27.08.2026 am Orin: 169 im Migrationsbuch mit `success = false`, keine
# Tabelle `apps`. Ein gewachsenes Geraet repariert `170_app_modell_reparatur_c3.sql`.
# Ein FRISCHES Geraet erreicht die 170 aber nie: der Postgres-Einstiegspunkt
# faehrt mit ON_ERROR_STOP=1, ein Fehler in 169 bricht die ganze
# Initialisierung ab, und der Container kommt gar nicht erst hoch.
#
# Deshalb faellt die Funktion hier, eine Datei vor 169. Der Einstiegspunkt
# arbeitet alphabetisch, und `168_app_members_c2.sql` < `168a_...` < `169_...`.
#
# WARUM NICHT IN 169 SELBST
#
# 169 steht im Buch. Eine eingetragene Migration wird nicht mehr geaendert,
# auch keine gescheiterte: das Buch ist der Beleg dafuer, was das Geraet
# versucht hat.
#
# WARUM EINE .sh UND KEINE .sql
#
# Eine `168a_*.sql` waere fuer den Runner Version 168, und die ist auf jedem
# gewachsenen Geraet laengst gebucht; sie liefe dort nie. Ihr einziger Ort
# waere also ohnehin der Erstlauf. Als `.sh` steht das im Namen, sie taucht
# nicht als zweite Datei zu einer schon vergebenen Nummer im Migrationsbuch
# auf, und die Abnahme des frischen Geraets zaehlt weiter Dateien gegen
# Eintraege, ohne eine Ausnahme zu brauchen.
# =============================================================================
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	DROP FUNCTION IF EXISTS public.check_app_dependencies(character varying);
EOSQL

echo "168a: check_app_dependencies entfernt, damit 169 die Typen fallen lassen kann."
