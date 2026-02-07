#!/bin/bash
# =============================================================================
# Jetson Device Detection and Configuration Script
# Supports: AGX Orin, Orin NX, Orin Nano, Xavier NX, Xavier AGX, Nano
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# Device Detection Functions
# =============================================================================

detect_jetson_model() {
    local model_file="/proc/device-tree/model"
    local tegra_file="/sys/module/tegra_fuse/parameters/tegra_chip_id"

    if [ -f "$model_file" ]; then
        cat "$model_file" 2>/dev/null | tr -d '\0'
    elif [ -f "$tegra_file" ]; then
        local chip_id=$(cat "$tegra_file" 2>/dev/null)
        case "$chip_id" in
            "35") echo "NVIDIA Jetson AGX Orin" ;;
            "33") echo "NVIDIA Jetson Xavier" ;;
            "25") echo "NVIDIA Jetson TX2" ;;
            "24") echo "NVIDIA Jetson TX1" ;;
            "21") echo "NVIDIA Jetson Nano" ;;
            *) echo "Unknown Jetson (Chip ID: $chip_id)" ;;
        esac
    else
        echo "Unknown (not a Jetson device)"
    fi
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
    # Detect CUDA compute capability
    if command -v nvcc &> /dev/null; then
        # Try to detect from nvcc
        local arch=$(nvcc --list-gpu-arch 2>/dev/null | tail -1 | sed 's/compute_//' | sed 's/sm_//')
        if [ -n "$arch" ]; then
            echo "${arch:0:1}.${arch:1}"
            return
        fi
    fi

    # Fallback based on device model
    local model=$(detect_jetson_model)
    case "$model" in
        *"Orin"*)     echo "8.7" ;;
        *"Xavier"*)   echo "7.2" ;;
        *"TX2"*)      echo "6.2" ;;
        *"Nano"*)     echo "5.3" ;;
        *)            echo "7.2" ;;  # Safe default
    esac
}

# =============================================================================
# Configuration Profiles
# =============================================================================

get_device_profile() {
    local model=$(detect_jetson_model)
    local ram=$(detect_ram_total)

    # Determine profile based on model and RAM
    case "$model" in
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
        *)
            # Auto-detect based on RAM
            if [ "$ram" -ge 60 ]; then
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
# Resource Configuration per Profile
# =============================================================================

get_config_for_profile() {
    local profile=$1

    case "$profile" in
        "agx_orin_64gb")
            cat << 'EOF'
# AGX Orin 64GB - Maximum Performance
JETSON_PROFILE=agx_orin_64gb
JETSON_DESCRIPTION="NVIDIA Jetson AGX Orin 64GB"

# Resource Limits
RAM_LIMIT_POSTGRES=2G
RAM_LIMIT_LLM=48G
RAM_LIMIT_EMBEDDING=8G
RAM_LIMIT_BACKEND=2G
RAM_LIMIT_FRONTEND=1G
RAM_LIMIT_N8N=2G
RAM_LIMIT_QDRANT=4G
RAM_LIMIT_MINIO=4G
RAM_LIMIT_METRICS=512M
RAM_LIMIT_SELF_HEALING=512M
RAM_LIMIT_TELEGRAM=256M
RAM_LIMIT_DOCUMENT_INDEXER=2G
RAM_LIMIT_REVERSE_PROXY=512M
RAM_LIMIT_BACKUP=256M

# CPU Limits
CPU_LIMIT_LLM=10
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_N8N=2

# LLM Configuration
LLM_MODEL=qwen3:14b-q8
LLM_CONTEXT_LENGTH=16384
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=600
OLLAMA_STARTUP_TIMEOUT=180

# Embedding Configuration
EMBEDDING_USE_FP16=false
EMBEDDING_MAX_BATCH_SIZE=100

# Recommended Models (in order of capability)
RECOMMENDED_MODELS="qwen3:14b-q8,llama3.1:70b-q4,codellama:34b,mixtral:8x7b"
EOF
            ;;

        "agx_orin_32gb")
            cat << 'EOF'
# AGX Orin 32GB - High Performance
JETSON_PROFILE=agx_orin_32gb
JETSON_DESCRIPTION="NVIDIA Jetson AGX Orin 32GB"

# Resource Limits
RAM_LIMIT_POSTGRES=1G
RAM_LIMIT_LLM=24G
RAM_LIMIT_EMBEDDING=4G
RAM_LIMIT_BACKEND=1G
RAM_LIMIT_FRONTEND=512M
RAM_LIMIT_N8N=1G
RAM_LIMIT_QDRANT=2G
RAM_LIMIT_MINIO=2G
RAM_LIMIT_METRICS=256M
RAM_LIMIT_SELF_HEALING=256M
RAM_LIMIT_TELEGRAM=128M
RAM_LIMIT_DOCUMENT_INDEXER=1G
RAM_LIMIT_REVERSE_PROXY=384M
RAM_LIMIT_BACKUP=192M

# CPU Limits
CPU_LIMIT_LLM=8
CPU_LIMIT_EMBEDDING=4
CPU_LIMIT_BACKEND=4
CPU_LIMIT_N8N=2

# LLM Configuration
LLM_MODEL=qwen3:8b-q8
LLM_CONTEXT_LENGTH=8192
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=300
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=50

# Recommended Models
RECOMMENDED_MODELS="qwen3:8b-q8,llama3.1:8b,codellama:13b,mistral:7b"
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
RAM_LIMIT_N8N=768M
RAM_LIMIT_QDRANT=1G
RAM_LIMIT_MINIO=1G
RAM_LIMIT_METRICS=192M
RAM_LIMIT_SELF_HEALING=192M
RAM_LIMIT_TELEGRAM=96M
RAM_LIMIT_DOCUMENT_INDEXER=768M
RAM_LIMIT_REVERSE_PROXY=256M
RAM_LIMIT_BACKUP=128M

# CPU Limits
CPU_LIMIT_LLM=6
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_N8N=2

# LLM Configuration
LLM_MODEL=llama3.1:8b
LLM_CONTEXT_LENGTH=4096
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=180
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=25

# Recommended Models
RECOMMENDED_MODELS="llama3.1:8b,mistral:7b,phi3:mini,gemma:7b"
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
RAM_LIMIT_N8N=512M
RAM_LIMIT_QDRANT=512M
RAM_LIMIT_MINIO=512M
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_TELEGRAM=64M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=192M
RAM_LIMIT_BACKUP=96M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_N8N=1

# LLM Configuration
LLM_MODEL=phi3:mini
LLM_CONTEXT_LENGTH=2048
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=120
OLLAMA_STARTUP_TIMEOUT=90

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=10

# Recommended Models
RECOMMENDED_MODELS="phi3:mini,gemma:2b,tinyllama:1.1b,qwen:1.8b"
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
RAM_LIMIT_N8N=384M
RAM_LIMIT_QDRANT=256M
RAM_LIMIT_MINIO=256M
RAM_LIMIT_METRICS=64M
RAM_LIMIT_SELF_HEALING=64M
RAM_LIMIT_TELEGRAM=48M
RAM_LIMIT_DOCUMENT_INDEXER=256M
RAM_LIMIT_REVERSE_PROXY=128M
RAM_LIMIT_BACKUP=64M

# CPU Limits
CPU_LIMIT_LLM=2
CPU_LIMIT_EMBEDDING=1
CPU_LIMIT_BACKEND=1
CPU_LIMIT_N8N=1

# LLM Configuration
LLM_MODEL=tinyllama:1.1b
LLM_CONTEXT_LENGTH=1024
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=60
OLLAMA_STARTUP_TIMEOUT=60

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=5

# Recommended Models
RECOMMENDED_MODELS="tinyllama:1.1b,qwen:0.5b"

# Disable optional services for minimal footprint
DISABLE_N8N=true
DISABLE_TELEGRAM=true
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
RAM_LIMIT_N8N=1G
RAM_LIMIT_QDRANT=2G
RAM_LIMIT_MINIO=2G
RAM_LIMIT_METRICS=256M
RAM_LIMIT_SELF_HEALING=256M
RAM_LIMIT_TELEGRAM=128M
RAM_LIMIT_DOCUMENT_INDEXER=1G
RAM_LIMIT_REVERSE_PROXY=384M
RAM_LIMIT_BACKUP=192M

# CPU Limits
CPU_LIMIT_LLM=6
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_N8N=2

# LLM Configuration
LLM_MODEL=llama3.1:8b
LLM_CONTEXT_LENGTH=4096
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=300
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=25

# Recommended Models
RECOMMENDED_MODELS="llama3.1:8b,mistral:7b,codellama:7b"
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
RAM_LIMIT_N8N=512M
RAM_LIMIT_QDRANT=512M
RAM_LIMIT_MINIO=512M
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_TELEGRAM=64M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=192M
RAM_LIMIT_BACKUP=96M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_N8N=1

# LLM Configuration
LLM_MODEL=phi3:mini
LLM_CONTEXT_LENGTH=2048
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=120
OLLAMA_STARTUP_TIMEOUT=90

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=10

# Recommended Models
RECOMMENDED_MODELS="phi3:mini,gemma:2b,tinyllama:1.1b"
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
RAM_LIMIT_N8N=512M
RAM_LIMIT_QDRANT=1G
RAM_LIMIT_MINIO=1G
RAM_LIMIT_METRICS=128M
RAM_LIMIT_SELF_HEALING=128M
RAM_LIMIT_TELEGRAM=64M
RAM_LIMIT_DOCUMENT_INDEXER=512M
RAM_LIMIT_REVERSE_PROXY=256M
RAM_LIMIT_BACKUP=128M

# CPU Limits
CPU_LIMIT_LLM=4
CPU_LIMIT_EMBEDDING=2
CPU_LIMIT_BACKEND=2
CPU_LIMIT_N8N=1

# LLM Configuration
LLM_MODEL=mistral:7b
LLM_CONTEXT_LENGTH=4096
LLM_GPU_LAYERS=99
LLM_KEEP_ALIVE_SECONDS=180
OLLAMA_STARTUP_TIMEOUT=120

# Embedding Configuration
EMBEDDING_USE_FP16=true
EMBEDDING_MAX_BATCH_SIZE=20

# Recommended Models
RECOMMENDED_MODELS="mistral:7b,phi3:mini,gemma:2b"
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

show_recommendations() {
    local profile=$(get_device_profile)

    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}       Recommended LLM Models${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    case "$profile" in
        "agx_orin_64gb")
            echo -e "${GREEN}Best Performance:${NC}"
            echo "  - qwen3:14b-q8      (15GB) - Excellent quality"
            echo "  - llama3.1:70b-q4   (40GB) - Maximum capability"
            echo "  - codellama:34b     (19GB) - Best for coding"
            echo ""
            echo -e "${YELLOW}Also Supported:${NC}"
            echo "  - mixtral:8x7b      (26GB) - MoE architecture"
            echo "  - deepseek-coder:33b (18GB) - Code specialist"
            ;;
        "agx_orin_32gb"|"xavier_agx"*)
            echo -e "${GREEN}Recommended:${NC}"
            echo "  - qwen3:8b-q8       (8GB)  - Great balance"
            echo "  - llama3.1:8b       (5GB)  - Fast & capable"
            echo "  - codellama:13b     (7GB)  - Good for coding"
            echo ""
            echo -e "${YELLOW}Also Supported:${NC}"
            echo "  - mistral:7b        (4GB)  - Efficient"
            echo "  - gemma:7b          (5GB)  - Google's model"
            ;;
        "orin_nx_16gb")
            echo -e "${GREEN}Recommended:${NC}"
            echo "  - llama3.1:8b       (5GB)  - Best balance"
            echo "  - mistral:7b        (4GB)  - Fast responses"
            echo ""
            echo -e "${YELLOW}Also Supported:${NC}"
            echo "  - phi3:mini         (2GB)  - Very efficient"
            echo "  - gemma:7b          (5GB)  - Good quality"
            ;;
        "orin_8gb"|"xavier_nx"*)
            echo -e "${GREEN}Recommended:${NC}"
            echo "  - phi3:mini         (2GB)  - Best for 8GB"
            echo "  - gemma:2b          (1.5GB) - Lightweight"
            echo ""
            echo -e "${YELLOW}Also Supported:${NC}"
            echo "  - tinyllama:1.1b    (0.6GB) - Minimal"
            echo "  - qwen:1.8b         (1GB)   - Compact"
            ;;
        *)
            echo -e "${YELLOW}For your device, consider:${NC}"
            echo "  - phi3:mini         (2GB)  - Efficient"
            echo "  - tinyllama:1.1b    (0.6GB) - Minimal"
            ;;
    esac

    echo ""
    echo -e "${BLUE}Download a model:${NC}"
    echo "  docker exec llm-service ollama pull <model-name>"
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
    echo "  profile     Show current device profile name"
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

main "$@"
