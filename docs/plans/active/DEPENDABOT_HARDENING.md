# Dependabot + Lock-File Hardening

> **Status 2026-06-03:** AC1 (package-lock.json regeneriert) ✅ via c20e8c5. AC3 (Branch Protection required status checks) adressiert in P1-1 des Audit-Plans 2026-06-03 — pending GitHub-Settings-Konfiguration. AC2 (CI Lock-File-Drift Guard) + AC4 (CLAUDE.md Lock-File-Entscheidung) noch offen.

> **Status:** Active · **Owner:** Kolja · **Created:** 2026-05-05
>
> **Goal:** Prevent the lock-file divergence that broke `main` on 2026-05-05 (three Dependabot merges landed via auto-merge with stale root `package-lock.json`, breaking every CI run until reverted in PR #77).

---

## 1. What happened

1. PRs #74, #54, #71 sat in the Dependabot queue with failing CI.
2. To unblock the queue I ran `gh pr merge --auto --squash` on each.
3. Once Dependabot rebased them and they became mergeable, GitHub auto-merge fired — **without** waiting for green CI, because the repo has no branch-protection rules requiring status checks.
4. The three merges landed on `main` with broken state.
5. Every subsequent CI run (PR #76, all other open Dependabot PRs) failed at `npm ci` from root: "lock file's jest@29.7.0 does not satisfy jest@30.3.0", "lock file's react-router-dom@6.30.3 does not satisfy 7.15.0", etc. across 30+ packages.
6. Reverted the three merges in PR #77. Main is green again.

## 2. Root cause

This monorepo has **three** npm lock files:

| File                                         | Size   | Purpose                                      |
| -------------------------------------------- | ------ | -------------------------------------------- |
| `/package-lock.json`                         | 969 KB | What `npm ci` from root reads (CI uses this) |
| `/apps/dashboard-backend/package-lock.json`  | 345 KB | Per-workspace lock                           |
| `/apps/dashboard-frontend/package-lock.json` | 462 KB | Per-workspace lock                           |

`.github/dependabot.yml` is configured **per workspace**:

```yaml
- package-ecosystem: 'npm'
  directory: '/apps/dashboard-backend'
- package-ecosystem: 'npm'
  directory: '/apps/dashboard-frontend'
```

So Dependabot updates `apps/dashboard-{backend,frontend}/package.json` and the matching per-workspace lock — but **never touches root `package-lock.json`**. After a merge, root lock and workspace `package.json` diverge → `npm ci` from root fails.

PR #75 (DX overhaul) didn't trigger this because it doesn't touch any package.json. The bug only surfaces when a Dependabot PR lands.

## 3. Acceptance criteria

The hardening is complete when **all** of the following are true:

| #   | Criterion                                                                                                                | Verification                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| AC1 | After any Dependabot PR merges, `npm ci` from root passes on `main`.                                                     | CI green on push to main after a Dependabot merge.                                                            |
| AC2 | A PR that would leave root lock out of sync **fails CI before** it can merge.                                            | Add a guard step that runs `npm ci` from root + `git diff --exit-code package-lock.json` after `npm install`. |
| AC3 | Branch protection on `main` requires CI Summary to be SUCCESS before merge (any method, including auto-merge).           | `gh api repos/.../branches/main/protection` shows the rule.                                                   |
| AC4 | Documented decision: which lock-file pattern this repo uses going forward (root-only, per-workspace-only, or sync-both). | This file's §5 + an entry in root `CLAUDE.md`.                                                                |

## 4. Out of scope

- Bumping any actual dependency versions (do that after this hardening lands).
- Switching package manager (npm → pnpm / bun) — separate decision.

## 5. Options

### Option A — Single root lock, drop per-workspace locks (recommended)

Canonical npm-workspaces pattern. Delete `apps/*/package-lock.json`; `npm install` from root produces one lock that includes the flattened tree of every workspace.

Required changes:

1. `git rm apps/dashboard-backend/package-lock.json apps/dashboard-frontend/package-lock.json packages/shared-schemas/package-lock.json`
2. Update `apps/dashboard-{backend,frontend}/Dockerfile` so it `COPY`s the root `package.json` + root `package-lock.json` first, then the workspace `package.json`s, then runs `npm ci --omit=dev --workspace=<name>` from `/app` rather than `npm install --install-links` from `/app/<workspace>`.
3. Reconfigure `.github/dependabot.yml`: replace the two per-workspace npm entries with **one** root entry (`directory: '/'`), so updates land as one PR per group with the root lock regenerated.
4. Add a CI step that runs `npm install --package-lock-only` and fails if `git status --porcelain package-lock.json` is non-empty (catches drift).

Pros: one source of truth, fewer files, Dependabot config is simpler.
Cons: Dockerfile restructure touches production runtime images — needs a careful smoke test.

### Option B — Keep per-workspace, sync root lock via post-update hook

Keep both. After a Dependabot PR opens, a GitHub Action runs `npm install` from root (regenerates root lock) and pushes the result back to the PR branch.

Pros: Dependabot config unchanged. No Dockerfile changes.
Cons: Adds a write-back action (needs PAT or app token); the action can race with Dependabot's own rebases. Two locks remain a footgun for human contributors.

### Option C — Move CI off root npm ci

Change `.github/workflows/test.yml` so `backend` and `frontend` jobs run `npm ci` from inside their workspace dir (which uses the per-workspace lock). Keep the root lock for root devDependencies (eslint/prettier/husky/lint-staged) only.

Pros: smallest change. No Docker change.
Cons: We lose the workspace install-on-root optimization. Root lock still drifts but no one notices because nothing checks it.

### Recommendation

**Option A** for correctness + future contributor sanity. **Option C** is acceptable as a stopgap if Dockerfile restructure isn't worth the risk this week.

## 6. Branch protection (independent fix, do this first)

Regardless of which lock strategy we pick, add this **today** to prevent another auto-merge bypass:

```bash
gh api repos/koljaschoepe/arasul-jet/branches/main/protection \
  -X PUT -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=CI Summary' \
  -F enforce_admins=false \
  -F required_pull_request_reviews=null \
  -F restrictions=null
```

This makes `gh pr merge --auto` actually wait for `CI Summary` to be SUCCESS before merging, which is what we wanted in the first place.

`enforce_admins=false` keeps you (the only admin) able to bypass in genuine emergencies.

## 7. Recovery from 2026-05-05

- ✅ PR #77 reverted #74, #54, #71.
- ⏳ PR #76 (Dockerfile node-22 bump) is independent; rebased onto restored main and back in CI.
- ⏳ Re-trigger Dependabot to recreate the three reverted bumps as fresh PRs once the lock issue is solved (Option A or C above). Until then, do **not** merge them.

## 8. Open questions

- Q1: Are the per-workspace lock files actually consumed by anything other than Dependabot? (Spot-check: do the Dockerfiles `COPY` them? — yes, they do, so they're not orphaned today.)
- Q2: Was there a historical reason for keeping all three locks, or was this an accident from migrating to workspaces?
- Q3: Branch-protection — should we require the full set of required checks (backend/frontend/docker-build/python-services) or just `CI Summary`? CI Summary is the existing aggregate so it's the cleanest single check.
