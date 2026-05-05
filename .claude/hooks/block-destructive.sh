#!/usr/bin/env bash
# .claude/hooks/block-destructive.sh
#
# PreToolUse hook for the Bash tool. Reads the tool-call JSON from stdin,
# extracts .tool_input.command, and exits 2 if the command matches a
# destructive pattern that permissions.deny cannot fully cover:
#
#   - rm -rf against critical paths (defense-in-depth on top of deny rule)
#   - git push --force / -f against main or master
#   - git reset --hard against origin/main or origin/master
#   - dd if=  /  mkfs.*  /  fdisk on a /dev path
#
# Exit 2 aborts the tool call. Exit 0 (or any non-2 code) allows it.
# Stays silent on stdout for allow-cases.

input=$(cat)

# Extract the bash command. Try python3 (always available in our envs)
# and fall back to a no-op if parsing fails — fail-open is correct here
# because the alternative would brick every Bash call on a parser bug.
cmd=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    pass
' 2>/dev/null || true)

[ -z "$cmd" ] && exit 0

block() {
  printf 'BLOCKED by .claude/hooks/block-destructive.sh\n' >&2
  printf 'Reason:  %s\n' "$1" >&2
  printf 'Command: %s\n' "$cmd" >&2
  printf 'Run manually outside Claude Code if you really need this.\n' >&2
  exit 2
}

match() { printf '%s' "$cmd" | grep -qE "$1"; }

# rm -rf against critical paths. The flags can appear in any order
# (rm -rf, rm -fr, rm -rfv, rm -r -f, ...), so we accept any -*rf*-style
# combination plus a separated "-r ... -f" form.
if match 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-r[[:space:]]+-f|-f[[:space:]]+-r)[[:space:]]+(/[[:space:]]*$|/$|~|\$HOME|/etc|/var|/usr|/boot|/bin|/sbin|/lib)'; then
  block "rm -rf against critical path"
fi

# Force-push to main/master. Catches --force, --force-with-lease, and -f.
if match 'git[[:space:]]+push.*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)).*[[:space:]](main|master)([[:space:]]|$)'; then
  block "git push --force against main/master"
fi

# Hard reset to remote main/master.
if match 'git[[:space:]]+reset[[:space:]]+--hard[[:space:]]+.*origin/(main|master)'; then
  block "git reset --hard against origin/main or origin/master"
fi

# Disk-level destruction.
if match '(^|[[:space:];|&])dd[[:space:]]+(if|of)='; then
  block "dd I/O operation"
fi
if match '(^|[[:space:];|&])mkfs\.[a-z0-9]+'; then
  block "mkfs.* (filesystem creation)"
fi
if match '(^|[[:space:];|&])fdisk[[:space:]]+/dev'; then
  block "fdisk on a device"
fi

exit 0
