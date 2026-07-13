import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTab } from '@/stores/workspaceStore';

// Zustandsbehafteter Server-Mock: PUT ändert, GET (auch Refetch nach
// invalidateQueries) liefert den aktuellen Stand — wie das echte Backend.
let serverApps: Array<{
  id: string;
  name: string;
  description: string;
  tab: string;
  enabled: boolean;
}> = [];

function resetServerApps() {
  serverApps = [
    {
      id: 'n8n',
      name: 'n8n Automationen',
      description: 'Workflows',
      tab: 'automationen',
      enabled: true,
    },
    { id: 'telegram', name: 'Telegram-Bot', description: 'Bot', tab: 'telegram', enabled: true },
    { id: 'database', name: 'Datenbank', description: 'Tabellen', tab: 'database', enabled: true },
  ];
}

const apiMock = {
  get: vi.fn(async () => ({ apps: serverApps.map(a => ({ ...a })) })),
  put: vi.fn(async (path: string, body: { enabled: boolean }) => {
    const id = path.split('/').pop();
    serverApps = serverApps.map(a => (a.id === id ? { ...a, enabled: body.enabled } : a));
    return { app: { id, enabled: body.enabled } };
  }),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function seedTabs(tabs: WorkspaceTab[], activeTabId: string | null) {
  useWorkspaceStore.setState({ tabs, activeTabId });
}

function renderWorkspaceApps() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWorkspaceApps(), { wrapper });
}

describe('useWorkspaceApps — setAppEnabled schließt Tabs deaktivierter Apps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServerApps();
    seedTabs([], null);
  });

  it('Deaktivieren schließt den offenen Tab der App, andere Tabs bleiben', async () => {
    seedTabs(
      [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'telegram', type: 'telegram', title: 'Telegram' },
      ],
      'telegram'
    );
    const { result } = renderWorkspaceApps();
    await waitFor(() => expect(result.current.apps).toHaveLength(3));

    await act(() => result.current.setAppEnabled('telegram', false));

    const state = useWorkspaceStore.getState();
    expect(state.tabs.map(t => t.id)).toEqual(['dashboard']);
    expect(state.activeTabId).toBe('dashboard');
  });

  it('Datenbank deaktivieren schließt auch offene Tabellen-Tabs', async () => {
    seedTabs(
      [
        { id: 'database', type: 'database', title: 'Datenbank' },
        { id: 'database-table:kunden', type: 'database-table', title: 'kunden', slug: 'kunden' },
        { id: 'store', type: 'store', title: 'Extensions' },
      ],
      'database-table:kunden'
    );
    const { result } = renderWorkspaceApps();
    await waitFor(() => expect(result.current.apps).toHaveLength(3));

    await act(() => result.current.setAppEnabled('database', false));

    const state = useWorkspaceStore.getState();
    expect(state.tabs.map(t => t.id)).toEqual(['store']);
    expect(state.activeTabId).toBe('store');
  });

  it('Aktivieren schließt keine Tabs', async () => {
    seedTabs([{ id: 'telegram', type: 'telegram', title: 'Telegram' }], 'telegram');
    const { result } = renderWorkspaceApps();
    await waitFor(() => expect(result.current.apps).toHaveLength(3));

    await act(() => result.current.setAppEnabled('telegram', true));

    expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['telegram']);
  });

  it('Toggle aktualisiert den Query-Cache sofort (kein Reload nötig)', async () => {
    const { result } = renderWorkspaceApps();
    await waitFor(() => expect(result.current.apps).toHaveLength(3));
    expect(result.current.isAppEnabled('telegram')).toBe(true);

    await act(() => result.current.setAppEnabled('telegram', false));

    await waitFor(() => expect(result.current.isAppEnabled('telegram')).toBe(false));
    expect(apiMock.put).toHaveBeenCalledWith(
      '/workspace-apps/telegram',
      { enabled: false },
      { showError: false }
    );
  });
});
