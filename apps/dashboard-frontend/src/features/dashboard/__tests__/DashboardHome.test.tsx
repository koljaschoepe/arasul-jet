import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardHome from '../DashboardHome';
import { useWorkspaceStore } from '@/stores/workspaceStore';

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  }),
}));

// recharts ResponsiveContainer misst im jsdom 0×0 — Charts bleiben leer, das
// reicht für den Layout-/Struktur-Check dieses Tests.
function renderDashboard() {
  return render(
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
  );
}

describe('DashboardHome', () => {
  beforeEach(() => {
    // Store auf einen sauberen Ausgangszustand setzen (Aktions-Hub liest ihn).
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      sidebarVisible: false,
      rightPanelVisible: false,
      rightPanelMode: 'terminal',
      explorerRequest: null,
    });
  });

  it('rendert die Kern-Kacheln, aber KEINE KI-Modell-Karte', async () => {
    renderDashboard();

    // Kernkacheln sind weiterhin da …
    expect(await screen.findByText('RAM Usage')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();

    // … die entfernte KI-Modell-Karte (ModelStatusBar, Titel »KI-Modelle«)
    // darf nicht mehr erscheinen.
    expect(screen.queryByText('KI-Modelle')).not.toBeInTheDocument();
  });

  it('zeigt die vier Aktions-Kacheln des Aktions-Hubs', async () => {
    renderDashboard();

    expect(await screen.findByRole('button', { name: /Chat starten/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dokument hochladen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Projekt öffnen/ })).toBeInTheDocument();
    expect(screen.getByText('Zuletzt genutzt')).toBeInTheDocument();
  });

  it('„Chat starten" schaltet das rechte Panel auf Chat', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /Chat starten/ }));

    const state = useWorkspaceStore.getState();
    expect(state.rightPanelVisible).toBe(true);
    expect(state.rightPanelMode).toBe('chat');
  });

  it('„Dokument hochladen" stößt den Explorer-Upload an', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /Dokument hochladen/ }));

    expect(useWorkspaceStore.getState().explorerRequest).toBe('upload-files');
  });

  it('„Projekt öffnen" blendet die Explorer-Sidebar ein', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /Projekt öffnen/ }));

    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true);
  });

  it('„Zuletzt genutzt" reaktiviert einen offenen Tab (echte Datenquelle)', async () => {
    useWorkspaceStore.setState({
      tabs: [
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard' },
        { id: 'settings', type: 'settings', title: 'Einstellungen' },
      ],
      activeTabId: 'dashboard',
    });
    renderDashboard();

    const recent = await screen.findByRole('button', { name: /Einstellungen/ });
    fireEvent.click(recent);
    expect(useWorkspaceStore.getState().activeTabId).toBe('settings');
  });
});
