---
name: status
description: Compact German situation report in the terminal — roadmap gates, plan queue, open PRs (with hygiene flags), CI/deploy state, live Jetson health — ending with the recommended next command. Read-only.
argument-hint: '(no arguments)'
disable-model-invocation: true
---

# /status — Lagebild (terminal only, read-only)

One compact German block in the chat, ~12–18 lines. No pages, no files, no
writes, no fixes — if something needs action, the last line says which command
to run. Gather everything in parallel, degrade gracefully per source
(unreachable → one honest „nicht erreichbar“ line, never a stack trace).

## Sources

1. **Roadmap** — parse `#roadmap-meta` in `docs/plans/ROADMAP.html`:
   gates done/total, top 2–3 open themes by priority.
2. **Plan queue** — `#plan-meta` of every `docs/plans/active/*.html`:
   count per status (in-review / approved / in-progress / blocked); name the
   approved ones (that's what `/work` and tonight's nightly will pick up);
   flag blocked ones with their one-line reason.
3. **PRs** — `gh pr list --state open --json number,title,isDraft,autoMergeRequest,createdAt,headRefName`:
   count, and flag hygiene candidates per CONTRIBUTING (merged-but-open,
   stale > 7 days, Dependabot pile-up worth a bucket-triage).
4. **CI / Deploy** — `gh run list --limit 5 --json workflowName,conclusion,headBranch,updatedAt`:
   last `CI Summary` on main, last `deploy` run result.
5. **Jetson live** — over Tailscale, short timeouts (≤5s, `|| true`):
   `curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 https://100.121.244.80/`
   and `ssh -o ConnectTimeout=5 arasul@100.121.244.80 "docker compose -p arasul-platform ps --format '{{.Name}} {{.Status}}'"`.
   Report: reachable?, unhealthy containers by name (healthy ones as a count),
   plus GPU/RAM only if trivially available (`tegrastats` one-shot).

## Output shape (German, adapt freely)

```
Arasul-Lagebild · <datum>
1.0.0-Gates: <n>/7 · Top-Themen: <t1>, <t2>
Pläne: <a> approved (<namen>) · <b> in review · <c> blockiert (<grund>)
PRs: <n> offen — <hygiene-flags oder „Queue sauber“>
CI main: <grün/rot> · Letzter Deploy: <ergebnis, wann>
Jetson: <erreichbar/nicht> · <x>/<y> Container healthy <auffälligkeiten>
Nächster Schritt: /<command> <warum in 5 worten>
```

„Nächster Schritt“ picks exactly one: blocked plan or red deploy → that first;
approved plans waiting → `/work`; empty approved queue → `/plan`; PR pile-up →
nightly chores hint; all quiet → say so.

## Failure modes (don't)

- Writing or fixing anything (read-only), or opening pages/files.
- Padding the output — no tables of raw JSON, no per-container spam.
- Hanging on the device: every remote call gets a timeout.
