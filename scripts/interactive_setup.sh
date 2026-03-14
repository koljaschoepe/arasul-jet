#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Interaktives Setup
# Generiert eine produktionsreife .env Datei
# Sprache: Deutsch
#
# Aufruf:
#   ./scripts/interactive_setup.sh                    # Interaktiv
#   ADMIN_PASSWORD=... ./scripts/interactive_setup.sh --non-interactive
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Non-interactive mode
NON_INTERACTIVE=false
if [ "$1" = "--non-interactive" ] || [ "$1" = "-n" ]; then
    NON_INTERACTIVE=true
fi

# Cleanup on Ctrl+C - partielle Dateien entfernen
SETUP_ENV_WRITTEN=false
cleanup_on_abort() {
    echo ""
    if [ "$SETUP_ENV_WRITTEN" = true ]; then
        # Partielle .env entfernen, Backup wiederherstellen
        local latest_backup=$(ls -t "${PROJECT_ROOT}/.env.backup."* 2>/dev/null | head -1)
        if [ -n "$latest_backup" ]; then
            mv "$latest_backup" "${PROJECT_ROOT}/.env"
            echo -e "${YELLOW}Setup abgebrochen. Alte .env wiederhergestellt.${NC}"
        else
            rm -f "${PROJECT_ROOT}/.env"
            echo -e "${YELLOW}Setup abgebrochen. Partielle .env entfernt.${NC}"
        fi
    else
        echo -e "${YELLOW}Setup abgebrochen. Keine Aenderungen vorgenommen.${NC}"
    fi
    exit 1
}
trap cleanup_on_abort INT

# =============================================================================
# Hilfsfunktionen
# =============================================================================

print_header() {
    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  ARASUL PLATFORM - Ersteinrichtung${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    local step="$1"
    local total="$2"
    local title="$3"
    echo ""
    echo -e "${BLUE}  Schritt ${step}/${total}: ${title}${NC}"
    echo -e "${DIM}  $(printf '─%.0s' {1..40})${NC}"
}

print_ok() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_warn() {
    echo -e "  ${YELLOW}!${NC} $1"
}

print_err() {
    echo -e "  ${RED}✗${NC} $1"
}

# Passwort-Komplexitaet pruefen
# Gibt Fehlermeldung zurueck (leer = OK)
validate_password() {
    local pw="$1"
    local min_length="${2:-12}"

    # Laenge
    if [ ${#pw} -lt "$min_length" ]; then
        echo "Mindestens ${min_length} Zeichen erforderlich (aktuell: ${#pw})"
        return 1
    fi

    # Grossbuchstabe
    if ! echo "$pw" | grep -q '[A-Z]'; then
        echo "Mindestens ein Grossbuchstabe erforderlich (A-Z)"
        return 1
    fi

    # Kleinbuchstabe
    if ! echo "$pw" | grep -q '[a-z]'; then
        echo "Mindestens ein Kleinbuchstabe erforderlich (a-z)"
        return 1
    fi

    # Ziffer
    if ! echo "$pw" | grep -q '[0-9]'; then
        echo "Mindestens eine Ziffer erforderlich (0-9)"
        return 1
    fi

    # Schwache Passwoerter ablehnen (case-insensitive)
    local pw_lower
    pw_lower=$(echo "$pw" | tr '[:upper:]' '[:lower:]')
    local weak_passwords="password passwd admin administrator letmein welcome qwerty 123456 12345678 123456789 1234567890 abcdefgh changeme master trustno1 iloveyou dragon monkey shadow"
    for weak in $weak_passwords; do
        if [ "$pw_lower" = "$weak" ]; then
            echo "Dieses Passwort ist zu einfach und leicht zu erraten"
            return 1
        fi
    done

    return 0
}

# Passwort-Eingabe mit Validierung
prompt_password() {
    local prompt="$1"
    local min_length="${2:-12}"

    while true; do
        echo -n -e "  ${BLUE}${prompt}:${NC} "
        read -s password
        echo ""

        local validation_error
        validation_error=$(validate_password "$password" "$min_length")
        if [ $? -ne 0 ]; then
            print_err "$validation_error"
            continue
        fi

        echo -n -e "  ${BLUE}Passwort bestaetigen:${NC} "
        read -s confirm
        echo ""

        if [ "$password" != "$confirm" ]; then
            print_err "Passwoerter stimmen nicht ueberein"
            continue
        fi

        echo "$password"
        return 0
    done
}

# Eingabe mit Default-Wert
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local value=""

    echo -n -e "  ${BLUE}${prompt}${NC} [${default}]: "
    read value
    echo "${value:-$default}"
}

# Auswahl-Menue (gibt den ausgewaehlten Wert zurueck)
prompt_select() {
    local prompt="$1"
    shift
    local options=("$@")

    for i in "${!options[@]}"; do
        local label="${options[$i]}"
        if [ "$i" -eq 0 ]; then
            echo -e "  [${GREEN}$((i+1))${NC}] ${label} ${DIM}(Empfohlen)${NC}"
        else
            echo -e "  [${GREEN}$((i+1))${NC}] ${label}"
        fi
    done
    echo ""
    echo -n -e "  ${BLUE}${prompt}${NC} [1]: "
    read choice
    choice="${choice:-1}"

    if [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "${#options[@]}" ] 2>/dev/null; then
        echo "$((choice-1))"
    else
        echo "0"
    fi
}

# Ja/Nein Prompt
prompt_confirm() {
    local prompt="$1"
    local default="${2:-j}"

    if [ "$default" = "j" ]; then
        echo -n -e "  ${BLUE}${prompt}${NC} [J/n]: "
    else
        echo -n -e "  ${BLUE}${prompt}${NC} [j/N]: "
    fi
    read answer
    answer="${answer:-$default}"

    case "$answer" in
        [jJyY]*) return 0 ;;
        *) return 1 ;;
    esac
}

# =============================================================================
# Secret-Generierung
# =============================================================================

generate_secret() {
    local length="${1:-32}"
    openssl rand -hex "$length" 2>/dev/null || \
    head -c "$((length*2))" /dev/urandom | xxd -p | tr -d '\n' | head -c "$((length*2))"
}

generate_password() {
    local length="${1:-24}"
    local pw
    pw=$(openssl rand -base64 "$((length * 2))" 2>/dev/null | tr -d '/+=\n' | head -c "$length")
    if [ -n "$pw" ] && [ ${#pw} -ge "$length" ]; then
        echo "$pw"
    else
        head -c "$((length * 2))" /dev/urandom | base64 | tr -d '/+=\n' | head -c "$length"
    fi
}

generate_bcrypt_hash() {
    local password="$1"

    # Methode 1: htpasswd (am haeufigsten verfuegbar)
    if command -v htpasswd &>/dev/null; then
        htpasswd -nbB "" "$password" 2>/dev/null | cut -d: -f2
        return
    fi

    # Methode 2: Python3 bcrypt (Passwort via stdin, keine Shell-Interpolation)
    if command -v python3 &>/dev/null && python3 -c "import bcrypt" 2>/dev/null; then
        printf '%s' "$password" | python3 -c "import sys,bcrypt; pw=sys.stdin.buffer.read(); print(bcrypt.hashpw(pw, bcrypt.gensalt(12)).decode())" 2>/dev/null
        return
    fi

    # Methode 3: node.js mit bcryptjs
    if command -v node &>/dev/null; then
        node -e "try{const b=require('bcryptjs');process.stdout.write(b.hashSync(process.argv[1],12))}catch(e){process.exit(1)}" "$password" 2>/dev/null
        return
    fi

    # Methode 4: Docker mit node (bcryptjs installieren, dann hashen)
    if command -v docker &>/dev/null; then
        docker run --rm node:20-alpine sh -c "npm install --no-fund --no-audit bcryptjs 2>/dev/null && node -e \"const b=require('bcryptjs');process.stdout.write(b.hashSync(process.argv[1],12))\" '$password'" 2>/dev/null
        return
    fi

    # Fallback: Hash wird vom Backend beim ersten Start generiert
    echo "GENERATE_ON_FIRST_START"
}

# =============================================================================
# Hardware-Erkennung (nutzt detect-jetson.sh)
# =============================================================================

detect_hardware() {
    local detect_script="${SCRIPT_DIR}/setup/detect-jetson.sh"

    if [ -f "$detect_script" ]; then
        # Funktionen importieren (Source-Guard verhindert main()-Ausfuehrung)
        source "$detect_script"
        DEVICE_MODEL=$(detect_jetson_model)
        DEVICE_RAM=$(detect_ram_total)
        DEVICE_CORES=$(detect_cpu_cores)
        DEVICE_PROFILE=$(get_device_profile)
        DEVICE_CUDA=$(detect_cuda_arch)
        DEVICE_L4T_TAG=$(detect_l4t_pytorch_tag)
    else
        DEVICE_MODEL="Unbekannt"
        DEVICE_RAM=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print int($2/1024/1024)}' || echo "0")
        DEVICE_CORES=$(nproc 2>/dev/null || echo "1")
        DEVICE_PROFILE="generic"
        DEVICE_CUDA="8.7"
        DEVICE_L4T_TAG="r36.4.0"
    fi

    # Default-Modell aus Profil extrahieren
    if [ -f "$detect_script" ]; then
        DEFAULT_LLM_MODEL=$(get_config_for_profile "$DEVICE_PROFILE" 2>/dev/null | grep "^LLM_MODEL=" | cut -d= -f2)
        RECOMMENDED_MODELS_STR=$(get_config_for_profile "$DEVICE_PROFILE" 2>/dev/null | grep "^RECOMMENDED_MODELS=" | cut -d= -f2 | tr -d '"')
    fi
    DEFAULT_LLM_MODEL="${DEFAULT_LLM_MODEL:-mistral:7b}"
    RECOMMENDED_MODELS_STR="${RECOMMENDED_MODELS_STR:-mistral:7b,phi3:mini}"
}

# =============================================================================
# Hauptprogramm
# =============================================================================

main() {
    print_header

    # Bestehende .env pruefen
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        # Immer Backup erstellen
        cp "${PROJECT_ROOT}/.env" "${PROJECT_ROOT}/.env.backup.$(date +%Y%m%d_%H%M%S)"

        if [ "$NON_INTERACTIVE" = true ]; then
            print_warn ".env existiert bereits, wird ueberschrieben (--non-interactive)"
            print_ok "Backup der alten .env erstellt"
        else
            echo -e "  ${YELLOW}Eine .env Datei existiert bereits.${NC}"
            if ! prompt_confirm "Ueberschreiben?"; then
                echo ""
                print_ok "Setup abgebrochen. Bestehende .env beibehalten."
                exit 0
            fi
            print_ok "Backup der alten .env erstellt"
        fi
    fi

    # =========================================================================
    # Schritt 1: Hardware-Erkennung
    # =========================================================================

    print_step 1 5 "Hardware-Erkennung"

    detect_hardware

    echo -e "  Erkannt: ${GREEN}${DEVICE_MODEL}${NC}"
    echo -e "  RAM:     ${DEVICE_RAM} GB | CPU: ${DEVICE_CORES} Kerne | CUDA: ${DEVICE_CUDA}"
    echo -e "  Profil:  ${GREEN}${DEVICE_PROFILE}${NC}"
    echo -e "  Modell:  ${DEFAULT_LLM_MODEL} (empfohlen)"
    echo ""
    print_ok "Hardware erkannt"

    # =========================================================================
    # Schritt 2: Administrator-Konto
    # =========================================================================

    print_step 2 5 "Administrator-Konto"

    if [ "$NON_INTERACTIVE" = true ]; then
        ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
        ADMIN_EMAIL="${ADMIN_EMAIL:-admin@arasul.local}"
        if [ -z "$ADMIN_PASSWORD" ]; then
            print_err "ADMIN_PASSWORD muss gesetzt sein im Non-Interactive Modus"
            exit 1
        fi
        local pw_error
        pw_error=$(validate_password "$ADMIN_PASSWORD" 12)
        if [ $? -ne 0 ]; then
            print_err "ADMIN_PASSWORD ungueltig: ${pw_error}"
            exit 1
        fi
        print_ok "Benutzername: ${ADMIN_USERNAME}"
        print_ok "E-Mail: ${ADMIN_EMAIL}"
        print_ok "Passwort: gesetzt"
    else
        ADMIN_USERNAME=$(prompt_with_default "Benutzername" "admin")
        ADMIN_PASSWORD=$(prompt_password "Passwort (min. 12 Zeichen)" 12)
        ADMIN_EMAIL=$(prompt_with_default "E-Mail" "admin@arasul.local")
    fi

    # bcrypt-Hash generieren
    echo -n -e "  ${DIM}Generiere Passwort-Hash...${NC}"
    ADMIN_HASH=$(generate_bcrypt_hash "$ADMIN_PASSWORD")
    echo -e "\r  ${GREEN}✓${NC} Passwort-Hash generiert       "

    # =========================================================================
    # Schritt 3: Netzwerk
    # =========================================================================

    print_step 3 5 "Netzwerk"

    if [ "$NON_INTERACTIVE" = true ]; then
        SETUP_HOSTNAME="${HOSTNAME:-arasul}"
    else
        SETUP_HOSTNAME=$(prompt_with_default "Hostname" "arasul")
    fi
    echo -e "  ${DIM}Geraet wird erreichbar unter: ${SETUP_HOSTNAME}.local${NC}"
    print_ok "Hostname: ${SETUP_HOSTNAME}"

    # Unbeaufsichtigter Betrieb (Auto-Reboot bei kritischen Fehlern)
    UNATTENDED_MODE=false
    if [ "$NON_INTERACTIVE" = true ]; then
        UNATTENDED_MODE="${SELF_HEALING_REBOOT_ENABLED:-false}"
    else
        echo ""
        echo -e "  ${DIM}Unbeaufsichtigter Betrieb aktiviert Auto-Reboot bei${NC}"
        echo -e "  ${DIM}kritischen Fehlern (GPU-Hang, Disk-Overflow).${NC}"
        if prompt_confirm "Unbeaufsichtigter Betrieb (Auto-Reboot)?"; then
            UNATTENDED_MODE=true
        fi
    fi
    if [ "$UNATTENDED_MODE" = true ]; then
        print_ok "Auto-Reboot: aktiviert"
    else
        print_ok "Auto-Reboot: deaktiviert"
    fi

    # =========================================================================
    # Schritt 4: KI-Modell
    # =========================================================================

    print_step 4 5 "KI-Modell"

    # Parse empfohlene Modelle
    IFS=',' read -ra MODEL_LIST <<< "$RECOMMENDED_MODELS_STR"

    if [ "$NON_INTERACTIVE" = true ]; then
        LLM_MODEL="${LLM_MODEL:-$DEFAULT_LLM_MODEL}"
        print_ok "Modell: ${LLM_MODEL}"
    else
        echo -e "  Empfohlene Modelle fuer ${GREEN}${DEVICE_PROFILE}${NC}:"
        echo ""

        # Model-Optionen zusammenbauen
        local model_options=()
        for model in "${MODEL_LIST[@]}"; do
            model=$(echo "$model" | xargs)  # trim whitespace
            model_options+=("$model")
        done
        model_options+=("Eigenes Modell eingeben")

        local model_idx
        model_idx=$(prompt_select "Auswahl" "${model_options[@]}")

        if [ "$model_idx" -eq "${#MODEL_LIST[@]}" ]; then
            # Eigenes Modell
            echo -n -e "  ${BLUE}Modellname:${NC} "
            read LLM_MODEL
            if [ -z "$LLM_MODEL" ]; then
                LLM_MODEL="$DEFAULT_LLM_MODEL"
                print_warn "Kein Modell eingegeben, verwende Standard: ${LLM_MODEL}"
            fi
        else
            LLM_MODEL=$(echo "${MODEL_LIST[$model_idx]}" | xargs)
        fi

        echo ""
        print_ok "Modell: ${LLM_MODEL}"
    fi

    # =========================================================================
    # Schritt 5: Zusammenfassung & Bestaetigung
    # =========================================================================

    print_step 5 5 "Zusammenfassung"

    # Secrets generieren
    JWT_SECRET=$(generate_secret 32)
    POSTGRES_PASSWORD=$(generate_password 24)
    MINIO_ROOT_USER="arasul"
    MINIO_ROOT_PASSWORD=$(generate_password 24)
    N8N_BASIC_AUTH_PASSWORD=$(generate_password 16)
    N8N_ENCRYPTION_KEY=$(generate_secret 32)
    TELEGRAM_ENCRYPTION_KEY=$(generate_secret 32)

    echo ""
    echo -e "  ${BOLD}Konfiguration:${NC}"
    echo -e "  Administrator:  ${GREEN}${ADMIN_USERNAME}${NC}"
    echo -e "  E-Mail:         ${ADMIN_EMAIL}"
    echo -e "  Hostname:       ${GREEN}${SETUP_HOSTNAME}.local${NC}"
    echo -e "  KI-Modell:      ${GREEN}${LLM_MODEL}${NC}"
    echo -e "  Auto-Reboot:    $([ "$UNATTENDED_MODE" = true ] && echo "${GREEN}aktiviert${NC}" || echo "deaktiviert")"
    echo -e "  Profil:         ${DEVICE_PROFILE}"
    echo ""
    echo -e "  ${BOLD}Generierte Secrets:${NC}"
    echo -e "    JWT-Secret:       ${GREEN}✓${NC} (${#JWT_SECRET} Zeichen)"
    echo -e "    DB-Passwort:      ${GREEN}✓${NC} (${#POSTGRES_PASSWORD} Zeichen)"
    echo -e "    MinIO-Zugangsd.:  ${GREEN}✓${NC} (${#MINIO_ROOT_PASSWORD} Zeichen)"
    echo -e "    n8n-Schluessel:   ${GREEN}✓${NC} (${#N8N_ENCRYPTION_KEY} Zeichen)"

    if [ "$NON_INTERACTIVE" = false ]; then
        echo ""
        if ! prompt_confirm "Konfiguration schreiben?"; then
            echo ""
            print_warn "Setup abgebrochen. Keine Aenderungen vorgenommen."
            exit 1
        fi
    fi

    # =========================================================================
    # .env schreiben
    # =========================================================================

    local env_file="${PROJECT_ROOT}/.env"

    cat > "$env_file" << ENVEOF
# =============================================================================
# Arasul Platform - Konfiguration
# Generiert: $(date -Iseconds)
# Geraet: ${DEVICE_MODEL}
# Profil: ${DEVICE_PROFILE}
# =============================================================================

# --- System ---
SYSTEM_NAME=arasul
SYSTEM_VERSION=1.0.0
NODE_ENV=production

# --- Administrator ---
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_HASH=${ADMIN_HASH}

# --- Sicherheit (automatisch generiert) ---
JWT_SECRET=${JWT_SECRET}
N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
TELEGRAM_ENCRYPTION_KEY=${TELEGRAM_ENCRYPTION_KEY}

# --- Datenbank ---
POSTGRES_USER=arasul
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=arasul_db
POSTGRES_HOST=postgres-db
POSTGRES_PORT=5432

# --- Datenbank (erweitert) ---
POSTGRES_MAX_CONNECTIONS=200

# --- MinIO (S3-Speicher) ---
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_HOST=minio
MINIO_PORT=9000
MINIO_BROWSER=on

# --- n8n Workflows ---
N8N_BASIC_AUTH_USER=${ADMIN_USERNAME}
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
N8N_HOST=localhost
N8N_PORT=5678

# --- KI-Modell ---
LLM_MODEL=${LLM_MODEL}
LLM_SERVICE_HOST=llm-service
LLM_SERVICE_PORT=11434

# --- Embedding ---
EMBEDDING_SERVICE_HOST=embedding-service
EMBEDDING_SERVICE_PORT=11435
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_VECTOR_SIZE=1024
EMBEDDING_MAX_INPUT_TOKENS=8192

# --- Qdrant (Vektor-DB) ---
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_COLLECTION_NAME=documents

# --- Document Indexer ---
DOCUMENT_INDEXER_HOST=document-indexer
DOCUMENT_INDEXER_PORT=9102
DOCUMENT_INDEXER_INTERVAL=3600
DOCUMENT_INDEXER_CHUNK_SIZE=500
DOCUMENT_INDEXER_CHUNK_OVERLAP=50
DOCUMENT_INDEXER_MINIO_BUCKET=documents

# --- Dashboard ---
DASHBOARD_BACKEND_PORT=3001
JWT_EXPIRY=24h
BUILD_HASH=$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "unknown")
LOG_LEVEL=info

# --- Monitoring ---
METRICS_INTERVAL_LIVE=10
METRICS_INTERVAL_PERSIST=300

# --- Self-Healing ---
SELF_HEALING_ENABLED=true
SELF_HEALING_REBOOT_ENABLED=${UNATTENDED_MODE}
SELF_HEALING_INTERVAL=300
DISK_WARNING_PERCENT=70
DISK_CLEANUP_PERCENT=80
DISK_CRITICAL_PERCENT=90
DISK_REBOOT_PERCENT=95

# --- Netzwerk ---
MDNS_NAME=${SETUP_HOSTNAME}
ENVEOF

    # Jetson-Profil: Inline aus bereits geladenen Funktionen generieren
    # (generate_env_config wird NICHT aufgerufen - das Bootstrap-Script
    #  entscheidet selbst, ob apply_jetson_profile noetig ist)
    local detect_script="${SCRIPT_DIR}/setup/detect-jetson.sh"
    if [ -f "$detect_script" ]; then
        local profile_config
        profile_config=$(get_config_for_profile "$DEVICE_PROFILE" 2>/dev/null || true)

        if [ -n "$profile_config" ]; then
            {
                echo ""
                echo "# --- Jetson Hardware-Profil (Profil: ${DEVICE_PROFILE}) ---"
                echo "$profile_config"
                echo ""
                echo "# GPU Configuration"
                echo "TORCH_CUDA_ARCH_LIST=\"${DEVICE_CUDA}\""
                echo "CUDA_VISIBLE_DEVICES=0"
                echo ""
                echo "# Base Image Configuration (for embedding-service Docker build)"
                echo "L4T_PYTORCH_TAG=\"${DEVICE_L4T_TAG}\""
                echo ""
                echo "# System Detection (read-only)"
                echo "JETSON_RAM_TOTAL=${DEVICE_RAM}"
                echo "JETSON_CPU_CORES=${DEVICE_CORES}"
            } >> "$env_file"
        fi
    fi

    # Berechtigungen setzen
    chmod 600 "$env_file"
    SETUP_ENV_WRITTEN=true

    # Docker-Secrets-Dateien erstellen (Vorbereitung fuer docker-compose.secrets.yml)
    local secrets_dir="${PROJECT_ROOT}/config/secrets"
    mkdir -p "$secrets_dir"
    chmod 700 "$secrets_dir"

    echo -n "$ADMIN_PASSWORD" > "$secrets_dir/admin_password"
    echo -n "$POSTGRES_PASSWORD" > "$secrets_dir/postgres_password"
    echo -n "$JWT_SECRET" > "$secrets_dir/jwt_secret"
    echo -n "$MINIO_ROOT_USER" > "$secrets_dir/minio_root_user"
    echo -n "$MINIO_ROOT_PASSWORD" > "$secrets_dir/minio_root_password"
    echo -n "$N8N_ENCRYPTION_KEY" > "$secrets_dir/n8n_encryption_key"
    echo -n "$TELEGRAM_ENCRYPTION_KEY" > "$secrets_dir/telegram_encryption_key"
    # Telegram Bot Token: Platzhalter (wird spaeter via Dashboard konfiguriert)
    if [ ! -f "$secrets_dir/telegram_bot_token" ]; then
        touch "$secrets_dir/telegram_bot_token"
    fi

    chmod 600 "$secrets_dir"/*

    echo ""
    print_ok ".env geschrieben (Berechtigungen: 600)"
    print_ok "Docker-Secrets-Dateien erstellt in config/secrets/"

    if [ -n "$DEVICE_PROFILE" ] && [ "$DEVICE_PROFILE" != "generic" ]; then
        print_ok "Jetson-Profil eingebettet: ${DEVICE_PROFILE}"
    fi

    echo ""
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}Setup abgeschlossen!${NC}"
    echo ""
    echo -e "  Naechster Schritt:"
    echo -e "    ${BOLD}./arasul bootstrap${NC}"
    echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
    echo ""
}

main
