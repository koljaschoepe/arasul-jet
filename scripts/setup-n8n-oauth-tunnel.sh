#!/bin/bash
#
# Setup-Skript für n8n OAuth Tunnel
#
# Dieses Skript konfiguriert entweder Cloudflare Tunnel oder ngrok
# um OAuth2 und Webhooks von externen Diensten zu ermöglichen.
#
# Verwendung:
#   ./scripts/setup-n8n-oauth-tunnel.sh
#
# Dokumentation: docs/N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Konfiguration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Header
print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Arasul n8n OAuth Tunnel Setup${NC}                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Ermöglicht Google OAuth von jedem Gerät im WLAN          ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Status-Ausgaben
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Voraussetzungen prüfen
check_prerequisites() {
    log_info "Prüfe Voraussetzungen..."

    local errors=0

    # Docker
    if command -v docker &> /dev/null; then
        log_success "Docker gefunden: $(docker --version | head -1)"
    else
        log_error "Docker nicht gefunden!"
        ((errors++))
    fi

    # Docker Compose
    if docker compose version &> /dev/null; then
        log_success "Docker Compose gefunden: $(docker compose version --short)"
    else
        log_error "Docker Compose nicht gefunden!"
        ((errors++))
    fi

    # .env Datei
    if [ -f "$ENV_FILE" ]; then
        log_success ".env Datei gefunden"
    else
        log_warning ".env Datei nicht gefunden - wird erstellt"
        touch "$ENV_FILE"
    fi

    # arasul-net Netzwerk
    if docker network ls | grep -q "arasul-net"; then
        log_success "Docker Netzwerk 'arasul-net' existiert"
    else
        log_warning "Docker Netzwerk 'arasul-net' nicht gefunden"
        log_info "Erstelle Netzwerk..."
        docker network create arasul-net || true
    fi

    if [ $errors -gt 0 ]; then
        log_error "Voraussetzungen nicht erfüllt. Bitte behebe die Fehler oben."
        exit 1
    fi

    echo ""
}

# Jetson IP erkennen
detect_ip() {
    log_info "Erkenne lokale IP-Adresse..."

    # Versuche verschiedene Interfaces
    local IP=""

    # eth0
    IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet\s)\d+\.\d+\.\d+\.\d+' | head -1)

    # wlan0
    if [ -z "$IP" ]; then
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+\.\d+\.\d+\.\d+' | head -1)
    fi

    # Generisch 192.168.x.x
    if [ -z "$IP" ]; then
        IP=$(ip -4 addr show | grep -oP '(?<=inet\s)192\.168\.\d+\.\d+' | head -1)
    fi

    # Generisch 10.x.x.x
    if [ -z "$IP" ]; then
        IP=$(ip -4 addr show | grep -oP '(?<=inet\s)10\.\d+\.\d+\.\d+' | head -1)
    fi

    if [ -n "$IP" ]; then
        log_success "Erkannte IP: $IP"
        update_env_var "JETSON_IP" "$IP"
    else
        log_warning "Konnte IP nicht automatisch erkennen"
        read -p "  Bitte IP-Adresse eingeben: " IP
        if [ -n "$IP" ]; then
            update_env_var "JETSON_IP" "$IP"
        fi
    fi

    echo ""
}

# Umgebungsvariable setzen/aktualisieren
update_env_var() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        echo "${key}=${value}" >> "$ENV_FILE"
    fi
}

# Tunnel-Auswahl
select_tunnel_type() {
    echo -e "${BOLD}Welchen Tunnel-Typ möchtest du verwenden?${NC}"
    echo ""
    echo "  1) ${GREEN}Cloudflare Tunnel${NC} (Empfohlen)"
    echo "     - Kostenlos, unbegrenzte Bandbreite"
    echo "     - Stabile URLs mit eigener Domain"
    echo "     - Beste Sicherheit"
    echo ""
    echo "  2) ${YELLOW}ngrok${NC} (Schnellstart)"
    echo "     - Einfachstes Setup"
    echo "     - 1 GB/Monat Bandbreite (Free)"
    echo "     - Gut für Tests"
    echo ""
    echo "  3) ${CYAN}Manuell${NC}"
    echo "     - Nur Umgebungsvariablen konfigurieren"
    echo ""

    read -p "Auswahl [1-3]: " choice

    case $choice in
        1) setup_cloudflare ;;
        2) setup_ngrok ;;
        3) setup_manual ;;
        *) log_error "Ungültige Auswahl"; exit 1 ;;
    esac
}

# Cloudflare Tunnel Setup
setup_cloudflare() {
    echo ""
    echo -e "${CYAN}═══ Cloudflare Tunnel Setup ═══${NC}"
    echo ""

    # Prüfe ob Token bereits existiert
    if grep -q "^CLOUDFLARE_TUNNEL_TOKEN=" "$ENV_FILE" && \
       ! grep -q "^CLOUDFLARE_TUNNEL_TOKEN=$" "$ENV_FILE"; then
        log_success "CLOUDFLARE_TUNNEL_TOKEN bereits konfiguriert"
    else
        echo -e "${YELLOW}So erstellst du einen Tunnel-Token:${NC}"
        echo ""
        echo "  1. Gehe zu: ${BLUE}https://one.dash.cloudflare.com${NC}"
        echo "  2. Networks → Tunnels → Create a tunnel"
        echo "  3. Connector: Cloudflared"
        echo "  4. Name: arasul-n8n"
        echo "  5. Kopiere den Token (beginnt mit 'eyJ...')"
        echo ""

        read -p "Tunnel-Token eingeben (oder Enter zum Überspringen): " token

        if [ -n "$token" ]; then
            update_env_var "CLOUDFLARE_TUNNEL_TOKEN" "$token"
            log_success "Token gespeichert"
        else
            log_warning "Token übersprungen - später in .env eintragen"
        fi
    fi

    echo ""

    # Domain konfigurieren
    echo -e "${YELLOW}Welche Domain verwendest du?${NC}"
    echo "  z.B.: n8n.example.com oder arasul.yourdomain.de"
    echo ""

    read -p "Domain für n8n eingeben: " domain

    if [ -n "$domain" ]; then
        update_env_var "N8N_PUBLIC_DOMAIN" "$domain"
        update_env_var "N8N_EXTERNAL_URL" "https://$domain"
        update_env_var "N8N_PROTOCOL" "https"
        update_env_var "N8N_SECURE_COOKIE" "true"
        log_success "Domain konfiguriert: $domain"
    else
        log_warning "Keine Domain angegeben"
    fi

    echo ""
    echo -e "${GREEN}═══ Cloudflare Setup abgeschlossen ═══${NC}"
    echo ""
    echo "Nächste Schritte:"
    echo ""
    echo "  1. Im Cloudflare Dashboard Public Hostname hinzufügen:"
    echo "     Subdomain: ${domain%%.*}"
    echo "     Domain: ${domain#*.}"
    echo "     Service: http://reverse-proxy:80"
    echo ""
    echo "  2. Services starten:"
    echo "     ${CYAN}docker compose -f docker-compose.yml \\"
    echo "       -f services/cloudflared/docker-compose.override.yml \\"
    echo "       up -d cloudflared${NC}"
    echo ""
    echo "     ${CYAN}docker compose up -d --force-recreate n8n${NC}"
    echo ""
    echo "  3. In Google Cloud Console Redirect URI eintragen:"
    echo "     ${BLUE}https://$domain/rest/oauth2-credential/callback${NC}"
    echo ""
}

# ngrok Setup
setup_ngrok() {
    echo ""
    echo -e "${CYAN}═══ ngrok Setup ═══${NC}"
    echo ""

    # Prüfe ob Token bereits existiert
    if grep -q "^NGROK_AUTHTOKEN=" "$ENV_FILE" && \
       ! grep -q "^NGROK_AUTHTOKEN=$" "$ENV_FILE"; then
        log_success "NGROK_AUTHTOKEN bereits konfiguriert"
    else
        echo -e "${YELLOW}So erhältst du einen ngrok Token:${NC}"
        echo ""
        echo "  1. Erstelle Account: ${BLUE}https://dashboard.ngrok.com/signup${NC}"
        echo "  2. Getting Started → Your Authtoken kopieren"
        echo ""

        read -p "ngrok Authtoken eingeben: " token

        if [ -n "$token" ]; then
            update_env_var "NGROK_AUTHTOKEN" "$token"
            log_success "Token gespeichert"
        else
            log_warning "Token übersprungen"
        fi
    fi

    echo ""

    # Domain
    echo -e "${YELLOW}Statische ngrok Domain:${NC}"
    echo "  Gehe zu: https://dashboard.ngrok.com/domains"
    echo "  Klicke 'New Domain' (1 gratis Domain verfügbar)"
    echo "  z.B.: your-name.ngrok-free.app"
    echo ""

    read -p "ngrok Domain eingeben: " domain

    if [ -n "$domain" ]; then
        update_env_var "NGROK_DOMAIN" "$domain"
        update_env_var "N8N_EXTERNAL_URL" "https://$domain"
        update_env_var "N8N_PROTOCOL" "https"
        update_env_var "N8N_SECURE_COOKIE" "true"
        log_success "Domain konfiguriert: $domain"
    fi

    echo ""
    echo -e "${GREEN}═══ ngrok Setup abgeschlossen ═══${NC}"
    echo ""
    echo "Nächste Schritte:"
    echo ""
    echo "  1. Service starten:"
    echo "     ${CYAN}docker compose -f docker-compose.yml \\"
    echo "       -f services/ngrok/docker-compose.override.yml \\"
    echo "       up -d ngrok${NC}"
    echo ""
    echo "     ${CYAN}docker compose up -d --force-recreate n8n${NC}"
    echo ""
    echo "  2. Inspection UI öffnen: ${BLUE}http://localhost:4040${NC}"
    echo ""
    echo "  3. In Google Cloud Console Redirect URI eintragen:"
    echo "     ${BLUE}https://$domain/rest/oauth2-credential/callback${NC}"
    echo ""
}

# Manuelle Konfiguration
setup_manual() {
    echo ""
    echo -e "${CYAN}═══ Manuelle Konfiguration ═══${NC}"
    echo ""

    echo "Trage folgende Variablen in .env ein:"
    echo ""
    echo "  # Für Cloudflare:"
    echo "  CLOUDFLARE_TUNNEL_TOKEN=dein-token"
    echo "  N8N_PUBLIC_DOMAIN=n8n.example.com"
    echo ""
    echo "  # ODER für ngrok:"
    echo "  NGROK_AUTHTOKEN=dein-token"
    echo "  NGROK_DOMAIN=name.ngrok-free.app"
    echo ""
    echo "  # Gemeinsam:"
    echo "  N8N_EXTERNAL_URL=https://deine-domain"
    echo "  N8N_PROTOCOL=https"
    echo "  N8N_SECURE_COOKIE=true"
    echo ""
}

# n8n Umgebungsvariablen validieren
validate_n8n_config() {
    echo ""
    log_info "Validiere n8n Konfiguration..."

    local warnings=0

    # Prüfe ob wichtige Variablen gesetzt sind
    if grep -q "^N8N_EXTERNAL_URL=https://" "$ENV_FILE"; then
        log_success "N8N_EXTERNAL_URL ist konfiguriert"
    else
        log_warning "N8N_EXTERNAL_URL nicht gesetzt oder nicht HTTPS"
        ((warnings++))
    fi

    if grep -q "^N8N_PROTOCOL=https" "$ENV_FILE"; then
        log_success "N8N_PROTOCOL ist https"
    else
        log_warning "N8N_PROTOCOL sollte 'https' sein"
        ((warnings++))
    fi

    if [ $warnings -gt 0 ]; then
        log_warning "$warnings Warnungen - bitte .env prüfen"
    else
        log_success "Konfiguration sieht gut aus!"
    fi

    echo ""
}

# Finale Zusammenfassung
print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${BOLD}Setup abgeschlossen!${NC}                                      ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo "Aktuelle Konfiguration (.env):"
    echo "───────────────────────────────────"
    grep -E "^(N8N_|CLOUDFLARE_|NGROK_|JETSON_)" "$ENV_FILE" 2>/dev/null | while read line; do
        # Token maskieren
        if [[ $line == *"TOKEN="* ]] || [[ $line == *"AUTHTOKEN="* ]]; then
            key=$(echo "$line" | cut -d= -f1)
            echo "  $key=***masked***"
        else
            echo "  $line"
        fi
    done
    echo "───────────────────────────────────"
    echo ""

    echo "Dokumentation: ${BLUE}docs/N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md${NC}"
    echo ""
}

# Hauptprogramm
main() {
    cd "$PROJECT_DIR"

    print_header
    check_prerequisites
    detect_ip
    select_tunnel_type
    validate_n8n_config
    print_summary
}

main "$@"
