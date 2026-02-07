# Google OAuth einrichten (für Kunden)

Diese Anleitung erklärt, wie Sie Google-Dienste (Gmail, Google Sheets, Google Drive, etc.) mit n8n auf Ihrem Arasul Jetson verbinden.

---

## Schnellstart (2 Minuten)

### Von einem Laptop/PC im gleichen Netzwerk:

**Linux/Mac:**
```bash
# 1. Skript herunterladen (einmalig)
scp arasul@JETSON_IP:/home/arasul/arasul/scripts/oauth-tunnel.sh .

# 2. Tunnel starten
./oauth-tunnel.sh JETSON_IP
```

**Windows (PowerShell):**
```powershell
# 1. Skript herunterladen (einmalig)
scp arasul@JETSON_IP:/home/arasul/arasul/scripts/oauth-tunnel.ps1 .

# 2. Tunnel starten
.\oauth-tunnel.ps1 -JetsonIP JETSON_IP
```

Ersetzen Sie `JETSON_IP` mit der IP-Adresse Ihres Jetsons (z.B. `192.168.0.112`).

---

## Schritt-für-Schritt Anleitung

### 1. Jetson IP-Adresse finden

Die IP-Adresse wird beim Start des Jetsons angezeigt, oder:
- Öffnen Sie das Dashboard: `http://JETSON_IP`
- Schauen Sie unter "System Info"

### 2. SSH-Tunnel starten

Der Tunnel leitet `localhost` auf Ihrem Laptop zum Jetson weiter. Dadurch funktioniert Google OAuth.

**Option A: Mit Skript (empfohlen)**

Führen Sie das Tunnel-Skript aus (siehe Schnellstart oben).

**Option B: Manuell**

```bash
ssh -L 5678:localhost:5678 arasul@JETSON_IP
```

Lassen Sie dieses Terminal offen.

### 3. n8n im Browser öffnen

Öffnen Sie in Ihrem Browser:

```
http://localhost:5678/n8n
```

### 4. Google Credential erstellen

1. Klicken Sie auf **Credentials** (linke Seitenleiste)
2. Klicken Sie auf **Add Credential**
3. Suchen Sie nach **Google OAuth2 API**
4. Klicken Sie auf **Connect my account**
5. Melden Sie sich mit Ihrem Google-Konto an
6. Erlauben Sie den Zugriff
7. Fertig! Das Credential ist gespeichert.

### 5. Tunnel beenden

Nach dem OAuth-Setup können Sie den Tunnel beenden:
- Schließen Sie das Terminal, oder
- Drücken Sie `Ctrl+C`

Die Google-Verbindung bleibt auf dem Jetson gespeichert.

---

## Häufige Fragen

### Warum brauche ich einen Tunnel?

Google erlaubt OAuth-Callbacks nur an:
- `https://` URLs (öffentlich erreichbar)
- `http://localhost` (lokale Ausnahme)

Da Ihr Jetson eine private IP hat (z.B. 192.168.x.x), müssen wir `localhost` verwenden. Der SSH-Tunnel macht genau das möglich.

### Muss ich das jedes Mal machen?

Nein! Sie brauchen den Tunnel nur einmalig zum Einrichten der Google-Verbindung. Danach bleibt das Token auf dem Jetson gespeichert.

### Kann ich n8n auch ohne Tunnel nutzen?

Ja! Für die normale Nutzung von n8n (Workflows erstellen, ausführen) brauchen Sie keinen Tunnel. Öffnen Sie einfach:

```
http://JETSON_IP/n8n
```

Der Tunnel ist nur für das initiale OAuth-Setup nötig.

### Was ist das Standard-Passwort?

SSH-Benutzer: `arasul`
SSH-Passwort: (wurde bei der Ersteinrichtung festgelegt)

### Der Tunnel funktioniert nicht

1. **Prüfen Sie die IP-Adresse**: Können Sie den Jetson pingen?
   ```bash
   ping JETSON_IP
   ```

2. **Prüfen Sie SSH**: Ist SSH auf dem Jetson aktiviert?
   ```bash
   ssh arasul@JETSON_IP
   ```

3. **Port bereits belegt**: Läuft auf Ihrem Laptop bereits etwas auf Port 5678?
   - Verwenden Sie einen anderen Port: `ssh -L 15678:localhost:5678 arasul@JETSON_IP`
   - Öffnen Sie dann: `http://localhost:15678/n8n`

---

## Unterstützte Google-Dienste

Nach dem OAuth-Setup können Sie folgende Dienste in n8n nutzen:

- Gmail
- Google Sheets
- Google Drive
- Google Calendar
- Google Docs
- Google Contacts
- Google Tasks
- YouTube
- Google Analytics
- Google Ads
- und weitere...

---

## Technischer Hintergrund

```
┌─────────────────────────────────────────────────────────┐
│  Ihr Laptop                                             │
│                                                         │
│  Browser → http://localhost:5678/n8n                    │
│                 │                                       │
│                 │ SSH-Tunnel (Port 5678)                │
│                 ▼                                       │
└─────────────────│───────────────────────────────────────┘
                  │
                  │ (verschlüsselt)
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Arasul Jetson                                          │
│                                                         │
│  localhost:5678 → n8n                                   │
│       │                                                 │
│       ▼                                                 │
│  Google OAuth Callback → http://localhost:5678/callback │
│       │                                                 │
│       ▼                                                 │
│  Token wird verschlüsselt gespeichert ✓                 │
└─────────────────────────────────────────────────────────┘
```

---

## Support

Bei Fragen wenden Sie sich an Ihren Arasul-Ansprechpartner.
