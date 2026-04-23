#!/bin/bash
# Shared cryptographic helpers for Arasul setup scripts.
# Source this file: . "$PROJECT_ROOT/scripts/lib/crypto.sh"

# Generate a cryptographically secure alphanumeric string of exactly $length chars.
# Oversamples the random pool (4x) so that filtering non-alphanumerics still yields
# at least $length chars. Falls back to /dev/urandom if openssl is unavailable.
generate_secret() {
  local length=${1:-32}
  local oversample=$((length * 4 + 16))
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$oversample" | tr -dc 'A-Za-z0-9' | head -c "$length"
  else
    head -c "$((oversample * 2))" /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$length"
  fi
}

# Generate a human-readable password with punctuation, of exactly $length chars.
generate_password() {
  local length=${1:-16}
  local oversample=$((length * 6 + 16))
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$oversample" | tr -dc 'A-Za-z0-9!@#%' | head -c "$length"
  else
    head -c "$((oversample * 2))" /dev/urandom | base64 | tr -dc 'A-Za-z0-9!@#%' | head -c "$length"
  fi
}
