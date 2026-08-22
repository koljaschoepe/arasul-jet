#!/bin/bash
# ============================================================================
# erweiterung — das Geruest fuer eine Arasul-Erweiterung (Plan 023 H2).
#
# Die Abnahme aus dem Plan lautet: "Vom leeren Projekt bis zur sichtbaren,
# funktionierenden Anwendung im Tab in unter zehn Minuten, ohne Wissen ueber
# den Aufbau des Manifests."
#
# "Ohne Wissen ueber den Aufbau" heisst: dieser Befehl schreibt das Manifest,
# und er sagt anschliessend, was von selbst passiert. Der Werkstatt-Watcher
# registriert den Ordner naemlich ohne Zutun, und ohne diesen Satz wartet der
# Nutzer auf einen Knopf, den es nicht gibt.
#
#   erweiterung neu <id> [--typ app|flow|tool] [--name "Anzeigename"]
#   erweiterung pruefen [ordner]
#   erweiterung kette
#
# WARUM DIE PRUEFUNG HIER DOPPELT STEHT: die Wahrheit ueber ein gueltiges
# Manifest steht im Backend (extensionPackage.validiereManifest). Dieses
# Skript laeuft in der Sandbox und kommt dort nicht heran. Es prueft deshalb
# dieselben Regeln noch einmal, und scripts/test/geruest-regeln.py haelt beide
# Seiten zusammen: weichen sie ab, faellt die CI um.
# ============================================================================
set -euo pipefail

VORLAGEN="${ARASUL_VORLAGEN_DIR:-/workspace/projekt}"
# Regeln, gespiegelt aus apps/dashboard-backend/src/services/extensions/extensionPackage.js
ID_MUSTER='^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'
TYPEN="app flow tool"
STUFEN="internet internal full"
FAEHIGKEITEN="llm rag dateien flows netz tabellen zeitplan"
PAKETFORMAT=1

rot() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
gruen() { printf '\033[32m%s\033[0m\n' "$*"; }

kette() {
  cat <<'ENDE'

Was jetzt von selbst passiert:

  1. Der Werkstatt-Watcher sieht den Ordner (spaetestens nach 15 Sekunden)
     und registriert die Erweiterung. Du musst nichts hochladen.
  2. Sie erscheint unter "Erweiterungen" im Katalog, und zwar AUSGESCHALTET.
     Das ist Absicht: nichts geht ungefragt live.
  3. Einschalten. Deklarierte Faehigkeiten musst du dabei einmal freigeben.
  4. Danach steht sie links in der Leiste, und ein Klick oeffnet ihren Tab.

Aenderst du index.html, ist die Aenderung nach dem naechsten Watcher-Takt
drin. Neu einschalten musst du nicht.
ENDE
}

neu() {
  local id="${1:-}" typ="app" anzeige=""
  shift || true
  while [ $# -gt 0 ]; do
    case "$1" in
      --typ) typ="${2:-}"; shift 2 ;;
      --name) anzeige="${2:-}"; shift 2 ;;
      *) rot "Unbekannte Option: $1"; return 2 ;;
    esac
  done

  if [ -z "$id" ]; then
    rot "Aufruf: erweiterung neu <id> [--typ app|flow|tool] [--name \"Anzeigename\"]"
    return 2
  fi
  if ! [[ "$id" =~ $ID_MUSTER ]]; then
    rot "Ungueltige Id: \"$id\""
    rot "Erlaubt: Kleinbuchstaben, Ziffern und Bindestriche, 1 bis 50 Zeichen,"
    rot "kein Bindestrich am Anfang oder Ende."
    return 2
  fi
  case " $TYPEN " in *" $typ "*) ;; *) rot "Unbekannter Typ: $typ (erlaubt: $TYPEN)"; return 2 ;; esac

  local ziel="./$id"
  if [ -e "$ziel" ]; then
    rot "\"$ziel\" gibt es schon. Anderen Namen waehlen oder den Ordner loeschen."
    return 1
  fi

  local quelle="$VORLAGEN/beispiel-$typ"
  if [ ! -d "$quelle" ]; then
    rot "Vorlage nicht gefunden: $quelle"
    rot "Dieser Befehl gehoert in eine Erweiterungs-Werkstatt."
    return 1
  fi

  cp -r "$quelle" "$ziel"
  [ -z "$anzeige" ] && anzeige="$id"

  # Das Manifest neu schreiben, statt im Kopierten herumzuschneiden: so steht
  # genau drin, was drinstehen soll, und nichts aus der Vorlage bleibt haengen.
  local eintrag
  eintrag=$(python3 - "$ziel" <<'PY'
import json, sys, pathlib
alt = json.loads((pathlib.Path(sys.argv[1]) / 'manifest.json').read_text())
print(alt.get('entry', 'index.html'))
PY
)
  python3 - "$ziel/manifest.json" "$id" "$anzeige" "$typ" "$eintrag" "$PAKETFORMAT" <<'PY'
import json, sys
pfad, ident, name, typ, eintrag, format_version = sys.argv[1:7]
json.dump({
    'id': ident,
    'name': name,
    'description': f'{name} — noch ohne Beschreibung.',
    'type': typ,
    'accessTier': 'internet',
    'version': '0.1.0',
    'arasulExtensionVersion': int(format_version),
    'entry': eintrag,
    'faehigkeiten': [],
}, open(pfad, 'w'), ensure_ascii=False, indent=2)
open(pfad, 'a').write('\n')
PY

  gruen "Geruest angelegt: $ziel"
  echo "  Typ:        $typ"
  echo "  Startdatei: $eintrag"
  echo "  Zugriff:    internet (die niedrigste Stufe, spaeter anpassbar)"
  echo ""
  echo "Faehigkeiten sind absichtlich leer. Brauchst du eine, trag sie im"
  echo "Manifest ein: $FAEHIGKEITEN"
  kette
}

pruefen() {
  local ordner="${1:-.}"
  local datei="$ordner/manifest.json"
  if [ ! -f "$datei" ]; then
    rot "Kein manifest.json in \"$ordner\"."
    return 1
  fi
  ARASUL_ID_MUSTER="$ID_MUSTER" ARASUL_TYPEN="$TYPEN" ARASUL_STUFEN="$STUFEN" \
  ARASUL_FAEHIGKEITEN="$FAEHIGKEITEN" ARASUL_FORMAT="$PAKETFORMAT" \
  python3 - "$datei" "$ordner" <<'PY'
import json, os, re, sys, pathlib

datei, ordner = sys.argv[1], sys.argv[2]
fehler = []
try:
    m = json.loads(pathlib.Path(datei).read_text())
except Exception as e:
    print(f'manifest.json ist kein gueltiges JSON: {e}', file=sys.stderr)
    sys.exit(1)

if not re.match(os.environ['ARASUL_ID_MUSTER'], str(m.get('id', ''))):
    fehler.append(f'"id" ist ungueltig: {m.get("id")!r}')
for feld in ('name', 'description', 'version', 'entry'):
    if not str(m.get(feld, '')).strip():
        fehler.append(f'"{feld}" fehlt oder ist leer')
if m.get('type') not in os.environ['ARASUL_TYPEN'].split():
    fehler.append(f'"type" muss eines von {os.environ["ARASUL_TYPEN"]} sein')
if m.get('accessTier') not in os.environ['ARASUL_STUFEN'].split():
    fehler.append(f'"accessTier" muss eines von {os.environ["ARASUL_STUFEN"]} sein')
if int(m.get('arasulExtensionVersion', os.environ['ARASUL_FORMAT'])) != int(os.environ['ARASUL_FORMAT']):
    fehler.append(f'"arasulExtensionVersion" muss {os.environ["ARASUL_FORMAT"]} sein')

eintrag = str(m.get('entry', ''))
if eintrag.startswith('/') or '..' in eintrag.split('/'):
    fehler.append('"entry" muss ein relativer Pfad IM Paket sein')
elif eintrag and not (pathlib.Path(ordner) / eintrag).exists():
    fehler.append(f'"entry" zeigt auf {eintrag}, aber die Datei gibt es nicht')

erlaubt = os.environ['ARASUL_FAEHIGKEITEN'].split()
f = m.get('faehigkeiten', [])
if not isinstance(f, list):
    fehler.append('"faehigkeiten" muss eine Liste sein')
else:
    for eintrag_f in f:
        if eintrag_f not in erlaubt:
            fehler.append(f'unbekannte Faehigkeit {eintrag_f!r}, erlaubt: {" ".join(erlaubt)}')

if fehler:
    for z in fehler:
        print(f'  {z}', file=sys.stderr)
    sys.exit(1)
PY
  gruen "manifest.json in \"$ordner\" ist in Ordnung."
  kette
}

case "${1:-}" in
  neu) shift; neu "$@" ;;
  pruefen) shift; pruefen "$@" ;;
  kette) kette ;;
  *)
    cat <<'ENDE'
erweiterung — Geruest fuer eine Arasul-Erweiterung

  erweiterung neu <id> [--typ app|flow|tool] [--name "Anzeigename"]
      Legt einen Ordner mit fertigem Manifest an.

  erweiterung pruefen [ordner]
      Prueft ein manifest.json, bevor der Watcher es still ablehnt.

  erweiterung kette
      Zeigt, was nach dem Anlegen von selbst passiert.

Ausfuehrlich: ANLEITUNG.md in dieser Werkstatt.
ENDE
    ;;
esac
