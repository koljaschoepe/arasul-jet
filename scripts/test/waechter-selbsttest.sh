#!/bin/bash
# =============================================================================
# Selbsttest der Waechter (Plan 023, aus der Review von #433)
# =============================================================================
# Ein Waechter, der niemand prueft, meldet irgendwann Ruhe, ohne dass es
# auffaellt. Genau das ist zweimal passiert und beide Male erst spaet gefunden:
# der Suchbereich von bausteine.py war kleiner als sein Anspruch, und
# plan-faden.py zaehlte nur, was es als Plan erkannte.
#
# Dieses Skript baut Beispiele in einem Wegwerfordner und prueft, dass jeder
# Waechter dabei ROT wird. Es prueft NICHT, ob er an echtem Code gruen ist, das
# tun die Waechter selbst im normalen Lauf.
#
# Rueckgabe: 0 wenn jeder Waechter jeden Fall gefunden hat, 1 sonst.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FEHLER=0

TMP="$(mktemp -d -t arasul-waechter.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# Erwartet: Beschreibung, erwarteter Rueckgabewert, dann der Befehl.
pruefe() {
  local was="$1" soll="$2"; shift 2
  "$@" >/dev/null 2>&1
  local ist=$?
  if [ "$ist" = "$soll" ]; then
    echo "   ok    $was"
  else
    echo "   FEHLT $was (erwartet $soll, bekommen $ist)"
    FEHLER=1
  fi
}

echo ""
echo "-> Selbsttest der Waechter..."

# --- plan-faden.py ----------------------------------------------------------
mkdir -p "$TMP/faden/docs/plans/active/023-beispiel"
echo "# Plan" > "$TMP/faden/docs/plans/active/023-beispiel/plan.md"
pruefe "Faden: genau ein Plan ist gruen" 0 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

echo "# Zweiter" > "$TMP/faden/docs/plans/active/024-zweiter.md"
pruefe "Faden: zwei Plaene sind rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"
rm "$TMP/faden/docs/plans/active/024-zweiter.md"

mkdir -p "$TMP/faden/docs/plans/active/anhang"
pruefe "Faden: Ordner ohne plan.md ist rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"
rmdir "$TMP/faden/docs/plans/active/anhang"

rm -r "$TMP/faden/docs/plans/active/023-beispiel"
pruefe "Faden: leerer Ordner ist rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

# --- bausteine.py -----------------------------------------------------------
BAU="$TMP/bau/apps/dashboard-frontend/src/features/beispiel"
mkdir -p "$BAU"
echo 'export const A = () => <p>nichts</p>;' > "$BAU/Sauber.tsx"
pruefe "Bausteine: sauberer Code ist gruen" 0 python3 "$WURZEL/scripts/test/bausteine.py" --pfad "$TMP/bau"

for schreibweise in 'role="dialog"' "role='dialog'" "role={'dialog'}" 'role={"dialog"}'; do
  printf 'export const B = () => <div %s />;\n' "$schreibweise" > "$BAU/Dialog.tsx"
  pruefe "Bausteine: $schreibweise ist rot" 1 python3 "$WURZEL/scripts/test/bausteine.py" --pfad "$TMP/bau"
done
rm "$BAU/Dialog.tsx"

echo 'export const C = () => <h1>Titel</h1>;' > "$BAU/Titel.tsx"
pruefe "Bausteine: <h1> von Hand ist rot" 1 python3 "$WURZEL/scripts/test/bausteine.py" --pfad "$TMP/bau"
rm "$BAU/Titel.tsx"

# Der Suchbereich: bis zum 20.08.2026 blieb alles ausser features/ und
# components/layout/ ungeprueft, und genau darin sass ein handgebauter Dialog.
TIEF="$TMP/bau/apps/dashboard-frontend/src/components/editor"
mkdir -p "$TIEF"
echo 'export const D = () => <div role="dialog" />;' > "$TIEF/Tief.tsx"
pruefe "Bausteine: auch ausserhalb von features/ wird gesucht" 1 python3 "$WURZEL/scripts/test/bausteine.py" --pfad "$TMP/bau"
rm "$TIEF/Tief.tsx"

# components/ui/ ist der Ort der Bausteine selbst und bleibt ausgenommen.
UI="$TMP/bau/apps/dashboard-frontend/src/components/ui"
mkdir -p "$UI"
echo 'export const E = () => <div role="dialog" />;' > "$UI/Modal.tsx"
pruefe "Bausteine: components/ui bleibt ausgenommen" 0 python3 "$WURZEL/scripts/test/bausteine.py" --pfad "$TMP/bau"

# --- modellnamen.py ---------------------------------------------------------
MOD="$TMP/mod/apps/dashboard-frontend/src/features/beispiel"
mkdir -p "$MOD"

# Ohne Modellbezug ist "m.name" ein Flow oder eine Datei, kein Befund.
echo 'export const A = ({ m }) => <span>{m.name}</span>;' > "$MOD/Fremd.tsx"
pruefe "Namensregister: Datei ohne Modellbezug bleibt still" 0 python3 "$WURZEL/scripts/test/modellnamen.py" --pfad "$TMP/mod"

printf 'import type { CatalogModel } from "x";\nexport const B = ({ model }: { model: CatalogModel }) => <span>{model.name}</span>;\n' > "$MOD/Roh.tsx"
pruefe "Namensregister: {model.name} in einer Modellflaeche ist rot" 1 python3 "$WURZEL/scripts/test/modellnamen.py" --pfad "$TMP/mod"

printf 'import type { CatalogModel } from "x";\nexport const B = ({ model }: { model: CatalogModel }) => <span>{modellAnzeigeName(model)}</span>;\n' > "$MOD/Roh.tsx"
pruefe "Namensregister: ueber modellAnzeigeName ist gruen" 0 python3 "$WURZEL/scripts/test/modellnamen.py" --pfad "$TMP/mod"
rm "$MOD/Roh.tsx"

printf 'const x = "/models/catalog";\nconst y = modelName || modelId;\n' > "$MOD/Rueckfall.ts"
pruefe "Namensregister: Rueckfall auf die Kennung ist rot" 1 python3 "$WURZEL/scripts/test/modellnamen.py" --pfad "$TMP/mod"
rm "$MOD/Rueckfall.ts"

# Das Register selbst darf, es ist die Quelle.
mkdir -p "$TMP/mod/apps/dashboard-frontend/src/utils"
printf 'export interface ModellAnzeige { id: string }\nexport const f = (m) => m.name;\n' > "$TMP/mod/apps/dashboard-frontend/src/utils/modelDisplay.ts"
pruefe "Namensregister: das Register selbst bleibt ausgenommen" 0 python3 "$WURZEL/scripts/test/modellnamen.py" --pfad "$TMP/mod"

# --- einheiten.py -----------------------------------------------------------
EIN="$TMP/ein/apps/dashboard-frontend/src/features/beispiel"
mkdir -p "$EIN"

echo 'export const A = () => <span>{formatBytes(x)}</span>;' > "$EIN/Sauber.tsx"
pruefe "Einheiten: ueber die gemeinsame Funktion ist gruen" 0 python3 "$WURZEL/scripts/test/einheiten.py" --pfad "$TMP/ein"

printf 'const s = `${(b / 1024 / 1024).toFixed(1)} MB`;\n' > "$EIN/Eigen.tsx"
pruefe "Einheiten: eigene 1024er-Rechnung mit Etikett ist rot" 1 python3 "$WURZEL/scripts/test/einheiten.py" --pfad "$TMP/ein"
rm "$EIN/Eigen.tsx"

printf 'const s = `${(b / 1_000_000).toFixed(0)} MB`;\n' > "$EIN/Eigen.ts"
pruefe "Einheiten: eigene Tausender-Rechnung mit Etikett ist rot" 1 python3 "$WURZEL/scripts/test/einheiten.py" --pfad "$TMP/ein"
rm "$EIN/Eigen.ts"

# Eine Grenze ohne Beschriftung ist keine Anzeige.
printf 'const MAX_FILE_SIZE = 50 * 1024 * 1024;\n' > "$EIN/Grenze.ts"
pruefe "Einheiten: eine Grenze ohne Etikett bleibt still" 0 python3 "$WURZEL/scripts/test/einheiten.py" --pfad "$TMP/ein"
rm "$EIN/Grenze.ts"

# Die beiden Quellen selbst duerfen rechnen.
mkdir -p "$TMP/ein/apps/dashboard-frontend/src/utils"
printf 'export const f = (b) => `${(b / 1024).toFixed(0)} KB`;\n' > "$TMP/ein/apps/dashboard-frontend/src/utils/formatting.ts"
pruefe "Einheiten: die Quelle selbst bleibt ausgenommen" 0 python3 "$WURZEL/scripts/test/einheiten.py" --pfad "$TMP/ein"

if [ "$FEHLER" = "0" ]; then
  echo "   Selbsttest der Waechter: bestanden"
else
  echo "   Selbsttest der Waechter: FEHLGESCHLAGEN"
fi
exit "$FEHLER"
