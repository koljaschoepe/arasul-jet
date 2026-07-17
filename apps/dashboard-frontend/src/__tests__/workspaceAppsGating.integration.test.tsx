/**
 * Integrationstest: Extension-Gating wirkt live, ohne Reload (Plan 002 §5
 * Kriterium 4). ActivityBar (Workspace) und ExtensionsSidebarList (die
 * Extensions-Liste im Sidebar-Host) hängen im SELBEN Render-Tree am SELBEN
 * QueryClient — genau wie in der echten Shell. Der Plattform-Toggle in der
 * Liste muss den ActivityBar-Eintrag über den gemeinsamen React-Query-Cache
 * sofort verschwinden lassen.
 *
 * Bewusst KEIN Mock von useWorkspaceApps und KEIN manuelles rerender():
 * getestet wird die echte Query-Cache-Propagation (setQueryData +
 * invalidateQueries + Refetch), die die Unit-Tests der Einzelkomponenten
 * nicht abdecken.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityBar } from '@/features/workspace/ActivityBar';
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

function renderShellAndExtensions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityBar />
      <ExtensionsSidebarList />
    </QueryClientProvider>
  );
}

describe('Extension-Gating live (ActivityBar ↔ Extensions-Tab, gemeinsamer Query-Cache)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverApps = [
      { id: 'n8n', name: 'n8n', description: 'Workflows', tab: 'automationen', enabled: true },
      {
        id: 'database',
        name: 'Datenbank',
        description: 'Tabellen',
        tab: 'database',
        enabled: true,
      },
    ];
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
  });

  it('Deaktivieren im Extensions-Tab entfernt den ActivityBar-Eintrag sofort — ohne Reload', async () => {
    const user = userEvent.setup();
    renderShellAndExtensions();

    // Beide Komponenten hängen am selben Cache: Eintrag + Toggle sichtbar
    await waitFor(() => expect(screen.getByLabelText('Automationen')).toBeInTheDocument());
    const toggle = await screen.findByRole('switch', { name: 'n8n deaktivieren' });

    await user.click(toggle);

    // Kein reload, kein rerender: der Cache-Update muss durchpropagieren
    await waitFor(() => expect(screen.queryByLabelText('Automationen')).not.toBeInTheDocument());
    // Die übrigen Apps bleiben unberührt
    expect(screen.getByLabelText('Datenbank')).toBeInTheDocument();
    expect(apiMock.put).toHaveBeenCalledWith(
      '/workspace-apps/n8n',
      { enabled: false },
      { showError: false }
    );
  });

  it('Wieder aktivieren bringt den Eintrag ohne Reload zurück', async () => {
    const user = userEvent.setup();
    serverApps = serverApps.map(a => (a.id === 'n8n' ? { ...a, enabled: false } : a));
    renderShellAndExtensions();

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'n8n aktivieren' })).toBeInTheDocument()
    );
    expect(screen.queryByLabelText('Automationen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'n8n aktivieren' }));

    await waitFor(() => expect(screen.getByLabelText('Automationen')).toBeInTheDocument());
  });

  it('Deaktivieren schließt den offenen Mitte-Tab der App im selben Zug', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      tabs: [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'automationen', type: 'automationen', title: 'Automationen' },
      ],
      activeTabId: 'automationen',
    });
    renderShellAndExtensions();

    await user.click(await screen.findByRole('switch', { name: 'n8n deaktivieren' }));

    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard'])
    );
    expect(useWorkspaceStore.getState().activeTabId).toBe('dashboard');
  });
});
