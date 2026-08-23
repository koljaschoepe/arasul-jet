#!/usr/bin/env bash
# =============================================================================
# deploy-local.sh — GitOps-Deploy auf dem Jetson (self-hosted Runner)
# =============================================================================
# Wird von .github/workflows/deploy.yml aufgerufen, nachdem ein Merge auf `main`
# gepusht wurde. Deployt AUSSCHLIESSLICH aus dem kanonischen Deploy-Verzeichnis
# ($DEPLOY_DIR), damit .env / config/ / data/ und alle Bind-Mounts intakt
# bleiben — NIEMALS aus dem Runner-_work-Checkout (dort fehlen diese Daten).
#
# Ablauf:
#   1. Objekte des neuen Commits aus dem _work-Checkout in $DEPLOY_DIR ziehen
#      (auth-frei, da actions/checkout bereits authentifiziert hat).
#   2. Nur GEAENDERTE Services ermitteln (git diff PREV..NEW).
#   3. Vor Backend-/Migrations-Aenderungen: DB-Dump.
#   4. Aktuelle Images als :rollback taggen.
#   5. Nur die geaenderten Services neu bauen + hochfahren.
#   6. Healthcheck. Bei Fehler: Auto-Rollback (Image zuruecktaggen + git reset).
#
# Andere Stacks (flow-*, livia-*, jarvis-*) bleiben unberuehrt: alle
# docker-compose-Aufrufe sind auf das Projekt `arasul-platform` gescoped.
# =============================================================================
set -uo pipefail

# --- Konfiguration -----------------------------------------------------------
DEPLOY_DIR="${DEPLOY_DIR:-/home/arasul/arasul/arasul-jet}"
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

# --- Wartungsfenster ---------------------------------------------------------
# Waehrend `docker compose up` steht der alte Container noch da und ist
# ungesund, weil er gerade heruntergefahren wird. Die Selbstheilung sah darin
# einen Ausfall und startete ihn neu, mitten im Deploy. Warum das so gebaut
# ist und warum der Pfad bei Docker erfragt statt geraten wird, steht in
# `scripts/lib/wartungsfenster.sh` — dieselbe Datei nutzt `pruefstand.sh`,
# denn ein Build des zweiten Stacks richtet auf demselben Geraet denselben
# Schaden an.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/wartungsfenster.sh"
WARTUNG_FALLBACK_DIR="${DEPLOY_DIR}/logs"
WARTUNG_GRUND="deploy ${NEW_SHA:0:7}"
trap wartung_aus EXIT

# Pfad-Praefix -> compose-Servicename. Reihenfolge egal.
declare -A PATH2SVC=(
  ["apps/dashboard-backend/"]="dashboard-backend"
  ["apps/dashboard-frontend/"]="dashboard-frontend"
  ["services/n8n/"]="n8n"
  ["services/llm-service/"]="llm-service"
  ["services/embedding-service/"]="embedding-service"
  ["services/document-indexer/"]="document-indexer"
  ["services/metrics-collector/"]="metrics-collector"
  ["services/self-healing-agent/"]="self-healing-agent"
  ["services/backup-service/"]="backup-service"
  ["packages/"]="dashboard-backend"          # geteilte Schemas -> Backend neu bauen
  ["libs/"]="dashboard-backend"
)

cd "$DEPLOY_DIR" || { err "DEPLOY_DIR $DEPLOY_DIR fehlt"; exit 1; }

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
PREV_SHA="${GITHUB_EVENT_BEFORE:-}"
ALLES_BAUEN=0
NULLEN='0000000000000000000000000000000000000000'
if [ -z "$PREV_SHA" ] || [ "$PREV_SHA" = "$NULLEN" ]; then
  warn "Kein Vergleichsstand von GitHub. Es werden alle Services gebaut."
  ALLES_BAUEN=1
  PREV_SHA="$(git rev-parse HEAD)"
elif [ "$PREV_SHA" = "$NEW_SHA" ]; then
  warn "Vergleichsstand gleich neuem Stand. Es werden alle Services gebaut."
  ALLES_BAUEN=1
fi
log "Deploy $PREV_SHA → $NEW_SHA (in $DEPLOY_DIR)"
if ! git fetch --quiet "$SRC" "$NEW_SHA"; then
  err "git fetch aus _work-Checkout fehlgeschlagen"; exit 1
fi
git reset --hard "$NEW_SHA" || { err "git reset fehlgeschlagen"; exit 1; }
ok "Working Tree auf $NEW_SHA"

# --- 1b. Fehlende, auto-generierbare Docker-Secrets idempotent nachziehen ----
# Neu eingefuehrte Secret-Dateien existieren auf Bestandsgeraeten noch nicht.
# compose kann eine fehlende Bind-Quelle nicht mounten und der Deploy bricht ab
# (Plan 007: n8n_owner_email/_password). Der automatisierte Deploy fuehrt kein
# ./arasul bootstrap aus, deshalb hier die nicht datentragenden Secrets
# idempotent erzeugen — bestehende Werte werden NIE ueberschrieben.
# --- 1c. Neu eingefuehrte Bind-Mount-Quellen idempotent anlegen -------------
# Gleiche Logik wie bei den Secrets oben: Ein Verzeichnis, das erst mit einem
# neuen Release dazukommt, existiert auf Bestandsgeraeten noch nicht. Legt
# Docker die fehlende Bind-Quelle beim Start selbst an, gehoert sie ROOT — der
# als uid 1000 laufende dashboard-backend kann dann nicht hineinschreiben und
# jeder Schreibzugriff endet in EACCES. Hier angelegt, gehoert das Verzeichnis
# dem Deploy-Nutzer (uid 1000) und ist damit schreibbar.
mkdir -p "$DEPLOY_DIR/data/skills"

SECRETS_DIR="$DEPLOY_DIR/config/secrets"
mkdir -p "$SECRETS_DIR"; chmod 700 "$SECRETS_DIR" 2>/dev/null || true
if [ ! -s "$SECRETS_DIR/n8n_owner_email" ]; then
  printf 'owner@arasul.local' > "$SECRETS_DIR/n8n_owner_email"
  chmod 600 "$SECRETS_DIR/n8n_owner_email"
  ok "n8n-Owner-E-Mail-Secret erzeugt (config/secrets/n8n_owner_email)"
fi
# SearXNG startet ohne Geheimnis gar nicht. Es traegt keine Daten, ist also
# gefahrlos automatisch erzeugbar — und je Geraet verschieden.
if ! grep -q '^SEARXNG_SECRET=' "$DEPLOY_DIR/.env" 2>/dev/null; then
  printf '\nSEARXNG_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$DEPLOY_DIR/.env"
  ok "SEARXNG_SECRET in .env erzeugt"
fi
if [ ! -s "$SECRETS_DIR/n8n_owner_password" ]; then
  # n8n-Policy: >= 8 Zeichen, mind. 1 Grossbuchstabe, mind. 1 Ziffer.
  printf 'A1%s' "$(openssl rand -hex 24)" > "$SECRETS_DIR/n8n_owner_password"
  chmod 600 "$SECRETS_DIR/n8n_owner_password"
  ok "n8n-Owner-Passwort-Secret erzeugt (config/secrets/n8n_owner_password)"
fi

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
SANDBOX_CHANGE=0
for f in "${CHANGED[@]}"; do
  case "$f" in
    compose/*|docker-compose.yml|.env|.env.*) INFRA_CHANGE=1 ;;
    services/postgres/init/*) MIGRATION_CHANGE=1; SVC_SET["dashboard-backend"]=1 ;;
    services/sandbox/*) SANDBOX_CHANGE=1 ;;
  esac
  for p in "${!PATH2SVC[@]}"; do
    [[ "$f" == "$p"* ]] && SVC_SET["${PATH2SVC[$p]}"]=1
  done
done

# --- 2b. Sandbox-Image (arasul-sandbox:latest) -------------------------------
# Das Sandbox-Image ist KEIN compose-Service — es hat keinen laufenden
# Container, sondern wird vom Backend bei Bedarf gestartet (Workspace-Terminals
# und, seit Plan 011 Schritt 7, Terminalbefehle von Skills). Genau deshalb hat
# es bisher NIEMAND gebaut: Auf einem frisch aufgesetzten Geraet fehlte es, und
# jeder Terminal-Aufruf lief ins Leere.
#
# Gebaut wird nur, wenn es fehlt oder wenn services/sandbox/ sich geaendert hat
# — der Build dauert Minuten (apt, Node, Docker-CLI) und gehoert nicht in jeden
# Deploy. Ein Fehlschlag ist bewusst KEIN Rollback-Grund: Die Plattform selbst
# laeuft ohne dieses Image weiter, nur Terminal-Funktionen fehlen, und die
# melden dann eine klare Ursache statt abzustuerzen.
SANDBOX_IMAGE="arasul-sandbox:latest"
if [ "$SANDBOX_CHANGE" -eq 1 ] || ! docker image inspect "$SANDBOX_IMAGE" >/dev/null 2>&1; then
  log "Baue Sandbox-Image $SANDBOX_IMAGE (Aenderung: $SANDBOX_CHANGE)"
  if docker build -t "$SANDBOX_IMAGE" "$DEPLOY_DIR/services/sandbox"; then
    ok "Sandbox-Image gebaut"
  else
    warn "Sandbox-Image konnte nicht gebaut werden — Terminal-Funktionen bleiben deaktiviert."
    summary "⚠️ Sandbox-Image-Build fehlgeschlagen — Terminal-Werkzeuge nicht verfuegbar."
  fi
fi

SERVICES=("${!SVC_SET[@]}")
if [ "${#SERVICES[@]}" -eq 0 ] && [ "$INFRA_CHANGE" -eq 0 ]; then
  if [ "$SANDBOX_CHANGE" -eq 1 ]; then
    ok "Nur das Sandbox-Image war betroffen — kein Service-Rebuild noetig."
    summary "Deploy: sandbox image only."; exit 0
  fi
  ok "Nur nicht-deploybare Dateien (docs/.claude/.github/tests) geaendert — kein Rebuild."
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
  if ! git reset --hard "$PREV_SHA"; then
    misslungen+=("git reset auf $PREV_SHA")
  fi

  if [ "${#misslungen[@]}" -eq 0 ]; then
    err "Rollback auf $PREV_SHA abgeschlossen. Produktivstand wiederhergestellt."
    summary "❌ **Deploy fehlgeschlagen** → automatischer Rollback auf \`${PREV_SHA:0:7}\`."
  else
    err "Rollback UNVOLLSTAENDIG. Nicht geklappt: ${misslungen[*]}"
    err "Das Geraet steht NICHT auf dem Produktivstand. Bitte von Hand nachsehen."
    summary "❌ **Deploy fehlgeschlagen**, und der Rollback auf \`${PREV_SHA:0:7}\` ist UNVOLLSTAENDIG: ${misslungen[*]}"
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
if [ "$INFRA_CHANGE" -eq 1 ]; then
  log "Infra-/Compose-Aenderung — wende Konfiguration auf gesamten Stack an (up -d, ohne Rebuild)"
  "${COMPOSE[@]}" up -d --no-build || rollback
fi

# --- 6. Healthcheck ----------------------------------------------------------
health_of() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}' "$1" 2>/dev/null || echo "missing"; }
running_of() { docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null || echo "missing"; }

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
      unhealthy) err "$cname ist unhealthy"; rollback ;;
      missing) err "$cname existiert nicht"; rollback ;;
    esac
    wartung_an   # Herzschlag: der Healthcheck darf laenger dauern als der Deckel
    sleep 5
  done
  [ -z "$status" ] && { err "$cname wurde nicht rechtzeitig healthy"; rollback; }
  ok "$cname: $status"
done

# --- Erfolg ------------------------------------------------------------------
ok "Deploy erfolgreich: $NEW_SHA"
summary "✅ **Deploy erfolgreich** \`${NEW_SHA:0:7}\` — Services: ${SERVICES[*]:-<config-only>}"
exit 0
