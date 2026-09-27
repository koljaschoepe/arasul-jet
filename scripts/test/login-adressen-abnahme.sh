#!/bin/bash
# =============================================================================
# login-adressen-abnahme.sh -- Anmeldung unter jeder Adresse des Geräts (J34).
# =============================================================================
#
# Rahmen um `login-adressen-abnahme.mjs`: legt für die Probe „gesperrt nur
# nach einer wirklichen Sperre" ein Wegwerf-Konto an (`j34-sperre-<stempel>`,
# über `scripts/util/pruefbenutzer.sh`, Passwort gewürfelt und nirgends
# notiert), lässt die Reihe laufen und nimmt das Konto samt seinen Zeilen in
# `login_attempts` danach wieder weg -- auch wenn die Reihe rot war. Das
# Wegwerf-Konto meldet sich nie erfolgreich an; deshalb legt der Firmenordner
# für es nichts an (`spiegleBeiAnmeldung` läuft erst nach dem Passwort).
#
# Angemeldet wird als ein vorhandenes Probekonto (ARASUL_BENUTZER), dessen
# Passwort nur über die Umgebung kommt -- am Mac per Befehlssubstitution aus
# dem Schlüsselbund:
#
#   ARASUL_BENUTZER=probe-0925-mitarbeiter \
#   ARASUL_PASSWORT="$(security find-generic-password -s 'Arasul Orin Mitarbeiter' \
#       -a probe-0925-mitarbeiter -w)" \
#   ARASUL_GERAET=arasul@192.168.0.197 bash scripts/test/login-adressen-abnahme.sh
#
# Umgebung: ARASUL_BENUTZER, ARASUL_PASSWORT (Pflicht), ARASUL_GERAET (ssh),
# ARASUL_ADRESSEN, ARASUL_AUSGABE.
# Rückgabe: die der Reihe; 3, wenn das Wegwerf-Konto nicht wegging.
# =============================================================================

set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GERAET="${ARASUL_GERAET:-arasul@192.168.0.197}"
STEMPEL="$(date +%m%d%H%M)"
SPERRKONTO="j34-sperre-${STEMPEL}"

if [ -z "${ARASUL_PASSWORT:-}" ] || [ -z "${ARASUL_BENUTZER:-}" ]; then
  echo "login-adressen: ARASUL_BENUTZER und ARASUL_PASSWORT fehlen." >&2
  exit 2
fi

aufraeumen() {
  ssh -o ConnectTimeout=10 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -tA -v ON_ERROR_STOP=1" <<SQL
DELETE FROM login_attempts WHERE username = '${SPERRKONTO}';
DELETE FROM admin_users WHERE username = '${SPERRKONTO}';
SQL
  local rest
  rest=$(ssh -o ConnectTimeout=10 "$GERAET" \
    "docker exec postgres-db psql -U arasul -d arasul_db -tAc \"SELECT count(*) FROM admin_users WHERE username = '${SPERRKONTO}'\"")
  if [ "$rest" != "0" ]; then
    echo "login-adressen: ROT -- ${SPERRKONTO} ist noch da (${rest})." >&2
    return 3
  fi
  echo "login-adressen: ${SPERRKONTO} ist wieder weg."
}

# Das Passwort des Wegwerf-Kontos kennt niemand: es wird nie richtig getippt.
if ! ARASUL_BENUTZER="$SPERRKONTO" ARASUL_PASSWORT="$(openssl rand -hex 24)" \
  ARASUL_GERAET="$GERAET" bash "$WURZEL/scripts/util/pruefbenutzer.sh"; then
  echo "login-adressen: das Wegwerf-Konto ließ sich nicht anlegen." >&2
  exit 2
fi

ARASUL_SPERRKONTO="$SPERRKONTO" node "$WURZEL/scripts/test/login-adressen-abnahme.mjs"
ERGEBNIS=$?

aufraeumen || ERGEBNIS=3
exit "$ERGEBNIS"
