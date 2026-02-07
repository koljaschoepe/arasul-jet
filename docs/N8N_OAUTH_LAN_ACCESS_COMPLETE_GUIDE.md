# Vollständiger Leitfaden: n8n OAuth2 von anderen Geräten im LAN

## Inhaltsverzeichnis

1. [Problem-Analyse](#problem-analyse)
2. [Ursachen-Erklärung](#ursachen-erklärung)
3. [Lösungsübersicht](#lösungsübersicht)
4. [Lösung A: Cloudflare Tunnel (Empfohlen)](#lösung-a-cloudflare-tunnel-empfohlen)
5. [Lösung B: ngrok (Schnellstart)](#lösung-b-ngrok-schnellstart)
6. [Lösung C: Desktop-App Workaround](#lösung-c-desktop-app-workaround)
7. [Google Cloud Console Konfiguration](#google-cloud-console-konfiguration)
8. [Implementierungsplan](#implementierungsplan)
9. [Troubleshooting](#troubleshooting)
10. [Sicherheitshinweise](#sicherheitshinweise)

---

## Problem-Analyse

### Fehlermeldung

```
Zugriff blockiert: Autorisierungsfehler

device_id and device_name are required for private IP
http://192.168.0.112/n8n/rest/oauth2-credential/callback
Weitere Informationen zu diesem Fehler

Wenn Sie Entwickler von "n8n setup" sind, finden Sie in den
Fehlerdetails weitere Informationen.

Fehler 400: invalid_request
```

### Was passiert?

1. **User öffnet n8n** auf Laptop über `http://192.168.0.112/n8n`
2. **User erstellt Google Credential** → klickt "Connect"
3. **n8n leitet zu Google** mit Callback-URL `http://192.168.0.112/n8n/rest/oauth2-credential/callback`
4. **Google lehnt ab** weil:
   - Private IP-Adressen (192.168.x.x) sind nicht erlaubt
   - HTTP (ohne S) ist nicht erlaubt (außer localhost)
   - Google kann die IP nicht verifizieren

### Betroffene Szenarien

| Szenario | Funktioniert? | Grund |
|----------|---------------|-------|
| n8n auf Jetson, OAuth vom Jetson selbst | ❌ | Private IP blockiert |
| n8n auf Jetson, OAuth vom Laptop im WLAN | ❌ | Private IP blockiert |
| n8n auf Jetson, OAuth über Cloudflare Tunnel | ✅ | Öffentliche HTTPS-URL |
| n8n auf Jetson, OAuth über ngrok | ✅ | Öffentliche HTTPS-URL |
| n8n lokal auf Laptop (`localhost`) | ✅ | Localhost ist Ausnahme |

---

## Ursachen-Erklärung

### Google OAuth2 Redirect-URI Regeln

| URI-Typ | Erlaubt? | Beispiel |
|---------|----------|----------|
| `http://localhost:*` | ✅ Ja | `http://localhost:5678/callback` |
| `http://127.0.0.1:*` | ✅ Ja | `http://127.0.0.1:5678/callback` |
| `https://*.domain.com` | ✅ Ja | `https://n8n.example.com/callback` |
| `http://192.168.*.*` | ❌ Nein | Private IP |
| `http://10.*.*.*` | ❌ Nein | Private IP |
| `http://172.16-31.*.*` | ❌ Nein | Private IP |
| Custom URI Schemes | ❌ Nein | `myapp://callback` (deprecated) |

### Warum blockiert Google private IPs?

1. **Sicherheit**: Google kann nicht verifizieren, wem die IP gehört
2. **Phishing-Schutz**: Angreifer könnten Tokens abfangen
3. **App-Impersonierung**: Keine Möglichkeit, legitime Apps zu identifizieren

### Aktuelle Konfiguration (Problem)

```yaml
# docker-compose.yml - AKTUELL FEHLERHAFT
N8N_EDITOR_BASE_URL: http://192.168.0.112/n8n  # ❌ HARDCODED Private IP!
```

---

## Lösungsübersicht

### Vergleich der Lösungen

| Kriterium | Cloudflare Tunnel | ngrok | Desktop-App |
|-----------|-------------------|-------|-------------|
| **Setup-Aufwand** | Mittel (1-2h) | Niedrig (15min) | Niedrig (15min) |
| **Kosten** | Kostenlos | Kostenlos (Limits) | Kostenlos |
| **Stabilität** | Exzellent | Gut | Eingeschränkt |
| **Multi-Device** | ✅ Ja | ✅ Ja | ⚠️ Nur lokal |
| **Custom Domain** | ✅ Ja (eigene) | ❌ Nein (free) | N/A |
| **Bandwidth** | Unbegrenzt | 1GB/Monat | N/A |
| **Für Produktion** | ✅ Empfohlen | ⚠️ Bedingt | ❌ Nein |
| **Externe Webhooks** | ✅ Ja | ✅ Ja | ❌ Nein |

### Empfehlung

```
┌─────────────────────────────────────────────────────────────────┐
│  Für Produktion & Multi-Device   →  Cloudflare Tunnel (A)      │
│  Für schnelles Testen            →  ngrok (B)                   │
│  Für lokale Entwicklung nur      →  Desktop-App Workaround (C)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Lösung A: Cloudflare Tunnel (Empfohlen)

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERNET                                     │
│                                                                 │
│   Google OAuth Server                                           │
│         │                                                       │
│         ▼                                                       │
│   https://n8n.yourdomain.com/rest/oauth2-credential/callback   │
│         │                                                       │
│         ▼                                                       │
│   Cloudflare Edge (SSL/TLS)                                     │
│         │                                                       │
│         ▼                                                       │
│   Cloudflare Tunnel (verschlüsselt)                            │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JETSON (LAN)                                 │
│                                                                 │
│   cloudflared Container ◄─── Kein Port öffnen nötig!           │
│         │                                                       │
│         ▼                                                       │
│   Traefik (reverse-proxy:80)                                   │
│         │                                                       │
│         ▼                                                       │
│   n8n:5678                                                      │
│         │                                                       │
│         ▼                                                       │
│   OAuth2 Token gespeichert ✓                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Schritt 1: Cloudflare Account & Domain

1. **Cloudflare Account erstellen** (kostenlos): https://dash.cloudflare.com/sign-up
2. **Domain hinzufügen**:
   - Eigene Domain → DNS zu Cloudflare übertragen
   - ODER: Subdomain einer bestehenden Domain verwenden

### Schritt 2: Tunnel erstellen

1. Gehe zu: https://one.dash.cloudflare.com
2. **Networks** → **Tunnels** → **Create a tunnel**
3. **Connector**: Wähle "Cloudflared"
4. **Name**: `arasul-n8n`
5. **Kopiere den Tunnel-Token** (lang, beginnt mit `eyJ...`)

### Schritt 3: Docker Service hinzufügen

**Neue Datei erstellen:** `services/cloudflared/docker-compose.override.yml`

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    hostname: cloudflared
    restart: always
    networks:
      - arasul-net
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - reverse-proxy
    deploy:
      resources:
        limits:
          memory: 128M
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Schritt 4: Umgebungsvariablen setzen

**In `.env` hinzufügen:**

```bash
# ===== CLOUDFLARE TUNNEL =====
CLOUDFLARE_TUNNEL_TOKEN=eyJ...dein-token-hier...

# ===== N8N OAUTH URLS =====
N8N_PUBLIC_DOMAIN=n8n.yourdomain.com
N8N_EXTERNAL_URL=https://n8n.yourdomain.com
N8N_PROTOCOL=https
N8N_SECURE_COOKIE=true
```

### Schritt 5: docker-compose.yml anpassen

**n8n Service ändern (ca. Zeile 565):**

```yaml
n8n:
  environment:
    # URLs (DYNAMISCH statt hardcoded!)
    - N8N_HOST=${N8N_PUBLIC_DOMAIN:-localhost}
    - N8N_PROTOCOL=${N8N_PROTOCOL:-https}
    - N8N_EDITOR_BASE_URL=${N8N_EXTERNAL_URL:-http://localhost:5678}
    - WEBHOOK_URL=${N8N_EXTERNAL_URL:-http://localhost:5678}

    # Sicherheit für HTTPS
    - N8N_SECURE_COOKIE=${N8N_SECURE_COOKIE:-true}
    - N8N_TRUST_PROXY=true

    # Bestehende Einstellungen beibehalten...
```

### Schritt 6: Cloudflare Tunnel Route konfigurieren

Im Cloudflare Dashboard unter **Tunnels** → **arasul-n8n** → **Public Hostname**:

| Subdomain | Domain | Path | Service |
|-----------|--------|------|---------|
| n8n | yourdomain.com | (leer) | http://reverse-proxy:80 |

Oder mit `config.yml`:

```yaml
# services/cloudflared/config.yml
ingress:
  - hostname: n8n.yourdomain.com
    service: http://reverse-proxy:80
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

### Schritt 7: Services starten

```bash
# Cloudflared Service hinzufügen
docker compose -f docker-compose.yml -f services/cloudflared/docker-compose.override.yml up -d cloudflared

# n8n neu starten (neue Umgebungsvariablen laden)
docker compose up -d --force-recreate n8n

# Logs prüfen
docker compose logs -f cloudflared
```

### Schritt 8: Test

```bash
# Von außen erreichbar?
curl -I https://n8n.yourdomain.com/healthz

# Erwartete Antwort: HTTP/2 200
```

---

## Lösung B: ngrok (Schnellstart)

### Für schnelles Testen (15 Minuten Setup)

### Schritt 1: ngrok Account & Token

1. Account erstellen: https://dashboard.ngrok.com/signup
2. **Getting Started** → **Your Authtoken** kopieren
3. **Domains** → Statische Domain holen (gratis, z.B. `your-name.ngrok-free.app`)

### Schritt 2: Docker Service

```yaml
# services/ngrok/docker-compose.override.yml
services:
  ngrok:
    image: ngrok/ngrok:latest
    container_name: ngrok
    restart: unless-stopped
    networks:
      - arasul-net
    environment:
      - NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
    command: http reverse-proxy:80 --domain=${NGROK_DOMAIN}
    ports:
      - "4040:4040"  # Inspection UI
    depends_on:
      - reverse-proxy
```

### Schritt 3: Umgebungsvariablen

```bash
# .env
NGROK_AUTHTOKEN=2abc...dein-token
NGROK_DOMAIN=your-name.ngrok-free.app

N8N_EXTERNAL_URL=https://your-name.ngrok-free.app
N8N_PROTOCOL=https
```

### Schritt 4: Starten

```bash
docker compose -f docker-compose.yml -f services/ngrok/docker-compose.override.yml up -d ngrok
docker compose up -d --force-recreate n8n
```

### Einschränkungen (Free Tier)

- ⚠️ **1 GB Bandbreite/Monat**
- ⚠️ **Interstitial-Seite** bei Browser-Zugriff
- ⚠️ **Nur 1 aktiver Endpunkt**

---

## Lösung C: Desktop-App Workaround

### Nur für lokale Entwicklung (keine Multi-Device!)

Wenn du OAuth nur auf dem Gerät brauchst, auf dem n8n läuft:

### Schritt 1: Google Cloud Console

1. **APIs & Services** → **Credentials** → **Create Credentials**
2. **OAuth client ID** → **Application type: Desktop app** (NICHT Web!)
3. Speichere Client ID und Secret

### Schritt 2: n8n konfigurieren

```bash
# .env
N8N_EDITOR_BASE_URL=http://localhost:5678
WEBHOOK_URL=http://localhost:5678
```

### Schritt 3: Credential in n8n erstellen

- Verwende die Desktop-App Credentials
- Funktioniert nur auf localhost

### Einschränkungen

- ❌ Kein Multi-Device-Zugriff
- ❌ Keine externen Webhooks
- ❌ Token-Refresh kann Probleme machen
- ⚠️ Nur für Entwicklung/Testing

---

## Google Cloud Console Konfiguration

### Für Web Application (Cloudflare/ngrok)

1. **Google Cloud Console** → https://console.cloud.google.com
2. **APIs & Services** → **Credentials**
3. **Create Credentials** → **OAuth client ID**
4. **Application type**: **Web application**
5. **Name**: `Arasul n8n OAuth`

### Authorized JavaScript Origins

```
https://n8n.yourdomain.com
```

### Authorized Redirect URIs

```
https://n8n.yourdomain.com/rest/oauth2-credential/callback
```

⚠️ **WICHTIG**: Die URL muss EXAKT übereinstimmen (kein Trailing Slash!)

### OAuth Consent Screen

1. **User Type**: External
2. **App name**: `Arasul n8n Integration`
3. **User support email**: deine-email@example.com
4. **Scopes**: Je nach benötigten APIs hinzufügen
5. **Test users**: Deine Google-Konten hinzufügen (solange App in Testing)

### 7-Tage Token-Ablauf (Testing-Modus)

⚠️ Apps im "Testing"-Status haben Tokens, die nach **7 Tagen ablaufen**!

Lösungen:
1. App veröffentlichen (Verified Publisher werden)
2. Oder: Test-User regelmäßig neu authentifizieren
3. Oder: Als Test-User hinzufügen (Tokens halten länger)

---

## Implementierungsplan

### Phase 1: Vorbereitung (30 min)

- [ ] Cloudflare Account erstellen
- [ ] Domain zu Cloudflare hinzufügen (oder Subdomain konfigurieren)
- [ ] Tunnel erstellen und Token kopieren

### Phase 2: Docker-Konfiguration (1 Stunde)

- [ ] `services/cloudflared/` Verzeichnis erstellen
- [ ] docker-compose.override.yml für cloudflared
- [ ] .env mit neuen Variablen aktualisieren
- [ ] docker-compose.yml n8n-Service anpassen

### Phase 3: Traefik-Anpassungen (30 min)

- [ ] OAuth-Callback-Route mit hoher Priorität
- [ ] CORS-Header für Google OAuth (optional)

### Phase 4: Google OAuth Setup (30 min)

- [ ] OAuth Consent Screen konfigurieren
- [ ] Web Application Credentials erstellen
- [ ] Redirect URI eintragen

### Phase 5: Testing (1 Stunde)

- [ ] Tunnel-Konnektivität prüfen
- [ ] OAuth-Flow vom Jetson testen
- [ ] OAuth-Flow vom Laptop testen
- [ ] Webhook-Empfang testen

### Phase 6: Dokumentation (30 min)

- [ ] .env.template aktualisieren
- [ ] README/Docs aktualisieren

---

## Troubleshooting

### Fehler: "redirect_uri_mismatch"

**Ursache**: URL in Google Console stimmt nicht mit n8n überein

**Lösung**:
```bash
# Prüfe die aktuelle n8n URL
docker compose exec n8n env | grep N8N_EDITOR_BASE_URL

# Muss EXAKT mit Google Console übereinstimmen
# Kein Trailing Slash, kein /n8n Prefix
```

### Fehler: "invalid_request" (device_id required)

**Ursache**: Private IP als Callback-URL

**Lösung**: Tunnel verwenden (Cloudflare oder ngrok)

### Fehler: Tunnel nicht erreichbar

```bash
# Cloudflared Logs prüfen
docker compose logs cloudflared

# Häufige Ursachen:
# - Token falsch/abgelaufen
# - Firewall blockiert ausgehende Verbindungen
# - DNS noch nicht propagiert
```

### Fehler: Token läuft nach 7 Tagen ab

**Ursache**: Google App im Testing-Modus

**Lösung**:
1. App in Google Console veröffentlichen
2. Oder: Regelmäßig neu authentifizieren
3. Oder: User als Test-User hinzufügen

### n8n zeigt alte URL

```bash
# n8n neu starten (nicht nur restart!)
docker compose up -d --force-recreate n8n

# Browser-Cache leeren
# Hard Refresh: Ctrl+Shift+R
```

---

## Sicherheitshinweise

### 1. Tunnel-Exposition minimieren

**Empfohlen**: Nur OAuth-Callback und Webhooks exponieren

```yaml
# cloudflared config.yml
ingress:
  # Nur OAuth Callback
  - hostname: n8n.yourdomain.com
    path: /rest/oauth2-credential/*
    service: http://reverse-proxy:80

  # Nur Webhooks
  - hostname: n8n.yourdomain.com
    path: /webhook/*
    service: http://reverse-proxy:80

  # Alles andere blockieren
  - service: http_status:404
```

### 2. Cloudflare Access (Optional)

Zusätzliche Authentifizierung vor dem Tunnel:

1. **Zero Trust** → **Access** → **Applications**
2. **Add Application** → **Self-hosted**
3. Regeln für Zugriff definieren (Email, IP, etc.)

### 3. n8n Authentication

Stelle sicher, dass n8n selbst geschützt ist:

```yaml
# .env
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=sicheres-passwort-hier
```

### 4. Encryption Key

```bash
# Starker Encryption Key (min. 32 Zeichen)
N8N_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

---

## Zusammenfassung

### Sofort-Lösung (ngrok, 15 min)

```bash
# 1. ngrok Token holen: https://dashboard.ngrok.com
# 2. In .env:
NGROK_AUTHTOKEN=dein-token
NGROK_DOMAIN=dein-name.ngrok-free.app
N8N_EXTERNAL_URL=https://dein-name.ngrok-free.app

# 3. Docker:
docker run -d --network arasul-net ngrok/ngrok http reverse-proxy:80 --domain=dein-name.ngrok-free.app

# 4. n8n neu starten
docker compose up -d --force-recreate n8n

# 5. Google Console: https://dein-name.ngrok-free.app/rest/oauth2-credential/callback
```

### Produktions-Lösung (Cloudflare Tunnel)

Siehe [Lösung A](#lösung-a-cloudflare-tunnel-empfohlen) für vollständige Anleitung.

### Ergebnis

Nach der Implementierung:
- ✅ OAuth2 von jedem Gerät im WLAN
- ✅ HTTPS verschlüsselte Verbindung
- ✅ Keine Ports am Jetson öffnen
- ✅ Externe Webhooks empfangen
- ✅ Dynamische URL-Konfiguration

---

## Referenzen

- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [n8n Webhook Configuration](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/)
- [ngrok Documentation](https://ngrok.com/docs)
- [Bestehender Feature Plan](./N8N_OAUTH_TUNNEL_FEATURE_PLAN.md)
