# Frontend Lib/Utils/Types Analysis — Arasul Dashboard

**Date:** 2026-04-22 | **Scope:** `src/lib/**`, `src/utils/**`, `src/types/**`  
**Total TS/TSX Files:** 203 across frontend

---

## Executive Summary

**Critical Issues Found:** 5  
**High Priority:** 8  
**Refactor Opportunities:** 3

Main problems:

1. **Duplicate formatting utilities** across components (formatDate, formatUptime, formatFileSize redefined 5+ times)
2. **Camel/snake_case duplication** in `TelegramBot` type (18 duplicate pairs)
3. **Unused type export** (`LoadedModelInfo`)
4. **Inconsistent type organization** (no shared types.ts; types scattered across features)
5. **Type shape misalignment** with feature-local types (e.g., `sections/types.ts` duplicates global types)

---

## Findings by Category

### 1. CRITICAL: Duplicate Type Definitions (Camel/Snake-Case)

**File:** `src/types/index.ts:133-169`  
**Type:** `TelegramBot`

The interface has **18 duplicate properties** supporting both camelCase and snake_case:

```typescript
// BAD — both forms present
llmModel?: string;
llm_model?: string;

systemPrompt?: string;
system_prompt?: string;

ragEnabled?: boolean;
rag_enabled?: boolean;

ragSpaceIds?: string[];
rag_space_ids?: string[];

ragShowSources?: boolean;
rag_show_sources?: boolean;

toolsEnabled?: boolean;
tools_enabled?: boolean;

voiceEnabled?: boolean;
voice_enabled?: boolean;

restrictUsers?: boolean;
restrict_users?: boolean;

allowedUsers?: string[];
allowed_users?: string[];

maxContextTokens?: number;
max_context_tokens?: number;

maxResponseTokens?: number;
max_response_tokens?: number;

rateLimitPerMinute?: number;
rate_limit_per_minute?: number;

createdAt?: string;
created_at?: string;

lastMessageAt?: string;
last_message_at?: string;
```

**Impact:** Confusing API surface; difficult to know which form to use when consuming API responses.  
**Effort:** HIGH — requires backend alignment  
**Action:**

- Pick one naming convention (preferably snake_case to match backend)
- Update all callers to normalize on entry
- Consider alias types if migration is phased

---

### 2. HIGH: Unused Type Export

**File:** `src/types/index.ts:114-120`

```typescript
export interface LoadedModelInfo {
  id: string;
  ollamaName: string;
  name: string;
  ramMb: number;
  expiresAt?: string;
}
```

**Usage:** 0 files import this directly; only referenced in `MemoryBudget.loadedModels` array.  
**Effort:** TRIVIAL  
**Action:** Remove; keep only if external consumers depend on it.

---

### 3. CRITICAL: Duplicate Formatting Utilities (Scattered Implementation)

Multiple components re-implement same logic instead of using `src/utils/formatting.ts` exports:

| Function          | File                                           | Line                         | Status            |
| ----------------- | ---------------------------------------------- | ---------------------------- | ----------------- |
| `formatDate`      | `utils/formatting.ts:11`                       | Exported                     | ✓ Used (4 places) |
| `formatDate`      | `features/database/DatabaseOverview.tsx:?`     | Local impl                   | ✗ Duplicate       |
| `formatDate`      | `features/database/components/TableCard.tsx:?` | Local impl                   | ✗ Duplicate       |
| `formatFileSize`  | `utils/formatting.ts:39`                       | Exported                     | ✓ Used (3 places) |
| `formatFileSize`  | `features/chat/ChatInputArea.tsx:?`            | Local impl                   | ✗ Duplicate       |
| `formatFileSize`  | `features/system/UpdatePage.tsx:?`             | Local impl                   | ✗ Duplicate       |
| `formatUptime`    | `utils/formatting.ts:67`                       | Exported                     | ✓ Used (1 place)  |
| `formatUptime`    | `features/settings/GeneralSettings.tsx:23`     | Local impl                   | ✗ Duplicate       |
| `formatUptime`    | `App.tsx:?`                                    | Local impl (via useCallback) | ✗ Duplicate       |
| `formatBytes`     | `utils/formatting.ts:53`                       | Exported                     | ✓ Used (0 places) |
| `formatBytes`     | `features/dashboard/DashboardHome.tsx:?`       | Local impl                   | ✗ Duplicate       |
| `formatModelSize` | `utils/formatting.ts:28`                       | Exported                     | ✓ Used (3 places) |
| `formatModelSize` | `features/system/SetupWizard.tsx:?`            | Local impl                   | ✗ Duplicate       |

**Effort:** MEDIUM  
**Action:**

1. Search/replace local `formatDate` → import from `utils/formatting`
2. Audit `formatBytes` in `DashboardHome.tsx` (unused export; local simpler version)
3. Consolidate `formatFileSize` implementations
4. Ensure all format functions handle null/undefined consistently

---

### 4. HIGH: Type Duplication — Feature-Local vs. Global Types

Feature modules define local `types.ts` that overlap with or duplicate global `src/types/index.ts`:

**Telegram:**

- Global: `TelegramBot`, `TelegramCommand`, `TelegramChat` (with camel/snake duplication)
- Local: `sections/types.ts` defines `Bot` (simpler schema)
- **Issue:** `BotSetupWizard.tsx` imports `TelegramBot` globally, but `TelegramBotPage.tsx` uses local `Bot` from `sections/types.ts`
- **Consistency:** Both should use one source of truth

**Datentabellen:**

- Local types (`Field`, `TableData`, `Row`, `CellValue`) are feature-specific ✓
- But not documented in global types ✓ (correct; no cross-feature usage)

**Sandbox:**

- Local types (`SandboxProject`, `ResourceLimits`, `TerminalSession`, `SandboxStats`)
- Not in global types ✓ (correct; isolated feature)

**Effort:** MEDIUM  
**Action:**

- Consolidate Telegram types: decide if `Bot` (lightweight, feature-local) or `TelegramBot` (heavyweight, global) is primary
- Document intent: feature-local types stay co-located; only cross-feature types go to `src/types/index.ts`

---

### 5. HIGH: OllamaModel Duplicate Definition

**Global location:** `src/types/index.ts:197-201`

```typescript
export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}
```

**Local (duplicate):** `features/telegram/BotSetupWizard.tsx:?`

```typescript
interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}
```

**Issue:** Identical shape but defined twice; local import shadows global.  
**Effort:** TRIVIAL  
**Action:** Remove local; import from `../../types`

---

### 6. MEDIUM: `any` / `unknown` Type Abuse

Minimal usage overall; found in lib/utils layers:

| File                              | Pattern                  | Usage                                                     |
| --------------------------------- | ------------------------ | --------------------------------------------------------- |
| `utils/token.ts:10`               | `[key: string]: unknown` | JwtPayload — acceptable, allows extensibility             |
| `lib/queryClient.ts:8`            | `error: unknown`         | React Query retry logic — acceptable, error typing varies |
| `features/datentabellen/utils.ts` | `value: unknown`         | formatCellValue — acceptable, cells can be any type       |

**Assessment:** No major issues; `unknown` used appropriately for extensible payloads.

---

### 7. MEDIUM: Inconsistent Module Structure

**Current state:**

- `lib/` has 2 files (queryClient, utils.ts/cn)
- `utils/` has 4 files (csrf, formatting, sanitizeUrl, token)
- `types/` has 1 monolithic file (266 lines)
- Features have co-located `types.ts` for local-only types ✓

**Issue:** Types.ts growing without organization. Related types (Auth: csrf, token) could have dedicated auth types.  
**Effort:** LOW → MEDIUM (refactor opportunity, not urgent)  
**Recommendation:**

- Keep monolithic `types/index.ts` for now (cross-feature reuse)
- If >300 lines, split by domain (e.g., `types/domain.ts`, `types/api.ts`, `types/models.ts`)

---

### 8. MEDIUM: Unused/Underused Exports

| Export                 | File                     | Usage Count            | Status                                    |
| ---------------------- | ------------------------ | ---------------------- | ----------------------------------------- |
| `cn()`                 | `lib/utils.ts:4`         | 66 files               | ✓ Heavy use                               |
| `queryClient`          | `lib/queryClient.ts:3`   | 1 file (App.tsx)       | ✓ Central setup                           |
| `getCsrfToken()`       | `utils/csrf.ts:13`       | 1 file (config/api.ts) | ✓ Used                                    |
| `getValidToken()`      | `utils/token.ts:20`      | 1 file (config/api.ts) | ✓ Used                                    |
| `setToken()`           | `utils/token.ts:72`      | 1 file (AuthContext)   | ✓ Used                                    |
| `getTokenExpiration()` | `utils/token.ts:83`      | 0 files                | ✗ **DEAD**                                |
| `sanitizeUrl()`        | `utils/sanitizeUrl.ts:8` | 2 files                | ✓ Used                                    |
| `formatBytes()`        | `utils/formatting.ts:53` | 0 files                | ✗ **DEAD** (shadow impl in DashboardHome) |
| `formatRelativeDate()` | `utils/formatting.ts:86` | 1 file                 | ✓ Used                                    |

**Dead code:**

- `getTokenExpiration()` — never called; consider: is this part of planned token refresh UI?
- `formatBytes()` — not used; `DashboardHome` has local simpler variant

**Effort:** TRIVIAL  
**Action:**

- Remove `getTokenExpiration()` unless token expiry warning UI is planned
- Keep `formatBytes()` exported; encourage use over shadow impl

---

### 9. MEDIUM: DocumentCategory Type Underused

**File:** `src/types/index.ts:39-43`

```typescript
export interface DocumentCategory {
  id: string;
  name: string;
  document_count?: number;
}
```

**Usage:** 2 files (likely legacy or very specific use)  
**Assessment:** Low-impact; keep unless API no longer supports categories.

---

### 10. LOW: CSRF Token Utility Granularity

**File:** `utils/csrf.ts`

Currently a single-function export. Could consolidate with token utils, but current separation is clean and security-focused.  
**Recommendation:** Keep as-is; isolation is appropriate for security-sensitive code.

---

## Structural Issues Summary

### Type Shape Misalignment

**TelegramBot** is the worst offender:

- Defined in global `types/index.ts`
- Locally redefined as lighter `Bot` in `sections/types.ts`
- Inconsistently imported across feature files

**Recommendation:**

1. Global `TelegramBot` should match backend JSON schema exactly (pick snake_case or camelCase, not both)
2. Feature components normalize on use (e.g., `normalizeTelegramBot()` helper)
3. OR define adapter layer: `Bot` (lightweight feature shape) vs. `TelegramBotDTO` (API shape)

---

## Priority Actions

| Severity     | Task                                              | Files                | Effort  |
| ------------ | ------------------------------------------------- | -------------------- | ------- |
| **CRITICAL** | Remove camel/snake duplication from `TelegramBot` | `types/index.ts`     | HIGH    |
| **HIGH**     | Consolidate duplicate formatting functions        | 8+ files             | MEDIUM  |
| **HIGH**     | Remove local `OllamaModel` redefinition           | `BotSetupWizard.tsx` | TRIVIAL |
| **MEDIUM**   | Remove dead `getTokenExpiration()`                | `utils/token.ts`     | TRIVIAL |
| **MEDIUM**   | Clean up unused `LoadedModelInfo`                 | `types/index.ts`     | TRIVIAL |
| **LOW**      | Consolidate `formatDate` in database feature      | 2 files              | TRIVIAL |
| **LOW**      | Document type organization policy                 | (docs)               | TRIVIAL |

---

## Quick Win Table: Remove Dead Code

```
File                          | Line  | Dead Code              | Impact
------------------------------|-------|------------------------|--------
src/utils/token.ts            | 83    | getTokenExpiration()   | Unused export
src/utils/formatting.ts       | 53    | formatBytes()          | Shadow impl exists
src/types/index.ts            | 114   | LoadedModelInfo        | Unused type
src/features/.../types.ts     | -     | OllamaModel (local)    | Duplicate
src/features/database/*.tsx   | -     | formatDate (local)     | 2x duplicate
src/features/chat/*.tsx       | -     | formatFileSize (local) | Duplicate
src/features/system/*.tsx     | -     | formatFileSize (local) | Duplicate
src/features/system/*.tsx     | -     | formatUptime (local)   | Duplicate
src/features/settings/*.tsx   | -     | formatUptime (local)   | Duplicate
src/App.tsx                   | -     | formatUptime (local)   | Duplicate
```

---

## Type Organization Policy (Recommended)

1. **Global types** (`src/types/index.ts`): Cross-feature domain types only
   - Models, Documents, Telegram, Chat, Queue entities
   - Response/request shapes from backend
2. **Feature-local types** (`features/*/types.ts`): Single-feature only
   - Component props, internal state shapes
   - UI-only types (not API-mapped)
3. **Utility types** (inline): Simple shape unions (e.g., `CellValue`)

---

## Follow-up: Backend Alignment Check

The `TelegramBot` duplication suggests:

- Is backend using snake_case exclusively?
- Frontend adapters needed for camelCase convention?
- Or frontend incorrectly mirrors both for backward compatibility?

**Recommendation:** Compare against latest backend OpenAPI/GraphQL schema to ensure type accuracy.
