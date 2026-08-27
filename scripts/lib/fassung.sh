#!/bin/bash
# =============================================================================
# Die Fassung kommt aus dem Bau (Phase C10, 27.08.2026)
# =============================================================================
# Aufruf: source "${SCRIPT_DIR}/../lib/fassung.sh"
#
# Bis zum 27.08.2026 stand die Zahl in einer Datei `VERSION` im
# Wurzelverzeichnis, und dort stand seit Monaten `1.0.0`. Sie war damit kein
# Messwert, sondern eine Behauptung: das Geraet hiess 1.0.0, egal welcher Stand
# darauf lief. Phase B7 hat den Rueckfall deshalb auf `0.0.0` gesetzt, und
# genau das hatte die naechste Kehrseite -- `validateManifest` lehnt mit
# `0.0.0` JEDES Paket mit einer `min_version` ab (siehe
# `apps/dashboard-backend/src/utils/version.js`).
#
# Beides loest dieselbe Antwort: die Zahl kommt aus dem Bau, nicht aus einer
# gepflegten Datei. Zwei Quellen, in dieser Reihenfolge:
#
#   1. `arasul-release.json` im Wurzelverzeichnis. Die legt der Bau des
#      Artefakts an (`scripts/deploy/artefakt-bauen.sh`); sie liegt IM
#      Artefakt und ist die Wahrheit fuer ein Geraet, das aus dem Artefakt
#      installiert wurde. Ein Git-Verzeichnis hat ein solches Geraet nicht.
#   2. Git. Ein Tag genau auf HEAD gibt die Tag-Nummer ohne `v`, sonst
#      `JJJJMMTT-<sieben Stellen SHA>`. Das ist der Weg auf dem Orin, der
#      seinen Stand ueber `deploy-local.sh` bekommt.
#
# Findet sich keins von beidem, ist die Antwort leer. NICHT `0.0.0` und nicht
# `1.0.0`: wer nicht weiss, welche Fassung er ist, sagt nichts, statt etwas
# Falsches zu sagen. Was das Backend daraus macht, steht in `version.js`.
# =============================================================================

# Die Fassung dieses Baumes. Erstes Argument: Wurzelverzeichnis (Vorgabe: das
# Verzeichnis ueber scripts/).
fassung_aus_bau() {
  local wurzel="${1:-}"
  if [ -z "$wurzel" ]; then
    wurzel="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi

  local release_datei="${wurzel}/arasul-release.json"
  if [ -f "$release_datei" ]; then
    # Ohne `jq`: das Backend-Image hat es, ein frisch ausgepacktes Artefakt auf
    # einem nackten Jetson nicht. Eine Zeile mit sed statt einer Abhaengigkeit,
    # die genau im Installationsmoment fehlt.
    local aus_datei
    aus_datei=$(sed -n 's/.*"fassung"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release_datei" | head -1)
    if [ -n "$aus_datei" ]; then
      printf '%s\n' "$aus_datei"
      return 0
    fi
  fi

  if git -C "$wurzel" rev-parse --git-dir >/dev/null 2>&1; then
    local tag
    tag=$(git -C "$wurzel" describe --tags --exact-match HEAD 2>/dev/null)
    if [ -n "$tag" ]; then
      printf '%s\n' "${tag#v}"
      return 0
    fi
    local sha
    sha=$(git -C "$wurzel" rev-parse --short=7 HEAD 2>/dev/null)
    if [ -n "$sha" ]; then
      printf '%s-%s\n' "$(date +%Y%m%d)" "$sha"
      return 0
    fi
  fi

  # Leer und Rueckgabe 0: der Aufrufer prueft auf leer. Eine Rueckgabe ungleich
  # 0 waere unter `set -e` in `x=$(fassung_aus_bau)` das stille Ende des
  # aufrufenden Skripts (scripts/test/stiller-tod.py kennt diesen Fall).
  printf '%s\n' ''
}

# Der Bau-Hash dieses Baumes. Steht in der Oberflaeche unter "Build" und in
# `/api/health`. Dieselben zwei Quellen wie oben, dieselbe Reihenfolge.
bau_hash() {
  local wurzel="${1:-}"
  if [ -z "$wurzel" ]; then
    wurzel="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi

  local release_datei="${wurzel}/arasul-release.json"
  if [ -f "$release_datei" ]; then
    local aus_datei
    aus_datei=$(sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release_datei" | head -1)
    if [ -n "$aus_datei" ]; then
      printf '%s\n' "$aus_datei"
      return 0
    fi
  fi

  local sha
  sha=$(git -C "$wurzel" rev-parse --short HEAD 2>/dev/null)
  if [ -n "$sha" ]; then
    printf '%s\n' "$sha"
    return 0
  fi

  printf '%s\n' ''
}

# Schreibt `SCHLUESSEL=WERT` in eine .env, ohne einen vorhandenen Eintrag zu
# verdoppeln. Ein leerer Wert aendert nichts: eine Zeile `SYSTEM_VERSION=` ist
# fuer das Backend dasselbe wie keine Zeile, aber sie sieht aus, als haette
# jemand etwas gesetzt.
env_setzen() {
  local datei="$1"
  local schluessel="$2"
  local wert="$3"

  [ -f "$datei" ] || return 1
  [ -n "$wert" ] || return 0

  if grep -q "^${schluessel}=" "$datei" 2>/dev/null; then
    # Der Wert kann Schraegstriche enthalten (ein Tag darf `/` tragen), deshalb
    # ein anderes Trennzeichen als `/` im sed-Ausdruck.
    sed -i.bak "s|^${schluessel}=.*|${schluessel}=${wert}|" "$datei" && rm -f "${datei}.bak"
  else
    printf '%s=%s\n' "$schluessel" "$wert" >> "$datei"
  fi
}
