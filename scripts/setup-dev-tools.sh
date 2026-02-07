#!/bin/bash

# ============================================================================
# Arasul Platform - Development Tools Setup
# ============================================================================
# This script sets up ESLint, Prettier, and Husky for the development workflow.
# Run this script after cloning or when node_modules has permission issues.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "Arasul Platform - Development Tools Setup"
echo "============================================"
echo ""

cd "$PROJECT_ROOT"

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
  echo "WARNING: Running as root is not recommended."
  echo "Consider running as regular user with sudo for specific commands."
  echo ""
fi

# Step 1: Fix node_modules permissions if needed
echo "[1/4] Checking node_modules permissions..."

BACKEND_MODULES="$PROJECT_ROOT/services/dashboard-backend/node_modules"
FRONTEND_MODULES="$PROJECT_ROOT/services/dashboard-frontend/node_modules"

fix_permissions() {
  local dir=$1
  if [ -d "$dir" ]; then
    owner=$(stat -c '%U' "$dir" 2>/dev/null || stat -f '%Su' "$dir" 2>/dev/null)
    if [ "$owner" = "root" ]; then
      echo "  Fixing permissions for $dir..."
      sudo chown -R $USER:$USER "$dir"
      echo "  Done."
    else
      echo "  $dir permissions OK."
    fi
  fi
}

fix_permissions "$BACKEND_MODULES"
fix_permissions "$FRONTEND_MODULES"

# Step 2: Install root dependencies (Husky, lint-staged, Prettier)
echo ""
echo "[2/4] Installing root dependencies..."
npm install

# Step 3: Install backend dependencies (ESLint)
echo ""
echo "[3/4] Installing backend dependencies..."
cd "$PROJECT_ROOT/services/dashboard-backend"
npm install

# Step 4: Verify setup
echo ""
echo "[4/4] Verifying setup..."

cd "$PROJECT_ROOT"

# Check Husky
if [ -f ".husky/pre-commit" ]; then
  echo "  ✓ Husky hooks installed"
else
  echo "  ✗ Husky hooks missing"
fi

# Check ESLint
if [ -f "services/dashboard-backend/.eslintrc.json" ]; then
  echo "  ✓ ESLint configuration present"
else
  echo "  ✗ ESLint configuration missing"
fi

# Check Prettier
if [ -f ".prettierrc.json" ]; then
  echo "  ✓ Prettier configuration present"
else
  echo "  ✗ Prettier configuration missing"
fi

# Test lint
echo ""
echo "Testing ESLint..."
cd "$PROJECT_ROOT/services/dashboard-backend"
if npm run lint --silent 2>/dev/null; then
  echo "  ✓ ESLint working"
else
  echo "  ! ESLint found issues (this is expected, run 'npm run lint:fix' to auto-fix)"
fi

echo ""
echo "============================================"
echo "Setup complete!"
echo "============================================"
echo ""
echo "Available commands:"
echo "  npm run lint        - Run ESLint on all code"
echo "  npm run lint:fix    - Auto-fix linting issues"
echo "  npm run format      - Format code with Prettier"
echo "  npm run test        - Run all tests"
echo ""
echo "Git hooks are now active:"
echo "  pre-commit  - Runs lint-staged on staged files"
echo "  commit-msg  - Validates conventional commit format"
echo "  pre-push    - Runs tests before pushing to main/develop"
echo ""
