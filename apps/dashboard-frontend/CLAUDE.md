# CLAUDE.md — Dashboard Frontend

> React 19 SPA for the Arasul Platform. This file is the contract an AI agent
> follows when writing code under `apps/dashboard-frontend/`. For a feature
> overview, read `README.md` in this folder.

## Stack

React 19 · Vite 6 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
React Router v6 · TanStack Query v5 · Vitest · ESLint.

Path alias: `@/* → src/*` (configured in `tsconfig.json` and `vite.config.ts`).

## Folder convention

```
src/
  features/        Domain-organized UI. One folder per top-level route.
    chat/  documents/  store/  settings/  telegram/  database/  sandbox/
    dashboard/  projects/  datentabellen/  system/
  components/
    ui/            App-wide primitives (Modal, ErrorBoundary, EmptyState, …).
      shadcn/      shadcn/ui primitives (button, input, …) — generated.
    layout/        Sidebar, navigation chrome.
    editor/        Rich-text / code editors.
  hooks/           Cross-feature hooks (useApi, useFetchData, useTheme, …).
  contexts/        Global state (Auth, Toast, Chat, Download, Activation).
  lib/             queryClient, cn() helper.
  utils/           Pure utilities (csrf, formatting, sanitizeUrl, token).
  config/          api.ts (API_BASE, getAuthHeaders).
  types/           Cross-feature TypeScript types.
  index.css        Tailwind v4 theme + Arasul design tokens (@theme block).
  App.tsx          Router, providers, lazy-loaded route shells.
```

**Rule of placement:** if it's used by exactly one feature → live there.
If it's used by ≥2 features → promote to `components/ui/` or `hooks/`.
A component in `features/X/` must not be imported from `features/Y/`.

## Non-negotiable patterns

### 1. Every API call goes through `useApi`

```typescript
import { useApi } from '@/hooks/useApi';
import type { Document } from '@/types/documents';

function DocumentList() {
  const api = useApi();
  const load = async () => {
    const docs = await api.get<Document[]>('/documents');
    // ...
  };
}
```

`useApi` provides `get / post / put / patch / del / request`, auto-handles
auth headers, CSRF token, JSON parsing, 30 s timeout, 401-redirect, and
toast errors. It also normalizes the backend error envelope
(`{ error: { code, message, details } }`) into a flat `ApiError` with
`.status`, `.code`, `.details`. **Never call `fetch()` directly.**

### 2. TypeScript only — `.tsx` / `.ts`

`tsconfig.json` runs `strict: true` and `noUncheckedIndexedAccess`. New code
must be TypeScript. Don't add `.js` files; if you find one, prefer migrating
it as part of your task only when it's the file you need to edit.

### 3. Server state → React Query, client state → Context or local

- **Server data** that you read across re-renders: `useQuery` /
  `useMutation` against `lib/queryClient.ts`. Cache key = the API path.
- **Cross-page session state** (auth, toasts, active chat, downloads):
  one of the contexts in `src/contexts/`.
- **Page-local state**: `useState` / `useReducer`. Don't reach for context.

### 4. Theming — CSS variables, never hex literals

The whole color system lives in `src/index.css` as Tailwind v4 `@theme`
tokens (`--color-primary-*`, `--color-bg-*`, `--color-text-*`, …) plus
shadcn's CSS variables. Always reference via Tailwind utilities
(`bg-bg-card`, `text-text-primary`, `border-border-subtle`) or
`var(--…)` in `style={}`. **Never** inline `#1a2330` etc. — that bypasses
the theme and breaks light-mode / future re-skins.

### 5. shadcn/ui via `@/components/ui/shadcn/<name>`

Add components with the official CLI (do not paste the code by hand):

```bash
cd apps/dashboard-frontend && npx shadcn@latest add dialog
```

`components.json` already pins `style: new-york`, `tsx: true`, `iconLibrary:
lucide`. App-specific wrappers live in `components/ui/` (one level up).

### 6. Code-splitting for non-critical routes

`App.tsx` lazy-loads every secondary route via `React.lazy(() => import(...))`
inside a `<Suspense fallback={...}>` boundary. New top-level features should
follow that pattern; the Login, Chat, and shell are eagerly imported.

### 7. Errors — wrap routes with `RouteErrorBoundary`, components with `ComponentErrorBoundary`

Both come from `components/ui/ErrorBoundary`. Never let a thrown render
error crash the SPA — at minimum wrap each route element.

## Forbidden

- ❌ `fetch(...)` outside `useApi.ts` — every call goes through the hook.
- ❌ New `.js` files; don't write JSX without TypeScript.
- ❌ Hardcoded hex colors / pixel values when a theme token exists.
- ❌ Importing from `features/<other>/` — promote shared code first.
- ❌ Mutating data via `useEffect` chains when React Query covers it.
- ❌ `any` for return types from `api.get|post|...` — pass a type parameter.
- ❌ `console.log` left in shipping code.

## Testing

```bash
cd apps/dashboard-frontend
npm test                      # Vitest, src/__tests__/ + co-located *.test.tsx
npm run test:ci               # with coverage
npx playwright install        # install browsers (one-time, not in devDependencies)
npx playwright test           # E2E (needs platform running)
npm run lint                  # ESLint (.ts/.tsx)
```

Test setup: `src/setupTests.ts` (Vitest + jest-dom). Mock `useApi` via
`vi.mock('@/hooks/useApi', ...)`.

## When you change something

| You changed…                          | Also update                                |
| ------------------------------------- | ------------------------------------------ |
| A theme token / new color/radius/font | `docs/development/DESIGN_SYSTEM.md`        |
| A user-facing flow                    | `docs/ops/ADMIN_HANDBUCH.md`               |
| Added a top-level route               | `App.tsx` lazy import + sidebar entry      |
| Touched API typings                   | Keep the matching backend `schemas/` happy |

## Deploy

```bash
docker compose up -d --build dashboard-frontend
```

Build runs `vite build` in the container; nginx serves the result. No local
dev server — the user tests in the browser after each rebuild.
