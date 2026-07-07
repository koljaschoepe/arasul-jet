/**
 * AIProfileSettings tests.
 *
 * These port the detailed profile/company-context cases that used to live inside
 * the old Settings.test.tsx, adapted to the refactored behaviour:
 *   - success feedback is now a toast (useToast().success), not an inline Alert,
 *   - the save button is a shadcn <Button loading> (no literal "Speichern..." —
 *     assert `disabled` / `aria-busy` instead),
 *   - a real backend load failure now surfaces a loadError state with a retry
 *     (it no longer silently falls back to the default template),
 *   - Firmenprofil, Zusatzkontext and KI-Verhalten all render on one page.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIProfileSettings } from '../AIProfileSettings';

// ---- Mocks ----

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
};

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
}));

const CONTEXT_PLACEHOLDER = 'Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...';

/**
 * Wire up api.get for the two GETs the component makes on mount.
 * `profile` is the YAML string (or null), `context` the company-context payload.
 */
function mockLoad(
  profile: string | null = null,
  context: { content?: string | null; updated_at?: string | null } = {
    content: '',
    updated_at: null,
  }
) {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/memory/profile') return Promise.resolve({ profile });
    if (path === '/settings/company-context') return Promise.resolve(context);
    return Promise.resolve({});
  });
}

function getTextarea() {
  return screen.getByPlaceholderText<HTMLTextAreaElement>(CONTEXT_PLACEHOLDER);
}

function getSaveButton() {
  return screen.getByRole('button', { name: /speichern/i });
}

describe('AIProfileSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockApi.put.mockResolvedValue({ updated_at: null });
  });

  describe('Loading', () => {
    test('shows a skeleton while the profile is loading', () => {
      // Never resolves → stays in loading state.
      mockApi.get.mockImplementation(() => new Promise(() => {}));
      render(<AIProfileSettings />);

      // Skeleton uses animate-pulse; the KI-Profil title is shown during loading.
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(screen.getByText('KI-Profil')).toBeInTheDocument();
    });

    test('loads the profile from the backend', async () => {
      mockLoad('firma: "Test GmbH"\nbranche: "IT & Software"', {
        content: '# Test Kontext',
        updated_at: '2024-01-15T10:00:00Z',
      });
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test GmbH')).toBeInTheDocument();
      });
    });

    test('falls back to the default context template when none is stored', async () => {
      mockLoad(null, { content: null, updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(getTextarea().value).toContain('Zusätzlicher Kontext');
      });
    });
  });

  describe('Editing', () => {
    test('allows editing the context content', async () => {
      mockLoad(null, { content: 'Initial content', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial content'));

      fireEvent.change(getTextarea(), { target: { value: 'New content' } });
      expect(getTextarea().value).toBe('New content');
    });

    test('shows the unsaved-changes indicator when dirty', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial modified' } });

      expect(screen.getByText('Ungespeicherte Änderungen')).toBeInTheDocument();
    });

    test('enables the save button only when there are changes', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => expect(getSaveButton()).toBeDisabled());

      fireEvent.change(getTextarea(), { target: { value: 'Initial changed' } });
      expect(getSaveButton()).not.toBeDisabled();
    });

    test('reports the dirty state via onDirtyChange', async () => {
      const onDirtyChange = vi.fn();
      mockLoad(null, { content: 'Initial', updated_at: null });
      render(<AIProfileSettings onDirtyChange={onDirtyChange} />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial changed' } });

      await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    });
  });

  describe('Saving', () => {
    test('saves the context and shows a success toast', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      mockApi.put.mockResolvedValue({ updated_at: '2024-01-16T12:00:00Z' });
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial updated' } });
      fireEvent.click(getSaveButton());

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(
          '/settings/company-context',
          { content: 'Initial updated' },
          expect.any(Object)
        );
        expect(mockToast.success).toHaveBeenCalledWith('KI-Profil erfolgreich gespeichert');
      });
      // No inline success message — feedback is a toast now.
      expect(screen.queryByText(/erfolgreich gespeichert/i)).not.toBeInTheDocument();
    });

    test('marks the save button busy while saving (no "Speichern..." text)', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      // PUT never resolves → stays in the saving state.
      mockApi.put.mockImplementation(() => new Promise(() => {}));
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial changed' } });

      const saveButton = getSaveButton();
      fireEvent.click(saveButton);

      await waitFor(() => {
        // shadcn <Button loading> disables and sets aria-busy — there is no
        // literal "Speichern..." label anymore.
        expect(saveButton).toBeDisabled();
        expect(saveButton).toHaveAttribute('aria-busy', 'true');
      });
      expect(screen.queryByText('Speichern...')).not.toBeInTheDocument();
    });

    test('shows an error toast on a save failure', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      mockApi.put.mockRejectedValue(
        Object.assign(new Error('Server error'), { message: 'Server error' })
      );
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial changed' } });
      fireEvent.click(getSaveButton());

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
      expect(mockToast.error.mock.calls[0]![0]).toContain('Server error');
    });

    test('surfaces a network error via toast', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      mockApi.put.mockRejectedValue(new Error('Network error'));
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(getTextarea(), { target: { value: 'Initial changed' } });
      fireEvent.click(getSaveButton());

      await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
      expect(mockToast.error.mock.calls[0]![0]).toContain('Network error');
    });

    test('shows a per-field validation error from the backend', async () => {
      mockLoad(null, { content: 'Initial', updated_at: null });
      // Force a profile change so the /memory/profile POST runs and fails.
      mockApi.post.mockRejectedValue(
        Object.assign(new Error('Validation failed'), {
          details: { issues: [{ path: 'companyName', message: 'Firmenname ist erforderlich' }] },
        })
      );
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea().value).toBe('Initial'));
      fireEvent.change(screen.getByPlaceholderText('z.B. Muster GmbH'), {
        target: { value: 'Neue Firma' },
      });
      fireEvent.click(getSaveButton());

      await waitFor(() => {
        expect(screen.getByText('Firmenname ist erforderlich')).toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('z.B. Muster GmbH')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });
  });

  describe('Load error handling', () => {
    test('shows an error state with a retry when the load genuinely fails', async () => {
      mockApi.get.mockRejectedValue(new Error('Fetch failed'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByText(/KI-Profil konnte nicht geladen werden/)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /erneut versuchen/i })).toBeInTheDocument();
      consoleError.mockRestore();
    });

    test('retries the load when "Erneut versuchen" is clicked', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockApi.get.mockRejectedValue(new Error('Fetch failed'));
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /erneut versuchen/i })).toBeInTheDocument();
      });

      // Second attempt succeeds.
      mockLoad('firma: "Recovered GmbH"', { content: 'ctx', updated_at: null });
      await user.click(screen.getByRole('button', { name: /erneut versuchen/i }));

      await waitFor(() => {
        expect(screen.getByDisplayValue('Recovered GmbH')).toBeInTheDocument();
      });
      consoleError.mockRestore();
    });
  });

  describe('Sections and fields', () => {
    test('renders the three profile sections', async () => {
      mockLoad(null, { content: '', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByText('Firmenprofil')).toBeInTheDocument();
      });
      expect(screen.getByText('Zusatzkontext')).toBeInTheDocument();
      expect(screen.getByText('KI-Verhalten')).toBeInTheDocument();
    });

    test('shows the KI-Verhalten options', async () => {
      mockLoad(null, { content: '', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByText('Antwortlänge')).toBeInTheDocument();
      });
      expect(screen.getByText('Formalität')).toBeInTheDocument();
    });

    test('does not show a Teamgröße field', async () => {
      mockLoad(null, { content: '', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => expect(screen.getByText('Firmenprofil')).toBeInTheDocument());
      expect(screen.queryByText('Teamgröße')).not.toBeInTheDocument();
    });

    test('shows "Zuletzt aktualisiert" when a timestamp is present', async () => {
      mockLoad(null, { content: 'Content', updated_at: '2024-01-15T10:30:00Z' });
      render(<AIProfileSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Zuletzt aktualisiert/)).toBeInTheDocument();
      });
    });

    test('the context textarea exposes its placeholder', async () => {
      mockLoad(null, { content: '', updated_at: null });
      render(<AIProfileSettings />);

      await waitFor(() => expect(getTextarea()).toBeInTheDocument());
    });
  });
});
