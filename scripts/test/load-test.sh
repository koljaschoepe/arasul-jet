#!/bin/bash
# ARASUL PLATFORM - Load Test Script
# Tests API endpoints under concurrent load.
#
# Usage:
#   ./scripts/test/load-test.sh                    # Default: 20 concurrent, 100 total
#   ./scripts/test/load-test.sh --concurrent 50    # Custom concurrency
#   ./scripts/test/load-test.sh --total 500        # Custom total requests
#
# Prerequisites: curl, bc (standard Linux tools)

set -euo pipefail

# Configuration
BASE_URL="${BASE_URL:-http://localhost}"
CONCURRENT=${CONCURRENT:-20}
TOTAL=${TOTAL:-100}
AUTH_TOKEN="${AUTH_TOKEN:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --concurrent) CONCURRENT="$2"; shift 2 ;;
        --total) TOTAL="$2"; shift 2 ;;
        --url) BASE_URL="$2"; shift 2 ;;
        --token) AUTH_TOKEN="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Get auth token if not provided
if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}No auth token provided. Attempting login...${NC}"
    AUTH_RESPONSE=$(curl -sf "${BASE_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin"}' 2>/dev/null || echo "")

    if [ -n "$AUTH_RESPONSE" ]; then
        AUTH_TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
    fi

    if [ -z "$AUTH_TOKEN" ]; then
        echo -e "${YELLOW}Could not obtain auth token. Testing public endpoints only.${NC}"
    fi
fi

RESULTS_DIR=$(mktemp -d)
PASS=0
FAIL=0
TOTAL_TIME=0

# Run a single request and record timing
run_request() {
    local endpoint="$1"
    local idx="$2"
    local auth_args=()
    [ -n "$AUTH_TOKEN" ] && auth_args=(-H "Authorization: Bearer ${AUTH_TOKEN}")

    local start=$(date +%s%N)
    local status
    status=$(curl -sf -o /dev/null -w '%{http_code}' \
        --connect-timeout 5 --max-time 30 \
        "${auth_args[@]}" \
        "${BASE_URL}${endpoint}" 2>/dev/null) || status="000"
    local end=$(date +%s%N)
    local duration_ms=$(( (end - start) / 1000000 ))

    echo "${status} ${duration_ms}" > "${RESULTS_DIR}/${idx}.result"
}

# Run load test against an endpoint
load_test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local count="$3"

    echo ""
    echo -e "${BLUE}=== ${name} ===${NC}"
    echo -e "  Endpoint: ${endpoint}"
    echo -e "  Requests: ${count}, Concurrent: ${CONCURRENT}"

    local start_time=$(date +%s%N)

    # Launch requests in batches of $CONCURRENT
    local launched=0
    while [ $launched -lt "$count" ]; do
        local batch_end=$((launched + CONCURRENT))
        [ $batch_end -gt "$count" ] && batch_end=$count

        for i in $(seq $launched $((batch_end - 1))); do
            run_request "$endpoint" "$i" &
        done
        wait

        launched=$batch_end
    done

    local end_time=$(date +%s%N)
    local total_ms=$(( (end_time - start_time) / 1000000 ))

    # Analyze results
    local ok=0
    local fail=0
    local min_ms=999999
    local max_ms=0
    local sum_ms=0

    for f in "${RESULTS_DIR}"/*.result; do
        read -r status duration < "$f"
        if [ "$status" -ge 200 ] 2>/dev/null && [ "$status" -lt 400 ] 2>/dev/null; then
            ok=$((ok + 1))
        else
            fail=$((fail + 1))
        fi
        sum_ms=$((sum_ms + duration))
        [ "$duration" -lt "$min_ms" ] && min_ms=$duration
        [ "$duration" -gt "$max_ms" ] && max_ms=$duration
    done

    local avg_ms=$((sum_ms / count))
    local rps=$(echo "scale=1; $count * 1000 / $total_ms" | bc 2>/dev/null || echo "N/A")

    echo -e "  ${GREEN}OK: ${ok}${NC}  ${RED}Fail: ${fail}${NC}"
    echo -e "  Latency: min=${min_ms}ms avg=${avg_ms}ms max=${max_ms}ms"
    echo -e "  Throughput: ${rps} req/s"
    echo -e "  Total time: ${total_ms}ms"

    PASS=$((PASS + ok))
    FAIL=$((FAIL + fail))

    # Cleanup results for next test
    rm -f "${RESULTS_DIR}"/*.result

    # Warn if response time too high
    if [ "$avg_ms" -gt 2000 ]; then
        echo -e "  ${RED}WARNING: Average response time > 2s${NC}"
    fi
}

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  ARASUL PLATFORM - Load Test${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  Target: ${BASE_URL}"
echo -e "  Concurrency: ${CONCURRENT}"
echo -e "  Total requests per endpoint: ${TOTAL}"

# Test 1: Health endpoint (public, should be fastest)
load_test_endpoint "Health Check" "/api/health" "$TOTAL"

# Test 2: System info (authenticated)
if [ -n "$AUTH_TOKEN" ]; then
    load_test_endpoint "System Info" "/api/system/info" "$((TOTAL / 2))"

    # Test 3: Chats list
    load_test_endpoint "Chats List" "/api/chats" "$((TOTAL / 2))"
fi

# Cleanup
rm -rf "$RESULTS_DIR"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Results Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "  Total: $((PASS + FAIL)) requests"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
echo -e "  ${RED}Failed: ${FAIL}${NC}"

if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}LOAD TEST FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}LOAD TEST PASSED${NC}"
fi
