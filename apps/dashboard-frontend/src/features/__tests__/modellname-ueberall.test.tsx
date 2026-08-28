/**
 * Ein Modell heisst ueberall gleich (Plan 023 D1).
 *
 * Am 20.08.2026 am Geraet gemessen: Katalog, Statusleiste und Auswahlliste
 * sagten uebereinstimmend "Gemma 4 Kompakt", der Modellknopf im Chat sagte
 * "Gemma". Er kuerzte auf das erste Wort. Der Chat ist mit B2 gefallen; die
 * beiden verbliebenen Flaechen muessen weiter dasselbe sagen.
 *
 * Dieser Test rendert beide Flaechen mit DEMSELBEN Modell und verlangt
 * dieselbe Zeichenkette. Er ist bewusst nicht in eine der bestehenden
 * Testdateien gewandert: die Aussage gilt zwischen ihnen, nicht in einer.
 *
 * Zwei Faelle, weil zwei Wege in die Anzeige fuehren:
 *   1. das Modell steht im Katalog und hat einen gepflegten Namen,
 *   2. das Modell kam per Direkt-Pull, der Katalog kennt nur die Kennung.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ModelleAnsicht from '../modelle/ModelleAnsicht';
import { StatusBar } from '../workspace/StatusBar';
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
// Die Statusleiste fragt seit D3 nach der Rolle: das KI-RAM-Budget ist eine
// Verwaltungsroute, und fuer einen Mitarbeiter darf sie sie gar nicht erst
// abrufen. Ohne diesen Ersatz wirft `useAuth` hier mangels Provider.
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
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
      default:
        return Promise.resolve({ status: 'OK', version: '1.2.3' });
    }
  });
  post.mockResolvedValue({});
}

describe('ein Modell heisst ueberall gleich', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it.each([
    ['Katalogname gepflegt', GEPFLEGT, 'Qwen 3.8 27B'],
    ['Direkt-Pull ohne Namen', DIREKT_PULL, 'Qwen 3 Coder 30B'],
  ])('%s: Katalog und Statusleiste sagen dasselbe', async (_was, modell, erwartet) => {
    // Das Register ist die Quelle, an der die drei Flaechen gemessen werden.
    expect(modellAnzeigeName(modell)).toBe(erwartet);

    // 1. Die Modell-Ansicht
    apiRouten(null);
    const katalogAnsicht = huelle(<ModelleAnsicht />);
    expect(
      await screen.findByText(erwartet, { selector: 'span', exact: true })
    ).toBeInTheDocument();
    katalogAnsicht.unmount();

    // 2. Statusleiste, die den Namen roh von Ollama bekommt
    apiRouten({ name: modell.id, ramMb: 20_000 });
    const leiste = huelle(<StatusBar />);
    expect(await screen.findByText(new RegExp(erwartet.replace(/\./g, '\\.')))).toBeInTheDocument();
    leiste.unmount();
  });
});
