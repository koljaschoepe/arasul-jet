/**
 * Ein Modell heisst ueberall gleich (Plan 023 D1).
 *
 * Am 20.08.2026 am Geraet gemessen: Katalog, Statusleiste und Auswahlliste
 * sagten uebereinstimmend "Gemma 4 Kompakt", der Modellknopf im Chat sagte
 * "Gemma". Er kuerzte auf das erste Wort.
 *
 * Dieser Test rendert die drei Flaechen mit DEMSELBEN Modell und verlangt
 * dieselbe Zeichenkette. Er ist bewusst nicht in eine der drei bestehenden
 * Testdateien gewandert: die Aussage gilt zwischen ihnen, nicht in einer.
 *
 * Zwei Faelle, weil zwei Wege in die Anzeige fuehren:
 *   1. das Modell steht im Katalog und hat einen gepflegten Namen,
 *   2. das Modell kam per Direkt-Pull, der Katalog kennt nur die Kennung.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { StoreModelsGrid } from '../store/StoreModelsGrid';
import { StatusBar } from '../workspace/StatusBar';
import ComposerCard, { type ComposerModel } from '../workspace/llm/agentChat/ComposerCard';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { EMPTY_MODEL_FILTERS } from '../store/storeModelFilters';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { modellAnzeigeName } from '@/utils/modelDisplay';

/** Katalog-Eintrag mit gepflegtem Namen und einer rohen Kennung. */
const GEPFLEGT = {
  id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
  name: 'Qwen 3.8 27B',
  description: 'Allrounder',
  size_bytes: 16_000_000_000,
  ram_required_gb: 20,
  category: 'large',
  install_status: 'available',
  model_type: 'llm',
};

/** Direkt-Pull: der Katalog traegt die Kennung als Namen. */
const DIREKT_PULL = {
  id: 'qwen3-coder:30b',
  name: 'qwen3-coder:30b',
  description: 'Coding',
  size_bytes: 18_000_000_000,
  ram_required_gb: 22,
  category: 'large',
  install_status: 'available',
  model_type: 'llm',
};

const get = vi.fn();
const post = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get, post }) }));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
vi.mock('@/stores/workspaceStore', async () => {
  const actual =
    await vi.importActual<typeof import('@/stores/workspaceStore')>('@/stores/workspaceStore');
  return actual;
});

const katalog = {
  models: [GEPFLEGT, DIREKT_PULL] as unknown[],
  loadedModel: null as { model_id: string } | null,
  defaultModel: null as string | null,
  apps: [],
  isLoading: false,
  invalidateModels: vi.fn(),
  invalidateApps: vi.fn(),
};
vi.mock('@/hooks/useStoreCatalog', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useStoreCatalog')>('@/hooks/useStoreCatalog');
  return { ...actual, useStoreCatalog: () => katalog };
});

vi.mock('@/contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload: vi.fn(),
    cancelDownload: vi.fn(),
    isDownloading: () => false,
    getDownloadState: () => null,
    onDownloadComplete: () => () => {},
    activeDownloads: {},
    activeDownloadsList: [],
  }),
  DownloadProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/ActivationContext', () => ({
  useActivation: () => ({
    activation: null,
    startActivation: vi.fn(),
    cancelActivation: vi.fn(),
    isActivating: () => false,
    getActivationPercent: () => 0,
    onActivationComplete: () => () => {},
  }),
}));

function huelle(kind: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{kind}</QueryClientProvider>);
}

/** Routet die GETs, die StatusBar und Store abfragen. */
function apiRouten(geladen: { name: string; ramMb: number } | null) {
  get.mockImplementation((pfad: string) => {
    switch (pfad) {
      case '/models/memory-budget':
        return Promise.resolve({
          totalBudgetMb: 24_576,
          usedMb: geladen ? 20_000 : 0,
          availableMb: 4_000,
          safetyBufferMb: 0,
          loadedModels: geladen
            ? [{ id: geladen.name, name: geladen.name, ramMb: geladen.ramMb }]
            : [],
          canLoadMore: true,
        });
      case '/models/catalog':
        return Promise.resolve({ models: katalog.models });
      case '/models/status':
        return Promise.resolve({ loaded_model: null });
      case '/models/default':
        return Promise.resolve({ default_model: null });
      case '/projects/active':
        return Promise.resolve({ data: { project: null, space_ids: [] } });
      default:
        return Promise.resolve({ status: 'OK', version: '1.2.3' });
    }
  });
  post.mockResolvedValue({});
}

function composerProps(modelle: ComposerModel[], gewaehlt: string) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
    attachedFile: null as File | null,
    onRemoveFile: vi.fn(),
    attachedImages: [] as { file: File; base64: string }[],
    onRemoveImage: vi.fn(),
    onPickFile: vi.fn(),
    models: modelle,
    selectedModel: gewaehlt,
    onSelectModel: vi.fn(),
  };
}

describe('ein Modell heisst ueberall gleich', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    useStoreFilterStore.setState({ modelQuery: '', modelFilters: EMPTY_MODEL_FILTERS });
    useWorkspaceStore.setState({ chatScope: null });
  });

  it.each([
    ['Katalogname gepflegt', GEPFLEGT, 'Qwen 3.8 27B'],
    ['Direkt-Pull ohne Namen', DIREKT_PULL, 'Qwen 3 Coder 30B'],
  ])('%s: Katalog, Statusleiste und Chat sagen dasselbe', async (_was, modell, erwartet) => {
    // Das Register ist die Quelle, an der die drei Flaechen gemessen werden.
    expect(modellAnzeigeName(modell)).toBe(erwartet);

    // 1. Katalog
    apiRouten(null);
    const katalogAnsicht = huelle(<StoreModelsGrid />);
    expect(
      await screen.findByText(erwartet, { selector: 'span', exact: true })
    ).toBeInTheDocument();
    katalogAnsicht.unmount();

    // 2. Statusleiste, die den Namen roh von Ollama bekommt
    apiRouten({ name: modell.id, ramMb: 20_000 });
    const leiste = huelle(<StatusBar />);
    expect(await screen.findByText(new RegExp(erwartet.replace(/\./g, '\\.')))).toBeInTheDocument();
    leiste.unmount();

    // 3. Modellknopf im Chat
    const chat = huelle(
      <ComposerCard {...composerProps([{ id: modell.id, name: erwartet }], modell.id)} />
    );
    expect(screen.getByRole('button', { name: 'Modell wählen' })).toHaveTextContent(erwartet);
    chat.unmount();
  });
});
