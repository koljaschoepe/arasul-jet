import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardHome from '../DashboardHome';

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
});
