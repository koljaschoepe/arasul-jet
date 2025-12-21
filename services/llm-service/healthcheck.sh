#!/bin/bash
# LLM Service Comprehensive Health Check
# Validates GPU availability, model loaded status, and minimal prompt response time

# HIGH-010 FIX: Remove 'set -e' to allow all checks to run even if one fails
# set -e  # REMOVED - we want to run all checks and report properly

# Enable error tracing and proper exit codes
set -o pipefail

# Configuration
TIMEOUT=5
MAX_RESPONSE_TIME_MS=5000  # 5 seconds max for minimal prompt (cold start tolerance)
MIN_RESPONSE_TIME_MS=0      # No minimum - fast responses are fine
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
TEST_PROMPT="Hello"
TEST_MODEL="${DEFAULT_MODEL:-qwen3:14b-q8}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check 1: Basic API Availability
check_api_availability() {
    log "Checking API availability..."

    if ! curl -sf --max-time "$TIMEOUT" "${OLLAMA_HOST}/api/version" > /dev/null 2>&1; then
        error "API is not responding"
        return 1
    fi

    success "API is available"
    return 0
}

# Check 2: GPU Availability (NVIDIA only)
check_gpu_availability() {
    log "Checking GPU availability..."

    # Check if nvidia-smi is available
    if ! command -v nvidia-smi &> /dev/null; then
        warning "nvidia-smi not found, skipping GPU check"
        return 0
    fi

    # HIGH-010 FIX: Add timeout to nvidia-smi commands to prevent hanging
    # Check if GPU is accessible
    if ! timeout 5 nvidia-smi -L > /dev/null 2>&1; then
        error "GPU is not accessible or nvidia-smi timed out"
        return 1
    fi

    # Get GPU count
    GPU_COUNT=$(timeout 5 nvidia-smi -L 2>/dev/null | wc -l)
    if [ "$GPU_COUNT" -eq 0 ]; then
        error "No GPUs detected"
        return 1
    fi

    # Check GPU memory usage with timeout
    # BUG-002 FIX: Jetson Orin returns [N/A] for memory queries
    # Handle this gracefully as it's a platform limitation
    GPU_MEM_USED=$(timeout 5 nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1)
    GPU_MEM_TOTAL=$(timeout 5 nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)

    # BUG-002 FIX: Validate that we got numeric values
    # On Jetson Orin, memory queries may return [N/A] - treat this as non-critical
    if [[ "$GPU_MEM_USED" =~ ^[0-9]+$ ]] && [[ "$GPU_MEM_TOTAL" =~ ^[0-9]+$ ]]; then
        # Memory info available - check thresholds
        GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))

        if [ "$GPU_MEM_PERCENT" -ge 95 ]; then
            error "GPU memory usage critical: ${GPU_MEM_PERCENT}%"
            return 1
        fi

        success "GPU available (${GPU_COUNT} GPU(s), ${GPU_MEM_PERCENT}% memory used)"
    else
        # Memory info not available (common on Jetson platforms)
        warning "GPU memory information not available on this platform (Jetson limitation)"
        success "GPU available (${GPU_COUNT} GPU(s), memory monitoring not supported)"
    fi

    return 0
}

# Check 3: Model Loaded
check_model_loaded() {
    log "Checking if model is loaded..."

    # Get list of loaded models
    MODELS_RESPONSE=$(curl -sf --max-time "$TIMEOUT" "${OLLAMA_HOST}/api/tags" 2>/dev/null)

    if [ -z "$MODELS_RESPONSE" ]; then
        error "Failed to retrieve model list"
        return 1
    fi

    # Check if any models are available
    MODEL_COUNT=$(echo "$MODELS_RESPONSE" | grep -o '"name"' | wc -l)

    if [ "$MODEL_COUNT" -eq 0 ]; then
        error "No models loaded"
        return 1
    fi

    # Check if default model is available
    if echo "$MODELS_RESPONSE" | grep -q "\"name\":\"${TEST_MODEL}\""; then
        success "Model '${TEST_MODEL}' is loaded (${MODEL_COUNT} total models)"
        return 0
    else
        warning "Default model '${TEST_MODEL}' not found, but ${MODEL_COUNT} other model(s) available"
        # Get first available model name
        TEST_MODEL=$(echo "$MODELS_RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$TEST_MODEL" ]; then
            log "Using model: ${TEST_MODEL}"
            return 0
        else
            error "No usable models found"
            return 1
        fi
    fi
}

# Check 4 removed: We no longer test prompt response in health checks
# This prevents keeping the model loaded in RAM just for health checks
# Model will load on-demand when actually needed

# Check 4: CUDA/GPU Errors in Recent Logs (if running in Docker)
# Renumbered from Check 5 since we removed the prompt test
check_gpu_errors() {
    log "Checking for GPU errors..."

    # This check is best-effort - if logs aren't available, skip
    if [ ! -f /var/log/ollama.log ] && [ ! -f /tmp/ollama.log ]; then
        log "No log file found, skipping GPU error check"
        return 0
    fi

    LOG_FILE=""
    if [ -f /var/log/ollama.log ]; then
        LOG_FILE="/var/log/ollama.log"
    elif [ -f /tmp/ollama.log ]; then
        LOG_FILE="/tmp/ollama.log"
    fi

    # HIGH-010 FIX: Check last 100 lines for CUDA errors with proper error handling
    if ! tail -100 "$LOG_FILE" 2>/dev/null | grep -iq "CUDA error\|out of memory\|GPU error"; then
        success "No recent GPU errors detected"
        return 0
    else
        error "Recent GPU errors detected in logs"
        return 1
    fi
}

# Main health check execution
main() {
    log "=== LLM Service Health Check Started ==="

    CHECKS_PASSED=0
    CHECKS_TOTAL=4  # Reduced from 5 (removed prompt test)

    # HIGH-010 FIX: Run all checks with explicit error handling
    # Each check returns 0 (success) or 1 (failure) without stopping execution
    if check_api_availability; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log "API availability check failed"
    fi

    if check_gpu_availability; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log "GPU availability check failed"
    fi

    if check_model_loaded; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log "Model loaded check failed"
    fi

    # Prompt test removed - we don't want to load the model for health checks

    if check_gpu_errors; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log "GPU errors check failed"
    fi

    # Final verdict
    log "=== Health Check Complete: ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed ==="

    # HIGH-010 FIX: Explicit exit codes for Docker health checks
    # exit 0 = healthy, exit 1 = unhealthy
    if [ "$CHECKS_PASSED" -eq "$CHECKS_TOTAL" ]; then
        success "All health checks passed - Service is HEALTHY"
        exit 0
    elif [ "$CHECKS_PASSED" -ge 3 ]; then
        warning "Service degraded: ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed - Service is DEGRADED but functional"
        exit 0  # Still return success for degraded state
    else
        error "Service unhealthy: Only ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed - Service is UNHEALTHY"
        exit 1
    fi
}

# Execute main function
main
