/**
 * Integration-Tests der Store-Ansicht (Full-Width-Kartenlayout).
 *
 *   - „Modelle" (StoreModelsGrid): Katalog-Modelle als Karten mit Status/Laden.
 *   - Karte → Detailseite (StoreDetailPage) mit „← Zurück" zurück ins Raster.
 *
 * Der Reiter „Erweiterungen" ist mit Phase B3 (26.08.2026) gefallen.
 *
 * Getestet wird der Pfad /store mit echten Datenhooks (React Query) über einem
 * gemockten useApi.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

const startDownload = vi.fn();
vi.mock('../../contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload,
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
    if (path.startsWith('/models/status')) {
      return Promise.resolve({ loaded_model: { model_id: 'qwen3-14b', ram_usage_mb: 14000 } });
    }
    if (path.startsWith('/models/default')) return Promise.resolve({ default_model: 'qwen3-14b' });
    return Promise.resolve({});
  });
}

// ---- Tests ----

describe('Store integration (Full-Width-Kartenlayout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Die Auswahl lebt global im extensionStore — pro Test leeren, sonst leckt
    // sie zwischen Tests.
    useExtensionStore.setState({ selected: null });
    setupDefaultApiResponses();
  });

  it('Bereich „Modelle": Kartenraster mit Katalog-Modellen', async () => {
    renderStore();
    expect(await screen.findByTestId('store-models-grid')).toBeInTheDocument();
    expect(await screen.findByTestId('model-card-qwen3-14b')).toBeInTheDocument();
    expect(screen.getByTestId('model-card-llama3-8b')).toBeInTheDocument();
  });

  it('Klick auf eine Modell-Karte öffnet die Detailseite; „← Zurück" führt zurück', async () => {
    renderStore();
    fireEvent.click(await screen.findByTestId('model-open-qwen3-14b'));
    expect(await screen.findByRole('heading', { name: 'Qwen3 14B' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('store-detail-back'));
    expect(await screen.findByTestId('store-models-grid')).toBeInTheDocument();
  });

  it('ein nicht installiertes Modell zeigt „Laden" und startet den Download', async () => {
    renderStore();
    const btn = await screen.findByTestId('model-download-llama3-8b');
    fireEvent.click(btn);
    expect(startDownload).toHaveBeenCalledWith('llama3-8b', 'Llama 3 8B');
  });
});
