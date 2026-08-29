#!/bin/bash
# =============================================================================
# Das Auslieferungsartefakt bauen (Phase C10, 27.08.2026)
# =============================================================================
# Ein Aufruf, ein Tarball, eine Fassung:
#
#   scripts/deploy/artefakt-bauen.sh --ausgabe dist
#   -> dist/arasul-20260827-a1b2c3d.tar.gz
#      dist/arasul-20260827-a1b2c3d.tar.gz.sha256
#
# WAS DRIN IST: der Quellstand dieses Repos, so wie ihn ein Jetson zum Bauen
# und Betreiben braucht. KEINE Docker-Images. Das ist keine Sparsamkeit,
# sondern eine Folge der Hardware: die Images tragen CUDA und laufen auf ARM64
# mit der NVIDIA-Laufzeit des Geraets. Ein GitHub-Laeufer ist x86 und hat
# keine GPU; was er baute, liefe am Orin nicht. Das Geraet baut deshalb selbst
# (`./arasul bootstrap`), und das Artefakt ist der Bauplan, nicht das Gebaeude.
#
# WAS NICHT DRIN IST: `.git`, `.github`, `.claude`, `tests/`, `docs/plans`,
# `docs/archive`, `node_modules`, alles Unversionierte. Der Inhalt kommt aus
# `git archive`, also aus dem, was im Commit steht -- nicht aus dem
# Arbeitsverzeichnis. Ein Artefakt aus einem schmutzigen Baum gibt es damit
# nicht, und zweimal derselbe Commit gibt zweimal denselben Inhalt.
#
# ES TRAEGT DAS DESIGNSYSTEM ALS PAKET (Phase H6). `packages/marken/` liegt
# ohnehin darin -- die Shell wird am Geraet daraus gebaut --, und daneben
# schreibt dieser Bau `packages/marken/marken.json`: die Fassung, die
# Abhaengigkeiten und jede Datei mit ihrem sha256. Das Ara-Kit spiegelt von
# dort in seine App-Vorlage; der Stempel ist die Auskunft, WAS zum Paket
# gehoert. Siehe `scripts/deploy/marken-paket.py`.
#
# DER EINSTIEGSPUNKT NENNT SICH SELBST. Im Wurzelverzeichnis des Artefakts
# liegen `install.sh` und `arasul-release.json`; die JSON-Datei nennt unter
# `einstiegspunkt` den Dateinamen. Das Ara-Kit (`lib/install.mjs`) und der
# Installer-Weg der Website (`curl arasul.de/api/install`) lesen ihn dort und
# raten nicht.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=../lib/fassung.sh
source "${SCRIPT_DIR}/../lib/fassung.sh"

AUSGABE="${WURZEL}/dist"
FASSUNG=""
COMMIT_ISH="HEAD"

while [ $# -gt 0 ]; do
  case "$1" in
    --ausgabe)  AUSGABE="$2"; shift 2 ;;
    --fassung)  FASSUNG="$2"; shift 2 ;;
    --commit)   COMMIT_ISH="$2"; shift 2 ;;
    --hilfe|-h)
      cat <<'HILFE'
Aufruf: scripts/deploy/artefakt-bauen.sh [Optionen]

  --ausgabe <Verzeichnis>  wohin (Vorgabe: dist/)
  --fassung <Nummer>       Fassung von Hand (Vorgabe: aus dem Bau, siehe
                           scripts/lib/fassung.sh: Tag oder Datum plus SHA)
  --commit <ref>           welcher Stand (Vorgabe: HEAD)

Ergebnis: <Ausgabe>/arasul-<Fassung>.tar.gz und die zugehoerige .sha256.
HILFE
      exit 0
      ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

cd "$WURZEL"

if [ -z "$FASSUNG" ]; then
  FASSUNG="$(fassung_aus_bau "$WURZEL")"
fi
if [ -z "$FASSUNG" ]; then
  echo "Keine Fassung ermittelbar (kein Git, keine --fassung)." >&2
  exit 1
fi

COMMIT="$(git rev-parse --short "$COMMIT_ISH" 2>/dev/null || echo '')"
if [ -z "$COMMIT" ]; then
  echo "Kein Git-Stand \"$COMMIT_ISH\" in $WURZEL." >&2
  exit 1
fi

NAME="arasul-${FASSUNG}"
ARCHIV="${AUSGABE}/${NAME}.tar.gz"

echo "Artefakt: ${NAME}"
echo "  Stand:  ${COMMIT}"
echo "  Ziel:   ${ARCHIV}"

# Der Bauplatz. `mktemp -d` und nicht ein fester Pfad: zwei Laeufe des
# Workflows auf demselben Laeufer wuerden sich sonst gegenseitig aufraeumen.
BAUPLATZ="$(mktemp -d)"
trap 'rm -rf "$BAUPLATZ"' EXIT
BAUM="${BAUPLATZ}/${NAME}"
mkdir -p "$BAUM"

git archive --format=tar "$COMMIT" | tar -x -C "$BAUM"

# Was ein Geraet nicht braucht. Jede Zeile mit Grund, sonst waechst die Liste
# zu einem Ort, an dem irgendwann etwas Noetiges landet.
rm -rf \
  "${BAUM}/.github" \
  "${BAUM}/.claude" \
  "${BAUM}/.husky" \
  "${BAUM}/tests" \
  "${BAUM}/docs/plans" \
  "${BAUM}/docs/archive"
#   .github   Workflows laufen bei GitHub, nicht am Geraet.
#   .claude   Skills und Kontext der Entwicklung.
#   .husky    Git-Haken ohne Git-Verzeichnis.
#   tests/    Integrationstests laufen in der CI; das Geraet baut nur.
#   docs/plans, docs/archive
#             Planungsgeschichte. docs/ selbst BLEIBT: `install.sh` und der
#             Bootstrap verweisen am Ende auf docs/ops/NETZNAME_UND_ZERTIFIKAT.md,
#             und das Admin-Handbuch gehoert auf das Geraet, auf dem es
#             gebraucht wird. Ein Verweis ins Leere waere schlimmer als kein
#             Verweis. (Die Schnittstellenbeschreibung unter `/api/docs` kommt
#             NICHT von hier, sondern aus apps/dashboard-backend/openapi.yaml.)

GEBAUT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "${BAUM}/arasul-release.json" <<JSON
{
  "fassung": "${FASSUNG}",
  "commit": "${COMMIT}",
  "gebaut": "${GEBAUT}",
  "einstiegspunkt": "install.sh",
  "repo": "${ARASUL_RELEASE_REPO:-Arasul-GmbH/arasul-jet}"
}
JSON

# Das Designsystem als Paket (Phase H6, 29.08.2026). Das Artefakt IST der
# Traeger: das Ara-Kit packt es nach `.ara/mirror/` aus und spiegelt
# `packages/marken/src/` in seine App-Vorlage. Der Ordner liegt ohnehin darin
# -- die Shell wird am Geraet daraus gebaut --, was fehlte, war die Auskunft,
# WAS davon das Paket ist: die Fassung, die Abhaengigkeiten und jede Datei mit
# ihrem Hash. Ohne sie liest ein Spiegel die oberste Ebene, laesst `primitive/`
# und `muster/` liegen und traegt danach eine `index.ts`, die auf zwei Ordner
# zeigt, die es bei ihm nicht gibt.
#
# Der Stempel steht NEBEN der Bibliothek und kopiert sie nicht: zwei Kopien
# derselben Quelle in einem Artefakt waeren genau die zweite Wahrheit, gegen
# die diese Bibliothek gebaut ist. Was der Stempel nicht nennt (`__tests__/`,
# `browser.ts`, `vite.config.mjs`), gehoert nicht zum Paket.
python3 "${WURZEL}/scripts/deploy/marken-paket.py" \
  --wurzel "$BAUM" \
  --stempel "${BAUM}/packages/marken/marken.json" \
  --produktfassung "$FASSUNG" \
  --commit "$COMMIT"

if [ ! -f "${BAUM}/install.sh" ]; then
  echo "Im Artefakt fehlt install.sh -- der Einstiegspunkt, den die JSON-Datei nennt." >&2
  exit 1
fi
chmod +x "${BAUM}/install.sh" "${BAUM}/arasul"

# Die Gegenprobe am fertigen Baum: jede Datei, die der Stempel nennt, liegt
# darin und passt zu ihrem Hash. Sie kostet nichts und faengt den einen Fall,
# den sonst erst ein Partner faende -- eine Aufraeumzeile weiter oben, die die
# Bibliothek mitnimmt.
python3 "${WURZEL}/scripts/deploy/marken-paket.py" --pruefen "$BAUM"

mkdir -p "$AUSGABE"
AUSGABE="$(cd "$AUSGABE" && pwd)"
ARCHIV="${AUSGABE}/${NAME}.tar.gz"

# `--sort=name` und feste Zeitstempel: derselbe Commit soll denselben Tarball
# ergeben, sonst hat jede Wiederholung eine andere Pruefsumme und die Angabe
# einer Pruefsumme in der Doku waere wertlos. Die BSD-Fassung von tar auf einem
# Mac kennt die Schalter nicht; gebaut wird in der CI unter Linux (GNU tar),
# lokal faellt es auf den einfachen Aufruf zurueck.
if tar --sort=name --help >/dev/null 2>&1; then
  tar --sort=name \
      --mtime="${GEBAUT}" \
      --owner=0 --group=0 --numeric-owner \
      -czf "$ARCHIV" -C "$BAUPLATZ" "$NAME"
else
  tar -czf "$ARCHIV" -C "$BAUPLATZ" "$NAME"
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$AUSGABE" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256")
else
  (cd "$AUSGABE" && shasum -a 256 "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256")
fi

GROESSE="$(du -h "$ARCHIV" | cut -f1)"
echo ""
echo "  ${ARCHIV}  (${GROESSE})"
echo "  $(cat "${ARCHIV}.sha256")"
echo ""
echo "  Auspacken und starten:"
echo "    tar xzf ${NAME}.tar.gz && cd ${NAME} && ./install.sh"
