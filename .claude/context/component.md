# Context: Adding a React Component

## Quick Reference

| Property      | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Language      | TypeScript only (.tsx for components, .ts for logic)    |
| Location      | `apps/dashboard-frontend/src/features/<feature>/`       |
| Shared UI     | `apps/dashboard-frontend/src/components/ui/`            |
| shadcn path   | `@/components/ui/shadcn/`                               |
| Icons         | lucide-react ONLY                                       |
| CSS           | Tailwind classes + `cn()` -- never hardcoded hex in JSX |
| API calls     | `useApi()` hook -- never raw fetch()                    |
| Toasts        | `useToast()` from ToastContext                          |
| Confirmations | `useConfirm()` hook                                     |
| UI language   | German                                                  |
| Path alias    | `@/` maps to `src/`                                     |
| Design system | [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md)    |

---

## Step 1: Create the Component File

Create your component in the appropriate feature directory:

```
src/features/<feature>/MyComponent.tsx
```

If it is a shared UI component (used across features), place it in:

```
src/components/ui/MyComponent.tsx
```

---

## Step 2: Component Template

```tsx
// src/features/myfeature/MyComponent.tsx
import { useState, useCallback, useEffect } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';

// ---- Types ----

interface Item {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

interface MyComponentProps {
  title?: string;
  onItemSelect?: (item: Item) => void;
}

// ---- Component ----

export default function MyComponent({ title = 'Meine Eintraege', onItemSelect }: MyComponentProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Data Fetching ----

  const loadItems = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const data = await api.get<Item[]>('/items', { signal, showError: false });
        setItems(data);
        setError(null);
      } catch (err: any) {
        if (signal?.aborted) return;
        setError(err.message || 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadItems(controller.signal);
    return () => controller.abort();
  }, [loadItems]);

  // ---- Actions ----

  const handleDelete = async (item: Item) => {
    const ok = await confirm({
      title: 'Eintrag loschen',
      message: `"${item.name}" wirklich loschen?`,
      confirmText: 'Loschen',
      confirmVariant: 'danger',
    });
    if (!ok) return;

    try {
      await api.del(`/items/${item.id}`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast.success('Eintrag geloscht');
    } catch {
      // useApi shows error toast automatically
    }
  };

  // ---- Render ----

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Button size="sm">
          <Plus className="size-4 mr-2" />
          Hinzufuegen
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Keine Eintraege vorhanden.</div>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <Card
              key={item.id}
              className={cn(
                'cursor-pointer transition-colors hover:bg-accent/50',
                'border border-border'
              )}
              onClick={() => onItemSelect?.(item)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-muted-foreground" />
                  <span className="font-medium">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                    {item.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
```

---

## Step 3: Using `useFetchData` (Alternative Data Loading)

For components with complex or parallel data loading, use `useFetchData` instead of manual state:

```tsx
import { useFetchData } from '@/hooks/useFetchData';
import { useApi } from '@/hooks/useApi';

export default function Dashboard() {
  const api = useApi();

  const { data, loading, error, refetch } = useFetchData(
    async signal => {
      const [stats, recentItems] = await Promise.all([
        api.get<Stats>('/stats', { signal, showError: false }),
        api.get<Item[]>('/items/recent', { signal, showError: false }),
      ]);
      return { stats, recentItems };
    },
    { initialData: { stats: null, recentItems: [] } }
  );

  if (loading) return <SkeletonCard />;

  return (
    <div>
      <p>{data.stats?.total} Eintraege</p>
      <Button onClick={refetch}>Aktualisieren</Button>
    </div>
  );
}
```

---

## Step 4: Using `useModalForm` (Forms in Modals)

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { useModalForm } from '@/hooks/useModalForm';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  editItem?: Item | null;
}

export function CreateItemModal({ isOpen, onClose, onCreated, editItem }: CreateItemModalProps) {
  const api = useApi();
  const toast = useToast();

  const { values, setValue, error, saving, handleSubmit } = useModalForm(isOpen, {
    initialValues: { name: '', description: '' },
    onOpen: () =>
      editItem ? { name: editItem.name, description: editItem.description } : undefined,
  });

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(async () => {
            if (editItem) {
              await api.put(`/items/${editItem.id}`, values);
            } else {
              await api.post('/items', values);
            }
            toast.success(editItem ? 'Aktualisiert' : 'Erstellt');
            onCreated();
            onClose();
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={e => setValue('name', e.target.value)}
              placeholder="Name eingeben..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Input
              id="description"
              value={values.description}
              onChange={e => setValue('description', e.target.value)}
              placeholder="Optional..."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving || !values.name.trim()}>
              {saving ? 'Speichere...' : editItem ? 'Aktualisieren' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Step 5: Using `useDebouncedSearch` (Search-as-you-type)

```tsx
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';

function SearchableList() {
  const api = useApi();
  const [query, setQuery] = useState('');

  const { results, searching } = useDebouncedSearch(
    query,
    async (q, signal) =>
      api.get<Item[]>(`/items/search?q=${encodeURIComponent(q)}`, { signal, showError: false }),
    { initialResults: [], delay: 300, minLength: 2 }
  );

  return (
    <div className="space-y-3">
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Suchen..." />
      {searching && <p className="text-sm text-muted-foreground">Suche...</p>}
      {results.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

---

## Step 6: Update Barrel Export

If the component is part of a feature module, add it to the barrel export:

```tsx
// src/features/myfeature/index.ts
export { default } from './MyComponent';
export { CreateItemModal } from './CreateItemModal';
```

---

## Step 7: Add Route (if needed)

```tsx
// In App.tsx

// Lazy import for secondary routes
const MyComponent = lazy(() => import('./features/myfeature'));

// In Routes:
<Route
  path="/myfeature"
  element={
    <PrivateRoute>
      <Suspense fallback={<LoadingSpinner />}>
        <RouteErrorBoundary>
          <MyComponent />
        </RouteErrorBoundary>
      </Suspense>
    </PrivateRoute>
  }
/>;
```

---

## Step 8: Write Tests

```tsx
// src/__tests__/integration/myfeature.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';
import MyComponent from '../../features/myfeature/MyComponent';

// ---- Mocks ----

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

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Helpers ----

function renderComponent(props: Partial<Parameters<typeof MyComponent>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MyComponent {...props} />
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zeigt Ladeanimation beim Start', () => {
    mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves
    renderComponent();
    // SkeletonCard renders as animated placeholder
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('zeigt Eintraege nach dem Laden', async () => {
    mockApi.get.mockResolvedValueOnce([
      { id: 1, name: 'Eintrag A', status: 'active' },
      { id: 2, name: 'Eintrag B', status: 'inactive' },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Eintrag A')).toBeInTheDocument();
      expect(screen.getByText('Eintrag B')).toBeInTheDocument();
    });
  });

  it('zeigt Fehlermeldung bei API-Fehler', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Server nicht erreichbar'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument();
    });
  });

  it('zeigt leeren Zustand ohne Eintraege', async () => {
    mockApi.get.mockResolvedValueOnce([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Keine Eintraege vorhanden.')).toBeInTheDocument();
    });
  });

  it('loescht Eintrag nach Bestaetigung', async () => {
    mockApi.get.mockResolvedValueOnce([{ id: 1, name: 'Test', status: 'active' }]);
    mockApi.del.mockResolvedValueOnce({});

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    // Click delete button (useConfirm is mocked to auto-confirm)
    const deleteBtn = screen.getByRole('button', { name: '' }); // icon button
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockApi.del).toHaveBeenCalledWith('/items/1');
      expect(mockToast.success).toHaveBeenCalledWith('Eintrag geloscht');
    });
  });
});
```

### Test Tips

- Use `createMockApi()`, `createMockToast()`, `createMockAuth()` from helpers
- `vi.mock()` paths are relative to the test file
- For default exports: `vi.mock('path', () => ({ default: ... }))`
- `vi.useFakeTimers({ shouldAdvanceTime: true })` when using `waitFor`
- JSDOM returns `rgb()` for computed colors, not hex
- `MemoryRouter` is required for any component using `useNavigate` or `<Link>`

---

## Checklist Before Submitting

- [ ] **TypeScript**: File is `.tsx`, all props have interfaces, no `any` where avoidable
- [ ] **Icons**: All icons from `lucide-react` -- no react-icons
- [ ] **Styling**: Tailwind classes and `cn()` only -- no hardcoded hex in JSX
- [ ] **API**: Uses `useApi()` hook -- no raw `fetch()`
- [ ] **Toasts**: Uses `useToast()` for notifications
- [ ] **Confirmations**: Uses `useConfirm()`, renders `{ConfirmDialog}` in JSX
- [ ] **German text**: All user-facing strings are in German
- [ ] **Loading state**: Shows `SkeletonCard` or `LoadingSpinner` while fetching
- [ ] **Error state**: Shows error message, does not crash on API failure
- [ ] **Empty state**: Shows helpful message when no data
- [ ] **AbortController**: Data fetching uses AbortSignal for cleanup
- [ ] **Barrel export**: Added to feature's `index.ts` if applicable
- [ ] **Route added**: If this is a new page, lazy-loaded in `App.tsx`
- [ ] **Tests written**: Vitest test with mock API, covers loading/data/error/empty states
- [ ] **Accessible**: Buttons have labels, forms have labels, proper ARIA where needed
