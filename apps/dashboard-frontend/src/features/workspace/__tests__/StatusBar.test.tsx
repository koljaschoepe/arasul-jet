import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from '../StatusBar';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { MemoryBudget } from '@/types';

const get = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get }),
}));

const emptyBudget: MemoryBudget = {
  totalBudgetMb: 24_576,
  usedMb: 0,
  availableMb: 24_576,
  safetyBufferMb: 0,
  loadedModels: [],
  canLoadMore: true,
};

/** Routet die beiden StatusBar-Queries (/health + /models/memory-budget). */
function mockApi(overrides: { health?: unknown; budget?: unknown } = {}) {
  const health = overrides.health ?? { status: 'OK', version: '1.2.3' };
  const budget = overrides.budget ?? emptyBudget;
  get.mockImplementation((path: string) => {
    if (path === '/models/memory-budget') return Promise.resolve(budget);
    return Promise.resolve(health);
  });
}

function renderStatusBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatusBar />
    </QueryClientProvider>
  );
}

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: true,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

describe('StatusBar', () => {
  beforeEach(() => {
    resetStore();
    get.mockReset();
  });

  it('zeigt Verbunden + Version, wenn /health OK meldet', async () => {
    mockApi();
    renderStatusBar();

    expect(await screen.findByText('Verbunden')).toBeInTheDocument();
    expect(await screen.findByText('v1.2.3')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/health', { showError: false });
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

  it('zeigt das aktive Terminal-Projekt aus der Session-Registry', async () => {
    mockApi();
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'Mein Projekt' }],
      activeTerminalSessionId: 'p1',
    });
    renderStatusBar();

    expect(await screen.findByText('Mein Projekt')).toBeInTheDocument();
  });

  it('pollt /models/memory-budget mit geteiltem Query-Key', async () => {
    mockApi();
    renderStatusBar();

    await screen.findByTestId('workspace-statusbar-model');
    expect(get).toHaveBeenCalledWith('/models/memory-budget', { showError: false });
  });

  it('zeigt "kein Modell geladen" nur, wenn gar nichts installiert ist', async () => {
    mockApi();
    renderStatusBar();

    expect(await screen.findByText('kein Modell geladen')).toBeInTheDocument();
  });

  it('zeigt "<Modell> · bereit", wenn ein Modell installiert, aber nicht im RAM geladen ist (Plan 009)', async () => {
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

    expect(await screen.findByText('Llama 3 · bereit')).toBeInTheDocument();
    expect(screen.queryByText('kein Modell geladen')).not.toBeInTheDocument();
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

    expect(await screen.findByText('Llama 3 · KI-RAM 8.0/24.0 GB')).toBeInTheDocument();
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

    expect(await screen.findByText('Llama 3 +1 · KI-RAM 12.0/24.0 GB')).toBeInTheDocument();
  });
});
