/**
 * Ein Zustand, ueberall gleich (Plan 023 D3).
 *
 * Im Rundgang am 19.08.2026 gesehen: das Modellraster sagte „kein Modell
 * geladen", obwohl ein bereites Modell da war. Seit M5 (04.10.2026) steht der
 * Modellzustand nur noch in der Verwaltung; die Statusleiste nennt kein Modell
 * mehr. Der Fall bleibt der, in dem sich die Stellen unterschieden: ein Modell
 * ist heruntergeladen, liegt aber nicht im Speicher.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ModelleAnsicht from '../modelle/ModelleAnsicht';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ get, post }) }));
vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

/** Ein Katalog mit genau dem Modell, um das es geht. */
const MODELL = {
  id: 'gemma4:e4b-q4',
  name: 'Gemma 4 Kompakt',
  description: 'Schnell und effizient',
  size_bytes: 8_000_000_000,
  ram_required_gb: 10,
  category: 'medium',
  install_status: 'available',
  model_type: 'vision',
};

const katalog = {
  models: [MODELL] as unknown[],
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

/** Ein Modell ist heruntergeladen, liegt aber nicht im Speicher. */
const BUDGET = {
  totalBudgetMb: 32768,
  usedMb: 0,
  availableMb: 30720,
  safetyBufferMb: 2048,
  loadedModels: [],
  installedModel: { id: 'gemma4:e4b-q4', name: 'Gemma 4 Kompakt' },
  installedCount: 1,
  lastSwitch: {
    // Das Backend loest den Anzeigenamen aus dem Katalog auf, so wie fuer die
    // geladenen Modelle auch. Stuende hier die Kennung, hiesse dasselbe Modell
    // in dieser Zeile "Gemma 4" und ueberall sonst "Gemma 4 Kompakt".
    model: 'Gemma 4 Kompakt',
    reason: 'auto_unload_adaptive_idle',
    at: '2026-08-21T00:00:00Z',
  },
  canLoadMore: true,
};

function routen() {
  get.mockImplementation((pfad: string) => {
    switch (pfad) {
      case '/models/memory-budget':
        return Promise.resolve(BUDGET);
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

function huelle(kind: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{kind}</QueryClientProvider>);
}

describe('ein Zustand, ueberall gleich', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    routen();
  });

  it('die Ansicht nennt das bereite Modell mit seinem Anzeigenamen', async () => {
    // waitFor statt findByTestId: das Element steht sofort da, sein Inhalt
    // kommt erst mit der Antwort auf /models/memory-budget. Ein findByTestId
    // waere hier gruen gewesen, ohne je den richtigen Satz gesehen zu haben.
    const ansicht = huelle(<ModelleAnsicht />);
    await waitFor(() =>
      // Bis zum 21.08.2026 stand hier „kein Modell geladen".
      expect(screen.getByTestId('modelle-zustand')).toHaveTextContent('Gemma 4 Kompakt, bereit')
    );
    ansicht.unmount();
  });

  it('die Ansicht sagt, warum das Modell aus dem Speicher ist', async () => {
    huelle(<ModelleAnsicht />);
    const grund = await screen.findByTestId('modelle-wechselgrund');
    expect(grund).toHaveTextContent(
      'Gemma 4 Kompakt wurde automatisch aus dem Speicher genommen, weil es eine Weile nicht gebraucht wurde.'
    );
  });

  it('die KI-RAM-Zeile nennt Belegung und Reserve', async () => {
    const ansicht = huelle(<ModelleAnsicht />);
    // Plan 023 D4: die Reserve steht jetzt mit da, und die Zeile geht auf.
    expect(
      await screen.findByText('0,0 von 32,0 GB belegt, 2,0 GB Reserve, frei 30,0 GB')
    ).toBeInTheDocument();
    ansicht.unmount();
  });
});
