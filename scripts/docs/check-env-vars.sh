#!/usr/bin/env bash
#
# check-env-vars.sh
#
# Extracts every environment variable referenced by the backend
# (`process.env.FOO` or `getEnvVar('FOO', ...)`) and every env-var
# referenced by Python services (`os.environ[...]`, `os.getenv(...)`)
# and compares the union against docs/ENVIRONMENT_VARIABLES.md.
#
# This is a drift check, not a pedantic cross-reference: some vars
# are intentionally undocumented (internal tunables, test-only), so
# we tolerate a known ignore list declared inline below.
#
# Exit code: 0 if there is no notable drift, 1 otherwise.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOC="$ROOT/docs/ENVIRONMENT_VARIABLES.md"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

CODE_VARS="$WORKDIR/code-vars.txt"
DOC_VARS="$WORKDIR/doc-vars.txt"

python3 - "$ROOT" > "$CODE_VARS" <<'PY'
import os, re, sys

root = sys.argv[1]

# What we scan. Shell scripts are excluded on purpose: they use
# ${FOO} for local variables too, so they'd flood the result with
# loop counters, color codes, and other non-env tokens.
SCAN = [
    ("apps", (".js", ".ts", ".tsx")),
    ("services", (".py",)),
]

SKIP_DIRS = {"node_modules", "__pycache__", "coverage", "dist", "build", ".next", "data"}

# process.env.FOO  — JS/TS
PE_RE = re.compile(r"process\.env\.([A-Z][A-Z0-9_]+)")
# process.env['FOO'] or process.env["FOO"]
PEI_RE = re.compile(r"process\.env\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\]")
# getEnvVar('FOO', ...)  — our own helper
GEV_RE = re.compile(r"getEnvVar\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]")
# Python: os.environ['FOO'], os.environ.get('FOO'), os.getenv('FOO')
PY_RE = re.compile(r"os\.(?:environ\[|environ\.get\(|getenv\()\s*['\"]([A-Z][A-Z0-9_]+)['\"]")

PATTERNS = [PE_RE, PEI_RE, GEV_RE, PY_RE]

vars_seen = set()
for rel_root, exts in SCAN:
    base = os.path.join(root, rel_root)
    if not os.path.isdir(base):
        continue
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            if not name.endswith(exts):
                continue
            fpath = os.path.join(dirpath, name)
            try:
                with open(fpath, errors="replace") as f:
                    content = f.read()
            except OSError:
                continue
            for pat in PATTERNS:
                for m in pat.finditer(content):
                    vars_seen.add(m.group(1))

# Drop vars that are universally present and not platform-specific.
# These are inherited from the shell / systemd and not our config surface.
BUILTIN = {
    "PATH", "HOME", "USER", "USERNAME", "SHELL", "PWD", "OLDPWD",
    "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "HOSTNAME",
    "NODE_ENV",  # Node.js convention, handled separately in docs
    "PYTHONPATH", "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE",
    "PORT",  # every service has a port; documented per-service, not globally
    "CI", "GITHUB_ACTIONS", "GITHUB_TOKEN",  # CI-only
    "DEBUG",  # generic debug flag
}

for v in sorted(vars_seen):
    if v in BUILTIN:
        continue
    print(v)
PY

python3 - "$DOC" > "$DOC_VARS" <<'PY'
import re, sys

with open(sys.argv[1]) as f:
    text = f.read()

# The doc uses several formats. Capture any all-caps identifier that
# appears either:
#   - in a markdown table cell wrapped in backticks: `FOO_BAR`
#   - as a bold heading: **FOO_BAR**
#   - as a bare line prefix: "FOO_BAR="
#   - as the first column of a markdown table row: "| FOO_BAR | default | ..."
TICK_RE = re.compile(r"`([A-Z][A-Z0-9_]{2,})`")
BOLD_RE = re.compile(r"\*\*([A-Z][A-Z0-9_]{2,})\*\*")
ASSIGN_RE = re.compile(r"(?m)^([A-Z][A-Z0-9_]{2,})\s*=")
TABLE_RE = re.compile(r"(?m)^\|\s*([A-Z][A-Z0-9_]{2,})\s*\|")

seen = set()
for pat in (TICK_RE, BOLD_RE, ASSIGN_RE, TABLE_RE):
    for m in pat.finditer(text):
        seen.add(m.group(1))

# Strip obvious non-env tokens that the regex snags (e.g. acronyms).
NON_ENV = {
    "TODO", "FIXME", "NOTE", "WARNING", "IMPORTANT",
    "JSON", "YAML", "HTTP", "HTTPS", "URL", "URI",
    "ID", "UUID", "API", "AI", "UI", "UX", "DB", "OS", "CPU", "GPU", "RAM",
    "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD",
    "TRUE", "FALSE", "NULL", "NONE",
    "OK", "ERROR", "FATAL", "INFO", "DEBUG", "TRACE",
}
for v in sorted(seen):
    if v in NON_ENV:
        continue
    print(v)
PY

sort -u -o "$CODE_VARS" "$CODE_VARS"
sort -u -o "$DOC_VARS" "$DOC_VARS"

CODE_N=$(wc -l < "$CODE_VARS")
DOC_N=$(wc -l < "$DOC_VARS")

echo "Env vars referenced in code: $CODE_N"
echo "Env vars documented:         $DOC_N"
echo

UNDOCUMENTED=$(comm -23 "$CODE_VARS" "$DOC_VARS")
UNDOC_N=$(printf '%s' "$UNDOCUMENTED" | grep -c . || true)

if [[ $UNDOC_N -gt 0 ]]; then
  echo "Env vars used in code but not documented ($UNDOC_N):"
  echo "$UNDOCUMENTED" | head -80
  echo
fi

# Phantoms (doc has it but code doesn't) are common and often false
# positives (historical vars, per-service config names used in compose,
# examples). We report but don't fail the script on them.
PHANTOM=$(comm -13 "$CODE_VARS" "$DOC_VARS")
PHANTOM_N=$(printf '%s' "$PHANTOM" | grep -c . || true)
if [[ $PHANTOM_N -gt 0 ]]; then
  echo "Documented but not referenced in code ($PHANTOM_N, advisory):"
  echo "$PHANTOM" | head -40
  echo
fi

if [[ $UNDOC_N -eq 0 ]]; then
  echo "No undocumented env vars."
  exit 0
fi

# Soft-fail: we surface drift but don't block CI until the two sides
# converge. Tighten as the delta shrinks.
exit 1
