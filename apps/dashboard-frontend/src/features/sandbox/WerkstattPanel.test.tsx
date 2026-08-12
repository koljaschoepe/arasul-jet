/**
 * WerkstattPanel (Plan 017 Schritt 7) — Inventar-Anzeige + Freigabe-Flow.
 *
 * Sichert: Inventar wird gelistet (Status, Ablehnungsgrund), Live-Schalten mit
 * deklarierten Fähigkeiten öffnet den Freigabe-Dialog (400 mit
 * freigabe_erforderlich), Bestätigung schaltet mit Freigabe-Flag live.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WerkstattPanel from './WerkstattPanel';
import { createMockToast } from '../../__tests__/helpers/renderWithProviders';

const mockToast = createMockToast();
const loadInventar = vi.fn();
const setExtensionEnabled = vi.fn();
const rollbackExtension = vi.fn();
const openTab = vi.fn();

vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => ({
    loadInventar,
    setExtensionEnabled,
    rollbackExtension,
    downloadUrl: (id: string) => `/api/extensions/${id}/download`,
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}));

const projekt = { id: 'p1', slug: 'werk', name: 'Werk', workspace_type: 'erweiterungs-werkstatt' };

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      {/* @ts-expect-error — Teil-Projekt reicht für den Test */}
      <WerkstattPanel projekt={projekt} />
    </QueryClientProvider>
  );
}

describe('WerkstattPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listet Erweiterungen mit Status und zeigt Ablehnungsgründe', async () => {
    loadInventar.mockResolvedValue([
      {
        slug: 'werk',
        subfolder: 'meine-app',
        status: 'live',
        extId: 'meine-app',
        name: 'Meine App',
        type: 'app',
        version: '1.0.0',
      },
      {
        slug: 'werk',
        subfolder: 'kaputt',
        status: 'abgelehnt',
        grund: 'manifest.json ist kein gültiges JSON',
      },
    ]);
    renderPanel();
    expect(await screen.findByText('Meine App')).toBeInTheDocument();
    expect(screen.getByText(/kein gültiges JSON/)).toBeInTheDocument();
  });

  it('öffnet den Freigabe-Dialog, wenn Live-Schalten Fähigkeiten verlangt', async () => {
    loadInventar.mockResolvedValue([
      {
        slug: 'werk',
        subfolder: 'app',
        status: 'registriert',
        extId: 'app',
        name: 'App',
        type: 'app',
      },
    ]);
    setExtensionEnabled.mockRejectedValueOnce(
      Object.assign(new Error('Freigabe nötig'), {
        status: 400,
        details: { freigabe_erforderlich: true, faehigkeiten: ['llm', 'rag'] },
      })
    );
    renderPanel();
    await screen.findByText('App');
    await userEvent.click(screen.getByTitle('Live schalten'));

    // Freigabe-Dialog erscheint mit den Fähigkeiten.
    expect(await screen.findByText('Erweiterung freigeben')).toBeInTheDocument();
    expect(screen.getByText(/das lokale Sprachmodell/)).toBeInTheDocument();

    // Bestätigen → zweiter Aufruf MIT Freigabe-Flag.
    setExtensionEnabled.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByText('Freigeben & live schalten'));
    await waitFor(() => {
      expect(setExtensionEnabled).toHaveBeenLastCalledWith('app', true, true);
    });
  });
});
