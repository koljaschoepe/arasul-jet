#!/bin/bash
# =============================================================================
# Arasul Platform - Shared Logging Library
# =============================================================================
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/../lib/logging.sh"
#   or:  source "${SCRIPT_DIR}/../lib/logging.sh"
#
# Provides: log_info, log_success, log_warning, log_error
# Optionally set LOG_PREFIX before sourcing to customize the tag.
# =============================================================================

# Colors (skip if not a terminal or NO_COLOR is set)
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  _LOG_RED='\033[0;31m'
  _LOG_GREEN='\033[0;32m'
  _LOG_YELLOW='\033[1;33m'
  _LOG_BLUE='\033[0;34m'
  _LOG_NC='\033[0m'
else
  _LOG_RED=''
  _LOG_GREEN=''
  _LOG_YELLOW=''
  _LOG_BLUE=''
  _LOG_NC=''
fi

# Default prefix — scripts can override before sourcing
LOG_PREFIX="${LOG_PREFIX:-ARASUL}"

log_info()    { echo -e "${_LOG_BLUE}[${LOG_PREFIX}]${_LOG_NC} $*"; }
log_success() { echo -e "${_LOG_GREEN}[${LOG_PREFIX}]${_LOG_NC} $*"; }
log_warning() { echo -e "${_LOG_YELLOW}[${LOG_PREFIX}]${_LOG_NC} $*"; }
log_error()   { echo -e "${_LOG_RED}[${LOG_PREFIX}]${_LOG_NC} $*" >&2; }

# Shorthand for scripts that use a single log() function
log() { log_info "$@"; }
