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
import { SystemStatus, TEMPERATUR_ACHSE } from '../SystemStatus';

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

vi.mock('../geraetezustand', () => ({ useGeraetezustand: () => geraet }));

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

  // Die eigene Achse allein reicht nicht. Bekaeme sie wieder die Spanne 0 bis
  // 100, waere die Kurve so flach wie vorher, nur mit richtiger Einheit.
  it('gibt der Temperatur eine Spanne, in der man die Kurve sieht', () => {
    const [unten, obenAus] = TEMPERATUR_ACHSE;
    // Gemessen am 20.08.2026 auf dem Orin: 45,8 Grad im Tief, 72,5 im Hoch.
    expect(unten).toBeLessThanOrEqual(45);
    const obenNormal = obenAus(72.5);
    expect(obenNormal).toBeGreaterThanOrEqual(73);
    // Und die kritische Schwelle des Produkts muss im Bild bleiben.
    expect(obenNormal).toBeGreaterThanOrEqual(95);
    // 0 bis 100 waere der alte Zustand unter neuem Namen.
    expect(obenNormal - unten).toBeLessThanOrEqual(65);
  });

  // Eine feste Decke schneidet den Ausreisser ab, wegen dem man hinsieht. Ein
  // Geraet, das fuenf Jahre unbeaufsichtigt laufen soll, faellt irgendwann in
  // genau diesen Fall.
  it('schneidet einen Ausreisser nach oben nicht ab', () => {
    const [, obenAus] = TEMPERATUR_ACHSE;
    expect(obenAus(104)).toBeGreaterThanOrEqual(104);
    expect(obenAus(131)).toBeGreaterThanOrEqual(131);
    // Im Normalbetrieb bleibt die Achse trotzdem stehen, sonst waere jeder
    // Tagesvergleich wertlos.
    expect(obenAus(72.5)).toBe(obenAus(48.1));
  });

  // Math.max(100, NaN) ist NaN, und eine Achse mit NaN als Grenze zeichnet gar
  // nichts, ohne einen Fehler zu melden. Ohne Verlauf reicht recharts einen
  // leeren Datensatz durch.
  it('bleibt eine Achse, auch wenn noch kein Messwert da ist', () => {
    const [, obenAus] = TEMPERATUR_ACHSE;
    expect(obenAus(NaN)).toBe(100);
    expect(obenAus(-Infinity)).toBe(100);
  });

  it('nennt in der Diagrammbeschreibung beide Achsen mit ihrer Einheit', () => {
    const { container } = zeige();
    const diagramm = container.querySelector('[role="img"]');
    expect(diagramm?.getAttribute('aria-label')).toMatch(/Prozent auf der linken Achse/);
    expect(diagramm?.getAttribute('aria-label')).toMatch(/Grad Celsius auf der rechten/);
  });
});
