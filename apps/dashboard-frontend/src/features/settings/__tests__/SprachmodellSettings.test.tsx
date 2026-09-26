/**
 * SprachmodellSettings: die Standardwerte, mit denen das Gerät ein Modell fragt.
 *
 * - Laden über GET /settings/sprachmodell (bis B4: /rag/settings, danach 404, J35)
 * - Rendern der Felder mit min/max aus dem Zod-Schema
 * - Speichern geänderter Felder über PATCH /settings/sprachmodell (nur Teilmenge)
 * - Reset des Basis-Prompts (leeres Feld)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../../contexts/ToastContext';
import type { ApiMethods } from '../../../hooks/useApi';
import { SprachmodellSettings } from '../SprachmodellSettings';

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
  llm_num_ctx_default: 8192,
  llm_keep_alive_seconds: 300,
  llm_num_predict_default: 2048,
  llm_base_system_prompt: 'Du bist ein hilfreicher Assistent.',
};

function mockGetSettings(settings = MOCK_SETTINGS) {
  mockApi.get.mockResolvedValue({ data: settings });
}

// SprachmodellSettings calls useToast, so renders need the real ToastProvider.
function renderSprachmodellSettings() {
  return render(
    <ToastProvider>
      <SprachmodellSettings />
    </ToastProvider>
  );
}

describe('SprachmodellSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings();
    mockApi.patch.mockResolvedValue({ data: MOCK_SETTINGS });
  });

  test('lädt Einstellungen von GET /settings/sprachmodell', async () => {
    renderSprachmodellSettings();

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/settings/sprachmodell', expect.any(Object));
    });
  });

  test('rendert die LLM-Felder mit geladenen Werten', async () => {
    renderSprachmodellSettings();

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

  test('spiegelt min/max aus dem Zod-Schema in den Zahlen-Inputs', async () => {
    renderSprachmodellSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Max. Tokens (LLM-Default)')).toBeInTheDocument();
    });

    const maxTokens = screen.getByLabelText('Max. Tokens (LLM-Default)');
    expect(maxTokens).toHaveAttribute('min', '64');
    expect(maxTokens).toHaveAttribute('max', '16384');
  });

  test('Speichern-Button ist ohne Änderungen deaktiviert', async () => {
    renderSprachmodellSettings();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Speichern/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Speichern/ })).toBeDisabled();
  });

  test('PATCH /settings/sprachmodell nur mit geänderter Teilmenge', async () => {
    renderSprachmodellSettings();

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
        '/settings/sprachmodell',
        { llm_keep_alive_seconds: 600 },
        expect.any(Object)
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
    });
  });

  test('leerer Basis-Prompt wird als leerer String gesendet (Reset auf Default)', async () => {
    renderSprachmodellSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Basis-System-Prompt')).toBeInTheDocument();
    });

    const prompt = screen.getByLabelText('Basis-System-Prompt');
    fireEvent.change(prompt, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/settings/sprachmodell',
        { llm_base_system_prompt: '' },
        expect.any(Object)
      );
    });
  });

  test('leeres Kontextfenster wird als NULL gesendet (Modell-Default)', async () => {
    renderSprachmodellSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Kontextfenster (LLM-Default)')).toBeInTheDocument();
    });

    const ctx = screen.getByLabelText('Kontextfenster (LLM-Default)');
    fireEvent.change(ctx, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: /Speichern/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/settings/sprachmodell',
        { llm_num_ctx_default: null },
        expect.any(Object)
      );
    });
  });
});
