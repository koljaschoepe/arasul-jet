#!/usr/bin/env bash
# =============================================================================
# deploy-local.sh — GitOps-Deploy auf dem Jetson (self-hosted Runner)
# =============================================================================
# Wird von .github/workflows/deploy.yml aufgerufen, nachdem ein Merge auf `main`
# gepusht wurde. Deployt AUSSCHLIESSLICH in das Verzeichnis, aus dem der
# laufende Stapel wirklich kommt, damit .env / config/ / data/ und alle
# Bind-Mounts intakt bleiben — NIEMALS aus dem Runner-_work-Checkout (dort
# fehlen diese Daten).
#
# WELCHES Verzeichnis das ist, wird ERFRAGT und nicht angenommen (Schritt 0):
# Docker nennt es ueber das Etikett `com.docker.compose.project.working_dir`.
# Bis zum 29.08.2026 stand ein fester Pfad im Workflow, und seit der Orin ueber
# das Ara-Kit installiert wurde, zeigte er auf ein Verzeichnis, in dem gar kein
# Geraet mehr stand.
#
# Ablauf:
#   0. Die Installation finden (scripts/lib/installation.sh).
#   1. Objekte des neuen Commits aus dem _work-Checkout dorthin ziehen
#      (auth-frei, da actions/checkout bereits authentifiziert hat). Ein aus
#      dem Artefakt installiertes Geraet bekommt dabei sein `git init`.
#   2. Nur GEAENDERTE Services ermitteln (git diff PREV..NEW).
#   3. Vor Backend-/Migrations-Aenderungen: DB-Dump.
#   4. Aktuelle Images als :rollback taggen.
#   5. Nur die geaenderten Services neu bauen + hochfahren.
#   6. Healthcheck. Bei Fehler: Auto-Rollback (Image zuruecktaggen + git reset).
#   7. Migrationsbuch pruefen. Bei Fehler: rot, aber OHNE Rollback (Begruendung
#      an Ort und Stelle).
#
# Andere Stacks (flow-*, livia-*, jarvis-*) bleiben unberuehrt: alle
# docker-compose-Aufrufe sind auf das Projekt `arasul-platform` gescoped.
# =============================================================================
set -uo pipefail

# --- Konfiguration -----------------------------------------------------------
SRC="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE nicht gesetzt}"   # _work-Checkout @ NEW
NEW_SHA="${GITHUB_SHA:?GITHUB_SHA nicht gesetzt}"
PROJECT="arasul-platform"
COMPOSE=(docker compose -p "$PROJECT")
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-240}"   # Sekunden pro Service auf 'healthy'
BACKUP_DIR="${HOME}/db-backups"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31mx %s\033[0m\n' "$*" >&2; }

summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY" || true; }

# --- 0. Wo steht das Geraet? -------------------------------------------------
# Bis zum 29.08.2026 stand hier ein Pfad, und zwar im Workflow:
# `/home/arasul/arasul/arasul-jet`. Das war eine Annahme, und sie ist falsch
# geworden, ohne dass sich hier eine Zeile geaendert haette -- seit der Orin
# ueber das Ara-Kit installiert wurde, laeuft der Live-Stapel aus
# `/home/arasul/arasul-<Fassung>`. Der Deploy arbeitete danach in einem
# Verzeichnis ohne Geheimnisse, `docker compose up` brach ab (Lauf 33221221851),
# und es kam nichts mehr automatisch auf das Geraet.
#
# DAS IST DIESELBE WURZEL WIE BEIM KUNDENWEG: wer nicht weiss, wo der Zustand
# liegt, raet. Gefragt wird deshalb dasselbe wie in `install.sh` -- Docker,
# dann der Zeiger (`scripts/lib/installation.sh`). `DEPLOY_DIR` bleibt als
# Uebersteuerung von Hand, aber ohne Vorgabe: ein Deploy, der nicht weiss,
# wohin, deployt NICHT. Ins Leere zu bauen und gruen zu melden ist der
# schlimmere Ausgang.
INSTALL_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/installation.sh"
if ! source "$INSTALL_LIB"; then
  echo "ABBRUCH: ${INSTALL_LIB} nicht ladbar." >&2
  exit 1
fi
DEPLOY_DIR="${DEPLOY_DIR:-$(installation_finden)}"
if [ -z "$DEPLOY_DIR" ] || [ ! -d "$DEPLOY_DIR" ]; then
  err "Auf diesem Geraet ist keine Installation zu finden."
  err "  Gefragt wurde Docker (Etikett com.docker.compose.project=${ARASUL_PROJEKT})"
  err "  und der Zeiger ${ARASUL_ZEIGER}."
  err "  Laeuft der Stapel? \`docker compose -p ${ARASUL_PROJEKT} ps\`"
  err "  Von Hand: DEPLOY_DIR=/pfad/zur/installation bash scripts/deploy/deploy-local.sh"
  summary "❌ **Deploy rot**: keine Installation gefunden, es wurde nichts angefasst."
  exit 1
fi
cd "$DEPLOY_DIR" || { err "DEPLOY_DIR $DEPLOY_DIR fehlt"; exit 1; }
ok "Installation: $DEPLOY_DIR"


# --- Wartungsfenster ---------------------------------------------------------
# Waehrend `docker compose up` steht der alte Container noch da und ist
# ungesund, weil er gerade heruntergefahren wird. Die Selbstheilung sah darin
# einen Ausfall und startete ihn neu, mitten im Deploy. Warum das so gebaut
# ist und warum der Pfad bei Docker erfragt statt geraten wird, steht in
# `scripts/lib/wartungsfenster.sh` — dieselbe Datei nutzt `pruefstand.sh`,
# denn ein Build des zweiten Stacks richtet auf demselben Geraet denselben
# Schaden an.
# Hart abbrechen, wenn die Bibliothek fehlt. `deploy-local.sh` laeuft mit
# `set -uo pipefail` OHNE `-e`: ein gescheitertes `source` wuerde den Lauf
# nicht anhalten, `wartung_an` waere nur ein "command not found", und der
# Deploy liefe gruen durch — mit einem Wartungsfenster, das nie aufgeht. Ein
# Schutz, der still ausfaellt, ist schlimmer als keiner, weil man sich auf ihn
# verlaesst.
WARTUNG_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/wartungsfenster.sh"
if ! source "$WARTUNG_LIB"; then
  echo "ABBRUCH: ${WARTUNG_LIB} nicht ladbar. Ohne Wartungsfenster wird nicht deployt." >&2
  exit 1
fi
WARTUNG_FALLBACK_DIR="${DEPLOY_DIR}/logs"
WARTUNG_GRUND="deploy ${NEW_SHA:0:7}"
trap wartung_aus EXIT

# Pfad-Praefix -> compose-Servicename. Reihenfolge egal.
declare -A PATH2SVC=(
  ["apps/dashboard-backend/"]="dashboard-backend"
  ["apps/dashboard-frontend/"]="dashboard-frontend"
  ["services/llm-service/"]="llm-service"
  ["services/embedding-service/"]="embedding-service"
  ["services/document-indexer/"]="document-indexer"
  ["services/metrics-collector/"]="metrics-collector"
  ["services/self-healing-agent/"]="self-healing-agent"
  ["services/backup-service/"]="backup-service"
  ["packages/"]="dashboard-backend"          # geteilte Schemas -> Backend neu bauen
  ["libs/"]="dashboard-backend"
)

# --- 1. Neuen Stand in den kanonischen Checkout holen ------------------------
# Der Vergleichsstand kommt von GitHub (`github.event.before`), NICHT aus dem
# Arbeitsverzeichnis. Bis zum 20.08.2026 stand hier `git rev-parse HEAD`, und
# damit hing der Deploy davon ab, worauf jemand dieses Verzeichnis zuletzt
# gestellt hat. Zweimal an einem Abend gesehen:
#
#   - Der Checkout lag auf einem Branch, der den Code schon enthielt. Der
#     Vergleich fand nur noch Doku-Aenderungen, der Deploy meldete gruen und
#     baute nichts. Der Code war gemergt und das Geraet lief weiter mit dem
#     alten Stand.
#   - Ein `git pull` von Hand kam dem Lauf zuvor. Dann war PREV gleich NEW,
#     "Keine Dateiaenderungen", wieder gruen, wieder nichts gebaut.
#
# Beides faellt nur auf, wenn jemand auf die Laufzeit sieht: 12 Sekunden statt
# anderthalb Minuten. Ein Deploy, der nicht ausrechnen kann, was sich geaendert
# hat, muss ALLES bauen und nicht nichts. Diese Richtung ist die einzige, die
# sich nicht als Erfolg tarnt.
# Ein aus dem Artefakt installiertes Geraet hat kein `.git` -- das Artefakt
# kommt aus `git archive` und traegt keine Historie. Der Deploy legt sie hier
# an, und danach ist dieses Verzeichnis genau das, was es fuer den Deploy
# immer war: ein Arbeitsbaum, den ein `git reset --hard` auf den neuen Stand
# stellt. Der ZUSTAND ueberlebt das unangetastet -- `.env`, `config/secrets`,
# `config/traefik/certs`, `data/` und `logs/` stehen in der `.gitignore`, sind
# also unversioniert, und `git reset --hard` fasst Unversioniertes nicht an.
#
# So treffen sich die beiden Wege: der Kunde legt ein Artefakt ueber sein
# Geraet (`install.sh`), Kolja legt einen Commit darueber (dieser Deploy) --
# beide arbeiten in DEMSELBEN Verzeichnis, dem, das Docker nennt. Zwei
# verschiedene Mechanismen, und das bleibt auch so: ein Deploy je Merge, der
# den ganzen Bootstrap mit Hardwarepruefung, zwoelf Images und Rauchtest
# fuehre, waere am Orin ein Tagesgeschaeft aus Vollbauten (schon einmal elf
# Deploys in 66 Minuten). Der Deploy baut, was sich geaendert hat; das
# Artefakt richtet ein Geraet ein. Verschiedene Aufgaben, ein Ort.
OHNE_HISTORIE=0
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  log "Kein Git in $DEPLOY_DIR (aus dem Artefakt installiert) — Arbeitsbaum wird angelegt"
  git init -q || { err "git init in $DEPLOY_DIR fehlgeschlagen"; exit 1; }
  OHNE_HISTORIE=1
fi
if ! git rev-parse HEAD >/dev/null 2>&1; then
  OHNE_HISTORIE=1
fi

# `arasul-release.json` sagt "dieser Baum kommt aus Artefakt X", und
# `fassung_aus_bau` liest sie VOR Git (scripts/lib/fassung.sh). Nach einem
# Deploy stimmt der Satz nicht mehr: der Code ist ein anderer. Bliebe die
# Datei liegen, meldete `/api/health` fuer immer die Fassung des Artefakts,
# waehrend der Stand daneben weiterlaeuft -- genau die Sorte Behauptung, gegen
# die die Fassung aus dem Bau gebaut wurde. Sie ist unversioniert, also raeumt
# sie kein `git reset` weg; hier wird sie es.
if [ -f "$DEPLOY_DIR/arasul-release.json" ]; then
  rm -f "$DEPLOY_DIR/arasul-release.json"
  ok "arasul-release.json entfernt — die Fassung kommt ab jetzt aus Git"
fi

PREV_SHA="${GITHUB_EVENT_BEFORE:-}"
ALLES_BAUEN=0
NULLEN='0000000000000000000000000000000000000000'
if [ "$OHNE_HISTORIE" -eq 1 ]; then
  # Der erste Deploy in ein Artefakt-Verzeichnis. `PREV..NEW` waere hier die
  # falsche Frage: sie beantwortet "was hat sich seit dem letzten Push
  # geaendert", waehrend das Geraet auf dem Stand eines TAGS steht, der
  # zwanzig Merges zurueckliegen kann. Alles, was in diesem Fenster nicht
  # angefasst wurde, bliebe auf einem alten Abbild stehen, ohne dass es
  # irgendwo auffiele.
  warn "Kein bisheriger Stand in $DEPLOY_DIR. Es werden alle Services gebaut."
  ALLES_BAUEN=1
  PREV_SHA="$NEW_SHA"
elif [ -z "$PREV_SHA" ] || [ "$PREV_SHA" = "$NULLEN" ]; then
  warn "Kein Vergleichsstand von GitHub. Es werden alle Services gebaut."
  ALLES_BAUEN=1
  PREV_SHA="$(git rev-parse HEAD)"
elif [ "$PREV_SHA" = "$NEW_SHA" ]; then
  warn "Vergleichsstand gleich neuem Stand. Es werden alle Services gebaut."
  ALLES_BAUEN=1
fi
log "Deploy $PREV_SHA → $NEW_SHA (in $DEPLOY_DIR)"

# Der Stand, aus dem die LAUFENDEN Images gebaut wurden — der HEAD des Geraets,
# bevor dieser Deploy etwas auscheckt. Nicht dasselbe wie PREV_SHA.
#
# PREV_SHA kommt von GitHub und beantwortet die Frage „was hat sich seit dem
# letzten Push geaendert, also welche Services muessen gebaut werden". Fuer den
# Rollback ist das die falsche Zahl, und am 24.08.2026 ist der Unterschied
# eingetreten: zwei Deploys scheiterten hintereinander. Der erste rollte auf
# den knip-Stand zurueck, Images und git gleich. Beim zweiten sagte GitHub als
# BEFORE den flask-cors-Commit — auf dem GERAET lief aber weiter knip. Der
# Rollback setzte git auf flask-cors und die Images auf knip zurueck:
#
#   git log -1  →  a3a1436b  (flask-cors)
#   Image       →  9a5b272e  (der Stand davor)
#
# Danach behauptet das Geraet einen Stand, den es nicht faehrt. Der naechste
# Deploy baut nur, was sich seit PREV geaendert hat — ein Dienst, der nicht
# angefasst wird, bleibt dann dauerhaft auf einem alten Abbild, ohne dass es
# irgendwo auffaellt.
#
# Nebengewinn: GERAET_SHA liegt garantiert lokal vor, PREV_SHA nicht
# unbedingt. Auf einem Geraet mit Loechern in der Historie (siehe den Kommentar
# an rollback()) scheiterte `git reset --hard "$PREV_SHA"` genau daran.
# Ohne Historie gibt es keinen Stand, auf den ein Rollback zurueckgehen
# koennte. Leer und nicht geraten: `rollback()` laesst den git-Schritt dann
# aus und sagt das auch, statt an einem `git reset --hard ""` zu scheitern.
GERAET_SHA=""
if [ "$OHNE_HISTORIE" -eq 0 ]; then
  GERAET_SHA="$(git rev-parse HEAD)"
fi

if ! git fetch --quiet "$SRC" "$NEW_SHA"; then
  err "git fetch aus _work-Checkout fehlgeschlagen"; exit 1
fi
git reset --hard "$NEW_SHA" || { err "git reset fehlgeschlagen"; exit 1; }
ok "Working Tree auf $NEW_SHA"

# --- 1a. Die Fassung kommt aus dem Bau ---------------------------------------
# Das Geraet bekommt seinen Stand ueber diesen Deploy, nicht ueber das
# Auslieferungsartefakt. Ohne diese Zeilen bliebe in der `.env` die Fassung
# stehen, die bei der INSTALLATION galt -- und `/api/health` naehme sie ein
# Jahr spaeter noch immer. Was hier gesetzt wird, steht in
# scripts/lib/fassung.sh: ein Tag genau auf HEAD, sonst Datum plus SHA.
# shellcheck source=../lib/fassung.sh
source "$DEPLOY_DIR/scripts/lib/fassung.sh"
NEUE_FASSUNG="$(fassung_aus_bau "$DEPLOY_DIR")"
ALTE_FASSUNG="$(grep '^SYSTEM_VERSION=' "$DEPLOY_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
FASSUNG_GEWECHSELT=0
if [ -n "$NEUE_FASSUNG" ] && [ "$NEUE_FASSUNG" != "$ALTE_FASSUNG" ]; then
  env_setzen "$DEPLOY_DIR/.env" SYSTEM_VERSION "$NEUE_FASSUNG"
  env_setzen "$DEPLOY_DIR/.env" BUILD_HASH "$(bau_hash "$DEPLOY_DIR")"
  FASSUNG_GEWECHSELT=1
  ok "Fassung ${ALTE_FASSUNG:-keine} → $NEUE_FASSUNG"
fi

# --- 1b. Fehlende, auto-generierbare Docker-Secrets idempotent nachziehen ----
# Neu eingefuehrte Secret-Dateien existieren auf Bestandsgeraeten noch nicht.
# compose kann eine fehlende Bind-Quelle nicht mounten und der Deploy bricht ab.
# Der automatisierte Deploy fuehrt kein ./arasul bootstrap aus, deshalb hier die
# nicht datentragenden Secrets idempotent erzeugen — bestehende Werte werden
# NIE ueberschrieben. (Bis Phase B5 am 26.08.2026 standen hier die n8n-Owner-
# Zugangsdaten und das SearXNG-Geheimnis; beide Dienste sind weg.)
# --- 1c. Neu eingefuehrte Bind-Mount-Quellen idempotent anlegen -------------
# Gleiche Logik wie bei den Secrets oben: Ein Verzeichnis, das erst mit einem
# neuen Release dazukommt, existiert auf Bestandsgeraeten noch nicht. Legt
# Docker die fehlende Bind-Quelle beim Start selbst an, gehoert sie ROOT — der
# als uid 1000 laufende dashboard-backend kann dann nicht hineinschreiben und
# jeder Schreibzugriff endet in EACCES. Hier angelegt, gehoert das Verzeichnis
# dem Deploy-Nutzer (uid 1000) und ist damit schreibbar.
#
# `data/apps` kam mit Phase C3 (27.08.2026) dazu: dort liegen die Pakete der
# Apps, ein Ordner je Kennung und Version, und das Backend schreibt sie beim
# Einspielen hinein. Am 27.08. gehoerte der Ordner am Orin ROOT -- Docker hatte
# ihn beim Start des Backends selbst angelegt, weil hier nur `data/skills`
# stand. Das Einspielen scheiterte daraufhin mit EACCES, und zwar nicht beim
# Deploy, sondern erst Stunden spaeter beim ersten Versuch, eine App
# einzuspielen.
# `config/traefik/certs` steht mit in der Liste, seit die Selbstheilung dort
# hineinschreibt (Phase C10, Erneuerung des Geraetezertifikats). Ein Ordner,
# den Docker beim Start selbst anlegt, gehoert root -- und dann scheitert die
# Erneuerung erst in zwei Jahren, an einem Geraet, an dem niemand mehr sitzt.
for ordner in "$DEPLOY_DIR/data/skills" "$DEPLOY_DIR/data/apps" "$DEPLOY_DIR/config/traefik/certs"; do
  mkdir -p "$ordner"
  [ -w "$ordner" ] && continue
  # Ein Ordner, den Docker vor diesem Deploy angelegt hat, gehoert root. Der
  # Versuch kostet nichts und gelingt nur, wenn der Deploy-Nutzer darf.
  chown -R "$(id -u):$(id -g)" "$ordner" 2>/dev/null
  [ -w "$ordner" ] && continue
  warn "$ordner gehoert $(stat -c '%U' "$ordner" 2>/dev/null || echo '?') und ist fuer den Deploy-Nutzer nicht schreibbar."
  warn "  Das Backend laeuft als uid 1000 und kann dort nichts ablegen. Von Hand:"
  warn "  sudo chown -R $(id -u):$(id -g) $ordner"
  summary "⚠️ \`$ordner\` ist nicht schreibbar (gehoert root). \`sudo chown -R $(id -u):$(id -g) $ordner\`"
done

SECRETS_DIR="$DEPLOY_DIR/config/secrets"
mkdir -p "$SECRETS_DIR"; chmod 700 "$SECRETS_DIR" 2>/dev/null || true

# --- 2. Geaenderte Dateien -> Services ---------------------------------------
# Der Rueckgabewert von `git diff` wird ausgewertet. Ohne das schluckt
# `mapfile < <(...)` einen Fehlschlag und liefert eine leere Liste, und eine
# leere Liste liest sich wie "nichts geaendert". Ein flacher Klon auf dem
# Runner reicht schon, damit der Vergleichsstand nicht lesbar ist.
CHANGED=()
if [ "$ALLES_BAUEN" -eq 0 ]; then
  if DIFF="$(git diff --name-only "$PREV_SHA" "$NEW_SHA" 2>&1)"; then
    [ -n "$DIFF" ] && mapfile -t CHANGED <<< "$DIFF"
  else
    warn "Vergleich $PREV_SHA..$NEW_SHA nicht moeglich ($DIFF). Es werden alle Services gebaut."
    ALLES_BAUEN=1
  fi
fi

if [ "$ALLES_BAUEN" -eq 1 ]; then
  mapfile -t CHANGED < <(git ls-files)
  INFRA_CHANGE_ERZWUNGEN=1
elif [ "${#CHANGED[@]}" -eq 0 ]; then
  ok "Keine Dateiaenderungen — nichts zu deployen."; summary "Deploy: no file changes."; exit 0
fi

declare -A SVC_SET=()
INFRA_CHANGE="${INFRA_CHANGE_ERZWUNGEN:-0}"
MIGRATION_CHANGE=0
for f in "${CHANGED[@]}"; do
  case "$f" in
    compose/*|docker-compose.yml|.env|.env.*) INFRA_CHANGE=1 ;;
    services/postgres/init/*) MIGRATION_CHANGE=1; SVC_SET["dashboard-backend"]=1 ;;
  esac
  for p in "${!PATH2SVC[@]}"; do
    [[ "$f" == "$p"* ]] && SVC_SET["${PATH2SVC[$p]}"]=1
  done
done

# Die neue Fassung an das Backend weiterreichen.
#
# `SYSTEM_VERSION` steht in der `.env` und wird beim START eines Containers
# gelesen. Ein Deploy, der das Backend nicht anfasst, laesst die alte Zahl in
# `/api/health` stehen, obwohl in der Datei die neue steht.
#
# Nur `up -d --no-build dashboard-backend` und NICHT `INFRA_CHANGE=1`: die
# Fassung wechselt bei JEDEM Deploy (sie traegt den SHA), auch bei einem reinen
# Doku-Merge. Der ganze Stapel wuerde dann jedes Mal durchgesehen, und dieses
# Repo hat schon einmal elf Deploys in 66 Minuten gehabt. Ein Container, ein
# Neustart, fertig.
fassung_anwenden() {
  [ "$FASSUNG_GEWECHSELT" -eq 1 ] || return 0
  log "Fassung an das Backend weiterreichen"
  "${COMPOSE[@]}" up -d --no-build dashboard-backend || \
    warn "dashboard-backend nicht neu gestartet — /api/health nennt weiter die alte Fassung"
}

SERVICES=("${!SVC_SET[@]}")
if [ "${#SERVICES[@]}" -eq 0 ] && [ "$INFRA_CHANGE" -eq 0 ]; then
  ok "Nur nicht-deploybare Dateien (docs/.claude/.github/tests) geaendert — kein Rebuild."
  fassung_anwenden
  summary "Deploy: only non-deployable files changed — skipped."; exit 0
fi

log "Zu bauende Services: ${SERVICES[*]:-<keine>}  | Infra-Change: $INFRA_CHANGE  | Migration: $MIGRATION_CHANGE"

# --- 3. DB-Backup vor Backend-/Migrations-Aenderungen ------------------------
if [ "$MIGRATION_CHANGE" -eq 1 ] || [[ " ${SERVICES[*]} " == *" dashboard-backend "* ]]; then
  mkdir -p "$BACKUP_DIR"
  DUMP="$BACKUP_DIR/pre-deploy_$(git rev-parse --short "$NEW_SHA")_$(date +%Y%m%d_%H%M%S).sql"
  log "DB-Dump → $DUMP"
  if docker exec -t postgres-db pg_dump -U arasul arasul_db > "$DUMP" 2>/dev/null; then
    ok "DB-Backup erstellt ($(du -h "$DUMP" | cut -f1))"
  else
    err "DB-Backup fehlgeschlagen — Abbruch vor Migration."; rm -f "$DUMP"; exit 1
  fi
fi

# --- 4. Rollback-Punkt: aktuelle Images taggen -------------------------------
declare -A HAD_IMAGE=()
for s in "${SERVICES[@]}"; do
  img="${PROJECT}-${s}:latest"
  if docker image inspect "$img" >/dev/null 2>&1; then
    docker tag "$img" "${PROJECT}-${s}:rollback" && HAD_IMAGE["$s"]=1
  fi
done
ok "Rollback-Images getaggt: ${!HAD_IMAGE[*]:-<keine>}"

# --- Rollback-Funktion -------------------------------------------------------
# Jeder Schritt haengt hier an `|| true`, und das ist richtig: ein Rollback
# soll ALLES versuchen und nicht beim ersten Fehler stehenbleiben. Falsch war
# nur die Meldung danach. Bis zum 23.08.2026 stand dort unbedingt
# "Produktivstand wiederhergestellt" — auch wenn kein einziger Schritt geklappt
# hatte. Auf dem kritischsten Pfad des Geraets las der Betreiber damit einen
# Erfolg, waehrend der kaputte Stand weiterlief.
#
# Das ist kein erfundener Fall: die Git-Historie auf dem Orin hat ein Loch
# (60 von ueber 700 Commits vorhanden, `main` nicht durchlaufbar). Ein
# `git reset --hard` auf einen aelteren Stand scheitert dort, und der
# Diff-Zweig weiter oben rechnet ausdruecklich damit.
rollback() {
  err "DEPLOY FEHLGESCHLAGEN — Rollback wird ausgefuehrt."
  local misslungen=()
  for s in "${SERVICES[@]}"; do
    if [ "${HAD_IMAGE[$s]:-0}" -eq 1 ]; then
      docker tag "${PROJECT}-${s}:rollback" "${PROJECT}-${s}:latest" ||
        misslungen+=("Image $s")
    fi
  done
  # Container mit dem alten Image (ohne Rebuild) wieder hochfahren
  if ! "${COMPOSE[@]}" up -d --no-build "${SERVICES[@]}" 2>&1 | tail -5; then
    misslungen+=("Container starten")
  fi
  # Auf GERAET_SHA, nicht auf PREV_SHA: git muss auf den Stand zeigen, aus dem
  # die gerade zurueckgetaggten Images gebaut wurden. Siehe die Begruendung an
  # der Stelle, wo GERAET_SHA gesetzt wird.
  if [ -z "$GERAET_SHA" ]; then
    warn "Kein voriger Git-Stand (erster Deploy in dieses Verzeichnis) — nur die Images gehen zurueck."
  elif ! git reset --hard "$GERAET_SHA"; then
    misslungen+=("git reset auf $GERAET_SHA")
  fi

  if [ "${#misslungen[@]}" -eq 0 ]; then
    err "Rollback auf $GERAET_SHA abgeschlossen. Produktivstand wiederhergestellt."
    summary "❌ **Deploy fehlgeschlagen** → automatischer Rollback auf \`${GERAET_SHA:0:7}\`."
  else
    err "Rollback UNVOLLSTAENDIG. Nicht geklappt: ${misslungen[*]}"
    err "Das Geraet steht NICHT auf dem Produktivstand. Bitte von Hand nachsehen."
    summary "❌ **Deploy fehlgeschlagen**, und der Rollback auf \`${GERAET_SHA:0:7}\` ist UNVOLLSTAENDIG: ${misslungen[*]}"
  fi
  exit 1
}

# --- 5. Bauen + Hochfahren ---------------------------------------------------
# Das Fenster faengt beim Bauen an, nicht erst beim Hochfahren: ein Build
# lastet den Orin aus, und mehrere Dienste haben nur ein bis drei Sekunden
# Healthcheck-Timeout. Unter Last kippt so einer, ohne dass ihm etwas fehlt.
wartung_an
if [ "${#SERVICES[@]}" -gt 0 ]; then
  log "Baue: ${SERVICES[*]}"
  "${COMPOSE[@]}" build "${SERVICES[@]}" || rollback
  log "Starte: ${SERVICES[*]}"
  "${COMPOSE[@]}" up -d "${SERVICES[@]}" || rollback
fi
if [[ " ${SERVICES[*]} " != *" dashboard-backend "* ]] && [ "$INFRA_CHANGE" -eq 0 ]; then
  fassung_anwenden
fi
if [ "$INFRA_CHANGE" -eq 1 ]; then
  log "Infra-/Compose-Aenderung — wende Konfiguration auf gesamten Stack an (up -d, ohne Rebuild)"
  # --remove-orphans: ein Dienst, der aus der Compose-Datei verschwindet, laeuft
  # sonst als Waise weiter. Phase B5 (26.08.2026) hat n8n, n8n-runners und
  # searxng gestrichen; ohne diesen Schalter haetten sie am Geraet weitergelebt,
  # und `docker ps` haette die Phase nicht bestanden. Betrifft nur Container
  # dieses Compose-Projekts, nicht jetcam oder den Pruefstand.
  "${COMPOSE[@]}" up -d --no-build --remove-orphans || rollback
fi

# --- 6. Healthcheck ----------------------------------------------------------
health_of() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}' "$1" 2>/dev/null || echo "missing"; }
running_of() { docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null || echo "missing"; }

# Warum es diese Funktion gibt: bis zum 24.08.2026 meldete der Deploy bei einem
# Fehlschlag nur `x <name> ist unhealthy` und rollte zurueck. An diesem Morgen
# scheiterten zwei Deploys hintereinander, und aus dem Lauf-Log war die Ursache
# nicht zu erkennen. Sie stand die ganze Zeit im Container-Log — nur ersetzt der
# Rollback den Container, und sein Log verschwindet mit ihm. Die Ursache liess
# sich erst mit einem eigenen Beobachter am Geraet einkreisen, eine halbe Stunde
# spaeter. Alles, was dieser Block ausgibt, war zum Zeitpunkt des Fehlschlags da.
diagnose() {
  local cname="$1" neustarts
  neustarts="$(docker inspect "$cname" --format '{{.RestartCount}}' 2>/dev/null || echo '?')"
  err "Diagnose $cname — Status: $(running_of "$cname"), Health: $(health_of "$cname"), Neustarts: $neustarts"
  # Ein Dienst, der mehrfach neu gestartet wurde, ist nicht langsam, sondern
  # tot: er stirbt, die Restart-Policy hebt ihn auf, er stirbt wieder. Das ist
  # ein anderer Fehler als "braucht laenger als der Timeout" und verdient einen
  # anderen Satz, sonst sucht der naechste an der falschen Stelle.
  case "$neustarts" in
    ''|*[!0-9]*) : ;;
    *) [ "$neustarts" -gt 1 ] && err "  Crash-Loop: der Dienst kommt gar nicht hoch." ;;
  esac
  err "  Letzte Health-Pruefungen:"
  docker inspect "$cname" \
    --format '{{range .State.Health.Log}}    {{.Start}} exit={{.ExitCode}} {{.Output}}{{end}}' \
    2>/dev/null | tail -c 800 >&2 || true
  err "  Letzte 40 Zeilen aus dem Container-Log:"
  docker logs --tail 40 "$cname" 2>&1 | sed 's/^/    /' >&2 || true
}

for s in "${SERVICES[@]}"; do
  cname="$s"   # container_name == servicename fuer alle Produkt-Services
  log "Healthcheck: $cname (Timeout ${HEALTH_TIMEOUT}s)"
  deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  status=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    h="$(health_of "$cname")"
    case "$h" in
      healthy) status="healthy"; break ;;
      nohealth)
        # Kein Healthcheck definiert: 15s stabil laufen lassen als Ersatzsignal
        [ "$(running_of "$cname")" = "running" ] && sleep 15 && [ "$(running_of "$cname")" = "running" ] && { status="running"; break; }
        ;;
      unhealthy) err "$cname ist unhealthy"; diagnose "$cname"; rollback ;;
      missing) err "$cname existiert nicht"; rollback ;;
    esac
    wartung_an   # Herzschlag: der Healthcheck darf laenger dauern als der Deckel
    sleep 5
  done
  [ -z "$status" ] && { err "$cname wurde nicht rechtzeitig healthy"; diagnose "$cname"; rollback; }
  ok "$cname: $status"
done

# --- 7. Das Migrationsbuch ---------------------------------------------------
# Warum es diesen Schritt gibt: am 27.08.2026 meldete der Deploy gruen, und auf
# dem Geraet war Migration 169 gescheitert. Im Buch stand
# `success = false`, die Tabelle `apps` gab es nicht, und die Abnahme fiel
# Stunden spaeter darueber. Der Healthcheck konnte das nicht sehen: das Backend
# faehrt seine Migrationen NACH `server.listen()` (siehe `index.js`), es ist
# also gesund, bevor es weiss, ob das Schema steht.
#
# Geprueft wird deshalb beides, und zwar mit Geduld statt einmal:
#   1. keine Migration mit `success = false`, und
#   2. die hoechste .sql auf der Platte steht im Buch.
# Die zweite Frage faengt den Fall, der am 27.08. vorlag: der Runner haelt beim
# ersten Fehlschlag an, also fehlt alles danach im Buch, ohne dass irgendwo
# etwas rot ist.
#
# KEIN Rollback. Ein Rollback taggt Images zurueck und setzt git zurueck; an
# einem Schema aendert er nichts, denn was vor der gescheiterten Migration lief,
# ist laengst festgeschrieben. Er wuerde also ALTEN Code auf ein NEUES Schema
# stellen, und das ist schlechter als der Zustand, den er reparieren soll. Der
# neue Stand bleibt stehen, der Deploy wird rot, und die Meldung sagt, wo
# nachzusehen ist.
buch_schema() {
  docker exec postgres-db psql -U arasul -d arasul_db -tA -c \
    "SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'schema_migrations' AND table_schema IN ('arasul','public')
      ORDER BY CASE table_schema WHEN 'arasul' THEN 0 ELSE 1 END LIMIT 1" 2>/dev/null | tr -d '[:space:]'
}

# Die hoechste Migrationsnummer auf der Platte. Nicht abgeschrieben: eine feste
# Zahl waere bei der naechsten Migration falsch. Nur .sql, denn nur die
# verarbeitet der Runner.
hoechste_migration() {
  local hoechste=0 roh
  for datei in "$DEPLOY_DIR"/services/postgres/init/*.sql; do
    roh="$(basename "$datei")"
    roh="${roh%%_*}"
    roh="${roh%[a-z]}"
    [[ "$roh" =~ ^[0-9]+$ ]] || continue
    [ "$((10#$roh))" -gt "$hoechste" ] && hoechste=$((10#$roh))
  done
  echo "$hoechste"
}

log "Migrationsbuch pruefen"
BUCH_SCHEMA="$(buch_schema)"
if [ -z "$BUCH_SCHEMA" ]; then
  err "Migrationsbuch nicht lesbar: postgres-db antwortet nicht oder kennt keine Tabelle schema_migrations."
  summary "❌ **Deploy rot** \`${NEW_SHA:0:7}\`: das Migrationsbuch liess sich nicht lesen."
  exit 1
fi
BUCH="${BUCH_SCHEMA}.schema_migrations"
HOECHSTE="$(hoechste_migration)"
ok "Buch in $BUCH, hoechste Migration auf der Platte: $HOECHSTE"

buch_frage() {
  docker exec postgres-db psql -U arasul -d arasul_db -tA -c "$1" 2>/dev/null | tr -d '\r'
}

# Zuerst warten, dann urteilen. Die Reihenfolge ist nicht beliebig: eine Zeile
# mit `success = false` steht so lange im Buch, BIS der Runner sie ueberschreibt,
# und das tut er erst waehrend seines Laufs. Wer sofort nach dem Healthcheck
# fragt, liest also den Fehlschlag des VORIGEN Starts und macht ausgerechnet den
# Deploy rot, der ihn behebt. Erst wenn die hoechste Migration im Buch steht,
# ist der Lauf durch, und ab da ist jede Antwort belastbar.
MIGRATION_DEADLINE=$(( SECONDS + 180 ))
BUCH_STAND=""
while :; do
  if [ "$(buch_frage "SELECT count(*) FROM ${BUCH} WHERE version = ${HOECHSTE} AND success = true")" = "1" ]; then
    BUCH_STAND="ok"
    break
  fi
  [ "$SECONDS" -ge "$MIGRATION_DEADLINE" ] && break
  wartung_an   # Herzschlag, wie beim Healthcheck: Migrationen duerfen dauern
  sleep 5
done

GESCHEITERT="$(buch_frage "SELECT version || ' ' || filename FROM ${BUCH} WHERE success = false ORDER BY version")"
if [ -n "$GESCHEITERT" ]; then
  err "Migration gescheitert. Im Buch steht:"
  printf '%s\n' "$GESCHEITERT" | sed 's/^/    /' >&2
  err "  Der neue Stand laeuft, aber das Schema ist nicht das, was er erwartet."
  err "  Nachsehen: docker logs dashboard-backend 2>&1 | grep -i migration"
  summary "❌ **Deploy rot** \`${NEW_SHA:0:7}\`: gescheiterte Migration(en) im Buch: $(printf '%s' "$GESCHEITERT" | tr '\n' ' ')"
  exit 1
fi

if [ -z "$BUCH_STAND" ]; then
  err "Migration $HOECHSTE steht nach 180s nicht im Buch ($BUCH), und gescheitert ist auch keine."
  err "  Entweder laeuft der Runner noch, oder das Backend hat ihn gar nicht erst gestartet."
  err "  Nachsehen: docker logs dashboard-backend 2>&1 | grep -i migration"
  summary "❌ **Deploy rot** \`${NEW_SHA:0:7}\`: Migration $HOECHSTE steht nicht im Migrationsbuch."
  exit 1
fi
ok "Migrationsbuch: keine gescheiterte Migration, $HOECHSTE angewendet"

# --- Erfolg ------------------------------------------------------------------
ok "Deploy erfolgreich: $NEW_SHA"
summary "✅ **Deploy erfolgreich** \`${NEW_SHA:0:7}\` — Services: ${SERVICES[*]:-<config-only>}"
exit 0
