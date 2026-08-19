#!/bin/bash
# =============================================================================
# Toter Code, wiederholbar (Plan 023 B3)
# =============================================================================
# Zwei getrennte Fragen, weil sie verschiedene Antworten verlangen:
#
#   1. Datei ohne JEDEN Importeur  → toter Code, kommt weg.
#   2. Datei nur von Tests benutzt → gebaut, aber nicht angeschlossen. Kein
#      toter Code, aber auch keine Funktion. Braucht eine Entscheidung, keine
#      Loeschung.
#
# Beim ersten Bauen hat dieses Skript Tests aus der SUCHE ausgeschlossen statt
# nur aus der PRUEFUNG. Ergebnis: `src/server.js` galt als tot, obwohl fuenf
# Tests es einbinden. Tests sind Importeure.
#
# Portabilitaet: macOS bringt BSD-grep und BSD-sed, die CI Linux mit GNU. `\|`
# in einfachen Ausdruecken und `\?` in sed gibt es nur unter GNU; beide
# Unterschiede haben hier 189 falsche Treffer erzeugt. Deshalb ueberall -E.
#
# Was das Skript NICHT findet: einzelne ungenutzte Exporte in einer sonst
# genutzten Datei, und Code, der nur ueber einen dynamisch gebauten Namen
# erreicht wird. Es ist eine Untergrenze, keine Garantie.
#
# Rueckgabe: 1, wenn eine Datei ohne jeden Importeur uebrig bleibt.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Bewusste Ausnahmen. Jede Zeile: Pfad|Grund. Ohne Grund waechst die Liste zum
# zweiten Friedhof.
AUSNAHMEN=(
  "src/index.tsx|Einstiegspunkt, referenziert von index.html"
  "src/setupTests.ts|von vite.config.ts als setupFiles geladen"
  "src/index.js|Einstiegspunkt des Dienstes"
)

# Nur von Tests benutzt, bewusst behalten. Jede Zeile: Pfad|Grund.
NUR_TESTS_OK=(
  "src/server.js|existiert genau dafuer: reicht die App an Integrationstests durch"
  "src/utils/urlGuard.js|SSRF-Schutz, Verbraucher kommt mit Plan 023 H1 (ausgehende Aufrufe der Erweiterungen)"
  "src/utils/sqlIdentifier.js|Bezeichner-Escaping, Verbraucher kommt mit Plan 023 H1 (eigene Tabellen je Erweiterung)"
)

in_liste() {
  local pfad="$1"; shift
  local e
  for e in "$@"; do [ "${e%%|*}" = "$pfad" ] && return 0; done
  return 1
}

TOT=()
NUR_TESTS=()

# $1 = Ordner, in dem GESUCHT wird (App-Wurzel, damit Tests daneben mitzaehlen)
# $2 = Unterordner, dessen Dateien GEPRUEFT werden
# $3 = Praefix fuer die Ausgabe
pruefe_ordner() {
  local suchraum="$1" pruefling="$2" praefix="$3"; shift 3
  cd "${WURZEL}/${suchraum}" || return 0
  while IFS= read -r f; do
    local rel="${f#./}"
    case "$rel" in __tests__/*|*/__tests__/*|*.test.*|*.spec.*|*vite-env*) continue ;; esac
    local ziel
    ziel=$(basename "$rel" | sed -E 's/\.(tsx?|jsx?)$//')
    [ "$ziel" = "index" ] && ziel=$(basename "$(dirname "$rel")")
    local muster="(from|import\(|require\()[[:space:]]*['\"][^'\"]*/${ziel}['\"]"
    # Alle Importeure, Tests eingeschlossen.
    local alle
    alle=$(grep -rlE "$muster" . "$@" 2>/dev/null | grep -vE "^\./${rel}$")
    if [ -z "$alle" ]; then
      in_liste "${rel}" "${AUSNAHMEN[@]}" || TOT+=("${praefix}${rel}")
      continue
    fi
    # Bleibt nichts uebrig, wenn man die Tests abzieht: nur von Tests benutzt.
    if [ -z "$(echo "$alle" | grep -vE "__tests__|\.test\.|\.spec\.")" ]; then
      in_liste "${rel}" "${NUR_TESTS_OK[@]}" || NUR_TESTS+=("${praefix}${rel}")
    fi
  done < <(find "./${pruefling}" \( -name "*.tsx" -o -name "*.ts" -o -name "*.js" \) | grep -v node_modules)
}

pruefe_ordner "apps/dashboard-frontend" "src" "apps/dashboard-frontend/" --include=*.ts --include=*.tsx
pruefe_ordner "apps/dashboard-backend" "src" "apps/dashboard-backend/" --include=*.js

echo "Dateien ohne Importeur:"
if [ ${#TOT[@]} -eq 0 ]; then echo "  keine"; else printf '  %s\n' "${TOT[@]}"; fi
echo ""
echo "Nur von Tests benutzt (gebaut, nicht angeschlossen):"
if [ ${#NUR_TESTS[@]} -eq 0 ]; then echo "  keine"; else printf '  %s\n' "${NUR_TESTS[@]}"; fi

if [ ${#TOT[@]} -gt 0 ]; then
  echo ""
  echo "Entweder anschliessen, entfernen, oder mit Grund in die Ausnahmeliste."
  exit 1
fi
exit 0
