/**
 * WerkstattLeiste — Watcher-Status sichtbar machen.
 *
 * Sichert den Vertrag, an dem der Code-Review einen echten Bug fand:
 * `useApi.get` liefert die volle Hülle `{ data, timestamp }` (unwrapped NICHT).
 * Wird `.data` nicht ausgepackt, ist `status.kandidaten` immer undefined und die
 * „N Ordner abgelehnt"-Warnung feuert nie. Dieser Test rendert mit genau dieser
 * Hülle und erwartet die Warnung.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WerkstattLeiste from './WerkstattLeiste';
import { createMockApi, createMockToast } from '../../__tests__/helpers/renderWithProviders';

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

vi.mock('../../hooks/useExtensions', () => ({
  useExtensions: () => ({
    buildFromSandbox: vi.fn(),
    setExtensionEnabled: vi.fn(),
  }),
}));

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: { openTab: () => void }) => unknown) =>
    selector({ openTab: vi.fn() }),
}));

const projekt = { slug: 'meine-werkstatt', name: 'Meine Werkstatt' } as never;

function renderLeiste() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <WerkstattLeiste projekt={projekt} />
    </QueryClientProvider>
  );
}

describe('WerkstattLeiste — Watcher-Status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zeigt abgelehnte Ordner an — packt die { data, timestamp }-Hülle korrekt aus', async () => {
    (mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        intervalMs: 15000,
        kandidaten: [
          { slug: 'meine-werkstatt', subfolder: 'kaputt', ok: false, extId: null, fehler: 'x' },
          { slug: 'meine-werkstatt', subfolder: 'gut', ok: true, extId: 'gut', fehler: null },
        ],
      },
      timestamp: '2026-08-05T00:00:00Z',
    });

    renderLeiste();

    await waitFor(() => expect(screen.getByText(/1 Ordner abgelehnt/)).toBeInTheDocument());
  });

  it('zeigt keine Warnung, wenn alles ok ist', async () => {
    (mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { intervalMs: 15000, kandidaten: [] },
      timestamp: '2026-08-05T00:00:00Z',
    });

    renderLeiste();
    // Die Bau-Commands sind sichtbar hinterlegt (Discoverability).
    expect(screen.getByText('/erweiterung')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Ordner abgelehnt/)).not.toBeInTheDocument());
  });
});
