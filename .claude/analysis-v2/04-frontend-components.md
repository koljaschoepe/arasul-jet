# Frontend Components Analysis — Arasul Dashboard

**Analyzed:** React 19 + Vite 6 + Tailwind v4 + shadcn/ui frontend at `/apps/dashboard-frontend/src/`
**Scope:** components/, features/, pages/, App.tsx, router config
**Status:** Production-ready SPA with moderate-to-major technical debt

---

## CRITICAL / HIGH FINDINGS

### 1. UNUSED COMPONENT — ConfirmIconButton (MEDIUM)

- **File:** `components/ui/ConfirmIconButton.tsx` (149 LOC)
- **Status:** Exported but **never imported** outside its own test
- **Evidence:** `grep -r "import.*ConfirmIconButton"` → only `ConfirmIconButton.test.tsx`
- **Action:** DELETE component + test
- **Effort:** S (5 min)

### 2. MODAL UNUSED PROPS (LOW)

- **File:** `components/ui/Modal.tsx` (144 LOC)
- **Props never used:** `initialFocusRef`, `returnFocusRef` (lines 31–32)
- **Impact:** Misleading interface contract
- **Action:** Remove from interface or actually implement focus management
- **Effort:** S (10 min)

### 3. RAW FETCH() USAGE — CLAUDE.md VIOLATION (MAJOR)

Raw `fetch()` bypasses error handling, retry, auth header injection. Violates CLAUDE.md Regel #2.

| File                                | Endpoint                                 | Status                |
| ----------------------------------- | ---------------------------------------- | --------------------- |
| `contexts/ChatContext.tsx:575, 850` | `/llm/jobs/{jobId}/stream`               | Raw fetch (streaming) |
| `contexts/DownloadContext.tsx`      | `/models/download`                       | Raw fetch             |
| `contexts/ActivationContext.tsx`    | `/models/{modelId}/activate?stream=true` | Raw fetch             |
| `contexts/AuthContext.tsx`          | `/auth/me`, `/auth/logout`               | Raw fetch             |
| `hooks/useWebSocketMetrics.ts`      | `/metrics/live`                          | Raw fetch (fallback)  |

- **Action:** Refactor to `useApi()` or create `useApiStream()` for SSE cases
- **Effort:** M (20 min/file, 5 files ≈ 2h total)

### 4. GOD COMPONENTS — >400 LOC (MAJOR)

| Component       | LOC  | Location                                 |
| --------------- | ---- | ---------------------------------------- |
| DocumentManager | 1550 | `features/documents/DocumentManager.tsx` |
| SetupWizard     | 1289 | `features/system/SetupWizard.tsx`        |
| ChatContext     | 1210 | `contexts/ChatContext.tsx`               |
| BotSetupWizard  | 974  | `features/telegram/BotSetupWizard.tsx`   |
| ChatInputArea   | 847  | `features/chat/ChatInputArea.tsx`        |
| BotDetailsModal | 783  | `features/telegram/BotDetailsModal.tsx`  |
| StoreApps       | 731  | `features/store/StoreApps.tsx`           |

**Recommended splits:**

- DocumentManager → `DocumentUploadPanel`, `DocumentFilters`, `RagSpaceManager`, `DocumentGrid`
- SetupWizard → per-step components + `useSetupWizardState()` hook
- ChatInputArea → `VisionUploadArea`, `CommandPalette`, `MessageComposer`
- BotDetailsModal → move inline `CommandsEditor` out (file already exists? verify duplication)

- **Effort:** L (2–4h per component)

### 5. HARDCODED COLORS — CLAUDE.md VIOLATION (MEDIUM)

- `features/projects/ProjectModal.tsx:14` — `const DEFAULT_COLOR = '#45ADFF'`
- `components/markdown/MermaidDiagram.tsx` — hardcoded fallback colors `#45ADFF`, `#F8FAFC`, `#2A3544`, `#EF4444`
- **Fix:** Create `utils/themeColors.ts` with `getCssVar(name, fallback)` helper
- **Effort:** S (15 min)

---

## MEDIUM FINDINGS

### 6. INLINE STYLES OVERUSE — 88 occurrences

88 `style={{...}}` blocks in `features/` alone. Static values should be Tailwind; only dynamic values justify inline style.

- **Effort:** L (2–3h incremental refactor)

### 7. DUPLICATE DIALOG/MODAL PATTERN

8 modals repeat open/close + footer pattern:
`CreateTableDialog`, `DocumentDetailsModal`, `SpaceModal`, `ProjectModal`, `CreateProjectDialog`, `EditProjectDialog`, `StoreDetailModal`, `BotDetailsModal`.

- **Fix:** Extract `ModalForm` wrapper with form submit/cancel defaults.
- **Effort:** M (1–2h)

### 8. NO PROTECTED ROUTES (MAJOR, SECURITY)

All routes rely on App-level `isAuthenticated` check only. Token expiry → stale UI until next action.

- **Fix:** `<ProtectedRoute>` wrapper component
- **Effort:** M (2h)

### 9. LEGACY ROUTE REDIRECTS

- `/documents` → `/data`
- `/telegram-bots` → `/telegram-bot`
- `/claude-code` → `/terminal`
- `/sandbox` → `/terminal`
- **Action:** Keep 1–2 versions, then remove.

---

## POSITIVE FINDINGS

- ✅ All components are `.tsx` (no `.js`/`.jsx`)
- ✅ TypeScript strict mode; coverage excellent
- ✅ Error boundaries: RouteErrorBoundary + ComponentErrorBoundary on all critical paths
- ✅ Lazy loading on 6 heavy routes
- ✅ Only lucide-react icons (no mixing)
- ✅ Semantic markup mostly good (`<Link>`, shadcn `<Button>`)
- ✅ ARIA labels / role / tabIndex present on custom interactive divs

---

## KILL LIST

| Target                                                       | Size        | Risk          |
| ------------------------------------------------------------ | ----------- | ------------- |
| `components/ui/ConfirmIconButton.tsx` + test                 | 149+X LOC   | None (unused) |
| `Modal.tsx` unused props `initialFocusRef`, `returnFocusRef` | ~2 lines    | None (unused) |
| Legacy route redirects (after 1–2 versions)                  | 4 `<Route>` | Low           |

## REFACTOR LIST

| Target                            | Effort | Priority          |
| --------------------------------- | ------ | ----------------- |
| Raw fetch() → useApi() (5 files)  | M      | High              |
| DocumentManager (1550 LOC) split  | L      | High              |
| SetupWizard (1289 LOC) split      | L      | High              |
| ChatContext (1210 LOC) split      | L      | High              |
| Hardcoded colors → themeColors.ts | S      | Medium            |
| ModalForm wrapper for 8 modals    | M      | Medium            |
| ProtectedRoute wrapper            | M      | High (security)   |
| Inline styles → Tailwind          | L      | Low (incremental) |

---

## CLEANUP PRIORITY MATRIX

| Issue                     | Severity | Effort      | Do First? |
| ------------------------- | -------- | ----------- | --------- |
| Raw fetch() → useApi()    | MAJOR    | M (5 files) | ✅ YES    |
| ProtectedRoute wrapper    | MAJOR    | M           | ✅ YES    |
| ConfirmIconButton cleanup | MEDIUM   | S           | ✅ YES    |
| Modal unused props        | LOW      | S           | ✅ YES    |
| Hardcoded colors          | MEDIUM   | S           | ✅ YES    |
| God components split      | MAJOR    | L each      | 🔄 PHASED |
| Duplicate modal pattern   | LOW      | M           | Later     |
| Inline styles             | LOW      | L           | Later     |

**Codebase stats:** 165 components, 202 test files, ~33.5k LOC.
