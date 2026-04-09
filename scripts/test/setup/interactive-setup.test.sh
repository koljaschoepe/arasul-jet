#!/usr/bin/env bats
# =============================================================================
# BATS Tests for scripts/interactive_setup.sh
# Tests script structure, non-interactive mode, and security properties.
#
# NOTE: Cannot source the script directly (no source guard, main() runs
# unconditionally). Tests use grep/static analysis and function extraction.
#
# Usage: bats scripts/test/setup/interactive-setup.test.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SETUP_SCRIPT="$PROJECT_ROOT/scripts/interactive_setup.sh"

setup() {
    MOCK_DIR=$(mktemp -d)
    export MOCK_DIR
}

teardown() {
    rm -rf "$MOCK_DIR"
}

# =============================================================================
# Script structure tests
# =============================================================================

@test "setup script: is valid bash syntax" {
    run bash -n "$SETUP_SCRIPT"
    [ "$status" -eq 0 ]
}

@test "setup script: has shebang line" {
    head -1 "$SETUP_SCRIPT" | grep -q "#!/bin/bash"
}

@test "setup script: is executable" {
    [ -x "$SETUP_SCRIPT" ]
}

# =============================================================================
# Security tests
# =============================================================================

@test "security: no hardcoded dev secrets in script" {
    ! grep -q "arasul-dev-jwt-secret" "$SETUP_SCRIPT"
    ! grep -q "arasul-dev-n8n-encryption" "$SETUP_SCRIPT"
}

@test "security: generates JWT_SECRET with 32 bytes" {
    grep -q 'generate_secret 32' "$SETUP_SCRIPT"
}

@test "security: generates passwords with sufficient length" {
    grep -q 'generate_password 24\|generate_password 16' "$SETUP_SCRIPT"
}

@test "security: uses openssl for secret generation" {
    grep -q 'openssl rand' "$SETUP_SCRIPT"
}

@test "security: has bcrypt hash generation" {
    grep -q 'htpasswd\|bcrypt\|hashpw\|BCRYPT\|bcrypt_hash' "$SETUP_SCRIPT"
}

# =============================================================================
# Required environment variable generation
# =============================================================================

@test "env generation: generates POSTGRES_PASSWORD" {
    grep -q "POSTGRES_PASSWORD=" "$SETUP_SCRIPT"
}

@test "env generation: generates JWT_SECRET" {
    grep -q "JWT_SECRET=" "$SETUP_SCRIPT"
}

@test "env generation: generates MINIO_ROOT_USER" {
    grep -q "MINIO_ROOT_USER=" "$SETUP_SCRIPT"
}

@test "env generation: generates MINIO_ROOT_PASSWORD" {
    grep -q "MINIO_ROOT_PASSWORD=" "$SETUP_SCRIPT"
}

@test "env generation: generates N8N_ENCRYPTION_KEY" {
    grep -q "N8N_ENCRYPTION_KEY=" "$SETUP_SCRIPT"
}

@test "env generation: generates TELEGRAM_ENCRYPTION_KEY" {
    grep -q "TELEGRAM_ENCRYPTION_KEY=" "$SETUP_SCRIPT"
}

@test "env generation: sets SELF_HEALING_REBOOT_ENABLED" {
    grep -q "SELF_HEALING_REBOOT_ENABLED=" "$SETUP_SCRIPT"
}

@test "env generation: sets BUILD_HASH from git" {
    grep -q "BUILD_HASH=" "$SETUP_SCRIPT"
}

# =============================================================================
# Non-interactive mode support
# =============================================================================

@test "non-interactive: supports NON_INTERACTIVE flag" {
    grep -q 'NON_INTERACTIVE' "$SETUP_SCRIPT"
}

@test "non-interactive: supports --non-interactive argument" {
    grep -q '\-\-non-interactive' "$SETUP_SCRIPT"
}

@test "non-interactive: skips prompts when NON_INTERACTIVE=true" {
    # Should check for NON_INTERACTIVE before each prompt
    count=$(grep -c 'NON_INTERACTIVE' "$SETUP_SCRIPT")
    [ "$count" -ge 5 ]
}

# =============================================================================
# Secrets directory
# =============================================================================

@test "secrets: creates config/secrets directory" {
    grep -q 'config/secrets' "$SETUP_SCRIPT"
}

@test "secrets: writes admin_password file" {
    grep -q 'admin_password' "$SETUP_SCRIPT"
}

# =============================================================================
# Auto-reboot question
# =============================================================================

@test "unattended mode: asks about unbeaufsichtigt/auto-reboot" {
    grep -q 'UNATTENDED_MODE\|unbeaufsichtigt\|Auto-Reboot' "$SETUP_SCRIPT"
}

@test "unattended mode: connects to SELF_HEALING_REBOOT_ENABLED" {
    grep -q 'UNATTENDED_MODE' "$SETUP_SCRIPT"
}

# =============================================================================
# Function extraction tests (extract and test individual functions)
# =============================================================================

@test "generate_secret: produces hex output" {
    # Extract just the function and test it
    eval "$(sed -n '/^generate_secret()/,/^}/p' "$SETUP_SCRIPT")"

    result=$(generate_secret 16)
    [[ ${#result} -eq 32 ]]  # 16 bytes = 32 hex chars
    [[ "$result" =~ ^[0-9a-f]+$ ]]
}

@test "generate_secret: different calls produce different values" {
    eval "$(sed -n '/^generate_secret()/,/^}/p' "$SETUP_SCRIPT")"

    secret1=$(generate_secret 32)
    secret2=$(generate_secret 32)
    [[ "$secret1" != "$secret2" ]]
}

@test "generate_password: produces output of correct length" {
    eval "$(sed -n '/^generate_password()/,/^}/p' "$SETUP_SCRIPT")"

    result=$(generate_password 24)
    [[ ${#result} -ge 24 ]]
}
