/**
 * StoreDetailPage — Detailseite eines Store-Eintrags (Full-Width mit „← Zurück").
 * Deckt Modell-Detail (Kontextlänge, Aktivieren, Als Standard, Zurück) und
 * Erweiterungs-Detail (Workspace-App An/Aus über setAppEnabled) ab.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExtensionStore } from '@/stores/extensionStore';
import { StoreDetailPage } from '../StoreDetailPage';

const catalog = {
  models: [
    {
      id: 'llama3',
      name: 'Llama 3',
      description: 'Allrounder',
      size_bytes: 5_000_000_000,
      ram_required_gb: 8,
      category: 'medium',
      install_status: 'available',
      speed_tier: 'balanced',
      context_window: 32768,
      // Steckbrief, Plan 023 D2 — so, wie Ollama ihn auf dem Orin meldet.
      parameter_label: '8.2B',
      quantization: 'Q4_K_M',
      license: 'apache-2.0',
      profile_read_at: '2026-08-20T21:00:00Z',
      measured_tps: '14.3',
      measured_runs: '12',
      ollama_library_url: 'https://ollama.com/library/llama3',
    },
    {
      id: 'llama3-mini',
      name: 'Llama 3 Mini',
      description: 'Kompakt',
      size_bytes: 2_000_000_000,
      ram_required_gb: 4,
      category: 'medium',
      install_status: 'not_installed',
    },
  ],
  apps: [],
  loadedModel: null as { model_id: string; ram_usage_mb?: number } | null,
  defaultModel: null as string | null,
  isLoading: false,
  invalidateModels: vi.fn(),
  invalidateApps: vi.fn(),
};
vi.mock('@/hooks/useStoreCatalog', () => ({
  useStoreCatalog: () => catalog,
}));

const setAppEnabled = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [
      {
        id: 'n8n',
        name: 'n8n',
        description: 'Workflow-Automatisierung',
        tab: 'automationen',
        enabled: true,
      },
    ],
    isLoading: false,
    isAppEnabled: () => true,
    isTabTypeEnabled: () => true,
    setAppEnabled,
  }),
}));

const startActivation = vi.fn();
vi.mock('@/contexts/ActivationContext', () => ({
  useActivation: () => ({
    activation: null,
    startActivation,
    onActivationComplete: () => () => {},
  }),
}));

const startDownload = vi.fn();
vi.mock('@/contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload,
    isDownloading: () => false,
    getDownloadState: () => null,
    onDownloadComplete: () => () => {},
    cancelDownload: vi.fn(),
  }),
}));

const apiPost = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn(),
    post: apiPost,
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
  }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => toast,
}));

const onBack = vi.fn();
function renderPage() {
  // ModelFitBanner (Plan 009) nutzt useQuery → QueryClientProvider nötig.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreDetailPage onBack={onBack} />
    </QueryClientProvider>
  );
}

describe('StoreDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.loadedModel = null;
    useExtensionStore.getState().clearSelection();
  });

  it('ohne Auswahl: „← Zurück"-Fallback ruft onBack', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('store-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('Modell-Detail: Kontextlänge formatiert + „← Zurück"', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Llama 3' })).toBeInTheDocument();
    expect(screen.getByText('Kontextlänge')).toBeInTheDocument();
    expect(screen.getByText('32k Tokens')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('store-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('Modell-Detail: Aktivieren startet die Aktivierung', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Aktivieren/ }));
    expect(startActivation).toHaveBeenCalledWith('llama3', 'Llama 3');
  });

  it('Modell-Detail: „Als Standard" ruft /models/default', async () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Als Standard/ }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/models/default',
        { model_id: 'llama3' },
        { showError: false }
      )
    );
  });

  it('Modell-Detail: verwandte Modelle werden gezeigt und sind anklickbar', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByText('Verwandte Modelle')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('related-model-llama3-mini'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3-mini' });
  });

  it('Erweiterungs-Detail: Deaktivieren ruft setAppEnabled', async () => {
    useExtensionStore.getState().selectExtension({ kind: 'app', id: 'n8n' });
    renderPage();
    expect(screen.getByRole('heading', { name: 'n8n' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Deaktivieren/ }));
    await waitFor(() => expect(setAppEnabled).toHaveBeenCalledWith('n8n', false));
  });

  // --- Steckbrief, Plan 023 D2 -------------------------------------------

  it('Steckbrief: Parameter, Quantisierung und Lizenz stehen da', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByText('Parameter')).toBeInTheDocument();
    expect(screen.getByText('8.2B')).toBeInTheDocument();
    expect(screen.getByText('Quantisierung')).toBeInTheDocument();
    expect(screen.getByText('Q4_K_M')).toBeInTheDocument();
    expect(screen.getByText('Lizenz')).toBeInTheDocument();
    expect(screen.getByText('apache-2.0')).toBeInTheDocument();
  });

  it('Steckbrief: die Messung nennt die Zahl der Laeufe und schreibt deutsch', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByText('Gemessen auf diesem Gerät')).toBeInTheDocument();
    // 14.3 aus der Datenbank, 14,3 auf dem Bildschirm.
    expect(screen.getByText(/14,3 Token\/s/)).toBeInTheDocument();
    expect(screen.getByText(/aus 12 Läufen/)).toBeInTheDocument();
  });

  it('Steckbrief: der Link auf die Modellkarte fuehrt zum Hersteller', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    const link = screen.getByRole('link', { name: 'Beim Hersteller nachlesen' });
    expect(link).toHaveAttribute('href', 'https://ollama.com/library/llama3');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('Ohne Steckbrief steht dort kein leeres Feld, sondern der Grund', () => {
    // llama3-mini ist nicht installiert, also hat Ollama nichts zu melden.
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3-mini' });
    renderPage();
    expect(screen.queryByText('Parameter')).not.toBeInTheDocument();
    expect(screen.queryByText('Lizenz')).not.toBeInTheDocument();
    expect(screen.queryByText('Gemessen auf diesem Gerät')).not.toBeInTheDocument();
    expect(screen.getByText(/sobald das Modell auf diesem Gerät liegt/)).toBeInTheDocument();
  });

  it('Ohne Modellkarte wird kein Link auf Nichts gebaut', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3-mini' });
    renderPage();
    expect(
      screen.queryByRole('link', { name: 'Beim Hersteller nachlesen' })
    ).not.toBeInTheDocument();
  });

  it('Baukasten-Einstieg (kind: builder) zeigt die Foundation-Seite', () => {
    useExtensionStore.getState().selectExtension({ kind: 'builder', id: 'builder' });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Eigene Erweiterung bauen' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('store-detail-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
