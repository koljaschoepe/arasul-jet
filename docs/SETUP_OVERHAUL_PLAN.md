# Setup Overhaul Plan - Production-Ready One-Click Install

> **Status**: Phase 1-7 ✅ ABGESCHLOSSEN
> **Erstellt**: 2026-03-09
> **Ziel**: `git clone` → `./arasul setup` → `./arasul bootstrap` → Fertig.
> **Target-Hardware**: Jetson AGX Orin 64GB + Jetson Thor 128GB
> **Sprache**: Deutsch (Terminal-UI)

---

## Inhaltsverzeichnis

1. [Kontext & Ist-Zustand](#1-kontext--ist-zustand)
2. [Phase 1: Thor-Support & Hardware-Erkennung](#phase-1-thor-support--hardware-erkennung)
3. [Phase 2: Interactive Setup Script](#phase-2-interactive-setup-script)
4. [Phase 3: Bootstrap Refactoring](#phase-3-bootstrap-refactoring)
5. [Phase 4: Bug-Fixes & Hardening](#phase-4-bug-fixes--hardening)
6. [Phase 5: Factory-Image Workflow](#phase-5-factory-image-workflow)
7. [Phase 6: Validierung & Tests](#phase-6-validierung--tests)
8. [Phase 7: Dokumentation & Memory](#phase-7-dokumentation--memory)
9. [Edge Cases & Fehlerbehandlung](#edge-cases--fehlerbehandlung)
10. [Checkliste pro Phase](#checkliste-pro-phase)

---

## 1. Kontext & Ist-Zustand

### Was existiert

| Komponente         | Datei                                         | Status                             |
| ------------------ | --------------------------------------------- | ---------------------------------- |
| Bootstrap-Script   | `arasul` (1254 Zeilen)                        | DEV-MODE, feste Credentials        |
| Hardware-Erkennung | `scripts/setup/detect-jetson.sh` (712 Zeilen) | Kein Thor-Support                  |
| Provisioning       | `scripts/setup/preconfigure.sh` (864 Zeilen)  | Produktionsreif, aber separat      |
| Interactive Setup  | `scripts/interactive_setup.sh`                | **EXISTIERT NICHT**                |
| Factory Image      | `scripts/deploy/create-factory-image.sh`      | Existiert, kein interaktives Setup |
| Deployment-Check   | `scripts/deploy/verify-deployment.sh`         | Gut, aber nicht integriert         |

### Kritische Bugs (werden in Phase 4 gefixt)

| #   | Bug                                                                                          | Datei:Zeile                         |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| B1  | MinIO Init-Script Pfad falsch (`./scripts/init_minio_buckets.sh` statt `./scripts/util/...`) | `arasul:539`                        |
| B2  | `interactive_setup.sh` referenziert aber nicht vorhanden                                     | `arasul:1049-1054`                  |
| B3  | DEV-MODE feste Credentials `arasul123` in Production Bootstrap                               | `arasul:484,599,982`                |
| B4  | `.env.bak` Plaintext-Passwort Leak                                                           | `scripts/setup/setup_dev.sh:64`     |
| B5  | Ollama-Timeout 60s zu kurz fuer grosse Modelle                                               | `scripts/setup/preconfigure.sh:528` |
| B6  | `validate_config.sh` / `validate_dependencies.sh` Pfad ohne `scripts/validate/` Prefix       | `arasul:923,930`                    |

---

## Phase 1: Thor-Support & Hardware-Erkennung

> **Datei**: `scripts/setup/detect-jetson.sh`
> **Geschaetzter Aufwand**: ~80 Zeilen Aenderungen
> **Abhaengigkeiten**: Keine (unabhaengig ausfuehrbar)

### 1.1 Erweiterte Geraete-Erkennung

Die Funktion `detect_jetson_model()` (Zeile 24-43) muss eine robuste Erkennungs-Hierarchie implementieren, die den Thor auch ohne bekannte Chip-ID zuverlaessig erkennt.

**Erkennungs-Hierarchie (5 Stufen)**:

```
Stufe 1: /proc/device-tree/model (zuverlaessigste Quelle)
         → String-Match: *"Thor"*, *"AGX Orin"*, *"Orin NX"* etc.

Stufe 2: /proc/device-tree/compatible (Kernel Device-Tree)
         → Enthaelt z.B. "nvidia,p3737-0000" oder "nvidia,thor"

Stufe 3: /sys/module/tegra_fuse/parameters/tegra_chip_id
         → Bekannt: 35=Orin, 33=Xavier, 25=TX2, 24=TX1, 21=Nano
         → Neu: 36 oder 37 = Thor (vorlaeufig, mit Fallback)

Stufe 4: nvidia-smi GPU-Name
         → "Orin", "GH100", "Blackwell" etc.

Stufe 5: RAM-basierter Fallback
         → >=120GB + Jetson-Marker → Thor
         → >=60GB + Jetson-Marker → AGX Orin 64GB
         → >=30GB + Jetson-Marker → AGX Orin 32GB
```

**Aenderung in `detect_jetson_model()`**:

```bash
detect_jetson_model() {
    local model_file="/proc/device-tree/model"
    local compatible_file="/proc/device-tree/compatible"
    local tegra_file="/sys/module/tegra_fuse/parameters/tegra_chip_id"

    # Stufe 1: Device-Tree Model (zuverlaessigste Quelle)
    if [ -f "$model_file" ]; then
        local model=$(cat "$model_file" 2>/dev/null | tr -d '\0')
        if [ -n "$model" ]; then
            echo "$model"
            return
        fi
    fi

    # Stufe 2: Device-Tree Compatible String
    if [ -f "$compatible_file" ]; then
        local compat=$(cat "$compatible_file" 2>/dev/null | tr '\0' '\n')
        if echo "$compat" | grep -qi "thor"; then
            echo "NVIDIA Jetson Thor"
            return
        elif echo "$compat" | grep -qi "orin"; then
            echo "NVIDIA Jetson Orin (via compatible)"
            return
        fi
    fi

    # Stufe 3: Tegra Chip ID
    if [ -f "$tegra_file" ]; then
        local chip_id=$(cat "$tegra_file" 2>/dev/null)
        case "$chip_id" in
            "36"|"37"|"38") echo "NVIDIA Jetson Thor" ;;
            "35") echo "NVIDIA Jetson AGX Orin" ;;
            "33") echo "NVIDIA Jetson Xavier" ;;
            "25") echo "NVIDIA Jetson TX2" ;;
            "24") echo "NVIDIA Jetson TX1" ;;
            "21") echo "NVIDIA Jetson Nano" ;;
            *) echo "Unknown Jetson (Chip ID: $chip_id)" ;;
        esac
        return
    fi

    # Stufe 4: nvidia-smi GPU-Name
    if command -v nvidia-smi &>/dev/null; then
        local gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        if echo "$gpu_name" | grep -qi "thor\|blackwell\|gh"; then
            echo "NVIDIA Jetson Thor (via GPU)"
            return
        elif echo "$gpu_name" | grep -qi "orin"; then
            echo "NVIDIA Jetson Orin (via GPU)"
            return
        fi
    fi

    # Stufe 5: RAM-basierter Fallback (nur wenn Jetson-Marker vorhanden)
    if [ -f /etc/nv_tegra_release ] || [ -d /sys/devices/platform/tegra-pmc ]; then
        local ram=$(detect_ram_total)
        if [ "$ram" -ge 120 ]; then
            echo "NVIDIA Jetson Thor (RAM-basiert: ${ram}GB)"
        elif [ "$ram" -ge 60 ]; then
            echo "NVIDIA Jetson AGX Orin (RAM-basiert: ${ram}GB)"
        else
            echo "NVIDIA Jetson (unbekanntes Modell, ${ram}GB RAM)"
        fi
        return
    fi

    echo "Kein Jetson-Geraet erkannt"
}
```

### 1.2 Thor-Profil in `get_device_profile()`

**Aenderung in Zeile 93-147** - Neuer Case-Branch VOR dem AGX Orin:

```bash
case "$model" in
    *"Thor"*)
        if [ "$ram" -ge 120 ]; then
            echo "thor_128gb"
        else
            echo "thor_64gb"  # Falls Thor auch in 64GB kommt
        fi
        ;;
    *"AGX Orin"*)
        # ... bestehender Code ...
```

### 1.3 Thor-Konfigurationsprofil in `get_config_for_profile()`

**Neuer Case-Branch** vor `agx_orin_64gb` (nach Zeile 156):

```bash
"thor_128gb")
    cat << 'EOF'
# Jetson Thor 128GB - Maximum Performance
JETSON_PROFILE=thor_128gb
JETSON_DESCRIPTION="NVIDIA Jetson Thor 128GB"

# Resource Limits
RAM_LIMIT_POSTGRES=4G
RAM_LIMIT_LLM=96G
RAM_LIMIT_EMBEDDING=12G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_N8N=4G
RAM_LIMIT_QDRANT=8G
RAM_LIMIT_MINIO=4G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_TELEGRAM=256M
RAM_LIMIT_DOCUMENT_INDEXER=4G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M

# CPU Limits (Thor hat voraussichtlich 12-16+ Cores)
CPU_LIMIT_LLM=12
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_N8N=4

# LLM Configuration
LLM_MODEL=qwen3:32b-q8
LLM_CONTEXT_LENGTH=32768
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=900
OLLAMA_STARTUP_TIMEOUT=240

# Embedding Configuration
EMBEDDING_USE_FP16=false
EMBEDDING_MAX_BATCH_SIZE=200

# Recommended Models
RECOMMENDED_MODELS="qwen3:32b-q8,llama3.1:70b-q4,codellama:70b,mixtral:8x7b,deepseek-coder:33b"
EOF
    ;;
```

### 1.4 Thor-Modellempfehlungen in `show_recommendations()`

**Neuer Case-Branch** in `show_recommendations()` (nach Zeile 611):

```bash
"thor_128gb")
    echo -e "${GREEN}Maximum Performance:${NC}"
    echo "  - qwen3:32b-q8      (32GB) - Beste Qualitaet"
    echo "  - llama3.1:70b-q4   (40GB) - Maximale Faehigkeit"
    echo "  - codellama:70b     (38GB) - Bester Code-Assistent"
    echo ""
    echo -e "${YELLOW}Auch unterstuetzt:${NC}"
    echo "  - mixtral:8x7b      (26GB) - MoE Architektur"
    echo "  - deepseek-coder:33b (18GB) - Code-Spezialist"
    echo "  - qwen3:14b-q8      (15GB) - Schnell & hochwertig"
    ;;
```

### 1.5 CUDA-Arch fuer Thor

**Aenderung in `detect_cuda_arch()`** (Zeile 75):

```bash
case "$model" in
    *"Thor"*)     echo "10.0" ;;  # Blackwell SM_100 (oder 9.0 falls Grace-Hopper)
    *"Orin"*)     echo "8.7" ;;
    # ...
esac
```

**WICHTIG**: Falls der Thor doch SM_90 (Hopper) statt SM_100 (Blackwell) hat, reicht der String-Match. Die CUDA-Arch wird nur fuer `TORCH_CUDA_ARCH_LIST` verwendet, und PyTorch/Ollama erkennen die Arch auch automatisch.

### 1.6 Testplan Phase 1

```bash
# Auf AGX Orin 64GB (aktuelles Geraet):
./scripts/setup/detect-jetson.sh detect
# Erwartung: "NVIDIA Jetson AGX Orin" + agx_orin_64gb Profil

./scripts/setup/detect-jetson.sh profile
# Erwartung: "agx_orin_64gb"

# Simulierter Thor-Test (mocking):
# Temporaer /proc/device-tree/model mit "NVIDIA Jetson Thor" befuellen
# oder RAM-Fallback testen mit OVERRIDE_RAM=128
```

---

## Phase 2: Interactive Setup Script

> **Neue Datei**: `scripts/interactive_setup.sh`
> **Geschaetzter Aufwand**: ~350 Zeilen
> **Abhaengigkeiten**: Phase 1 (detect-jetson.sh mit Thor-Support)

### 2.1 Architektur

Das Script wird von `./arasul setup` aufgerufen und generiert eine produktionsreife `.env` Datei. Es ist komplett interaktiv, auf Deutsch, und deckt nur die Essentials ab.

**Verantwortlichkeiten**:

- Benutzer-Eingaben sammeln (Admin-Passwort, Hostname, Modell-Wahl)
- Sichere Secrets generieren (JWT, DB-Passwort, MinIO, n8n)
- Hardware erkennen und Profil anwenden
- `.env` Datei schreiben
- Zusammenfassung anzeigen

**NICHT verantwortlich fuer** (das macht der Bootstrap):

- Docker-Images bauen
- Services starten
- Datenbank initialisieren
- Zertifikate generieren

### 2.2 Detaillierter Flow

```
┌─────────────────────────────────────────────────────┐
│  ARASUL PLATFORM - Ersteinrichtung                  │
│  ═══════════════════════════════════════════         │
│                                                     │
│  Schritt 1/5: Hardware-Erkennung                    │
│  ────────────────────────────────                   │
│  Erkannt: NVIDIA Jetson AGX Orin                    │
│  RAM:     64 GB | CPU: 12 Kerne | GPU: 2048 CUDA   │
│  Profil:  agx_orin_64gb                             │
│  Modell:  qwen3:14b-q8 (empfohlen)                 │
│                                                     │
│  ✓ Hardware erkannt                                 │
│                                                     │
│  Schritt 2/5: Administrator-Konto                   │
│  ────────────────────────────────                   │
│  Benutzername [admin]: _                            │
│  Passwort (min. 12 Zeichen): ********              │
│  Passwort bestaetigen: ********                     │
│  E-Mail [admin@arasul.local]: _                     │
│                                                     │
│  Schritt 3/5: Netzwerk                              │
│  ────────────────────────────────                   │
│  Hostname [arasul]: mein-jet                        │
│  → Geraet wird erreichbar unter: mein-jet.local     │
│                                                     │
│  Schritt 4/5: KI-Modell                             │
│  ────────────────────────────────                   │
│  Empfohlene Modelle fuer AGX Orin 64GB:             │
│                                                     │
│  [1] qwen3:14b-q8   (15 GB) - Empfohlen            │
│  [2] llama3.1:8b    (5 GB)  - Schnell              │
│  [3] qwen3:32b-q8   (32 GB) - Beste Qualitaet      │
│  [4] Eigenes Modell eingeben                        │
│                                                     │
│  Auswahl [1]: _                                     │
│                                                     │
│  Schritt 5/5: Zusammenfassung                       │
│  ────────────────────────────────                   │
│  Administrator:  admin                              │
│  Hostname:       mein-jet.local                     │
│  KI-Modell:      qwen3:14b-q8                       │
│  Profil:         agx_orin_64gb                      │
│                                                     │
│  Generierte Secrets:                                │
│    JWT-Secret:       ✓ (64 Zeichen)                 │
│    DB-Passwort:      ✓ (24 Zeichen)                 │
│    MinIO-Zugangsd.:  ✓ (24 Zeichen)                 │
│    n8n-Schluessel:   ✓ (64 Zeichen)                 │
│                                                     │
│  Konfiguration schreiben? [J/n]: _                  │
│                                                     │
│  ✓ .env geschrieben (Berechtigungen: 600)           │
│  ✓ .env.jetson angewendet                           │
│                                                     │
│  Naechster Schritt:                                 │
│    ./arasul bootstrap                               │
└─────────────────────────────────────────────────────┘
```

### 2.3 Implementierungsdetails

#### Eingabe-Funktionen

```bash
# Passwort-Eingabe mit Validierung
prompt_password() {
    local prompt="$1"
    local min_length="${2:-12}"
    local password=""
    local confirm=""

    while true; do
        echo -n -e "${BLUE}${prompt}${NC} "
        read -s password
        echo ""

        # Validierung
        if [ ${#password} -lt $min_length ]; then
            echo -e "${RED}Fehler: Mindestens ${min_length} Zeichen erforderlich${NC}"
            continue
        fi

        echo -n -e "${BLUE}Passwort bestaetigen:${NC} "
        read -s confirm
        echo ""

        if [ "$password" != "$confirm" ]; then
            echo -e "${RED}Fehler: Passwoerter stimmen nicht ueberein${NC}"
            continue
        fi

        echo "$password"
        return 0
    done
}

# Eingabe mit Default-Wert
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local value=""

    echo -n -e "${BLUE}${prompt}${NC} [${default}]: "
    read value
    echo "${value:-$default}"
}

# Auswahl-Menue
prompt_select() {
    local prompt="$1"
    shift
    local options=("$@")
    local choice=""

    for i in "${!options[@]}"; do
        echo -e "  [${GREEN}$((i+1))${NC}] ${options[$i]}"
    done
    echo ""
    echo -n -e "${BLUE}${prompt}${NC} [1]: "
    read choice
    choice="${choice:-1}"

    # Validierung
    if [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ] 2>/dev/null; then
        echo "$((choice-1))"  # 0-basierter Index
    else
        echo "0"  # Default
    fi
}
```

#### Secret-Generierung

```bash
generate_secret() {
    local length="${1:-32}"
    openssl rand -hex "$length" 2>/dev/null || \
    head -c "$((length*2))" /dev/urandom | xxd -p | tr -d '\n' | head -c "$((length*2))"
}

generate_password() {
    local length="${1:-24}"
    openssl rand -base64 "$length" 2>/dev/null | tr -d '/+=' | head -c "$length" || \
    head -c "$length" /dev/urandom | base64 | tr -d '/+=' | head -c "$length"
}
```

#### bcrypt-Hash Generierung (fuer Admin-Passwort)

```bash
generate_bcrypt_hash() {
    local password="$1"

    # Methode 1: node.js (im Backend-Container oder lokal)
    if command -v node &>/dev/null; then
        node -e "
            const crypto = require('crypto');
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('$password', 12);
            process.stdout.write(hash);
        " 2>/dev/null && return
    fi

    # Methode 2: Python3 bcrypt
    if command -v python3 &>/dev/null; then
        python3 -c "
import bcrypt
print(bcrypt.hashpw(b'$password', bcrypt.gensalt(12)).decode())
        " 2>/dev/null && return
    fi

    # Methode 3: htpasswd (Apache Utils)
    if command -v htpasswd &>/dev/null; then
        htpasswd -nbB "" "$password" | cut -d: -f2
        return
    fi

    # Methode 4: Docker mit node.js
    docker run --rm node:20-alpine node -e "
        const bcrypt = require('bcryptjs');
        process.stdout.write(bcrypt.hashSync('$password', 12));
    " 2>/dev/null && return

    # Fallback: Hash wird vom Backend beim ersten Start generiert
    echo "GENERATE_ON_FIRST_START"
}
```

#### .env Schreiben

```bash
write_env_file() {
    local env_file="${PROJECT_ROOT}/.env"

    # Backup falls vorhanden
    if [ -f "$env_file" ]; then
        cp "$env_file" "${env_file}.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    cat > "$env_file" << EOF
# =============================================================================
# Arasul Platform - Konfiguration
# Generiert: $(date -Iseconds)
# Geraet: ${DEVICE_MODEL}
# Profil: ${DEVICE_PROFILE}
# =============================================================================

# --- System ---
SYSTEM_NAME=arasul
SYSTEM_VERSION=1.0.0
NODE_ENV=production

# --- Administrator ---
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_HASH=${ADMIN_HASH}

# --- Sicherheit (automatisch generiert) ---
JWT_SECRET=${JWT_SECRET}
N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
TELEGRAM_ENCRYPTION_KEY=${TELEGRAM_ENCRYPTION_KEY}

# --- Datenbank ---
POSTGRES_USER=arasul
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=arasul_db
POSTGRES_HOST=postgres-db
POSTGRES_PORT=5432

# --- MinIO (S3-Speicher) ---
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}

# --- n8n Workflows ---
N8N_BASIC_AUTH_USER=${ADMIN_USERNAME}
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}

# --- KI-Modell ---
LLM_MODEL=${LLM_MODEL}

# --- Netzwerk ---
MDNS_NAME=${HOSTNAME}

# --- Jetson Hardware (von detect-jetson.sh) ---
# Wird durch .env.jetson ergaenzt
EOF

    # Jetson-Profil anhaengen
    if [ -f "${PROJECT_ROOT}/.env.jetson" ]; then
        echo "" >> "$env_file"
        echo "# --- Jetson Hardware-Profil ---" >> "$env_file"
        cat "${PROJECT_ROOT}/.env.jetson" >> "$env_file"
    fi

    # Berechtigungen setzen
    chmod 600 "$env_file"
}
```

### 2.4 Non-Interactive Modus

Fuer Factory-Images und CI/CD:

```bash
# Aufruf mit --non-interactive und Umgebungsvariablen
ADMIN_PASSWORD=SuperSicher123! \
HOSTNAME=arasul-prod-001 \
./scripts/interactive_setup.sh --non-interactive
```

Das Script prueft ob `--non-interactive` gesetzt ist und ueberspringt dann alle `read`-Aufrufe. Stattdessen werden die Werte aus Umgebungsvariablen gelesen. Fehlende Pflicht-Werte fuehren zu einem Fehler mit klarer Meldung.

### 2.5 Testplan Phase 2

```bash
# Test 1: Normaler interaktiver Durchlauf
./scripts/interactive_setup.sh
# → Alle Prompts durchgehen, .env pruefen

# Test 2: Abbruch mit Ctrl+C
# → Kein .env geschrieben, keine Seiteneffekte

# Test 3: Ungueltige Eingaben
# → Zu kurzes Passwort, nicht uebereinstimmend
# → Leerer Hostname (Default muss greifen)

# Test 4: Non-interactive
ADMIN_PASSWORD=Test12345678! ./scripts/interactive_setup.sh --non-interactive
# → .env mit defaults + uebergebenem Passwort

# Test 5: Bestehende .env wird nicht ueberschrieben ohne Bestaetigung
# → Warnung: ".env existiert bereits. Ueberschreiben? [j/N]"
```

---

## Phase 3: Bootstrap Refactoring

> **Datei**: `arasul`
> **Geschaetzter Aufwand**: ~200 Zeilen Aenderungen
> **Abhaengigkeiten**: Phase 2 (interactive_setup.sh muss existieren)

### 3.1 Neuer Bootstrap-Flow

Der `cmd_bootstrap()` (Zeile 903-994) wird komplett ueberarbeitet:

```
cmd_bootstrap() {
    show_banner
    check_root

    # 1. Hardware validieren
    validate_hardware

    # 2. Software-Voraussetzungen pruefen
    check_requirements

    # 3. Interactive Setup (generiert .env)
    #    ODER .env muss bereits existieren (--non-interactive)
    if [ ! -f .env ] || [ "$FORCE_SETUP" = "true" ]; then
        run_interactive_setup
    else
        log_info ".env existiert bereits, ueberspringe Setup"
        log_info "Tipp: ./arasul setup  um die Konfiguration zu aendern"
    fi

    # 4. Jetson-Profil anwenden
    apply_jetson_profile

    # 5. Konfiguration validieren
    validate_configuration

    # 6. Verzeichnisse erstellen
    create_directories

    # 7. Secrets & Auth konfigurieren
    setup_secrets

    # 8. TLS-Zertifikate
    setup_https

    # 9. Docker-Images
    pull_images
    build_images

    # 10. Datenbank initialisieren
    init_database

    # 11. Services starten
    start_services

    # 12. MinIO-Buckets erstellen
    init_minio_buckets

    # 13. Admin-Benutzer anlegen
    init_admin_user

    # 14. Smoke Tests
    run_smoke_tests

    # 15. Ergebnis anzeigen
    show_completion_summary
}
```

### 3.2 Konkrete Aenderungen

#### A) `init_env()` entfernen (Zeile 478-488)

Die alte Funktion kopiert blind `.env.template`. Wird ersetzt durch:

```bash
run_interactive_setup() {
    if [ -f "${SCRIPT_DIR}/scripts/interactive_setup.sh" ]; then
        bash "${SCRIPT_DIR}/scripts/interactive_setup.sh"
        if [ $? -ne 0 ]; then
            log_error "Setup abgebrochen"
            exit 1
        fi
    else
        log_error "Setup-Script nicht gefunden: scripts/interactive_setup.sh"
        exit 1
    fi
}
```

#### B) `setup_secrets()` refactoren (Zeile 572-621)

Aktuell liest es feste Credentials aus `.env`. Neu: liest die vom Interactive Setup generierten Werte.

```bash
setup_secrets() {
    log_info "Konfiguriere Secrets..."

    mkdir -p config/secrets
    chmod 700 config/secrets

    # Credentials aus .env lesen (vom Interactive Setup generiert)
    local n8n_user=$(grep "^N8N_BASIC_AUTH_USER=" .env | cut -d'=' -f2)
    local n8n_pass=$(grep "^N8N_BASIC_AUTH_PASSWORD=" .env | cut -d'=' -f2)

    if [ -z "$n8n_pass" ]; then
        log_error "N8N_BASIC_AUTH_PASSWORD nicht in .env gefunden"
        return 1
    fi

    # Traefik Basic Auth konfigurieren
    configure_traefik_auth "$n8n_user" "$n8n_pass"

    log_success "Secrets konfiguriert"
}
```

#### C) `init_minio_buckets()` Pfad-Fix (Zeile 539)

```bash
# ALT:
if [ ! -f "./scripts/init_minio_buckets.sh" ]; then

# NEU:
if [ ! -f "./scripts/util/init_minio_buckets.sh" ]; then
```

Und entsprechend Zeile 548 und 551:

```bash
# ALT:
docker cp ./scripts/init_minio_buckets.sh minio:/tmp/init_minio_buckets.sh

# NEU:
docker cp ./scripts/util/init_minio_buckets.sh minio:/tmp/init_minio_buckets.sh
```

#### D) `init_admin_user()` ohne ADMIN_HASH Pflicht (Zeile 663-706)

```bash
init_admin_user() {
    log_info "Erstelle Administrator-Benutzer..."

    local admin_user=$(grep "^ADMIN_USERNAME=" .env | cut -d'=' -f2)
    local admin_pass=$(grep "^ADMIN_PASSWORD=" .env | cut -d'=' -f2)
    local admin_email=$(grep "^ADMIN_EMAIL=" .env | cut -d'=' -f2)
    local admin_hash=$(grep "^ADMIN_HASH=" .env | cut -d'=' -f2-)

    if [ -z "$admin_pass" ]; then
        log_error "ADMIN_PASSWORD nicht in .env"
        return 1
    fi

    # Hash generieren falls nicht vorhanden
    if [ -z "$admin_hash" ] || [ "$admin_hash" = "GENERATE_ON_FIRST_START" ]; then
        log_info "Generiere Passwort-Hash..."
        admin_hash=$(docker compose exec -T dashboard-backend \
            node -e "const b=require('bcryptjs');process.stdout.write(b.hashSync('${admin_pass}',12))" \
            2>/dev/null)

        if [ -z "$admin_hash" ]; then
            log_warning "Hash-Generierung fehlgeschlagen - Backend generiert beim Start"
            return 0
        fi
    fi

    docker compose exec -T postgres-db psql -U arasul -d arasul_db -c "
        INSERT INTO admin_users (username, password_hash, email, created_at)
        VALUES ('${admin_user:-admin}', '${admin_hash}', '${admin_email:-admin@arasul.local}', NOW())
        ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    "

    if [ $? -eq 0 ]; then
        log_success "Administrator erstellt: ${admin_user:-admin}"
    else
        log_error "Administrator-Erstellung fehlgeschlagen"
        return 1
    fi
}
```

#### E) `show_completion_summary()` NEU

```bash
show_completion_summary() {
    local admin_user=$(grep "^ADMIN_USERNAME=" .env | cut -d'=' -f2)
    local admin_pass=$(grep "^ADMIN_PASSWORD=" .env | cut -d'=' -f2)
    local hostname=$(grep "^MDNS_NAME=" .env | cut -d'=' -f2)

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}  ARASUL PLATFORM - Erfolgreich installiert!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "  Dashboard:    ${BLUE}https://${hostname:-arasul}.local${NC}"
    echo -e "  n8n:          ${BLUE}https://${hostname:-arasul}.local/n8n${NC}"
    echo ""
    echo "  ┌─────────────────────────────────────────────┐"
    echo "  │  Benutzername:  ${admin_user:-admin}"
    echo "  │  Passwort:      ${admin_pass}"
    echo "  │                                             │"
    echo "  │  BITTE NOTIEREN UND SICHER AUFBEWAHREN!     │"
    echo "  └─────────────────────────────────────────────┘"
    echo ""
    echo "  Befehle:"
    echo "    ./arasul status    - Status anzeigen"
    echo "    ./arasul logs      - Logs anzeigen"
    echo "    ./arasul stop      - System stoppen"
    echo "    ./arasul restart   - System neustarten"
    echo ""
}
```

#### F) Validierungs-Script Pfade fixen (Zeile 923, 930)

```bash
# ALT (Zeile 923):
if ! "${SCRIPT_DIR}/scripts/validate_config.sh"; then

# NEU:
if [ -f "${SCRIPT_DIR}/scripts/validate/validate_config.sh" ]; then
    if ! "${SCRIPT_DIR}/scripts/validate/validate_config.sh"; then
        log_error "Konfigurationsvalidierung fehlgeschlagen"
        exit 1
    fi
fi

# ALT (Zeile 930):
if ! "${SCRIPT_DIR}/scripts/validate_dependencies.sh"; then

# NEU:
if [ -f "${SCRIPT_DIR}/scripts/validate/validate_dependencies.sh" ]; then
    if ! "${SCRIPT_DIR}/scripts/validate/validate_dependencies.sh"; then
        log_error "Abhaengigkeitsvalidierung fehlgeschlagen"
        exit 1
    fi
fi
```

### 3.3 Testplan Phase 3

```bash
# Test 1: Frisches System (kein .env)
rm -f .env
./arasul bootstrap
# → Interactive Setup startet automatisch
# → Alle Services starten
# → Smoke Tests bestehen

# Test 2: .env bereits vorhanden
./arasul bootstrap
# → "Existiert bereits, ueberspringe Setup"
# → Bootstrap laeuft mit bestehender Config

# Test 3: Setup separat ausfuehren
./arasul setup
# → Interactive Setup
./arasul bootstrap
# → Nutzt generierte .env

# Test 4: Fehlender Docker
# → Klare Fehlermeldung + Installationshinweis

# Test 5: GPU nicht verfuegbar
# → Warnung, nicht Abbruch (AI Features deaktiviert)
```

---

## Phase 4: Bug-Fixes & Hardening

> **Mehrere Dateien**: Siehe Tabelle
> **Geschaetzter Aufwand**: ~50 Zeilen pro Fix
> **Abhaengigkeiten**: Keine (kann parallel zu Phase 1-3 laufen)

### 4.1 Fix B1: MinIO Script-Pfad

**Datei**: `arasul`
**Zeilen**: 539, 548, 551

```bash
# Zeile 539: Pfad korrigieren
# ALT:
if [ ! -f "./scripts/init_minio_buckets.sh" ]; then
    log_error "MinIO initialization script not found: ./scripts/init_minio_buckets.sh"
# NEU:
if [ ! -f "./scripts/util/init_minio_buckets.sh" ]; then
    log_error "MinIO-Initialisierungsscript nicht gefunden: ./scripts/util/init_minio_buckets.sh"

# Zeile 548: docker cp Pfad
# ALT:
docker cp ./scripts/init_minio_buckets.sh minio:/tmp/init_minio_buckets.sh
# NEU:
docker cp ./scripts/util/init_minio_buckets.sh minio:/tmp/init_minio_buckets.sh
```

### 4.2 Fix B4: .env.bak Sicherheitsluecke

**Datei**: `scripts/setup/setup_dev.sh`

Am Anfang des Scripts (nach `set -e`):

```bash
# Sicheres Aufraemen von Backup-Dateien
cleanup_sensitive_files() {
    for f in .env.bak .env.backup.*; do
        if [ -f "$f" ]; then
            # shred ueberschreibt die Datei vor dem Loeschen
            if command -v shred &>/dev/null; then
                shred -fuz "$f" 2>/dev/null
            else
                rm -f "$f"
            fi
        fi
    done
}
trap cleanup_sensitive_files EXIT
```

### 4.3 Fix B5: Ollama-Timeout adaptiv

**Datei**: `scripts/setup/preconfigure.sh`

In der Ollama-Download-Sektion (ca. Zeile 528):

```bash
# Adaptiver Timeout basierend auf Geraete-Profil
get_ollama_timeout() {
    local profile=$(grep "^JETSON_PROFILE=" .env.jetson 2>/dev/null | cut -d'=' -f2)
    case "$profile" in
        thor_128gb)       echo 300 ;;
        agx_orin_64gb)    echo 240 ;;
        agx_orin_32gb)    echo 180 ;;
        *)                echo 120 ;;
    esac
}

OLLAMA_WAIT_TIMEOUT=$(get_ollama_timeout)
log_info "Warte auf Ollama (max ${OLLAMA_WAIT_TIMEOUT}s)..."
```

### 4.4 Fix B6: Validierungs-Script Pfade

**Datei**: `arasul`

Siehe Phase 3, Abschnitt F. Die Pfade `scripts/validate_config.sh` und `scripts/validate_dependencies.sh` muessen `scripts/validate/` Prefix bekommen.

### 4.5 Zusaetzliches Hardening

#### Port-Check vor Service-Start

```bash
check_ports() {
    local ports=(80 443 8080)
    local blocked=false

    for port in "${ports[@]}"; do
        if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            local process=$(ss -tlnp 2>/dev/null | grep ":${port} " | awk '{print $NF}')
            log_warning "Port ${port} bereits belegt von: ${process}"
            blocked=true
        fi
    done

    if [ "$blocked" = true ]; then
        log_error "Erforderliche Ports sind belegt. Bitte erst freigeben."
        return 1
    fi

    log_success "Alle erforderlichen Ports verfuegbar"
    return 0
}
```

#### Pre-Flight Check fuer AppArmor

```bash
check_apparmor_profiles() {
    if command -v aa-status &>/dev/null; then
        if ! sudo aa-status 2>/dev/null | grep -q "arasul"; then
            log_warning "AppArmor-Profile fuer Arasul nicht geladen"
            log_info "Services starten ohne AppArmor-Schutz"
            log_info "Zum Laden: sudo apparmor_parser /etc/apparmor.d/arasul-*"
        fi
    fi
}
```

### 4.6 Testplan Phase 4

```bash
# B1: MinIO Init
./arasul bootstrap  # MinIO-Buckets muessen erstellt werden

# B4: .env.bak
ls -la .env.bak  # Darf nach Script-Lauf nicht existieren

# B5: Ollama Timeout
grep OLLAMA_WAIT_TIMEOUT /tmp/arasul_bootstrap.log  # Pruefe adaptiven Wert

# B6: Validation Pfade
./arasul validate-config   # Muss funktionieren
./arasul validate-deps     # Muss funktionieren

# Hardening: Port-Check
sudo python3 -m http.server 80 &  # Port 80 belegen
./arasul bootstrap  # Muss Warnung zeigen
kill %1
```

---

## Phase 5: Factory-Image Workflow

> **Dateien**: `scripts/deploy/create-factory-image.sh`, `scripts/deploy/factory-install.sh` (NEU)
> **Geschaetzter Aufwand**: ~150 Zeilen (factory-install.sh)
> **Abhaengigkeiten**: Phase 1-4 abgeschlossen

### 5.1 Konzept

```
┌──────────────────────────────────────────────────────────┐
│  FACTORY-IMAGE ERSTELLUNG (einmalig auf Dev-Maschine)    │
│                                                          │
│  ./scripts/deploy/create-factory-image.sh                │
│    → Docker-Images exportieren                           │
│    → Ollama-Modell vorinstallieren                       │
│    → Source-Code kopieren                                │
│    → factory-install.sh einbetten                        │
│    → arasul-factory-DATUM.tar.gz erstellen               │
│                                                          │
│  Output: arasul-factory-20260309.tar.gz (~8-12 GB)       │
└──────────────────────────────────────────────────────────┘
              │
              │ USB-Stick / SCP / NFS
              ▼
┌──────────────────────────────────────────────────────────┐
│  FACTORY-INSTALLATION (auf neuem Jetson)                 │
│                                                          │
│  tar xzf arasul-factory-*.tar.gz                         │
│  cd arasul-platform/                                     │
│  ./factory-install.sh                                    │
│    → Docker-Images laden (offline, kein Internet)        │
│    → Interactive Setup (Admin-Passwort etc.)             │
│    → Hardware erkennen + Profil anwenden                 │
│    → Services starten                                    │
│    → Smoke Tests                                         │
│    → Fertig!                                             │
│                                                          │
│  Dauer: ~5-10 Min (kein Download noetig)                 │
└──────────────────────────────────────────────────────────┘
```

### 5.2 factory-install.sh (NEU)

Eingebettetes Installations-Script im Factory-Image:

```bash
#!/bin/bash
# Factory-Installation fuer Arasul Platform
# Eingebettet in arasul-factory-*.tar.gz

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ARASUL PLATFORM - Factory-Installation"
echo "  ======================================="
echo ""

# 1. Docker-Images laden (offline)
echo "[1/5] Lade Docker-Images (offline)..."
if [ -f images.tar.gz ]; then
    docker load < images.tar.gz
elif [ -d docker-images/ ]; then
    for img in docker-images/*.tar.gz; do
        docker load < "$img"
    done
fi

# 2. Ollama-Modell wiederherstellen (falls vorhanden)
echo "[2/5] Stelle KI-Modelle wieder her..."
if [ -d ollama-models/ ]; then
    docker volume create arasul-llm-models 2>/dev/null || true
    # Temporaeren Container zum Kopieren nutzen
    docker run --rm -v arasul-llm-models:/dest -v "$(pwd)/ollama-models:/src" \
        alpine sh -c "cp -a /src/. /dest/"
    echo "  Modelle wiederhergestellt"
else
    echo "  Keine vorinstallierten Modelle (wird beim ersten Start heruntergeladen)"
fi

# 3. In Projektverzeichnis wechseln
cd project/

# 4. Interactive Setup
echo "[3/5] Konfiguration..."
if [ "$1" = "--non-interactive" ]; then
    ./scripts/interactive_setup.sh --non-interactive
else
    ./scripts/interactive_setup.sh
fi

# 5. Bootstrap (ohne Pull/Build - Images sind bereits geladen)
echo "[4/5] Starte Services..."
./arasul bootstrap --skip-pull --skip-build

echo "[5/5] Ueberpruefung..."
./scripts/test/smoke-test.sh

echo ""
echo "  Installation abgeschlossen!"
echo "  Dashboard: https://$(grep MDNS_NAME .env | cut -d= -f2).local"
echo ""
```

### 5.3 Aenderungen in create-factory-image.sh

Das bestehende Script muss angepasst werden:

1. `factory-install.sh` ins Archiv einbetten
2. Ollama-Modell-Export verbessern (Volume-Copy statt Container-Copy)
3. `interactive_setup.sh` im `project/scripts/` Verzeichnis einschliessen

### 5.4 Bootstrap --skip-pull --skip-build Flags

**Datei**: `arasul`

Neue Flags in `cmd_bootstrap()`:

```bash
cmd_bootstrap() {
    # Flag-Parsing
    local skip_pull=false
    local skip_build=false
    for arg in "$@"; do
        case "$arg" in
            --skip-pull)  skip_pull=true ;;
            --skip-build) skip_build=true ;;
        esac
    done

    # ... bestehender Flow ...

    if [ "$skip_pull" = false ]; then
        pull_images
    fi

    if [ "$skip_build" = false ]; then
        build_images
    fi

    # ...
}
```

### 5.5 Testplan Phase 5

```bash
# Test 1: Factory-Image erstellen
./scripts/deploy/create-factory-image.sh --output=/tmp/factory
# → /tmp/factory/arasul-factory-*.tar.gz existiert

# Test 2: Entpacken und Struktur pruefen
tar tzf /tmp/factory/arasul-factory-*.tar.gz | head -20
# → factory-install.sh an der Wurzel
# → project/ Verzeichnis mit Source
# → images.tar.gz oder docker-images/
# → ollama-models/ (optional)

# Test 3: Factory-Install simulieren (auf gleichem Geraet)
# VORSICHT: Nur auf Test-System!
cd /tmp/test-factory
tar xzf /tmp/factory/arasul-factory-*.tar.gz
./factory-install.sh
```

---

## Phase 6: Validierung & Tests

> **Geschaetzter Aufwand**: ~100 Zeilen Test-Erweiterungen
> **Abhaengigkeiten**: Phase 1-5 abgeschlossen

### 6.1 Erweiterung smoke-test.sh

Neue Checks hinzufuegen:

```bash
# Check: .env wurde von Interactive Setup generiert (nicht Template)
check_env_not_template() {
    if grep -q "arasul123" .env 2>/dev/null; then
        log_error ".env enthaelt Standard-Dev-Credentials!"
        return 1
    fi

    local jwt_len=$(grep "^JWT_SECRET=" .env | cut -d'=' -f2 | wc -c)
    if [ "$jwt_len" -lt 32 ]; then
        log_error "JWT_SECRET zu kurz (${jwt_len} Zeichen, min. 32)"
        return 1
    fi

    log_success "Konfiguration: Produktionsreif"
}
```

### 6.2 Erweiterung verify-deployment.sh

```bash
# Check: Jetson-Profil korrekt angewendet
check_jetson_profile() {
    local profile=$(grep "^JETSON_PROFILE=" .env | cut -d'=' -f2)
    if [ -z "$profile" ]; then
        log_warning "Kein Jetson-Profil in .env"
        return 1
    fi

    # Pruefen ob RAM-Limits zum Profil passen
    local llm_limit=$(grep "^RAM_LIMIT_LLM=" .env | cut -d'=' -f2)
    case "$profile" in
        thor_128gb)
            if [ "$llm_limit" != "96G" ]; then
                log_warning "Thor-Profil aber LLM-Limit ist ${llm_limit} (erwartet: 96G)"
            fi
            ;;
        agx_orin_64gb)
            if [ "$llm_limit" != "48G" ]; then
                log_warning "AGX Orin 64GB aber LLM-Limit ist ${llm_limit} (erwartet: 48G)"
            fi
            ;;
    esac

    log_success "Jetson-Profil: ${profile}"
}
```

### 6.3 End-to-End Testplan

| Test   | Beschreibung                                            | Erwartung                                  |
| ------ | ------------------------------------------------------- | ------------------------------------------ |
| E2E-1  | Frisches System, `./arasul setup && ./arasul bootstrap` | Alle 17 Services laufen                    |
| E2E-2  | Factory-Image auf gleichem Geraet                       | Offline-Installation erfolgreich           |
| E2E-3  | Bootstrap mit bestehendem .env                          | Setup wird uebersprungen                   |
| E2E-4  | Bootstrap nach `factory-reset.sh`                       | Sauberer Neustart                          |
| E2E-5  | Falsches Passwort bei Setup-Wiederholung                | Fehlermeldung, kein Crash                  |
| E2E-6  | Ctrl+C waehrend Bootstrap                               | Kein korrupter Zustand                     |
| E2E-7  | Kein Internet (offline)                                 | Self-signed Cert, kein Modell-Download     |
| E2E-8  | Port 80 belegt                                          | Klare Fehlermeldung                        |
| E2E-9  | Disk < 64GB frei                                        | Warnung, aber Bootstrap moeglich           |
| E2E-10 | Docker nicht installiert                                | Klare Fehlermeldung + Installationshinweis |

---

## Phase 7: Dokumentation & Memory

> **Geschaetzter Aufwand**: ~50 Zeilen pro Datei
> **Abhaengigkeiten**: Phase 1-6 abgeschlossen

### 7.1 MEMORY.md Updates

```markdown
## Setup & Deployment

- Interactive Setup: `scripts/interactive_setup.sh` (Deutsch, Essentials-only)
- Bootstrap: `./arasul setup` → `./arasul bootstrap`
- Non-interactive: `ADMIN_PASSWORD=... ./scripts/interactive_setup.sh --non-interactive`
- Factory-Image: `./scripts/deploy/create-factory-image.sh` → USB → `./factory-install.sh`
- Thor 128GB: Profil `thor_128gb`, LLM_MODEL=qwen3:32b-q8, 96G LLM-RAM
- Hardware-Erkennung: 5-stufige Hierarchie (device-tree → compatible → chip-id → nvidia-smi → RAM)
```

### 7.2 docs/DEPLOYMENT.md Aktualisierung

Der Setup-Abschnitt muss den neuen Flow dokumentieren:

```markdown
## Erstinstallation

### Variante A: Online (mit Internet)

\`\`\`bash
git clone <repo> /opt/arasul
cd /opt/arasul
./arasul setup # Interaktive Konfiguration
./arasul bootstrap # Installation & Start
\`\`\`

### Variante B: Offline (Factory-Image)

\`\`\`bash
tar xzf arasul-factory-_.tar.gz
cd arasul-factory-_/
./factory-install.sh
\`\`\`
```

### 7.3 CLAUDE.md Key Entry Points

Hinzufuegen:

```markdown
| Setup | `scripts/interactive_setup.sh` | Deutsche Terminal-UI |
| Factory | `scripts/deploy/factory-install.sh` | Offline-Installation |
```

---

## Edge Cases & Fehlerbehandlung

### Hardware Edge Cases

| Szenario                                 | Verhalten                                                  |
| ---------------------------------------- | ---------------------------------------------------------- |
| Thor mit unbekannter Chip-ID             | Stufe 5 (RAM >= 120GB + Tegra-Marker → Thor)               |
| Thor mit 64GB Variante (falls existent)  | `thor_64gb` Profil (wie `agx_orin_64gb` aber mit Thor-GPU) |
| Kein Jetson (x86 Desktop)                | Hardware-Warnung, generisches Profil, kein GPU             |
| Jetson ohne nvidia-smi                   | Stufe 1/2/3 greifen trotzdem (Device-Tree)                 |
| Docker ohne NVIDIA Runtime               | Klare Fehlermeldung + Auto-Install-Versuch                 |
| ARM aber kein Jetson (z.B. Raspberry Pi) | "Kein Jetson erkannt", generisches Profil                  |

### Setup Edge Cases

| Szenario                                      | Verhalten                                                     |
| --------------------------------------------- | ------------------------------------------------------------- |
| Ctrl+C waehrend Passwort-Eingabe              | Kein .env geschrieben, sauberer Exit                          |
| Ctrl+C waehrend Docker-Build                  | Images ggf. inkonsistent → `docker compose build` wiederholen |
| .env existiert aber ist korrupt               | Backup erstellen, neu generieren                              |
| .env.template nicht vorhanden                 | Kein Problem - Interactive Setup generiert von Grund auf      |
| Passwort enthaelt Sonderzeichen `$`, `"`, `'` | Korrekt escapet in .env (Werte in Single-Quotes)              |
| Hostname mit Umlauten                         | Ablehnen, nur [a-z0-9-] erlauben                              |
| Hostname laenger als 63 Zeichen               | Ablehnen (mDNS-Limit)                                         |
| Leere Eingabe bei Pflichtfeldern              | Default-Wert verwenden                                        |

### Bootstrap Edge Cases

| Szenario                               | Verhalten                                            |
| -------------------------------------- | ---------------------------------------------------- |
| PostgreSQL startet nicht (Port belegt) | Timeout nach 60s, Fehlermeldung                      |
| Docker-Image Build schlaegt fehl       | Fehlermeldung + Retry-Hinweis                        |
| Ollama-Modell zu gross fuer RAM        | Warnung, kleineres Modell empfehlen                  |
| Disk voll waehrend Build               | Docker-Cleanup Empfehlung                            |
| Netzwerk nicht verfuegbar              | Self-signed Cert, kein Modell-Pull                   |
| Zweites `bootstrap` nach erstem        | Idempotent - bestehende .env wird genutzt            |
| Stromausfall waehrend Bootstrap        | Beim naechsten `bootstrap` weitermachen (idempotent) |

### Factory-Image Edge Cases

| Szenario                                | Verhalten                                            |
| --------------------------------------- | ---------------------------------------------------- |
| Docker-Images inkompatibel (ARM vs x86) | Factory-Image muss auf gleichem Arch erstellt werden |
| Altes Factory-Image auf neuem JetPack   | Sollte funktionieren (Docker-Layer kompatibel)       |
| USB-Stick zu klein                      | Fehlermeldung bei `create-factory-image.sh`          |
| factory-install.sh ohne Docker          | Fehlermeldung + Installationshinweis                 |

---

## Checkliste pro Phase

### Phase 1: Thor-Support

- [ ] `detect_jetson_model()` - 5-stufige Hierarchie implementiert
- [ ] `get_device_profile()` - Thor Case-Branch hinzugefuegt
- [ ] `get_config_for_profile()` - `thor_128gb` Profil mit 96G LLM
- [ ] `detect_cuda_arch()` - Thor CUDA Arch (10.0 oder 9.0)
- [ ] `show_recommendations()` - Thor Modellempfehlungen
- [ ] `get_device_profile()` - RAM-Fallback >=120GB → Thor
- [ ] Test auf AGX Orin: bestehende Erkennung nicht kaputt

### Phase 2: Interactive Setup

- [ ] `scripts/interactive_setup.sh` erstellt
- [ ] Deutsche Prompts fuer alle Eingaben
- [ ] Passwort-Validierung (min. 12 Zeichen, Bestaetigung)
- [ ] Secret-Generierung (JWT, DB, MinIO, n8n)
- [ ] bcrypt-Hash Generierung (4 Fallback-Methoden)
- [ ] Hardware-Erkennung integriert
- [ ] Modell-Auswahl basierend auf Profil
- [ ] Hostname-Validierung ([a-z0-9-], max 63 Zeichen)
- [ ] .env Schreiben mit chmod 600
- [ ] Zusammenfassung vor Bestaetigung
- [ ] `--non-interactive` Modus
- [ ] Bestehende .env: Warnung + Bestaetigung
- [ ] Sonderzeichen in Passwoertern korrekt escapet

### Phase 3: Bootstrap Refactoring

- [ ] DEV-MODE Credentials entfernt
- [ ] `init_env()` durch `run_interactive_setup()` ersetzt
- [ ] `setup_secrets()` liest generierte Credentials
- [ ] MinIO Script-Pfad gefixt (B1)
- [ ] `init_admin_user()` ohne ADMIN_HASH Pflicht
- [ ] `show_completion_summary()` Deutsch
- [ ] Validierungs-Pfade gefixt (B6)
- [ ] `--skip-pull` und `--skip-build` Flags
- [ ] `apply_jetson_profile()` Funktion
- [ ] Port-Check vor Service-Start

### Phase 4: Bug-Fixes & Hardening

- [ ] B1: MinIO Script-Pfad (`scripts/util/`)
- [ ] B4: .env.bak shred + trap
- [ ] B5: Adaptiver Ollama-Timeout
- [ ] B6: Validierungs-Script Pfade
- [ ] Port-Check Funktion
- [ ] AppArmor Pre-Flight Check

### Phase 5: Factory-Image

- [ ] `scripts/deploy/factory-install.sh` erstellt
- [ ] `create-factory-image.sh` bettet factory-install.sh ein
- [ ] Ollama-Modell Volume-Export
- [ ] Interactive Setup im Factory-Flow
- [ ] `--non-interactive` fuer Massenausrollung
- [ ] Offline-Test (ohne Internet)

### Phase 6: Validierung & Tests

- [ ] smoke-test.sh: .env Template-Check
- [ ] verify-deployment.sh: Jetson-Profil-Check
- [ ] E2E-Tests 1-10 bestanden
- [ ] Alle Edge Cases getestet

### Phase 7: Dokumentation

- [ ] MEMORY.md aktualisiert
- [ ] docs/DEPLOYMENT.md neuer Setup-Flow
- [ ] CLAUDE.md Key Entry Points
- [ ] Dieser Plan als "COMPLETED" markiert

---

## Zusammenfassung

| Phase | Dateien                                           | Zeilen (geschaetzt) | Abhaengigkeit    |
| ----- | ------------------------------------------------- | ------------------- | ---------------- |
| **1** | detect-jetson.sh                                  | +80                 | Keine            |
| **2** | interactive_setup.sh (NEU)                        | ~350                | Phase 1          |
| **3** | arasul                                            | ~200 Aenderungen    | Phase 2          |
| **4** | arasul, setup_dev.sh, preconfigure.sh             | ~100                | Keine (parallel) |
| **5** | factory-install.sh (NEU), create-factory-image.sh | ~150 + ~50          | Phase 1-4        |
| **6** | smoke-test.sh, verify-deployment.sh               | ~100                | Phase 1-5        |
| **7** | MEMORY.md, DEPLOYMENT.md, CLAUDE.md               | ~150                | Phase 1-6        |

**Empfohlene Reihenfolge**: Phase 1 + Phase 4 parallel → Phase 2 → Phase 3 → Phase 5 → Phase 6 → Phase 7
