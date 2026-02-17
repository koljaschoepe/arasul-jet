# Fernwartung / Remote Maintenance

> Dokumentation fuer den Fernzugriff auf ein ausgeliefertes Arasul-Geraet.
> Nur in Absprache mit dem Kunden durchzufuehren.

---

## Voraussetzungen

- Kunde hat Fernwartung zugestimmt
- Jetson hat Internetverbindung
- SSH-Zugang ist eingerichtet (Port 2222)

---

## Option 1: SSH-Reverse-Tunnel (empfohlen)

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

## Option 2: Cloudflare Tunnel

Fuer dauerhafte Fernwartung ohne eigenen Server.

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

## Option 3: VPN (WireGuard)

Fuer Kunden mit VPN-Infrastruktur.

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
./scripts/export-support-logs.sh
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
