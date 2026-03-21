# Dashboard Frontend

Single Page Application (SPA) for the Arasul Platform dashboard.

## Overview

| Property  | Value                             |
| --------- | --------------------------------- |
| Port      | 3000 (internal), 80 (via Traefik) |
| Framework | React 19 + TypeScript             |
| Build     | Vite 6                            |
| Styling   | Tailwind CSS v4 + shadcn/ui       |
| Icons     | lucide-react                      |
| Routing   | React Router 6 (lazy loading)     |
| Charts    | Recharts                          |
| Tests     | Vitest 3 + React Testing Library  |
| E2E       | Playwright                        |

## Directory Structure

```
src/
├── App.tsx               # Main application
├── index.css             # Tailwind + CSS variables + shadcn
├── features/             # Feature modules (barrel exports)
│   ├── chat/             # Multi-conversation AI chat
│   ├── documents/        # Document upload & RAG management
│   ├── settings/         # System configuration
│   ├── store/            # App & model marketplace
│   ├── telegram/         # Telegram bot integration
│   ├── datentabellen/    # Spreadsheet editor
│   ├── claude/           # Claude Code terminal
│   ├── system/           # Login, setup wizard, updates
│   └── database/         # Database overview
├── components/
│   ├── layout/           # Sidebar, ScrollArea
│   ├── ui/               # Modal, Skeleton, LoadingSpinner, etc.
│   │   └── shadcn/       # shadcn/ui components (22)
│   └── editor/           # MarkdownEditor, MermaidDiagram, GridEditor
├── contexts/             # React contexts
│   ├── AuthContext.tsx    # Authentication state
│   ├── ChatContext.tsx    # Global chat/streaming state
│   ├── DownloadContext.tsx# Model download tracking
│   └── ToastContext.tsx   # Toast notifications (sonner)
├── hooks/
│   ├── useApi.ts          # REST API hook (fetch-based)
│   ├── useWebSocketMetrics.ts # Real-time metrics
│   ├── useTokenBatching.ts    # Streaming token batching
│   ├── useConfirm.ts      # Confirmation dialogs
│   └── useTheme.ts        # Dark/light theme toggle
├── config/
│   └── api.ts             # API base URL, auth headers
├── lib/
│   └── utils.ts           # cn() helper (clsx + tailwind-merge)
└── __tests__/             # Unit tests (Vitest)
e2e/                       # E2E tests (Playwright)
```

## Key Patterns

- **API calls**: Always use `useApi()` hook — never raw `fetch()` or axios
- **Toasts**: `useToast()` from ToastContext (powered by sonner)
- **Styling**: Tailwind utilities + CSS variables (`var(--primary-color)`)
- **Icons**: `lucide-react` only (no react-icons)
- **Env vars**: `import.meta.env.VITE_*` (not process.env)
- **Theme**: `useTheme()` hook, dark mode default, `.light-mode` override

## Development

```bash
# Tests (Vitest)
npx vitest run

# E2E tests (Playwright - requires running platform)
npx playwright test

# Lint
npm run lint:fix

# Build
npx vite build
```

## Build & Deployment

Multi-stage Docker build: Node 20 (Vite build) -> nginx:1.27-alpine (serves `dist/`).

```bash
# Rebuild after changes
docker compose up -d --build dashboard-frontend
```

## Related Documentation

- [Design System](../../docs/DESIGN_SYSTEM.md) - UI guidelines (MANDATORY)
- [Development Guide](../../docs/DEVELOPMENT.md) - API patterns & debugging
- [API Reference](../../docs/API_REFERENCE.md) - Complete endpoint list
