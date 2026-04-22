# Open Bugs

Living list of **currently unresolved** bugs. Historical bug records live in
[`BUGS_ARCHIVE.md`](BUGS_ARCHIVE.md).

## Status

_Empty._ As of 2026-04-23, the Nov-2025 audit (51 issues) is fully resolved
through Production-Hardening phases 1-5. See `BUGS_ARCHIVE.md` for the full
history.

## How to add a bug

Append a new section below. Keep the entry short — full debugging notes go
into the PR / commit, not here. This file is a pointer to **what's open**,
not a replay of the investigation.

```markdown
## <ID>: <One-line title> (YYYY-MM-DD)

**Severity**: CRITICAL | HIGH | MEDIUM | LOW
**Area**: backend | frontend | infra | db | <service>
**Symptom**: What the user or operator sees.
**Repro**: Minimal steps to trigger.
**Owner**: <name, if assigned>
**Next step**: Concrete TODO.
```

When a bug is fixed:

1. Remove its section from this file.
2. Append a summary to `BUGS_ARCHIVE.md` with the fix commit SHA.
