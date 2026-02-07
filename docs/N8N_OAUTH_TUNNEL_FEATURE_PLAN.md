# Feature Plan: n8n OAuth2 Tunnel für LAN-Zugriff

## Problem-Beschreibung

### Aktueller Zustand
Beim Versuch, Google OAuth2-Credentials in n8n von einem Laptop im gleichen WLAN hinzuzufügen, erscheint:

```
Zugriff blockiert: Autorisierungsfehler
device_id and device_name are required for private IP
http://192.168.0.112/n8n/rest/oauth2-credential/callback
Fehler 400: invalid_request
```

### Ursache
1. **Google OAuth2 blockiert private IP-Adressen** als Callback-URLs
2. **N8N_EDITOR_BASE_URL ist hardcoded** auf `http://192.168.0.112/n8n`
3. **Keine öffentlich erreichbare URL** für OAuth-Callbacks
4. **HTTPS wird benötigt** (außer bei localhost)

### Betroffene Konfigurationen
```yaml
# docker-compose.yml (aktuell)
N8N_EDITOR_BASE_URL: http://192.168.0.112/n8n  # HARDCODED!
WEBHOOK_URL: http://${N8N_HOST}:${N8N_WEBHOOK_PORT}
```

---

## Lösungsarchitektur

### Empfohlene Lösung: Cloudflare Tunnel (Zero-Trust)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNE WELT                                  │
│                                                                  │
│   Google OAuth Server                                            │
│         ↓                                                        │
│   https://arasul-n8n.yourdomain.com/rest/oauth2-credential/...  │
│         ↓                                                        │
│   Cloudflare Edge (SSL termination)                              │
│         ↓                                                        │
│   Cloudflare Tunnel (encrypted)                                  │
└─────────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    JETSON (LAN)                                  │
│                                                                  │
│   cloudflared (Container)                                        │
│         ↓                                                        │
│   Traefik → n8n:5678                                            │
│         ↓                                                        │
│   OAuth2 Callback verarbeitet                                    │
│         ↓                                                        │
│   Token gespeichert (verschlüsselt)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementierungsplan

### Phase 1: Cloudflare Tunnel Setup

#### 1.1 Cloudflare-Konto & Tunnel erstellen

```bash
# 1. Cloudflare-Konto erstellen (kostenlos)
# 2. Domain hinzufügen oder Cloudflare's *.cfargotunnel.com nutzen
# 3. Tunnel erstellen in Cloudflare Zero Trust Dashboard
```

#### 1.2 Docker Service: cloudflared

**Neue Datei: `services/cloudflared/docker-compose.override.yml`**

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    hostname: cloudflared
    restart: always
    networks:
      - arasul-net
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    volumes:
      - ./services/cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    depends_on:
      - reverse-proxy
    deploy:
      resources:
        limits:
          memory: 128M
```

#### 1.3 Cloudflared Konfiguration

**Neue Datei: `services/cloudflared/config.yml`**

```yaml
tunnel: arasul-n8n
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # n8n OAuth Callbacks (Priorität)
  - hostname: n8n.yourdomain.com
    path: /rest/oauth2-credential/*
    service: http://reverse-proxy:80
    originRequest:
      noTLSVerify: true

  # n8n Webhooks
  - hostname: n8n.yourdomain.com
    path: /webhook/*
    service: http://reverse-proxy:80
    originRequest:
      noTLSVerify: true

  # n8n UI (optional - für externen Zugriff)
  - hostname: n8n.yourdomain.com
    service: http://reverse-proxy:80
    originRequest:
      noTLSVerify: true

  # Catch-all (404)
  - service: http_status:404
```

---

### Phase 2: Umgebungsvariablen dynamisieren

#### 2.1 .env Template aktualisieren

**Änderung in `.env.template`:**

```bash
# ===== N8N OAUTH TUNNEL CONFIGURATION =====

# Option 1: Cloudflare Tunnel (Empfohlen)
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here
N8N_PUBLIC_DOMAIN=n8n.yourdomain.com

# Option 2: ngrok (Alternative)
# NGROK_AUTHTOKEN=your-ngrok-token
# N8N_PUBLIC_DOMAIN=your-subdomain.ngrok-free.app

# ===== N8N URL CONFIGURATION =====

# Lokale IP (automatisch erkannt oder manuell setzen)
JETSON_IP=192.168.0.112

# Interne URLs (LAN-Zugriff)
N8N_INTERNAL_URL=http://${JETSON_IP}/n8n

# Externe URLs (OAuth & Webhooks)
N8N_EXTERNAL_URL=https://${N8N_PUBLIC_DOMAIN}
```

#### 2.2 docker-compose.yml aktualisieren

**Änderung in `docker-compose.yml` - n8n Service:**

```yaml
n8n:
  environment:
    # Host-Konfiguration
    - N8N_HOST=${N8N_PUBLIC_DOMAIN:-localhost}
    - N8N_PORT=5678
    - N8N_PROTOCOL=${N8N_PROTOCOL:-https}

    # URL-Konfiguration (DYNAMISCH!)
    - N8N_EDITOR_BASE_URL=${N8N_EXTERNAL_URL:-http://localhost:5678}
    - WEBHOOK_URL=${N8N_EXTERNAL_URL:-http://localhost:5678}

    # Subpath für Traefik
    - N8N_PATH=/n8n/

    # Sicherheit
    - N8N_SECURE_COOKIE=${N8N_SECURE_COOKIE:-true}
    - N8N_TRUST_PROXY=true
```

---

### Phase 3: Traefik-Integration

#### 3.1 Neue Route für OAuth-Callbacks

**Änderung in `config/traefik/dynamic/routes.yml`:**

```yaml
http:
  routers:
    # OAuth2 Callback Route (Höchste Priorität)
    n8n-oauth-callback:
      rule: "PathPrefix(`/n8n/rest/oauth2-credential`)"
      priority: 150
      service: n8n-service
      middlewares:
        - strip-n8n-prefix
        - security-headers
      entryPoints:
        - web
        - websecure
      tls: {}

    # Bestehende n8n-Routen...
```

#### 3.2 CORS für OAuth-Redirects

**Änderung in `config/traefik/dynamic/middlewares.yml`:**

```yaml
http:
  middlewares:
    oauth-cors-headers:
      headers:
        accessControlAllowOriginList:
          - "https://accounts.google.com"
          - "https://oauth2.googleapis.com"
        accessControlAllowMethods:
          - GET
          - POST
          - OPTIONS
        accessControlAllowHeaders:
          - Authorization
          - Content-Type
        accessControlAllowCredentials: true
```

---

### Phase 4: Google OAuth2 Konfiguration

#### 4.1 Google Cloud Console Setup

1. **Neues OAuth2-Projekt erstellen** oder bestehendes verwenden
2. **OAuth Consent Screen konfigurieren:**
   - User Type: External (oder Internal für Workspace)
   - App Name: "Arasul n8n Integration"
   - Authorized Domains: `yourdomain.com`

3. **OAuth 2.0 Client ID erstellen:**
   - Application Type: **Web Application**
   - Name: "Arasul n8n OAuth"
   - Authorized JavaScript Origins:
     ```
     https://n8n.yourdomain.com
     ```
   - Authorized Redirect URIs:
     ```
     https://n8n.yourdomain.com/rest/oauth2-credential/callback
     ```

4. **Client ID und Secret speichern:**
   - Diese werden in n8n bei der Credential-Erstellung eingegeben

#### 4.2 n8n Credential Template

**Neue Datei: `services/n8n/credentials/google-oauth2-template.json`:**

```json
{
  "name": "Google OAuth2 (Arasul)",
  "type": "googleOAuth2Api",
  "data": {
    "clientId": "${GOOGLE_OAUTH_CLIENT_ID}",
    "clientSecret": "${GOOGLE_OAUTH_CLIENT_SECRET}",
    "oauthTokenData": null
  },
  "nodesAccess": [
    { "nodeType": "n8n-nodes-base.googleSheets" },
    { "nodeType": "n8n-nodes-base.googleDrive" },
    { "nodeType": "n8n-nodes-base.gmail" },
    { "nodeType": "n8n-nodes-base.googleCalendar" }
  ]
}
```

---

### Phase 5: Setup-Skript

#### 5.1 Automatisches Setup-Skript

**Neue Datei: `scripts/setup-n8n-oauth-tunnel.sh`:**

```bash
#!/bin/bash
set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Arasul n8n OAuth Tunnel Setup ===${NC}"

# Prüfe Voraussetzungen
check_prerequisites() {
    echo -e "${YELLOW}Prüfe Voraussetzungen...${NC}"

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker nicht gefunden!${NC}"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        echo -e "${RED}Docker Compose nicht gefunden!${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Alle Voraussetzungen erfüllt${NC}"
}

# Cloudflare Tunnel Setup
setup_cloudflare_tunnel() {
    echo -e "${YELLOW}Cloudflare Tunnel Setup...${NC}"

    # Prüfe ob Token vorhanden
    if [ -z "${CLOUDFLARE_TUNNEL_TOKEN}" ]; then
        echo -e "${YELLOW}Kein CLOUDFLARE_TUNNEL_TOKEN in .env gefunden.${NC}"
        echo ""
        echo "Bitte folgende Schritte ausführen:"
        echo "1. Gehe zu https://one.dash.cloudflare.com"
        echo "2. Wähle 'Networks' → 'Tunnels' → 'Create a tunnel'"
        echo "3. Kopiere den Tunnel-Token"
        echo "4. Füge ihn in .env ein: CLOUDFLARE_TUNNEL_TOKEN=<token>"
        echo ""
        read -p "Tunnel-Token eingeben (oder Enter zum Überspringen): " token

        if [ -n "$token" ]; then
            echo "CLOUDFLARE_TUNNEL_TOKEN=$token" >> .env
            echo -e "${GREEN}✓ Token gespeichert${NC}"
        else
            echo -e "${RED}Übersprungen - manuell in .env eintragen${NC}"
            return 1
        fi
    fi

    echo -e "${GREEN}✓ Cloudflare Tunnel konfiguriert${NC}"
}

# Jetson IP automatisch erkennen
detect_jetson_ip() {
    echo -e "${YELLOW}Erkenne Jetson IP...${NC}"

    # Versuche IP zu erkennen (eth0 oder wlan0)
    IP=$(ip -4 addr show | grep -oP '(?<=inet\s)192\.168\.\d+\.\d+' | head -1)

    if [ -z "$IP" ]; then
        IP=$(ip -4 addr show | grep -oP '(?<=inet\s)10\.\d+\.\d+\.\d+' | head -1)
    fi

    if [ -n "$IP" ]; then
        echo -e "${GREEN}✓ Erkannte IP: $IP${NC}"

        # In .env aktualisieren
        if grep -q "^JETSON_IP=" .env; then
            sed -i "s/^JETSON_IP=.*/JETSON_IP=$IP/" .env
        else
            echo "JETSON_IP=$IP" >> .env
        fi
    else
        echo -e "${RED}Konnte IP nicht erkennen - manuell in .env setzen${NC}"
    fi
}

# n8n URLs konfigurieren
configure_n8n_urls() {
    echo -e "${YELLOW}Konfiguriere n8n URLs...${NC}"

    read -p "Öffentliche Domain für n8n (z.B. n8n.example.com): " domain

    if [ -n "$domain" ]; then
        # .env aktualisieren
        if grep -q "^N8N_PUBLIC_DOMAIN=" .env; then
            sed -i "s/^N8N_PUBLIC_DOMAIN=.*/N8N_PUBLIC_DOMAIN=$domain/" .env
        else
            echo "N8N_PUBLIC_DOMAIN=$domain" >> .env
        fi

        if grep -q "^N8N_EXTERNAL_URL=" .env; then
            sed -i "s|^N8N_EXTERNAL_URL=.*|N8N_EXTERNAL_URL=https://$domain|" .env
        else
            echo "N8N_EXTERNAL_URL=https://$domain" >> .env
        fi

        echo -e "${GREEN}✓ n8n URLs konfiguriert${NC}"
        echo ""
        echo -e "${YELLOW}WICHTIG: Registriere diese URL in Google Cloud Console:${NC}"
        echo "  Redirect URI: https://$domain/rest/oauth2-credential/callback"
    fi
}

# Services neu starten
restart_services() {
    echo -e "${YELLOW}Starte Services neu...${NC}"

    docker compose up -d cloudflared n8n

    echo -e "${GREEN}✓ Services gestartet${NC}"
}

# Hauptprogramm
main() {
    check_prerequisites
    detect_jetson_ip
    setup_cloudflare_tunnel
    configure_n8n_urls

    echo ""
    echo -e "${GREEN}=== Setup abgeschlossen ===${NC}"
    echo ""
    echo "Nächste Schritte:"
    echo "1. docker compose up -d cloudflared n8n"
    echo "2. Konfiguriere Google OAuth in Cloud Console"
    echo "3. Erstelle Credential in n8n"
    echo ""
}

main "$@"
```

---

### Phase 6: Dokumentation

#### 6.1 Benutzerhandbuch

**Neue Datei: `docs/N8N_GOOGLE_OAUTH_SETUP.md`:**

```markdown
# n8n Google OAuth2 Setup Guide

## Voraussetzungen

- Cloudflare-Konto (kostenlos)
- Eigene Domain (optional, aber empfohlen)
- Google Cloud Console Zugang

## Schritt 1: Cloudflare Tunnel einrichten

1. Gehe zu [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. Navigiere zu **Networks** → **Tunnels**
3. Klicke **Create a tunnel**
4. Wähle **Cloudflared** als Connector
5. Kopiere den Tunnel-Token

## Schritt 2: Arasul konfigurieren

```bash
# Setup-Skript ausführen
./scripts/setup-n8n-oauth-tunnel.sh
```

Oder manuell in `.env`:
```bash
CLOUDFLARE_TUNNEL_TOKEN=your-token-here
N8N_PUBLIC_DOMAIN=n8n.yourdomain.com
N8N_EXTERNAL_URL=https://n8n.yourdomain.com
```

## Schritt 3: Google Cloud Console

1. Öffne [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** → **Credentials**
3. **Create Credentials** → **OAuth client ID**
4. Wähle **Web application**
5. Füge hinzu:
   - **Authorized redirect URIs:**
     ```
     https://n8n.yourdomain.com/rest/oauth2-credential/callback
     ```

## Schritt 4: n8n Credential erstellen

1. Öffne n8n UI
2. **Credentials** → **Add Credential**
3. Wähle **Google OAuth2 API**
4. Füge Client ID und Secret ein
5. Klicke **Connect** - Browser öffnet sich
6. Authentifiziere mit Google
7. Credential ist einsatzbereit!

## Fehlerbehebung

### Fehler: "invalid_request"
- Prüfe, ob die Redirect URI exakt übereinstimmt
- Stelle sicher, dass HTTPS verwendet wird

### Fehler: "redirect_uri_mismatch"
- Die URL in Google Console muss exakt mit n8n übereinstimmen
- Kein trailing slash hinzufügen/entfernen

### Tunnel nicht erreichbar
```bash
docker compose logs cloudflared
```
```

---

## Ressourcen-Anforderungen

| Service | RAM | CPU | Disk |
|---------|-----|-----|------|
| cloudflared | 128 MB | 0.1 | minimal |
| n8n (bestehend) | 2 GB | 1.0 | abhängig |

**Gesamt zusätzlicher Bedarf:** ~128 MB RAM

---

## Sicherheitsüberlegungen

### 1. Tunnel-Exposition minimieren
- Nur `/rest/oauth2-credential/*` und `/webhook/*` exponieren
- n8n UI nur bei Bedarf öffentlich machen

### 2. Cloudflare Access (optional)
- Zusätzliche Authentifizierung vor Tunnel-Zugriff
- Zero Trust Policies konfigurieren

### 3. n8n-interne Sicherheit
- Starke Passwörter für n8n-Benutzer
- N8N_ENCRYPTION_KEY sicher aufbewahren

---

## Alternative Lösungen

### Option B: ngrok (Schneller Setup, aber Limits)

```yaml
# docker-compose.override.yml
services:
  ngrok:
    image: ngrok/ngrok:latest
    container_name: ngrok
    environment:
      - NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
    command: http reverse-proxy:80 --domain=${NGROK_DOMAIN}
    networks:
      - arasul-net
```

**Vorteile:**
- Schnellerer Setup
- Traffic-Inspektion

**Nachteile:**
- Free Tier: 1 GB/Monat
- Kostenpflichtig für Custom Domain

### Option C: n8n Built-in Tunnel (Nur Entwicklung)

```yaml
# docker-compose.yml
n8n:
  command: start --tunnel
  environment:
    - N8N_TUNNEL_SUBDOMAIN=arasul-dev
```

**Warnung:** Nicht für Produktion empfohlen!

---

## Zeitplan

| Phase | Aufgabe | Geschätzter Aufwand |
|-------|---------|---------------------|
| 1 | Cloudflare Setup | 30 min |
| 2 | .env & docker-compose | 1 Stunde |
| 3 | Traefik-Anpassungen | 30 min |
| 4 | Google OAuth Config | 30 min |
| 5 | Setup-Skript | 1 Stunde |
| 6 | Dokumentation | 1 Stunde |
| 7 | Testing | 1 Stunde |

**Gesamt:** ~5-6 Stunden

---

## Testplan

### Funktionale Tests

1. **Tunnel-Konnektivität**
   ```bash
   curl -I https://n8n.yourdomain.com/healthz
   ```

2. **OAuth-Flow**
   - Credential in n8n erstellen
   - Google-Login durchführen
   - Token wird gespeichert

3. **Webhook-Test**
   ```bash
   curl -X POST https://n8n.yourdomain.com/webhook/test
   ```

4. **Multi-Device-Test**
   - Von Laptop im WLAN OAuth durchführen
   - Von Handy OAuth durchführen

### Sicherheitstests

1. **Ungeschützte Pfade prüfen**
   - Nur erlaubte Pfade erreichbar

2. **Rate-Limiting**
   - Webhook-Rate-Limit aktiv

---

## Zusammenfassung

Dieses Feature ermöglicht:

1. ✅ **Google OAuth2** von jedem Gerät im WLAN
2. ✅ **Sichere Verbindung** über HTTPS
3. ✅ **Keine öffentliche IP** des Jetson nötig
4. ✅ **Kostenlose Lösung** mit Cloudflare
5. ✅ **Webhook-Empfang** von externen Services
6. ✅ **Dynamische URL-Konfiguration** statt Hardcoding
