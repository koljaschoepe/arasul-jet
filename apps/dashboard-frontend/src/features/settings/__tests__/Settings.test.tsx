/**
 * Settings shell tests.
 *
 * After the B4 refactor the section list moved OUT of the Settings tab and into
 * the left workspace sidebar (`SettingsPanel`). The active section now lives in
 * a shared zustand store (`settingsStore`); the Settings tab renders only a
 * header (Mascot + "Einstellungen" + the active section label) plus the active
 * section's content — there is no second "tab in a tab" column anymore.
 *
 * These tests therefore split the contract across the two owners:
 *   - the six sections (labels + descriptions) render in `SettingsPanel`,
 *   - clicking a section in `SettingsPanel` sets the store and mounts the right
 *     section content in `Settings`,
 *   - `?tab=` deep-links (incl. legacy ids) resolve to the right section,
 *   - the KI and System sections expose their internal sub-navigation.
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
import { SettingsPanel } from '../../workspace/sidebar/SettingsPanel';
import { SETTINGS_SECTIONS } from '../sections';
import { useSettingsStore } from '@/stores/settingsStore';

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
  ServicesSettings: stub('services-settings', 'Dienste'),
}));
vi.mock('../../system/UpdatePage', () => ({ default: stub('update-page', 'Aktualisierungen') }));
vi.mock('../../system/SelfHealingEvents', () => ({
  default: stub('selfhealing-events', 'Selbstheilung'),
}));

// Renders the Settings tab on its own (used for deep-links and default state —
// the section is driven by the store / `?tab=` search param, not by clicking).
function renderSettings(route = '/settings') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Settings handleLogout={vi.fn()} />
    </MemoryRouter>
  );
}

// Renders the sidebar section list (`SettingsPanel`) alongside the Settings tab.
// Both share the `settingsStore`, so clicking a section in the panel drives the
// content shown in the tab — exactly how it works in the real workspace shell.
function renderShell(route = '/settings') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SettingsPanel />
      <Settings handleLogout={vi.fn()} />
    </MemoryRouter>
  );
}

describe('Settings shell', () => {
  beforeEach(() => {
    // The active-section store is a module-level singleton — reset it so section
    // state from one test never leaks into the next.
    useSettingsStore.setState({ activeSection: 'general' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Layout and navigation', () => {
    test('der Rahmen nennt den Bereich nicht ein zweites Mal', () => {
      // Seit Plan 023 C2 ist der Rahmen bleibende Umgebung, keine Ueberschrift:
      // vorher stand hier ein h2 "Einstellungen" mit dem Bereichsnamen darunter,
      // und vierzig Pixel tiefer derselbe Name noch einmal als h1 des Bereichs.
      renderSettings();
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Einstellungen' })).toBeNull();
      expect(screen.queryByText('Allgemein')).toBeNull();
    });

    test('the sidebar panel lists all six sections with the new labels', () => {
      render(<SettingsPanel />);
      for (const section of SETTINGS_SECTIONS) {
        expect(screen.getByTestId(`settings-open-${section.id}`)).toBeInTheDocument();
        expect(screen.getByText(section.label)).toBeInTheDocument();
      }
    });

    test('no longer shows the old top-level tabs', () => {
      renderShell();
      expect(screen.queryByText('KI-Profil')).not.toBeInTheDocument();
      // "Sprachmodell" / "Selbstheilung" only appear once their section is active.
      expect(screen.queryByText('Sprachmodell')).not.toBeInTheDocument();
      expect(screen.queryByText('Selbstheilung')).not.toBeInTheDocument();
    });

    test('starts on the Allgemein (general) section by default', () => {
      renderSettings();
      expect(screen.getByTestId('general-settings')).toBeInTheDocument();
    });

    test('shows section descriptions in the sidebar panel', () => {
      render(<SettingsPanel />);
      // Descriptions come from SETTINGS_SECTIONS (the single source of truth).
      const general = SETTINGS_SECTIONS.find(s => s.id === 'general')!;
      const security = SETTINGS_SECTIONS.find(s => s.id === 'security')!;
      expect(screen.getByText(general.description)).toBeInTheDocument();
      expect(screen.getByText(security.description)).toBeInTheDocument();
    });
  });

  describe('Section switching (via the sidebar panel)', () => {
    test('clicking Sicherheit mounts the security section', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-security'));
      expect(screen.getByTestId('security-settings')).toBeInTheDocument();
    });

    test('clicking Datenschutz mounts the privacy section', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-privacy'));
      expect(screen.getByTestId('privacy-settings')).toBeInTheDocument();
    });

    test('clicking Fernzugriff mounts the remote-access section', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-remote-access'));
      expect(screen.getByTestId('remote-access-settings')).toBeInTheDocument();
    });

    test('marks the active section in the panel', async () => {
      const user = userEvent.setup();
      renderShell();

      // Allgemein is active initially (aria-current on the panel button).
      const allgemeinBtn = screen.getByTestId('settings-open-general');
      expect(allgemeinBtn).toHaveAttribute('aria-current', 'true');

      await user.click(screen.getByTestId('settings-open-security'));

      expect(screen.getByTestId('settings-open-security')).toHaveAttribute('aria-current', 'true');
      expect(allgemeinBtn).not.toHaveAttribute('aria-current');
    });
  });

  describe('KI section', () => {
    test('mounts the KI wrapper with its Firmenprofil / Sprachmodell sub-navigation', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-ki'));

      await waitFor(() => {
        expect(screen.getByText('Firmenprofil & Kontext')).toBeInTheDocument();
        expect(screen.getByText('Sprachmodell')).toBeInTheDocument();
      });
      // Profile sub-section is shown by default.
      expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
    });

    test('switches to the Sprachmodell sub-section', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-ki'));
      await user.click(screen.getByText('Sprachmodell'));

      // Both sub-sections stay mounted; RAG becomes visible.
      expect(screen.getByTestId('rag-llm-settings')).toBeInTheDocument();
      expect(screen.getByTestId('ai-profile-settings')).toBeInTheDocument();
    });
  });

  describe('System section', () => {
    test('mounts the System wrapper with its Dienste / Aktualisierungen / Selbstheilung sub-navigation', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-system'));

      await waitFor(() => {
        // Sub-nav label + stubbed leaf content can both carry the same text,
        // so assert at-least-one match.
        expect(screen.getAllByText('Dienste').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Aktualisierungen').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Selbstheilung').length).toBeGreaterThanOrEqual(1);
      });
      // System-Status sub-section is mounted by default (Plan 008).
      expect(screen.getByTestId('system-status')).toBeInTheDocument();
    });

    test('switches sub-sections within System (only active one mounted)', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByTestId('settings-open-system'));
      await user.click(screen.getByText('Selbstheilung'));

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
    test('section navigation items are focusable', () => {
      render(<SettingsPanel />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(btn => {
        btn.focus();
        expect(document.activeElement).toBe(btn);
      });
    });
  });
});
