# Arasul Platform - Installation Guide

**Zielgruppe**: Non-Technical End Users
**Plattform**: NVIDIA Jetson AGX Orin Developer Kit
**Voraussetzungen**: Hardware + JetPack 6.x vorinstalliert
**Gesamtdauer**: ~40 Minuten

---

## 📋 Hardware Requirements

### Required Hardware

- **NVIDIA Jetson AGX Orin Developer Kit**
  - 64GB RAM empfohlen (32GB minimum)
  - 12-Core ARM CPU
  - NVIDIA Ampere GPU

- **NVMe SSD**
  - Mindestens 256GB (512GB empfohlen)
  - M.2 2280 Form Factor
  - PCIe 4.0 für beste Performance

- **Power Supply**
  - Original NVIDIA Jetson Power Adapter
  - 19V DC, mindestens 90W

- **Network**
  - Ethernet-Verbindung (Gigabit empfohlen)
  - WLAN optional (für mobile Setups)

- **Display** (nur für Ersteinrichtung)
  - HDMI Monitor
  - USB Tastatur + Maus

### Optional but Recommended

- **USB Stick**: Für Update-Packages (16GB+)
- **UPS**: Unterbrechungsfreie Stromversorgung
- **Cooling**: Zusätzlicher Lüfter bei Dauerbetrieb
- **Gehäuse**: Schutzhülle für Produktionsumgebung

### Minimum vs Recommended Specs

| Component | Minimum | Recommended | Production |
|-----------|---------|-------------|------------|
| RAM | 32GB | 64GB | 64GB |
| Storage | 256GB NVMe | 512GB NVMe | 1TB NVMe |
| Network | 100 Mbps | 1 Gbps | 1 Gbps + Backup |
| Power | 90W Adapter | 90W + UPS | Redundant UPS |
| Cooling | Passive | Active Fan | Industrial Cooling |

---

## 🚀 Installation Steps

### Step 1: Hardware Setup (5 Minutes)

#### 1.1 NVMe SSD Installation

**Wenn SSD bereits installiert ist → Skip zu 1.2**

1. **Jetson ausschalten und Stromkabel entfernen**
2. **Öffne das Jetson Gehäuse**
   - 4 Schrauben an der Unterseite lösen
   - Obere Abdeckung vorsichtig abnehmen
3. **NVMe SSD einsetzen**
   - M.2 Slot auf der Platine finden (neben CPU)
   - SSD im 30° Winkel einsetzen
   - Nach unten drücken bis Klick hörbar
   - Mit mitgelieferter Schraube befestigen
4. **Gehäuse wieder schließen**

**Visueller Check**: SSD sollte fest sitzen und nicht wackeln

#### 1.2 Peripherie anschließen

1. **Display**: HDMI-Kabel an Jetson und Monitor anschließen
2. **Eingabegeräte**: USB Tastatur + Maus anschließen
3. **Netzwerk**: Ethernet-Kabel anschließen
4. **Strom**: Power Adapter anschließen

**Jetson startet automatisch** (grüne LED leuchtet)

#### 1.3 Erste Inbetriebnahme

- Monitor sollte Ubuntu Desktop zeigen
- Wenn nicht: HDMI-Verbindung prüfen
- Wenn schwarzer Bildschirm: 30 Sekunden warten (erster Boot dauert länger)

---

### Step 2: JetPack Installation (20 Minutes)

**Wenn JetPack bereits installiert ist → Skip zu Step 3**

JetPack ist NVIDIA's Software Stack für Jetson Geräte. Es enthält:
- Ubuntu Betriebssystem
- NVIDIA GPU Treiber
- CUDA Toolkit
- Docker

#### 2.1 JetPack Version prüfen

```bash
# Terminal öffnen (Ctrl+Alt+T)
jetson_release

# Sollte zeigen:
# JetPack 6.x (Rev. X)
```

**Wenn JetPack 6.x bereits installiert**: Weiter zu Step 3
**Wenn JetPack <6.0 oder nicht installiert**: Weiterlesen

#### 2.2 JetPack 6.x installieren

**Option A: NVIDIA SDK Manager (empfohlen)**

1. Auf **anderem Computer** (Ubuntu/Windows/Mac):
   - Download SDK Manager: https://developer.nvidia.com/sdk-manager
   - Installiere und starte SDK Manager
   - Wähle "Jetson AGX Orin" als Target
   - Wähle "JetPack 6.0" oder neuer
   - Flash starten (dauert 20-30 Minuten)

2. Nach Flash:
   - Jetson startet automatisch neu
   - Ubuntu Setup durchlaufen (Username/Password eingeben)

**Option B: SD Card Image (einfacher)**

1. Download JetPack Image: https://developer.nvidia.com/jetson-agx-orin-developer-kit
2. Image auf SD Card flashen (mit Etcher oder dd)
3. SD Card in Jetson einlegen
4. Booten und Setup durchlaufen

#### 2.3 Nach Installation

```bash
# Verify installation
nvidia-smi

# Sollte GPU Stats zeigen:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 535.xxx    Driver Version: 535.xxx    CUDA Version: 12.2       |
# +-----------------------------------------------------------------------------+
```

**Wenn nvidia-smi fehlschlägt**: JetPack Installation wiederholen

---

### Step 3: Arasul Platform Installation (10 Minutes)

**Diese Schritte führst du im Terminal aus:**

#### 3.1 Terminal öffnen

- Drücke `Ctrl+Alt+T` (öffnet Terminal)
- Oder: Applications → Terminal

Terminal sollte anzeigen:
```
jetson@jetson-desktop:~$
```

#### 3.2 Download Arasul Platform

```bash
# In Home Directory wechseln
cd ~

# Arasul Platform von GitHub klonen
git clone https://github.com/your-org/arasul-platform.git

# In Verzeichnis wechseln
cd arasul-platform

# Verify download
ls -la
# Sollte zeigen: README.md, docker-compose.yml, arasul, services/, etc.
```

**Wenn git clone fehlschlägt**:
- Internet-Verbindung prüfen (`ping google.com`)
- Oder: Download als ZIP und extrahieren

#### 3.3 Bootstrap Script ausführbar machen

```bash
# Executable Permission setzen
sudo chmod +x arasul
# Verify
./arasul --help
# Sollte Hilfe-Text anzeigen
```

#### 3.4 Bootstrap starten

```bash
# Bootstrap ausführen (installiert ALLES automatisch)
./arasul bootstrap
```

**Was passiert jetzt?**
- ✅ System Requirements werden geprüft
- ✅ Docker + Dependencies werden installiert
- ✅ Arasul Verzeichnisse werden erstellt (`/arasul/`)
- ✅ Konfigurationsdateien werden generiert
- ✅ Docker Images werden gebaut (~5 Minuten)
- ✅ Alle Services werden gestartet
- ✅ Healthchecks werden durchgeführt
- ✅ Admin-Passwort wird generiert

**Progress anzeigen**:
```
🔍 Checking system requirements...
   ✅ JetPack 6.0 detected
   ✅ NVMe SSD detected (512GB)
   ✅ Docker installed

🐳 Building Docker images...
   [====>    ] 40% - Building dashboard-backend...

⚙️  Starting services...
   ✅ postgres-db: healthy
   ✅ minio: healthy
   ✅ dashboard-backend: healthy
   ...

✅ Bootstrap completed successfully!
```

**Dauer**: 5-10 Minuten (je nach Hardware)
**Tipp**: ☕ Zeit für einen Kaffee!

#### 3.5 Bootstrap Ergebnis

Nach erfolgreichem Bootstrap siehst du:

```
✅ Bootstrap completed successfully!

📝 Admin Credentials:
   Username: admin
   Password: Xk9mP2vQw8nL5tYr

🌐 Dashboard URL: http://arasul.local

⚠️  SAVE YOUR PASSWORD NOW - IT WON'T BE SHOWN AGAIN!

Next steps:
  1. Open browser: http://arasul.local
  2. Login with credentials above
  3. Change password (recommended)
```

**WICHTIG**:
- ✍️ Notiere das Admin-Passwort **JETZT** (z.B. in Passwort-Manager)
- 📋 Passwort wird nur einmal angezeigt
- 🔒 Ohne Passwort: System muss neu aufgesetzt werden

---

### Step 4: Erster Login (2 Minutes)

#### 4.1 Dashboard öffnen

**Option A: Direkt auf Jetson**
1. Browser öffnen (Firefox oder Chrome)
2. Adresse eingeben: `http://arasul.local`
3. Enter drücken

**Option B: Von anderem Computer im gleichen Netzwerk**
1. Browser öffnen
2. Adresse eingeben: `http://arasul.local`
3. Wenn nicht erreichbar: IP-Adresse verwenden
   ```bash
   # Auf Jetson:
   hostname -I
   # Beispiel Output: 192.168.1.100

   # Im Browser auf anderem Computer:
   http://192.168.1.100
   ```

#### 4.2 Login

Du siehst Login-Screen:

```
┌─────────────────────────────────┐
│   🚀 Arasul Platform            │
│                                  │
│   Username: [_____________]     │
│   Password: [_____________]     │
│                                  │
│   [      Login      ]           │
└─────────────────────────────────┘
```

Eingeben:
- **Username**: `admin`
- **Password**: <dein generiertes Passwort>

#### 4.3 Dashboard sollte laden

Nach Login siehst du das Arasul Dashboard:

**Oben**: System Status Karte
- Status: ✅ OK (grün)
- Uptime: 0h 5m
- Version: 1.0.0

**Links**: Services Liste
- ✅ Dashboard Backend: Healthy
- ✅ Dashboard Frontend: Healthy
- ✅ LLM Service: Healthy
- ✅ Embedding Service: Healthy
- ✅ n8n: Healthy
- ✅ PostgreSQL: Healthy
- ✅ MinIO: Healthy
- ✅ Metrics Collector: Healthy
- ✅ Self-Healing Agent: Healthy

**Rechts**: Live Metrics
- CPU: 15%
- RAM: 8.2 / 64 GB
- GPU: 0% (idle)
- Temperature: 42°C
- Disk: 85 / 512 GB

**Wenn alle Services grün sind**: ✅ **Installation erfolgreich!**

---

## 🔧 Post-Installation Setup (Optional)

### Passwort ändern (Empfohlen)

Das generierte Passwort ist zufällig und sicher, aber du solltest es trotzdem ändern:

1. Dashboard → Oben rechts → Benutzer-Icon klicken
2. "Change Password" auswählen
3. **Altes Passwort** eingeben (das generierte)
4. **Neues Passwort** eingeben:
   - Mindestens 12 Zeichen
   - Groß- und Kleinbuchstaben
   - Zahlen
   - Sonderzeichen (!@#$%^&*)
5. **Neues Passwort bestätigen**
6. "Save" klicken

**Beispiel für sicheres Passwort**: `MyArasul!2025$Secure`

### HTTPS Aktivieren (Empfohlen für externe Nutzung)

HTTP ist unverschlüsselt. Für Zugriffe von außerhalb des lokalen Netzwerks solltest du HTTPS aktivieren:

**Mit Internet (Let's Encrypt - kostenlos):**
```bash
./arasul enable-https --domain arasul.local
```

**Ohne Internet (Self-Signed Certificate):**
```bash
./arasul enable-https --self-signed
```

Nach Aktivierung:
- Dashboard ist erreichbar unter: `https://arasul.local`
- Browser zeigt Sicherheitswarnung bei Self-Signed Cert (normal)
- Klicke "Advanced" → "Proceed to arasul.local"

### Zugriff von anderen Geräten

**Im gleichen Netzwerk (LAN)**:
- Laptop/Smartphone mit gleichem WLAN/Ethernet verbinden
- Browser öffnen
- `http://arasul.local` oder `http://<jetson-ip>` eingeben
- Login mit Admin-Credentials

**Von außerhalb des Netzwerks**:
- **Option 1: Port Forwarding** (weniger sicher)
  - Router-Admin-Panel öffnen
  - Port 80/443 an Jetson IP weiterleiten
  - Zugriff via öffentliche IP
  - ⚠️ Nur mit HTTPS + starkem Passwort!

- **Option 2: VPN** (empfohlen)
  - WireGuard oder OpenVPN auf Jetson installieren
  - VPN-Verbindung von außen aufbauen
  - Zugriff via `http://arasul.local` über VPN
  - ✅ Deutlich sicherer

### Automatisches Backup einrichten (Empfohlen)

```bash
# Backup erstellen
./arasul backup

# Erstellt: /arasul/backups/backup-2025-11-13.tar.gz

# Backup auf externen Speicher kopieren
cp /arasul/backups/backup-*.tar.gz /media/usb/
```

**Backup enthält**:
- Konfigurationsdateien
- Datenbank (PostgreSQL)
- n8n Workflows
- MinIO Objekte

**Backup wiederherstellen**:
```bash
./arasul restore /path/to/backup-2025-11-13.tar.gz
```

---

## 📊 System Checks

### Ist alles OK?

Nach Installation solltest du diese Checks durchführen:

#### Check 1: Dashboard Status

**Dashboard öffnen** → System Status prüfen:

| Indicator | Expected | Bedeutung |
|-----------|----------|-----------|
| **System Status** | ✅ OK (grün) | Alle Services laufen |
| **Services** | 9/9 healthy | Keine Ausfälle |
| **CPU** | 0-30% | Normal bei idle |
| **RAM** | <50% | Ausreichend Speicher |
| **GPU** | 0-10% | Normal ohne Last |
| **Temperature** | <60°C | Kühlung funktioniert |
| **Disk** | <80% | Genug Speicherplatz |

#### Check 2: Service Health

Alle Services sollten "healthy" sein:

```bash
./arasul status

# Expected output:
# ✅ dashboard-backend: healthy (uptime: 5m)
# ✅ dashboard-frontend: healthy (uptime: 5m)
# ✅ llm-service: healthy (uptime: 5m)
# ✅ embedding-service: healthy (uptime: 5m)
# ✅ n8n: healthy (uptime: 5m)
# ✅ postgres-db: healthy (uptime: 5m)
# ✅ minio: healthy (uptime: 5m)
# ✅ metrics-collector: healthy (uptime: 5m)
# ✅ self-healing-agent: healthy (uptime: 5m)
```

#### Check 3: GPU Detection

```bash
nvidia-smi

# Sollte zeigen:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 535.xxx    Driver Version: 535.xxx    CUDA Version: 12.2       |
# |-------------------------------+----------------------+----------------------+
# | GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
# | Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
# |===============================+======================+======================|
# |   0  Orin            On   | 00000000:00:00.0 Off |                  N/A |
# | N/A   42C    P0    15W / 60W |    512MiB / 32768MiB |      0%      Default |
# +-------------------------------+----------------------+----------------------+
```

**Wenn GPU nicht erkannt**: JetPack neu installieren

#### Check 4: Network Connectivity

```bash
# Internet Check
ping -c 3 google.com

# Local Network Check
ping -c 3 arasul.local

# Docker Network Check
docker network ls | grep arasul-net
```

---

## 🆘 Troubleshooting

### Problem: "GPU not detected"

**Symptom**: Dashboard zeigt "GPU: N/A" oder nvidia-smi schlägt fehl

**Ursache**: NVIDIA Driver nicht geladen oder JetPack nicht richtig installiert

**Lösung**:

```bash
# 1. Check NVIDIA Driver
nvidia-smi

# Wenn Fehler "command not found":
# → JetPack 6.x neu installieren (siehe Step 2)

# 2. Check CUDA
nvcc --version

# Sollte zeigen: CUDA Version 12.x

# 3. Check Docker GPU Support
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi

# Sollte GPU Stats zeigen
```

**Wenn alles fehlschlägt**: System neu aufsetzen mit JetPack 6.x

---

### Problem: "Dashboard nicht erreichbar"

**Symptom**: Browser zeigt "Connection refused" oder "Page not found"

**Ursache**: Services nicht gestartet oder Netzwerk-Problem

**Lösung**:

```bash
# 1. Check Services
./arasul status

# Alle sollten "healthy" sein
# Wenn nicht:

# 2. Restart Services
./arasul restart

# Warte 2 Minuten, dann:

# 3. Check Logs
./arasul logs dashboard-backend
./arasul logs dashboard-frontend

# Suche nach Errors (rot markiert)

# 4. Check Network
ping arasul.local

# Wenn "unknown host":
# → mDNS nicht aktiv, verwende IP-Adresse
hostname -I  # zeigt IP
# Im Browser: http://<ip-adresse>
```

**Wenn immer noch nicht erreichbar**:
```bash
# Nuclear Option: Alles neu starten
docker-compose down
docker-compose up -d
```

---

### Problem: "Admin Password vergessen"

**Symptom**: Login schlägt fehl mit "Invalid credentials"

**Lösung**:

```bash
# Password zurücksetzen
./arasul reset-password

# Output:
# ✅ Password reset successful!
#
# New admin credentials:
#   Username: admin
#   Password: Rq7kW3mL9pNx2tYv
#
# ⚠️  SAVE THIS PASSWORD NOW!
```

**Neues Passwort wird generiert** → Sofort notieren!

---

### Problem: "Disk full" / "No space left"

**Symptom**: Dashboard zeigt Disk >95% (rot) oder Services crashen mit "disk full"

**Ursache**: Logs, alte Docker Images, oder große Datenmengen

**Lösung**:

```bash
# 1. Quick Cleanup (safe)
./arasul cleanup

# Löscht:
# - Alte Docker Images
# - Log-Rotations (>7 Tage)
# - Temp Files
# - Docker Build Cache

# Sollte 5-20 GB freigeben

# 2. Check Disk Usage
df -h /arasul

# Zeigt Usage pro Directory

# 3. Check große Files
du -sh /arasul/* | sort -rh | head -10

# Zeigt Top 10 größte Verzeichnisse

# 4. Manuelles Cleanup (advanced)
# Nur wenn ./arasul cleanup nicht ausreicht:

# Alte Logs löschen
sudo rm -rf /arasul/logs/archive/*

# Alte Backups löschen (behalte letztes!)
ls -lt /arasul/backups/
sudo rm /arasul/backups/backup-2024-*.tar.gz

# Docker Volumes prunen (VORSICHT: löscht ungenutzte Daten!)
docker volume prune -f
```

**Wenn <5 GB frei**: Upgrade NVMe SSD zu größerem Modell

---

### Problem: "Service keeps restarting"

**Symptom**: Dashboard zeigt Service als "unhealthy" oder "restarting" (gelb)

**Ursache**: Häufig: Nicht genug RAM, Disk voll, oder Konfigurationsfehler

**Lösung**:

```bash
# 1. Check welcher Service betroffen ist
./arasul status

# Beispiel Output:
# ✅ dashboard-backend: healthy
# ⚠️  llm-service: restarting (3 times in last minute)
# ✅ postgres-db: healthy

# 2. Check Logs des betroffenen Services
./arasul logs llm-service

# Suche nach Errors (Keywords: error, fail, exception, killed)

# 3. Häufige Ursachen + Lösungen:

# A) "Out of memory" / "Killed"
#    → Nicht genug RAM für LLM Service
#    → Lösung: Kleineres Modell wählen oder RAM upgraden
docker-compose restart llm-service

# B) "Connection refused" zu PostgreSQL
#    → Datenbank nicht bereit
#    → Lösung: Warte 30 Sekunden
./arasul restart

# C) "Permission denied" / "Cannot write"
#    → File Permissions falsch
#    → Lösung: Fix Permissions
sudo chown -R jetson:jetson /arasul/data

# D) "GPU not available"
#    → NVIDIA Runtime nicht aktiv
#    → Lösung: Restart Docker Daemon
sudo systemctl restart docker
docker-compose up -d
```

**Wenn nichts hilft**:
```bash
# Complete System Restart
sudo reboot

# Nach Reboot:
cd ~/arasul-platform
docker-compose up -d
./arasul status
```

---

### Problem: "Updates schlagen fehl"

**Symptom**: Update Upload zeigt "Signature verification failed" oder "Invalid package"

**Ursache**: Public Key stimmt nicht oder Package ist korrupt

**Lösung**:

```bash
# 1. Verify Public Key existiert
docker exec dashboard-backend cat /arasul/config/public_update_key.pem

# Sollte zeigen: "-----BEGIN PUBLIC KEY-----"

# Wenn nicht:
# → Public Key fehlt, muss deployt werden

# 2. Test Package Signature (auf Dev-Machine)
python3 scripts/sign_update_package.py --verify \
    your-update.araupdate \
    ~/.arasul/update_public_key.pem

# Sollte zeigen: "✅ Signature is VALID"

# Wenn "❌ Signature is INVALID":
# → Package neu erstellen mit korrektem Private Key

# 3. Check Package Format
file your-update.araupdate
# Sollte zeigen: "gzip compressed data"

# 4. Manual Update (Bypass Dashboard)
scp your-update.araupdate jetson@arasul.local:/arasul/updates/
ssh jetson@arasul.local
cd ~/arasul-platform
./arasul apply-update /arasul/updates/your-update.araupdate
```

---

### Problem: "n8n Workflows funktionieren nicht"

**Symptom**: Workflows starten aber zeigen Fehler, oder AI Nodes schlagen fehl

**Lösung**:

```bash
# 1. Check n8n Service
./arasul status | grep n8n
# Sollte: ✅ n8n: healthy

# 2. Check AI Services
./arasul status | grep -E "llm|embedding"
# Sollte:
# ✅ llm-service: healthy
# ✅ embedding-service: healthy

# 3. Test LLM direkt
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt": "Hello"
}'

# Sollte JSON Response mit "response": "..." zurückgeben

# 4. Check n8n Credentials
# → Dashboard öffnen
# → n8n Tab
# → Credentials prüfen (Arasul LLM API, Arasul Embeddings API)
# → Host sollte sein: llm-service:11434 / embedding-service:11435

# 5. Check n8n Logs
docker-compose logs n8n | tail -50
```

---

## 🔄 Updates

### Automatische Updates (via Dashboard)

Updates sind signiert und verifiziert. Sicher für Produktion.

**Prozess**:

1. **Dashboard öffnen** → "Updates" Tab
2. **"Check for Updates"** klicken
   - System prüft auf neue Versionen
   - Zeigt verfügbare Updates an
3. **Update-Details ansehen**
   - Version: 2.1.0
   - Components: dashboard-backend, dashboard-frontend
   - Release Notes: Bug fixes, new features
   - Size: 85 MB
4. **"Install Update"** klicken
5. **Progress beobachten**
   ```
   Verifying signature... ✅
   Extracting package... ✅
   Stopping services... ✅
   Updating components... [====>  ] 60%
   Starting services... ✅
   Running health checks... ✅
   ✅ Update completed successfully!
   ```
6. **Neustart** wenn erforderlich
   - System zeigt: "Reboot required"
   - "Reboot Now" klicken
   - System startet neu (~2 Minuten)
   - Nach Reboot: Automatic Login + Dashboard öffnen

**Dauer**: 1-5 Minuten (je nach Update-Größe)

**Safety**:
- ✅ Automatisches Rollback bei Fehlern
- ✅ Backup vor Update
- ✅ Self-Healing überwacht Update

### Manuelle Updates (via USB)

Für Offline-Systeme oder Bulk-Rollouts.

**Prozess**:

1. **Update Package auf USB kopieren**
   ```
   USB-Stick/
   └── updates/
       └── arasul-update-2.1.0.araupdate
   ```

2. **USB Stick in Jetson einstecken**
   - System erkennt automatisch `.araupdate` Files
   - Notification erscheint: "Update detected on USB"

3. **Update installieren**
   - Dashboard → "Updates" Tab
   - Zeigt: "USB Update available: 2.1.0"
   - "Install from USB" klicken
   - Progress wie bei Dashboard-Update

4. **USB Stick entfernen** nach Abschluss
   - System zeigt: "Update complete - USB can be removed"

**Dauer**: 2-10 Minuten (je nach Update-Größe)

### Update Rollback

Wenn Update Probleme verursacht:

```bash
# Automatic Rollback (passiert automatisch bei kritischen Fehlern)
# Self-Healing Engine erkennt:
# - Service Failures nach Update
# - Critical Errors
# → Lädt vorherige Docker Images
# → Startet Services neu
# → Meldet Rollback im Dashboard

# Manual Rollback
./arasul rollback

# Zeigt:
# Available rollback points:
# 1. Version 2.0.0 (2025-11-10 14:30)
# 2. Version 1.9.5 (2025-11-01 09:15)
#
# Select version to rollback to: 1

# Rollback durchgeführt
# Neustart erforderlich
sudo reboot
```

---

## 📞 Support

### Logs sammeln (für Support Anfragen)

Wenn du Probleme hast und Support kontaktieren musst:

```bash
# Automatisches Log-Collection Script
./arasul collect-logs

# Output:
# 📋 Collecting system logs...
#    ✅ Service logs
#    ✅ System metrics
#    ✅ Configuration (secrets excluded)
#    ✅ Hardware info
#    ✅ Recent errors
#
# ✅ Logs collected: /tmp/arasul-logs-2025-11-13-143045.tar.gz
#    Size: 2.5 MB

# File auf USB kopieren oder per Email senden
cp /tmp/arasul-logs-*.tar.gz /media/usb/
```

**Logs enthalten KEINE Passwörter oder Secrets!**

### System Info anzeigen

Für Quick-Diagnostics:

```bash
./arasul system-info

# Output:
# 🖥️  Arasul Platform - System Information
# ==========================================
#
# Hardware:
#   Device: NVIDIA Jetson AGX Orin
#   CPU: 12-Core ARM Cortex-A78AE @ 2.2GHz
#   RAM: 64 GB DDR5
#   GPU: NVIDIA Ampere (2048 CUDA Cores)
#   Storage: 512 GB NVMe SSD (198 GB free)
#
# Software:
#   OS: Ubuntu 22.04 LTS
#   JetPack: 6.0 (Rev. 1)
#   Docker: 24.0.7
#   Arasul Version: 1.0.0
#   Build: a3f9b21
#
# Services Status:
#   ✅ All 9 services healthy
#   ⏱️  Average uptime: 5 days 3 hours
#
# Recent Errors (last 24h):
#   None
#
# Self-Healing Events (last 7 days):
#   3 automatic recoveries
#   - 2x LLM Service restart (overload)
#   - 1x Cache cleanup (disk >90%)
```

### Community & Support Channels

- **Documentation**: https://docs.arasul.com
- **Community Forum**: https://forum.arasul.com
- **GitHub Issues**: https://github.com/your-org/arasul-platform/issues
- **Email Support**: support@arasul.com (Response: 24-48h)
- **Enterprise Support**: enterprise@arasul.com (Response: 4h SLA)

### FAQ

**Q: Kann ich mehrere Arasul Systeme parallel betreiben?**
A: Ja, jedes System ist unabhängig. Nutze verschiedene Hostnames (arasul1.local, arasul2.local).

**Q: Kann ich eigene AI Models verwenden?**
A: Ja, Dashboard → AI Services → Upload Model → .gguf File hochladen.

**Q: Wie viel Strom verbraucht das System?**
A: Idle: ~15W, Load: ~60W, Peak: ~90W. Mit UPS: +20W.

**Q: Kann ich das System headless betreiben (ohne Monitor)?**
A: Ja, nach Erstinstallation kann Monitor entfernt werden. Zugriff via Network.

**Q: Unterstützt das System RAID?**
A: Nein, aber Backups können auf externe Drives gespiegelt werden.

**Q: Kann ich Docker Container manuell bearbeiten?**
A: Nicht empfohlen. Änderungen gehen bei Updates verloren. Nutze Update-Packages.

---

## 🛡️ Sicherheitshinweise

### Best Practices

✅ **DO**:
- Admin-Passwort nach Installation sofort ändern
- HTTPS aktivieren für externe Zugriffe
- System aktuell halten (Updates installieren)
- Regelmäßige Backups erstellen (alle 3 Monate)
- UPS verwenden (Schutz vor Stromausfall)
- Firewall aktivieren (UFW auf Jetson)
- Starkes Passwort verwenden (12+ Zeichen)
- n8n Workflows auf Sicherheit prüfen (keine Hardcoded Secrets)

❌ **DON'T**:
- Admin-Passwort teilen oder in Klartext speichern
- System direkt im Internet exponieren ohne VPN/Firewall
- Docker Container manuell ändern
- `/arasul/` Dateien manuell löschen
- Jetson während Update ausschalten
- Default Passwörter verwenden
- HTTP für externe Zugriffe (nur HTTPS)
- Update-Packages von nicht-verifizierten Quellen

### Security Checklist

Nach Installation:

- [ ] Admin-Passwort geändert
- [ ] HTTPS aktiviert (falls externes Network)
- [ ] Firewall konfiguriert (`sudo ufw enable`)
- [ ] Backup erstellt
- [ ] Default SSH-Keys geändert (falls SSH aktiv)
- [ ] Unnötige Services deaktiviert
- [ ] System Updates eingespielt (`sudo apt update && sudo apt upgrade`)

### Was tun bei Sicherheitsvorfällen?

**Verdacht auf Kompromittierung**:

1. **System sofort offline nehmen**
   ```bash
   sudo systemctl stop docker
   sudo ip link set eth0 down
   ```

2. **Logs sichern**
   ```bash
   ./arasul collect-logs
   cp /tmp/arasul-logs-*.tar.gz /media/usb/
   ```

3. **Support kontaktieren**
   - security@arasul.com
   - Logs mitschicken

4. **Nach Analyse: System neu aufsetzen**
   - JetPack neu flashen
   - Arasul neu installieren
   - Neue Passwörter verwenden
   - Update-Keys rotieren

---

## 🎓 Nächste Schritte

Nach erfolgreicher Installation kannst du:

### 1. n8n Workflows erkunden

n8n ist ein Workflow-Automation-Tool (ähnlich wie Zapier/IFTTT):

- **Dashboard öffnen** → n8n Tab
- **Login** mit Admin-Credentials
- **Beispiel-Workflows** sind vorinstalliert:
  - "AI Chat Bot" - Chatbot mit LLM
  - "Document Analysis" - PDF Analyse
  - "Email Summary" - Email Zusammenfassungen
- **Eigene Workflows erstellen**:
  - Drag & Drop Interface
  - Arasul LLM & Embeddings Nodes verfügbar
  - Trigger: Webhook, Schedule, File Watch
  - Actions: AI Generation, Database, HTTP Requests

**Tutorial**: https://docs.arasul.com/n8n-workflows

### 2. LLM Chat testen

Teste den lokalen LLM Service:

- **Dashboard** → "AI Services" Tab
- **"Test LLM"** klicken
- **Prompt eingeben**: "Explain quantum computing in simple terms"
- **Send** klicken
- **Antwort** kommt in 2-5 Sekunden
- **Modell wechseln**: Dropdown → Verschiedene Models verfügbar

**Performance**:
- Kleine Models (<7B): <2s Response
- Mittel Models (13B): 3-5s Response
- Große Models (70B): 10-15s Response

### 3. System Monitoring

Das Dashboard zeigt live Metriken:

- **CPU**: Aktuelle Last + History (24h Chart)
- **RAM**: Usage + Free Memory
- **GPU**: Utilization + Memory + Temperature
- **Disk**: Used / Free Space
- **Network**: Incoming / Outgoing Traffic
- **Self-Healing Events**: Automatische Recoveries

**Alerts**:
- 🟢 Grün: Alles OK
- 🟡 Gelb: Warning (>80% Resource Usage)
- 🔴 Rot: Critical (>95% Resource Usage)

**Self-Healing in Action**:
- Überlasteter Service wird automatisch neugestartet
- Disk-Cleanup bei >90% Usage
- GPU Reset bei Hang
- Logs werden rotiert

### 4. Eigene AI Models hochladen

Du kannst eigene GGUF Models verwenden:

- **Dashboard** → AI Services → Models Tab
- **"Upload Model"** klicken
- **GGUF File auswählen** (z.B. von Hugging Face)
- **Upload** (kann 5-30 Minuten dauern je nach Größe)
- **Model aktivieren** → Dropdown in LLM Chat

**Empfohlene Models**:
- **Llama 2 7B**: Gute Balance (Speed/Quality)
- **Mistral 7B**: Sehr schnell, hohe Qualität
- **CodeLlama 13B**: Für Code Generation
- **Llama 2 70B**: Beste Qualität (benötigt 64GB RAM)

**Model Quellen**:
- Hugging Face: https://huggingface.co/models?library=gguf
- TheBloke: https://huggingface.co/TheBloke

---

## 📚 Weitere Ressourcen

### Dokumentation

- **Quick Start Guide**: Dieser Guide
- **Developer Docs**: https://docs.arasul.com/developer
- **API Reference**: https://docs.arasul.com/api
- **n8n Integration**: https://docs.arasul.com/n8n
- **Update System**: https://docs.arasul.com/updates

### Video Tutorials

- Installation Walkthrough (YouTube)
- n8n Workflow Examples (YouTube)
- AI Model Management (YouTube)
- Troubleshooting Common Issues (YouTube)

### Community

- **Discord**: https://discord.gg/arasul
- **Reddit**: r/ArasulPlatform
- **Twitter**: @ArasulPlatform

---

**Viel Erfolg mit Arasul Platform! 🚀**

---

**Version**: 1.0
**Last Updated**: 2025-11-13
**Feedback**: docs@arasul.com
