#!/bin/bash
# =============================================================================
# Platform Detection and Configuration Script (Plan 020, Schritt 2)
# Jetson: AGX Orin, Orin NX, Orin Nano, Xavier NX, Xavier AGX, Nano, Thor
# x86_64: generic NVIDIA server, RTX PRO 6000 workstation
#
# Formerly detect-jetson.sh — a thin detect-jetson.sh forwarder is kept for
# backward compatibility. The declarative per-target catalog lives in
# config/platforms/*.json; `platform-profile` maps the detected hardware to it.
#
# MODELLE (Phase C8, 27.08.2026): `LLM_MODEL` und `RECOMMENDED_MODELS` tragen
# die Kurzliste aus `config/modelle/kurzliste.json` -- vier Modelle, auf jedem
# Profil dieselben. Ein Profil entscheidet nur noch, ob das Standardmodell mit
# seinen 22 GB hineinpasst; wo nicht, fuehrt das kleine schnelle. Vorher stand
# hier je Profil eine eigene Auswahl, und acht der siebzehn genannten Kennungen
# gab es im Katalog gar nicht. `scripts/test/kurzliste.py` haelt Skript,
# Profile, Migration 175 und `utils/hardware.js` aneinander.
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (scripts/setup/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# =============================================================================
# Device Detection Functions
# =============================================================================

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
        if grep -qi "thor" <<<"$compat"; then
            echo "NVIDIA Jetson Thor"
            return
        elif grep -qi "orin" <<<"$compat"; then
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
        if grep -qi "thor\|blackwell\|gh" <<<"$gpu_name"; then
            echo "NVIDIA Jetson Thor (via GPU)"
            return
        elif grep -qi "orin" <<<"$gpu_name"; then
            echo "NVIDIA Jetson Orin (via GPU)"
            return
        fi
    fi

    # Stufe 5: RAM-basierter Fallback (nur wenn Jetson-Marker vorhanden)
    # Only use fallback detection on ARM64
    local arch=$(uname -m)
    if [ "$arch" != "aarch64" ] && [ "$arch" != "arm64" ]; then
        # Positiver x86-Erkennungspfad (Plan 020, Schritt 2): frueher endete das
        # Skript hier sofort bei "unknown". Jetzt wird auf x86_64 die NVIDIA-GPU
        # klassifiziert, damit ein Server/Workstation ein echtes Profil bekommt.
        detect_x86_model
        return
    fi

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

    # ARM64 ohne Tegra-Marker: kein Jetson, aber evtl. ein Grace-Blackwell-System
    # (DGX Spark, GB10). Sonst ein generischer arm64-Server. Ohne diesen Zweig
    # wuerde ein echter DGX Spark faelschlich als Thor RAM-gebucket -> das
    # dgx-spark-Katalogprofil waere unerreichbar (Plan 020, Schritt 2).
    if command -v nvidia-smi &>/dev/null; then
        local arm_gpu=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        if grep -qi "spark\|gb10" <<<"$arm_gpu"; then
            echo "arm64 NVIDIA DGX Spark"
            return
        elif [ -n "$arm_gpu" ]; then
            echo "arm64 NVIDIA Server (${arm_gpu})"
            return
        fi
    fi

    echo "Kein Jetson-Geraet erkannt"
}

# Klassifiziert eine x86_64-Maschine anhand der vorhandenen NVIDIA-GPU.
# Gibt einen Modell-String zurueck, den get_device_profile in ein x86-Profil
# uebersetzt. Ohne NVIDIA-GPU bleibt es ein generischer x86-Server.
detect_x86_model() {
    if command -v nvidia-smi &>/dev/null; then
        # Single-line local (masks nvidia-smi exit code) — matches the file's
        # existing pattern und ist unter set -e robuster als getrennte Zuweisung.
        local gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        if grep -qi "rtx pro 6000\|rtx 6000" <<<"$gpu_name"; then
            echo "x86_64 NVIDIA RTX PRO 6000"
        elif grep -qi "dgx station\|gb200\|gb300" <<<"$gpu_name"; then
            echo "x86_64 NVIDIA DGX Station"
        elif [ -n "$gpu_name" ]; then
            echo "x86_64 NVIDIA Server (${gpu_name})"
        else
            echo "x86_64 Server (keine GPU erkannt)"
        fi
    else
        echo "x86_64 Server (kein nvidia-smi)"
    fi
}

# Grobe Plattformklasse fuer die HAL: jetson | x86_64 | unknown.
detect_platform() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        aarch64|arm64)
            if [ -f /etc/nv_tegra_release ] || [ -d /sys/devices/platform/tegra-pmc ] \
               || [ -f /proc/device-tree/model ]; then
                echo "jetson"
            else
                echo "arm64"
            fi
            ;;
        x86_64|amd64)
            echo "x86_64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

detect_ram_total() {
    # Get total RAM in GB
    local total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    echo $((total_kb / 1024 / 1024))
}

detect_gpu_memory() {
    # On Jetson, GPU memory is shared with system RAM
    # Return total available for GPU (approximately 80% of system RAM for unified memory)
    local total_ram=$(detect_ram_total)
    echo $((total_ram * 80 / 100))
}

detect_cpu_cores() {
    nproc
}

detect_cuda_arch() {
    # Detect CUDA compute capability from device model
    # NOTE: nvcc --list-gpu-arch lists all architectures the COMPILER supports,
    # NOT the actual device's compute capability. On Orin (8.7) it returns 9.0
    # because the compiler can target sm_90. We use model-based detection instead.
    local model=$(detect_jetson_model)
    case "$model" in
        *"Thor"*)     echo "10.0" ;;  # Blackwell SM_100
        *"Orin"*)     echo "8.7" ;;   # Ampere SM_87
        *"Xavier"*)   echo "7.2" ;;   # Volta SM_72
        *"TX2"*)      echo "6.2" ;;   # Pascal SM_62
        *"Nano"*)     echo "5.3" ;;   # Maxwell SM_53
        *)            echo "7.2" ;;   # Safe default
    esac
}

detect_l4t_pytorch_tag() {
    # Detect the appropriate dustynv/l4t-pytorch base image tag
    # Tags follow L4T release versions (e.g. r36.4.0 for JetPack 6.2)
    # Must match host L4T major.minor; use closest published dustynv tag.
    local model=$(detect_jetson_model)
    local tag
    case "$model" in
        # TODO: Update to r37.0.0 when dustynv publishes JetPack 7.x / L4T r37 image
        *"Thor"*)     tag="r36.4.0" ;;   # Thor/Blackwell - fallback to Orin tag until r37 exists
        *"Orin"*)     tag="r36.4.0" ;;   # Orin/Ampere - JetPack 6.2 (host r36.4.7)
        *"Xavier"*)   tag="r35.4.1" ;;   # Xavier/Volta - JetPack 5.x
        *)            tag="r36.4.0" ;;   # Default to current stable
    esac

    # Verify the tag exists on Docker Hub; fall back to latest known-good tag
    if ! verify_l4t_tag "$tag"; then
        local fallback="r36.4.0"
        echo -e "${YELLOW}Warning: dustynv/l4t-pytorch:${tag} not found, falling back to ${fallback}${NC}" >&2
        tag="$fallback"
    fi

    echo "$tag"
}

verify_l4t_tag() {
    # Check if a dustynv/l4t-pytorch tag exists on Docker Hub.
    # Uses docker manifest inspect (requires docker CLI with experimental enabled).
    # Returns 0 (success) if the tag exists, 1 otherwise.
    # Silently succeeds if docker is unavailable (offline/CI builds).
    local tag="$1"
    local image="dustynv/l4t-pytorch:${tag}"

    if ! command -v docker &>/dev/null; then
        # Cannot verify without docker - assume tag is valid
        return 0
    fi

    # Timeout after 10 seconds to avoid blocking on slow networks
    if docker manifest inspect "$image" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# Configuration Profiles
# =============================================================================

get_device_profile() {
    local model=$(detect_jetson_model)
    local ram=$(detect_ram_total)

    # Determine profile based on model and RAM
    case "$model" in
        *"Thor"*)
            if [ "$ram" -ge 120 ]; then
                echo "thor_128gb"
            else
                echo "thor_64gb"  # Falls Thor auch in 64GB kommt
            fi
            ;;
        *"AGX Orin"*)
            if [ "$ram" -ge 60 ]; then
                echo "agx_orin_64gb"
            else
                echo "agx_orin_32gb"
            fi
            ;;
        *"Orin NX"*)
            if [ "$ram" -ge 14 ]; then
                echo "orin_nx_16gb"
            else
                echo "orin_nx_8gb"
            fi
            ;;
        *"Orin Nano"*)
            if [ "$ram" -ge 7 ]; then
                echo "orin_nano_8gb"
            else
                echo "orin_nano_4gb"
            fi
            ;;
        *"Xavier AGX"*|*"AGX Xavier"*)
            if [ "$ram" -ge 30 ]; then
                echo "xavier_agx_32gb"
            else
                echo "xavier_agx_16gb"
            fi
            ;;
        *"Xavier NX"*)
            echo "xavier_nx_8gb"
            ;;
        *"Nano"*)
            if [ "$ram" -ge 3 ]; then
                echo "nano_4gb"
            else
                echo "nano_2gb"
            fi
            ;;
        *"RTX PRO 6000"*|*"RTX 6000"*)
            echo "rtx_pro_6000"
            ;;
        *"DGX Spark"*)
            echo "dgx_spark"
            ;;
        *"DGX Station"*)
            echo "dgx_station"
            ;;
        *"x86_64"*|*"arm64 NVIDIA Server"*|*"arm64 Server"*)
            echo "server_generic"
            ;;
        *)
            # Auto-detect based on RAM
            if [ "$ram" -ge 120 ]; then
                echo "thor_128gb"
            elif [ "$ram" -ge 60 ]; then
                echo "high_memory"
            elif [ "$ram" -ge 30 ]; then
                echo "medium_memory"
            elif [ "$ram" -ge 14 ]; then
                echo "standard_memory"
            elif [ "$ram" -ge 7 ]; then
                echo "low_memory"
            else
                echo "minimal_memory"
            fi
            ;;
    esac
}

# =============================================================================
# HAL: Zuordnung interner Profilname -> config/platforms/<id>.json
# =============================================================================

# Uebersetzt den (feingranularen) internen Profilnamen aus get_device_profile
# in die id eines deklarativen Katalog-Profils unter config/platforms/.
get_platform_profile_id() {
    local profile
    profile="${1:-$(get_device_profile)}"
    case "$profile" in
        thor_*)                         echo "thor-128" ;;
        agx_orin_*|orin_*|xavier_*|nano_*) echo "orin-64" ;;
        rtx_pro_6000)                   echo "rtx-pro-6000" ;;
        dgx_spark)                      echo "dgx-spark" ;;
        dgx_station)                    echo "dgx-station" ;;
        server_generic|*_memory)        echo "server-generic" ;;
        *)                              echo "server-generic" ;;
    esac
}

# Gibt den Pfad zur passenden Katalog-JSON aus (oder deren Inhalt mit --json).
show_platform_profile() {
    local id path
    id="$(get_platform_profile_id)"
    path="${PROJECT_ROOT}/config/platforms/${id}.json"
    if [ "${1:-}" = "--json" ]; then
        if [ -f "$path" ]; then
            cat "$path"
        else
            echo "{\"error\":\"profile not found\",\"id\":\"${id}\"}" >&2
            return 1
        fi
    else
        echo "$id"
        [ -f "$path" ] || echo -e "${YELLOW}Warnung: ${path} fehlt${NC}" >&2
    fi
}

# =============================================================================
# Resource Configuration per Profile
# =============================================================================

get_config_for_profile() {
    local profile=$1

    case "$profile" in
        "thor_128gb")
            cat << 'EOF'
# Jetson Thor 128GB - Maximum Performance
# RAM Budget: 115G for services (~90%), 13G reserved for system/OS
# Total allocated: 114.5G
JETSON_PROFILE=thor_128gb
JETSON_DESCRIPTION="NVIDIA Jetson Thor 128GB"

# Resource Limits
RAM_LIMIT_POSTGRES=4G
RAM_LIMIT_LLM=88G
RAM_LIMIT_EMBEDDING=8G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M

# CPU Limits (Thor hat voraussichtlich 12-16+ Cores)
CPU_LIMIT_LLM=12
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_DASHBOARD=4

# LLM Configuration
LLM_MODEL=hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=900
OLLAMA_STARTUP_TIMEOUT=300

# Embedding Configuration
EMBEDDING_USE_FP16=false
EMBEDDING_MAX_BATCH_SIZE=200

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS,gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "thor_64gb")
            cat << 'EOF'
# Jetson Thor 64GB - High Performance
# RAM Budget: 57G for services (~89%), 7G reserved for system/OS
# Total allocated: 55.0G
JETSON_PROFILE=thor_64gb
JETSON_DESCRIPTION="NVIDIA Jetson Thor 64GB"

# Resource Limits
RAM_LIMIT_POSTGRES=2G
RAM_LIMIT_LLM=34G
RAM_LIMIT_EMBEDDING=6G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M

# CPU Limits
CPU_LIMIT_LLM=10
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_DASHBOARD=4

# LLM Configuration
LLM_MODEL=hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=600
OLLAMA_STARTUP_TIMEOUT=240

# Embedding Configuration
EMBEDDING_USE_FP16=false
EMBEDDING_MAX_BATCH_SIZE=100

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS,gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "agx_orin_64gb")
            cat << 'EOF'
# AGX Orin 64GB - Maximum Performance
# RAM Budget: 57G for services (~89%), 7G reserved for system/OS
# Total allocated: 56.5G
JETSON_PROFILE=agx_orin_64gb
JETSON_DESCRIPTION="NVIDIA Jetson AGX Orin 64GB"

# Resource Limits
RAM_LIMIT_POSTGRES=2G
RAM_LIMIT_LLM=38G
RAM_LIMIT_EMBEDDING=6G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=512M
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M

# CPU Limits
CPU_LIMIT_LLM=10
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_DASHBOARD=4

# LLM Configuration
LLM_MODEL=hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=600
OLLAMA_STARTUP_TIMEOUT=240

# Embedding Configuration
EMBEDDING_USE_FP16=false
EMBEDDING_MAX_BATCH_SIZE=100

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS,gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "agx_orin_32gb")
            cat << 'EOF'
# AGX Orin 32GB - High Performance
# RAM Budget: 28G for services (~88%), 4G reserved for system/OS
# Total allocated: 28.3G
JETSON_PROFILE=agx_orin_32gb
JETSON_DESCRIPTION="NVIDIA Jetson AGX Orin 32GB"

# Resource Limits
RAM_LIMIT_POSTGRES=1G
RAM_LIMIT_LLM=20G
RAM_LIMIT_EMBEDDING=3G
RAM_LIMIT_BACKEND=1G
RAM_LIMIT_FRONTEND=384M
RAM_LIMIT_METRICS=256M
RAM_LIMIT_SELF_HEALING=256M
RAM_LIMIT_DOCUMENT_INDEXER=768M
RAM_LIMIT_REVERSE_PROXY=256M
RAM_LIMIT_BACKUP=128M

# CPU Limits
CPU_LIMIT_LLM=8
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_DASHBOARD=4

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=300
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=50

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "orin_nx_16gb")
            cat << 'EOF'
# Orin NX 16GB - Balanced Performance
JETSON_PROFILE=orin_nx_16gb
JETSON_DESCRIPTION="NVIDIA Jetson Orin NX 16GB"

# Resource Limits
RAM_LIMIT_POSTGRES=512M
RAM_LIMIT_LLM=10G
RAM_LIMIT_EMBEDDING=2G
RAM_LIMIT_BACKEND=768M
RAM_LIMIT_FRONTEND=384M
RAM_LIMIT_METRICS=192M
RAM_LIMIT_SELF_HEALING=192M
RAM_LIMIT_DOCUMENT_INDEXER=768M
RAM_LIMIT_REVERSE_PROXY=256M
RAM_LIMIT_BACKUP=128M

# CPU Limits
CPU_LIMIT_LLM=6
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_DASHBOARD=2

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=180
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=25

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "orin_nx_8gb"|"orin_nano_8gb")
            cat << 'EOF'
# Orin NX/Nano 8GB - Efficient Performance
JETSON_PROFILE=orin_8gb
JETSON_DESCRIPTION="NVIDIA Jetson Orin 8GB"

# Resource Limits
RAM_LIMIT_POSTGRES=384M
RAM_LIMIT_LLM=5G
RAM_LIMIT_EMBEDDING=1G
RAM_LIMIT_BACKEND=512M
RAM_LIMIT_FRONTEND=256M
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=192M
RAM_LIMIT_BACKUP=96M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_DASHBOARD=2

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=2048
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=120
OLLAMA_STARTUP_TIMEOUT=90

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=10

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "orin_nano_4gb"|"nano_4gb"|"minimal_memory")
            cat << 'EOF'
# Orin Nano 4GB / Jetson Nano - Minimal Configuration
JETSON_PROFILE=minimal_4gb
JETSON_DESCRIPTION="NVIDIA Jetson 4GB (Minimal)"

# Resource Limits
RAM_LIMIT_POSTGRES=256M
RAM_LIMIT_LLM=2G
RAM_LIMIT_EMBEDDING=512M
RAM_LIMIT_BACKEND=384M
RAM_LIMIT_FRONTEND=192M
RAM_LIMIT_METRICS=64M
RAM_LIMIT_SELF_HEALING=64M
RAM_LIMIT_DOCUMENT_INDEXER=256M
RAM_LIMIT_REVERSE_PROXY=128M
RAM_LIMIT_BACKUP=64M

# CPU Limits
CPU_LIMIT_LLM=2
CPU_LIMIT_EMBEDDING=1
CPU_LIMIT_BACKEND=1
CPU_LIMIT_DASHBOARD=1

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=1024
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=60
OLLAMA_STARTUP_TIMEOUT=60

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=5

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "xavier_agx_32gb"|"xavier_agx_16gb")
            cat << 'EOF'
# Xavier AGX - Legacy High Performance
JETSON_PROFILE=xavier_agx
JETSON_DESCRIPTION="NVIDIA Jetson Xavier AGX"

# Resource Limits
RAM_LIMIT_POSTGRES=1G
RAM_LIMIT_LLM=20G
RAM_LIMIT_EMBEDDING=3G
RAM_LIMIT_BACKEND=1G
RAM_LIMIT_FRONTEND=512M
RAM_LIMIT_METRICS=256M
RAM_LIMIT_SELF_HEALING=256M
RAM_LIMIT_DOCUMENT_INDEXER=1G
RAM_LIMIT_REVERSE_PROXY=384M
RAM_LIMIT_BACKUP=192M

# CPU Limits
CPU_LIMIT_LLM=6
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_DASHBOARD=2

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=300
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=25

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        "xavier_nx_8gb")
            cat << 'EOF'
# Xavier NX 8GB - Compact Performance
JETSON_PROFILE=xavier_nx_8gb
JETSON_DESCRIPTION="NVIDIA Jetson Xavier NX 8GB"

# Resource Limits
RAM_LIMIT_POSTGRES=384M
RAM_LIMIT_LLM=5G
RAM_LIMIT_EMBEDDING=1G
RAM_LIMIT_BACKEND=512M
RAM_LIMIT_FRONTEND=256M
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=192M
RAM_LIMIT_BACKUP=96M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_DASHBOARD=2

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=2048
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=120
OLLAMA_STARTUP_TIMEOUT=90

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=10

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;

        *)
            # Default/fallback configuration
            cat << 'EOF'
# Generic Jetson Configuration
JETSON_PROFILE=generic
JETSON_DESCRIPTION="Generic NVIDIA Jetson Device"

# Resource Limits (conservative)
RAM_LIMIT_POSTGRES=512M
RAM_LIMIT_LLM=8G
RAM_LIMIT_EMBEDDING=2G
RAM_LIMIT_BACKEND=512M
RAM_LIMIT_FRONTEND=256M
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=256M
RAM_LIMIT_BACKUP=128M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_DASHBOARD=2

# LLM Configuration
LLM_MODEL=gemma4:e4b
LLM_CONTEXT_LENGTH=131072
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=180
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=20

# Recommended Models: die Kurzliste (config/modelle/kurzliste.json)
RECOMMENDED_MODELS="gemma4:e4b,nomic-embed-text,llava-phi3"
EOF
            ;;
    esac
}

# =============================================================================
# Main Functions
# =============================================================================

print_device_info() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}       NVIDIA Jetson Device Detection${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "${GREEN}Device Model:${NC}    $(detect_jetson_model)"
    echo -e "${GREEN}System RAM:${NC}      $(detect_ram_total) GB"
    echo -e "${GREEN}GPU Memory:${NC}      ~$(detect_gpu_memory) GB (shared)"
    echo -e "${GREEN}CPU Cores:${NC}       $(detect_cpu_cores)"
    echo -e "${GREEN}CUDA Arch:${NC}       $(detect_cuda_arch)"
    echo -e "${GREEN}L4T PyTorch:${NC}    $(detect_l4t_pytorch_tag)"
    echo -e "${GREEN}Profile:${NC}         $(get_device_profile)"
    echo ""
}

generate_env_config() {
    local profile=$(get_device_profile)
    local output_file="${PROJECT_ROOT}/.env.jetson"

    echo -e "${YELLOW}Generating configuration for profile: ${profile}${NC}"

    # Generate config
    cat > "$output_file" << EOF
# =============================================================================
# Arasul Platform - Jetson Auto-Configuration
# Generated: $(date -Iseconds)
# Device: $(detect_jetson_model)
# Profile: ${profile}
# =============================================================================

$(get_config_for_profile "$profile")

# GPU Configuration
TORCH_CUDA_ARCH_LIST="$(detect_cuda_arch)"
CUDA_VISIBLE_DEVICES=0

# Base Image Configuration (for embedding-service Docker build)
L4T_PYTORCH_TAG="$(detect_l4t_pytorch_tag)"

# System Detection (read-only)
JETSON_RAM_TOTAL=$(detect_ram_total)
JETSON_CPU_CORES=$(detect_cpu_cores)
EOF

    echo -e "${GREEN}Configuration written to: ${output_file}${NC}"
    echo ""
    echo -e "${YELLOW}To apply this configuration:${NC}"
    echo "  1. Review: cat $output_file"
    echo "  2. Merge:  cat $output_file >> .env"
    echo "  3. Or use: source $output_file"
}

apply_config() {
    local env_file="${PROJECT_ROOT}/.env"
    local jetson_file="${PROJECT_ROOT}/.env.jetson"

    if [ ! -f "$jetson_file" ]; then
        generate_env_config
    fi

    # Backup existing .env
    if [ -f "$env_file" ]; then
        cp "$env_file" "${env_file}.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${YELLOW}Backed up existing .env${NC}"
    fi

    # Merge configurations
    echo -e "${YELLOW}Applying Jetson configuration...${NC}"

    # Read jetson config and update .env
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue

        # Remove existing key from .env
        if [ -f "$env_file" ]; then
            sed -i "/^${key}=/d" "$env_file"
        fi

        # Add new value
        echo "${key}=${value}" >> "$env_file"
    done < <(grep -v '^#' "$jetson_file" | grep '=')

    echo -e "${GREEN}Configuration applied successfully!${NC}"
}

# Was auf diesem Geraet vorgesehen ist -- gelesen aus der Kurzliste, nicht
# abgeschrieben.
#
# Bis zum 28.08.2026 stand hier eine `case`-Anweisung mit sechzig Zeilen
# Modellempfehlungen je Profil: `gemma4:31b-q4`, `qwen3:32b-q4`,
# `llama3.1:70b-q4`, `codellama:70b`, `phi3:mini`, `tinyllama:1.1b`. Von diesen
# Kennungen gibt es seit der Kurzliste (Phase C8, 27.08.2026) keine einzige
# mehr. Der Einrichtungsassistent empfahl einem Kunden also Modelle, die er
# nicht laden kann -- genau der Fehler, gegen den die Kurzliste angetreten ist.
#
# `RECOMMENDED_MODELS` je Profil steht weiter unten in dieser Datei und wird
# von `scripts/test/kurzliste.py` an der Kurzliste gehalten. Was hier
# ausgegeben wird, ist genau das, was `config/modelle/kurzliste.json` sagt.
show_recommendations() {
    local profile
    profile=$(get_device_profile)
    local kurzliste="${PROJECT_ROOT}/config/modelle/kurzliste.json"

    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}       Modelle fuer dieses Geraet${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "Profil: ${GREEN}${profile}${NC}"
    echo ""

    if [ ! -f "$kurzliste" ]; then
        echo -e "${YELLOW}config/modelle/kurzliste.json nicht gefunden.${NC}"
        return 0
    fi

    python3 - "$kurzliste" <<'KURZ'
import json
import sys

for modell in json.load(open(sys.argv[1], encoding='utf-8'))['modelle']:
    marke = 'Standard' if modell.get('standard') else '        '
    print(f"  {marke}  {modell['id']:<40} {modell.get('wofuer', '')}")
KURZ

    echo ""
    echo -e "${BLUE}Ein Modell laden:${NC}"
    echo "  docker exec llm-service ollama pull <Kennung>"
    echo ""
    echo "  Geladen wird NUR, was in der Kurzliste steht. Was sonst noch auf"
    echo "  dem Geraet liegt, raeumt scripts/util/modelle-aufraeumen.sh weg."
}

# =============================================================================
# CLI Interface
# =============================================================================

usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  detect      Show detected Jetson device information"
    echo "  generate    Generate .env.jetson configuration file"
    echo "  apply       Apply Jetson configuration to .env"
    echo "  recommend   Show recommended LLM models for this device"
    echo "  profile     Show current device profile name (fine-grained)"
    echo "  platform    Show platform class (jetson | x86_64 | arm64 | unknown)"
    echo "  platform-profile [--json]  Show matching config/platforms id (or its JSON)"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 detect              # Show device info"
    echo "  $0 generate && $0 apply # Configure for this device"
}

main() {
    case "${1:-detect}" in
        detect|info)
            print_device_info
            ;;
        generate|gen)
            print_device_info
            generate_env_config
            ;;
        apply)
            apply_config
            ;;
        recommend|models)
            show_recommendations
            ;;
        profile)
            get_device_profile
            ;;
        platform)
            detect_platform
            ;;
        platform-profile)
            show_platform_profile "${2:-}"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            echo -e "${RED}Unknown command: $1${NC}"
            usage
            exit 1
            ;;
    esac
}

# Nur ausfuehren wenn direkt aufgerufen (nicht beim Sourcen)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
