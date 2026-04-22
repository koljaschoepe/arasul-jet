# Arasul — Roadmap

Single source of truth for "what's being worked on and what's already been
decided." Historical analysis/plan documents are listed at the bottom with
their status — they are kept for context but are **not** the active work
surface.

---

## Active work surface

**Current branch:** `cleanup/phase-6-test-coverage` (despite the name, also
carries Phase 7 and Phase 8 cleanup work — rename postponed to avoid
rebase churn).

**Active plan:** [`.claude/CLEANUP_PLAN.md`](../.claude/CLEANUP_PLAN.md) —
this is the living plan that drives commits. It supersedes every plan
document listed in the archive table below.

### Phase status

| Phase | Title                 | Status     | Notes                                                     |
| ----- | --------------------- | ---------- | --------------------------------------------------------- |
| 0     | Critical Fixes        | ✅ done    | SEC-001, BUG-001/002/003, 4 RAG tests, hooks              |
| 1     | Kill List             | ✅ done    | 16 dead tables dropped, dead routes + deps removed        |
| 2     | Backend Refactor      | ✅ done    | validateBody coverage, breaker, async/await, env-var hub  |
| 3     | Frontend Refactor     | ✅ done    | fetch→useApi, ProtectedRoute, CSS vars, state cleanup     |
| 4     | Infra Cleanup         | ✅ done    | DOCKER_NETWORK, healthcheck normalisation, Python base    |
| 5     | Scripts & CLI         | ✅ done    | secret-write verify, script logging, orphan audit         |
| 6     | Test Coverage         | ✅ done    | auth parameterisation, factories, 646/646 frontend green  |
| 7     | Docs & Onboarding     | 🟡 active  | Migration refs, language policy, bugs split, ROADMAP done |
| 8     | Ops & Observability   | 🟡 active  | Alert E2E, DR drill in CI, health-endpoint contract       |
| 9     | Structural (optional) | ⏸ deferred | Long-term renames + shared libs — team decision per item  |

Emoji legend: ✅ done · 🟡 in progress · ⏸ intentionally not started ·
❌ blocked.

---

## What's next after Phase 8

Phase 9 items are **individually discussable** and not scheduled. They
trigger when a concrete need shows up (e.g. shared Python lib gets built
when a 4th service needs the same helper, not before). See
[`.claude/CLEANUP_PLAN.md`](../.claude/CLEANUP_PLAN.md) §9.

Beyond the cleanup plan, product work lives in
[`.claude/ANALYSIS_PLAN.md`](../.claude/ANALYSIS_PLAN.md) — Thor-support,
5-year-autonomy features, fleet-management. That's a separate track.

---

## Archived plan documents

These files were written at various points in early 2026 during
multi-agent audits. They captured the repo state **at their date** and
informed the phased cleanup plan. Keep them for context but **do not work
from them** — they will drift out of sync with reality, and some already
have.

| File                                | Date       | Status                              |
| ----------------------------------- | ---------- | ----------------------------------- |
| `PRODUCTION_READINESS_PLAN.md`      | 2026-04-04 | 📜 Superseded by CLEANUP_PLAN.md    |
| `COMPREHENSIVE_IMPROVEMENT_PLAN.md` | 2026-04-09 | 📜 Superseded by CLEANUP_PLAN.md    |
| `PRODUCTION_READINESS_REPORT.md`    | 2026-04-10 | 📜 Historical audit snapshot        |
| `PRODUCTION_HARDENING_PLAN.md`      | 2026-04-15 | 📜 Absorbed into Phases 0 + 2 + 4   |
| `PLATFORM_REFACTORING_PLAN.md`      | 2026-04-19 | 📜 Absorbed into Phases 2 + 3       |
| `LLM_OPTIMIZATION_PLAN.md`          | 2026-??-?? | 📜 Product plan, handled separately |
| `RAG_OPTIMIZATION_PLAN.md`          | 2026-??-?? | 📜 Product plan, handled separately |
| `BUGS_ARCHIVE.md`                   | 2025-11-14 | 📜 Historical bug ledger            |

Each of these files carries a "superseded by ROADMAP.md" banner at the
top so that grep-discovery leads a new contributor here instead of into
a 500-line stale plan.
