#!/bin/sh
# Arasul n8n entrypoint — resolves the Docker secret n8n_encryption_key into
# N8N_ENCRYPTION_KEY before n8n starts. n8n itself does NOT understand the
# *_FILE convention used elsewhere in this repo, so without this shim n8n
# falls back to a random key generated into ~/.n8n/config on first boot —
# meaning losing the volume = losing every stored credential.
set -eu

SECRET_FILE="${N8N_ENCRYPTION_KEY_FILE:-/run/secrets/n8n_encryption_key}"

if [ -z "${N8N_ENCRYPTION_KEY:-}" ] && [ -r "$SECRET_FILE" ]; then
  N8N_ENCRYPTION_KEY="$(cat "$SECRET_FILE")"
  export N8N_ENCRYPTION_KEY
fi
# n8n itself doesn't read N8N_ENCRYPTION_KEY_FILE — unset to avoid confusion.
unset N8N_ENCRYPTION_KEY_FILE

if [ -z "${N8N_ENCRYPTION_KEY:-}" ]; then
  echo "WARN: N8N_ENCRYPTION_KEY is not set and /run/secrets/n8n_encryption_key is missing." >&2
  echo "      n8n will generate a random key on first boot — this is a recoverability risk." >&2
fi

# N8N_RUNNERS_AUTH_TOKEN: shared secret between the task broker (this
# container) and the n8n-runners sidecar. n8n does not understand the *_FILE
# convention for this variable either, so resolve it here. The sidecar's
# task-runner-launcher DOES support *_FILE natively (no shim needed there).
RUNNERS_TOKEN_FILE="${N8N_RUNNERS_AUTH_TOKEN_FILE:-/run/secrets/n8n_runners_auth_token}"

if [ -z "${N8N_RUNNERS_AUTH_TOKEN:-}" ] && [ -r "$RUNNERS_TOKEN_FILE" ]; then
  N8N_RUNNERS_AUTH_TOKEN="$(cat "$RUNNERS_TOKEN_FILE")"
  export N8N_RUNNERS_AUTH_TOKEN
fi
unset N8N_RUNNERS_AUTH_TOKEN_FILE

if [ "${N8N_RUNNERS_MODE:-}" = "external" ] && [ -z "${N8N_RUNNERS_AUTH_TOKEN:-}" ]; then
  echo "WARN: N8N_RUNNERS_MODE=external but N8N_RUNNERS_AUTH_TOKEN is not set and" >&2
  echo "      /run/secrets/n8n_runners_auth_token is missing. Code nodes will not" >&2
  echo "      execute. Generate: openssl rand -hex 32 > config/secrets/n8n_runners_auth_token" >&2
fi

# --- Plan 007: fester n8n-Owner idempotent provisionieren -------------------
# n8n 2.x erzwingt einen Owner und lässt sich nicht per Env „ohne Login"
# betreiben. Damit der Automationen-Tab ohne sichtbare n8n-Anmeldung lädt,
# legt dieser Shim beim Start EINEN festen Owner an (Zugangsdaten aus den
# Docker-Secrets n8n_owner_email / n8n_owner_password). Das Backend meldet
# diesen Owner später serverseitig an (routes/automations.js) und reicht den
# n8n-Session-Cookie same-origin an den Browser weiter.
#
# Strikt idempotent: n8n exponiert unter /rest/settings das Flag
# showSetupOnFirstLoad. Ist bereits ein Owner vorhanden (Flag=false), passiert
# nichts. Der Setup-Call läuft NUR, wenn noch kein Owner existiert.
#
# Läuft als Hintergrund-Job, weil n8n zum Provisionieren bereits laufen muss;
# der Haupt-Prozess bleibt der `exec n8n` unten. Fehler hier beeinträchtigen
# den n8n-Start bewusst nicht (die eigene Anmeldung bliebe sichtbar, aber der
# Dienst läuft) — sie werden nur geloggt.
OWNER_EMAIL_FILE="${N8N_OWNER_EMAIL_FILE:-/run/secrets/n8n_owner_email}"
OWNER_PASSWORD_FILE="${N8N_OWNER_PASSWORD_FILE:-/run/secrets/n8n_owner_password}"
unset N8N_OWNER_EMAIL_FILE N8N_OWNER_PASSWORD_FILE

provision_owner() {
  # Never abort n8n on a provisioning hiccup.
  set +e
  _email=""
  _password=""
  [ -r "$OWNER_EMAIL_FILE" ] && _email="$(cat "$OWNER_EMAIL_FILE")"
  [ -r "$OWNER_PASSWORD_FILE" ] && _password="$(cat "$OWNER_PASSWORD_FILE")"
  if [ -z "$_email" ] || [ -z "$_password" ]; then
    echo "n8n-owner: E-Mail/Passwort-Secret fehlt — Owner-Provisionierung übersprungen." >&2
    return 0
  fi

  # Auf n8n-Readiness warten (bis ~60s): /rest/settings liefert erst JSON,
  # wenn der HTTP-Server steht.
  _settings=""
  _i=0
  while [ "$_i" -lt 60 ]; do
    _settings="$(wget -qO- http://localhost:5678/rest/settings 2>/dev/null)"
    if [ -n "$_settings" ]; then
      break
    fi
    _i=$((_i + 1))
    sleep 1
  done
  if [ -z "$_settings" ]; then
    echo "n8n-owner: n8n nicht rechtzeitig bereit — Owner-Provisionierung übersprungen." >&2
    return 0
  fi

  # Nur einrichten, wenn noch kein Owner existiert.
  if ! printf '%s' "$_settings" | grep -q '"showSetupOnFirstLoad":true'; then
    echo "n8n-owner: Owner bereits vorhanden — Provisionierung übersprungen (idempotent)."
    return 0
  fi

  # JSON-Body sicher zusammenbauen (Passwort kann Sonderzeichen enthalten).
  _body="$(N8N_OWNER_EMAIL="$_email" N8N_OWNER_PASSWORD="$_password" node -e '
    process.stdout.write(JSON.stringify({
      email: process.env.N8N_OWNER_EMAIL,
      firstName: "Arasul",
      lastName: "Owner",
      password: process.env.N8N_OWNER_PASSWORD,
    }));
  ' 2>/dev/null)"
  if [ -z "$_body" ]; then
    echo "n8n-owner: Konnte Setup-Body nicht bauen — übersprungen." >&2
    return 0
  fi

  if wget -qO- --post-data="$_body" --header='Content-Type: application/json' \
      http://localhost:5678/rest/owner/setup >/dev/null 2>&1; then
    echo "n8n-owner: fester Owner provisioniert."
  else
    echo "n8n-owner: Owner-Setup fehlgeschlagen (evtl. bereits vorhanden) — n8n läuft weiter." >&2
  fi
  return 0
}

provision_owner &

exec n8n "$@"
