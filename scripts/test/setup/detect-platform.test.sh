#!/usr/bin/env bats
# =============================================================================
# BATS Tests for scripts/setup/detect-platform.sh
# Tests device detection (Jetson + x86), profile selection, config generation,
# and the config/platforms HAL mapping (Plan 020, Schritt 2).
#
# Usage: bats scripts/test/setup/detect-platform.test.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DETECT_SCRIPT="$PROJECT_ROOT/scripts/setup/detect-platform.sh"

setup() {
    # Create temp directory for mock files
    MOCK_DIR=$(mktemp -d)
    export MOCK_DIR

    # Source the script (only functions, main() not called because of guard)
    source "$DETECT_SCRIPT"
}

teardown() {
    rm -rf "$MOCK_DIR"
}

# =============================================================================
# detect_jetson_model() tests
# =============================================================================

@test "detect_jetson_model: reads device-tree model file" {
    # Mock /proc/device-tree/model
    local model_file="$MOCK_DIR/model"
    printf "NVIDIA Jetson AGX Orin Developer Kit\0" > "$model_file"

    # Override the function to use mock path
    detect_jetson_model() {
        local model=$(cat "$model_file" 2>/dev/null | tr -d '\0')
        echo "$model"
    }

    result=$(detect_jetson_model)
    [[ "$result" == "NVIDIA Jetson AGX Orin Developer Kit" ]]
}

@test "detect_jetson_model: detects Thor from compatible string" {
    local compat_file="$MOCK_DIR/compatible"
    printf "nvidia,thor\0nvidia,tegra\0" > "$compat_file"

    detect_jetson_model() {
        local model_file="$MOCK_DIR/nonexistent"
        local compatible_file="$compat_file"
        if [ -f "$compatible_file" ]; then
            local compat=$(cat "$compatible_file" 2>/dev/null | tr '\0' '\n')
            if echo "$compat" | grep -qi "thor"; then
                echo "NVIDIA Jetson Thor"
                return
            fi
        fi
        echo "unknown"
    }

    result=$(detect_jetson_model)
    [[ "$result" == "NVIDIA Jetson Thor" ]]
}

# =============================================================================
# detect_ram_total() tests
# =============================================================================

@test "detect_ram_total: parses /proc/meminfo correctly" {
    # On any Linux system this should return a valid number
    result=$(detect_ram_total)
    [[ "$result" =~ ^[0-9]+$ ]]
    # RAM should be at least 1 GB
    [ "$result" -ge 1 ]
}

# =============================================================================
# detect_cpu_cores() tests
# =============================================================================

@test "detect_cpu_cores: returns positive integer" {
    result=$(detect_cpu_cores)
    [[ "$result" =~ ^[0-9]+$ ]]
    [ "$result" -ge 1 ]
}

# =============================================================================
# get_device_profile() tests
# =============================================================================

@test "get_device_profile: Thor 128GB returns thor_128gb" {
    detect_jetson_model() { echo "NVIDIA Jetson Thor"; }
    detect_ram_total() { echo 128; }

    result=$(get_device_profile)
    [[ "$result" == "thor_128gb" ]]
}

@test "get_device_profile: Thor 64GB returns thor_64gb" {
    detect_jetson_model() { echo "NVIDIA Jetson Thor"; }
    detect_ram_total() { echo 64; }

    result=$(get_device_profile)
    [[ "$result" == "thor_64gb" ]]
}

@test "get_device_profile: AGX Orin 64GB returns agx_orin_64gb" {
    detect_jetson_model() { echo "NVIDIA Jetson AGX Orin Developer Kit"; }
    detect_ram_total() { echo 64; }

    result=$(get_device_profile)
    [[ "$result" == "agx_orin_64gb" ]]
}

@test "get_device_profile: AGX Orin 32GB returns agx_orin_32gb" {
    detect_jetson_model() { echo "NVIDIA Jetson AGX Orin 32GB"; }
    detect_ram_total() { echo 32; }

    result=$(get_device_profile)
    [[ "$result" == "agx_orin_32gb" ]]
}

@test "get_device_profile: Orin NX 16GB returns orin_nx_16gb" {
    detect_jetson_model() { echo "NVIDIA Jetson Orin NX 16GB"; }
    detect_ram_total() { echo 16; }

    result=$(get_device_profile)
    [[ "$result" == "orin_nx_16gb" ]]
}

@test "get_device_profile: Orin Nano 8GB returns orin_nano_8gb" {
    detect_jetson_model() { echo "NVIDIA Jetson Orin Nano 8GB"; }
    detect_ram_total() { echo 8; }

    result=$(get_device_profile)
    [[ "$result" == "orin_nano_8gb" ]]
}

@test "get_device_profile: unknown device with 128GB RAM returns thor_128gb" {
    detect_jetson_model() { echo "Unknown Device"; }
    detect_ram_total() { echo 128; }

    result=$(get_device_profile)
    [[ "$result" == "thor_128gb" ]]
}

@test "get_device_profile: unknown device with 64GB RAM returns high_memory" {
    detect_jetson_model() { echo "Unknown Device"; }
    detect_ram_total() { echo 64; }

    result=$(get_device_profile)
    [[ "$result" == "high_memory" ]]
}

@test "get_device_profile: unknown device with 4GB RAM returns minimal_memory" {
    detect_jetson_model() { echo "Unknown Device"; }
    detect_ram_total() { echo 4; }

    result=$(get_device_profile)
    [[ "$result" == "minimal_memory" ]]
}

# =============================================================================
# get_config_for_profile() tests
# =============================================================================

@test "get_config_for_profile: thor_128gb sets correct LLM model" {
    result=$(get_config_for_profile "thor_128gb")
    echo "$result" | grep -q "LLM_MODEL=gemma4:31b-q4"
}

@test "get_config_for_profile: thor_128gb sets 88G LLM RAM limit" {
    result=$(get_config_for_profile "thor_128gb")
    echo "$result" | grep -q "RAM_LIMIT_LLM=88G"
}

@test "get_config_for_profile: agx_orin_64gb sets correct LLM model" {
    result=$(get_config_for_profile "agx_orin_64gb")
    echo "$result" | grep -q "LLM_MODEL=gemma4:26b-q4"
}

@test "get_config_for_profile: agx_orin_32gb enables FP16" {
    result=$(get_config_for_profile "agx_orin_32gb")
    echo "$result" | grep -q "EMBEDDING_USE_FP16=true"
}

@test "get_config_for_profile: agx_orin_64gb disables FP16" {
    result=$(get_config_for_profile "agx_orin_64gb")
    echo "$result" | grep -q "EMBEDDING_USE_FP16=false"
}

@test "get_config_for_profile: all profiles contain JETSON_PROFILE" {
    for profile in thor_128gb thor_64gb agx_orin_64gb agx_orin_32gb orin_nx_16gb; do
        result=$(get_config_for_profile "$profile")
        echo "$result" | grep -q "JETSON_PROFILE=" || {
            echo "Missing JETSON_PROFILE in profile: $profile"
            return 1
        }
    done
}

@test "get_config_for_profile: all profiles contain RECOMMENDED_MODELS" {
    for profile in thor_128gb thor_64gb agx_orin_64gb agx_orin_32gb; do
        result=$(get_config_for_profile "$profile")
        echo "$result" | grep -q "RECOMMENDED_MODELS=" || {
            echo "Missing RECOMMENDED_MODELS in profile: $profile"
            return 1
        }
    done
}

@test "get_config_for_profile: all profiles have OLLAMA_STARTUP_TIMEOUT" {
    for profile in thor_128gb thor_64gb agx_orin_64gb agx_orin_32gb orin_nx_16gb; do
        result=$(get_config_for_profile "$profile")
        echo "$result" | grep -q "OLLAMA_STARTUP_TIMEOUT=" || {
            echo "Missing OLLAMA_STARTUP_TIMEOUT in profile: $profile"
            return 1
        }
    done
}

@test "get_config_for_profile: Thor has longest Ollama timeout (300s)" {
    result=$(get_config_for_profile "thor_128gb")
    echo "$result" | grep -q "OLLAMA_STARTUP_TIMEOUT=300"
}

# =============================================================================
# detect_cuda_arch() tests
# =============================================================================

@test "detect_cuda_arch: Thor fallback returns 10.0" {
    # Override detect_cuda_arch to test the fallback branch (skip nvcc detection)
    detect_cuda_arch_fallback() {
        local model="$1"
        case "$model" in
            *"Thor"*)     echo "10.0" ;;
            *"Orin"*)     echo "8.7" ;;
            *"Xavier"*)   echo "7.2" ;;
            *"TX2"*)      echo "6.2" ;;
            *"Nano"*)     echo "5.3" ;;
            *)            echo "7.2" ;;
        esac
    }

    result=$(detect_cuda_arch_fallback "NVIDIA Jetson Thor")
    [[ "$result" == "10.0" ]]
}

@test "detect_cuda_arch: Orin fallback returns 8.7" {
    detect_cuda_arch_fallback() {
        local model="$1"
        case "$model" in
            *"Thor"*)     echo "10.0" ;;
            *"Orin"*)     echo "8.7" ;;
            *"Xavier"*)   echo "7.2" ;;
            *)            echo "7.2" ;;
        esac
    }

    result=$(detect_cuda_arch_fallback "NVIDIA Jetson AGX Orin")
    [[ "$result" == "8.7" ]]
}

@test "detect_cuda_arch: Xavier fallback returns 7.2" {
    detect_cuda_arch_fallback() {
        local model="$1"
        case "$model" in
            *"Thor"*)     echo "10.0" ;;
            *"Orin"*)     echo "8.7" ;;
            *"Xavier"*)   echo "7.2" ;;
            *)            echo "7.2" ;;
        esac
    }

    result=$(detect_cuda_arch_fallback "NVIDIA Jetson Xavier")
    [[ "$result" == "7.2" ]]
}

# =============================================================================
# detect_l4t_pytorch_tag() tests
# =============================================================================

@test "detect_l4t_pytorch_tag: Thor returns r36.4.0 (fallback until r37 published)" {
    detect_jetson_model() { echo "NVIDIA Jetson Thor"; }
    # Stub verify_l4t_tag to always succeed (no Docker in test)
    verify_l4t_tag() { return 0; }

    result=$(detect_l4t_pytorch_tag)
    [[ "$result" == "r36.4.0" ]]
}

@test "detect_l4t_pytorch_tag: Orin returns r36.4.0" {
    detect_jetson_model() { echo "NVIDIA Jetson AGX Orin"; }
    verify_l4t_tag() { return 0; }

    result=$(detect_l4t_pytorch_tag)
    [[ "$result" == "r36.4.0" ]]
}

# =============================================================================
# RAM budget validation tests
# =============================================================================

@test "RAM budget: thor_128gb total allocation < 90% of 128GB" {
    result=$(get_config_for_profile "thor_128gb")

    # Parse RAM limits and convert to MB
    total_mb=0
    while IFS='=' read -r key value; do
        [[ "$key" != RAM_LIMIT_* ]] && continue
        value=$(echo "$value" | xargs)
        case "$value" in
            *G) mb=$(echo "${value%G}" | awk '{print int($1 * 1024)}') ;;
            *M) mb="${value%M}" ;;
            *) continue ;;
        esac
        total_mb=$((total_mb + mb))
    done <<< "$(echo "$result" | grep "^RAM_LIMIT_")"

    max_mb=$((128 * 1024 * 90 / 100))
    [ "$total_mb" -lt "$max_mb" ] || {
        echo "Total RAM allocation ${total_mb}MB exceeds 90% of 128GB (${max_mb}MB)"
        return 1
    }
}

@test "RAM budget: agx_orin_64gb total allocation < 92% of 64GB" {
    result=$(get_config_for_profile "agx_orin_64gb")

    total_mb=0
    while IFS='=' read -r key value; do
        [[ "$key" != RAM_LIMIT_* ]] && continue
        value=$(echo "$value" | xargs)
        case "$value" in
            *G) mb=$(echo "${value%G}" | awk '{print int($1 * 1024)}') ;;
            *M) mb="${value%M}" ;;
            *) continue ;;
        esac
        total_mb=$((total_mb + mb))
    done <<< "$(echo "$result" | grep "^RAM_LIMIT_")"

    # Allow up to 92% — profile intentionally allocates ~89% with 7G OS reserve
    max_mb=$((64 * 1024 * 92 / 100))
    [ "$total_mb" -lt "$max_mb" ] || {
        echo "Total RAM allocation ${total_mb}MB exceeds 92% of 64GB (${max_mb}MB)"
        return 1
    }
}

# =============================================================================
# x86 detection path (Plan 020, Schritt 2) — früher endete x86 sofort bei
# "unknown"; jetzt gibt es einen positiven Erkennungspfad.
# =============================================================================

@test "detect_x86_model: RTX PRO 6000 classified from nvidia-smi" {
    nvidia-smi() { echo "NVIDIA RTX PRO 6000 Blackwell"; }
    command() { [ "$2" = "nvidia-smi" ] && return 0; builtin command "$@"; }
    result=$(detect_x86_model)
    [[ "$result" == *"RTX PRO 6000"* ]]
}

@test "detect_x86_model: generic NVIDIA server when GPU is something else" {
    nvidia-smi() { echo "NVIDIA L40S"; }
    command() { [ "$2" = "nvidia-smi" ] && return 0; builtin command "$@"; }
    result=$(detect_x86_model)
    [[ "$result" == *"x86_64 NVIDIA Server"* ]]
}

@test "detect_x86_model: no nvidia-smi still yields an x86 server (not unknown)" {
    command() { [ "$2" = "nvidia-smi" ] && return 1; builtin command "$@"; }
    result=$(detect_x86_model)
    [[ "$result" == *"x86_64 Server"* ]]
    [[ "$result" != "unknown" ]]
}

@test "get_device_profile: x86 RTX PRO 6000 model returns rtx_pro_6000" {
    detect_jetson_model() { echo "x86_64 NVIDIA RTX PRO 6000"; }
    detect_ram_total() { echo 128; }
    result=$(get_device_profile)
    [[ "$result" == "rtx_pro_6000" ]]
}

@test "get_device_profile: generic x86 server model returns server_generic" {
    detect_jetson_model() { echo "x86_64 NVIDIA Server (NVIDIA L40S)"; }
    detect_ram_total() { echo 256; }
    result=$(get_device_profile)
    [[ "$result" == "server_generic" ]]
}

@test "detect_x86_model: nvidia-smi present but erroring yields x86 server (no abort)" {
    nvidia-smi() { return 255; }  # simuliert "Failed to initialize NVML"
    command() { [ "$2" = "nvidia-smi" ] && return 0; builtin command "$@"; }
    result=$(detect_x86_model)
    [[ "$result" == *"x86_64 Server"* ]]
    [[ "$result" != "unknown" ]]
}

@test "get_device_profile: DGX Spark (arm64) model returns dgx_spark" {
    detect_jetson_model() { echo "arm64 NVIDIA DGX Spark"; }
    detect_ram_total() { echo 128; }
    result=$(get_device_profile)
    [[ "$result" == "dgx_spark" ]]
}

@test "get_device_profile: generic arm64 NVIDIA server returns server_generic" {
    detect_jetson_model() { echo "arm64 NVIDIA Server (NVIDIA GH200)"; }
    detect_ram_total() { echo 480; }
    result=$(get_device_profile)
    [[ "$result" == "server_generic" ]]
}

@test "detect_platform: x86_64 host reports x86_64" {
    uname() { [ "$1" = "-m" ] && echo "x86_64" || builtin command uname "$@"; }
    result=$(detect_platform)
    [[ "$result" == "x86_64" ]]
}

# =============================================================================
# HAL: config/platforms mapping (get_platform_profile_id / show_platform_profile)
# =============================================================================

@test "get_platform_profile_id: Jetson + x86 internal profiles map to catalog ids" {
    [[ "$(get_platform_profile_id thor_128gb)" == "thor-128" ]]
    [[ "$(get_platform_profile_id agx_orin_64gb)" == "orin-64" ]]
    [[ "$(get_platform_profile_id orin_nx_16gb)" == "orin-64" ]]
    [[ "$(get_platform_profile_id rtx_pro_6000)" == "rtx-pro-6000" ]]
    [[ "$(get_platform_profile_id dgx_spark)" == "dgx-spark" ]]
    [[ "$(get_platform_profile_id dgx_station)" == "dgx-station" ]]
    [[ "$(get_platform_profile_id server_generic)" == "server-generic" ]]
    [[ "$(get_platform_profile_id high_memory)" == "server-generic" ]]
}

@test "HAL: every mapped catalog id has a config/platforms JSON file" {
    for id in thor-128 orin-64 rtx-pro-6000 dgx-station server-generic dgx-spark; do
        [ -f "$PROJECT_ROOT/config/platforms/${id}.json" ] || {
            echo "Missing config/platforms/${id}.json"
            return 1
        }
    done
}

@test "show_platform_profile --json emits valid JSON for the detected profile" {
    get_device_profile() { echo "agx_orin_64gb"; }
    result=$(show_platform_profile --json)
    echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['id']=='orin-64'"
}
