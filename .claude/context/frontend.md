# Frontend Context - React 19 SPA (TypeScript)

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
  index.css                  # Tailwind v4 config, CSS variables, design tokens

  features/                  # Feature modules (each with barrel export index.ts)
    chat/                    # ChatRouter, ChatView, ChatMessage, ChatInputArea, ...
    documents/               # DocumentManager, SpaceModal, Badges
    settings/                # Settings, GeneralSettings, AIProfileSettings, ...
    store/                   # Store, StoreHome, StoreApps, StoreModels
    telegram/                # TelegramAppModal, BotSetupWizard, BotDetailsModal
    datentabellen/           # ExcelEditor + custom hooks (clipboard, history, keyboard)
    claude/                  # ClaudeCode, ClaudeTerminal
    system/                  # SetupWizard, UpdatePage, SelfHealingEvents, Login
    database/                # DatabaseOverview, DatabaseTable

  components/
    layout/                  # Sidebar (with ScrollArea)
    ui/                      # Modal, Skeleton, LoadingSpinner, EmptyState, ErrorBoundary, ConfirmIconButton
    ui/shadcn/               # 21 shadcn components (Button, Card, Dialog, Input, ...)
    editor/                  # MarkdownEditor, MermaidDiagram, GridEditor/

  hooks/                     # Reusable hooks (useApi, useTheme, useFetchData, ...)
  contexts/                  # AuthContext, ChatContext, DownloadContext, ToastContext
  config/                    # api.ts (API_BASE, getAuthHeaders), branding.ts
  lib/                       # utils.ts (cn helper)
  utils/                     # csrf.ts, token.ts
  __tests__/                 # Vitest test suites + helpers/
```

---

## Design System

### CSS Variables (`:root` in `index.css`)

```css
/* shadcn semantic colors (dark theme default) */
--background: #101923;
--foreground: #f8fafc;
--card: #1a2330;
--card-foreground: #f8fafc;
--primary: #45adff;
--primary-foreground: #000000;
--secondary: #1d2835;
--secondary-foreground: #f8fafc;
--muted: #1d2835;
--muted-foreground: #94a3b8;
--accent: #222d3d;
--accent-foreground: #f8fafc;
--destructive: #f0f4f8;
--destructive-foreground: #101923;
--border: #2a3544;
--input: #2a3544;
--ring: #45adff;
--radius: 0.75rem;
```

### Custom Tailwind Tokens (`@theme` block in `index.css`)

```css
/* Available as Tailwind classes: bg-bg-card, text-text-muted, etc. */
--color-bg-dark: #101923;
--color-bg-card: #1a2330;
--color-bg-card-hover: #222d3d;
--color-bg-elevated: #2a3544;
--color-bg-input: #101923;
--color-text-primary: #f8fafc;
--color-text-secondary: #cbd5e1;
--color-text-muted: #94a3b8;
--color-text-disabled: #64748b;
--color-primary-hover: #6ec4ff;
--color-primary-active: #2d8fd9;
```

### Color Rules (MANDATORY)

```tsx
// GOOD - Tailwind classes
<div className="bg-card text-foreground border border-border" />
<div className="bg-bg-card text-text-muted" />

// GOOD - CSS variables in inline styles (when dynamic)
<div style={{ color: 'var(--primary)' }} />

// BAD - never hardcode hex in JSX
<div style={{ color: '#45ADFF' }} />
<div className="bg-[#1a2330]" />   // Avoid arbitrary values for design tokens
```

### `cn()` Helper

```tsx
import { cn } from '@/lib/utils';

// Merges class names, handles conditionals, resolves Tailwind conflicts
<div className={cn('p-4 rounded-lg', isActive && 'bg-primary text-primary-foreground')} />;
```

---

## Tailwind v4 Setup

The CSS setup in `index.css` uses Tailwind CSS v4 syntax:

```css
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

/* Custom design tokens */
@theme {
  --color-bg-card: #1a2330;
  /* ... */
}

/* shadcn/ui semantic mappings */
@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
  /* ... */
}
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
      {searching && <LoadingSpinner />}
      {results.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </>
  );
}
```

### `useTheme()` -- Theme Toggle

```tsx
import { useTheme } from '@/hooks/useTheme';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}</button>;
}
```

- `theme`: `'dark' | 'light'`
- `setTheme(theme)`: Set explicitly
- `toggleTheme()`: Toggle between dark/light
- Persists to `localStorage` key `arasul_theme`
- Applies `.dark` on `<html>`, `.light-mode`/`.dark-mode` on `<body>`

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

### `useTokenBatching()` -- Streaming Token Optimization

Batches LLM streaming tokens to reduce React re-renders. Used internally by ChatContext.

```tsx
import useTokenBatching from '@/hooks/useTokenBatching';

const { tokenBatchRef, addTokenToBatch, flushTokenBatch, resetTokenBatch } = useTokenBatching(
  setMessages,
  16
);
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

### `ChatContext` -- Global Chat State

```tsx
import { useChatContext } from '@/contexts/ChatContext';

const {
  installedModels,
  selectedModel,
  setSelectedModel,
  spaces,
  sendMessage,
  cancelJob,
  activeJobIds,
  globalQueue,
  loadModels,
  loadSpaces,
} = useChatContext();
```

Manages: streaming jobs, model selection, RAG spaces, message callbacks. Persists across route changes.

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
<Suspense fallback={<LoadingSpinner />}>
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

### shadcn/ui Components

All shadcn components are in `@/components/ui/shadcn/`. Import directly:

```tsx
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Switch } from '@/components/ui/shadcn/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { Badge } from '@/components/ui/shadcn/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { Separator } from '@/components/ui/shadcn/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/shadcn/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
```

### Custom Shared UI Components

```tsx
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal, { ConfirmModal } from '@/components/ui/Modal';
import ConfirmIconButton from '@/components/ui/ConfirmIconButton';
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

## Theme System

- **Dark mode** = default. `:root` defines dark values. `<html class="dark">`.
- **Light mode** = `.light-mode` CSS overrides on `<body>`. `<html>` has no `.dark` class.
- `localStorage` key: `arasul_theme`
- Use `@custom-variant dark` in CSS for dark-only styles
- Tailwind `dark:` variant works because of `<html class="dark">`

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
- [ ] shadcn imports from `@/components/ui/shadcn/` path
- [ ] `cn()` for conditional/merged class names
- [ ] German UI text
- [ ] Loading and error states handled
- [ ] Tests written with Vitest + vi.mock patterns
