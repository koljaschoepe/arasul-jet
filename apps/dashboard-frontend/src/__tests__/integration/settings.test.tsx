/**
 * Integration tests for the Settings feature.
 *
 * Tests the Settings page as users experience it:
 *   - Bereiche der Verwaltung (eigene Leiste, M5)
 *   - der Bereich Gerät mit echten Abschnitten: Unternehmen als Text, die
 *     Aktualisierung, die Lizenz mit drei Zahlen, der Fernzugriff als
 *     Schalter mit Adresse, „Über Arasul" als Fußzeile
 *   - der Bereich System: ein Satz, drei Zahlen, Dienste und Selbstheilung
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from '../../features/settings/Settings';
import { useWorkspaceStore, type Ansicht } from '../../stores/workspaceStore';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';

// ---- Mocks ----

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

// Das Theme des Angemeldeten (Phase H1): es kommt aus dem Benutzer, nicht mehr
// aus dem `localStorage`. `benutzerAktualisieren` traegt die Antwort des
// Geraets zurueck, `mitTheme` sagt je Test, womit der Mensch hereinkommt.
let mitTheme: 'light' | 'dark' = 'light';
const benutzerAktualisieren = vi.fn((teil: { theme?: 'light' | 'dark' }) => {
  if (teil.theme) mitTheme = teil.theme;
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', theme: mitTheme },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
    benutzerAktualisieren,
  }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Helpers ----

// Seit M5 trägt die Verwaltung ihre Leiste der Bereiche selbst; der gewählte
// Bereich steht in der Ansicht des Workspace-Stores.
function renderSettings(ansicht: Partial<Ansicht> = {}) {
  useWorkspaceStore.setState({ ansicht: { type: 'verwaltung', ...ansicht } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Settings modelle={null} />
    </QueryClientProvider>
  );
}

// ---- Tests ----

describe('Settings integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mitTheme = 'light';
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    vi.mocked(mockApi.get).mockImplementation((path: string) => {
      const antworten: Record<string, unknown> = {
        '/system/info': {
          version: '20261004-1ea0d2c',
          hostname: 'arasul-orin',
          jetpack_version: 'L4T 36.4.7',
          uptime_seconds: 86400,
          build_hash: 'abc123',
        },
        '/auth/needs-setup': { needsSetup: false, firmenname: 'Muster GmbH', logo: null },
        '/update/fassung': {
          data: {
            fassung: { version: '20261004-1ea0d2c', nummer: '0.8.17' },
            einspielenMoeglich: true,
            einspielenGrund: null,
            laeuft: false,
            lauf: null,
            zurueckMoeglich: false,
            vorige: null,
          },
        },
        '/update/fassung/neueste': { data: { fassung: '0.8.17' } },
        '/license/info': {
          valid: true,
          tier: 'professional',
          customer: 'Muster GmbH',
          expiresAt: '9999-12-31T23:59:59.000Z',
          hardwareFingerprint: '22f2ffa61aa4af5de84f852af9630187',
          nutzung: {
            stufe: 'professional',
            konten: { belegt: 6, grenze: 10 },
            apps: { belegt: 3, grenze: -1 },
          },
        },
        '/tailscale/status': {
          installed: true,
          running: true,
          connected: true,
          ip: '100.121.244.80',
          hostname: 'arasul',
          dnsName: 'arasul.tail746d9b.ts.net',
          tailnet: 'tail746d9b.ts.net',
          version: '1.102.2',
          peers: [],
        },
        '/system/network': { mdns: 'arasul.local' },
        '/ops/overview': {
          status: 'OK',
          warnings: [],
          criticals: [],
          metrics: { cpu_percent: 1, ram_percent: 20.6, disk_percent: 29.3 },
        },
      };
      return Promise.resolve(antworten[path] ?? {});
    });
  });

  it('lists the sections in its own bar', () => {
    renderSettings();

    for (const id of ['benutzer', 'apps', 'firmenordner', 'modelle', 'system', 'daten', 'geraet']) {
      expect(screen.getByTestId(`verwaltung-${id}`)).toBeInTheDocument();
    }
    // Allgemein, KI, Sicherheit, Lizenz und Fernzugriff sind im Gerät und im
    // System aufgegangen; KI gibt es gar nicht mehr.
    for (const id of ['general', 'ki', 'security', 'lizenz', 'remote-access']) {
      expect(screen.queryByTestId(`verwaltung-${id}`)).not.toBeInTheDocument();
    }
  });

  it('zeigt im Gerät das Unternehmen als Text, das Formular erst auf Bearbeiten', async () => {
    const user = userEvent.setup();
    renderSettings({ bereich: 'geraet' });

    expect(await screen.findByTestId('unternehmen-name')).toHaveTextContent('Muster GmbH');
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('unternehmen-bearbeiten'));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Muster GmbH');

    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Beispiel AG');
    vi.mocked(mockApi.put).mockResolvedValue({ firmenname: 'Beispiel AG' });
    await user.click(screen.getByTestId('unternehmen-speichern'));
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/settings/firmenname', {
        firmenname: 'Beispiel AG',
      })
    );
    // Das Logo blieb unberührt: kein Weg dorthin.
    expect(mockApi.put).not.toHaveBeenCalledWith('/settings/logo', expect.anything());
    expect(mockApi.del).not.toHaveBeenCalled();
  });

  it('zeigt Aktualisierung, Lizenz mit drei Zahlen, Fernzugriff mit Adresse und die Fußzeile', async () => {
    renderSettings({ bereich: 'geraet' });

    expect(await screen.findByTestId('fassung-hier')).toHaveTextContent(
      'Hier läuft Fassung 0.8.17.'
    );
    expect(await screen.findByTestId('lizenz-stufe')).toHaveTextContent('Professional');
    expect(screen.getByTestId('lizenz-konten')).toHaveTextContent('6 von 10');
    expect(screen.getByTestId('lizenz-bis')).toHaveTextContent('unbegrenzt');
    // Der Fingerabdruck steht aufgeklappt, nicht vorn.
    expect(screen.queryByTestId('lizenz-fingerabdruck')).not.toBeInTheDocument();

    expect(await screen.findByTestId('fernzugriff-adresse')).toHaveTextContent(
      'https://arasul.tail746d9b.ts.net'
    );
    expect(screen.getByTestId('fernzugriff-schalter')).toHaveAttribute('aria-checked', 'true');
    // Technik (IP, Tailnet) nur aufgeklappt.
    expect(screen.queryByText('100.121.244.80')).not.toBeInTheDocument();

    expect(await screen.findByTestId('ueber-arasul')).toHaveTextContent('arasul-orin');
    // Die Fassung steht einmal, bei der Aktualisierung; Bau und JetPack aufgeklappt.
    expect(screen.getAllByText(/0\.8\.17/)).toHaveLength(1);
    expect(screen.queryByText('L4T 36.4.7')).not.toBeInTheDocument();
    // Kein Basis-Prompt, keine Begriffsliste, keine Systeminformationen mehr.
    expect(screen.queryByText(/Prompt/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('begriffe')).not.toBeInTheDocument();
    expect(screen.queryByText('Systeminformationen')).not.toBeInTheDocument();
  });

  it('opens System with a sentence, three numbers and two sub-sections', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId('verwaltung-system'));

    expect(await screen.findByText('Alles läuft.')).toBeInTheDocument();
    expect(screen.getByTestId('system-zahlen')).toHaveTextContent('21');
    for (const name of ['Dienste', 'Selbstheilung']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Aktualisierungen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('opens the sub-section named by the address', async () => {
    renderSettings({ bereich: 'system', abschnitt: 'selfhealing' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Selbstheilung' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });
    expect(screen.getByRole('button', { name: 'Dienste' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
