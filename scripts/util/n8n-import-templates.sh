#!/bin/bash
###############################################################################
# ARASUL PLATFORM - n8n Agent-Vorlagen Import + Agent-Modell-Provisionierung
#
# Importiert die Agent-Workflow-Vorlagen (services/n8n/templates/agents/) in
# die laufende n8n-Instanz und provisioniert das Default-Agent-Modell
# qwen3:8b im llm-service (Ollama).
#
# Idempotent: die Vorlagen tragen feste Workflow-IDs
# (arasul-vorlage-agent-*) — ein Re-Import aktualisiert statt zu duplizieren.
# ollama pull wird nur ausgeführt, wenn das Modell noch fehlt.
#
# Import-Methode: n8n-CLI im Container (`n8n import:workflow`) statt
# Public-API. Begründung (Appliance-Kontext):
#   - Die Public-API (X-N8N-API-KEY) setzt einen von einem n8n-Benutzer
#     erzeugten API-Key voraus — beim First-Boot existiert noch kein
#     n8n-Benutzer, also auch kein Key. Die CLI braucht keinen.
#   - Das Template-Verzeichnis ist bereits read-only in den Container
#     gemountet (compose.app.yaml: ../services/n8n/templates:/custom-templates:ro).
#   - Hinweis: der CLI-Import an einer laufenden Instanz wird von der UI erst
#     nach einem Editor-Reload angezeigt (Workflows-Liste neu laden).
#
# Aufruf:  ./scripts/util/n8n-import-templates.sh [--skip-model]
# Hook:    ./arasul bootstrap (Schritt 13b, optional/non-fatal)
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# Getrennt zuweisen: `VAR=x source …` gilt nur während des Sourcens — die
# log_*-Funktionen lesen LOG_PREFIX aber erst beim Aufruf (set -u!).
LOG_PREFIX="N8N-IMPORT"
source "${SCRIPT_DIR}/../lib/logging.sh"

cd "$PROJECT_ROOT"

SKIP_MODEL=false
[ "${1:-}" = "--skip-model" ] && SKIP_MODEL=true

# Default-Agent-Modell. WICHTIG: Tool-Calling braucht ein Kontextfenster
# >= 32768 Tokens — Ollamas Default (4k) schneidet Tool-Definitionen sonst
# STILL ab ("Agent vergisst seine Tools"). Das setzt die Plattform global
# über OLLAMA_CONTEXT_LENGTH am llm-service (compose/compose.ai.yaml);
# die Vorlagen setzen zusätzlich numCtx=32768 am Ollama-Chat-Model-Node.
AGENT_MODEL="${N8N_AGENT_MODEL:-qwen3:8b}"

TEMPLATE_DIR_HOST="services/n8n/templates/agents"
TEMPLATE_DIR_CONTAINER="/custom-templates/agents"

# ----------------------------------------------------------------------------
# 1. Vorbedingungen
# ----------------------------------------------------------------------------
if [ ! -d "$TEMPLATE_DIR_HOST" ]; then
    log_error "Vorlagen-Verzeichnis fehlt: ${TEMPLATE_DIR_HOST}"
    exit 1
fi

if ! docker compose ps n8n 2>/dev/null | grep -q "Up"; then
    log_error "n8n-Container läuft nicht — erst 'docker compose up -d n8n'"
    exit 1
fi

# Warten bis n8n healthy ist (CLI-Import gegen eine noch migrierende
# 2.x-Datenbank wäre riskant).
log_info "Warte auf n8n-Healthcheck..."
MAX_WAIT=180
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if docker compose exec -T n8n wget --spider -q http://localhost:5678/healthz 2>/dev/null; then
        break
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done
if [ $ELAPSED -ge $MAX_WAIT ]; then
    log_error "n8n wurde nicht healthy (${MAX_WAIT}s) — Import abgebrochen"
    exit 1
fi

# ----------------------------------------------------------------------------
# 2. Vorlagen importieren (idempotent via feste Workflow-IDs)
# ----------------------------------------------------------------------------
log_info "Importiere Agent-Vorlagen aus ${TEMPLATE_DIR_HOST}/ ..."
# WICHTIG: `docker exec` erbt NICHT die vom Entrypoint-Shim (entrypoint.sh)
# zur Laufzeit exportierte N8N_ENCRYPTION_KEY — nur die statische Compose-Env.
# Ohne Key würde die n8n-CLI ggf. einen eigenen Zufalls-Key nach ~/.n8n/config
# schreiben. Deshalb den Docker-Secret hier genauso auflösen wie der Shim.
if docker compose exec -T n8n sh -c '
    if [ -z "${N8N_ENCRYPTION_KEY:-}" ] && [ -r /run/secrets/n8n_encryption_key ]; then
        N8N_ENCRYPTION_KEY="$(cat /run/secrets/n8n_encryption_key)"
        export N8N_ENCRYPTION_KEY
    fi
    n8n import:workflow --separate --input='"$TEMPLATE_DIR_CONTAINER"; then
    log_success "Agent-Vorlagen importiert (deaktiviert, Namen mit »[Vorlage]«)"
    log_info "Nach dem Import im n8n-Editor: Ollama-/Qdrant-Credentials setzen (siehe Sticky Notes in den Workflows)"
else
    log_error "n8n import:workflow fehlgeschlagen — Details: docker compose logs n8n"
    exit 1
fi

# ----------------------------------------------------------------------------
# 3. Agent-Modell provisionieren (guarded ollama pull)
# ----------------------------------------------------------------------------
if [ "$SKIP_MODEL" = true ]; then
    log_info "Modell-Provisionierung übersprungen (--skip-model)"
    exit 0
fi

if ! docker compose ps llm-service 2>/dev/null | grep -q "Up"; then
    log_warning "llm-service läuft nicht — '${AGENT_MODEL}' später manuell ziehen:"
    log_warning "  docker exec llm-service ollama pull ${AGENT_MODEL}"
    exit 0
fi

if docker compose exec -T llm-service ollama list 2>/dev/null | awk '{print $1}' | grep -qx "${AGENT_MODEL}"; then
    log_success "Agent-Modell ${AGENT_MODEL} ist bereits vorhanden"
else
    log_info "Ziehe Agent-Modell ${AGENT_MODEL} (einmalig, ~5 GB — kann dauern)..."
    if docker compose exec -T llm-service ollama pull "${AGENT_MODEL}"; then
        log_success "Agent-Modell ${AGENT_MODEL} provisioniert"
    else
        # Non-fatal: die Vorlagen funktionieren, sobald das Modell da ist.
        log_warning "ollama pull ${AGENT_MODEL} fehlgeschlagen (offline?) — später manuell:"
        log_warning "  docker exec llm-service ollama pull ${AGENT_MODEL}"
    fi
fi

log_success "n8n-Agent-Setup abgeschlossen"
