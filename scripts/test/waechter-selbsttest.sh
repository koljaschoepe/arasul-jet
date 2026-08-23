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

rm -r "$TMP/faden/docs/plans/active/023-beispiel"
pruefe "Faden: leerer Ordner ist rot" 1 python3 "$WURZEL/scripts/test/plan-faden.py" --pfad "$TMP/faden"

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
    [ -f "$WARTUNG_DATEI" ] && exit 1
    kill -0 "${WARTUNG_HERZ:-1}" 2>/dev/null && exit 1
    exit 0
  )
}
pruefe "Wartungsfenster: setzen, nachfassen, entfernen" 0 wf_probe

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
  [ ! -f "$datei" ]
}
pruefe "Wartungsfenster: ein Abbruch laesst nichts liegen" 0 wf_abbruch_raeumt_auf

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
rm -r "$TMP/st"

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

# --- geruest-regeln.py ------------------------------------------------------
# Der Waechter, der Werkstatt und Backend zusammenhaelt (Plan 023 H2). Er
# existiert wegen eines echten Falls: drei neue Faehigkeiten hatten Routen,
# Dienste und Tests, standen aber nicht in der Liste des Backends, und niemand
# konnte sie deklarieren.
GR="$TMP/geruest"
mkdir -p "$GR/apps/dashboard-backend/src/services/extensions" "$GR/services/sandbox"
JS_DATEI="$GR/apps/dashboard-backend/src/services/extensions/extensionPackage.js"
SH_DATEI="$GR/services/sandbox/erweiterung.sh"

schreibe_geruest() {
  printf "const BRUECKE_FAEHIGKEITEN = [%s];\n" "$1" > "$JS_DATEI"
  {
    printf "ID_MUSTER='^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'\n"
    printf 'TYPEN="app flow tool"\n'
    printf 'FAEHIGKEITEN="%s"\n' "$2"
  } > "$SH_DATEI"
}

schreibe_geruest "'llm', 'rag'" "llm rag"
pruefe "Geruest-Regeln: gleiche Listen sind gruen" 0 \
  python3 "$WURZEL/scripts/test/geruest-regeln.py" --wurzel "$GR"

schreibe_geruest "'llm', 'rag', 'netz'" "llm rag"
pruefe "Geruest-Regeln: eine Faehigkeit nur im Backend ist rot" 1 \
  python3 "$WURZEL/scripts/test/geruest-regeln.py" --wurzel "$GR"

schreibe_geruest "'llm', 'rag'" "llm rag zauberei"
pruefe "Geruest-Regeln: eine Faehigkeit nur in der Werkstatt ist rot" 1 \
  python3 "$WURZEL/scripts/test/geruest-regeln.py" --wurzel "$GR"

# Das Id-Muster wird ueber sein VERHALTEN verglichen, nicht ueber den Text:
# beide Seiten schreiben denselben Ausdruck in verschiedenen Dialekten.
schreibe_geruest "'llm'" "llm"
printf "ID_MUSTER='^[a-zA-Z0-9-]+$'\n" >> "$SH_DATEI"
sed -i.bak "1d" "$SH_DATEI" && rm -f "$SH_DATEI.bak"
pruefe "Geruest-Regeln: ein zu weites Id-Muster ist rot" 1 \
  python3 "$WURZEL/scripts/test/geruest-regeln.py" --wurzel "$GR"
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

# --- paket-vergleich.py -----------------------------------------------------
# Das Messwerkzeug fuer H3: "dieselbe Anwendung, einmal ueber ara-kit und
# einmal im Terminal gebaut, ergibt dasselbe Paket". Ohne ein Werkzeug, das
# "dasselbe" entscheidet, ist die Abnahme eine Meinung.
PV="$TMP/paket"
mkdir -p "$PV/a" "$PV/b"
printf '<h1>Hallo</h1>\n' > "$PV/a/index.html"
printf '<h1>Hallo</h1>\n' > "$PV/b/index.html"
printf '{"id":"x","name":"X","type":"app","entry":"index.html","version":"1.0.0","faehigkeiten":["llm","rag"]}\n' > "$PV/a/manifest.json"
# B: andere Reihenfolge der Schluessel, andere Reihenfolge der Faehigkeiten,
# andere Fassung. Nichts davon macht ein anderes Paket.
printf '{"faehigkeiten":["rag","llm"],"version":"2.0.0","entry":"index.html","type":"app","name":"X","id":"x"}\n' > "$PV/b/manifest.json"
pruefe "Paket-Vergleich: Reihenfolge und Fassung machen kein anderes Paket" 0 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a" "$PV/b"

pruefe "Paket-Vergleich: mit --streng zaehlt die Fassung" 1 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a" "$PV/b" --streng

printf '<h1>Anders</h1>\n' > "$PV/b/index.html"
printf '{"faehigkeiten":["rag","llm"],"version":"1.0.0","entry":"index.html","type":"app","name":"X","id":"x"}\n' > "$PV/b/manifest.json"
pruefe "Paket-Vergleich: anderer Dateiinhalt ist ein anderes Paket" 1 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a" "$PV/b"

printf '<h1>Hallo</h1>\n' > "$PV/b/index.html"
printf 'extra\n' > "$PV/b/dazu.js"
pruefe "Paket-Vergleich: eine zusaetzliche Datei ist ein anderes Paket" 1 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a" "$PV/b"

rm -f "$PV/b/dazu.js"
printf 'x\n' > "$PV/b/.DS_Store"
pruefe "Paket-Vergleich: auch ein Artefakt zaehlt, wird aber benannt" 1 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a" "$PV/b"
rm -f "$PV/b/.DS_Store"

# Ein Archiv gegen einen Ordner: der Weg, den ara-kit nehmen wird.
( cd "$PV/a" && COPYFILE_DISABLE=1 tar -czf "$PV/a.tar.gz" . )
pruefe "Paket-Vergleich: Archiv gegen Ordner" 0 \
  python3 "$WURZEL/scripts/test/paket-vergleich.py" "$PV/a.tar.gz" "$PV/b"

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
printf 'services:\n  qdrant:\n    profiles:\n      - classic-rag\n  backend:\n    image: x\n' \
  > "$AN/compose/compose.app.yaml"
printf '# Doku\n' > "$AN/docs/INDEX.md"

printf '# Titel\n\nSiehe [Index](docs/INDEX.md) und `docs/INDEX.md`.\n' > "$AN/README.md"
printf '# Titel\n\nNichts Besonderes.\n' > "$AN/CLAUDE.md"
pruefe "Anleitungen: ein gueltiger Verweis ist gruen" 0 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nSiehe [Index](docs/WEGGEZOGEN.md).\n' > "$AN/README.md"
pruefe "Anleitungen: ein Link ins Leere ist rot" 1 \
  python3 "$WURZEL/scripts/test/anleitungen.py" --wurzel "$AN"

printf '# Titel\n\nDer Vektorspeicher `qdrant` gehoert zum laufenden Geraet.\n' > "$AN/README.md"
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

if [ "$FEHLER" = "0" ]; then
  echo "   Selbsttest der Waechter: bestanden"
else
  echo "   Selbsttest der Waechter: FEHLGESCHLAGEN"
fi
exit "$FEHLER"
