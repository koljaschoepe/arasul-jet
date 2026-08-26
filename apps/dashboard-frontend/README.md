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

## Directory Structure

```
src/
├── App.tsx               # Main application
├── index.css             # Tailwind + CSS variables + shadcn
├── features/             # Feature modules
│   ├── workspace/        # Shell: ActivityBar, Sidebar, Tabs, rechte Spalte (leer seit B2), StatusBar
│   ├── settings/         # System configuration
│   ├── store/            # Model store (Raster + Detailseite)
│   └── system/           # Login, setup wizard, updates
├── components/
│   ├── ui/               # Modal, Skeleton, LoadingSpinner, etc.
│   │   └── shadcn/       # shadcn/ui components
│   └── mascot/           # Das Maskottchen
├── contexts/             # React contexts
│   ├── AuthContext.tsx    # Authentication state
│   ├── DownloadContext.tsx# Model download tracking
│   ├── ActivationContext.tsx # Model activation
│   └── ToastContext.tsx   # Toast notifications
├── hooks/
│   ├── useApi.ts          # REST API hook (fetch-based)
│   ├── useWebSocketMetrics.ts # Real-time metrics
│   ├── useConfirm.tsx     # Confirmation dialogs
│   └── useTheme.ts        # Dark/light theme toggle
├── stores/               # zustand (workspaceStore, extensionStore, storeFilterStore, settingsStore)
├── config/
│   └── api.ts             # API base URL, auth headers
├── lib/
│   └── utils.ts           # cn() helper (clsx + tailwind-merge)
└── __tests__/             # Unit tests (Vitest)
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

- [Design](../../docs/development/DESIGN.md) - UI guidelines (MANDATORY)
- [Development Guide](../../docs/development/DEVELOPMENT.md) - API patterns & debugging
- [API Reference](../../docs/api/API_REFERENCE.md) - Complete endpoint list
