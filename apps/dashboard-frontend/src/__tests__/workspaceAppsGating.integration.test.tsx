/**
 * Integrationstest: Der Extension-Toggle in der Extensions-Liste wirkt live
 * über den gemeinsamen React-Query-Cache — ohne Reload (Plan 002 §5 Kriterium 4).
 *
 * Seit Plan 008 ist die Workspace-Navigation fest (Chat · Wissen · Automation +
 * Einstellungen); die ActivityBar wird NICHT mehr per App-Gating ein-/ausgeblendet.
 * Was live bleibt und hier geprüft wird: (1) der Toggle-Zustand propagiert sofort
 * über den Cache (setQueryData + invalidateQueries + Refetch), und (2)
 * Deaktivieren einer App schließt ihren offenen Mitte-Tab im selben Zug.
 *
 * Bewusst KEIN Mock von useWorkspaceApps und KEIN manuelles rerender():
 * getestet wird die echte Query-Cache-Propagation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtensionsSidebarList } from '@/components/extensions/ExtensionsSidebarList';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Zustandsbehafteter Server-Mock: PUT ändert, GET (Refetch nach
// invalidateQueries) liefert den aktuellen Stand — wie das echte Backend.
let serverApps: Array<{
  id: string;
  name: string;
  description: string;
  tab: string;
  enabled: boolean;
}> = [];

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

const toastMock = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toastMock }));

function renderExtensions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExtensionsSidebarList />
    </QueryClientProvider>
  );
}

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

describe('Extension-Toggle live (gemeinsamer Query-Cache)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverApps = [
      { id: 'n8n', name: 'n8n', description: 'Workflows', tab: 'automationen', enabled: true },
    ];
    resetStore();
  });

  it('Deaktivieren propagiert sofort über den Cache — der Schalter kippt ohne Reload', async () => {
    const user = userEvent.setup();
    renderExtensions();

    const toggle = await screen.findByRole('switch', { name: 'n8n deaktivieren' });
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'n8n aktivieren' })).toBeInTheDocument()
    );
    expect(apiMock.put).toHaveBeenCalledWith(
      '/workspace-apps/n8n',
      { enabled: false },
      { showError: false }
    );
  });

  it('Wieder aktivieren kippt den Schalter ohne Reload zurück', async () => {
    const user = userEvent.setup();
    serverApps = serverApps.map(a => (a.id === 'n8n' ? { ...a, enabled: false } : a));
    renderExtensions();

    await user.click(await screen.findByRole('switch', { name: 'n8n aktivieren' }));

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'n8n deaktivieren' })).toBeInTheDocument()
    );
  });

  it('Deaktivieren schließt den offenen Mitte-Tab der App im selben Zug', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      tabs: [
        { id: 'store', type: 'store', title: 'Extensions' },
        { id: 'automationen', type: 'automationen', title: 'Automationen' },
      ],
      activeTabId: 'automationen',
    });
    renderExtensions();

    await user.click(await screen.findByRole('switch', { name: 'n8n deaktivieren' }));

    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['store'])
    );
    expect(useWorkspaceStore.getState().activeTabId).toBe('store');
  });
});
