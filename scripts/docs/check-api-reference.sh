#!/usr/bin/env bash
#
# check-api-reference.sh
#
# Extracts every `router.<method>('<path>', …)` call from the backend
# routes tree and compares the resulting METHOD + PATH set against what
# is documented in docs/API_REFERENCE.md.
#
# Multi-line router calls are common in this repo, so we read each
# route file in full with python3 and regex across newlines.
#
# This is a drift check, not a pedantic cross-reference: path prefixes
# set up in src/routes/index.js (via `app.use('/api/foo', foo)`) are
# normalised heuristically from the mount table we parse below.
#
# Exit code: 0 if both sides roughly match, 1 if there is notable drift.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROUTES_DIR="$ROOT/apps/dashboard-backend/src/routes"
ROUTES_INDEX="$ROUTES_DIR/index.js"
API_DOC="$ROOT/docs/API_REFERENCE.md"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

ROUTES_FOUND="$WORKDIR/routes-found.txt"
ROUTES_DOCUMENTED="$WORKDIR/routes-documented.txt"

python3 - "$ROUTES_DIR" "$ROUTES_INDEX" > "$ROUTES_FOUND" <<'PY'
import os, re, sys

routes_dir, index_file = sys.argv[1], sys.argv[2]

# --- Helpers ---------------------------------------------------------
# Pattern 1:  router.use('/prefix', ..., require('./relative'))
USE_REQUIRE_RE = re.compile(
    r"router\.use\(\s*['\"]([^'\"]+)['\"]\s*,"
    r"(?:[^)]*?)"
    r"require\(\s*['\"]\.\/([^'\"]+)['\"]\s*\)"
    r"\s*\)",
    re.DOTALL,
)
# Pattern 2 (common inside sub-index.js):
#     const fooRouter = require('./foo');
#     router.use('/prefix', fooRouter);
REQUIRE_VAR_RE = re.compile(
    r"(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['\"]\.\/([^'\"]+)['\"]\s*\)"
)
USE_VAR_RE = re.compile(
    r"router\.use\(\s*['\"]([^'\"]+)['\"]\s*,\s*(?:[^,)]*,\s*)?(\w+)\s*\)",
    re.DOTALL,
)

METHOD_RE = re.compile(
    r"router\.(get|post|put|patch|delete|all)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.DOTALL,
)


def read(path):
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return ""


def resolve_target(cur_dir, rel):
    """Resolve a require('./x') target to an absolute file path (or None)."""
    base = os.path.normpath(os.path.join(cur_dir, rel))
    candidates = [base + ".js", os.path.join(base, "index.js")]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def mounts_in_file(path):
    """Return list of (prefix, target_file_abs_path) for router.use in file."""
    content = read(path)
    cur_dir = os.path.dirname(path)
    out = []
    seen = set()
    for m in USE_REQUIRE_RE.finditer(content):
        prefix, rel = m.group(1), m.group(2)
        target = resolve_target(cur_dir, rel)
        if target:
            key = (prefix, target)
            if key not in seen:
                seen.add(key)
                out.append(key)

    # Two-step variant: const x = require('./y'); router.use('/p', x)
    bindings = {}
    for m in REQUIRE_VAR_RE.finditer(content):
        var, rel = m.group(1), m.group(2)
        target = resolve_target(cur_dir, rel)
        if target:
            bindings[var] = target
    for m in USE_VAR_RE.finditer(content):
        prefix, var = m.group(1), m.group(2)
        if var in bindings:
            key = (prefix, bindings[var])
            if key not in seen:
                seen.add(key)
                out.append(key)
    return out


# --- Walk the mount tree starting from routes/index.js ---------------
# BFS: for each (file, prefix_so_far), extract direct routes and recurse
# into any router.use sub-mounts inside that file.
seen_routes = set()
visited_files = set()  # (file_abs, prefix) to avoid infinite loops

queue = [(os.path.abspath(index_file), "/api")]
while queue:
    fpath, prefix = queue.pop(0)
    key = (fpath, prefix)
    if key in visited_files:
        continue
    visited_files.add(key)

    content = read(fpath)

    # Direct router.<method>(...) calls in this file
    # Note: the main routes/index.js exposes a few of these too (e.g. /_meta).
    for m in METHOD_RE.finditer(content):
        method = m.group(1).upper()
        path = m.group(2)
        if not path.startswith("/") and path != "":
            path = "/" + path
        full = prefix.rstrip("/") + path
        full = re.sub(r"/+", "/", full) or "/"
        if len(full) > 1 and full.endswith("/"):
            full = full[:-1]
        seen_routes.add(f"{method} {full}")

    # Recurse into sub-mounts
    for sub_prefix, target in mounts_in_file(fpath):
        child_prefix = prefix.rstrip("/") + sub_prefix
        child_prefix = re.sub(r"/+", "/", child_prefix) or "/"
        queue.append((target, child_prefix))

for line in sorted(seen_routes):
    print(line)
PY

# ---- 2. Extract documented METHOD + PATH pairs from API_REFERENCE.md ----
# The doc uses several formats; pick up the most common ones:
#   | GET  | /api/foo |
#   `GET /api/foo`
#   ### GET /api/foo
python3 - "$API_DOC" > "$ROUTES_DOCUMENTED" <<'PY'
import re, sys

with open(sys.argv[1]) as f:
    text = f.read()

# Path character class: letters, digits, slashes, _, {}, :, -. Trailing
# punctuation like colons in markdown headings is stripped below.
pair_re = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE|ALL)\s+(/[A-Za-z0-9/_{}:\-]*)")

seen = set()
for m in pair_re.finditer(text):
    method = m.group(1).upper()
    path = m.group(2)
    # If the next character is `\` (escaped asterisk in markdown), the
    # doc is using a wildcard heading like `POST /api/foo/\*` — not a
    # real route. Bare `*` is typically from `**heading**` markdown.
    end = m.end(2)
    if end < len(text) and text[end] == "\\":
        continue
    # Strip trailing markdown punctuation that sneaks in via headings.
    path = path.rstrip(":/")
    if not path:
        continue
    # Only count paths that look like full API paths. Relative examples
    # in code blocks (e.g. "GET /:id" from an extracted snippet) are
    # noise for this drift check.
    if not path.startswith("/api/"):
        continue
    seen.add(f"{method} {path}")

for line in sorted(seen):
    print(line)
PY

FOUND_N=$(wc -l < "$ROUTES_FOUND")
DOC_N=$(wc -l < "$ROUTES_DOCUMENTED")

echo "Routes discovered in source:  $FOUND_N"
echo "Routes documented in API ref: $DOC_N"
echo

# ---- 3. Diff ----
# "Undocumented" = implemented but not in the doc.
# "Phantom"      = doc has it but source does not (renamed/removed route).
UNDOCUMENTED=$(comm -23 "$ROUTES_FOUND" "$ROUTES_DOCUMENTED")
PHANTOM=$(comm -13 "$ROUTES_FOUND" "$ROUTES_DOCUMENTED")

UNDOC_N=$(printf '%s' "$UNDOCUMENTED" | grep -c . || true)
PHANTOM_N=$(printf '%s' "$PHANTOM" | grep -c . || true)

if [[ $UNDOC_N -gt 0 ]]; then
  echo "Routes implemented but not documented ($UNDOC_N):"
  echo "$UNDOCUMENTED" | head -60
  echo
fi

if [[ $PHANTOM_N -gt 0 ]]; then
  echo "Routes documented but not found in source ($PHANTOM_N):"
  echo "$PHANTOM" | head -60
  echo
fi

if [[ $UNDOC_N -eq 0 && $PHANTOM_N -eq 0 ]]; then
  echo "API_REFERENCE.md matches implemented routes."
  exit 0
fi

# Soft-fail: we flag drift but don't block CI on the first run because
# path normalisation between the doc and the mount table is imperfect.
# Tighten this as the two converge.
exit 1
