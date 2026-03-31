# Fernwartung / Remote Maintenance

> Dokumentation fuer den Fernzugriff auf ein ausgeliefertes Arasul-Geraet.
> Nur in Absprache mit dem Kunden durchzufuehren.

---

## Voraussetzungen

- Kunde hat Fernwartung zugestimmt
- Jetson hat Internetverbindung
- SSH-Zugang ist eingerichtet (Port 2222)

---

## Option 1: Tailscale VPN (empfohlen)

Tailscale ist ein WireGuard-basiertes Mesh-VPN, das ohne offene Ports funktioniert.
Es ist in die Arasul-Plattform integriert und kann ueber das Dashboard konfiguriert werden.

### Vorteile

- **Kein Port-Forwarding noetig:** Funktioniert hinter NAT und Firewalls
- **Zero-Config Mesh-VPN:** Geraete verbinden sich automatisch
- **Ende-zu-Ende verschluesselt:** WireGuard-basiert
- **SSH integriert:** Tailscale SSH ohne separate Konfiguration
- **Dashboard-Integration:** Status und Verwaltung direkt in der Web-Oberflaeche

### Einrichtung

Tailscale wird waehrend des Setup-Wizards konfiguriert (`scripts/interactive_setup.sh`).
Nachtraeglich kann es manuell eingerichtet werden:

```bash
# Installieren:
curl -fsSL https://tailscale.com/install.sh | sh

# Verbinden (Auth-Key von https://login.tailscale.com/admin/settings/keys):
sudo tailscale up --authkey tskey-auth-... --ssh --accept-routes

# Status pruefen:
tailscale status
```

### Zugriff nach Einrichtung

```bash
# Dashboard:
http://<tailscale-ip>

# SSH:
ssh arasul@<tailscale-ip>

# Tailscale SSH (ohne SSH-Keys):
ssh arasul@<hostname>
```

### Dashboard-Verwaltung

Im Dashboard unter **Einstellungen > Fernzugriff**:

- Verbindungsstatus und IP anzeigen
- Verbundene Geraete im Tailnet sehen
- Auth-Key eingeben und verbinden/trennen

### Monitoring

- Tailscale-Status wird alle 30s im Dashboard aktualisiert
- Self-Healing-Agent ueberwacht die VPN-Verbindung
- Verbindungsabbrueche werden im Event-Log protokolliert

---

## Option 2: SSH-Reverse-Tunnel

Kein offener Port beim Kunden noetig. Der Jetson baut eine ausgehende Verbindung auf.

### Auf dem Jetson (Kundenseite)

```bash
# Reverse-Tunnel zu einem Support-Server aufbauen:
ssh -R 0:localhost:2222 support-server.example.com -N -f

# Oder mit autossh fuer stabile Verbindung:
autossh -M 0 -R 0:localhost:2222 support-server.example.com -N -f \
  -o "ServerAliveInterval 30" \
  -o "ServerAliveCountMax 3"
```

### Auf dem Support-Server

```bash
# Verbindung zum Kunden-Jetson:
ssh -p <zugewiesener-port> arasul@localhost
```

---

## Option 3: Cloudflare Tunnel

Wird primaer fuer Google OAuth und externe Webhooks verwendet (erfordert oeffentliche HTTPS-URL).
Fuer reinen Fernzugriff ist Tailscale (Option 1) besser geeignet.

### Einrichtung

1. Cloudflare-Konto mit Domain erforderlich
2. Tunnel-Token in `.env` setzen:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=<token>
   ```
3. Tunnel starten:
   ```bash
   docker compose -f docker-compose.yml \
     -f services/cloudflared/docker-compose.override.yml \
     up -d cloudflared
   ```

### Zugriff

- Web: `https://<tunnel-domain>`
- SSH: Via Cloudflare Access konfigurieren

---

## Option 4: VPN (WireGuard manuell)

Fuer Kunden mit eigener VPN-Infrastruktur. Tailscale (Option 1) nutzt WireGuard
automatisch - diese Option ist nur fuer manuelle Konfiguration.

### WireGuard installieren

```bash
sudo apt install wireguard

# Schluessel generieren:
wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
chmod 600 /etc/wireguard/private.key
```

### Konfiguration (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
PrivateKey = <private-key>
Address = 10.0.0.2/24

[Peer]
PublicKey = <support-server-public-key>
Endpoint = vpn.example.com:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
```

### Verbindung aktivieren

```bash
sudo wg-quick up wg0
# Automatisch bei Neustart:
sudo systemctl enable wg-quick@wg0
```

---

## Support-Log Export

Vor der Fernwartung Support-Logs exportieren:

```bash
./scripts/util/export-support-logs.sh
```

Die erzeugte Datei (`data/support-logs-*.tar.gz`) kann per E-Mail oder Dateitransfer
an den Support gesendet werden. Sie enthaelt keine Passwoerter oder persoenlichen Daten.

---

## Heartbeat-Monitoring (optional)

Falls der Kunde zustimmt, kann ein Heartbeat-Endpoint fuer Remote-Monitoring aktiviert werden:

### Endpoint

```
GET /api/system/heartbeat
```

Antwortet ohne Authentifizierung mit:

```json
{
  "status": "ok",
  "uptime": 123456,
  "version": "1.0.0",
  "timestamp": "2026-02-17T10:00:00.000Z"
}
```

### Monitoring-Abfrage

```bash
# Einfacher Health-Check:
curl -sf http://<jetson-ip>/api/system/heartbeat | jq .status

# Monitoring-Script (z.B. alle 5 Minuten):
*/5 * * * * curl -sf http://<jetson-ip>/api/system/heartbeat || echo "ALERT: Jetson offline"
```

---

## Sicherheitshinweise

- Fernzugriff nur mit ausdruecklicher Genehmigung des Kunden
- Alle Sitzungen werden im Audit-Log protokolliert
- Tunnel nach Wartung beenden / deaktivieren
- Keine Kundendaten herunterladen oder speichern
- SSH-Keys nach Wartung rotieren wenn noetig
