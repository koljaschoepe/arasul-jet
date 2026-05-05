#!/usr/bin/env bash
# scripts/validate/validate-doc-links.sh
#
# Walk every committed markdown file, pull out [text](relative/path) links
# via a Python helper (regex with lookahead, more reliable than awk), and
# verify each target exists on disk. Reports broken links and exits 1.
#
# Skips:
#  - http(s)://, mailto:, tel:, ftp:// links (external)
#  - anchor-only links (#section)
#  - links inside docs/plans/archive/ and docs/archive/ (historical)
#  - links inside node_modules/ and .git/
#
# Run from any directory inside the repo:
#   ./scripts/validate/validate-doc-links.sh
#
# Exit codes: 0 = no broken links, 1 = broken links found, 2 = invocation error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT" || { printf 'cannot cd to repo root: %s\n' "$REPO_ROOT" >&2; exit 2; }

exec python3 - <<'PY'
import os
import re
import subprocess
import sys

REPO_ROOT = os.getcwd()

# Find all committed markdown files, skip archives and vendored.
proc = subprocess.run(
    ["git", "ls-files", "*.md"],
    capture_output=True, text=True, check=True,
)
md_files = [
    line for line in proc.stdout.splitlines()
    if line and not line.startswith("docs/plans/archive/")
    and not line.startswith("docs/archive/")
    and not line.startswith("node_modules/")
]

# Match [text](link). Allow balanced nested parens in the LINK target by
# matching everything up to the LAST `)` on the same logical link; in
# practice markdown links don't span multiple lines so we keep it line-local.
# The text part allows any chars except ']' (this avoids over-eager matches).
LINK_RE = re.compile(r"\[(?:[^\]]|\\\])*\]\(([^)\s]+(?:\s+\"[^\"]*\")?)\)")

# Ignore code fences so we don't grep `[link](path)` examples in code blocks.
def iter_links(path):
    in_fence = False
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line_no, line in enumerate(f, start=1):
            if line.lstrip().startswith("```"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for m in LINK_RE.finditer(line):
                link = m.group(1)
                # Strip optional title: `path "Title"` -> `path`
                link = link.split()[0] if " " in link else link
                yield line_no, link

EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "tel:", "ftp://", "data:")

def normalize(src_dir, link):
    target = link.split("#", 1)[0].split("?", 1)[0]
    if not target:
        return None
    if target.startswith("/"):
        abs_target = REPO_ROOT + target
    else:
        abs_target = os.path.normpath(os.path.join(src_dir, target))
    return abs_target

broken = []
checked = 0

for md in md_files:
    src_dir = os.path.dirname(os.path.join(REPO_ROOT, md))
    for line_no, link in iter_links(md):
        if any(link.startswith(p) for p in EXTERNAL_PREFIXES):
            continue
        if link.startswith("#"):
            continue
        target = normalize(src_dir, link)
        if target is None:
            continue
        checked += 1
        if not os.path.exists(target):
            broken.append((md, line_no, link, target))

for md, line_no, link, target in broken:
    print(f"{md}:{line_no}: BROKEN: {link}  ->  {target}")

print(f"\nChecked {checked} link(s) across {len(md_files)} file(s). Broken: {len(broken)}")
sys.exit(1 if broken else 0)
PY
