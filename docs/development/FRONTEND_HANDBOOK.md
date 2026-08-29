# Frontend Handbook — React 19 SPA (TypeScript)

> **Long-form recipes** for working in `apps/dashboard-frontend/`.
> For the short, non-negotiable rules (forbidden patterns, folder layout,
> placement rules) read [`apps/dashboard-frontend/CLAUDE.md`](../../apps/dashboard-frontend/CLAUDE.md) first.
> This handbook is the worked-example companion: hooks usage, modal patterns,
> theming details, common forms.

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Framework  | React 19 + TypeScript (.tsx/.ts only, NO .js/.jsx)      |
| Build      | Vite 6 + @vitejs/plugin-react                           |
| CSS        | Tailwind CSS v4 + shadcn/ui (new-york style, slate)     |
| Icons      | lucide-react ONLY (no react-icons)                      |
| Toasts     | sonner (via ToastContext wrapper, NOT shadcn toast)     |
| Testing    | Vitest 3 + @testing-library/react + JSDOM               |
| Path alias | `@/` maps to `src/` (tsconfig.json + vite.config.ts)    |
| Env vars   | `import.meta.env.VITE_*` (NOT process.env.REACT*APP*\*) |

---

## Project Structure

```
apps/dashboard-frontend/src/
  App.tsx                    # Root component, routes, providers, lazy loading
  index.css                  # Import der Tokens aus @marken/theme.css + Shell-CSS

  features/                  # Feature modules
    workspace/               # Shell: ActivityBar (Apps, Modelle), Sidebar, Tabs, rechte Spalte (Notizen)
    apps/                    # Die eigenen Apps: Übersicht, Rahmen (D1)
    freigaben/               # Die offenen Freigaben auf der Übersicht (D2)
    notizen/                 # Der Zettel der rechten Spalte (D1)
    settings/                # Sektionen, darunter Apps (D4) und Mitarbeiter (D3)
    store/                   # Store (Modelle: Raster + Detailseite)
    system/                  # UpdatePage, SelfHealingEvents, Login, CreateAdmin

  components/
    ui/                      # Modal, Skeleton, StatTile, AuthCard, ErrorBoundary
                             # (Leerzustand, Ladezustand, Feldgruppe, Chart: seit H4 in @marken)
                             # (die Primitive liegen seit H3 in packages/marken/src/primitive/)
    mascot/                  # Das Maskottchen

  hooks/                     # Reusable hooks (useApi, useTheme, useFetchData, ...)
  contexts/                  # AuthContext, DownloadContext, ToastContext, ActivationContext
  config/                    # api.ts (API_BASE, getAuthHeaders), branding.ts
  lib/                       # queryClient (cn() steht seit H3 in @marken)
  utils/                     # csrf.ts, token.ts
  __tests__/                 # Vitest test suites + helpers/
```

---

## Design System

### Die Tokens (`packages/marken/src/theme.css`)

Sie standen bis **Phase H3** in `apps/dashboard-frontend/src/index.css`. Seit
die Primitive in der Bibliothek liegen und auf Tailwind geschrieben sind,
braucht **eine App** dieselben Tokens — also stehen sie dort, und `index.css`
holt sie mit einem `@import` ohne Schicht.

| Block                 | Was darin steht                                     |
| --------------------- | --------------------------------------------------- |
| `@theme`              | Rundungen, Schriften, Dichte-Skala, Diagrammpalette |
| `@theme inline`       | `--color-x: var(--x)` — die Brücke zu den Utilities |
| `:root`               | die Farben von **Hell**, der Vorgabe (H1)           |
| `[data-theme='dark']` | nur das, was im Dunkeln abweicht                    |

**Die Werte stehen hier absichtlich nicht.** Ein Handbuch, das eine Farbtabelle
abschreibt, ist die zweite Wahrheit, gegen die dieses Repo an sechs Stellen
antritt — und diese Liste war bis H3 die von vor H1 (dunkle Vorgabe,
`#101923`), also seit zwei Phasen falsch. Wer einen Wert sucht, liest
`theme.css`; die Entscheidungen dahinter stehen in
[`DESIGN.md`](DESIGN.md).

Was in `index.css` blieb: die Aliasse auf diese Tokens, die Alpha-Skalen,
Schatten, Verläufe, die Syntaxfarben und das Komponenten-CSS der Shell.

## Tailwind v4 Setup

The CSS setup in `index.css` uses Tailwind CSS v4 syntax:

```css
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
@import 'tw-animate-css';

/* Die Bausteine der Bibliothek — GESCHICHTET, damit eine Tailwind-Klasse
   an einem Baustein gewinnt. */
@import '../../../packages/marken/src/marken.css' layer(components);

/* Die Tokens — OHNE Schicht: ein `@theme` in `layer(...)` ist keins mehr,
   und `bg-primary` gäbe es dann nicht. */
@import '../../../packages/marken/src/theme.css';

/* Und Tailwind muss wissen, wo die Klassen der Primitive liegen: sie stehen
   NEBEN diesem Vite-Projekt, und von allein sucht es dort nicht. */
@source '../../../packages/marken/src';

@custom-variant dark (&:is(.dark *));
```

Key differences from Tailwind v3:

- No `tailwind.config.js` -- configuration is in CSS via `@theme` and `@theme inline`
- `@custom-variant dark` replaces `darkMode: 'class'` config
- `@layer base {}` for base styles
- Vite plugin: `@tailwindcss/vite` in `vite.config.ts`

---

## Hooks Reference

### `useApi()` -- Central API Hook (MANDATORY)

```tsx
import { useApi } from '@/hooks/useApi';

function MyComponent() {
  const api = useApi();

  // GET
  const data = await api.get<MyType>('/endpoint');

  // POST with body
  await api.post('/endpoint', { name: 'value' });

  // PUT, PATCH, DELETE
  await api.put('/endpoint/1', { name: 'updated' });
  await api.patch('/endpoint/1', { field: 'value' });
  await api.del('/endpoint/1');

  // Options: showError (default true), signal, raw, headers
  const res = await api.get('/file', { raw: true, showError: false });
}
```

Features:

- Automatic auth headers via `getAuthHeaders()`
- CSRF token injection for mutations
- 401 auto-logout
- JSON parsing (or raw Response when `raw: true`)
- 30s default timeout via AbortSignal
- Toast error notifications (disable with `showError: false`)

**NEVER use raw `fetch()` in components. Always use `useApi()`.**

### `useFetchData()` -- Data Loading with AbortController

```tsx
import { useFetchData } from '@/hooks/useFetchData';
import { useApi } from '@/hooks/useApi';

function MyComponent() {
  const api = useApi();

  const { data, loading, error, refetch } = useFetchData(
    async signal => {
      const [items, stats] = await Promise.all([
        api.get<Item[]>('/items', { signal, showError: false }),
        api.get<Stats>('/stats', { signal, showError: false }),
      ]);
      return { items, stats };
    },
    { initialData: { items: [], stats: null } }
  );

  if (loading) return <SkeletonCard />;
  if (error) return <div className="text-destructive">{error}</div>;

  return <div>{data.items.map(/* ... */)}</div>;
}
```

### `useModalForm()` -- Modal Form State

```tsx
import { useModalForm } from '@/hooks/useModalForm';

function MyModal({ isOpen, onClose, editItem }: Props) {
  const api = useApi();
  const toast = useToast();

  const { values, setValue, error, saving, handleSubmit, reset } = useModalForm(isOpen, {
    initialValues: { name: '', description: '' },
    onOpen: () =>
      editItem ? { name: editItem.name, description: editItem.description } : undefined,
  });

  return (
    <form
      onSubmit={handleSubmit(async () => {
        await api.post('/items', values);
        toast.success('Erstellt');
        onClose();
      })}
    >
      <Input value={values.name} onChange={e => setValue('name', e.target.value)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Speichere...' : 'Speichern'}
      </Button>
    </form>
  );
}
```

### `useDebouncedSearch()` -- Search-as-you-type

```tsx
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';

function SearchComponent() {
  const api = useApi();
  const [query, setQuery] = useState('');

  const { results, searching } = useDebouncedSearch(
    query,
    async (q, signal) => api.get<Item[]>(`/search?q=${q}`, { signal, showError: false }),
    { initialResults: [], delay: 300, minLength: 2 }
  );

  return (
    <>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Suchen..." />
      {searching && <Ladezustand />}
      {results.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </>
  );
}
```

### `useTheme()` -- die Darstellung des Angemeldeten

```tsx
import { useTheme } from '@/hooks/useTheme';

function ThemeWahl() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}
```

- `theme`: `'light' | 'dark'` -- Vorgabe `light`
- `setTheme(theme)`: schreibt `PUT /api/darstellung` und zieht den Benutzer im
  `AuthContext` nach. Gibt ein Versprechen zurueck; ein Fehler meldet sich
  ueber `useApi` und der Bildschirm bleibt, wie er war.
- Quelle ist `admin_users.theme` (Migration 180, Phase H1), NICHT der
  `localStorage`. Der Wert kommt mit `GET /api/auth/session` herein.
- Setzt `data-theme="dark"` und die Klasse `dark` auf `<html>`. Hell braucht
  kein Attribut: Hell ist `:root`.
- Kein `toggleTheme` mehr: bei zwei Optionen in den Einstellungen waere das
  Durchschalten ein zweiter Weg in denselben Zustand.

### `useConfirm()` -- Confirmation Dialogs

```tsx
import useConfirm from '@/hooks/useConfirm';

function MyComponent() {
  const { confirm, ConfirmDialog } = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eintrag loschen',
      message: 'Sind Sie sicher?',
      confirmText: 'Loschen',
      cancelText: 'Abbrechen',
      confirmVariant: 'danger', // 'danger' | 'warning' | 'primary'
    });
    if (ok) {
      await api.del('/items/123');
    }
  };

  return (
    <>
      <Button onClick={handleDelete}>Loschen</Button>
      {ConfirmDialog} {/* MUST render this in JSX */}
    </>
  );
}
```

### `useWebSocketMetrics()` -- Real-time Metrics

WebSocket connection with exponential backoff and HTTP polling fallback.

```tsx
import { useWebSocketMetrics } from '@/hooks/useWebSocketMetrics';

const { metrics, wsConnected, wsReconnecting } = useWebSocketMetrics(isAuthenticated);
```

---

## Contexts

### `AuthContext` -- Authentication State

```tsx
import { useAuth } from '@/contexts/AuthContext';

const { user, isAuthenticated, loading, login, logout, checkAuth } = useAuth();
// user: { id, username } | null
// login(data): called after successful login
// logout(): clears token, calls /auth/logout
```

Provider: `<AuthProvider>` wraps entire app.

### `ToastContext` -- Notifications

```tsx
import { useToast } from '@/contexts/ToastContext';

const toast = useToast();
toast.success('Gespeichert');
toast.error('Fehler beim Laden');
toast.warning('Achtung');
toast.info('Hinweis');
toast.remove(id); // Remove specific toast
toast.clear(); // Remove all
```

Provider: `<ToastProvider>` wraps entire app. Max 5 toasts visible.

### `DownloadContext` -- Model Downloads

```tsx
import { useDownloads } from '@/contexts/DownloadContext';

const { startDownload, cancelDownload, isDownloading, getDownloadState, activeDownloadCount } =
  useDownloads();
```

Manages model download progress globally, persists across page navigation.

---

## Component Patterns

### Lazy Loading (Code Splitting)

```tsx
// In App.tsx - secondary routes are lazy-loaded
const Settings = lazy(() => import('./features/settings/Settings'));
const Store = lazy(() => import('./features/store'));

// Wrapped in Suspense with fallback
<Suspense fallback={<Ladezustand />}>
  <Settings />
</Suspense>;
```

### ErrorBoundary

```tsx
import ErrorBoundary, { RouteErrorBoundary, ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';

// Route-level (full page error UI)
<RouteErrorBoundary>
  <MyPage />
</RouteErrorBoundary>

// Component-level (inline error, doesn't break page)
<ComponentErrorBoundary>
  <MyWidget />
</ComponentErrorBoundary>
```

### Die Primitive (`@marken`)

Seit **Phase H3** liegen sie in `packages/marken/src/primitive/` und kommen aus
**einem** Barrel — sechsundzwanzig Stück, geteilt mit jeder App auf dem Gerät.
`scripts/test/bausteine.py` meldet einen dieser Namen, wenn ihn die Shell noch
einmal erklärt.

```tsx
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@marken';
```

Die vollständige Liste in allen Zuständen steht unter
`/entwickler/bausteine` — der Schauseite, die es hinter der Anmeldung und in
keinem Menü gibt.

Wer einen braucht, den es noch nicht gibt, holt ihn mit
`npx shadcn@latest add <name>` (`components.json` zeigt auf die Bibliothek),
trägt ihn in `primitive/index.ts` ein, gibt ihm ein Schaustück und hebt
`packages/marken/src/fassung.ts`.

### Custom Shared UI Components

```tsx
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import Modal, { ConfirmModal } from '@/components/ui/Modal';
import ConfirmIconButton from '@/components/ui/ConfirmIconButton';

// Seit H4 aus der Bibliothek und nicht mehr aus der Shell -- eine
// Fachanwendung braucht dieselben Formen:
import { Ladezustand, Leerzustand, Datenliste, Formularseite, Feldgruppe } from '@marken';
```

### Feature Barrel Exports

Each feature module has an `index.ts` exporting its public components:

```tsx
// features/store/index.ts
export { default } from './Store';
export { default as StoreModels } from './StoreModels';
```

---

## Test Patterns (Vitest)

### Configuration

- `vite.config.ts`: `test.globals: true`, `environment: 'jsdom'`, `setupFiles: './src/setupTests.ts'`
- Globals: `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `describe`, `it`, `expect` -- no imports needed
- Tests live in `src/__tests__/` with `.test.tsx` extension

### Mock Factories

```tsx
import { createMockApi, createMockToast, createMockAuth } from '../helpers/renderWithProviders';

const mockApi = createMockApi(); // { get, post, put, patch, del, request } - all vi.fn()
const mockToast = createMockToast(); // { success, error, warning, info, remove, clear }
const mockAuth = createMockAuth(); // { user, isAuthenticated, login, logout, ... }
```

### Standard Test Setup

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';
import MyComponent from '../../features/myfeature/MyComponent';

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
  }),
}));

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ items: [] });
  });

  it('renders data after loading', async () => {
    mockApi.get.mockResolvedValueOnce({ items: [{ id: 1, name: 'Test' }] });
    render(
      <MemoryRouter>
        <MyComponent />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
```

### JSDOM Quirks

- Colors return `rgb()` format, not hex: `expect(el).toHaveStyle({ color: 'rgb(69, 173, 255)' })`
- `vi.useFakeTimers()` MUST use `{ shouldAdvanceTime: true }` when combined with `waitFor`
- `vi.mock()` for default exports MUST return `{ default: ... }`
- `import.meta.env.DEV` replaces `process.env.NODE_ENV === 'development'`

### renderWithProviders

```tsx
import { renderWithProviders } from '../helpers/renderWithProviders';

renderWithProviders(<MyComponent />, { route: '/settings' });
// Wraps component in MemoryRouter with specified route
```

---

## Theme System (Phase H1)

- Zwei Themes, **Hell ist die Vorgabe**: `:root` haelt die hellen Werte,
  `[data-theme='dark']` auf `<html>` ueberschreibt sie.
- Die Wahl gehoert dem Menschen (`admin_users.theme`), nicht dem Browser.
  Kein `localStorage`, keine Klasse `.light`.
- Die Klasse `dark` auf `<html>` bleibt: sie haelt die Tailwind-Utilities
  `dark:` und `@custom-variant dark` am Leben.

---

## Environment Variables

```tsx
// Access in components
const apiUrl = import.meta.env.VITE_API_URL; // default: '/api'
const wsUrl = import.meta.env.VITE_WS_URL; // WebSocket base
const isDev = import.meta.env.DEV; // boolean, true in dev mode

// API_BASE is configured in config/api.ts
import { API_BASE } from '@/config/api';
```

---

## UI Language

All user-facing text is **German**. Examples:

- "Speichern", "Abbrechen", "Loschen", "Laden...", "Suchen..."
- "Fehler beim Laden", "Erfolgreich gespeichert", "Sitzung abgelaufen"
- Error messages from backend are also in German

---

## Checklist Before Commit

- [ ] TypeScript only (.tsx/.ts) -- no .js/.jsx files
- [ ] Icons from lucide-react only -- no react-icons
- [ ] Styling via Tailwind classes or CSS variables -- no hardcoded hex in JSX
- [ ] API calls use `useApi()` hook -- no raw fetch()
- [ ] Notifications via `useToast()` -- no window.alert()
- [ ] Confirmations via `useConfirm()` -- no window.confirm()
- [ ] Primitive kommen aus `@marken`, nicht aus einer eigenen Datei
- [ ] `cn()` for conditional/merged class names
- [ ] German UI text
- [ ] Loading and error states handled
- [ ] Tests written with Vitest + vi.mock patterns
