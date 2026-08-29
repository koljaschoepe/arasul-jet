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

# Die Aufgabenzahl. Am 23.08.2026 standen drei verschiedene Zahlen fuer
# dieselbe Sache im Repo: der Plan sagte 61, CLAUDE.md sagte 64, gezaehlt waren
# es 66. Beide abgeschriebenen Zahlen waren falsch.
cat > "$TMP/faden/docs/plans/active/023-beispiel/plan.md" <<'BEISPIEL'
# Plan mit zwei Aufgaben

## A1 Erste
## A2 Zweite
BEISPIEL
pruefe "Faden: keine genannte Zahl ist gruen" 0 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

printf '\nDer Plan hat 2 Aufgaben.\n' >> "$TMP/faden/docs/plans/active/023-beispiel/plan.md"
pruefe "Faden: richtige Zahl ist gruen" 0 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

printf '\nDer Plan hat 7 Aufgaben.\n' >> "$TMP/faden/docs/plans/active/023-beispiel/plan.md"
pruefe "Faden: falsche Zahl im Plan ist rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

echo "Elf Phasen A bis K, 9 Aufgaben." > "$TMP/faden/CLAUDE.md"
pruefe "Faden: falsche Zahl in CLAUDE.md ist rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"
rm -f "$TMP/faden/CLAUDE.md"

# Seit dem 26.08.2026 liegt der laufende Plan im Ueberordner. Ein leerer
# Ordner ist deshalb gruen; zwei Plaene bleiben rot (oben geprueft).
rm -r "$TMP/faden/docs/plans/active/023-beispiel"
pruefe "Faden: leerer Ordner ist gruen" 0 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

# --- wartungsfenster.sh -----------------------------------------------------
# Das Fenster haelt die Selbstheilung zurueck, solange ein Deploy oder ein
# Pruefstand-Build laeuft. Es hat drei Teile, die einzeln stillschweigend
# kaputtgehen koennen: die Datei entsteht, sie wird nachgefasst, und sie
# verschwindet wieder. Der dritte ist der gefaehrlichste — eine liegen
# gebliebene Datei legt die Selbstheilung bis zum Deckel schlafen.
WF="$TMP/wf"
mkdir -p "$WF"
wf_probe() {
  (
    source "$WURZEL/scripts/lib/wartungsfenster.sh"
    WARTUNG_FALLBACK_DIR="$WF"
    WARTUNG_AGENT="gibt-es-nicht-$$"   # erzwingt den Fallback statt Docker
    WARTUNG_TAKT_SEKUNDEN=1
    wartung_herzschlag_an
    [ -f "$WARTUNG_DATEI" ] || exit 1
    # Den INHALT vergleichen, nicht die Groesse: die Datei traegt einen
    # Zeitstempel auf die Sekunde, also muss sie sich nach drei Sekunden
    # geaendert haben. Der erste Wurf dieses Tests prueft nur `-s`, und damit
    # waere er auch dann gruen gewesen, wenn der Herzschlag gar nicht laeuft.
    vorher=$(cat "$WARTUNG_DATEI")
    sleep 3
    nachher=$(cat "$WARTUNG_DATEI" 2>/dev/null)
    [ -n "$nachher" ] || exit 1
    [ "$vorher" != "$nachher" ] || exit 1
    wartung_aus
    # Die Datei BLEIBT liegen, mit `ende=` darin. Der Agent braucht diesen
    # Zeitpunkt, um den Nachlauf zu rechnen, auch wenn er das offene Fenster
    # nie gesehen hat (24.08.2026).
    grep -q 'ende=[0-9]' "$WARTUNG_DATEI" || exit 1
    kill -0 "${WARTUNG_HERZ:-1}" 2>/dev/null && exit 1
    exit 0
  )
}
pruefe "Wartungsfenster: setzen, nachfassen, Ende vermerken" 0 wf_probe

wf_pfad_kommt_von_docker() {
  (
    source "$WURZEL/scripts/lib/wartungsfenster.sh"
    WARTUNG_FALLBACK_DIR="$WF/fallback"
    WARTUNG_AGENT="gibt-es-nicht-$$"
    # Ohne erreichbaren Container MUSS der Fallback greifen, und zwar genau
    # dorthin und nicht ins Arbeitsverzeichnis.
    [ "$(wartung_pfad)" = "$WF/fallback/wartung.aktiv" ]
  )
}
pruefe "Wartungsfenster: ohne Agent greift der Fallback" 0 wf_pfad_kommt_von_docker

wf_abbruch_raeumt_auf() {
  # Der gefaehrlichste der drei Faelle: ein Lauf bricht mittendrin ab. Am
  # 23.08.2026 um 23:41 blieb die Datei so liegen, weil `pruefstand.sh` keinen
  # `trap` hatte — die Selbstheilung haette eine halbe Stunde geschwiegen.
  local datei
  (
    source "$WURZEL/scripts/lib/wartungsfenster.sh"
    WARTUNG_FALLBACK_DIR="$WF/abbruch"
    WARTUNG_AGENT="gibt-es-nicht-$$"
    trap wartung_aus EXIT
    wartung_an
    exit 7          # irgendetwas geht schief
  )
  datei="$WF/abbruch/wartung.aktiv"
  # Frueher wurde hier geprueft, dass die Datei WEG ist. Seit dem 24.08.2026
  # bleibt sie liegen und traegt `ende=`: ein Abbruch soll den Nachlauf
  # ausloesen, nicht ihn verschlucken. Der Deckel aus
  # SELFHEAL_WARTUNG_MAX_MINUTEN sorgt dafuer, dass eine vergessene Datei die
  # Selbstheilung trotzdem nicht dauerhaft schlafen legt.
  [ -f "$datei" ] && grep -q 'ende=[0-9]' "$datei"
}
pruefe "Wartungsfenster: ein Abbruch vermerkt sein Ende" 0 wf_abbruch_raeumt_auf

# --- stiller-tod.py ---------------------------------------------------------
# Die Pruefung darf NUR anschlagen, wenn `set -e` und `pipefail` zusammenkommen.
# Ohne `pipefail` zaehlt in einer Pipe nur das letzte Glied, und `cut` oder
# `head` geben immer 0 zurueck — dieselbe Zeile ist dann harmlos.
ST="$TMP/st/scripts"
mkdir -p "$ST"
cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
WER=$(docker ps | grep foo | head -1)
BEISPIEL
pruefe "Stiller Tod: set -e plus pipefail ist rot" 1 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
WER=$(docker ps | grep foo | head -1 || true)
BEISPIEL
pruefe "Stiller Tod: mit Auffangnetz ist gruen" 0 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
local_ist_harmlos() { local wer=$(docker ps | grep foo | head -1); echo "$wer"; }
BEISPIEL
pruefe "Stiller Tod: local faengt den Code ab, also gruen" 0 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -eu
WER=$(docker ps | grep foo | head -1)
BEISPIEL
pruefe "Stiller Tod: ohne pipefail ist gruen" 0 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

# `find` meldet "nichts gefunden" mit Rueckgabewert 0, `ls` und `grep` nicht.
# Der erste Wurf der Pruefung hatte `find` im Muster und meldete drei Stellen,
# an denen nichts kaputt war.
cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
X=$(find . -name "*.snapshot" | head -1)
BEISPIEL
pruefe "Stiller Tod: find ist harmlos, also gruen" 0 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

cat > "$ST/streng.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
X=$(ls /pfad/*.tar.gz 2>/dev/null | head -1)
BEISPIEL
pruefe "Stiller Tod: ls ohne Netz ist rot" 1 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"

# Der Fall, der die Pruefung am 28.08.2026 ihre Glaubwuerdigkeit gekostet
# haette: die Zeile stand in `arasul`, und die suchte sie gar nicht ab.
rm -f "$ST/streng.sh"
cat > "$TMP/st/arasul" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
dash_port=$(grep "^DASHBOARD_PORT=" .env 2>/dev/null | cut -d'=' -f2)
BEISPIEL
pruefe 'Stiller Tod: dieselbe Zeile im Skript arasul ist rot' 1 python3 "$WURZEL/scripts/test/stiller-tod.py" --wurzel "$TMP/st"
rm -r "$TMP/st"

# --- wurzelpfad.py ----------------------------------------------------------
# Ein Skript, das seine eigene Wurzel eine Ebene zu hoch ansetzt, sucht seine
# Dateien in `scripts/` und findet keine. Am 28.08.2026 brach der Bootstrap auf
# jedem frischen Geraet genau daran ab.
WP="$TMP/wp/scripts/validate"
mkdir -p "$WP"
cat > "$WP/pruefer.sh" <<'BEISPIEL'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BEISPIEL
pruefe "Wurzelpfad: zwei Ebenen bei zwei Ebenen Tiefe ist gruen" 0 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"

cat > "$WP/pruefer.sh" <<'BEISPIEL'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BEISPIEL
pruefe "Wurzelpfad: eine Ebene zu wenig ist rot" 1 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"

# Beide Schreibweisen zaehlen gleich, und `dirname` ueber `BASH_SOURCE` zaehlt
# einmal weniger -- das innerste macht aus dem Dateinamen ihr Verzeichnis.
cat > "$WP/pruefer.sh" <<'BEISPIEL'
#!/bin/bash
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BEISPIEL
pruefe "Wurzelpfad: die Kurzform ueber BASH_SOURCE ist gruen" 0 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"

cat > "$WP/pruefer.sh" <<'BEISPIEL'
#!/bin/bash
PROJECT_ROOT="${ARASUL_REPO_DIR:-$(git rev-parse --show-toplevel)}"
BEISPIEL
pruefe "Wurzelpfad: eine Wurzel ohne Selbstbezug bleibt ungemessen" 0 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"

# Ein Skript im Wurzelverzeichnis geht keine Ebene hoch -- und `arasul` heisst
# nicht `.sh`, wird aber trotzdem gelesen.
rm -f "$WP/pruefer.sh"
cat > "$TMP/wp/arasul" <<'BEISPIEL'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(dirname "$SCRIPT_DIR")"
BEISPIEL
pruefe "Wurzelpfad: eine Ebene zuviel im Wurzelverzeichnis ist rot" 1 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"

# Ein ORDNER, der wie ein Skript heisst. Am Orin legte Docker unter `data/`
# eine fehlende Bind-Quelle namens `healthcheck.sh` als Verzeichnis an; der
# Waechter las sie als Datei und starb an einem IsADirectoryError -- der
# Pruefer stolperte, nicht das Gepruefte.
rm -f "$TMP/wp/arasul"
mkdir -p "$TMP/wp/data/healthcheck.sh"
pruefe "Wurzelpfad: ein Ordner mit Skriptnamen wird uebersprungen" 0 \
  python3 "$WURZEL/scripts/test/wurzelpfad.py" --wurzel "$TMP/wp"
rm -r "$TMP/wp"

# --- rohrbruch.py -----------------------------------------------------------
# Der Schwesterfall zu stiller-tod: dort traegt `pipefail` eine 1 aus der Pipe
# heraus (nichts gefunden), hier eine 141 (Rohr zerrissen). Die Pruefung darf
# nur anschlagen, wo der Wert der Pipe wirklich die Antwort ist.
RB="$TMP/rb/scripts"
mkdir -p "$RB"
cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -uo pipefail
if docker logs "$B" 2>&1 | grep -q 'ready to accept'; then echo da; fi
BEISPIEL
pruefe "Rohrbruch: | grep -q unter pipefail ist rot" 1 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -uo pipefail
if grep -q 'ready to accept' <<<"$(docker logs "$B" 2>&1)"; then echo da; fi
BEISPIEL
pruefe "Rohrbruch: der Hier-String ist gruen" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

# Ohne pipefail zaehlt nur das letzte Glied, und grep gibt 0 zurueck.
cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -eu
if docker logs "$B" 2>&1 | grep -q 'ready to accept'; then echo da; fi
BEISPIEL
pruefe "Rohrbruch: ohne pipefail ist gruen" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -uo pipefail
if ls /pfad | head -1; then echo da; fi
BEISPIEL
pruefe "Rohrbruch: | head in einer Bedingung ist rot" 1 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
X=$(ls /pfad | head -1 || true)
BEISPIEL
pruefe "Rohrbruch: mit Auffangnetz ist gruen" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
X=$(ls /pfad | head -1)
BEISPIEL
pruefe "Rohrbruch: Zuweisung ohne Netz unter set -e ist rot" 1 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

# Der Rueckgabewert ist hier der von `[`, nicht der der Pipe. Der erste Wurf
# der Pruefung hat genau diese Zeile gemeldet, und es war nichts kaputt.
cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -euo pipefail
kleiner() { [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
BEISPIEL
pruefe "Rohrbruch: Pipe in einer Ersetzung in [ ] ist gruen" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

# Ein Beispiel IN einem Here-Dokument ist Text, kein Code.
cat > "$RB/rohr.sh" <<'BEISPIEL'
#!/bin/bash
set -uo pipefail
cat > /tmp/anleitung <<'ENDE'
So bitte NICHT: docker logs x | grep -q fertig
ENDE
BEISPIEL
pruefe "Rohrbruch: im Here-Dokument zaehlt nicht" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

# In `.github/` gilt heute kein pipefail: GitHub startet `run:` mit
# `bash -e {0}`. Mit `shell: bash` wird daraus `bash -eo pipefail {0}`, und
# dann gilt dort alles, was oben steht. Das Wort allein — etwa im Kommentar,
# der genau das erklaert — darf sich NICHT melden.
mkdir -p "$TMP/rb/.github/workflows"
cat > "$TMP/rb/.github/workflows/lauf.yml" <<'BEISPIEL'
jobs:
  a:
    steps:
      # Ohne pipefail zaehlt nur das letzte Glied der Pipe.
      - run: docker logs x | grep -q fertig
BEISPIEL
pruefe "Rohrbruch: .github ohne shell bash ist gruen" 0 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"

cat > "$TMP/rb/.github/workflows/lauf.yml" <<'BEISPIEL'
jobs:
  a:
    steps:
      - shell: bash
        run: docker logs x | grep -q fertig
BEISPIEL
pruefe "Rohrbruch: .github mit shell bash ist rot" 1 python3 "$WURZEL/scripts/test/rohrbruch.py" --wurzel "$TMP/rb"
rm -r "$TMP/rb"

# --- routenregeln.py --------------------------------------------------------
RR="$TMP/rr/apps/dashboard-backend/src/routes"
mkdir -p "$RR"
cat > "$RR/sauber.js" <<'BEISPIEL'
router.get('/heartbeat', (req, res) => { res.json({ ok: true }); });
router.post(
  '/hochladen',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    throw new ValidationError('kein Feld');
  })
);
BEISPIEL
pruefe "Routenregeln: sauberer Code ist gruen" 0 python3 "$WURZEL/scripts/test/routenregeln.py" --wurzel "$TMP/rr"

cat > "$RR/wirft.js" <<'BEISPIEL'
router.get(
  '/liste',
  asyncHandler(async (req, res) => {
    throw new Error('kaputt');
  })
);
BEISPIEL
pruefe "Routenregeln: throw new Error ist rot" 1 python3 "$WURZEL/scripts/test/routenregeln.py" --wurzel "$TMP/rr"
rm "$RR/wirft.js"

cat > "$RR/nackt.js" <<'BEISPIEL'
router.get('/liste', async (req, res) => {
  const daten = await service.holen();
  res.json(daten);
});
BEISPIEL
pruefe "Routenregeln: async ohne asyncHandler ist rot" 1 python3 "$WURZEL/scripts/test/routenregeln.py" --wurzel "$TMP/rr"
rm "$RR/nackt.js"

# Ein synchroner Handler braucht keinen asyncHandler. Wuerde die Pruefung ihn
# melden, waeren sieben echte Routen im Repo rot, und sie wuerde abgeschaltet.
cat > "$RR/synchron.js" <<'BEISPIEL'
router.get('/_meta', (req, res) => {
  res.json({ name: 'x' });
});
BEISPIEL
pruefe "Routenregeln: synchroner Handler ist gruen" 0 python3 "$WURZEL/scripts/test/routenregeln.py" --wurzel "$TMP/rr"
rm -r "$TMP/rr"

# --- rollenregeln.py --------------------------------------------------------
# Jede montierte Route prueft eine Rolle, oder sie steht mit Grund in
# OEFFENTLICH. Der Wegwerfbaum braucht eine index.js, weil der Waechter den
# Montagepfad daraus liest; eine nicht montierte Datei zaehlt nicht.
RO="$TMP/ro/apps/dashboard-backend/src/routes"
mkdir -p "$RO"
cat > "$RO/index.js" <<'BEISPIEL'
router.use('/dinge', require('./dinge'));
BEISPIEL
cat > "$RO/dinge.js" <<'BEISPIEL'
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: [] });
  })
);
router.get(
  '/meine',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    res.json({ data: [] });
  })
);
BEISPIEL
pruefe "Rollenregeln: jede Route mit requireRole ist gruen" 0 python3 "$WURZEL/scripts/test/rollenregeln.py" --wurzel "$TMP/ro"

cat >> "$RO/dinge.js" <<'BEISPIEL'
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: {} });
  })
);
BEISPIEL
pruefe "Rollenregeln: eine Route nur mit requireAuth ist rot" 1 python3 "$WURZEL/scripts/test/rollenregeln.py" --wurzel "$TMP/ro"

cat > "$RO/dinge.js" <<'BEISPIEL'
router.use(requireAuth, requireRole('admin'));
router.get('/', asyncHandler(async (req, res) => res.json({ data: [] })));
BEISPIEL
pruefe "Rollenregeln: router.use mit requireRole deckt die Datei" 0 python3 "$WURZEL/scripts/test/rollenregeln.py" --wurzel "$TMP/ro"

cat > "$RO/dinge.js" <<'BEISPIEL'
router.post('/melden', requireApiKey, asyncHandler(async (req, res) => res.json({ ok: true })));
BEISPIEL
pruefe "Rollenregeln: API-Schluessel ist ein eigener Schutz" 0 python3 "$WURZEL/scripts/test/rollenregeln.py" --wurzel "$TMP/ro"
rm -r "$TMP/ro"

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

# --- gedankenstriche.py, SQL-Teil (Plan 023 D5) ------------------------------
SQL="$TMP/sql/services/postgres/init"
mkdir -p "$SQL"

printf "UPDATE t SET beschreibung = 'Ein Modell, schnell und klein.';\n" > "$SQL/153_probe.sql"
pruefe "Striche: sauberer Katalogtext ist gruen" 0 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"

printf "UPDATE t SET beschreibung = 'Ein Modell — schnell und klein.';\n" > "$SQL/153_probe.sql"
pruefe "Striche: Trenner in einem Katalogtext ist rot" 1 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"

printf -- "-- Ein Kommentar — mit Trenner, das ist erlaubt.\nSELECT 1;\n" > "$SQL/153_probe.sql"
pruefe "Striche: im SQL-Kommentar bleibt es still" 0 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"
rm "$SQL/153_probe.sql"

# Angewandte Migrationen werden nicht mehr geaendert, ihre Pruefsumme steht im
# Migrationsbuch. Deshalb gilt die Regel erst ab der Nummerngrenze. Geprueft
# wird die Grenze von beiden Seiten, sonst verschiebt sie sich unbemerkt.
printf "UPDATE t SET beschreibung = 'Ein Modell — schnell und klein.';\n" > "$SQL/090_alt.sql"
pruefe "Striche: alte Migrationen bleiben ausgenommen" 0 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"
rm "$SQL/090_alt.sql"

printf "UPDATE t SET beschreibung = 'Ein Modell — schnell und klein.';\n" > "$SQL/151_grenze_darunter.sql"
pruefe "Striche: eine Nummer unter der Grenze bleibt still" 0 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"
rm "$SQL/151_grenze_darunter.sql"

printf "UPDATE t SET beschreibung = 'Ein Modell — schnell und klein.';\n" > "$SQL/152_grenze.sql"
pruefe "Striche: genau auf der Grenze ist rot" 1 python3 "$WURZEL/scripts/test/gedankenstriche.py" --pfad "$TMP/sql"
rm "$SQL/152_grenze.sql"
# -----------------------------------------------------------------------------
# Pfadfilter (aus der Review von #454)
# -----------------------------------------------------------------------------
# Der Waechter liest den grep-Ausdruck und die Bild-Matrix aus
# .github/workflows/test.yml. Beides kann jemand aendern, ohne an ihn zu denken.
# Geprueft wird deshalb an einer Kopie des echten Workflows, dass er die zwei
# Faelle findet, die wirklich weh tun: eine fehlende Kopierquelle im Filter, und
# ein Filter, den es gar nicht mehr gibt.
PF="$TMP/pfadfilter"
mkdir -p "$PF/.github/workflows"
# Ohne 2>/dev/null: schlaegt das Kopieren fehl, will man den Grund sehen und
# nicht eine verwirrende Folgemeldung aus pfadfilter.py. Aus der Review von #454.
cp -R "$WURZEL/apps" "$WURZEL/services" "$PF/"
mkdir -p "$PF/packages" "$PF/libs"
cp "$WURZEL/.github/workflows/test.yml" "$PF/.github/workflows/test.yml"

pruefe "Pfadfilter: der echte Workflow ist gruen" 0 \
  python3 "$WURZEL/scripts/test/pfadfilter.py" --pfad "$PF"

# libs/ raus: libs/shared-python wird in beide Python-Images kopiert.
sed -i.sicherung 's#packages/|libs/|#packages/|#' "$PF/.github/workflows/test.yml"
pruefe "Pfadfilter: fehlende Kopierquelle ist rot" 1 \
  python3 "$WURZEL/scripts/test/pfadfilter.py" --pfad "$PF"
mv "$PF/.github/workflows/test.yml.sicherung" "$PF/.github/workflows/test.yml"

# Mehrzeiliges COPY: die Fortsetzungszeile muss gelesen werden. Wuerde sie
# uebergangen, meldete der Waechter einfach weniger Quellen und bliebe gruen,
# also genau das stille Loch, gegen das er gebaut ist. Aus der Review von #454.
printf 'COPY \\\n  sonstiges/hilfsmittel \\\n  ./ziel/\n' \
  >> "$PF/apps/dashboard-backend/Dockerfile"
pruefe "Pfadfilter: mehrzeiliges COPY wird gelesen" 1 \
  python3 "$WURZEL/scripts/test/pfadfilter.py" --pfad "$PF"
cp "$WURZEL/apps/dashboard-backend/Dockerfile" "$PF/apps/dashboard-backend/Dockerfile"

# `COPY . .` kopiert den ganzen Kontext. Vorher wurde die Quelle durch ein
# lstrip("./") zu einer leeren Zeichenkette und fiel still weg. Aus der Review
# von #454.
printf 'COPY . .\n' >> "$PF/apps/dashboard-backend/Dockerfile"
pruefe "Pfadfilter: COPY des ganzen Kontexts ist rot" 1 \
  python3 "$WURZEL/scripts/test/pfadfilter.py" --pfad "$PF"
cp "$WURZEL/apps/dashboard-backend/Dockerfile" "$PF/apps/dashboard-backend/Dockerfile"

# Kein Ausdruck mehr: der Waechter muss sich melden, statt Ruhe zu geben.
sed -i.sicherung "s|grep -qE '[^']*'|grep -q platzhalter|" "$PF/.github/workflows/test.yml"
pruefe "Pfadfilter: verschwundener Ausdruck ist rot" 1 \
  python3 "$WURZEL/scripts/test/pfadfilter.py" --pfad "$PF"
mv "$PF/.github/workflows/test.yml.sicherung" "$PF/.github/workflows/test.yml"

# --- endpunkte.py -----------------------------------------------------------
# Der Waechter aus Plan 023 K1: meldet ein Endpunkt ohne Zeile in der Doku.
# Beide Richtungen muessen greifen, wie bei der Durchreichung: ein NEUER
# undokumentierter Endpunkt ist rot, und ein Eintrag in der Schuldenliste, den
# es nicht mehr gibt, ebenfalls. Ohne die zweite Richtung verwahrlost die Liste.
EP="$TMP/endpunkte"
mkdir -p "$EP/apps/dashboard-backend/src/routes" "$EP/docs/api"
printf "router.use('/foo', require('./foo'));\n" \
  > "$EP/apps/dashboard-backend/src/routes/index.js"
printf "router.get('/bar', h);\n" > "$EP/apps/dashboard-backend/src/routes/foo.js"

printf '| Method | Endpoint | Zweck |\n| --- | --- | --- |\n| GET | `/api/foo/bar` | Beispiel |\n' \
  > "$EP/docs/api/API_REFERENCE.md"
pruefe "Endpunkte: ein dokumentierter Endpunkt ist gruen" 0 \
  python3 "$WURZEL/scripts/test/endpunkte.py" --wurzel "$EP"

printf '| Method | Endpoint | Zweck |\n| --- | --- | --- |\n' \
  > "$EP/docs/api/API_REFERENCE.md"
pruefe "Endpunkte: ein undokumentierter Endpunkt ist rot" 1 \
  python3 "$WURZEL/scripts/test/endpunkte.py" --wurzel "$EP"

# Ein anderer Parametername ist derselbe Endpunkt.
printf "router.get('/bar/:projectId', h);\n" > "$EP/apps/dashboard-backend/src/routes/foo.js"
printf '| Method | Endpoint | Zweck |\n| --- | --- | --- |\n| GET | `/api/foo/bar/:id` | Beispiel |\n' \
  > "$EP/docs/api/API_REFERENCE.md"
pruefe "Endpunkte: ein anderer Parametername zaehlt als derselbe Endpunkt" 0 \
  python3 "$WURZEL/scripts/test/endpunkte.py" --wurzel "$EP"

# Eine Ueberschrift zaehlt auch als Beschreibung.
printf '### GET /api/foo/bar/:x\n' > "$EP/docs/api/API_REFERENCE.md"
pruefe "Endpunkte: eine Ueberschrift zaehlt als Beschreibung" 0 \
  python3 "$WURZEL/scripts/test/endpunkte.py" --wurzel "$EP"

# Und die Schuldenliste verwahrlost nicht: ein Eintrag, den es nicht mehr gibt,
# ist rot. Ohne diese Richtung meldete der Waechter Ruhe ueber Endpunkte, die
# laengst dokumentiert sind.
mkdir -p "$EP/scripts/test"
printf 'GET /api/foo/gibtsnicht\n' > "$EP/scripts/test/endpunkte-luecke.txt"
pruefe "Endpunkte: ein veralteter Eintrag in der Schuldenliste ist rot" 1 \
  python3 "$WURZEL/scripts/test/endpunkte.py" --wurzel "$EP"
rm -f "$EP/scripts/test/endpunkte-luecke.txt"

# --- durchreichung.py -------------------------------------------------------
# Der Waechter, der prueft, ob eine dokumentierte Stellschraube den Container
# ueberhaupt erreicht (Plan 023 E1). Beide Richtungen muessen greifen: eine
# neue Luecke ist rot, und eine geschlossene Luecke, die noch in der
# Schuldenliste steht, ebenfalls. Ohne die zweite Richtung verwahrlost die
# Liste, und der Waechter meldet Ruhe ueber Variablen, die es nicht mehr gibt.
DR="$TMP/durch"
mkdir -p "$DR/docs" "$DR/compose" "$DR/apps/dashboard-backend/src"
printf '| Variable | Standard | Zweck |\n| --- | --- | --- |\n| TESTKNOPF | 1 | Beispiel |\n' \
  > "$DR/docs/ENVIRONMENT_VARIABLES.md"
printf 'const x = process.env.TESTKNOPF;\n' > "$DR/apps/dashboard-backend/src/a.js"

printf 'services:\n  backend:\n    environment:\n      TESTKNOPF: ${TESTKNOPF:-1}\n' \
  > "$DR/compose/compose.app.yaml"
pruefe "Durchreichung: eine durchgereichte Variable ist gruen" 0 \
  python3 "$WURZEL/scripts/test/durchreichung.py" --wurzel "$DR"

printf 'services:\n  backend:\n    environment:\n      ANDERES: 1\n' \
  > "$DR/compose/compose.app.yaml"
pruefe "Durchreichung: eine fehlende Variable ist rot" 1 \
  python3 "$WURZEL/scripts/test/durchreichung.py" --wurzel "$DR"

# Die Secret-Form zaehlt: JWT_SECRET kommt als JWT_SECRET_FILE herein.
printf '| Variable | Standard | Zweck |\n| --- | --- | --- |\n| GEHEIMNIS | | Beispiel |\n' \
  > "$DR/docs/ENVIRONMENT_VARIABLES.md"
printf 'const x = process.env.GEHEIMNIS;\n' > "$DR/apps/dashboard-backend/src/a.js"
printf 'services:\n  backend:\n    environment:\n      GEHEIMNIS_FILE: /run/secrets/g\n' \
  > "$DR/compose/compose.app.yaml"
pruefe "Durchreichung: die Secret-Form zaehlt als durchgereicht" 0 \
  python3 "$WURZEL/scripts/test/durchreichung.py" --wurzel "$DR"

# --- datenordner.py ---------------------------------------------------------
# Der Waechter aus dem Fund vom 23.08.2026: legt Docker eine fehlende
# Bind-Quelle selbst an, gehoert sie root, und der Container (uid 1000) kann
# nicht hinein schreiben. Beide Richtungen: eine fehlende Zeile ist rot, eine
# ueberzaehlige harmlos.
DO="$TMP/datenordner"
mkdir -p "$DO/compose"
printf 'services:\n  backend:\n    volumes:\n      - ${DATA_PATH:-../data}/dinge:/arasul/dinge\n' \
  > "$DO/compose/compose.app.yaml"

printf '#!/bin/bash\nmkdir -p data/dinge\n' > "$DO/arasul"
pruefe "Datenordner: ein angelegter Ordner ist gruen" 0 \
  python3 "$WURZEL/scripts/test/datenordner.py" --wurzel "$DO"

printf '#!/bin/bash\nmkdir -p data/anderes\n' > "$DO/arasul"
pruefe "Datenordner: ein nur gemounteter Ordner ist rot" 1 \
  python3 "$WURZEL/scripts/test/datenordner.py" --wurzel "$DO"

# Die Klammerform muss aufgeloest werden, sonst meldet der Waechter Fehlalarm.
printf '#!/bin/bash\nmkdir -p data/{anderes,dinge}\n' > "$DO/arasul"
pruefe "Datenordner: die Klammerform zaehlt" 0 \
  python3 "$WURZEL/scripts/test/datenordner.py" --wurzel "$DO"

# --- werksreset-tabellen.py -------------------------------------------------
# Beide Richtungen, und die dritte, an der der erste Anlauf gescheitert ist:
# eine spaeter geloeschte Tabelle darf nicht mehr verlangt werden.
WT="$TMP/werksreset"
mkdir -p "$WT/services/postgres/init" "$WT/apps/dashboard-backend/src/services/werksreset"
LISTE="$WT/apps/dashboard-backend/src/services/werksreset/tabellen.js"

# `bleibt` ist immer da. Ohne sie waere die Menge nach dem DROP leer, und der
# Waechter meldete "keine CREATE TABLE gefunden" — der dritte Fall waere dann
# aus dem falschen Grund rot.
printf 'CREATE TABLE public.bleibt (id int);\nCREATE TABLE public.dinge (id int);\n' \
  > "$WT/services/postgres/init/001_a.sql"
printf "const INHALTE = [\n  ['public.bleibt', 'Bleibt'],\n  ['public.dinge', 'Dinge'],\n];\n" > "$LISTE"
pruefe "Werksreset-Tabellen: eingeordnet ist gruen" 0 \
  python3 "$WURZEL/scripts/test/werksreset-tabellen.py" --wurzel "$WT"

printf "const INHALTE = [\n  ['public.bleibt', 'Bleibt'],\n];\n" > "$LISTE"
pruefe "Werksreset-Tabellen: nicht eingeordnet ist rot" 1 \
  python3 "$WURZEL/scripts/test/werksreset-tabellen.py" --wurzel "$WT"

printf 'DROP TABLE IF EXISTS public.dinge;\n' > "$WT/services/postgres/init/002_weg.sql"
pruefe "Werksreset-Tabellen: eine geloeschte Tabelle zaehlt nicht mehr" 0 \
  python3 "$WURZEL/scripts/test/werksreset-tabellen.py" --wurzel "$WT"

printf 'ALTER TABLE public.bleibt RENAME TO umbenannt;\n' > "$WT/services/postgres/init/003_um.sql"
pruefe "Werksreset-Tabellen: nach einer Umbenennung zaehlt der neue Name" 1 \
  python3 "$WURZEL/scripts/test/werksreset-tabellen.py" --wurzel "$WT"

# --- anleitungen.py ---------------------------------------------------------
# Der Waechter aus Plan 023 K3: haelt README und CLAUDE.md gegen den Code.
# Drei Faelle, drei Arten, wie eine Anleitung still falsch wird.
AN="$TMP/anleitungen"
mkdir -p "$AN/docs" "$AN/compose"
printf 'services:\n  loki:\n    profiles:\n      - monitoring\n  backend:\n    image: x\n' \
  > "$AN/compose/compose.app.yaml"
printf '# Doku\n' > "$AN/docs/INDEX.md"

printf '# Titel\n\nSiehe [Index](docs/INDEX.md) und `docs/INDEX.md`.\n' > "$AN/README.md"
printf '# Titel\n\nNichts Besonderes.\n' > "$AN/CLAUDE.md"
pruefe "Anleitungen: ein gueltiger Verweis ist gruen" 0 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nSiehe [Index](docs/WEGGEZOGEN.md).\n' > "$AN/README.md"
pruefe "Anleitungen: ein Link ins Leere ist rot" 1 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nDer Protokollspeicher `loki` gehoert zum laufenden Geraet.\n' > "$AN/README.md"
pruefe "Anleitungen: ein Dienst hinter einem Profil als laufend ist rot" 1 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nEs gibt keine Befehle unter `docs/commands/`, den Ordner gibt es nicht.\n' \
  > "$AN/README.md"
pruefe "Anleitungen: was ausdruecklich als nicht vorhanden benannt ist, zaehlt nicht" 0 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

# Make-Ziele: nur in Codeschrift. Der Waechter las bis zum 23.08.2026 jedes
# "make every" aus einem englischen Satz als Makefile-Ziel.
printf 'start:\n\techo x\n' > "$AN/Makefile"
printf '# Titel\n\nRuf `make start` auf.\n' > "$AN/README.md"
pruefe "Anleitungen: ein vorhandenes make-Ziel in Codeschrift ist gruen" 0 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nRuf `make gibtsnicht` auf.\n' > "$AN/README.md"
pruefe "Anleitungen: ein erfundenes make-Ziel in Codeschrift ist rot" 1 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nThat would make every build look newer.\n' > "$AN/README.md"
pruefe "Anleitungen: make im Fliesstext zaehlt nicht" 0 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"
rm -f "$AN/Makefile"

# --- eigenbezug.py ----------------------------------------------------------
# `local` ist ein Befehl, kein Zuweisungsblock: seine Argumente werden ALLE
# ersetzt, bevor er laeuft. Eine zweite Zuweisung darf sich deshalb nicht auf
# die erste derselben Zeile stuetzen. Ohne `local` davor ist genau dieselbe
# Zeile richtig -- die Pruefung muss beides auseinanderhalten.
EB="$TMP/eb/scripts"
mkdir -p "$EB"
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
baue() { local version="$1" ordner="/tmp/paket-$version"; echo "$ordner"; }
BEISPIEL
pruefe "Eigenbezug: local mit Selbstbezug ist rot" 1 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
baue() {
  local version="$1"
  local ordner="/tmp/paket-$version"
  echo "$ordner"
}
BEISPIEL
pruefe "Eigenbezug: auf zwei Zeilen ist gruen" 0 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Ohne `local` fuehrt die Shell die Zuweisungen nacheinander aus und ersetzt
# fuer jede erst dann. Diese Zeile ist richtig und darf nicht gemeldet werden.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
version="$1" ordner="/tmp/paket-$version"
BEISPIEL
pruefe "Eigenbezug: ohne local ist gruen" 0 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Zwei Zuweisungen auf einer `local`-Zeile, die einander nichts angehen, sind
# in Ordnung -- der haeufige Fall (`local was="$1" ok="$2"`).
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
pruefe() { local was="$1" ok="$2" detail="${3:-}"; echo "$was $ok $detail"; }
BEISPIEL
pruefe "Eigenbezug: unabhaengige Zuweisungen sind gruen" 0 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# `export` hat dieselbe Reihenfolge und damit dieselbe Falle.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
export BASIS="https://localhost" ZIEL="$BASIS/api"
BEISPIEL
pruefe "Eigenbezug: export zaehlt genauso" 1 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Die Reihenfolge auf der Zeile hilft nicht: ersetzt wird ALLES, bevor `local`
# laeuft. `b` liest hier ein leeres (oder, schlimmer, ein globales) `$a`.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
baue() { local ordner="/tmp/paket-$version" version="$1"; echo "$ordner"; }
BEISPIEL
pruefe "Eigenbezug: auch andersherum aufgeschrieben ist rot" 1 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Der Selbstbezug ist der haeufige und RICHTIGE Fall: die lokale Kopie bekommt
# den aeusseren Wert. Ihn zu melden hiesse, jedes `local PATH="$PATH:…"`
# anzuschwaerzen -- beim dritten falschen Alarm liest niemand mehr hin.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
mit_pfad() { local PATH="$PATH:/opt/arasul/bin"; echo "$PATH"; }
BEISPIEL
pruefe "Eigenbezug: die lokale Kopie einer aeusseren Variablen ist gruen" 0 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Ein Zweig eines `case` ist eine Befehlsstelle wie jede andere -- der Fehler
# steht dort genauso, und die erste Fassung dieser Pruefung sah ihn nicht.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
was() {
  case "$1" in
    bau) local version="$2" ordner="/tmp/$version" ;;
  esac
}
BEISPIEL
pruefe "Eigenbezug: ein case-Zweig zaehlt genauso" 1 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"

# Ein Backslash vor dem Dollar macht ihn zu Text. Diese Zeile ist richtig, und
# `shlex` nimmt das Fluchtzeichen weg, bevor die Pruefung hinsieht -- ohne die
# Ausnahme waere sie ein Fehlalarm.
cat > "$EB/lokal.sh" <<'BEISPIEL'
#!/bin/bash
zeige() { local a="$1" b="\$a bleibt Text"; echo "$b"; }
BEISPIEL
pruefe "Eigenbezug: ein gefluchteter Dollar ist kein Bezug" 0 \
  python3 "$WURZEL/scripts/test/eigenbezug.py" --wurzel "$TMP/eb"
rm -r "$TMP/eb"

# --- zeilen.py --------------------------------------------------------------
# Die Messregel der Rueckbau-Phasen (B2 bis B6). Ihr Selbsttest baut einen
# Wegwerfbaum mit bekannten Zeilenzahlen; hier laeuft er mit, damit ein
# Zaehler, der schleichend etwas anderes zaehlt, nicht erst beim Vergleich
# zweier Messungen auffaellt.
pruefe "Zeilen: der Zaehler besteht seinen Selbsttest" 0 \
  python3 "$WURZEL/scripts/test/zeilen.py" --selbsttest

# --- kurzliste.py -----------------------------------------------------------
# Die vier Modelle stehen einmal in config/modelle/kurzliste.json und muessen an
# fuenf weiteren Stellen dasselbe sagen. Der Waechter muss jede einzeln finden;
# ein Waechter, der nur die erste prueft, waere an genau dem Tag still, an dem
# jemand ein Profil vergisst.
KL="$TMP/kl"
kl_baum() {
  rm -rf "$KL"
  mkdir -p "$KL/config/modelle" "$KL/config/platforms" \
    "$KL/services/postgres/init" "$KL/apps/dashboard-backend/src/utils" \
    "$KL/scripts/setup" "$KL/scripts/util" "$KL/scripts/test"
  cat > "$KL/config/modelle/kurzliste.json" <<'BEISPIEL'
{
  "modelle": [
    { "id": "hf.co/wer/Was-GGUF:IQ4_XS", "aufgabe": "text", "standard": true },
    { "id": "klein:e4b", "aufgabe": "text", "standard": false }
  ]
}
BEISPIEL
  cat > "$KL/services/postgres/init/175_kurzliste_c8.sql" <<'BEISPIEL'
INSERT INTO llm_model_catalog (id) VALUES
  ('hf.co/wer/Was-GGUF:IQ4_XS'), ('klein:e4b');
BEISPIEL
  cat > "$KL/apps/dashboard-backend/src/utils/hardware.js" <<'BEISPIEL'
const STANDARD = 'hf.co/wer/Was-GGUF:IQ4_XS';
const SCHNELL = 'klein:e4b';
module.exports = { STANDARD, SCHNELL };
BEISPIEL
  cat > "$KL/config/platforms/eins.json" <<'BEISPIEL'
{
  "id": "eins",
  "default_model": "hf.co/wer/Was-GGUF:IQ4_XS",
  "models": ["hf.co/wer/Was-GGUF:IQ4_XS", "klein:e4b"]
}
BEISPIEL
  cat > "$KL/scripts/setup/detect-platform.sh" <<'BEISPIEL'
LLM_MODEL=hf.co/wer/Was-GGUF:IQ4_XS
RECOMMENDED_MODELS="hf.co/wer/Was-GGUF:IQ4_XS,klein:e4b"
BEISPIEL
  echo 'KURZLISTE="$WURZEL/config/modelle/kurzliste.json"' > "$KL/scripts/util/modelle-aufraeumen.sh"
  echo 'KURZLISTE="$WURZEL/config/modelle/kurzliste.json"' > "$KL/scripts/test/modelle-abnahme.sh"
  # Die beiden .env-Vorlagen und die zwei Skripte, die daraus eine .env machen.
  # Aus ihnen bekommt ein FRISCHES Geraet sein erstes Modell -- und genau dort
  # stand am 28.08.2026 noch `qwen3:14b`, dreissig Minuten Ladezeit fuer ein
  # Modell, das der Katalog nicht mehr kennt.
  echo 'LLM_MODEL=klein:e4b' > "$KL/.env.example"
  echo 'LLM_MODEL=klein:e4b' > "$KL/.env.template"
  echo 'DEFAULT_LLM_MODEL="${DEFAULT_LLM_MODEL:-klein:e4b}"' > "$KL/scripts/interactive_setup.sh"
  echo 'LLM_MODEL=klein:e4b' > "$KL/scripts/setup/preconfigure.sh"
  mkdir -p "$KL/services/llm-service"
  echo 'DEFAULT_MODEL = os.environ.get("LLM_MODEL", "klein:e4b")' \
    > "$KL/services/llm-service/api_server.py"
  echo 'MODEL_NAME="${LLM_MODEL:-klein:e4b}"' > "$KL/services/llm-service/entrypoint.sh"
  echo 'TEST_MODEL="${LLM_MODEL:-klein:e4b}"' > "$KL/services/llm-service/healthcheck.sh"
  mkdir -p "$KL/compose"
  echo '      LLM_MODEL: ${LLM_MODEL:-klein:e4b}' > "$KL/compose/compose.ai.yaml"
}

kl_baum
pruefe "Kurzliste: alle Stellen einig ist gruen" 0 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
sed -i.bak 's/"klein:e4b"\]/"alt:26b"]/' "$KL/config/platforms/eins.json" && rm -f "$KL/config/platforms/eins.json.bak"
pruefe "Kurzliste: ein Profil mit fremdem Modell ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
sed -i.bak "s/klein:e4b/alt:26b/" "$KL/scripts/setup/detect-platform.sh" && rm -f "$KL/scripts/setup/detect-platform.sh.bak"
pruefe "Kurzliste: RECOMMENDED_MODELS mit fremdem Modell ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
echo "const ALT = 'alt:26b';" >> "$KL/apps/dashboard-backend/src/utils/hardware.js"
pruefe "Kurzliste: eine Kennung zuviel in der Empfehlungskarte ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
echo "-- nur eines" > "$KL/services/postgres/init/175_kurzliste_c8.sql"
pruefe "Kurzliste: eine Migration ohne alle vier ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
echo 'BLEIBEN="hf.co/wer/Was-GGUF:IQ4_XS klein:e4b"' > "$KL/scripts/util/modelle-aufraeumen.sh"
pruefe "Kurzliste: ein Skript mit eigener Kopie der Liste ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
echo 'LLM_MODEL=alt:26b' > "$KL/.env.example"
pruefe "Kurzliste: eine .env-Vorlage mit fremdem Modell ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
echo 'DEFAULT_LLM_MODEL="${DEFAULT_LLM_MODEL:-alt:26b}"' > "$KL/scripts/interactive_setup.sh"
pruefe "Kurzliste: ein Rueckfall mit fremdem Modell ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"

kl_baum
rm -f "$KL/.env.example"
pruefe "Kurzliste: eine fehlende .env-Vorlage ist rot" 1 \
  python3 "$WURZEL/scripts/test/kurzliste.py" --wurzel "$KL"
rm -rf "$KL"

# --- zustand.py -------------------------------------------------------------
# Was der Werksreset als Zustand des Geraets loescht, muss die Uebernahme beim
# Update mittragen. Beide Richtungen: ein fehlender Pfad ist rot, ein
# zusaetzlich getragener harmlos.
ZU="$TMP/zustand"
mkdir -p "$ZU/scripts/setup" "$ZU/scripts/lib"

zu_reset() {
  cat > "$ZU/scripts/setup/factory-reset.sh" <<'RESET'
#!/bin/bash
echo "  Loesche Kundendaten und Konfiguration..."
rm -f .env
rm -rf config/geheim/ data/
RESET
}

zu_uebernahme() {
  { echo 'ARASUL_ZUSTAND=('; printf "  '%s'\n" "$@"; echo ')'; } \
    > "$ZU/scripts/lib/installation.sh"
}

zu_reset
zu_uebernahme '.env' 'config/geheim' 'data'
pruefe "Zustand: was der Reset loescht, wird getragen -> gruen" 0 \
  python3 "$WURZEL/scripts/test/zustand.py" --wurzel "$ZU"

zu_uebernahme '.env' 'config/geheim' 'data' 'logs'
pruefe "Zustand: ein zusaetzlich getragener Pfad ist harmlos" 0 \
  python3 "$WURZEL/scripts/test/zustand.py" --wurzel "$ZU"

zu_uebernahme '.env' 'data'
pruefe "Zustand: ein nur geloeschter Pfad ist rot" 1 \
  python3 "$WURZEL/scripts/test/zustand.py" --wurzel "$ZU"

# Der Marker ist die Klammer um den Abschnitt. Verschwindet er, ist der
# Waechter blind — und soll das sagen, statt gruen zu melden.
zu_uebernahme '.env' 'config/geheim' 'data'
printf '#!/bin/bash\nrm -rf data/\n' > "$ZU/scripts/setup/factory-reset.sh"
pruefe "Zustand: ein Reset ohne den Abschnittsmarker ist rot" 1 \
  python3 "$WURZEL/scripts/test/zustand.py" --wurzel "$ZU"
rm -rf "$ZU"

if [ "$FEHLER" = "0" ]; then
  echo "   Selbsttest der Waechter: bestanden"
else
  echo "   Selbsttest der Waechter: FEHLGESCHLAGEN"
fi
exit "$FEHLER"
