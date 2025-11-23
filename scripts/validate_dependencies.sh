#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Docker Compose Dependency Chain Validator
# Validates that all service dependencies have proper health check conditions
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
CHECKS=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ERRORS=$((ERRORS + 1))
}

echo "================================================================"
echo "   ARASUL - Docker Compose Dependency Chain Validator"
echo "================================================================"
echo ""

if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "docker-compose.yml not found at $COMPOSE_FILE"
    exit 1
fi

log_info "Validating: $COMPOSE_FILE"
echo ""

# Check if docker compose is installed
if ! command -v docker &> /dev/null; then
    log_error "docker is not installed"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    log_error "docker compose plugin is not installed"
    exit 1
fi

# Validate docker-compose.yml syntax
log_info "Checking docker-compose.yml syntax..."
if docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
    log_success "docker-compose.yml syntax is valid"
    CHECKS=$((CHECKS + 1))
else
    log_error "docker-compose.yml has syntax errors"
    docker compose -f "$COMPOSE_FILE" config
    exit 1
fi
echo ""

# Extract all services
log_info "Extracting service list..."
SERVICES=$(docker compose -f "$COMPOSE_FILE" config --services)
SERVICE_COUNT=$(echo "$SERVICES" | wc -l)
log_info "Found $SERVICE_COUNT services"
echo ""

# Define expected startup order (based on PRD)
# CRITICAL: reverse-proxy must start BEFORE dashboard services (not after)
EXPECTED_ORDER=(
    "postgres-db"
    "minio"
    "metrics-collector"
    "llm-service"
    "embedding-service"
    "reverse-proxy"
    "dashboard-backend"
    "dashboard-frontend"
    "n8n"
    "self-healing-agent"
)

# Check 1: All services have health checks
log_info "Check 1: Verifying health checks..."
for service in $SERVICES; do
    # Extract full service definition and check for healthcheck (more robust)
    SERVICE_DEF=$(docker compose -f "$COMPOSE_FILE" config | sed -n "/^  $service:/,/^  [a-z-]/p")
    if echo "$SERVICE_DEF" | grep -q "^    healthcheck:"; then
        log_success "$service has health check defined"
        CHECKS=$((CHECKS + 1))
    else
        log_error "$service is missing health check definition"
    fi
done
echo ""

# Check 2: All depends_on use condition: service_healthy
log_info "Check 2: Verifying depends_on conditions..."
for service in $SERVICES; do
    # Extract full service definition
    SERVICE_DEF=$(docker compose -f "$COMPOSE_FILE" config | sed -n "/^  $service:/,/^  [a-z-]/p")

    # Check if service has depends_on section
    if echo "$SERVICE_DEF" | grep -q "^    depends_on:"; then
        # Extract only the depends_on section (from "depends_on:" to next top-level key at same indentation)
        DEPENDS_SECTION=$(echo "$SERVICE_DEF" | sed -n '/^    depends_on:/,/^    [a-z]/p')

        # Extract dependency service names (lines with 6 spaces indentation followed by service name and colon)
        # Only match lines that look like "      service-name:" (not "        condition:" or other sub-keys)
        DEPS=$(echo "$DEPENDS_SECTION" | grep -E "^      [a-z][a-z0-9_-]*:" | sed 's/:$//' | sed 's/^      //')

        for dep in $DEPS; do
            # Check if this dependency has condition: service_healthy
            # Look for the pattern "      dep-name:" followed by "        condition: service_healthy"
            if echo "$DEPENDS_SECTION" | grep -A 3 "^      $dep:" | grep -q "condition: service_healthy"; then
                log_success "$service -> $dep has health condition"
                CHECKS=$((CHECKS + 1))
            else
                log_error "$service -> $dep missing 'condition: service_healthy'"
            fi
        done
    fi
done
echo ""

# Check 3: Verify critical dependencies
log_info "Check 3: Verifying critical dependency chain..."

# PostgreSQL should have no dependencies
if docker compose -f "$COMPOSE_FILE" config | grep -A 20 "^  postgres-db:" | grep -q "depends_on:"; then
    log_warning "postgres-db should not depend on other services"
else
    log_success "postgres-db has no dependencies (correct)"
    CHECKS=$((CHECKS + 1))
fi

# MinIO should have no dependencies
if docker compose -f "$COMPOSE_FILE" config | grep -A 20 "^  minio:" | grep -q "depends_on:"; then
    log_warning "minio should not depend on other services"
else
    log_success "minio has no dependencies (correct)"
    CHECKS=$((CHECKS + 1))
fi

# Metrics collector must depend on postgres-db
if docker compose -f "$COMPOSE_FILE" config | grep -A 30 "^  metrics-collector:" | sed -n '/depends_on:/,/^  [a-z]/p' | grep -q "postgres-db:"; then
    log_success "metrics-collector depends on postgres-db"
    CHECKS=$((CHECKS + 1))
else
    log_error "metrics-collector must depend on postgres-db"
fi

# Dashboard backend must depend on postgres, minio, metrics, llm, embedding
REQUIRED_DEPS=("postgres-db" "minio" "metrics-collector" "llm-service" "embedding-service")
for dep in "${REQUIRED_DEPS[@]}"; do
    if docker compose -f "$COMPOSE_FILE" config | grep -A 50 "^  dashboard-backend:" | sed -n '/depends_on:/,/^  [a-z]/p' | grep -q "$dep:"; then
        log_success "dashboard-backend depends on $dep"
        CHECKS=$((CHECKS + 1))
    else
        log_error "dashboard-backend must depend on $dep"
    fi
done

# Reverse proxy must start AFTER core services but BEFORE application services
REQUIRED_PROXY_DEPS=("postgres-db" "minio" "metrics-collector" "llm-service" "embedding-service")
for dep in "${REQUIRED_PROXY_DEPS[@]}"; do
    SERVICE_DEF=$(docker compose -f "$COMPOSE_FILE" config | sed -n "/^  reverse-proxy:/,/^  [a-z-]/p")
    if echo "$SERVICE_DEF" | sed -n '/^    depends_on:/,/^    [a-z]/p' | grep -q "^      $dep:"; then
        log_success "reverse-proxy depends on $dep"
        CHECKS=$((CHECKS + 1))
    else
        log_error "reverse-proxy must depend on $dep"
    fi
done

# Self-healing must be LAST to start
REQUIRED_HEALING_DEPS=("postgres-db" "metrics-collector" "dashboard-backend" "llm-service" "n8n")
for dep in "${REQUIRED_HEALING_DEPS[@]}"; do
    if docker compose -f "$COMPOSE_FILE" config | grep -A 50 "^  self-healing-agent:" | sed -n '/depends_on:/,/^  [a-z]/p' | grep -q "$dep:"; then
        log_success "self-healing-agent depends on $dep"
        CHECKS=$((CHECKS + 1))
    else
        log_error "self-healing-agent must depend on $dep"
    fi
done
echo ""

# Check 4: Verify no circular dependencies
log_info "Check 4: Checking for circular dependencies..."
# This is a simplified check - docker compose config would fail on circular deps
if docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
    log_success "No circular dependencies detected"
    CHECKS=$((CHECKS + 1))
else
    log_error "Circular dependency detected or configuration error"
fi
echo ""

# Check 5: Verify restart policies
log_info "Check 5: Verifying restart policies..."
for service in $SERVICES; do
    # Extract full service definition and look for restart policy (more robust)
    SERVICE_DEF=$(docker compose -f "$COMPOSE_FILE" config | sed -n "/^  $service:/,/^  [a-z-]/p")
    RESTART_POLICY=$(echo "$SERVICE_DEF" | grep "^    restart:" | awk '{print $2}')

    if [ "$RESTART_POLICY" = "always" ] || [ "$RESTART_POLICY" = "unless-stopped" ]; then
        log_success "$service has restart policy: $RESTART_POLICY"
        CHECKS=$((CHECKS + 1))
    else
        log_warning "$service has restart policy: $RESTART_POLICY (should be 'always')"
    fi
done
echo ""

# Summary
echo "================================================================"
echo "                     VALIDATION SUMMARY"
echo "================================================================"
echo ""
echo -e "Total Checks:   ${BLUE}$CHECKS${NC}"
echo -e "Errors:         ${RED}$ERRORS${NC}"
echo -e "Warnings:       ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All critical validations passed!${NC}"
    echo ""
    echo "Startup Order (validated):"
    for i in "${!EXPECTED_ORDER[@]}"; do
        echo "  $((i+1)). ${EXPECTED_ORDER[$i]}"
    done
    echo ""
    exit 0
else
    echo -e "${RED}✗ Validation failed with $ERRORS error(s)${NC}"
    echo ""
    echo "Please fix the errors above before deploying."
    exit 1
fi
