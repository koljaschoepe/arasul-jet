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
PREV_SHA="$(git rev-parse HEAD)"
log "Deploy $PREV_SHA → $NEW_SHA (in $DEPLOY_DIR)"
if ! git fetch --quiet "$SRC" "$NEW_SHA"; then
  err "git fetch aus _work-Checkout fehlgeschlagen"; exit 1
fi
git reset --hard "$NEW_SHA" || { err "git reset fehlgeschlagen"; exit 1; }
ok "Working Tree auf $NEW_SHA"

# --- 2. Geaenderte Dateien -> Services ---------------------------------------
mapfile -t CHANGED < <(git diff --name-only "$PREV_SHA" "$NEW_SHA")
if [ "${#CHANGED[@]}" -eq 0 ]; then
  ok "Keine Dateiaenderungen — nichts zu deployen."; summary "Deploy: no file changes."; exit 0
fi

declare -A SVC_SET=()
INFRA_CHANGE=0
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

SERVICES=("${!SVC_SET[@]}")
if [ "${#SERVICES[@]}" -eq 0 ] && [ "$INFRA_CHANGE" -eq 0 ]; then
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
rollback() {
  err "DEPLOY FEHLGESCHLAGEN — Rollback wird ausgefuehrt."
  for s in "${SERVICES[@]}"; do
    if [ "${HAD_IMAGE[$s]:-0}" -eq 1 ]; then
      docker tag "${PROJECT}-${s}:rollback" "${PROJECT}-${s}:latest" || true
    fi
  done
  # Container mit dem alten Image (ohne Rebuild) wieder hochfahren
  "${COMPOSE[@]}" up -d --no-build "${SERVICES[@]}" 2>&1 | tail -5 || true
  git reset --hard "$PREV_SHA" || true
  err "Rollback auf $PREV_SHA abgeschlossen. Produktivstand wiederhergestellt."
  summary "❌ **Deploy fehlgeschlagen** → automatischer Rollback auf \`${PREV_SHA:0:7}\`."
  exit 1
}

# --- 5. Bauen + Hochfahren ---------------------------------------------------
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
    sleep 5
  done
  [ -z "$status" ] && { err "$cname wurde nicht rechtzeitig healthy"; rollback; }
  ok "$cname: $status"
done

# --- Erfolg ------------------------------------------------------------------
ok "Deploy erfolgreich: $NEW_SHA"
summary "✅ **Deploy erfolgreich** \`${NEW_SHA:0:7}\` — Services: ${SERVICES[*]:-<config-only>}"
exit 0
