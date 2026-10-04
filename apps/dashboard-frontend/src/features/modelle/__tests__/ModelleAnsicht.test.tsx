/**
 * Die Modell-Ansicht der Verwaltung (M5, Auftrag verwaltung-modelle).
 *
 * Gemessen wird, was der Auftrag verlangt: je Zeile Name, Größe, Fähigkeiten,
 * warm und die nutzenden Flows; darüber eine Zeile Speicher für KI; Hinzufügen
 * aus der Liste oder per Name prüft vorher und zeigt die Abweisung; Entfernen
 * eines genutzten Modells ist gesperrt; Knöpfe zum Laden oder Entladen von Hand
 * gibt es nicht.
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

const FAEHIG = { text: true, bild: false, werkzeuge: true, kontext: 262_144 };

const QWEN = {
  id: 'qwen3.8:27b-q4_K_M',
  name: 'Qwen 3.8 27B',
  groesse_bytes: 16_000_000_000,
  faehigkeiten: { ...FAEHIG, bild: true },
  warm: true,
  ist_standard: true,
  ungemessen: false,
  flows: [{ app_id: 'probe', app_name: 'Probe', flow: 'beleg' }],
  sperre:
    '„Qwen 3.8 27B" lässt sich nicht entfernen, solange ein Flow es nutzt: „beleg" (Probe). Bitte erst die Flows auf ein anderes Modell umstellen.',
};
const GEMMA = {
  id: 'gemma4:e4b',
  name: 'Gemma 4 e4b',
  groesse_bytes: 4_000_000_000,
  faehigkeiten: FAEHIG,
  warm: false,
  ist_standard: false,
  ungemessen: false,
  flows: [],
  sperre: null,
};
const NOMIC = {
  id: 'nomic-embed-text',
  name: 'Nomic Embed Text',
  groesse_bytes: 274_000_000,
  faehigkeiten: { text: false, bild: false, werkzeuge: false, kontext: null },
  warm: false,
  ist_standard: false,
  ungemessen: false,
  flows: [],
  sperre: null,
};
const LLAVA = {
  id: 'llava-phi3',
  name: 'LLaVA Phi3',
  beschreibung: 'Kleiner Rückfall für Bilder.',
  groesse_bytes: 2_900_000_000,
  laedt: false,
  passt: true,
  grund: null,
};
const RIESIG = {
  id: 'riesig:70b',
  name: 'Riesig 70B',
  beschreibung: null,
  groesse_bytes: 90_000_000_000,
  laedt: false,
  passt: false,
  grund: 'Das Modell ist zu groß für dieses Gerät: es braucht 100 GB. Bitte ein kleineres wählen.',
};

const BUDGET = {
  totalBudgetMb: 32_768,
  usedMb: 20_480,
  availableMb: 10_240,
  safetyBufferMb: 2_048,
  loadedModels: [
    {
      id: 'qwen3.8:27b-q4_K_M',
      ollamaName: 'qwen3.8:27b-q4_K_M',
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

function antworte(
  verwaltung = { standard: QWEN.id, modelle: [QWEN, GEMMA, NOMIC], liste: [LLAVA, RIESIG] }
) {
  apiMock.get.mockImplementation(async (pfad: string) => {
    if (pfad === '/models/verwaltung') return verwaltung;
    if (pfad === '/models/catalog') return { models: [] };
    if (pfad === '/models/default') return { default_model: QWEN.id };
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

  it('zeigt eine Zeile je Modell am Gerät, mit Größe, Fähigkeiten und warm', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    const liste = await screen.findByTestId('modell-liste');
    expect(liste.querySelectorAll(':scope > li')).toHaveLength(3);
    expect(screen.getByTestId(`groesse-${QWEN.id}`)).toHaveTextContent('16');
    expect(screen.getByTestId(`faehigkeiten-${QWEN.id}`)).toHaveTextContent(
      'Text, Bild, Werkzeuge, Kontext 256k'
    );
    expect(screen.getByTestId(`faehigkeiten-${GEMMA.id}`)).toHaveTextContent(
      'Text, Werkzeuge, Kontext 256k'
    );
    expect(screen.getByTestId(`warm-${QWEN.id}`)).toHaveTextContent('warm: ja');
    expect(screen.getByTestId(`warm-${GEMMA.id}`)).toHaveTextContent('warm: nein');
  });

  it('nennt je Modell die Flows, die es nutzen', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(await screen.findByTestId(`flows-${QWEN.id}`)).toHaveTextContent(
      'Genutzt von: beleg (Probe)'
    );
    expect(screen.getByTestId(`flows-${GEMMA.id}`)).toHaveTextContent('Kein Flow nutzt es.');
  });

  it('zeigt darüber eine Zeile Speicher für KI', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    const zeile = await screen.findByTestId('modelle-speicher');
    await waitFor(() =>
      expect(zeile).toHaveTextContent(
        'Speicher für KI 20,0 von 32,0 GB belegt, 2,0 GB Reserve, frei 10,0 GB'
      )
    );
  });

  it('sagt, welches Modell der Standard ist, und nur bei einem', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(await screen.findByTestId(`standard-${QWEN.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`standard-${GEMMA.id}`)).not.toBeInTheDocument();
  });

  it('sperrt das Entfernen eines Modells, das ein Flow nutzt, und nennt die Flows', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    const knopf = await screen.findByTestId(`entfernen-${QWEN.id}`);
    expect(knopf).toBeDisabled();
    expect(knopf).toHaveAttribute('title', expect.stringContaining('„beleg" (Probe)'));
    expect(screen.getByTestId(`entfernen-${GEMMA.id}`)).toBeEnabled();
  });

  it('entfernt ein freies Modell über DELETE /models/:id', async () => {
    apiMock.del.mockResolvedValue({});
    render(<ModelleAnsicht />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId(`entfernen-${GEMMA.id}`));
    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/models/gemma4%3Ae4b'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('hat keine Knöpfe zum Laden oder Entladen von Hand', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    await screen.findByTestId('modell-liste');
    expect(screen.queryByText(/in den Speicher/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aus dem Speicher/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`entladen-${QWEN.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`in-den-speicher-${GEMMA.id}`)).not.toBeInTheDocument();
  });

  it('bietet Standard nur bei einem Modell an, das einer sein kann', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(await screen.findByTestId(`standard-setzen-${GEMMA.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`standard-setzen-${NOMIC.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`standard-setzen-${QWEN.id}`)).not.toBeInTheDocument();
  });

  it('zeigt die geprüfte Liste; was nicht passt, trägt den Grund und ist nicht anklickbar', async () => {
    render(<ModelleAnsicht />, { wrapper: huelle() });

    fireEvent.click(await screen.findByTestId(`hinzufuegen-${LLAVA.id}`));
    expect(startDownload).toHaveBeenCalledWith(LLAVA.id, 'LLaVA Phi3');

    expect(screen.getByTestId(`geprueft-grund-${RIESIG.id}`)).toHaveTextContent('zu groß');
    expect(screen.getByTestId(`hinzufuegen-${RIESIG.id}`)).toBeDisabled();
  });

  it('Name eingeben: erst prüfen, dann laden', async () => {
    apiMock.post.mockResolvedValue({ passt: true, grund: null, groesse_bytes: 4_100_000_000 });
    render(<ModelleAnsicht />, { wrapper: huelle() });

    const feld = await screen.findByTestId('modell-hinzufuegen-kennung');
    expect(screen.getByTestId('modell-hinzufuegen-absenden')).toBeDisabled();
    fireEvent.change(feld, { target: { value: '  mistral:7b ' } });
    fireEvent.click(screen.getByTestId('modell-hinzufuegen-absenden'));

    await waitFor(() => expect(startDownload).toHaveBeenCalledWith('mistral:7b', 'mistral:7b'));
    expect(apiMock.post).toHaveBeenCalledWith(
      '/models/pruefen',
      { model_id: 'mistral:7b' },
      { showError: false }
    );
  });

  it('Name eingeben, passt nicht: die zwei Sätze stehen da, geladen wird nichts', async () => {
    apiMock.post.mockResolvedValue({
      passt: false,
      grund: RIESIG.grund,
      groesse_bytes: 90_000_000_000,
    });
    render(<ModelleAnsicht />, { wrapper: huelle() });

    fireEvent.change(await screen.findByTestId('modell-hinzufuegen-kennung'), {
      target: { value: 'riesig:70b' },
    });
    fireEvent.click(screen.getByTestId('modell-hinzufuegen-absenden'));

    expect(await screen.findByTestId('modell-abweisung')).toHaveTextContent(RIESIG.grund);
    expect(startDownload).not.toHaveBeenCalled();
  });

  it('kennzeichnet ein frei geladenes Modell als ungemessen', async () => {
    antworte({
      standard: QWEN.id,
      modelle: [QWEN, { ...GEMMA, id: 'mistral:7b', name: 'mistral (7b)', ungemessen: true }],
      liste: [],
    });
    render(<ModelleAnsicht />, { wrapper: huelle() });

    expect(await screen.findByTestId('ungemessen-mistral:7b')).toBeInTheDocument();
    expect(screen.queryByTestId(`ungemessen-${QWEN.id}`)).not.toBeInTheDocument();
  });
});
