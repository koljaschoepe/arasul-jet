import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Mock } from 'vitest';
import DashboardHome from '../DashboardHome';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const mockApi = {
  get: vi.fn().mockResolvedValue({}),
  post: vi.fn().mockResolvedValue({}),
};
vi.mock('@/hooks/useApi', () => ({
  useApi: () => mockApi,
}));

// recharts ResponsiveContainer misst im jsdom 0×0 — Charts bleiben leer, das
// reicht für den Layout-/Struktur-Check dieses Tests.
function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardHome
          metrics={{
            cpu: 10,
            ram: 40,
            swap: 5,
            gpu: 0,
            temperature: 50,
            temp: 50,
            disk: { used: 100, free: 400, percent: 20 },
          }}
          metricsHistory={null}
          services={null}
          systemInfo={null}
          networkInfo={null}
          runningApps={[]}
          formatChartData={() => []}
          thresholds={null}
          deviceInfo={null}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({});
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarVisible: false,
      rightPanelVisible: false,
      rightPanelMode: 'terminal',
      explorerRequest: null,
    });
  });

  it('rendert den Systemstatus (Kern-Kacheln + Performance), aber keine KI-Modell-Karte', async () => {
    renderDashboard();
    expect(await screen.findByText('RAM Usage')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.queryByText('KI-Modelle')).not.toBeInTheDocument();
  });

  it('zeigt KEINE Aktions-Kacheln mehr (Dashboard ist eingedampft)', async () => {
    renderDashboard();
    await screen.findByText('RAM Usage');
    expect(screen.queryByRole('button', { name: /Chat starten/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dokument hochladen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Projekt öffnen/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Zuletzt genutzt')).not.toBeInTheDocument();
  });

  it('zeigt die Automatisierungen-Karte mit Leerzustand, wenn keine Läufe vorliegen', async () => {
    renderDashboard();
    expect(await screen.findByText('Automatisierungen')).toBeInTheDocument();
    expect(await screen.findByText(/Noch keine Automatisierungs-Läufe/)).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/workflows/history?limit=6', { showError: false });
  });

  it('„n8n öffnen" öffnet den Automatisierungs-Tab', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /n8n öffnen/ }));
    expect(useWorkspaceStore.getState().activeTabId).toBe('automationen');
  });

  it('listet die letzten Workflow-Läufe aus /workflows/history', async () => {
    (mockApi.get as Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          workflow_name: 'Rechnungs-Export',
          status: 'success',
          timestamp: new Date().toISOString(),
        },
        {
          id: 2,
          workflow_name: 'Backup-Sync',
          status: 'error',
          timestamp: new Date().toISOString(),
        },
      ],
    });
    renderDashboard();
    expect(await screen.findByText('Rechnungs-Export')).toBeInTheDocument();
    expect(screen.getByText('Backup-Sync')).toBeInTheDocument();
    expect(screen.getByText('Fehler')).toBeInTheDocument();
  });
});
