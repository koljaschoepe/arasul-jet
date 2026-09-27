#!/bin/bash
# =============================================================================
# sicherung-schreiben-abnahme.sh — am Geraet: die Firmenordner-Sicherung haelt
# Schreiben waehrend des Laufs aus (J35, 27.09.2026).
#
# Laeuft AM GERAET (als der Mensch, der installiert hat), z. B. von aussen:
#   ssh arasul@192.168.0.197 'bash -s' < scripts/test/sicherung-schreiben-abnahme.sh
#
# Was sie tut:
#   1. haelt fest, was vor dem Lauf im Firmenordner liegt (Pfad und sha256),
#   2. startet `backup.sh` im Sicherungs-Container und schreibt, sobald tar
#      den Firmenordner liest, 1000 Dateien in einen Wegwerfbereich mit
#      Stempel im Namen,
#   3. verlangt: Bericht `completed`, `firmenordner_status` true, die Liste
#      der bewegten Dateien nennt den Wegwerfbereich, und `backup-service`
#      meldet beim naechsten Healthcheck `healthy`,
#   4. spielt das Archiv dieses Laufs in einen Wegwerfpfad IM CONTAINER zurueck
#      (entschluesselt wie `wiederherstellen.sh`) und verlangt jede Datei von
#      vorher, Byte fuer Byte -- ausser denen, die der Bericht als bewegt nennt,
#   5. raeumt den Wegwerfbereich und den Wegwerfpfad weg und prueft, dass
#      beide fort sind.
#
# DER WEGWERFBEREICH LIEGT NEBEN DER ABLAGE DES DATEIDIENSTES, NICHT DARIN:
# `<ablage>/wegwerf-sicherung-<stempel>/`. Dieselbe Platte, derselbe tar-Lauf,
# aber kein Raum des Dateidienstes -- er sieht ihn nicht, indiziert ihn nicht,
# und beim Wegwerfen entsteht kein Eintrag im Papierkorb. In einen Raum der
# Firma direkt auf der Platte zu schreiben und wieder zu loeschen, hiesse, dem
# Dateidienst unter den Fuessen Knoten anzulegen, die er danach vermisst.
#
# Die Sicherung dieses Laufs bleibt liegen: sie ist eine echte Sicherung des
# Geraets (mit dem Wegwerfbereich darin), und eine Sicherung zu loeschen ist
# riskanter, als eine zu behalten. Die naechste Nacht enthaelt ihn nicht mehr.
# =============================================================================
set -uo pipefail

C=backup-service
STEMPEL="wegwerf-sicherung-$(date +%Y%m%d%H%M%S)"
FEHLER=0
ok() { printf '   ok    %s\n' "$1"; }
fehlt() { printf '   FEHLT %s\n' "$1"; FEHLER=1; }

quelle_von() { # Ziel im Container -> Pfad am Host
  docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$1\"}}{{.Source}}{{end}}{{end}}" "$C"
}
ABLAGE="$(quelle_von /arasul/firmenordner)"
SICHERUNGEN="$(quelle_von /backups)"
BEREICH="$ABLAGE/$STEMPEL"
ARBEIT="$(mktemp -d)"

aufraeumen() {
  [ -n "${SCHREIBER:-}" ] && kill "$SCHREIBER" 2>/dev/null
  rm -rf "$BEREICH"
  docker exec "$C" rm -rf "/tmp/$STEMPEL" 2>/dev/null
  rm -rf "$ARBEIT"
}
trap aufraeumen EXIT

echo "Sicherung haelt Schreiben aus — am Geraet ($(hostname), Stempel ${STEMPEL})"
if [ -z "$ABLAGE" ] || [ ! -d "$ABLAGE" ] || [ -z "$SICHERUNGEN" ]; then
  fehlt "backup-service hat Firmenordner und Sicherungsordner eingehaengt"
  exit 1
fi
if pgrep -f '/usr/local/bin/backup.sh' >/dev/null; then
  fehlt "keine andere Sicherung laeuft gerade"
  exit 1
fi

# 1. Vorher: jede Datei mit sha256, gelesen im Container (dort ist alles lesbar).
docker exec "$C" sh -c 'cd /arasul/firmenordner && find . -type f -print0 | xargs -0 -r sha256sum' \
  | sort -k2 >"$ARBEIT/vorher.sha"
VORHER=$(wc -l <"$ARBEIT/vorher.sha")
ok "vorher festgehalten: ${VORHER} Dateien"

# 2. Sichern und dabei schreiben.
BEGINN=$(date +%s)
docker exec "$C" /usr/local/bin/backup.sh >"$ARBEIT/lauf.log" 2>&1 &
SICHERUNG=$!
(
  # Warten, bis tar den Firmenordner liest (die Datenbank kommt vorher dran).
  for _ in $(seq 1 12000); do
    pgrep -f 'tar -czf /backups/firmenordner/' >/dev/null && break
    kill -0 "$SICHERUNG" 2>/dev/null || exit 0
    sleep 0.1
  done
  mkdir -p "$BEREICH"
  waehrend=0
  for n in $(seq 1 1000); do
    head -c 4096 /dev/urandom >"$BEREICH/datei$n.bin"
    pgrep -f 'tar -czf /backups/firmenordner/' >/dev/null && waehrend=$n
  done
  echo "$waehrend" >"$ARBEIT/waehrend"
) &
SCHREIBER=$!
wait "$SICHERUNG"
RC=$?
wait "$SCHREIBER"
SCHREIBER=""
ENDE=$(date +%s)
WAEHREND=$(cat "$ARBEIT/waehrend" 2>/dev/null || echo 0)
GESCHRIEBEN=$(find "$BEREICH" -type f 2>/dev/null | wc -l)

if [ "$GESCHRIEBEN" = 1000 ] && [ "$WAEHREND" -gt 0 ]; then
  ok "1000 Dateien in ${STEMPEL} geschrieben, die ersten ${WAEHREND} davon, waehrend tar las"
else
  fehlt "1000 Dateien geschrieben, waehrend tar las (geschrieben ${GESCHRIEBEN}, waehrend tar ${WAEHREND})"
fi
grep -E 'firmenordner' "$ARBEIT/lauf.log" | sed 's/^/      /'

# 3. Bericht und Gesundheit.
BERICHT="$SICHERUNGEN/backup_report.json"
STATUS=$(jq -r .status "$BERICHT")
FO_STATUS=$(jq -r .firmenordner_status "$BERICHT")
FO_ANZAHL=$(jq -r '.firmenordner_geaendert // "fehlt"' "$BERICHT")
if [ "$RC" = 0 ] && [ "$STATUS" = completed ] && [ "$FO_STATUS" = true ]; then
  ok "Bericht: status completed, firmenordner_status true (backup.sh ${RC})"
else
  fehlt "Bericht: status completed, firmenordner_status true (backup.sh ${RC}, status ${STATUS}, firmenordner ${FO_STATUS})"
  sed 's/^/      /' "$ARBEIT/lauf.log" | tail -20
fi
if jq -e --arg s "./$STEMPEL/" '.firmenordner_geaendert_dateien | map(select(startswith($s))) | length > 0' "$BERICHT" >/dev/null; then
  ok "Bericht nennt, was waehrend des Laufs kam: ${FO_ANZAHL} Datei(en), darunter der Wegwerfbereich"
else
  fehlt "Bericht nennt, was waehrend des Laufs kam (firmenordner_geaendert ${FO_ANZAHL})"
fi

# Der naechste Healthcheck NACH dem Ende der Sicherung muss gruen sein (alle
# fuenf Minuten, also hoechstens gut fuenf Minuten warten).
GESUND=""
for _ in $(seq 1 80); do
  LETZTER=$(docker inspect -f '{{json .State.Health.Log}}' "$C" 2>/dev/null | jq -c '.[-1]')
  START=$(jq -r '.Start // empty' <<<"$LETZTER")
  if [ -n "$START" ] && [ "$(date -d "$START" +%s 2>/dev/null || echo 0)" -gt "$ENDE" ]; then
    GESUND=$(jq -r '.ExitCode' <<<"$LETZTER")
    break
  fi
  sleep 5
done
ZUSTAND=$(docker inspect -f '{{.State.Health.Status}}' "$C")
if [ "$GESUND" = 0 ] && [ "$ZUSTAND" = healthy ]; then
  ok "backup-service bleibt healthy (Healthcheck nach der Sicherung: 0)"
else
  fehlt "backup-service bleibt healthy (Healthcheck nach der Sicherung: '${GESUND:-keiner}', Zustand ${ZUSTAND})"
fi

# 4. Zurueckspielen in einen Wegwerfpfad im Container.
ARCHIV=$(docker exec "$C" readlink -f /backups/firmenordner/firmenordner_latest.tar.gz)
docker exec "$C" sh -c '
  set -e
  ziel="/tmp/'"$STEMPEL"'"
  mkdir -p "$ziel"
  if gzip -t "'"$ARCHIV"'" 2>/dev/null; then
    tar -xzf "'"$ARCHIV"'" -C "$ziel"
  else
    openssl enc -d -aes-256-cbc -pbkdf2 -in "'"$ARCHIV"'" -pass "file:${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}" | tar -xzf - -C "$ziel"
  fi' >"$ARBEIT/zurueck.log" 2>&1 || { fehlt "Archiv ${ARCHIV##*/} laesst sich zurueckspielen"; sed 's/^/      /' "$ARBEIT/zurueck.log"; }

docker exec -i "$C" sh -c "cd /tmp/$STEMPEL && sha256sum -c 2>/dev/null" <"$ARBEIT/vorher.sha" \
  | grep -v ': OK$' | sed 's/: [A-Z].*$//' >"$ARBEIT/abweichend" || true
jq -r '.firmenordner_geaendert_dateien[]' "$BERICHT" | sort >"$ARBEIT/bewegt"
ABWEICHEND=$(wc -l <"$ARBEIT/abweichend")
UNERKLAERT=$(sort "$ARBEIT/abweichend" | comm -23 - "$ARBEIT/bewegt" | wc -l)
if [ "$UNERKLAERT" = 0 ]; then
  ok "Wiederherstellung vollstaendig: $((VORHER - ABWEICHEND)) von ${VORHER} Dateien Byte fuer Byte, ${ABWEICHEND} abweichend und im Bericht als bewegt genannt"
else
  fehlt "Wiederherstellung vollstaendig (${UNERKLAERT} Dateien von vorher fehlen oder weichen ab, ohne im Bericht zu stehen)"
  sort "$ARBEIT/abweichend" | comm -23 - "$ARBEIT/bewegt" | sed -n '1,10s/^/      /p'
fi

# 5. Aufraeumen und nachsehen.
aufraeumen
trap - EXIT
if [ ! -e "$BEREICH" ] && ! docker exec "$C" test -e "/tmp/$STEMPEL"; then
  ok "Wegwerfbereich und Wegwerfpfad sind weg"
else
  fehlt "Wegwerfbereich und Wegwerfpfad sind weg"
fi

echo "Dauer: $((ENDE - BEGINN)) s Sicherung"
[ "$FEHLER" = 0 ] && echo "gruen" || echo "ROT"
exit "$FEHLER"
