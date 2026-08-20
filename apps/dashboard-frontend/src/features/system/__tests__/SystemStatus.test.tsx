/**
 * F-24: Auf einem Bildschirm standen „24,5 / 61 GB" und „KI-RAM 15,5/32,0 GB"
 * nebeneinander, ohne dass eine Zeile sagte, dass die 32 ein Teil der 61 sind.
 * Beide Zahlen waren richtig, keine erklaerte die andere.
 *
 * F-25 weiter: die Temperatur lief auf der Prozentachse. 52 Grad landeten auf
 * der Linie, an der „50%" steht.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemStatus } from '../SystemStatus';

// recharts misst seine Groesse im Browser, jsdom liefert ueberall null.
vi.mock('recharts', async () => {
  const echt = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...echt,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 400, height: 280 } as Partial<Record<string, number>>),
  };
});

const VERLAUF = [
  { timestamp: 1, RAM: 40, Swap: 0, Temp: 52 },
  { timestamp: 2, RAM: 41, Swap: 0, Temp: 53 },
];

const geraet = {
  metrics: { ram: 40.2, swap: 0, disk: { percent: 23, used: 404, total: 1738 }, temperature: 52 },
  metricsHistory: { data: VERLAUF },
  formatChartData: () => VERLAUF,
  thresholds: null,
  deviceInfo: { total_memory_gb: 61 },
  loading: false,
  error: null,
  retry: () => {},
};

vi.mock('@/hooks/useDashboardData', () => ({ useDashboardData: () => geraet }));

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({
      totalBudgetMb: 32768,
      usedMb: 15872,
      availableMb: 14848,
      safetyBufferMb: 2048,
      loadedModels: [],
    }),
  }),
}));

vi.mock('../SystemHealthWidget', () => ({ default: () => <div /> }));

function zeige() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SystemStatus />
    </QueryClientProvider>
  );
}

describe('SystemStatus', () => {
  it('sagt bei der Speicherkachel, worauf sich die Zahl bezieht', () => {
    zeige();
    expect(screen.getByText(/24\.5 von 61 GB im ganzen Gerät/)).toBeInTheDocument();
  });

  it('erklaert die zweite Speicherzahl, die die Statusleiste zeigt (F-24)', async () => {
    zeige();
    expect(await screen.findByText(/Davon 32 GB für KI-Modelle reserviert/)).toBeInTheDocument();
  });

  it('nennt in der Diagrammbeschreibung beide Achsen mit ihrer Einheit', () => {
    const { container } = zeige();
    const diagramm = container.querySelector('[role="img"]');
    expect(diagramm?.getAttribute('aria-label')).toMatch(/Prozent auf der linken Achse/);
    expect(diagramm?.getAttribute('aria-label')).toMatch(/Grad Celsius auf der rechten/);
  });
});
