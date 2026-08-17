/**
 * RagLlmSettings Component Tests
 *
 * Tests für RagLlmSettings (Plan 021: agentic RAG — nur noch LLM-Standardwerte):
 * - Laden der Tunables via GET /rag/settings
 * - Rendern der LLM-Felder mit min/max aus dem Zod-Schema
 * - KEINE Retrieval-/Space-Routing-/Vektor-Regler mehr
 * - Speichern geänderter Felder via PATCH /rag/settings (nur Teilmenge)
 * - Reset des Basis-Prompts (leeres Feld)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../../contexts/ToastContext';
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

// Das Backend liefert weiterhin alle Spalten; die Oberfläche liest nur die
// LLM-Werte. Die Vektor-/Retrieval-Spalten sind hier bewusst mit dabei, um zu
// belegen, dass sie NICHT gerendert werden.
const MOCK_SETTINGS = {
  rag_temperature: 0.7,
  rag_num_predict: 1024,
  rag_top_k: 20,
  rag_final_k: 5,
  rag_hybrid_search: true,
  rag_rerank_enabled: true,
  llm_num_ctx_default: 8192,
  llm_keep_alive_seconds: 300,
  llm_num_predict_default: 2048,
  llm_base_system_prompt: 'Du bist ein hilfreicher Assistent.',
};

function mockGetSettings(settings = MOCK_SETTINGS) {
  mockApi.get.mockResolvedValue({ data: settings });
}

// RagLlmSettings calls useToast, so renders need the real ToastProvider.
function renderRagLlmSettings() {
  return render(
    <ToastProvider>
      <RagLlmSettings />
    </ToastProvider>
  );
}

describe('RagLlmSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings();
    mockApi.patch.mockResolvedValue({ data: MOCK_SETTINGS });
  });

  test('lädt Einstellungen von GET /rag/settings', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/rag/settings', expect.any(Object));
    });
  });

  test('rendert die LLM-Felder mit geladenen Werten', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByText('LLM-Standardwerte')).toBeInTheDocument();
    });

    expect(screen.getByText('Basis-System-Prompt')).toBeInTheDocument();

    expect(screen.getByLabelText('Max. Tokens (LLM-Default)')).toHaveValue(2048);
    expect(screen.getByLabelText('Keep-Alive (Sekunden)')).toHaveValue(300);
    expect(screen.getByLabelText('Basis-System-Prompt')).toHaveValue(
      'Du bist ein hilfreicher Assistent.'
    );
  });

  test('zeigt KEINE Vektor-/Retrieval-Regler mehr (agentic RAG)', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByText('LLM-Standardwerte')).toBeInTheDocument();
    });

    expect(screen.queryByText('Retrieval')).not.toBeInTheDocument();
    expect(screen.queryByText('Space-Routing')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Temperatur (RAG)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Final-K (finale Treffer)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hybride Suche')).not.toBeInTheDocument();
  });

  test('spiegelt min/max aus dem Zod-Schema in den Zahlen-Inputs', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Max. Tokens (LLM-Default)')).toBeInTheDocument();
    });

    const maxTokens = screen.getByLabelText('Max. Tokens (LLM-Default)');
    expect(maxTokens).toHaveAttribute('min', '64');
    expect(maxTokens).toHaveAttribute('max', '16384');
  });

  test('Speichern-Button ist ohne Änderungen deaktiviert', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Speichern/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Speichern/ })).toBeDisabled();
  });

  test('PATCH /rag/settings nur mit geänderter Teilmenge', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Keep-Alive (Sekunden)')).toBeInTheDocument();
    });

    const keepAlive = screen.getByLabelText('Keep-Alive (Sekunden)');
    fireEvent.change(keepAlive, { target: { value: '600' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/rag/settings',
        { llm_keep_alive_seconds: 600 },
        expect.any(Object)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
    });
  });

  test('leerer Basis-Prompt wird als leerer String gesendet (Reset auf Default)', async () => {
    renderRagLlmSettings();

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

  test('leeres Kontextfenster wird als NULL gesendet (Modell-Default)', async () => {
    renderRagLlmSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Kontextfenster (LLM-Default)')).toBeInTheDocument();
    });

    const ctx = screen.getByLabelText('Kontextfenster (LLM-Default)');
    fireEvent.change(ctx, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/rag/settings',
        { llm_num_ctx_default: null },
        expect.any(Object)
      );
    });
  });
});
