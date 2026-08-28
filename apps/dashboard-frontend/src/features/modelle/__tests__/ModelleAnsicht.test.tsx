/**
 * Die Modell-Ansicht (Phase D5).
 *
 * Gemessen wird, was die Phase verlangt: die Ansicht zeigt GENAU die
 * Kurzliste, sie sagt welches Modell der Standard ist, sie nennt KI-RAM und
 * das Modell im Speicher, und die drei Handgriffe (laden, Standard setzen,
 * entfernen) gehen an die Wege, die es dafür gibt.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ModelleAnsicht from '../ModelleAnsicht';

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const startDownload = vi.fn();
vi.mock('@/contexts/DownloadContext', () => ({
  useDownloads: () => ({
    startDownload,
    cancelDownload: vi.fn(),
    isDownloading: () => false,
    getDownloadState: () => null,
    onDownloadComplete: () => () => {},
    activeDownloads: {},
    activeDownloadsList: [],
    activeDownloadCount: 0,
  }),
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

/** Die Kurzliste aus C8, so wie `GET /api/models/catalog` sie liefert. */
const KURZLISTE = [
  {
    id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
    name: 'Qwen 3.8 27B',
    description: 'Der Standard. Die Flows laufen darauf.',
    size_bytes: 16_000_000_000,
    ram_required_gb: 20,
    category: 'gross',
    task: 'text',
    install_status: 'available',
  },
  {
    id: 'gemma4:e4b',
    name: 'Gemma 4 e4b',
    description: 'Das kleine schnelle.',
    size_bytes: 4_000_000_000,
    ram_required_gb: 6,
    category: 'klein',
    task: 'text',
    install_status: 'not_installed',
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    description: 'Einbettungen.',
    size_bytes: 274_000_000,
    ram_required_gb: 1,
    category: 'klein',
    task: 'embedding',
    install_status: 'available',
  },
  {
    id: 'llava-phi3',
    name: 'LLaVA Phi3',
    description: 'Bilder und eingescannter Text.',
    size_bytes: 2_900_000_000,
    ram_required_gb: 4,
    category: 'klein',
    task: 'vision',
    install_status: 'available',
  },
];

const BUDGET = {
  totalBudgetMb: 32_768,
  usedMb: 20_480,
  availableMb: 10_240,
  safetyBufferMb: 2_048,
  loadedModels: [
    {
      id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
      ollamaName: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
      name: 'Qwen 3.8 27B',
      ramMb: 20_480,
    },
  ],
  canLoadMore: true,
};

function huelle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Huelle({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function antworte() {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/models/catalog') return { models: KURZLISTE };
    if (pfad === '/models/default')
      return { default_model: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS' };
    if (pfad === '/models/status') return { loaded_model: null };
    if (pfad === '/models/memory-budget') return BUDGET;
    throw new Error(`unerwarteter Pfad: ${pfad}`);
  });
}

describe('Modelle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    antworte();
  });

  it('zeigt genau die Kurzliste', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    const liste = await screen.findByTestId('modell-liste');
    expect(liste.querySelectorAll('li')).toHaveLength(KURZLISTE.length);
    for (const modell of KURZLISTE) {
      expect(screen.getByTestId(`modell-${modell.id}`)).toBeInTheDocument();
    }
  });

  it('sagt, welches Modell der Standard ist, und nur bei einem', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(
      await screen.findByTestId('standard-hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('standard-gemma4:e4b')).not.toBeInTheDocument();
    // Und im Kopf steht derselbe Name.
    expect(screen.getAllByText('Qwen 3.8 27B').length).toBeGreaterThan(1);
  });

  it('zeigt KI-RAM und das Modell im Speicher', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(
      await screen.findByText('20,0 von 32,0 GB belegt, 2,0 GB Reserve, frei 10,0 GB')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('im-speicher-hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS')
    ).toBeInTheDocument();
  });

  it('bietet Laden nur fuer ein Modell an, das nicht am Geraet liegt', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('laden-gemma4:e4b'));
    expect(startDownload).toHaveBeenCalledWith('gemma4:e4b', 'Gemma 4 e4b');
    // Was am Geraet liegt, hat keinen Lade-Knopf, sondern einen zum Entfernen.
    expect(screen.queryByTestId('laden-llava-phi3')).not.toBeInTheDocument();
    expect(screen.getByTestId('entfernen-llava-phi3')).toBeInTheDocument();
  });

  it('setzt den Standard nur bei einem Modell, das einer sein kann', async () => {
    apiMock.post.mockResolvedValue({});
    render(<ModelleAnsicht />, { wrapper: huelle() });

    // Einbettungen und Bilder sind kein Standard der Flows.
    expect(await screen.findByTestId('modell-nomic-embed-text')).toBeInTheDocument();
    expect(screen.queryByTestId('standard-setzen-nomic-embed-text')).not.toBeInTheDocument();
    expect(screen.queryByTestId('standard-setzen-llava-phi3')).not.toBeInTheDocument();
    // Das zweite Textmodell liegt nicht am Geraet, also erst laden.
    expect(screen.queryByTestId('standard-setzen-gemma4:e4b')).not.toBeInTheDocument();
  });

  it('entfernt ein Modell ueber DELETE /models/:id', async () => {
    apiMock.del.mockResolvedValue({});
    render(<ModelleAnsicht />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId('entfernen-llava-phi3'));
    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/models/llava-phi3'));
    expect(toast.success).toHaveBeenCalled();
  });
});
