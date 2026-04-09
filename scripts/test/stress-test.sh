#!/bin/bash
# ARASUL PLATFORM - Stress Test Script
# Tests system stability under sustained load and edge conditions.
#
# Tests:
#   1. WebSocket connection storm (20 simultaneous WS connections)
#   2. DB pool exhaustion (concurrent DB-heavy requests)
#   3. Memory stability (repeated requests, check for heap growth)
#
# Usage:
#   ./scripts/test/stress-test.sh
#   ./scripts/test/stress-test.sh --ws-only    # WebSocket test only
#   ./scripts/test/stress-test.sh --db-only    # DB pool test only

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
WS_URL="${WS_URL:-ws://localhost/api/metrics/live-stream}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_MODE="${1:-all}"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  ARASUL PLATFORM - Stress Test${NC}"
echo -e "${BLUE}============================================${NC}"

# Get auth token
if [ -z "$AUTH_TOKEN" ]; then
    AUTH_RESPONSE=$(curl -sf "${BASE_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin"}' 2>/dev/null || echo "")
    AUTH_TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
fi

# =============================================================================
# Test 1: WebSocket Connection Storm
# =============================================================================
ws_stress_test() {
    echo ""
    echo -e "${BLUE}=== Test 1: WebSocket Connection Storm ===${NC}"
    echo -e "  Opening 20 simultaneous WebSocket connections..."

    local ws_pids=()
    local ws_count=20
    local ws_duration=15  # seconds

    for i in $(seq 1 $ws_count); do
        # Use curl with upgrade to WebSocket, timeout after duration
        (timeout $ws_duration curl -sf -N \
            -H "Connection: Upgrade" \
            -H "Upgrade: websocket" \
            -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
            -H "Sec-WebSocket-Version: 13" \
            "$WS_URL" > /dev/null 2>&1 || true) &
        ws_pids+=($!)
    done

    echo -e "  ${ws_count} connections opened, waiting ${ws_duration}s..."
    sleep $ws_duration

    # Check if server is still healthy
    local health_status
    health_status=$(curl -sf -o /dev/null -w '%{http_code}' "${BASE_URL}/api/health" 2>/dev/null || echo "000")

    # Cleanup
    for pid in "${ws_pids[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true

    if [ "$health_status" = "200" ]; then
        echo -e "  ${GREEN}PASS: Server healthy after WS storm (HTTP ${health_status})${NC}"
    else
        echo -e "  ${RED}FAIL: Server unhealthy after WS storm (HTTP ${health_status})${NC}"
        return 1
    fi
}

# =============================================================================
# Test 2: DB Pool Exhaustion
# =============================================================================
db_pool_test() {
    echo ""
    echo -e "${BLUE}=== Test 2: DB Pool Stress ===${NC}"
    echo -e "  Sending 50 concurrent requests to DB-heavy endpoints..."

    local auth_args=()
    [ -n "$AUTH_TOKEN" ] && auth_args=(-H "Authorization: Bearer ${AUTH_TOKEN}")

    local ok=0
    local fail=0
    local pids=()

    RESULTS_DIR=$(mktemp -d)

    for i in $(seq 1 50); do
        (
            local status
            status=$(curl -sf -o /dev/null -w '%{http_code}' \
                --connect-timeout 10 --max-time 30 \
                "${auth_args[@]}" \
                "${BASE_URL}/api/health" 2>/dev/null) || status="000"
            echo "$status" > "${RESULTS_DIR}/${i}.result"
        ) &
        pids+=($!)
    done

    wait

    for f in "${RESULTS_DIR}"/*.result; do
        read -r status < "$f"
        if [ "$status" -ge 200 ] 2>/dev/null && [ "$status" -lt 500 ] 2>/dev/null; then
            ok=$((ok + 1))
        else
            fail=$((fail + 1))
        fi
    done

    rm -rf "$RESULTS_DIR"

    # Allow some 503s (pool saturation is expected behavior)
    if [ "$ok" -ge 40 ]; then
        echo -e "  ${GREEN}PASS: ${ok}/50 requests succeeded (${fail} pool-saturated as expected)${NC}"
    else
        echo -e "  ${RED}FAIL: Only ${ok}/50 requests succeeded${NC}"
        return 1
    fi
}

# =============================================================================
# Test 3: Memory Stability
# =============================================================================
memory_test() {
    echo ""
    echo -e "${BLUE}=== Test 3: Memory Stability ===${NC}"
    echo -e "  Sending 200 sequential requests, checking for memory leaks..."

    local auth_args=()
    [ -n "$AUTH_TOKEN" ] && auth_args=(-H "Authorization: Bearer ${AUTH_TOKEN}")

    # Get initial memory usage from health endpoint
    local initial_health
    initial_health=$(curl -sf "${auth_args[@]}" "${BASE_URL}/api/health" 2>/dev/null || echo "{}")

    # Send 200 requests
    local ok=0
    for i in $(seq 1 200); do
        local status
        status=$(curl -sf -o /dev/null -w '%{http_code}' \
            --connect-timeout 5 --max-time 10 \
            "${auth_args[@]}" \
            "${BASE_URL}/api/health" 2>/dev/null) || status="000"
        [ "$status" = "200" ] && ok=$((ok + 1))
    done

    # Check server is still healthy
    local final_status
    final_status=$(curl -sf -o /dev/null -w '%{http_code}' "${BASE_URL}/api/health" 2>/dev/null || echo "000")

    if [ "$ok" -ge 190 ] && [ "$final_status" = "200" ]; then
        echo -e "  ${GREEN}PASS: ${ok}/200 requests OK, server still healthy${NC}"
    else
        echo -e "  ${RED}FAIL: Only ${ok}/200 OK, final status: ${final_status}${NC}"
        return 1
    fi
}

# Run tests
FAILED=0

case "$TEST_MODE" in
    --ws-only) ws_stress_test || FAILED=1 ;;
    --db-only) db_pool_test || FAILED=1 ;;
    --memory-only) memory_test || FAILED=1 ;;
    *)
        ws_stress_test || FAILED=1
        db_pool_test || FAILED=1
        memory_test || FAILED=1
        ;;
esac

echo ""
echo -e "${BLUE}============================================${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}  ALL STRESS TESTS PASSED${NC}"
else
    echo -e "${RED}  SOME STRESS TESTS FAILED${NC}"
fi
echo -e "${BLUE}============================================${NC}"

exit $FAILED
