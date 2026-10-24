#!/bin/bash
# Das Siegel der Tuer, im Container nachgerechnet (Karte terminal-im-frontend, M5).
#
#   siegel <nachricht> <datei-mit-geheimnis>   -> die ersten 16 Hex-Zeichen von
#                                                 HMAC-SHA256(Geheimnis, Nachricht)
#
# Dasselbe wie `siegel()` in apps/dashboard-backend/src/services/terminal/terminal.js
# (Schluessel = der Text der Datei ohne Zeilenende), aber OHNE DAS GEHEIMNIS IN
# EINER BEFEHLSZEILE. `openssl dgst -hmac <geheimnis>` stuende fuer jeden Prozess
# am Geraet in /proc/<pid>/cmdline, auch fuer einen Terminal-Nutzer, und der
# koennte sich damit Siegel fuer andere rechnen (Review vom 21.10.2026). Hier
# geht der Schluessel nur durch eingebaute Befehle der Shell und durch
# Standardeingaben; openssl sieht nur fertige Bytes auf stdin.

_hex() { od -An -v -tx1 | tr -d ' \n'; }

# Hex-Zeichen -> Escape-Folge fuer `printf '%b'`, ohne Unterprozess.
_escape() {
  local h="$1" i
  REPLY=""
  for ((i = 0; i < ${#h}; i += 2)); do REPLY+="\\x${h:i:2}"; done
}

siegel() {
  local nachricht="$1" datei="$2" geheim k i b x ipad="" opad="" innen
  geheim="$(<"$datei")"
  k="$(printf '%s' "$geheim" | _hex)"
  # Laenger als ein Block (64 Bytes): erst hashen, wie HMAC es verlangt.
  if [ "${#k}" -gt 128 ]; then
    _escape "$k"
    k="$(printf '%b' "$REPLY" | openssl dgst -sha256 -binary | _hex)"
  fi
  while [ "${#k}" -lt 128 ]; do k+="00"; done
  for ((i = 0; i < 128; i += 2)); do
    b=$((16#${k:i:2}))
    printf -v x '\\x%02x' $((b ^ 0x36))
    ipad+="$x"
    printf -v x '\\x%02x' $((b ^ 0x5c))
    opad+="$x"
  done
  innen="$({
    printf '%b' "$ipad"
    printf '%s' "$nachricht"
  } | openssl dgst -sha256 -binary | _hex)"
  _escape "$innen"
  {
    printf '%b' "$opad"
    printf '%b' "$REPLY"
  } | openssl dgst -sha256 -binary | _hex | cut -c1-16
}
