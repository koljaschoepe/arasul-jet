/**
 * StoreModelsList — Modelle-Reiter der linken Liste (Plan 008 · Schritt 15).
 *
 * Prüft: Status-Badges (Verfügbar/Installiert), Start eines Downloads,
 * LIVE-Fortschritt, sowie das zuverlässige Feedback — nach einem erfolgreichen
 * Download wird der Katalog neu geladen (Modell erscheint installiert), bei
 * einem Fehler zeigt die Fortschrittsleiste die echte Fehlermeldung.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExtensionStore } from '@/stores/extensionStore';
import { StoreModelsList } from '../StoreModelsList';

type Model = {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  install_status: string;
  effective_ollama_name?: string;
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

function renderList() {
  return render(<StoreModelsList />);
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

describe('StoreModelsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.models = [];
    catalog.loadedModel = null;
    for (const k of Object.keys(downloadStates)) delete downloadStates[k];
    completeCallbacks.clear();
    useExtensionStore.getState().clearSelection();
  });

  it('zeigt Größe und Status „Installiert" für ein heruntergeladenes Modell', () => {
    catalog.models = [model({ install_status: 'available' })];
    renderList();
    expect(screen.getByText('Qwen3 7B')).toBeInTheDocument();
    expect(screen.getByText('4.7 GB')).toBeInTheDocument();
    expect(screen.getByText('Installiert')).toBeInTheDocument();
  });

  it('ein nicht installiertes Modell hat einen Download-Button, der startDownload auslöst', () => {
    catalog.models = [model()];
    renderList();
    fireEvent.click(screen.getByTestId('model-download-qwen3-7b'));
    expect(startDownload).toHaveBeenCalledWith('qwen3-7b', 'Qwen3 7B');
  });

  it('zeigt LIVE-Fortschritt während des Downloads', () => {
    catalog.models = [model()];
    downloadStates['qwen3-7b'] = {
      progress: 42,
      phase: 'download',
      status: 'Download läuft...',
      error: null,
    };
    renderList();
    expect(screen.getByTestId('model-progress-qwen3-7b')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('erfolgreicher Download lädt den Katalog neu (Modell erscheint installiert)', () => {
    catalog.models = [model()];
    renderList();
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
    renderList();
    expect(screen.getByText('Ollama-Version zu alt für dieses Modell.')).toBeInTheDocument();
  });
});
