# Deployment-Anleitung: Neues Jetson-Geraet einrichten

Schritt-fuer-Schritt-Anleitung zur Erstinstallation der Arasul Platform auf einem neuen NVIDIA Jetson-Geraet.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Methode 1: Interaktives Setup](#2-methode-1-interaktives-setup)
3. [Methode 2: Factory-Image](#3-methode-2-factory-image)
4. [Methode 3: Non-Interactive](#4-methode-3-non-interactive)
5. [Nach dem Setup](#5-nach-dem-setup)
6. [Fehlerbehebung](#6-fehlerbehebung)

---

## 1. Voraussetzungen

### Hardware

| Geraet               | RAM    | Standard KI-Modell | Status            |
| -------------------- | ------ | ------------------ | ----------------- |
| Jetson Thor 128GB    | 128 GB | gemma4:31b-q4      | Voll unterstuetzt |
| Jetson Thor 64GB     | 64 GB  | gemma4:31b-q4      | Voll unterstuetzt |
| Jetson AGX Orin 64GB | 64 GB  | gemma4:26b-q4      | Voll unterstuetzt |
| Jetson AGX Orin 32GB | 32 GB  | gemma4:e4b-q4      | Voll unterstuetzt |

Minimale Hardware-Anforderungen:

- **GPU**: NVIDIA GPU mit installierten Treibern (nvidia-smi muss funktionieren)
- **RAM**: Mindestens 16 GB (32 GB+ empfohlen)
- **Speicherplatz**: Mindestens 64 GB frei (128 GB+ empfohlen)

### Software

| Komponente               | Mindestversion | Pruefung                         |
| ------------------------ | -------------- | -------------------------------- |
| JetPack                  | 6.0+           | `dpkg -l \| grep nvidia-jetpack` |
| Docker                   | 24.0+          | `docker --version`               |
| Docker Compose           | V2             | `docker compose version`         |
| NVIDIA Container Runtime | -              | `docker info \| grep nvidia`     |
| Git                      | 2.x            | `git --version`                  |

### JetPack installieren (falls noetig)

JetPack wird ueber den NVIDIA SDK Manager auf einem Host-Rechner installiert:

- Anleitung: https://developer.nvidia.com/sdk-manager
- JetPack beinhaltet CUDA, cuDNN, TensorRT und Docker mit NVIDIA Runtime

### Docker-Berechtigungen

Der Benutzer muss Docker ohne `sudo` ausfuehren koennen:

```bash
sudo usermod -aG docker $USER
# Danach neu einloggen (oder: newgrp docker)
```

---

## 2. Methode 1: Interaktives Setup

Die empfohlene Methode fuer einzelne Geraete. Erfordert Internetzugang.

### Schritt 1: Repository klonen

```bash
git clone <repository-url> ~/arasul-platform
cd ~/arasul-platform
```

### Schritt 2: Interaktives Setup ausfuehren

```bash
./scripts/interactive_setup.sh
```

Das Setup durchlaeuft 5 Schritte:

1. **Hardware-Erkennung** -- Erkennt automatisch Jetson-Modell, RAM, CPU-Kerne, CUDA-Architektur und waehlt das passende Profil (z.B. `agx_orin_64gb`, `thor_128gb`)
2. **Administrator-Konto** -- Benutzername, Passwort (mind. 12 Zeichen, Gross-/Kleinbuchstaben, Ziffer) und E-Mail
3. **Netzwerk** -- Hostname festlegen (Standard: `arasul`, erreichbar unter `arasul.local`)
4. **KI-Modell** -- Aus einer geraetespezifischen Auswahl empfohlener Modelle waehlen
5. **Zusammenfassung** -- Uebersicht und Bestaetigung

Am Ende wird eine `.env`-Datei mit allen Konfigurationswerten und automatisch generierten Secrets geschrieben.

### Schritt 3: Bootstrap starten

```bash
./arasul bootstrap
```

Der Bootstrap-Prozess fuehrt 15 Schritte aus:

1. Hardware-Validierung (GPU, RAM, Speicherplatz)
2. Software-Voraussetzungen pruefen (Docker, Compose, NVIDIA Runtime)
3. `.env` laden (vom Setup generiert)
4. Jetson-Hardwareprofil anwenden
5. Konfiguration validieren
6. Verzeichnisstruktur erstellen (`data/`, `logs/`, `config/`, `cache/`)
7. Secrets und Traefik-Auth konfigurieren
8. TLS-Zertifikate generieren (Let's Encrypt oder Self-Signed)
9. Docker-Images herunterladen und bauen
10. Datenbank initialisieren (PostgreSQL mit allen Migrationen)
11. Services in korrekter Reihenfolge starten (7 Schichten)
12. Auf Service-Stabilisierung warten
13. MinIO-Buckets erstellen
14. Administrator-Benutzer anlegen
15. Smoke Tests und Ergebnisbericht

Geschaetzte Dauer: **15-30 Minuten** (abhaengig von Internetgeschwindigkeit und Hardware).

Nach erfolgreichem Bootstrap wird das Klartext-Passwort automatisch aus der `.env` entfernt.

---

## 3. Methode 2: Factory-Image

Ideal fuer Offline-Installation oder Massen-Rollout. Keine Internetverbindung am Zielgeraet noetig.

### Auf dem Quellgeraet: Factory-Image erstellen

Voraussetzung: Eine laufende Arasul-Installation.

```bash
# Ohne KI-Modelle (nur Docker-Images + Code)
./scripts/deploy/create-factory-image.sh

# Mit KI-Modellen (groesseres Archiv, aber sofort einsatzbereit)
./scripts/deploy/create-factory-image.sh --include-models

# Optionale Parameter
./scripts/deploy/create-factory-image.sh \
  --output=/pfad/zum/ausgabeverzeichnis \
  --version=1.0.0 \
  --include-models
```

Der Prozess:

1. Baut alle Docker-Images
2. Exportiert Images als `images.tar.gz`
3. Kopiert Projektdateien (ohne `.git`, `node_modules`, Daten)
4. Bettet `factory-install.sh` ein
5. Exportiert optional Ollama-Modelle
6. Erstellt Manifest mit Versionen und Pruefsummen
7. Packt alles in `arasul-factory-<version>.tar.gz`

Ausgabe: `deployment/arasul-factory-<version>.tar.gz`

### Archiv auf USB-Stick kopieren

```bash
cp deployment/arasul-factory-*.tar.gz /media/usb-stick/
```

### Auf dem Zielgeraet: Factory-Installation

```bash
# Archiv entpacken
tar xzf arasul-factory-*.tar.gz
cd arasul-factory-*/

# Interaktive Installation starten
./factory-install.sh
```

Die Factory-Installation fuehrt 5 Schritte aus:

1. **Docker-Images laden** -- Aus `images.tar.gz` (offline, kein Internet noetig)
2. **KI-Modelle wiederherstellen** -- Falls `ollama-models/` im Archiv enthalten
3. **Projekt einrichten** -- Dateien in `project/` vorbereiten, Berechtigungen setzen
4. **Konfiguration** -- Interaktives Setup (Administrator, Hostname, Modellwahl)
5. **Bootstrap** -- Services starten (ueberspringt Pull/Build, da Images bereits geladen)

Geschaetzte Dauer: **5-10 Minuten** (kein Internet noetig).

---

## 4. Methode 3: Non-Interactive

Fuer automatisierte Deployments, CI/CD-Pipelines oder Massen-Rollout.

### Variante A: Setup + Bootstrap

```bash
cd ~/arasul-platform

# Mindestens ADMIN_PASSWORD muss gesetzt sein
ADMIN_PASSWORD="SicheresPasswort123" \
  ./scripts/interactive_setup.sh --non-interactive

./arasul bootstrap
```

### Variante B: Factory-Image non-interactive

```bash
ADMIN_PASSWORD="SicheresPasswort123" \
  ./factory-install.sh --non-interactive
```

### Optionale Umgebungsvariablen

| Variable         | Standard             | Beschreibung                                            |
| ---------------- | -------------------- | ------------------------------------------------------- |
| `ADMIN_PASSWORD` | **(Pflicht)**        | Administrator-Passwort (mind. 8 Zeichen, A-Z, a-z, 0-9) |
| `ADMIN_USERNAME` | `admin`              | Administrator-Benutzername                              |
| `ADMIN_EMAIL`    | `admin@arasul.local` | Administrator-E-Mail                                    |
| `LLM_MODEL`      | geraeteabhaengig     | KI-Modell (z.B. `gemma4:26b-q4`)                        |
| `HOSTNAME`       | `arasul`             | Netzwerk-Hostname                                       |

### Passwort-Anforderungen

- Mindestens 8 Zeichen
- Mindestens ein Grossbuchstabe (A-Z)
- Mindestens ein Kleinbuchstabe (a-z)
- Mindestens eine Ziffer (0-9)

### Bootstrap-Flags

```bash
./arasul bootstrap --skip-pull    # Docker-Pull ueberspringen (fuer Offline)
./arasul bootstrap --skip-build   # Docker-Build ueberspringen (vorgebaute Images)
./arasul bootstrap --force-setup  # Setup erneut ausfuehren (auch wenn .env existiert)
```

---

## 5. Nach dem Setup

### Zugriff auf das Dashboard

Nach erfolgreichem Bootstrap zeigt das System die Zugangsdaten an:

```
Dashboard:    https://arasul.local
n8n:          https://arasul.local/n8n
```

> **Hinweis**: Bei Self-Signed-Zertifikaten zeigt der Browser eine Sicherheitswarnung. Das ist normal und kann uebergangen werden.

### Erreichbarkeit pruefen

```bash
# Alle Services anzeigen
docker compose ps

# Health-Check
curl -k https://arasul.local/api/health

# Einzelne Services pruefen
docker compose exec -T postgres-db pg_isready -U arasul
docker compose exec -T llm-service curl -s http://localhost:11434/api/tags
docker compose exec -T embedding-service curl -s http://localhost:11435/health
```

### KI-Modell herunterladen (falls nicht im Factory-Image)

Beim ersten Start muss das KI-Modell heruntergeladen werden:

```bash
# Modell herunterladen (im .env konfiguriertes Modell)
docker exec llm-service ollama pull $(grep LLM_MODEL .env | cut -d= -f2)

# Oder manuell ein anderes Modell
docker exec llm-service ollama pull llama3.1:8b

# Modell-Empfehlungen fuer das Geraet anzeigen
./scripts/setup/detect-jetson.sh recommend
```

### Verwaltungsbefehle

```bash
./arasul status     # Status aller Services
./arasul logs       # Logs anzeigen
./arasul stop       # Alle Services stoppen
./arasul start      # Alle Services starten
./arasul restart    # Alle Services neustarten
```

### Weitere Dokumentation

| Thema                         | Dokument                                             |
| ----------------------------- | ---------------------------------------------------- |
| Architektur und Services      | [ARCHITECTURE.md](ARCHITECTURE.md)                   |
| Alle Umgebungsvariablen       | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| Backup-System                 | [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)                 |
| Administration (ausfuehrlich) | [ADMIN_HANDBUCH.md](ADMIN_HANDBUCH.md)               |
| Fehlerbehebung (ausfuehrlich) | [TROUBLESHOOTING.md](TROUBLESHOOTING.md)             |

---

## 6. Fehlerbehebung

### Docker nicht gefunden

```
Docker ist nicht installiert.
```

**Loesung**: Docker wird mit JetPack installiert. Sicherstellen, dass JetPack 6.0+ korrekt installiert ist. Alternativ:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Neu einloggen
```

### NVIDIA Container Runtime fehlt

```
NVIDIA Container Runtime not available.
```

**Loesung**: NVIDIA Container Toolkit installieren:

```bash
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### GPU nicht erkannt

```
nvidia-smi not found. NVIDIA drivers may not be installed.
```

**Loesung**: NVIDIA-Treiber pruefen:

```bash
nvidia-smi                  # Muss GPU-Informationen anzeigen
cat /etc/nv_tegra_release   # Jetson-spezifische Version
```

Falls `nvidia-smi` nichts anzeigt: JetPack neu installieren ueber SDK Manager.

### Zu wenig Speicherplatz

```
Insufficient disk space: XXG. Minimum required: 64GB
```

**Loesung**:

```bash
# Speicherplatz pruefen
df -h

# Docker-Cache aufraeumen
docker system prune -a

# Alte Logs entfernen
sudo journalctl --vacuum-size=500M
```

### Hardware wird nicht erkannt

Falls `detect-jetson.sh` das Geraet nicht erkennt, die 5-stufige Erkennung manuell pruefen:

```bash
# Stufe 1: Device-Tree Model
cat /proc/device-tree/model

# Stufe 2: Compatible String
cat /proc/device-tree/compatible

# Stufe 3: Tegra Chip ID
cat /sys/module/tegra_fuse/parameters/tegra_chip_id

# Stufe 4: GPU-Name
nvidia-smi --query-gpu=name --format=csv,noheader

# Stufe 5: RAM-basiert
grep MemTotal /proc/meminfo
```

Falls nichts davon funktioniert, wird ein generisches Profil verwendet.

### Setup bricht ab

Falls das interaktive Setup mit Ctrl+C abgebrochen wird, werden teilweise geschriebene Dateien automatisch aufgeraeumt. Eine bestehende `.env` wird aus dem Backup wiederhergestellt.

Um das Setup erneut zu starten:

```bash
./scripts/interactive_setup.sh
```

### Services starten nicht

```bash
# Logs eines bestimmten Service pruefen
docker compose logs <service-name>

# Haeufige Services: postgres-db, llm-service, dashboard-backend,
#   dashboard-frontend, embedding-service, reverse-proxy

# Einzelnen Service neustarten
docker compose restart <service-name>

# Service komplett neu bauen
docker compose up -d --build <service-name>
```

### LLM-Service antwortet nicht

```bash
# Status pruefen
docker compose logs llm-service

# Ollama-Timeout anpassen (in .env)
# Thor: OLLAMA_STARTUP_TIMEOUT=240
# Orin 64GB: OLLAMA_STARTUP_TIMEOUT=180
# Standard: OLLAMA_STARTUP_TIMEOUT=120

# Modell manuell laden
docker exec llm-service ollama pull mistral:7b
```

### Dashboard nicht erreichbar

```bash
# Reverse-Proxy pruefen
docker compose logs reverse-proxy

# Backend pruefen
curl http://localhost:3001/api/health

# Frontend pruefen
docker compose logs dashboard-frontend

# Alle Services neustarten
docker compose down && docker compose up -d
```

### Bootstrap-Fehlerreport

Bei Fehlern waehrend des Bootstrap wird ein detaillierter JSON-Report geschrieben:

```bash
cat /tmp/arasul_bootstrap_errors.json
```

Der Report enthaelt:

- Zeitstempel und fehlgeschlagene Phase
- Alle aufgetretenen Fehler
- Systeminfos (Plattform, Architektur, Kernel)
- Loesungsvorschlaege
