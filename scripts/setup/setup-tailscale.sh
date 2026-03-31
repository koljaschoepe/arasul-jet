#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Tailscale Setup
# Installiert und konfiguriert Tailscale fuer Remote-Zugriff
#
# Aufruf:
#   ./scripts/setup/setup-tailscale.sh                          # Interaktiv
#   TAILSCALE_AUTH_KEY=tskey-... ./scripts/setup/setup-tailscale.sh  # Automatisch
#
# Exit-Codes:
#   0 = Erfolg (Tailscale verbunden)
#   1 = Fehler (Installation oder Authentifizierung fehlgeschlagen)
#   2 = Uebersprungen (Benutzer hat abgelehnt oder kein Auth-Key)
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[TAILSCALE]${NC} $1"; }
log_success() { echo -e "${GREEN}[TAILSCALE]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[TAILSCALE]${NC} $1"; }
log_error()   { echo -e "${RED}[TAILSCALE]${NC} $1"; }

# =============================================================================
# Pruefungen
# =============================================================================

check_tailscale_installed() {
    command -v tailscale &>/dev/null
}

check_tailscaled_running() {
    systemctl is-active tailscaled &>/dev/null 2>&1
}

check_tailscale_connected() {
    tailscale status &>/dev/null 2>&1
}

get_tailscale_ip() {
    tailscale ip -4 2>/dev/null || echo ""
}

get_tailscale_hostname() {
    tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$//' || echo ""
}

# =============================================================================
# Installation
# =============================================================================

install_tailscale() {
    log_info "Installiere Tailscale..."

    # Pruefe ob bereits installiert
    if check_tailscale_installed; then
        local version
        version=$(tailscale version 2>/dev/null | head -1 || echo "unbekannt")
        log_info "Tailscale bereits installiert (${version})"
        return 0
    fi

    # ARM64 Architektur pruefen
    local arch
    arch=$(uname -m)
    if [ "$arch" != "aarch64" ] && [ "$arch" != "x86_64" ]; then
        log_error "Nicht unterstuetzte Architektur: ${arch}"
        return 1
    fi

    # Check network connectivity before download
    if ! timeout 10 curl -sf https://tailscale.com/install.sh -o /dev/null 2>/dev/null; then
        log_warning "Cannot reach tailscale.com - skipping Tailscale installation"
        log_info "Tailscale can be installed manually later"
        return 0
    fi

    # Installation via offizielles Script
    if curl -fsSL https://tailscale.com/install.sh | sh; then
        log_success "Tailscale installiert"
    else
        log_error "Installation fehlgeschlagen"
        log_info "Manuell installieren: https://tailscale.com/download/linux"
        return 1
    fi
}

# =============================================================================
# Daemon starten
# =============================================================================

enable_tailscaled() {
    log_info "Aktiviere Tailscale-Daemon..."

    if ! check_tailscale_installed; then
        log_error "Tailscale nicht installiert"
        return 1
    fi

    # systemd Service aktivieren und starten
    systemctl enable tailscaled 2>/dev/null || true
    systemctl start tailscaled 2>/dev/null || true

    # Warte kurz auf Daemon
    local retries=0
    while [ $retries -lt 10 ]; do
        if check_tailscaled_running; then
            log_success "Tailscale-Daemon laeuft"
            return 0
        fi
        sleep 1
        retries=$((retries + 1))
    done

    log_error "Tailscale-Daemon konnte nicht gestartet werden"
    return 1
}

# =============================================================================
# Authentifizierung
# =============================================================================

authenticate_tailscale() {
    local auth_key="$1"
    local hostname="${2:-}"

    if check_tailscale_connected; then
        local current_ip
        current_ip=$(get_tailscale_ip)
        if [ -n "$current_ip" ]; then
            log_info "Tailscale bereits verbunden (IP: ${current_ip})"
            return 0
        fi
    fi

    if [ -z "$auth_key" ]; then
        log_warning "Kein Auth-Key angegeben"
        log_info ""
        log_info "So erstellst du einen Auth-Key:"
        log_info "  1. Oeffne: ${BLUE}https://login.tailscale.com/admin/settings/keys${NC}"
        log_info "  2. Klicke 'Generate auth key'"
        log_info "  3. Aktiviere 'Reusable' (fuer mehrere Geraete)"
        log_info "  4. Kopiere den Key (beginnt mit tskey-auth-...)"
        log_info ""
        return 2
    fi

    log_info "Authentifiziere mit Auth-Key..."

    local ts_args=(--authkey "$auth_key" --ssh)
    if [ -n "$hostname" ]; then
        ts_args+=(--hostname "$hostname")
    fi

    if tailscale up "${ts_args[@]}" 2>/dev/null; then
        # Warte kurz auf Verbindung
        sleep 2
        local ts_ip
        ts_ip=$(get_tailscale_ip)
        if [ -n "$ts_ip" ]; then
            log_success "Verbunden! Tailscale-IP: ${GREEN}${ts_ip}${NC}"
            return 0
        fi
    fi

    log_error "Authentifizierung fehlgeschlagen"
    log_info "Pruefe den Auth-Key und versuche es erneut"
    return 1
}

# =============================================================================
# Status-Ausgabe
# =============================================================================

show_status() {
    echo ""
    echo -e "  ${BOLD}Tailscale Status:${NC}"

    if ! check_tailscale_installed; then
        echo -e "  Installiert:  ${RED}Nein${NC}"
        return
    fi

    local version
    version=$(tailscale version 2>/dev/null | head -1 || echo "unbekannt")
    echo -e "  Version:      ${version}"

    if ! check_tailscaled_running; then
        echo -e "  Daemon:       ${RED}Gestoppt${NC}"
        return
    fi
    echo -e "  Daemon:       ${GREEN}Laeuft${NC}"

    if check_tailscale_connected; then
        local ts_ip ts_hostname
        ts_ip=$(get_tailscale_ip)
        ts_hostname=$(get_tailscale_hostname)
        echo -e "  Verbunden:    ${GREEN}Ja${NC}"
        echo -e "  IP-Adresse:   ${GREEN}${ts_ip}${NC}"
        [ -n "$ts_hostname" ] && echo -e "  Hostname:     ${ts_hostname}"
        echo ""
        echo -e "  ${DIM}Zugriff von anderem Geraet im Tailnet:${NC}"
        echo -e "    Dashboard:  ${BLUE}http://${ts_ip}${NC}"
        echo -e "    SSH:        ${BLUE}ssh arasul@${ts_ip}${NC}"
    else
        echo -e "  Verbunden:    ${YELLOW}Nein${NC}"
    fi
    echo ""
}

# =============================================================================
# Hauptlogik
# =============================================================================

main() {
    local auth_key="${TAILSCALE_AUTH_KEY:-}"
    local hostname="${TAILSCALE_HOSTNAME:-}"
    local action="${1:-setup}"

    case "$action" in
        status)
            show_status
            exit 0
            ;;
        install)
            install_tailscale
            enable_tailscaled
            exit $?
            ;;
        connect)
            if [ -z "$auth_key" ]; then
                log_error "TAILSCALE_AUTH_KEY nicht gesetzt"
                exit 1
            fi
            authenticate_tailscale "$auth_key" "$hostname"
            exit $?
            ;;
        setup|*)
            # Vollstaendiges Setup: Install → Enable → Authenticate

            # 1. Installieren
            if ! install_tailscale; then
                exit 1
            fi

            # 2. Daemon starten
            if ! enable_tailscaled; then
                exit 1
            fi

            # 3. Authentifizieren (wenn Key vorhanden)
            if [ -n "$auth_key" ]; then
                authenticate_tailscale "$auth_key" "$hostname"
                local result=$?
                show_status
                exit $result
            else
                log_info "Kein TAILSCALE_AUTH_KEY gesetzt - manuelle Authentifizierung noetig"
                log_info "Fuehre aus: sudo tailscale up"
                show_status
                exit 2
            fi
            ;;
    esac
}

main "$@"
