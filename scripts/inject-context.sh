#!/bin/bash

# ============================================================================
# Arasul Platform - Context Auto-Injection Script
# ============================================================================
# Analyzes changed files and suggests relevant context templates for Claude Code.
# Can be used as a pre-commit hook or standalone tool.
#
# Usage:
#   ./scripts/inject-context.sh           # Analyze staged files
#   ./scripts/inject-context.sh --all     # Analyze all modified files
#   ./scripts/inject-context.sh --file X  # Analyze specific file
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTEXT_DIR="$PROJECT_ROOT/.claude/context"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
MODE="staged"
SPECIFIC_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      MODE="all"
      shift
      ;;
    --file)
      MODE="file"
      SPECIFIC_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Get changed files based on mode
get_changed_files() {
  case $MODE in
    staged)
      git diff --cached --name-only 2>/dev/null || echo ""
      ;;
    all)
      git status --porcelain 2>/dev/null | awk '{print $2}' || echo ""
      ;;
    file)
      echo "$SPECIFIC_FILE"
      ;;
  esac
}

CHANGED_FILES=$(get_changed_files)

if [ -z "$CHANGED_FILES" ]; then
  echo -e "${YELLOW}No changed files detected.${NC}"
  exit 0
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Context Auto-Injection Analysis${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Initialize context suggestions
CONTEXTS=()
RULES=()

# Analyze files and suggest contexts
while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Backend routes
  if [[ "$file" == services/dashboard-backend/src/routes/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " api-endpoint " ]]; then
      CONTEXTS+=("api-endpoint")
      RULES+=("Backend route detected: $file")
    fi
  fi

  # Backend services
  if [[ "$file" == services/dashboard-backend/src/services/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " backend " ]]; then
      CONTEXTS+=("backend")
      RULES+=("Backend service detected: $file")
    fi
  fi

  # Frontend components
  if [[ "$file" == services/dashboard-frontend/src/components/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " component " ]]; then
      CONTEXTS+=("component")
      RULES+=("Frontend component detected: $file")
    fi
    if [[ ! " ${CONTEXTS[*]} " =~ " frontend " ]]; then
      CONTEXTS+=("frontend")
    fi
  fi

  # Frontend CSS
  if [[ "$file" == *.css ]] && [[ "$file" == services/dashboard-frontend/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " component " ]]; then
      CONTEXTS+=("component")
      RULES+=("CSS file detected - check Design System: $file")
    fi
  fi

  # Database migrations
  if [[ "$file" == services/postgres/init/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " migration " ]]; then
      CONTEXTS+=("migration")
      RULES+=("Database migration detected: $file")
    fi
    if [[ ! " ${CONTEXTS[*]} " =~ " database " ]]; then
      CONTEXTS+=("database")
    fi
  fi

  # Telegram bot
  if [[ "$file" == services/telegram-bot/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " telegram " ]]; then
      CONTEXTS+=("telegram")
      RULES+=("Telegram bot file detected: $file")
    fi
  fi

  # n8n workflows
  if [[ "$file" == services/n8n/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " n8n-workflow " ]]; then
      CONTEXTS+=("n8n-workflow")
      RULES+=("n8n file detected: $file")
    fi
  fi

  # Python AI services
  if [[ "$file" == services/llm-service/* ]] || \
     [[ "$file" == services/embedding-service/* ]] || \
     [[ "$file" == services/document-indexer/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " base " ]]; then
      CONTEXTS+=("base")
      RULES+=("AI service detected: $file")
    fi
  fi

  # Self-healing agent
  if [[ "$file" == services/self-healing-agent/* ]]; then
    if [[ ! " ${CONTEXTS[*]} " =~ " debug " ]]; then
      CONTEXTS+=("debug")
      RULES+=("Self-healing agent detected: $file")
    fi
  fi

  # Test files
  if [[ "$file" == *test* ]] || [[ "$file" == *spec* ]] || [[ "$file" == *__tests__* ]]; then
    RULES+=("Test file detected - ensure coverage: $file")
  fi

done <<< "$CHANGED_FILES"

# Always include base context
if [[ ! " ${CONTEXTS[*]} " =~ " base " ]]; then
  CONTEXTS=("base" "${CONTEXTS[@]}")
fi

# Output results
echo -e "${GREEN}Changed Files:${NC}"
echo "$CHANGED_FILES" | while read -r f; do
  [ -n "$f" ] && echo "  - $f"
done
echo ""

echo -e "${GREEN}Detected Patterns:${NC}"
for rule in "${RULES[@]}"; do
  echo -e "  ${YELLOW}→${NC} $rule"
done
echo ""

echo -e "${GREEN}Recommended Context Templates:${NC}"
for ctx in "${CONTEXTS[@]}"; do
  if [ -f "$CONTEXT_DIR/$ctx.md" ]; then
    echo -e "  ${BLUE}✓${NC} .claude/context/$ctx.md"
  else
    echo -e "  ${RED}✗${NC} .claude/context/$ctx.md (not found)"
  fi
done
echo ""

# Generate context summary
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Quick Context Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

for ctx in "${CONTEXTS[@]}"; do
  if [ -f "$CONTEXT_DIR/$ctx.md" ]; then
    echo -e "${GREEN}=== $ctx.md ===${NC}"
    # Extract first heading and key points
    head -20 "$CONTEXT_DIR/$ctx.md" | grep -E "^#|^\*\*|^-" | head -5
    echo ""
  fi
done

# Check for Design System compliance
if [[ " ${CONTEXTS[*]} " =~ " component " ]] || [[ " ${CONTEXTS[*]} " =~ " frontend " ]]; then
  echo -e "${YELLOW}⚠️  REMINDER: Follow Design System!${NC}"
  echo "   Primary: #45ADFF | Background: #101923 / #1A2330"
  echo "   See: docs/DESIGN_SYSTEM.md"
  echo ""
fi

# Check for test requirements
if [[ " ${CONTEXTS[*]} " =~ " api-endpoint " ]] || [[ " ${CONTEXTS[*]} " =~ " component " ]]; then
  echo -e "${YELLOW}⚠️  REMINDER: Write tests!${NC}"
  echo "   Backend: __tests__/*.test.js"
  echo "   Frontend: src/__tests__/*.test.js"
  echo ""
fi

echo -e "${GREEN}Done!${NC}"
