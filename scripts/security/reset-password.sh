#!/bin/bash
###############################################################################
# Arasul Platform - Passwort zuruecksetzen
# Setzt das Passwort ueber den EINEN Schreibweg des Backends
# (passwordService.schreibePasswort): Dashboard, Passwort-Historie UND der
# Dateidienst des Firmenordners bekommen das neue Passwort. Hebt ausserdem die
# Kontosperre auf und beendet alle Sitzungen.
# Braucht SSH/Zugang zum Geraet (keine Mail).
#
# Aufruf:
#   ./scripts/security/reset-password.sh [benutzername]
#   printf '%s' "$NEUES_PASSWORT" | ./scripts/security/reset-password.sh [benutzername]
#
# Ohne Terminal (stdin ist eine Pipe) wird das Passwort aus der ersten Zeile von
# stdin gelesen, ohne Rueckfrage. Mit Terminal fragt das Skript zweimal nach.
# Standard-Benutzer: admin
###############################################################################

set -euo pipefail

USERNAME="${1:-admin}"
CONTAINER="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
EINSTIEG="/app/apps/dashboard-backend/src/cli/passwort.js"

echo "========================================"
echo "  Arasul - Passwort zuruecksetzen"
echo "========================================"
echo ""
echo "  Benutzer: $USERNAME"
echo ""

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "FEHLER: Der Container $CONTAINER laeuft nicht."
  echo "Starten mit: docker compose up -d dashboard-backend"
  exit 1
fi

if [ -t 0 ]; then
  read -r -s -p "Neues Passwort: " PASSWORD
  echo ""
  read -r -s -p "Passwort wiederholen: " PASSWORD_CONFIRM
  echo ""
  if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
    echo "FEHLER: Die Passwoerter stimmen nicht ueberein."
    exit 1
  fi
else
  IFS= read -r PASSWORD || true
fi

if [ -z "$PASSWORD" ]; then
  echo "FEHLER: Das Passwort darf nicht leer sein."
  exit 1
fi

if [ ${#PASSWORD} -lt 8 ]; then
  echo "FEHLER: Das Passwort braucht mindestens 8 Zeichen."
  exit 1
fi

# Das Passwort geht ueber stdin in den Container, nie als Argument (sonst stuende
# es in der Prozessliste).
ANTWORT=$(printf '%s\n' "$PASSWORD" | docker exec -i "$CONTAINER" node "$EINSTIEG" "$USERNAME") || {
  echo "FEHLER: ${ANTWORT:-Zuruecksetzen fehlgeschlagen}"
  exit 1
}

case "$ANTWORT" in
  *'"ok":true'*) ;;
  *)
    echo "FEHLER: $ANTWORT"
    exit 1
    ;;
esac

echo ""
echo "Passwort zurueckgesetzt fuer: $USERNAME"
echo "Kontosperre aufgehoben, alle Sitzungen beendet."
case "$ANTWORT" in
  *'"firmenordner":"gespiegelt"'*) echo "Firmenordner: neues Passwort uebernommen." ;;
  *'"firmenordner":"offen"'*)
    echo "ACHTUNG: Der Dateidienst hat das neue Passwort NICHT angenommen."
    echo "Der Firmenordner geht erst wieder, wenn der Abgleich gelingt (Einstellungen > Firmenordner)."
    ;;
esac
echo "Bitte mit dem neuen Passwort anmelden."
echo ""
