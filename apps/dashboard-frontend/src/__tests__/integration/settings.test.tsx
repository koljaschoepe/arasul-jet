/**
 * Integration tests for the Settings feature.
 *
 * Tests the Settings page as users experience it:
 *   - Section navigation (tabs)
 *   - General settings rendering
 *   - Theme toggle
 *   - Password management form validation
 *   - Logout actions
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../../features/settings/Settings';
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

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
  }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Helpers ----

function renderSettings(props: Partial<Parameters<typeof Settings>[0]> = {}) {
  const defaultProps = {
    handleLogout: vi.fn(),
    theme: 'dark' as string,
    onToggleTheme: vi.fn(),
  };

  return {
    ...defaultProps,
    ...render(
      <MemoryRouter>
        <Settings {...defaultProps} {...props} />
      </MemoryRouter>
    ),
  };
}

// ---- Tests ----

describe('Settings integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('renders all six section tabs', () => {
    renderSettings();

    // Each top-level tab appears in both mobile and desktop navigation.
    expect(screen.getAllByText('Allgemein').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('KI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sicherheit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Datenschutz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Fernzugriff').length).toBeGreaterThanOrEqual(1);

    // Old top-level tabs no longer exist as top-level nav items.
    expect(screen.queryByText('KI-Profil')).not.toBeInTheDocument();
    expect(screen.queryByText('RAG & LLM')).not.toBeInTheDocument();
    expect(screen.queryByText('Self-Healing')).not.toBeInTheDocument();
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

  it('switches sections on tab click', async () => {
    const user = userEvent.setup();
    renderSettings();

    // Click on Sicherheit tab
    const securityButtons = screen.getAllByText('Sicherheit');
    await user.click(securityButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Passwortverwaltung')).toBeInTheDocument();
    });
  });

  it('shows theme toggle in General settings', async () => {
    renderSettings({ theme: 'dark' });

    await waitFor(() => {
      expect(screen.getByText('Erscheinungsbild')).toBeInTheDocument();
    });

    expect(screen.getByText(/Dunkler Modus/)).toBeInTheDocument();
  });

  it('calls onToggleTheme when theme switch is clicked', async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    renderSettings({ onToggleTheme });

    await waitFor(() => {
      expect(screen.getByLabelText(/theme umschalten/i)).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText(/theme umschalten/i));

    expect(onToggleTheme).toHaveBeenCalled();
  });

  it('shows light mode label when theme is light', async () => {
    renderSettings({ theme: 'light' });

    await waitFor(() => {
      expect(screen.getByText(/Heller Modus/)).toBeInTheDocument();
    });
  });

  it('shows security section with password management and session controls', async () => {
    const user = userEvent.setup();
    renderSettings();

    const securityButtons = screen.getAllByText('Sicherheit');
    await user.click(securityButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Passwortverwaltung')).toBeInTheDocument();
      expect(screen.getByText('Sitzungen')).toBeInTheDocument();
    });
  });

  it('shows logout button in security section', async () => {
    const user = userEvent.setup();
    renderSettings();

    const securityButtons = screen.getAllByText('Sicherheit');
    await user.click(securityButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Abmelden')).toBeInTheDocument();
    });
  });

  it('calls handleLogout when logout button is clicked', async () => {
    const user = userEvent.setup();
    const handleLogout = vi.fn();
    renderSettings({ handleLogout });

    const securityButtons = screen.getAllByText('Sicherheit');
    await user.click(securityButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Abmelden')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Abmelden'));
    expect(handleLogout).toHaveBeenCalled();
  });

  it('shows password change form with service tabs', async () => {
    const user = userEvent.setup();
    renderSettings();

    const securityButtons = screen.getAllByText('Sicherheit');
    await user.click(securityButtons[0]!);

    await waitFor(() => {
      // Password management service tabs
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('MinIO')).toBeInTheDocument();
      expect(screen.getByText('n8n')).toBeInTheDocument();
    });
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

  it('renders Settings page title in sidebar', () => {
    renderSettings();

    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  it('opens the KI tab with its Firmenprofil / RAG & LLM sub-navigation', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByText('KI')[0]!);

    await waitFor(() => {
      // Sub-nav labels rendered by the (real) KISettings wrapper. "RAG & LLM"
      // also appears as a heading inside the RagLlmSettings leaf, so match >=1.
      expect(screen.getByText('Firmenprofil & Kontext')).toBeInTheDocument();
      expect(screen.getAllByText('RAG & LLM').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('opens the System tab with its Services / Updates / Self-Healing sub-navigation', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByText('System')[0]!);

    await waitFor(() => {
      // Sub-nav labels rendered by SystemSettings; leaf content may repeat them.
      expect(screen.getAllByText('Services').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Updates').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Self-Healing').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('deep-links via ?tab=system to the System tab', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=system']}>
        <Settings handleLogout={vi.fn()} theme="dark" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Self-Healing')).toBeInTheDocument();
    });
  });

  it('maps the legacy ?tab=selfhealing deep-link onto the System tab', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=selfhealing']}>
        <Settings handleLogout={vi.fn()} theme="dark" onToggleTheme={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Self-Healing')).toBeInTheDocument();
    });
  });
});
