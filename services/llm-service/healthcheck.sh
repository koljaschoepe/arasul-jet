#!/bin/bash
# LLM Service Comprehensive Health Check
# Validates GPU availability, model loaded status, and minimal prompt response time

set -e

# Configuration
TIMEOUT=5
MAX_RESPONSE_TIME_MS=2000  # 2 seconds max for minimal prompt
MIN_RESPONSE_TIME_MS=50     # Sanity check - response should take at least 50ms
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
TEST_PROMPT="Hello"
TEST_MODEL="${DEFAULT_MODEL:-llama2}"

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

    # Check if GPU is accessible
    if ! nvidia-smi -L > /dev/null 2>&1; then
        error "GPU is not accessible"
        return 1
    fi

    # Get GPU count
    GPU_COUNT=$(nvidia-smi -L | wc -l)
    if [ "$GPU_COUNT" -eq 0 ]; then
        error "No GPUs detected"
        return 1
    fi

    # Check GPU memory usage
    GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
    GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
    GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))

    if [ "$GPU_MEM_PERCENT" -ge 95 ]; then
        error "GPU memory usage critical: ${GPU_MEM_PERCENT}%"
        return 1
    fi

    success "GPU available (${GPU_COUNT} GPU(s), ${GPU_MEM_PERCENT}% memory used)"
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

# Check 4: Minimal Prompt Test with Response Time Validation
check_prompt_response() {
    log "Testing minimal prompt response..."

    # Create temporary file for response
    TEMP_RESPONSE=$(mktemp)
    trap "rm -f $TEMP_RESPONSE" EXIT

    # Measure response time
    START_TIME=$(date +%s%N)

    # Send minimal prompt
    HTTP_CODE=$(curl -sf --max-time "$TIMEOUT" \
        -w "%{http_code}" \
        -o "$TEMP_RESPONSE" \
        -X POST "${OLLAMA_HOST}/api/generate" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"${TEST_MODEL}\",
            \"prompt\": \"${TEST_PROMPT}\",
            \"stream\": false,
            \"options\": {
                \"num_predict\": 10,
                \"temperature\": 0.1
            }
        }" 2>/dev/null)

    END_TIME=$(date +%s%N)

    # Calculate response time in milliseconds
    RESPONSE_TIME_NS=$((END_TIME - START_TIME))
    RESPONSE_TIME_MS=$((RESPONSE_TIME_NS / 1000000))

    # Check HTTP status
    if [ "$HTTP_CODE" != "200" ]; then
        error "Prompt test failed with HTTP ${HTTP_CODE}"
        return 1
    fi

    # Validate response contains expected fields
    if ! grep -q '"response"' "$TEMP_RESPONSE"; then
        error "Response missing 'response' field"
        return 1
    fi

    # Check response time constraints
    if [ "$RESPONSE_TIME_MS" -lt "$MIN_RESPONSE_TIME_MS" ]; then
        warning "Response suspiciously fast (${RESPONSE_TIME_MS}ms) - possible cached response"
    elif [ "$RESPONSE_TIME_MS" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        error "Response too slow (${RESPONSE_TIME_MS}ms > ${MAX_RESPONSE_TIME_MS}ms)"
        return 1
    fi

    success "Prompt response validated (${RESPONSE_TIME_MS}ms)"
    return 0
}

# Check 5: CUDA/GPU Errors in Recent Logs (if running in Docker)
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

    # Check last 100 lines for CUDA errors
    if tail -100 "$LOG_FILE" 2>/dev/null | grep -iq "CUDA error\|out of memory\|GPU error"; then
        error "Recent GPU errors detected in logs"
        return 1
    fi

    success "No recent GPU errors detected"
    return 0
}

# Main health check execution
main() {
    log "=== LLM Service Health Check Started ==="

    CHECKS_PASSED=0
    CHECKS_TOTAL=5

    # Run all checks
    if check_api_availability; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if check_gpu_availability; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if check_model_loaded; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if check_prompt_response; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if check_gpu_errors; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    # Final verdict
    log "=== Health Check Complete: ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed ==="

    if [ "$CHECKS_PASSED" -eq "$CHECKS_TOTAL" ]; then
        success "All health checks passed"
        exit 0
    elif [ "$CHECKS_PASSED" -ge 3 ]; then
        warning "Service degraded: ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed"
        exit 0  # Still return success for degraded state
    else
        error "Service unhealthy: Only ${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed"
        exit 1
    fi
}

# Execute main function
main
