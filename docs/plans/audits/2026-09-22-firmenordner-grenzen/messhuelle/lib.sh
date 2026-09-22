#!/usr/bin/env bash
# Gemeinsames fuer die Schritte der Messung J33 „Wegwerfen und Grenzen".
set -euo pipefail

WURZEL="${J33_WURZEL:-$HOME/j33grenze}"
BASIS="${J33_BASIS:-https://127.0.0.1:18083}"
ADMIN="${J33_ADMIN:-admin}"
PASSWORT="${J33_ADMIN_PASSWORT:-j33grenze-Admin-2026}"
ROH="${J33_ROH:-$WURZEL/rohdaten}"
mkdir -p "$ROH"

# Ein Aufruf an den Dienst. Gibt „<status>\n<koerper>" aus.
oc() {
  local methode="$1" weg="$2"; shift 2
  curl -sk -u "$ADMIN:$PASSWORT" -X "$methode" \
    -w '\n%{http_code}\n%{time_total}\n' "$@" "$BASIS$weg"
}

# Nur der Status.
oc_status() {
  local methode="$1" weg="$2"; shift 2
  curl -sk -u "$ADMIN:$PASSWORT" -X "$methode" -o /dev/null -w '%{http_code}' "$@" "$BASIS$weg"
}

jsonfeld() { python3 -c 'import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1],{"d":d}) or "")' "$1"; }

warte_bereit() {
  local i
  for i in $(seq 1 120); do
    if curl -sk -o /dev/null "$BASIS/readyz"; then return 0; fi
    sleep 2
  done
  echo "Dienst wurde nicht bereit" >&2; return 1
}

# RAM-Gipfel des Containers, waehrend ein Befehl laeuft.
ram_gipfel() {
  local marke="$1"; shift
  local proben="$ROH/$marke.ram"
  : > "$proben"
  ( while true; do
      docker stats --no-stream --format '{{.MemUsage}} {{.CPUPerc}}' j33grenze-firmenordner 2>/dev/null >> "$proben" || true
      sleep 1
    done ) &
  local sammler=$!
  "$@"
  local rc=$?
  kill "$sammler" 2>/dev/null || true
  return $rc
}
