/**
 * StoreModelsGrid — der „Modelle"-Reiter des Stores (Full-Width-Kartenraster).
 *
 * Prüft: Status-Badges (Verfügbar/Installiert), Start eines Downloads,
 * LIVE-Fortschritt, sowie das zuverlässige Feedback — nach einem erfolgreichen
 * Download wird der Katalog neu geladen (Modell erscheint installiert), bei
 * einem Fehler zeigt die Fortschrittsleiste die echte Fehlermeldung. Ein Klick
 * auf eine Karte setzt die Auswahl im Extension-Store (öffnet die Detailseite).
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { EMPTY_MODEL_FILTERS } from '../storeModelFilters';
import { StoreModelsGrid } from '../StoreModelsGrid';

// Das Kopf-Dashboard fragt /models/memory-budget + /models/default ab und zeigt
// Toasts — hier stubben, der Test prüft das Kartenraster, nicht das Dashboard.
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn(async () => ({})), post: vi.fn(async () => ({})) }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

type Model = {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  install_status: string;
  effective_ollama_name?: string;
  model_type?: string;
};

const invalidateModels = vi.fn();
const catalog = {
  models: [] as Model[],
  loadedModel: null as { model_id: string } | null,
  defaultModel: null as string | null,
  apps: [],
  isLoading: false,
  invalidateModels,
  invalidateApps: vi.fn(),
};
vi.mock('@/hooks/useStoreCatalog', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useStoreCatalog')>('@/hooks/useStoreCatalog');
  return { ...actual, useStoreCatalog: () => catalog };
});

// Steuerbarer DownloadContext-Mock.
const startDownload = vi.fn();
const cancelDownload = vi.fn();
const downloadStates: Record<string, unknown> = {};
const completeCallbacks = new Set<(id: string, ok: boolean) => void>();
vi.mock('@/contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload,
    cancelDownload,
    isDownloading: (id: string) => id in downloadStates,
    getDownloadState: (id: string) => downloadStates[id] ?? null,
    onDownloadComplete: (cb: (id: string, ok: boolean) => void) => {
      completeCallbacks.add(cb);
      return () => completeCallbacks.delete(cb);
    },
  }),
}));

// Steuerbarer ActivationContext-Mock (das Dashboard lädt Modelle darüber in
// den RAM und abonniert onActivationComplete).
const startActivation = vi.fn();
const activationCallbacks = new Set<(id: string, ok: boolean) => void>();
vi.mock('@/contexts/ActivationContext', () => ({
  useActivation: () => ({
    activation: null,
    startActivation,
    cancelActivation: vi.fn(),
    isActivating: () => false,
    getActivationPercent: () => 0,
    onActivationComplete: (cb: (id: string, ok: boolean) => void) => {
      activationCallbacks.add(cb);
      return () => activationCallbacks.delete(cb);
    },
  }),
}));

function renderGrid() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StoreModelsGrid />
    </QueryClientProvider>
  );
}

const model = (over: Partial<Model> = {}): Model => ({
  id: 'qwen3-7b',
  name: 'Qwen3 7B',
  description: 'Allrounder',
  size_bytes: 5_000_000_000,
  ram_required_gb: 8,
  category: 'medium',
  install_status: 'not_installed',
  ...over,
});

describe('StoreModelsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.models = [];
    catalog.loadedModel = null;
    for (const k of Object.keys(downloadStates)) delete downloadStates[k];
    completeCallbacks.clear();
    useExtensionStore.getState().clearSelection();
    // Filter leben jetzt im storeFilterStore (Plan 012 Phase C) — pro Test leeren.
    useStoreFilterStore.setState({ modelQuery: '', modelFilters: EMPTY_MODEL_FILTERS });
  });

  it('zeigt Größe und Status „Installiert" für ein heruntergeladenes Modell', () => {
    catalog.models = [model({ install_status: 'available' })];
    renderGrid();
    // „Qwen3 7B" steht jetzt auch in der Standardmodell-Auswahl des Dashboards —
    // die Karten-Assertion daher auf die Karte scopen.
    const card = screen.getByTestId('model-card-qwen3-7b');
    expect(within(card).getByText('Qwen3 7B')).toBeInTheDocument();
    // Plan 023 D4: 5000000000 Bytes sind 5 GB. Bis zum 21.08.2026 stand hier
    // 4.7, weil durch 1024³ geteilt und trotzdem "GB" darueber geschrieben
    // wurde. Auf derselben Kachel nannte der Beschreibungstext die richtige
    // Zahl, weil er von Hand geschrieben ist.
    expect(within(card).getByText('5 GB')).toBeInTheDocument();
    expect(within(card).getByText('Installiert')).toBeInTheDocument();
  });

  it('liest Filter aus dem storeFilterStore (Sidebar steuert das Raster)', () => {
    catalog.models = [
      model({ id: 'llm-1', name: 'LLM Eins', model_type: 'llm' }),
      model({ id: 'vis-1', name: 'Vision Eins', model_type: 'vision' }),
    ];
    useStoreFilterStore.setState({ modelFilters: { ...EMPTY_MODEL_FILTERS, types: ['vision'] } });
    renderGrid();
    expect(screen.getByText('Vision Eins')).toBeInTheDocument();
    expect(screen.queryByText('LLM Eins')).not.toBeInTheDocument();
  });

  it('ein nicht installiertes Modell hat einen Laden-Button, der startDownload auslöst', () => {
    catalog.models = [model()];
    renderGrid();
    fireEvent.click(screen.getByTestId('model-download-qwen3-7b'));
    expect(startDownload).toHaveBeenCalledWith('qwen3-7b', 'Qwen3 7B');
  });

  it('Klick auf die Karte setzt die Auswahl im Extension-Store', () => {
    catalog.models = [model()];
    renderGrid();
    fireEvent.click(screen.getByTestId('model-open-qwen3-7b'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'qwen3-7b' });
  });

  it('zeigt LIVE-Fortschritt während des Downloads', () => {
    catalog.models = [model()];
    downloadStates['qwen3-7b'] = {
      progress: 42,
      phase: 'download',
      status: 'Download läuft...',
      error: null,
    };
    renderGrid();
    expect(screen.getByTestId('model-progress-qwen3-7b')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('erfolgreicher Download lädt den Katalog neu (Modell erscheint installiert)', () => {
    catalog.models = [model()];
    renderGrid();
    // Simuliere einen Abschluss-Callback aus dem DownloadContext.
    expect(completeCallbacks.size).toBe(1);
    completeCallbacks.forEach(cb => cb('qwen3-7b', true));
    expect(invalidateModels).toHaveBeenCalled();
  });

  it('fehlgeschlagener Download zeigt die echte Fehlermeldung in der Fortschrittsleiste', () => {
    catalog.models = [model()];
    downloadStates['qwen3-7b'] = {
      progress: 0,
      phase: 'error',
      status: 'Fehler',
      error: 'Ollama-Version zu alt für dieses Modell.',
    };
    renderGrid();
    expect(screen.getByText('Ollama-Version zu alt für dieses Modell.')).toBeInTheDocument();
  });
});
