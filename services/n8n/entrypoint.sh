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

exec n8n "$@"
