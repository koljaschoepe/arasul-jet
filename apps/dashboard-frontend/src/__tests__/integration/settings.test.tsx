/**
 * Integration tests for the Settings feature.
 *
 * Tests the Settings page as users experience it:
 *   - Section navigation (tabs)
 *   - General settings rendering
 *   - Gerätezertifikat (Sicherheit)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../../features/settings/Settings';
import { SettingsPanel } from '../../features/workspace/sidebar/SettingsPanel';
import { useSettingsStore } from '../../stores/settingsStore';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';

// ---- Mocks ----

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Das Theme des Angemeldeten (Phase H1): es kommt aus dem Benutzer, nicht mehr
// aus dem `localStorage`. `benutzerAktualisieren` traegt die Antwort des
// Geraets zurueck, `mitTheme` sagt je Test, womit der Mensch hereinkommt.
let mitTheme: 'light' | 'dark' = 'light';
const benutzerAktualisieren = vi.fn((teil: { theme?: 'light' | 'dark' }) => {
  if (teil.theme) mitTheme = teil.theme;
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', theme: mitTheme },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
    benutzerAktualisieren,
  }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Helpers ----

// After the B4 refactor the section list lives in the sidebar (`SettingsPanel`)
// and drives the Settings tab through the shared `settingsStore`. We render both
// together so a click in the panel switches the section shown in the tab —
// exactly how it works in the real workspace shell.
function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPanel />
      <Settings />
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('Settings integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mitTheme = 'light';
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    // Reset the shared active-section store so section state never leaks between
    // tests (the store is a module-level singleton).
    useSettingsStore.setState({ activeSection: 'general' });
    // Default: return system info for General settings tab
    vi.mocked(mockApi.get).mockImplementation((path: string) => {
      if (path === '/system/info') {
        return Promise.resolve({
          version: '2.1.0',
          hostname: 'arasul-orin',
          jetpack_version: '6.2',
          uptime_seconds: 86400,
          build_hash: 'abc123',
        });
      }
      if (path === '/settings/password-requirements') {
        return Promise.resolve({
          requirements: {
            minLength: 4,
            requireUppercase: false,
            requireLowercase: false,
            requireNumbers: false,
            requireSpecialChars: false,
          },
        });
      }
      return Promise.resolve({});
    });
  });

  it('lists all six sections in the sidebar panel', () => {
    renderSettings();

    // The section list now lives in the sidebar panel (SettingsPanel).
    expect(screen.getByTestId('settings-open-general')).toBeInTheDocument();
    expect(screen.getByTestId('settings-open-ki')).toBeInTheDocument();
    expect(screen.getByTestId('settings-open-security')).toBeInTheDocument();
    expect(screen.getByTestId('settings-open-privacy')).toBeInTheDocument();
    expect(screen.getByTestId('settings-open-system')).toBeInTheDocument();
    expect(screen.getByTestId('settings-open-remote-access')).toBeInTheDocument();

    // Their labels render too.
    expect(screen.getAllByText('Allgemein').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('KI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sicherheit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Datenschutz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Fernzugriff').length).toBeGreaterThanOrEqual(1);

    // Old top-level tabs no longer exist as nav items (general is active, so the
    // KI / System sub-section labels are not mounted).
    // (Nach Kennung und nicht nach Text: „Selbstheilung“ steht seit J35 in
    // der Begriffsliste unter Allgemein.)
    expect(screen.queryByTestId('settings-open-ai-profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-open-rag-llm')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-open-selfhealing')).not.toBeInTheDocument();
    expect(screen.queryByText('KI-Profil')).not.toBeInTheDocument();
    expect(screen.queryByText('Sprachmodell')).not.toBeInTheDocument();
  });

  it('shows General section by default', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Systeminformationen')).toBeInTheDocument();
    });
  });

  it('displays system info after loading', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText('2.1.0')).toBeInTheDocument();
      expect(screen.getByText('arasul-orin')).toBeInTheDocument();
    });
  });

  it('switches sections on sidebar click', async () => {
    const user = userEvent.setup();
    renderSettings();

    // Click the Sicherheit entry in the sidebar panel.
    await user.click(screen.getByTestId('settings-open-security'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Gerätezertifikat' })).toBeInTheDocument();
    });
    // Passwort und Abmelden sind persönlich und stehen in den Einstellungen.
    expect(screen.queryByText('Passwort')).not.toBeInTheDocument();
    expect(screen.queryByText('Sitzungen')).not.toBeInTheDocument();
  });

  it('zeigt das Erscheinungsbild nicht mehr hier: es ist persönlich', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('arasul-orin')).toBeInTheDocument();
    });
    expect(screen.queryByText('Erscheinungsbild')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows loading skeleton while fetching system info', () => {
    // Make the API hang
    vi.mocked(mockApi.get).mockReturnValue(new Promise(() => {}));

    renderSettings();

    // The skeleton is shown while loading - "Allgemein" appears in nav tabs AND heading
    expect(screen.getAllByText('Allgemein').length).toBeGreaterThanOrEqual(1);
    // Detailed data should not be present
    expect(screen.queryByText('2.1.0')).not.toBeInTheDocument();
  });

  it('shows error state when system info fails to load', async () => {
    vi.mocked(mockApi.get).mockImplementation((path: string) => {
      if (path === '/system/info') {
        return Promise.reject(new Error('Connection refused'));
      }
      return Promise.resolve({});
    });

    renderSettings();

    await waitFor(() => {
      expect(
        screen.getByText(/systeminformationen konnten nicht geladen werden/i)
      ).toBeInTheDocument();
    });
  });

  it('renders the Verwaltung title in the sidebar panel', () => {
    renderSettings();
    expect(screen.getAllByText('Verwaltung').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the KI tab straight on the Sprachmodell settings (J35)', async () => {
    const user = userEvent.setup();
    vi.mocked(mockApi.get).mockImplementation((path: string) => {
      if (path === '/settings/sprachmodell') {
        return Promise.resolve({
          data: {
            llm_num_predict_default: 2048,
            llm_num_ctx_default: null,
            llm_keep_alive_seconds: 3600,
            llm_base_system_prompt: null,
          },
        });
      }
      return Promise.resolve({});
    });
    renderSettings();

    await user.click(screen.getByTestId('settings-open-ki'));

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/settings/sprachmodell', expect.any(Object));
      expect(screen.getByLabelText('Max. Tokens (LLM-Default)')).toHaveValue(2048);
    });
    // Das Firmenprofil hing an Wegen, die mit B4 gefallen sind.
    expect(screen.queryByText('Firmenprofil & Kontext')).not.toBeInTheDocument();
    expect(mockApi.get).not.toHaveBeenCalledWith('/memory/profile', expect.anything());
  });

  it('opens the System tab with its Dienste / Aktualisierungen / Selbstheilung sub-navigation', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId('settings-open-system'));

    await waitFor(() => {
      // Sub-nav labels rendered by SystemSettings; leaf content may repeat them.
      expect(screen.getAllByText('Dienste').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Aktualisierungen').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Selbstheilung').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('deep-links via ?tab=system to the System tab', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=system']}>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Selbstheilung')).toBeInTheDocument();
    });
  });

  it('maps the legacy ?tab=selfhealing deep-link onto the System tab with the Selbstheilung sub-section active', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=selfhealing']}>
        <Settings />
      </MemoryRouter>
    );

    await waitFor(() => {
      // "Selbstheilung" appears both as the active sub-nav tab and as the
      // heading of the mounted SelfHealingEvents section. Seit Plan 023 C1 ist
      // die Unterleiste eine echte Tab-Leiste (FilterBar), vorher eine nav mit
      // aria-current="page".
      expect(screen.getByRole('tab', { name: 'Selbstheilung' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getAllByText('Selbstheilung').length).toBeGreaterThanOrEqual(2);
    });
  });
});
