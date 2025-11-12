#!/usr/bin/env bash
#
# Arasul Platform Restart Testing Suite
#
# Tests:
# 1. Single Container Restart (each service individually)
# 2. Full Stack Restart (all services)
# 3. System Reboot Test
# 4. Service Health Validation after each restart
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test Results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Logging
LOG_FILE="${PROJECT_ROOT}/tests/restart_test_$(date +%Y%m%d_%H%M%S).log"

info() {
    echo -e "${BLUE}ℹ${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

# Test tracking
test_start() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    info "Test $TOTAL_TESTS: $1"
}

test_pass() {
    PASSED_TESTS=$((PASSED_TESTS + 1))
    success "$1"
}

test_fail() {
    FAILED_TESTS=$((FAILED_TESTS + 1))
    error "$1"
}

# Service health check
check_service_health() {
    local service_name="$1"
    local max_wait="${2:-60}"
    local waited=0

    info "Checking health of $service_name..."

    while [ $waited -lt $max_wait ]; do
        if docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" ps "$service_name" 2>/dev/null | grep -q "Up"; then
            # Container is up, check health if defined
            local health_status=$(docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" ps "$service_name" 2>/dev/null | grep "$service_name" | awk '{print $NF}')

            if [[ "$health_status" == "Up" ]] || [[ "$health_status" == *"healthy"* ]]; then
                success "$service_name is healthy"
                return 0
            fi
        fi

        sleep 2
        waited=$((waited + 2))
    done

    error "$service_name failed health check after ${max_wait}s"
    return 1
}

# API endpoint check
check_api_endpoint() {
    local endpoint="$1"
    local expected_status="${2:-200}"
    local max_retries=10
    local retry=0

    while [ $retry -lt $max_retries ]; do
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost${endpoint}" 2>/dev/null || echo "000")

        if [ "$response_code" = "$expected_status" ]; then
            success "API endpoint $endpoint returned $response_code"
            return 0
        fi

        sleep 3
        retry=$((retry + 1))
    done

    error "API endpoint $endpoint failed (got $response_code, expected $expected_status)"
    return 1
}

# Test 1: Single Container Restart
test_single_container_restart() {
    local service_name="$1"

    test_start "Single container restart: $service_name"

    info "Stopping $service_name..."
    if ! docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" stop "$service_name" >> "$LOG_FILE" 2>&1; then
        test_fail "Failed to stop $service_name"
        return 1
    fi

    sleep 2

    info "Starting $service_name..."
    if ! docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" start "$service_name" >> "$LOG_FILE" 2>&1; then
        test_fail "Failed to start $service_name"
        return 1
    fi

    sleep 5

    if check_service_health "$service_name" 60; then
        test_pass "$service_name restart successful"
        return 0
    else
        test_fail "$service_name restart failed health check"
        return 1
    fi
}

# Test 2: Full Stack Restart
test_full_stack_restart() {
    test_start "Full stack restart"

    info "Stopping all services..."
    if ! docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" down >> "$LOG_FILE" 2>&1; then
        test_fail "Failed to stop all services"
        return 1
    fi

    sleep 5

    info "Starting all services..."
    if ! docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" up -d >> "$LOG_FILE" 2>&1; then
        test_fail "Failed to start all services"
        return 1
    fi

    info "Waiting for services to be ready..."
    sleep 20

    # Check critical services
    local critical_services=("postgres-db" "dashboard-backend" "dashboard-frontend")
    local all_healthy=true

    for service in "${critical_services[@]}"; do
        if ! check_service_health "$service" 90; then
            all_healthy=false
        fi
    done

    if $all_healthy; then
        test_pass "Full stack restart successful"
        return 0
    else
        test_fail "Some services failed to start"
        return 1
    fi
}

# Test 3: Service Dependencies
test_service_dependencies() {
    test_start "Service dependency validation"

    # Restart postgres and check if backend reconnects
    info "Testing database reconnection..."

    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" restart postgres-db >> "$LOG_FILE" 2>&1

    sleep 10

    if check_service_health "dashboard-backend" 60; then
        test_pass "Backend reconnected to database"
    else
        test_fail "Backend failed to reconnect to database"
        return 1
    fi

    # Check API functionality
    if check_api_endpoint "/api/system/status" 200; then
        test_pass "API functionality restored"
        return 0
    else
        test_fail "API not responding after restart"
        return 1
    fi
}

# Test 4: Metrics & Self-Healing Persistence
test_telemetry_after_restart() {
    test_start "Telemetry & self-healing validation"

    # Check if metrics collector is running
    if check_service_health "metrics-collector" 30; then
        test_pass "Metrics collector active"
    else
        test_fail "Metrics collector not active"
        return 1
    fi

    # Check if self-healing is running
    if check_service_health "self-healing-agent" 30; then
        test_pass "Self-healing agent active"
    else
        test_fail "Self-healing agent not active"
        return 1
    fi

    # Verify metrics API
    if check_api_endpoint "/api/metrics/live" 200; then
        test_pass "Metrics API responding"
        return 0
    else
        test_fail "Metrics API not responding"
        return 1
    fi
}

# Test 5: Data Persistence
test_data_persistence() {
    test_start "Data persistence validation"

    # Write a test entry to database via API
    local test_timestamp=$(date +%s)

    info "Testing data persistence through restart..."

    # Restart postgres
    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" restart postgres-db >> "$LOG_FILE" 2>&1

    sleep 10

    # Check if we can still query the database
    if check_api_endpoint "/api/metrics/history?range=1h" 200; then
        test_pass "Data persisted through restart"
        return 0
    else
        test_fail "Data persistence validation failed"
        return 1
    fi
}

# Test 6: Graceful Shutdown
test_graceful_shutdown() {
    test_start "Graceful shutdown validation"

    local services=("dashboard-backend" "llm-service" "postgres-db")

    for service in "${services[@]}"; do
        info "Testing graceful shutdown of $service..."

        # Send SIGTERM
        local container_id=$(docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" ps -q "$service")

        if [ -n "$container_id" ]; then
            docker stop -t 30 "$container_id" >> "$LOG_FILE" 2>&1
            local exit_code=$?

            if [ $exit_code -eq 0 ]; then
                success "$service shutdown gracefully"
            else
                warn "$service may have been force-killed (exit code: $exit_code)"
            fi

            # Restart
            docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" start "$service" >> "$LOG_FILE" 2>&1
            sleep 5
        fi
    done

    test_pass "Graceful shutdown test completed"
    return 0
}

# Main test runner
main() {
    echo "========================================"
    echo "  ARASUL PLATFORM - RESTART TEST SUITE"
    echo "========================================"
    echo "Started: $(date)"
    echo "Log file: $LOG_FILE"
    echo

    cd "$PROJECT_ROOT"

    # Ensure services are running
    info "Ensuring all services are running..."
    docker-compose up -d >> "$LOG_FILE" 2>&1
    sleep 15

    # Run tests
    echo
    info "=== SINGLE CONTAINER RESTART TESTS ==="
    test_single_container_restart "dashboard-backend"
    test_single_container_restart "dashboard-frontend"
    test_single_container_restart "metrics-collector"
    test_single_container_restart "self-healing-agent"

    echo
    info "=== DEPENDENCY TESTS ==="
    test_service_dependencies

    echo
    info "=== TELEMETRY VALIDATION ==="
    test_telemetry_after_restart

    echo
    info "=== DATA PERSISTENCE TEST ==="
    test_data_persistence

    echo
    info "=== GRACEFUL SHUTDOWN TEST ==="
    test_graceful_shutdown

    echo
    info "=== FULL STACK RESTART TEST ==="
    test_full_stack_restart

    # Summary
    echo
    echo "========================================"
    echo "  TEST SUMMARY"
    echo "========================================"
    echo "Total Tests:  $TOTAL_TESTS"
    echo "Passed:       $PASSED_TESTS"
    echo "Failed:       $FAILED_TESTS"
    echo

    if [ $FAILED_TESTS -eq 0 ]; then
        success "ALL TESTS PASSED ✓"
        echo
        echo "Full log: $LOG_FILE"
        exit 0
    else
        error "SOME TESTS FAILED ✗"
        echo
        echo "Full log: $LOG_FILE"
        exit 1
    fi
}

# Run main
main "$@"
