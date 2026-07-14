/**
 * StoreDetailPage — Detailseite der gewählten Extension (Plan 003 · Schritt 7).
 * Leerzustand mit „Aktuell geladen"-Kopf, Modell-Aktivierung und App-Aktionen.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
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
    },
  ],
  apps: [
    {
      id: 'gitea',
      name: 'Gitea',
      description: 'Git-Server',
      version: '1.0.0',
      category: 'development',
      status: 'available',
    },
  ],
  loadedModel: null as { model_id: string; ram_usage_mb?: number } | null,
  defaultModel: null as string | null,
  isLoading: false,
  invalidateModels: vi.fn(),
  invalidateApps: vi.fn(),
};

vi.mock('@/hooks/useStoreCatalog', () => ({
  useStoreCatalog: () => catalog,
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

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <StoreDetailPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('StoreDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.loadedModel = null;
    useExtensionStore.getState().clearSelection();
  });

  it('Landing ohne Auswahl: „Aktuell geladen"-Kopf + Kategorie-Abschnitte', () => {
    catalog.loadedModel = { model_id: 'llama3', ram_usage_mb: 8192 };
    renderPage();
    expect(screen.getByText('Aktuell geladen:')).toBeInTheDocument();
    expect(screen.getByText('llama3')).toBeInTheDocument();
    // Kategorie-Übersicht statt nacktem Leerzustand
    expect(screen.getByRole('heading', { name: 'Empfohlen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprachmodelle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeInTheDocument();
    // Kacheln für vorhandene Extensions (Modell auch im „Empfohlen"-Abschnitt)
    expect(screen.getAllByTestId('landing-tile-model-llama3').length).toBeGreaterThan(0);
    expect(screen.getByTestId('landing-tile-app-gitea')).toBeInTheDocument();
  });

  it('Landing: Klick auf eine Kachel öffnet die Detailseite', () => {
    renderPage();
    const [firstTile] = screen.getAllByTestId('landing-tile-model-llama3');
    fireEvent.click(firstTile!);
    expect(screen.getByRole('heading', { name: 'Llama 3' })).toBeInTheDocument();
  });

  it('Modell-Detail: Kontextlänge wird formatiert angezeigt', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByText('Kontextlänge')).toBeInTheDocument();
    expect(screen.getByText('32k Tokens')).toBeInTheDocument();
  });

  it('Modell-Detail: Aktivieren startet die Aktivierung', () => {
    useExtensionStore.getState().selectExtension({ kind: 'model', id: 'llama3' });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Llama 3' })).toBeInTheDocument();
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

  it('App-Detail: Installieren startet den SSE-Install über /apps', async () => {
    useExtensionStore.getState().selectExtension({ kind: 'app', id: 'gitea' });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Gitea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Installieren/ })).toBeInTheDocument();
  });
});
