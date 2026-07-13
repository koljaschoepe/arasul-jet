import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlatformAppsSection from '../PlatformAppsSection';
import { ToastProvider } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const apiMock = {
  get: vi.fn().mockResolvedValue({
    apps: [
      {
        id: 'n8n',
        name: 'n8n Automationen',
        description: 'Workflows',
        tab: 'automationen',
        enabled: true,
      },
      { id: 'telegram', name: 'Telegram-Bot', description: 'Bot', tab: 'telegram', enabled: false },
      {
        id: 'database',
        name: 'Datenbank',
        description: 'Tabellen',
        tab: 'database',
        enabled: true,
      },
    ],
  }),
  put: vi.fn().mockResolvedValue({ app: { id: 'n8n', enabled: false } }),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PlatformAppsSection />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('PlatformAppsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ tabs: [], activeTabId: null });
  });

  it('rendert die drei Plattform-Apps mit Zustand', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('n8n Automationen')).toBeInTheDocument());
    expect(screen.getByLabelText('n8n Automationen deaktivieren')).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram-Bot aktivieren')).toBeInTheDocument();
  });

  it('Toggle ruft PUT /workspace-apps/:id', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('n8n Automationen')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('n8n Automationen deaktivieren'));
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/workspace-apps/n8n', { enabled: false })
    );
  });

  it('Deaktivieren schließt den offenen Mitte-Tab der App', async () => {
    useWorkspaceStore.setState({
      tabs: [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'automationen', type: 'automationen', title: 'Automationen' },
      ],
      activeTabId: 'automationen',
    });
    renderSection();
    await waitFor(() => expect(screen.getByText('n8n Automationen')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('n8n Automationen deaktivieren'));

    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs.map(t => t.id)).toEqual(['dashboard'])
    );
    expect(useWorkspaceStore.getState().activeTabId).toBe('dashboard');
  });
});
