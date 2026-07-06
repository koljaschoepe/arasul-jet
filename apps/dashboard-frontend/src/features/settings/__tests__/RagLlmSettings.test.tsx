/**
 * RagLlmSettings Component Tests
 *
 * Tests für RagLlmSettings:
 * - Laden der Tunables via GET /rag/settings
 * - Rendern der gruppierten Felder mit min/max aus dem Zod-Schema
 * - Speichern geänderter Felder via PATCH /rag/settings (nur Teilmenge)
 * - Reset des Basis-Prompts (leeres Feld)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ApiMethods } from '../../../hooks/useApi';
import { RagLlmSettings } from '../RagLlmSettings';

// ---- useApi mock ----
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
} satisfies ApiMethods;

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
}));

const MOCK_SETTINGS = {
  rag_temperature: 0.7,
  rag_num_predict: 1024,
  rag_top_k: 20,
  rag_final_k: 5,
  rag_score_threshold: 0.3,
  rag_relevance_threshold: 0.5,
  rag_mmr_lambda: 0.5,
  rag_dedup_max_per_doc: 3,
  rag_hybrid_search: true,
  rag_rerank_enabled: true,
  rag_timeout_rerank_ms: 15000,
  rag_space_routing_threshold: 0.6,
  rag_space_routing_max_spaces: 3,
  llm_num_ctx_default: 8192,
  llm_keep_alive_seconds: 300,
  llm_num_predict_default: 2048,
  llm_base_system_prompt: 'Du bist ein hilfreicher Assistent.',
};

function mockGetSettings(settings = MOCK_SETTINGS) {
  mockApi.get.mockResolvedValue({ data: settings });
}

describe('RagLlmSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings();
    mockApi.patch.mockResolvedValue({ data: MOCK_SETTINGS });
  });

  test('lädt Einstellungen von GET /rag/settings', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/rag/settings', expect.any(Object));
    });
  });

  test('rendert gruppierte Felder mit geladenen Werten', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByText('Generierung')).toBeInTheDocument();
    });

    // Group headings
    expect(screen.getByText('Retrieval')).toBeInTheDocument();
    expect(screen.getByText('Space-Routing')).toBeInTheDocument();
    expect(screen.getByText('Basis-System-Prompt')).toBeInTheDocument();

    // Loaded values are reflected in the inputs
    expect(screen.getByLabelText('Temperatur (RAG)')).toHaveValue(0.7);
    expect(screen.getByLabelText('Final-K (finale Treffer)')).toHaveValue(5);
    expect(screen.getByLabelText('Basis-System-Prompt')).toHaveValue(
      'Du bist ein hilfreicher Assistent.'
    );
  });

  test('spiegelt min/max aus dem Zod-Schema in den Zahlen-Inputs', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Temperatur (RAG)')).toBeInTheDocument();
    });

    const temperature = screen.getByLabelText('Temperatur (RAG)');
    expect(temperature).toHaveAttribute('min', '0');
    expect(temperature).toHaveAttribute('max', '2');

    const finalK = screen.getByLabelText('Final-K (finale Treffer)');
    expect(finalK).toHaveAttribute('min', '1');
    expect(finalK).toHaveAttribute('max', '20');
  });

  test('Speichern-Button ist ohne Änderungen deaktiviert', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Speichern/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Speichern/ })).toBeDisabled();
  });

  test('PATCH /rag/settings nur mit geänderter Teilmenge', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Final-K (finale Treffer)')).toBeInTheDocument();
    });

    const finalK = screen.getByLabelText('Final-K (finale Treffer)');
    fireEvent.change(finalK, { target: { value: '8' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/rag/settings',
        { rag_final_k: 8 },
        expect.any(Object)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
    });
  });

  test('leerer Basis-Prompt wird als leerer String gesendet (Reset auf Default)', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Basis-System-Prompt')).toBeInTheDocument();
    });

    const prompt = screen.getByLabelText('Basis-System-Prompt');
    fireEvent.change(prompt, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/rag/settings',
        { llm_base_system_prompt: '' },
        expect.any(Object)
      );
    });
  });

  test('Boolean-Switch wird in den PATCH-Body aufgenommen', async () => {
    render(<RagLlmSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Hybride Suche')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Hybride Suche'));

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/rag/settings',
        { rag_hybrid_search: false },
        expect.any(Object)
      );
    });
  });
});
