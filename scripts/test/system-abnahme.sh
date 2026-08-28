#!/bin/bash
# =============================================================================
# Abnahme A6: Modelle und System des Administrators. Phase D5 vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Playwright: Backup ausloesen, Meldung erscheint."
#
# WAS GEMESSEN WIRD, und in dieser Reihenfolge:
#
#   1. Was das Geraet VOR dem Lauf hat: wie viele Sicherungen liegen da, und
#      wann war die letzte. Ohne diese zwei Zahlen laesst sich hinterher nicht
#      sagen, ob der Klick etwas bewirkt hat oder ob die Liste schon voll war.
#   2. Die Kurzliste aus `config/modelle/kurzliste.json` und das Standardmodell
#      des Geraets (GET /api/models/default). Beides geht als Erwartung in den
#      Browser: die Ansicht soll GENAU diese Modelle zeigen.
#   3. IM BROWSER (`system-bilder.mjs`): die Modell-Ansicht, die
#      Aktualisierungen, und dann der Klick auf "Jetzt sichern" mit der
#      Meldung und der Liste danach.
#   4. Am Backend nachgerechnet: es liegt eine Sicherung MEHR da als vorher,
#      oder die neueste ist juenger als die vorherige neueste. Der Browser kann
#      gruen gemeldet haben und trotzdem nichts bewirkt haben.
#
# WARUM DAS IM BROWSER PASSIERT UND NICHT PER curl. Dass die Wege antworten,
# misst `betrieb-abnahme.sh` (C9) und `modelle-abnahme.sh` (C8). Was D5
# hinzufuegt, ist die Frage, ob ein Administrator sie FINDET: bis heute
# sicherte er mit `docker exec`.
#
# WARUM DIESE ABNAHME NEBEN `abnahmen.sh` STEHT, wie `shell-`, `dashboard-`,
# `admin-` und `app-admin-abnahme.sh`: `loginLimiter` erlaubt ZEHN Anmeldungen
# je Viertelstunde und IP, und die Reihe dort sitzt seit C4 mit genau zehn auf
# der Grenze. Dieser Lauf braucht EINE (den Administrator); der Browser bekommt
# seine Sitzung fertig gereicht und meldet sich gar nicht an.
#
# NICHT IN DERSELBEN VIERTELSTUNDE WIE `shell-`, `dashboard-`, `admin-` ODER
# `app-admin-abnahme.sh`.
#
# WAS LANGE DAUERT: die Sicherung. `backup.sh` laeuft im Sicherungs-Container
# ueber die Datenbank, die App-Pakete und die Flows; am Orin sind das Minuten.
# Die Geduld unten ist grosszuegig und misst nicht das Geraet, sie gibt ihm
# Zeit.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/system-abnahme.sh
#
# Auf dem Geraet:
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 ARASUL_PASSWORT=... \
#     bash scripts/test/system-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin.
#
# Nicht zerstoerend: es entsteht eine zusaetzliche Sicherung, und sonst nichts.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
KURZLISTE="$WURZEL/config/modelle/kurzliste.json"
SITZUNG_A="${TMPDIR:-/tmp}/arasul-d5-admin.json"

gruen=0
rot=0

pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF`. Bewusst ohne
# Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution ist eine
# Subshell, und `$CODE` waere beim naechsten Befehl wieder weg (Falle aus der
# Messung zu C2).
RUMPF="$(mktemp)"
CODE=""
trap 'rm -f "$RUMPF" "$SITZUNG_A"' EXIT

ruf() {
  local verb="$1" pfad="$2" token="$3"
  CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' -X "$verb" --max-time 60 \
    -H "authorization: Bearer $token" "$BASIS$pfad")
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme A6: Modelle und System (Phase D5) gegen $BASIS ==="
echo

# --- 1. Anmeldung und der Stand VOR dem Lauf --------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (429 heisst Anmeldedrossel)."; exit 1; }

ruf GET /api/backup/sicherungen "$TOK"
if [ "$CODE" != "200" ]; then
  echo "GET /api/backup/sicherungen antwortet HTTP $CODE."
  echo "Ohne den Sicherungsdienst gibt es hier nichts zu messen."
  exit 1
fi
VORHER_ANZAHL=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("anzahl",0))' \
  < "$RUMPF" 2>/dev/null)
VORHER_NEUESTE=$(python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[0]["zeitpunkt"] if d else "")' < "$RUMPF" 2>/dev/null)
printf 'gefunden  %s Sicherungen, neueste %s\n' "${VORHER_ANZAHL:-0}" "${VORHER_NEUESTE:-keine}"

# --- 2. Die Kurzliste und der Standard --------------------------------------
# Die Erwartung kommt aus der DATEI und nicht aus dem Katalog des Geraets:
# sonst pruefte die Abnahme den Katalog gegen sich selbst. `kurzliste.py` haelt
# Datei und Migration aneinander; hier geht es darum, ob die OBERFLAECHE zeigt,
# was die Zusage sagt.
MODELLE=$(python3 -c 'import sys,json
d=json.load(open(sys.argv[1]))
print(",".join(m["id"] for m in d["modelle"]))' "$KURZLISTE" 2>/dev/null)
pruefe 'Die Kurzliste steht als Datei im Repo' \
  "$([ -n "$MODELLE" ] && echo ja || echo nein)" "${MODELLE:-nichts gelesen}"
[ -z "$MODELLE" ] && { echo; echo "Ohne die Kurzliste gibt es keine Erwartung."; exit 1; }

ruf GET /api/models/default "$TOK"
STANDARD=$(python3 -c 'import sys,json
d=json.load(sys.stdin).get("default_model")
print(d or "")' < "$RUMPF" 2>/dev/null)
pruefe 'Das Geraet nennt ein Standardmodell' \
  "$([ -n "$STANDARD" ] && echo ja || echo nein)" "${STANDARD:-keines} (HTTP $CODE)"

# DER FUND DER D5-ABNAHME AM ORIN (28.08.2026), hier festgehalten. Das
# Abzeichen „Standard" sass auf `llava-phi3`, obwohl die Kurzliste Qwen als
# Standard der Flows fuehrt. Der Grund lag in `getDefaultModel()`: Migration
# 175 setzt `is_default` nur, wenn der Standard zum Zeitpunkt der Migration
# schon auf der Platte liegt, und die Rueckfaelle danach nahmen schlicht das
# ZULETZT geladene Modell -- das kleinste, also das Bildmodell.
#
# Ein Bild- oder Einbettungsmodell kann den Standard der Flows nicht
# ausfuellen; die Ansicht sagt das selbst (`ModellZeile.kannStandardSein`) und
# zeigte daneben genau so eines als Standard an. Gemessen wird deshalb nicht
# nur, DASS ein Standard da ist, sondern dass ein Flow damit rechnen kann.
AUFGABE=$(python3 -c 'import sys,json
d=json.load(open(sys.argv[1]))
print(next((m["aufgabe"] for m in d["modelle"] if m["id"] == sys.argv[2]), "unbekannt"))' \
  "$KURZLISTE" "$STANDARD" 2>/dev/null)
pruefe 'und es ist eines, mit dem ein Flow rechnen kann' \
  "$([ "$AUFGABE" = "text" ] || [ "$AUFGABE" = "coding" ] && echo ja || echo nein)" \
  "Aufgabe $AUFGABE"

# --- 3. Der Browser ----------------------------------------------------------
# OHNE PLAYWRIGHT GIBT ES HIER NICHTS ZU MESSEN. Diese Abnahme misst die
# Oberflaeche; ein gruener Lauf ohne sie waere eine Aussage ueber nichts.
if ! node -e 'require.resolve("playwright")' 2>/dev/null; then
  echo "Playwright fehlt. Diese Abnahme misst den Browser; ohne ihn gibt es"
  echo "nichts zu messen. Erst: npm ci"
  exit 1
fi

(
  # In einer Subshell, damit der Name NUR hier gilt: `$ARASUL_SITZUNG` traegt
  # sonst die Sitzung, die sich die ganze Reihe teilt.
  # shellcheck disable=SC2034  # von `arasul_sitzung_bauen` aus der Umgebung gelesen
  ARASUL_SITZUNG="$SITZUNG_A"
  arasul_sitzung_bauen "$TOK"
)
pruefe 'Die Sitzung des Administrators fuer den Browser' \
  "$([ -s "$SITZUNG_A" ] && echo ja || echo nein)" "$SITZUNG_A"
[ -s "$SITZUNG_A" ] || { echo; echo "Ohne Sitzung faehrt der Browser nicht."; exit 1; }

if ARASUL_URL="$BASIS" ARASUL_SITZUNG="$SITZUNG_A" ARASUL_MODELLE="$MODELLE" \
   ARASUL_STANDARD="$STANDARD" node "$WURZEL/scripts/test/system-bilder.mjs"; then
  pruefe 'Im Browser: Kurzliste, Fassung, Sicherung ausgeloest' ja \
    'docs/plans/audits/'
else
  pruefe 'Im Browser: Kurzliste, Fassung, Sicherung ausgeloest' nein \
    'system-bilder.mjs war rot'
fi

# --- 4. Was daraus geworden ist ---------------------------------------------
# Ab hier misst das Skript den ZUSTAND, nicht die Bedienung: der Browser kann
# gruen gemeldet haben und trotzdem nichts bewirkt haben.
ruf GET /api/backup/sicherungen "$TOK"
NACHHER_ANZAHL=$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("anzahl",0))' \
  < "$RUMPF" 2>/dev/null)
NACHHER_NEUESTE=$(python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[0]["zeitpunkt"] if d else "")' < "$RUMPF" 2>/dev/null)

# Mehr Dateien ODER eine juengere neueste: die Sicherung raeumt alte Staende
# nach ihrer Aufbewahrungsfrist weg, und dann bleibt die ANZAHL gleich,
# obwohl gerade eine entstanden ist.
NEU=nein
if [ "${NACHHER_ANZAHL:-0}" -gt "${VORHER_ANZAHL:-0}" ]; then
  NEU=ja
elif [ -n "$NACHHER_NEUESTE" ] && [ "$NACHHER_NEUESTE" != "$VORHER_NEUESTE" ]; then
  NEU=ja
fi
pruefe 'Am Geraet liegt danach eine neue Sicherung' "$NEU" \
  "vorher $VORHER_ANZAHL/${VORHER_NEUESTE:-keine}, jetzt $NACHHER_ANZAHL/${NACHHER_NEUESTE:-keine}"

ruf GET /api/backup/status "$TOK"
SICHERT=$(python3 -c 'import sys,json
print(json.dumps(json.load(sys.stdin)["data"]["sichertWirklich"]))' < "$RUMPF" 2>/dev/null)
ALTER=$(python3 -c 'import sys,json
print(json.load(sys.stdin)["data"]["letzteSicherung"].get("alterStunden"))' < "$RUMPF" 2>/dev/null)
pruefe 'und der Zustand sagt: dieses Geraet sichert wirklich' \
  "$([ "$SICHERT" = "true" ] && echo ja || echo nein)" \
  "sichertWirklich=$SICHERT, letzte vor ${ALTER}h"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
