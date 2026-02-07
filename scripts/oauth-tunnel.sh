#!/bin/bash
#
# OAuth Tunnel - Ermöglicht Google OAuth von jedem Gerät im LAN
#
# Dieses Skript erstellt einen SSH-Tunnel vom aktuellen Gerät (Laptop)
# zum Jetson, sodass localhost:5678 auf n8n zeigt.
# Google OAuth funktioniert dann, weil localhost erlaubt ist.
#
# Verwendung:
#   ./oauth-tunnel.sh [jetson-ip]
#
# Beispiel:
#   ./oauth-tunnel.sh 192.168.0.112
#   ./oauth-tunnel.sh arasul.local
#

set -e

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Standard-Werte
DEFAULT_USER="arasul"
DEFAULT_PORT="5678"
N8N_PATH="/n8n"

print_header() {
    clear
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Arasul OAuth Tunnel${NC}                                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Ermöglicht Google OAuth von diesem Gerät                    ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_usage() {
    echo "Verwendung: $0 [jetson-ip] [optionen]"
    echo ""
    echo "Optionen:"
    echo "  -u, --user USER    SSH-Benutzer (Standard: $DEFAULT_USER)"
    echo "  -p, --port PORT    Lokaler Port (Standard: $DEFAULT_PORT)"
    echo "  -h, --help         Diese Hilfe anzeigen"
    echo ""
    echo "Beispiele:"
    echo "  $0 192.168.0.112"
    echo "  $0 arasul.local -u admin"
    echo ""
}

# Argumente parsen
JETSON_IP=""
SSH_USER="$DEFAULT_USER"
LOCAL_PORT="$DEFAULT_PORT"

while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--user)
            SSH_USER="$2"
            shift 2
            ;;
        -p|--port)
            LOCAL_PORT="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            if [[ -z "$JETSON_IP" ]]; then
                JETSON_IP="$1"
            fi
            shift
            ;;
    esac
done

print_header

# Jetson-IP abfragen falls nicht angegeben
if [[ -z "$JETSON_IP" ]]; then
    echo -e "${YELLOW}Jetson IP-Adresse oder Hostname eingeben:${NC}"
    echo -e "  (z.B. 192.168.0.112 oder arasul.local)"
    echo ""
    read -p "  Jetson: " JETSON_IP
    echo ""
fi

if [[ -z "$JETSON_IP" ]]; then
    echo -e "${RED}Fehler: Keine Jetson-IP angegeben${NC}"
    exit 1
fi

# Prüfe ob SSH verfügbar ist
if ! command -v ssh &> /dev/null; then
    echo -e "${RED}Fehler: SSH nicht installiert${NC}"
    echo "Installiere OpenSSH: sudo apt install openssh-client"
    exit 1
fi

# Prüfe Erreichbarkeit
echo -e "${BLUE}[1/4]${NC} Prüfe Verbindung zu ${BOLD}$JETSON_IP${NC}..."
if ! ping -c 1 -W 2 "$JETSON_IP" &> /dev/null; then
    echo -e "${YELLOW}  Warnung: Ping fehlgeschlagen (Firewall?)${NC}"
    echo -e "  Versuche trotzdem SSH-Verbindung..."
fi

# Prüfe ob Port bereits belegt
if lsof -i ":$LOCAL_PORT" &> /dev/null 2>&1 || ss -tuln | grep -q ":$LOCAL_PORT "; then
    echo -e "${YELLOW}  Port $LOCAL_PORT bereits belegt - versuche 15678...${NC}"
    LOCAL_PORT="15678"

    if lsof -i ":$LOCAL_PORT" &> /dev/null 2>&1 || ss -tuln | grep -q ":$LOCAL_PORT "; then
        echo -e "${RED}Fehler: Beide Ports (5678, 15678) sind belegt${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}  ✓ Bereit${NC}"

# SSH-Tunnel starten
echo ""
echo -e "${BLUE}[2/4]${NC} Starte SSH-Tunnel..."
echo -e "  ${CYAN}localhost:$LOCAL_PORT${NC} → ${CYAN}$JETSON_IP:5678${NC} (n8n)"
echo ""

# Hintergrund-Tunnel mit AutoSSH falls verfügbar, sonst normales SSH
if command -v autossh &> /dev/null; then
    echo -e "  Verwende autossh für stabile Verbindung..."
    TUNNEL_CMD="autossh -M 0 -f -N -L $LOCAL_PORT:localhost:5678 $SSH_USER@$JETSON_IP"
else
    TUNNEL_CMD="ssh -f -N -L $LOCAL_PORT:localhost:5678 $SSH_USER@$JETSON_IP"
fi

echo -e "  ${YELLOW}SSH-Passwort für $SSH_USER@$JETSON_IP eingeben:${NC}"
echo ""

if ! $TUNNEL_CMD; then
    echo ""
    echo -e "${RED}Fehler: SSH-Verbindung fehlgeschlagen${NC}"
    echo ""
    echo "Mögliche Ursachen:"
    echo "  - Falsches Passwort"
    echo "  - SSH nicht aktiviert auf Jetson"
    echo "  - Firewall blockiert Port 22"
    echo ""
    echo "Prüfe auf dem Jetson:"
    echo "  sudo systemctl status ssh"
    echo "  sudo ufw allow 22"
    exit 1
fi

echo -e "${GREEN}  ✓ Tunnel aktiv${NC}"

# Warte kurz bis Tunnel bereit ist
sleep 2

# Prüfe ob n8n erreichbar ist
echo ""
echo -e "${BLUE}[3/4]${NC} Prüfe n8n-Verbindung..."

if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$LOCAL_PORT/healthz" 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}  ✓ n8n erreichbar${NC}"
else
    echo -e "${YELLOW}  Warnung: n8n antwortet nicht auf /healthz${NC}"
    echo -e "  (Möglicherweise läuft n8n unter /n8n Pfad)"
fi

# Erfolg!
echo ""
echo -e "${BLUE}[4/4]${NC} ${GREEN}Tunnel bereit!${NC}"
echo ""
echo -e "╔═══════════════════════════════════════════════════════════════╗"
echo -e "║  ${BOLD}n8n ist jetzt erreichbar unter:${NC}                             ║"
echo -e "║                                                               ║"
echo -e "║    ${CYAN}http://localhost:$LOCAL_PORT${N8N_PATH}${NC}                              ║"
echo -e "║                                                               ║"
echo -e "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BOLD}So fügst du Google OAuth hinzu:${NC}"
echo ""
echo "  1. Öffne im Browser: ${CYAN}http://localhost:$LOCAL_PORT${N8N_PATH}${NC}"
echo "  2. Gehe zu: Credentials → Add Credential → Google OAuth2 API"
echo "  3. Klicke 'Connect my account'"
echo "  4. Google-Login durchführen"
echo "  5. Fertig! Token wird auf dem Jetson gespeichert."
echo ""
echo -e "${YELLOW}Hinweis:${NC} Der Tunnel läuft im Hintergrund."
echo "         Zum Beenden: ${CYAN}pkill -f 'ssh.*$LOCAL_PORT:localhost:5678'${NC}"
echo ""

# Optional: Browser öffnen
if command -v xdg-open &> /dev/null; then
    read -p "Browser jetzt öffnen? [J/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Jj]?$ ]]; then
        xdg-open "http://localhost:$LOCAL_PORT${N8N_PATH}" &
    fi
elif command -v open &> /dev/null; then
    read -p "Browser jetzt öffnen? [J/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Jj]?$ ]]; then
        open "http://localhost:$LOCAL_PORT${N8N_PATH}" &
    fi
fi

echo ""
echo -e "${GREEN}Viel Erfolg!${NC}"
