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
├── App.tsx               # Main application: Anmeldung, Fehlergrenze, Routen
├── index.css             # Tailwind + Tokens aus @marken/theme.css + Shell-CSS
├── features/             # Feature modules
│   ├── workspace/        # Shell: Aktivitätsleiste, eine Ansicht, StatusBar
│   ├── apps/             # Die eigenen Apps: Übersicht, Rahmen
│   ├── freigaben/        # Offene Freigaben
│   ├── einstellungen/    # Persönliche Einstellungen
│   ├── settings/         # Die Verwaltung (nur Admin)
│   ├── modelle/          # Die Kurzliste des Geräts
│   ├── firmenordner/     # Der Firmenordner des Mitarbeiters
│   └── system/           # Login, Auslastung, Aktualisierungen, Sicherung
├── components/
│   ├── ui/               # ErrorBoundary, Skeleton, AuthCard, NichtGefunden
│   └── mascot/           # Das Maskottchen
├── contexts/             # Auth, Download, Activation, Toast
├── hooks/                # useApi, useTheme, useConfirm, useWebSocketMetrics, ...
├── stores/               # zustand (workspaceStore: die eine offene Ansicht)
├── config/               # api.ts (API-Basis), branding.ts
├── lib/                  # queryClient (TanStack Query)
├── utils/                # fehlertext, lazyNachladen, formatting, ...
└── __tests__/            # Unit tests (Vitest)
```

Die Primitive (Button, Dialog, Select, …), Muster und Bausteine liegen nicht
hier, sondern im Designsystem `packages/marken/` (Alias `@marken`, `cn()`
eingeschlossen).

## Key Patterns

- **API calls**: Always use `useApi()` hook — never raw `fetch()` or axios
- **Fehler anzeigen**: `fehlertext()` aus `utils/fehlertext.ts`, nie `err.message` roh
- **Toasts**: `useToast()` from ToastContext
- **Styling**: Tailwind utilities + Tokens aus `packages/marken/src/theme.css` (`var(--primary)`)
- **Icons**: `lucide-react` only (no react-icons)
- **Env vars**: `import.meta.env.VITE_*` (not process.env)
- **Theme**: `useTheme()`, Hell ist die Vorgabe, Dunkel über `data-theme="dark"`; die Wahl steht am Konto

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

Multi-stage Docker build: Node 22 (Vite build) -> nginx:1.27-alpine (serves `dist/`).

```bash
# Rebuild after changes
docker compose up -d --build dashboard-frontend
```

## Related Documentation

- [Design](../../docs/development/DESIGN.md) - UI guidelines (MANDATORY)
- [Development Guide](../../docs/development/DEVELOPMENT.md) - API patterns & debugging
- [API Reference](../../docs/api/API_REFERENCE.md) - Complete endpoint list
