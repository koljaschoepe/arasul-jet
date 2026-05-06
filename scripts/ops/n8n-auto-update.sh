#!/usr/bin/env bash
# n8n auto-update — pulls the pinned n8n image tag, rebuilds the n8n service,
# waits for healthy, rolls back on failure. Designed to be run from cron once
# a week on the host.
#
# Cron example (Sundays 03:17, log to /var/log/arasul/n8n-auto-update.log):
#   17 3 * * 0  /home/arasul/arasul/arasul-jet/scripts/ops/n8n-auto-update.sh \
#                 >> /var/log/arasul/n8n-auto-update.log 2>&1
#
# n8n averaged ~1 critical CVE/month through Q1 2026. A 5-year unattended
# appliance cannot rely on manual patching — see docs/plans/active/EXTERNAL_INTEGRATIONS.md §7.5.
#
# Exit codes:
#   0  no update available, or update succeeded
#   1  update failed and was rolled back
#   2  update failed and rollback also failed (manual intervention required)
#   3  precondition failure (compose file missing, docker not available, etc.)
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG_PREFIX="[n8n-auto-update $(date -Iseconds)]"
HEALTH_TIMEOUT=120                       # seconds to wait for health=healthy
SERVICE=n8n
CONTAINER=n8n
IMAGE_NAME="n8nio/n8n"

log() { printf '%s %s\n' "$LOG_PREFIX" "$*"; }
fail() { log "ERROR: $*"; exit "${2:-1}"; }

# --- Preconditions -----------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not in PATH" 3
[ -f "$REPO_ROOT/compose/compose.app.yaml" ] || fail "compose.app.yaml not found at $REPO_ROOT" 3

DOCKERFILE="$REPO_ROOT/services/n8n/Dockerfile"
[ -f "$DOCKERFILE" ] || fail "n8n Dockerfile missing" 3

PINNED=$(awk -F= '/^ARG N8N_VERSION=/ {print $2; exit}' "$DOCKERFILE")
[ -n "$PINNED" ] || fail "could not parse N8N_VERSION from Dockerfile" 3
log "pinned version: $PINNED"

# --- Pull --------------------------------------------------------------------
log "pulling ${IMAGE_NAME}:${PINNED} …"
if ! docker pull "${IMAGE_NAME}:${PINNED}"; then
    fail "docker pull failed" 1
fi

# Compare currently-running image digest vs the freshly-pulled one. If they
# match, there's nothing to do — exit cleanly.
RUNNING_DIGEST=$(docker inspect --format='{{.Image}}' "$CONTAINER" 2>/dev/null || echo "")
PULLED_DIGEST=$(docker inspect --format='{{.Id}}' "${IMAGE_NAME}:${PINNED}" 2>/dev/null || echo "")
if [ -n "$RUNNING_DIGEST" ] && [ "$RUNNING_DIGEST" = "$PULLED_DIGEST" ]; then
    log "no update — running image already matches the pulled tag"
    exit 0
fi
log "update available — running=${RUNNING_DIGEST:-none} pulled=${PULLED_DIGEST}"

# --- Snapshot rollback target ------------------------------------------------
PRE_IMAGE="$RUNNING_DIGEST"
if [ -n "$PRE_IMAGE" ]; then
    log "rollback target image: $PRE_IMAGE"
fi

# --- Build + restart ---------------------------------------------------------
cd "$REPO_ROOT"
log "rebuilding $SERVICE …"
if ! docker compose -f compose/compose.app.yaml -f compose/compose.secrets.yaml \
       up -d --build "$SERVICE"; then
    fail "docker compose up --build failed" 1
fi

# --- Healthcheck -------------------------------------------------------------
log "waiting up to ${HEALTH_TIMEOUT}s for $CONTAINER to become healthy …"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
    state=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    if [ "$state" = "healthy" ]; then
        log "healthy. update complete."
        exit 0
    fi
    sleep 5
done

# --- Rollback ----------------------------------------------------------------
log "container did not become healthy in ${HEALTH_TIMEOUT}s — rolling back"
if [ -z "$PRE_IMAGE" ]; then
    fail "no previous image recorded — manual intervention required" 2
fi

if ! docker stop "$CONTAINER" >/dev/null; then
    fail "rollback: docker stop failed" 2
fi
if ! docker rm "$CONTAINER" >/dev/null; then
    log "rollback: docker rm failed (continuing — container may be auto-removed)"
fi
# Re-tag the prior image as ${IMAGE_NAME}:${PINNED} so compose picks it up
if ! docker tag "$PRE_IMAGE" "${IMAGE_NAME}:${PINNED}"; then
    fail "rollback: failed to re-tag previous image" 2
fi
if ! docker compose -f compose/compose.app.yaml -f compose/compose.secrets.yaml \
       up -d "$SERVICE"; then
    fail "rollback: failed to bring service back up — MANUAL INTERVENTION REQUIRED" 2
fi
log "rollback complete. update was reverted."
exit 1
