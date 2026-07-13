/**
 * Integration-Tests der Extensions-Ansicht (Store 3.1 — Plan 003).
 *
 * Der Store ist keine Tab-Ansicht mehr, sondern Liste (links) + Detail (Mitte):
 *   - ExtensionsSidebarList: Suchfeld + Apps/Modelle mit Status
 *   - StoreDetailPage: Detail der gewählten Extension bzw. Leerzustand
 *
 * Getestet wird der eigenständige (Legacy-)Pfad /store, der beide Flächen
 * nebeneinander rendert.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Store from '../../features/store/Store';
import { useExtensionStore } from '../../stores/extensionStore';
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

vi.mock('../../contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload: vi.fn(),
    cancelDownload: vi.fn(),
    isDownloading: vi.fn().mockReturnValue(false),
    getDownloadState: vi.fn().mockReturnValue(null),
    onDownloadComplete: vi.fn().mockReturnValue(() => {}),
  }),
  DownloadProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../contexts/ActivationContext', () => ({
  useActivation: () => ({
    activation: null,
    startActivation: vi.fn(),
    onActivationComplete: vi.fn().mockReturnValue(() => {}),
  }),
  ActivationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---- Sample data ----

const sampleModels = [
  {
    id: 'qwen3-14b',
    name: 'Qwen3 14B',
    description: 'Mehrsprachiges Qualitätsmodell',
    size_bytes: 14_000_000_000,
    ram_required_gb: 16,
    category: 'medium',
    install_status: 'available',
    capabilities: ['chat', 'coding'],
    speed_tier: 'quality',
  },
  {
    id: 'llama3-8b',
    name: 'Llama 3 8B',
    description: 'Kompaktes Allround-Modell',
    size_bytes: 8_000_000_000,
    ram_required_gb: 8,
    category: 'small',
    install_status: 'missing',
    speed_tier: 'fast',
  },
];

const sampleApps = [
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow-Automatisierung',
    version: '1.30',
    category: 'Automation',
    status: 'running',
  },
  {
    id: 'code-server',
    name: 'Code Server',
    description: 'VS Code im Browser',
    version: '4.90',
    category: 'Development',
    status: 'available',
  },
];

// ---- Helpers ----

function renderStore(route = '/store') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/store/*" element={<Store />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setupDefaultApiResponses() {
  (mockApi.get as Mock).mockImplementation((path: string) => {
    if (path.startsWith('/models/catalog')) return Promise.resolve({ models: sampleModels });
    if (path.startsWith('/apps')) return Promise.resolve({ apps: sampleApps });
    if (path.startsWith('/models/status')) {
      return Promise.resolve({ loaded_model: { model_id: 'qwen3-14b', ram_usage_mb: 14000 } });
    }
    if (path.startsWith('/models/default')) return Promise.resolve({ default_model: 'qwen3-14b' });
    if (path.startsWith('/workspace-apps')) {
      return Promise.resolve({
        apps: [
          { id: 'telegram', name: 'Telegram', description: 'Bot', tab: 'telegram', enabled: true },
        ],
      });
    }
    return Promise.resolve({});
  });
}

// ---- Tests ----

describe('Store integration (Liste + Detail)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtensionStore.getState().clearSelection();
    setupDefaultApiResponses();
  });

  it('zeigt das Suchfeld', async () => {
    renderStore();
    expect(await screen.findByLabelText(/extensions durchsuchen/i)).toBeInTheDocument();
  });

  it('rendert Apps und Modelle als Liste', async () => {
    renderStore();
    expect(await screen.findByTestId('ext-app-n8n')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-code-server')).toBeInTheDocument();
    expect(screen.getByTestId('ext-model-qwen3-14b')).toBeInTheDocument();
    expect(screen.getByTestId('ext-model-llama3-8b')).toBeInTheDocument();
  });

  it('das Suchfeld filtert die Liste', async () => {
    renderStore();
    const search = await screen.findByLabelText(/extensions durchsuchen/i);
    fireEvent.change(search, { target: { value: 'browser' } });
    expect(screen.getByTestId('ext-app-code-server')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-app-n8n')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ext-model-qwen3-14b')).not.toBeInTheDocument();
  });

  it('Leerzustand ohne Auswahl mit „Aktuell geladen"-Kopf', async () => {
    renderStore();
    expect(await screen.findByText(/aktuell geladen/i)).toBeInTheDocument();
    expect(screen.getByText('Keine Extension ausgewählt')).toBeInTheDocument();
  });

  it('Klick auf ein Modell zeigt die Detailseite mit Specs', async () => {
    renderStore();
    fireEvent.click(await screen.findByTestId('ext-model-llama3-8b'));
    expect(await screen.findByRole('heading', { name: 'Llama 3 8B' })).toBeInTheDocument();
    // missing → Download-Aktion in der Detailseite
    expect(screen.getByRole('button', { name: /Herunterladen/ })).toBeInTheDocument();
  });

  it('Klick auf eine verfügbare App zeigt den Installieren-Button', async () => {
    renderStore();
    fireEvent.click(await screen.findByTestId('ext-app-code-server'));
    const heading = await screen.findByRole('heading', { name: 'Code Server' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Installieren/ })).toBeInTheDocument();
  });

  it('zeigt Status-Badges in der Liste (laufende App = Aktiv)', async () => {
    renderStore();
    const row = await screen.findByTestId('ext-app-n8n');
    expect(within(row).getByText('Aktiv')).toBeInTheDocument();
  });
});
