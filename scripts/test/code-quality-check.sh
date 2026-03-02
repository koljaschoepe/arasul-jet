#!/bin/bash
# Code Quality Gates (Design System + Code Quality)
# Standalone checks — NOT part of Jest test suites.
# Usage: ./scripts/test/code-quality-check.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXIT_CODE=0

echo "======================================================="
echo "  Code Quality Gates"
echo "======================================================="

# Design System
node "$SCRIPT_DIR/check-design-system.js"
if [ $? -ne 0 ]; then EXIT_CODE=1; fi

# Code Quality & Security
node "$SCRIPT_DIR/check-code-quality.js"
if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo "======================================================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "  Quality Gates: ALL PASSED"
else
  echo "  Quality Gates: SOME FAILURES"
fi
echo "======================================================="

exit $EXIT_CODE
