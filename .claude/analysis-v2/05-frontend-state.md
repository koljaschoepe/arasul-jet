# Frontend State Management & Hooks — Arasul Dashboard

**Scope:** `hooks/`, `contexts/`, `stores/` (if exists) under `apps/dashboard-frontend/src/`
**Finding summary:** No critical bugs. 13 issues across High/Medium/Low. ~8–12h total cleanup effort.

---

## HIGH / MEDIUM FINDINGS

### 1. State Duplication in ChatContext (MEDIUM)

- **File:** `contexts/ChatContext.tsx:180–195, 212`
- **Issue:** `selectedModel` state is mirrored to `selectedModelRef` via a separate useEffect. Error-prone, wastes renders.
- **Action:** Use `useRef` directly or `useMemo` to derive ref value.
- **Effort:** S (30 min)

### 2. useTheme Subscription Leak (MEDIUM)

- **File:** `hooks/useTheme.ts:50–58`
- **Issue:** Second useEffect listening to `window.matchMedia` has no empty dependency array. Re-runs on every theme change, adding duplicate listeners.
- **Action:** Add `[]` dep or consolidate into single useEffect.
- **Effort:** S (20 min)

### 3. Over-Provided Contexts (MEDIUM)

- **Files:** `AuthContext.tsx`, `ChatContext.tsx`, `DownloadContext.tsx`, `ActivationContext.tsx`
- **Issue:** Overlapping concerns (model selection exists in both ChatContext and useModelStatus). No central client-state store.
- **Action:** Evaluate Zustand for non-persistent UI state (preferences, filters, pagination).
- **Effort:** M–L (2–4h migration)

### 4. useApi Coupled to AuthContext (MEDIUM)

- **File:** `hooks/useApi.ts:118–239`
- **Issue:** `useApi()` depends on `useAuth()` for `logout`. Every component transitively depends on AuthContext even without auth concerns.
- **Action:** Decouple — inject logout callback or make it optional.
- **Effort:** S–M (45 min)

### 5. useDebouncedSearch depsKey Pattern (MEDIUM)

- **File:** `hooks/useDebouncedSearch.ts:45–74`
- **Issue:** ESLint exhaustive-deps disabled; `depsKey = JSON.stringify(deps)` creates new strings every render. Intentional but confusing; suppression hides bugs.
- **Action:** Add rationale comment or refactor to stable deps array.
- **Effort:** S (15 min)

---

## LOW FINDINGS

### 6. Underutilized Hooks

- `useModalForm` — only used in `CreateDocumentDialog.tsx` (1 consumer)
- `useMediaQuery` — only used in `ExcelEditor.tsx` (2 calls)
- `usePagination` — **never imported**; state managed inside `useTableData` directly
- **Action:** DELETE `usePagination` (dead). Evaluate inlining others.
- **Effort:** S (30 min)

### 7. Duplicate SSE-Streaming Patterns

- **Files:** `DownloadContext.tsx`, `ActivationContext.tsx`, `ChatContext.tsx`
- **Pattern repeated 3×:** AbortController refs, active/error state, ref-based callbacks, background state accumulation.
- **Action:** Extract `useApiStream()` custom hook.
- **Effort:** M (1.5h)

### 8. useTokenBatching hardcoded 50ms

- **File:** `hooks/useTokenBatching.ts`
- **Issue:** Flush interval not configurable globally.
- **Effort:** S (30 min)

### 9. useMediaQuery Handler Not Memoized

- **File:** `hooks/useMediaQuery.ts:14`
- **Issue:** New function created every render.
- **Effort:** S (10 min)

### 10. useConfirm Pattern Unusual

- Returns object containing a render component (`ConfirmDialog`). Document or align with other hooks.
- **Effort:** S (20 min doc)

### 11. Feature-level hooks vs global hooks split

- `useSorting`, `usePagination`, `useColumnResize` live in feature layer, not in global `hooks/`. Consider consistency.
- **Effort:** S (reorg decision)

---

## STRUCTURAL OBSERVATIONS

### 12. No Client-State Store Library

- No Zustand/Redux/MobX — all state in Context. Harder to share derived state; no devtools.
- **Recommendation:** Zustand for lightweight UI state.

### 13. ToastContext Cleanup — Correct Pattern

- `contexts/ToastContext.tsx:93–98` correctly stores timeout IDs and clears them. **Use as reference** for other timer-holding contexts.

---

## UNUSED EXPORTS

- `usePagination` — confirmed unused (DELETE)
- All other exported hooks have ≥1 consumer.

---

## KILL LIST

| Target                | Why            |
| --------------------- | -------------- |
| `hooks/usePagination` | Never imported |

## REFACTOR LIST (prioritized)

| Target                                   | Effort   | Priority |
| ---------------------------------------- | -------- | -------- |
| Extract `useApiStream()` from 3 contexts | M (1.5h) | High     |
| Decouple useApi from AuthContext         | S (45m)  | High     |
| Fix useTheme empty dep array             | S (20m)  | High     |
| Consolidate model selection state        | M (1–2h) | Medium   |
| Evaluate Zustand migration               | L (2–4h) | Medium   |
| useMediaQuery handler memoize            | S (10m)  | Low      |

**Total estimate:** 8–12h to address all.
