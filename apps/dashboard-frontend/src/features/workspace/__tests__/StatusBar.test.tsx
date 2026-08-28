import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DownloadProvider } from '@/contexts/DownloadContext';
import { StatusBar } from '../StatusBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { MemoryBudget } from '@/types';
import type { CatalogModel } from '@/hooks/useStoreCatalog';

/**
 * Die neu geschriebene StatusBar rendert zwei interaktive shadcn-Popover und
 * zieht Daten über React Query (`useApi`) + `useToast`. Die Tests spiegeln die
 * etablierten Provider-/Mock-Muster des Repos: `useApi` per `vi.mock`, `useToast`
 * per `vi.mock`, alles innerhalb eines frischen `QueryClientProvider`.
 */

const get = vi.fn();
const post = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get, post }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => toast,
}));

// Der DownloadProvider fragt seit D2 nach der Rolle: `/models/catalog` ist eine
// Verwaltungsroute, und fuer einen Mitarbeiter darf er sie gar nicht erst
// abrufen. Ohne diesen Ersatz wirft `useAuth` hier mangels Provider.
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const emptyBudget: MemoryBudget = {
  totalBudgetMb: 24_576,
  usedMb: 0,
  availableMb: 24_576,
  safetyBufferMb: 0,
  loadedModels: [],
  canLoadMore: true,
};

/** Vollständiger Katalog-Eintrag (install_status 'available' = heruntergeladen). */
function installedModel(over: Partial<CatalogModel> & { id: string; name: string }): CatalogModel {
  return {
    description: '',
    size_bytes: 5_000_000_000,
    ram_required_gb: 8,
    category: 'medium',
    install_status: 'available',
    ...over,
  };
}

interface ApiOverrides {
  health?: unknown;
  budget?: unknown;
  catalog?: CatalogModel[];
  loadedModelId?: string | null;
  defaultModelId?: string | null;
}

/**
 * Routet alle GET-Pfade der StatusBar (/health, /models/memory-budget sowie die
 * beim Öffnen des Modell-Popover geladenen /models/catalog|status|default).
 */
function mockApi(overrides: ApiOverrides = {}) {
  const health = overrides.health ?? { status: 'OK', version: '1.2.3' };
  const budget = overrides.budget ?? emptyBudget;
  const catalog = overrides.catalog ?? [];
  const loadedModelId = overrides.loadedModelId ?? null;
  const defaultModelId = overrides.defaultModelId ?? null;
  get.mockImplementation((path: string) => {
    switch (path) {
      case '/models/memory-budget':
        return Promise.resolve(budget);
      case '/models/catalog':
        return Promise.resolve({ models: catalog });
      case '/models/status':
        return Promise.resolve({
          loaded_model: loadedModelId ? { model_id: loadedModelId } : null,
        });
      case '/models/default':
        return Promise.resolve({ default_model: defaultModelId });
      default:
        return Promise.resolve(health);
    }
  });
  post.mockResolvedValue({ default_model: 'ok' });
}

function renderStatusBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DownloadProvider>
        <StatusBar />
      </DownloadProvider>
    </QueryClientProvider>
  );
}

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
  });
}

describe('StatusBar', () => {
  beforeEach(() => {
    resetStore();
    get.mockReset();
    post.mockReset();
    toast.success.mockReset();
  });

  it('zeigt Verbunden + Version, wenn /health OK meldet', async () => {
    mockApi();
    renderStatusBar();

    expect(await screen.findByText('Verbunden')).toBeInTheDocument();
    expect(await screen.findAllByText('1.2.3')).not.toHaveLength(0);
    expect(get).toHaveBeenCalledWith('/health', { showError: false });
  });

  // Das feste „v" davor ist seit Plan 023 C6 weg. Ohne gesetzte Version sagt
  // das Backend „Vorserie", und „vVorserie" waere Unsinn (Befund F-19).
  it('zeigt die Version so, wie das Backend sie nennt', async () => {
    mockApi({ health: { status: 'OK', version: 'Vorserie' } });
    renderStatusBar();
    expect(await screen.findAllByText('Vorserie')).not.toHaveLength(0);
    expect(screen.queryByText('vVorserie')).not.toBeInTheDocument();
  });

  it('zeigt Getrennt, wenn /health nicht erreichbar ist', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/models/memory-budget') return Promise.resolve(emptyBudget);
      return Promise.reject(new Error('offline'));
    });
    renderStatusBar();

    // Die Komponente setzt retry:1 (≈1s Backoff) — Timeout entsprechend höher
    expect(await screen.findByText('Getrennt', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('pollt /models/memory-budget mit geteiltem Query-Key', async () => {
    mockApi();
    renderStatusBar();

    await screen.findByTestId('workspace-statusbar-model');
    expect(get).toHaveBeenCalledWith('/models/memory-budget', { showError: false });
  });

  // Plan 023 D3: der Satz heisst jetzt "kein Modell installiert" und kommt aus
  // `utils/modellZustand`, damit das Modellraster denselben zeigt. Bis dahin
  // sagte das Raster "kein Modell geladen", waehrend hier gleichzeitig ein
  // bereites Modell stand.
  it('zeigt "kein Modell installiert" nur, wenn gar nichts installiert ist', async () => {
    mockApi();
    renderStatusBar();

    expect(await screen.findByText('kein Modell installiert')).toBeInTheDocument();
  });

  it('zeigt "<Modell>, bereit", wenn ein Modell installiert, aber nicht im RAM geladen ist (Plan 009)', async () => {
    mockApi({
      budget: {
        totalBudgetMb: 24_576,
        usedMb: 0,
        availableMb: 24_576,
        safetyBufferMb: 0,
        canLoadMore: true,
        loadedModels: [],
        installedModel: { id: 'llama3', name: 'Llama 3' },
        installedCount: 1,
      } satisfies MemoryBudget,
    });
    renderStatusBar();

    expect(await screen.findByText('Llama 3, bereit')).toBeInTheDocument();
    expect(screen.queryByText('kein Modell installiert')).not.toBeInTheDocument();
  });

  it('zeigt Modellname und KI-RAM-Belegung, wenn ein Modell geladen ist', async () => {
    mockApi({
      budget: {
        totalBudgetMb: 24_576,
        usedMb: 8_192,
        availableMb: 16_384,
        safetyBufferMb: 0,
        canLoadMore: true,
        loadedModels: [{ id: 'llama3', ollamaName: 'llama3:8b', name: 'Llama 3', ramMb: 8_192 }],
      } satisfies MemoryBudget,
    });
    renderStatusBar();

    expect(await screen.findByText('Llama 3 · KI-RAM 8,0/24,0 GB')).toBeInTheDocument();
  });

  it('zählt weitere geladene Modelle mit +N', async () => {
    mockApi({
      budget: {
        totalBudgetMb: 24_576,
        usedMb: 12_288,
        availableMb: 12_288,
        safetyBufferMb: 0,
        canLoadMore: true,
        loadedModels: [
          { id: 'a', ollamaName: 'a', name: 'Llama 3', ramMb: 8_192 },
          { id: 'b', ollamaName: 'b', name: 'BGE-M3', ramMb: 4_096 },
        ],
      } satisfies MemoryBudget,
    });
    renderStatusBar();

    expect(await screen.findByText('Llama 3 +1 · KI-RAM 12,0/24,0 GB')).toBeInTheDocument();
  });

  it('öffnet das Verbindungs-Popover mit Backend-Status, Version und KI-RAM', async () => {
    mockApi({
      budget: {
        totalBudgetMb: 24_576,
        usedMb: 8_192,
        availableMb: 16_384,
        safetyBufferMb: 0,
        canLoadMore: true,
        loadedModels: [{ id: 'a', ollamaName: 'a', name: 'Llama 3', ramMb: 8_192 }],
      } satisfies MemoryBudget,
    });
    renderStatusBar();

    // Trigger erst nach dem ersten /health-Load klickbar machen.
    const trigger = await screen.findByTitle('Verbindung anzeigen');
    fireEvent.click(trigger);

    // Popover-Inhalt (Portal) — eindeutige Texte des Detailbereichs.
    expect(await screen.findByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    // Die Version steht sowohl in der Fußzeile als auch im Popover-Inhalt.
    expect(screen.getAllByText('1.2.3').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('KI-RAM')).toBeInTheDocument();
    expect(screen.getByText('Modelle im RAM')).toBeInTheDocument();
    expect(screen.getByText('Alles läuft lokal auf dem Gerät, keine Cloud.')).toBeInTheDocument();
  });

  it('listet heruntergeladene Modelle im Modell-Popover und markiert das Standardmodell', async () => {
    mockApi({
      catalog: [
        installedModel({ id: 'llama3', name: 'Llama 3', ram_required_gb: 8 }),
        installedModel({ id: 'qwen3', name: 'Qwen 3', ram_required_gb: 6 }),
        // nicht heruntergeladen → darf nicht in der Liste auftauchen
        installedModel({ id: 'gemma', name: 'Gemma', install_status: 'not_installed' }),
      ],
      loadedModelId: 'llama3',
      defaultModelId: 'qwen3',
    });
    renderStatusBar();

    fireEvent.click(await screen.findByTestId('workspace-statusbar-model'));

    // Katalog wird erst beim Öffnen geladen (enabled: modelOpen).
    expect(await screen.findByText('Llama 3')).toBeInTheDocument();
    expect(screen.getByText('Qwen 3')).toBeInTheDocument();
    expect(screen.queryByText('Gemma')).not.toBeInTheDocument();
    // geladenes Modell trägt das „im RAM"-Badge
    expect(screen.getByText('im RAM')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/models/catalog', { showError: false });
  });

  it('setzt beim Klick auf ein Modell den Standard via api.post(/models/default) und meldet es per Toast', async () => {
    mockApi({
      catalog: [installedModel({ id: 'llama3', name: 'Llama 3', ram_required_gb: 8 })],
      defaultModelId: null,
    });
    renderStatusBar();

    fireEvent.click(await screen.findByTestId('workspace-statusbar-model'));
    const modelButton = await screen.findByRole('button', { name: /Llama 3/ });
    fireEvent.click(modelButton);

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith('/models/default', { model_id: 'llama3' });
    });
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Standardmodell: Llama 3');
    });
  });
});
