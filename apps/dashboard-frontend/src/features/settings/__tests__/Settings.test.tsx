/**
 * Settings shell tests.
 *
 * After the Settings refactor the page is a thin shell around 6 top-level tabs
 * (Allgemein · KI · Sicherheit · Datenschutz · System · Fernzugriff) driven by a
 * `?tab=` search param. These tests focus on the shell contract:
 *   - the six tabs render with the correct labels (old labels are gone),
 *   - clicking a tab mounts the right section,
 *   - `?tab=` deep-links (incl. legacy ids) resolve to the right tab,
 *   - the KI and System tabs expose their internal sub-navigation.
 *
 * The heavy leaf components (which each do their own data fetching) are mocked
 * with lightweight stubs so the shell can be tested in isolation. The detailed
 * behaviour of AIProfileSettings lives in its own AIProfileSettings.test.tsx.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../Settings';

// useApi is only used by the shell for the "logout everywhere" action, which
// these tests don't exercise — a no-op mock keeps it from touching the network.
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// ---- Leaf component stubs ----
// Each stub renders a testid so we can assert which section is mounted without
// pulling in the real component's data fetching. AIProfileSettings / RagLlmSettings
// / the System leaves stay stubbed so KISettings + SystemSettings still render
// their *own* sub-navigation (kept real).

function stub(testId: string, label: string) {
  const Stub = () => React.createElement('div', { 'data-testid': testId }, label);
  Stub.displayName = `Stub(${testId})`;
  return Stub;
}

vi.mock('../GeneralSettings', () => ({ GeneralSettings: stub('general-settings', 'General') }));
vi.mock('../SecuritySettings', () => ({ SecuritySettings: stub('security-settings', 'Security') }));
vi.mock('../PrivacySettings', () => ({ PrivacySettings: stub('privacy-settings', 'Privacy') }));
vi.mock('../RemoteAccessSettings', () => ({
  RemoteAccessSettings: stub('remote-access-settings', 'Remote Access'),
}));
// Leaves inside the (real) KISettings wrapper.
vi.mock('../AIProfileSettings', () => ({
  AIProfileSettings: stub('ai-profile-settings', 'Profile'),
}));
vi.mock('../RagLlmSettings', () => ({ RagLlmSettings: stub('rag-llm-settings', 'RAG') }));
// Leaves inside the (real) SystemSettings wrapper.
vi.mock('../../system/SystemStatus', () => ({ SystemStatus: stub('system-status', 'Status') }));
vi.mock('../../system/ServicesSettings', () => ({
  ServicesSettings: stub('services-settings', 'Services'),
}));
vi.mock('../../system/UpdatePage', () => ({ default: stub('update-page', 'Updates') }));
vi.mock('../../system/SelfHealingEvents', () => ({
  default: stub('selfhealing-events', 'Self-Healing'),
}));

function renderSettings(route = '/settings') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Settings handleLogout={vi.fn()} theme="light" onToggleTheme={vi.fn()} />
    </MemoryRouter>
  );
}

describe('Settings shell', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Layout and navigation', () => {
    test('renders the settings shell header', () => {
      renderSettings();
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.getByText('System-Konfiguration')).toBeInTheDocument();
    });

    test('renders all six top-level tabs with the new labels', () => {
      renderSettings();
      // Each label appears in both the mobile and desktop nav.
      for (const label of [
        'Allgemein',
        'KI',
        'Sicherheit',
        'Datenschutz',
        'System',
        'Fernzugriff',
      ]) {
        expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      }
    });

    test('no longer shows the old top-level tabs', () => {
      renderSettings();
      expect(screen.queryByText('KI-Profil')).not.toBeInTheDocument();
      expect(screen.queryByText('RAG & LLM')).not.toBeInTheDocument();
      expect(screen.queryByText('Self-Healing')).not.toBeInTheDocument();
    });

    test('starts on the Allgemein (general) section by default', () => {
      renderSettings();
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });

    test('shows section descriptions in the desktop sidebar', () => {
      renderSettings();
      expect(screen.getByText('Systeminformationen und Konfiguration')).toBeInTheDocument();
      expect(screen.getByText('Passwörter und Zugriffsverwaltung')).toBeInTheDocument();
    });
  });

  describe('Tab switching', () => {
    test('clicking Sicherheit mounts the security section', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('Sicherheit')[0]!);
      expect(screen.getByTestId('security-settings')).toBeInTheDocument();
    });

    test('clicking Datenschutz mounts the privacy section', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('Datenschutz')[0]!);
      expect(screen.getByTestId('privacy-settings')).toBeInTheDocument();
    });

    test('clicking Fernzugriff mounts the remote-access section', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('Fernzugriff')[0]!);
      expect(screen.getByTestId('remote-access-settings')).toBeInTheDocument();
    });

    test('marks the active tab', async () => {
      const user = userEvent.setup();
      renderSettings();

      // Allgemein is active initially (desktop sidebar button carries bg-muted).
      const allgemeinBtn = screen
        .getAllByText('Allgemein')
        .map(el => el.closest('button'))
        .find(btn => btn?.classList.contains('bg-muted'));
      expect(allgemeinBtn).toBeTruthy();

      await user.click(screen.getAllByText('Sicherheit')[0]!);

      const activeSecurityBtn = screen
        .getAllByText('Sicherheit')
        .map(el => el.closest('button'))
        .find(btn => btn?.classList.contains('bg-muted'));
      expect(activeSecurityBtn).toBeTruthy();
      expect(allgemeinBtn).not.toHaveClass('bg-muted');
    });
  });

  describe('KI tab', () => {
    test('mounts the KI wrapper with its Firmenprofil / RAG & LLM sub-navigation', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('KI')[0]!);

      await waitFor(() => {
        expect(screen.getByText('Firmenprofil & Kontext')).toBeInTheDocument();
        expect(screen.getByText('RAG & LLM')).toBeInTheDocument();
      });
      // Profile sub-section is shown by default.
      expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
    });

    test('switches to the RAG & LLM sub-section', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('KI')[0]!);
      await user.click(screen.getByText('RAG & LLM'));

      // Both sub-sections stay mounted; RAG becomes visible.
      expect(screen.getByTestId('rag-llm-settings')).toBeInTheDocument();
      expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
    });
  });

  describe('System tab', () => {
    test('mounts the System wrapper with its Services / Updates / Self-Healing sub-navigation', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('System')[0]!);

      await waitFor(() => {
        // Sub-nav label + stubbed leaf content can both carry the same text,
        // so assert at-least-one match.
        expect(screen.getAllByText('Services').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Updates').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Self-Healing').length).toBeGreaterThanOrEqual(1);
      });
      // System-Status sub-section is mounted by default (Plan 008).
      expect(screen.getByTestId('system-status')).toBeInTheDocument();
    });

    test('switches sub-sections within System (only active one mounted)', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getAllByText('System')[0]!);
      await user.click(screen.getByText('Self-Healing'));

      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      // System mounts only the active sub-section.
      expect(screen.queryByTestId('services-settings')).not.toBeInTheDocument();
    });
  });

  describe('Deep-linking via ?tab=', () => {
    test('?tab=system opens the System tab', async () => {
      renderSettings('/settings?tab=system');
      await waitFor(() => {
        expect(screen.getByTestId('system-status')).toBeInTheDocument();
      });
    });

    test('?tab=ki opens the KI tab', async () => {
      renderSettings('/settings?tab=ki');
      await waitFor(() => {
        expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
      });
    });

    test('legacy ?tab=selfhealing maps onto the System tab with the Self-Healing sub-section active', async () => {
      renderSettings('/settings?tab=selfhealing');
      await waitFor(() => {
        expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
      });
      // The deep link lands directly on the Self-Healing sub-tab, so the
      // default Services sub-section is not mounted.
      expect(screen.queryByTestId('services-settings')).not.toBeInTheDocument();
    });

    test('legacy ?tab=ai-profile maps onto the KI tab', async () => {
      renderSettings('/settings?tab=ai-profile');
      await waitFor(() => {
        expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
      });
    });

    test('unknown ?tab= falls back to the general section', () => {
      renderSettings('/settings?tab=does-not-exist');
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('navigation items are focusable', () => {
      renderSettings();
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(btn => {
        btn.focus();
        expect(document.activeElement).toBe(btn);
      });
    });
  });
});
