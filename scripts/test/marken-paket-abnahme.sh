#!/bin/bash
# =============================================================================
# Ein frisches Projekt nimmt das Paket und baut (Phase H6, 29.08.2026)
# =============================================================================
# Die Bibliothek `packages/marken/` traegt die Oberflaeche dieses Geraets, und
# seit H6 geht sie als PAKET hinaus: an das Ara-Kit, das sie in seine Vorlage
# spiegelt, und an jede App, die ein Partner daraus baut. Ob das wirklich geht,
# beantwortet in diesem Repo niemand -- hier steht die Shell daneben, mit ihrem
# Alias, ihrer `package.json`, ihrem `index.css` und ihrem `node_modules`. Ein
# Paket, das nur in seinem eigenen Repo baut, ist keins.
#
# Diese Reihe stellt deshalb her, was ein Partner hat, und sonst nichts:
#
#   1. das Paket bauen (`scripts/deploy/marken-paket.py`)
#   2. AUSSERHALB dieses Repos ein frisches Vite-Projekt anlegen -- eine
#      `index.html`, ein Einstieg, ein Stylesheet, mehr nicht
#   3. die Abhaengigkeiten holen, die der STEMPEL nennt (nicht die, die dieses
#      Repo zufaellig installiert hat)
#   4. die Quelle als `src/marken/` hineinlegen, wie das Kit es tut
#   5. `tsc --noEmit` und `vite build`
#   6. nachsehen, ob im Ergebnis wirklich etwas von der Bibliothek steht
#
# Schritt 5 misst zwei verschiedene Dinge: `tsc` fragt, ob das Paket
# VOLLSTAENDIG ist (ein Import ins Leere ist hier ein Fehler und in der Shell
# nur ein Alias, der zufaellig noch trifft), `vite build` fragt, ob Tailwind
# die Klassen der Primitive findet -- ohne die Tokens aus `theme.css` steht
# jedes Primitiv da und sieht nach nichts aus, und nichts daran waere rot.
#
# BRAUCHT NETZ (npm install) und laeuft deshalb nicht in `run-tests.sh`,
# sondern in der CI neben dem Bau des Artefakts.
#
#   bash scripts/test/marken-paket-abnahme.sh
#
# Rueckgabe 0, wenn das frische Projekt baut.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cd .. && pwd)"

BAUPLATZ="$(mktemp -d)"
trap 'rm -rf "$BAUPLATZ"' EXIT
PAKET="$BAUPLATZ/paket"
PROJEKT="$BAUPLATZ/frisches-projekt"

rot() { echo "  FAIL  $*"; FEHLER=$((FEHLER + 1)); }
gruen() { echo "  ok    $*"; }
FEHLER=0

echo ""
echo "===  Marken-Paket: ein frisches Projekt baut damit  ==="
echo "  Bauplatz: $BAUPLATZ"

# --- 1. Das Paket ------------------------------------------------------------
if ! python3 "$WURZEL/scripts/deploy/marken-paket.py" --wurzel "$WURZEL" --ausgabe "$PAKET"; then
  echo "  Das Paket liess sich nicht bauen. Ohne es misst der Rest nichts."
  exit 1
fi

# --- 2. Das frische Projekt --------------------------------------------------
# Die Werkzeugversionen kommen aus der `package.json` der Shell und nicht aus
# einer zweiten Liste hier: sonst misst diese Reihe irgendwann ein Vite, das
# das Geraet gar nicht benutzt. Die Versionen der BIBLIOTHEK kommen dagegen
# aus dem Stempel -- das ist die Auskunft, die ein Partner bekommt, und genau
# die soll gemessen werden.
mkdir -p "$PROJEKT/src"
python3 - "$WURZEL" "$PAKET" "$PROJEKT" <<'PY'
import json, sys
from pathlib import Path

wurzel, paket, projekt = (Path(p) for p in sys.argv[1:4])
shell = json.loads((wurzel / 'apps' / 'dashboard-frontend' / 'package.json').read_text())
alle = {**shell.get('dependencies', {}), **shell.get('devDependencies', {})}
stempel = json.loads((paket / 'marken.json').read_text())

werkzeug = ['vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'typescript',
            '@types/react', '@types/react-dom', 'react', 'react-dom']
fehlt = [n for n in werkzeug if n not in alle]
if fehlt:
    raise SystemExit(f'Die package.json der Shell nennt nicht: {", ".join(fehlt)}')

(projekt / 'package.json').write_text(json.dumps({
    'name': 'frisches-projekt',
    'private': True,
    'type': 'module',
    'version': '0.0.0',
    'scripts': {'build': 'vite build', 'typecheck': 'tsc --noEmit'},
    'dependencies': dict(sorted({**stempel['abhaengigkeiten'],
                                 'react': alle['react'],
                                 'react-dom': alle['react-dom']}.items())),
    'devDependencies': {n: alle[n] for n in sorted(werkzeug) if n not in ('react', 'react-dom')},
}, indent=2) + '\n')

# Dieselben Uebersetzeroptionen wie die Bibliothek selbst (packages/marken/
# tsconfig.json). Weicher waere Gruen-Dribbeln: ein Paket, das nur ohne
# `strict` uebersetzt, ist fuer eine Fachanwendung unbrauchbar.
(projekt / 'tsconfig.json').write_text(json.dumps({
    'compilerOptions': {
        'target': 'ES2022', 'lib': ['ES2022', 'DOM', 'DOM.Iterable'],
        'module': 'ESNext', 'moduleResolution': 'Bundler', 'jsx': 'react-jsx',
        'strict': True, 'noUncheckedIndexedAccess': True, 'noEmit': True,
        'esModuleInterop': True, 'skipLibCheck': True, 'isolatedModules': True,
        'types': [],
    },
    'include': ['src'],
}, indent=2) + '\n')
PY
if [ $? -ne 0 ]; then
  echo "  Das frische Projekt liess sich nicht beschreiben."
  exit 1
fi

cat > "$PROJEKT/vite.config.ts" <<'EOF'
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [tailwindcss(), react()] });
EOF

cat > "$PROJEKT/index.html" <<'EOF'
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Frisches Projekt</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

# Genau die vier Zeilen aus `EINBAU.md`. Weicht diese Datei davon ab, misst die
# Reihe eine Anleitung, die es nicht gibt.
cat > "$PROJEKT/src/stil.css" <<'EOF'
@import 'tailwindcss';
@import 'tw-animate-css';
@import './marken/theme.css';
@import './marken/marken.css' layer(components);
@source './marken';
EOF

# Aus jedem der drei Saetze eines: ein Primitiv, ein Muster, ein Baustein. Ein
# Einstieg, der nur `Button` holt, liesse die zwei Ordner ungeprueft, die im
# Spiegel des Kits bis H6 gar nicht ankamen.
cat > "$PROJEKT/src/main.tsx" <<'EOF'
import { createRoot } from 'react-dom/client';
import { Button, Datenliste, Karte, Kopf, FASSUNG } from './marken';
import './stil.css';

type Zeile = { id: string; name: string };

function App() {
  const zeilen: Zeile[] = [{ id: '1', name: 'Erste' }];
  return (
    <Karte titel={`Bibliothek ${FASSUNG}`}>
      <Kopf titel="Frisches Projekt" />
      <Datenliste
        daten={zeilen}
        kennung={(z: Zeile) => z.id}
        beschriftung="Zeilen des frischen Projekts"
        spalten={[{ schluessel: 'name', titel: 'Name', zelle: (z: Zeile) => z.name }]}
      />
      <Button variant="secondary">Knopf</Button>
    </Karte>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
EOF

cp -R "$PAKET/src" "$PROJEKT/src/marken" || exit 1

# --- 3. Holen, uebersetzen, bauen -------------------------------------------
echo ""
echo "  npm install (Abhaengigkeiten aus dem Stempel)"
if ! (cd "$PROJEKT" && npm install --no-audit --no-fund >"$BAUPLATZ/install.log" 2>&1); then
  tail -30 "$BAUPLATZ/install.log"
  rot "npm install im frischen Projekt"
  echo ""
  echo "  RESULT: FAILED"
  exit 1
fi
gruen "npm install"

echo "  tsc --noEmit"
if (cd "$PROJEKT" && npx tsc --noEmit >"$BAUPLATZ/tsc.log" 2>&1); then
  gruen "das Paket uebersetzt fuer sich allein"
else
  tail -40 "$BAUPLATZ/tsc.log"
  rot "tsc: das Paket ist nicht vollstaendig"
fi

echo "  vite build"
if (cd "$PROJEKT" && npx vite build >"$BAUPLATZ/vite.log" 2>&1); then
  gruen "vite build"
else
  tail -40 "$BAUPLATZ/vite.log"
  rot "vite build"
fi

# --- 4. Steht im Ergebnis wirklich die Bibliothek? --------------------------
# Ein gruener Bau ohne diese Frage waere ein Bau, der auch gruen waere, wenn
# Tailwind die Klassen der Primitive nie gesehen haette.
CSS=$(find "$PROJEKT/dist" -name '*.css' 2>/dev/null | head -1)
JS=$(find "$PROJEKT/dist" -name '*.js' 2>/dev/null | head -1)

if [ -z "$CSS" ] || [ -z "$JS" ]; then
  rot "im Bau liegt kein CSS oder kein JS"
else
  # Der Baustein bringt seine eigene Regel mit (`marken.css`), das Primitiv
  # bekommt seine von Tailwind aus `theme.css`, und das Theme muss beides
  # kennen.
  grep -q '\.ara-karte' "$CSS" && gruen "die Regeln der Bausteine stehen im CSS" ||
    rot "im CSS fehlt .ara-karte -- marken.css ist nicht angekommen"
  grep -q -- '--background' "$CSS" && gruen "die Tokens aus theme.css stehen im CSS" ||
    rot "im CSS fehlt --background -- theme.css ist nicht angekommen"
  grep -q "data-theme='dark'\|data-theme=\"dark\"\|\[data-theme=dark\]" "$CSS" &&
    gruen "das dunkle Theme steht im CSS" ||
    rot "im CSS fehlt das dunkle Theme"
  grep -q 'bg-secondary' "$CSS" && gruen "Tailwind hat die Klassen der Primitive gefunden" ||
    rot "im CSS fehlt bg-secondary -- Tailwind hat src/marken/ nicht gelesen"
  grep -q 'ara-karte' "$JS" && gruen "die Bausteine stehen im Buendel" ||
    rot "im Buendel fehlt ara-karte"
fi

# Und der zweite Weg: eine App OHNE Bau bekommt zwei fertige Dateien.
for datei in browser/marken.js src/marken.css; do
  [ -s "$PAKET/$datei" ] && gruen "das Paket traegt $datei" ||
    rot "im Paket fehlt $datei -- eine App ohne Bau bekaeme nichts"
done

echo ""
if [ "$FEHLER" -gt 0 ]; then
  echo "  $FEHLER Befund(e)."
  echo "  RESULT: FAILED"
  exit 1
fi
echo "  RESULT: PASSED"
