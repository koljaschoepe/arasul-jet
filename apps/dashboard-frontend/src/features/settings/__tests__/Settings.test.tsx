/**
 * Settings Component Tests
 *
 * Tests für die Settings-Komponente:
 * - Tab-Navigation (6 Tabs: General, KI-Profil, Sicherheit, Services, Updates, Self-Healing)
 * - General Settings mit Live System-Info
 * - KI-Profil (merged: Profile + Company Context)
 * - Error Handling
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../../contexts/ToastContext';
import Settings from '../Settings';

// Mock AuthContext - useApi now requires AuthProvider
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

// Mock child components that are rendered conditionally
vi.mock('../../system/UpdatePage', () => ({
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'update-page' }, 'Update Page Content');
  },
}));
vi.mock('../../system/SelfHealingEvents', () => ({
  default: () => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'selfhealing-events' },
      'Self-Healing Events Content'
    );
  },
}));
vi.mock('../PasswordManagement', () => ({
  default: () => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'password-management' },
      'Password Management Content'
    );
  },
}));

const MOCK_SYSTEM_INFO = {
  version: '1.2.0',
  hostname: 'arasul-jetson',
  jetpack_version: '6.2',
  uptime_seconds: 86520,
  build_hash: 'abc1234',
  timestamp: '2026-03-08T10:00:00Z',
};

// Helper: mock fetch for system info
function mockSystemInfoFetch(systemInfo = MOCK_SYSTEM_INFO) {
  global.fetch.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/system/info')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(systemInfo),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

// Helper: mock fetch for both profile + context + system info APIs
function mockProfileAndContextFetch(profileData = null, contextData = { content: '', updated_at: null }) {
  global.fetch.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/system/info')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_SYSTEM_INFO),
      });
    }
    if (typeof url === 'string' && url.includes('/memory/profile')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ profile: profileData }),
      });
    }
    if (typeof url === 'string' && url.includes('/settings/company-context')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(contextData),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

describe('Settings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =====================================================
  // Main Layout and Navigation
  // =====================================================
  describe('Layout and Navigation', () => {
    test('rendert Settings Layout korrekt', () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.getByText('System-Konfiguration')).toBeInTheDocument();
    });

    test('zeigt alle Navigation-Items', () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      const nav = document.querySelector('.settings-nav');
      expect(nav).toBeInTheDocument();

      const navLabels = document.querySelectorAll('.settings-nav-item-label');
      const labelTexts = Array.from(navLabels).map(el => el.textContent);

      expect(labelTexts).toContain('General');
      expect(labelTexts).toContain('KI-Profil');
      expect(labelTexts).toContain('Sicherheit');
      expect(labelTexts).toContain('Services');
      expect(labelTexts).toContain('Updates');
      expect(labelTexts).toContain('Self-Healing');
      // Removed tabs should not be present
      expect(labelTexts).not.toContain('Telegram');
      expect(labelTexts).not.toContain('Claude Terminal');
      expect(labelTexts).not.toContain('Security');
    });

    test('zeigt Beschreibungen für Navigation-Items', () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      const navDescriptions = document.querySelectorAll('.settings-nav-item-description');
      const descTexts = Array.from(navDescriptions).map(el => el.textContent);

      expect(descTexts).toContain('Systeminformationen und Konfiguration');
      expect(descTexts).toContain('Firmen- und KI-Verhalten konfigurieren');
      expect(descTexts).toContain('Passwörter und Zugriffsverwaltung');
    });

    test('startet mit General Section aktiv', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Systeminformationen')).toBeInTheDocument();
      });
      expect(screen.getByText('Platform Version')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Tab Navigation
  // =====================================================
  describe('Tab Navigation', () => {
    test('wechselt zu Updates Section', async () => {
      const user = userEvent.setup();
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await user.click(screen.getByText('Updates'));

      expect(screen.getByTestId('update-page')).toBeInTheDocument();
    });

    test('wechselt zu Self-Healing Section', async () => {
      const user = userEvent.setup();
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await user.click(screen.getByText('Self-Healing'));

      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
    });

    test('wechselt zu Sicherheit Section', async () => {
      const user = userEvent.setup();
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await user.click(screen.getByText('Sicherheit'));

      expect(screen.getByTestId('password-management')).toBeInTheDocument();
    });

    test('Sicherheit zeigt Abmelden-Buttons', async () => {
      const user = userEvent.setup();
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings handleLogout={vi.fn()} />
        </ToastProvider>
      );

      await user.click(screen.getByText('Sicherheit'));

      expect(screen.getByText('Abmelden')).toBeInTheDocument();
      expect(screen.getByText('Von allen Geräten abmelden')).toBeInTheDocument();
    });

    test('wechselt zu KI-Profil Section', async () => {
      const user = userEvent.setup();
      mockProfileAndContextFetch(null, { content: '', updated_at: null });

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await user.click(screen.getByText('KI-Profil'));

      await waitFor(() => {
        expect(screen.getByText('Unternehmensinformationen')).toBeInTheDocument();
      });
    });

    test('markiert aktiven Tab mit active Klasse', async () => {
      const user = userEvent.setup();
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      // Initial - General should be active (find within nav)
      const navItems = document.querySelectorAll('.settings-nav-item');
      const generalButton = Array.from(navItems).find(
        btn => btn.querySelector('.settings-nav-item-label')?.textContent === 'General'
      );
      expect(generalButton).toHaveClass('active');

      // Click Updates (nav item only)
      const updatesButton = Array.from(navItems).find(
        btn => btn.querySelector('.settings-nav-item-label')?.textContent === 'Updates'
      );
      await user.click(updatesButton);

      expect(updatesButton).toHaveClass('active');
      expect(generalButton).not.toHaveClass('active');
    });
  });

  // =====================================================
  // General Settings Section
  // =====================================================
  describe('General Settings', () => {
    test('zeigt Live-Systeminformationen', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Systeminformationen')).toBeInTheDocument();
      });

      expect(screen.getByText('Platform Version')).toBeInTheDocument();
      expect(screen.getByText('Hostname')).toBeInTheDocument();
      expect(screen.getByText('JetPack Version')).toBeInTheDocument();
      expect(screen.getByText('Build')).toBeInTheDocument();
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });

    test('zeigt Versions-Werte vom Backend', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('1.2.0')).toBeInTheDocument();
      });
      expect(screen.getByText('arasul-jetson')).toBeInTheDocument();
      expect(screen.getByText('6.2')).toBeInTheDocument();
      expect(screen.getByText('abc1234')).toBeInTheDocument();
    });

    test('zeigt Über Arasul Platform Section', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Über Arasul Platform')).toBeInTheDocument();
      });
      expect(screen.getByText('Edge-AI-Plattform für NVIDIA Jetson')).toBeInTheDocument();
    });

    test('zeigt Platform Features', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Offline-First Design')).toBeInTheDocument();
      });
      expect(screen.getByText('Self-Healing System')).toBeInTheDocument();
      expect(screen.getByText('GPU-Accelerated AI')).toBeInTheDocument();
    });

    test('zeigt Fehlermeldung wenn System-Info nicht geladen werden kann', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Systeminformationen konnten nicht geladen werden.')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // KI-Profil (merged Profile + Company Context)
  // =====================================================
  describe('KI-Profil Settings', () => {
    describe('Loading', () => {
      test('zeigt Loading-State', async () => {
        const user = userEvent.setup();
        // Never resolve fetch
        global.fetch.mockImplementation(() => new Promise(() => {}));

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        // Component shows Skeleton loading state (animate-pulse elements)
        expect(document.querySelector('[aria-hidden="true"].animate-pulse, [aria-hidden="true"] .animate-pulse')).toBeInTheDocument();
        // Title is still shown during loading
        expect(
          screen.getByText('KI-Profil', { selector: '.settings-section-title' })
        ).toBeInTheDocument();
      });

      test('lädt Content vom Backend', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(
          'firma: "Test GmbH"\nbranche: "IT & Software"',
          { content: '# Test Kontext', updated_at: '2024-01-15T10:00:00Z' }
        );

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Test GmbH')).toBeInTheDocument();
        });
      });

      test('zeigt Default-Template wenn kein Context', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: null, updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toContain('Zusätzlicher Kontext');
        });
      });
    });

    describe('Editing', () => {
      test('erlaubt Content-Bearbeitung', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: 'Initial content', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial content');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'New content' } });

        expect(textarea.value).toBe('New content');
      });

      test('zeigt "Ungespeicherte Änderungen" bei Dirty-State', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: 'Initial', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial modified' } });

        expect(screen.getByText('Ungespeicherte Änderungen')).toBeInTheDocument();
      });

      test('aktiviert Save-Button nur bei Änderungen', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: 'Initial', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const saveButton = screen.getByRole('button', { name: /speichern/i });
          expect(saveButton).toBeDisabled();
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial changed' } });

        const saveButton = screen.getByRole('button', { name: /speichern/i });
        expect(saveButton).not.toBeDisabled();
      });
    });

    describe('Saving', () => {
      test('speichert Content erfolgreich', async () => {
        const user = userEvent.setup();
        global.fetch.mockImplementation((url, opts) => {
          if (typeof url === 'string' && url.includes('/system/info')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(MOCK_SYSTEM_INFO),
            });
          }
          // PUT call returns save result
          if (opts && opts.method === 'PUT') {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ updated_at: '2024-01-16T12:00:00Z' }),
            });
          }
          // Profile GET
          if (typeof url === 'string' && url.includes('/memory/profile')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ profile: null }),
            });
          }
          // Context GET
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null }),
          });
        });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial updated' } });

        const saveButton = screen.getByRole('button', { name: /speichern/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
        });
      });

      test('zeigt Loading während Save', async () => {
        const user = userEvent.setup();
        global.fetch.mockImplementation((url, opts) => {
          if (typeof url === 'string' && url.includes('/system/info')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(MOCK_SYSTEM_INFO),
            });
          }
          // PUT call (save) never resolves
          if (opts && opts.method === 'PUT') {
            return new Promise(() => {});
          }
          // Profile GET
          if (typeof url === 'string' && url.includes('/memory/profile')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ profile: null }),
            });
          }
          // Context GET
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null }),
          });
        });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial changed' } });

        const saveButton = screen.getByRole('button', { name: /speichern/i });
        expect(saveButton).not.toBeDisabled();
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText('Speichern...')).toBeInTheDocument();
        });
      });

      test('zeigt Fehler bei Save-Failure', async () => {
        const user = userEvent.setup();
        global.fetch.mockImplementation((url, opts) => {
          if (typeof url === 'string' && url.includes('/system/info')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(MOCK_SYSTEM_INFO),
            });
          }
          // PUT call returns error
          if (opts && opts.method === 'PUT') {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: () => Promise.resolve({ error: 'Server error', message: 'Server error' }),
            });
          }
          // Profile GET
          if (typeof url === 'string' && url.includes('/memory/profile')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ profile: null }),
            });
          }
          // Context GET
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null }),
          });
        });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial changed' } });

        const saveButton = screen.getByRole('button', { name: /speichern/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText('Server error')).toBeInTheDocument();
        });
      });

      test('zeigt Netzwerkfehler', async () => {
        const user = userEvent.setup();
        global.fetch.mockImplementation((url, opts) => {
          if (typeof url === 'string' && url.includes('/system/info')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(MOCK_SYSTEM_INFO),
            });
          }
          // PUT call rejects with network error
          if (opts && opts.method === 'PUT') {
            return Promise.reject(new Error('Network error'));
          }
          // Profile GET
          if (typeof url === 'string' && url.includes('/memory/profile')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ profile: null }),
            });
          }
          // Context GET
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null }),
          });
        });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toBe('Initial');
        });

        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        fireEvent.change(textarea, { target: { value: 'Initial changed' } });

        const saveButton = screen.getByRole('button', { name: /speichern/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText('Network error')).toBeInTheDocument();
        });
      });
    });

    describe('Last Updated Display', () => {
      test('zeigt "Zuletzt aktualisiert" wenn vorhanden', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, {
          content: 'Content',
          updated_at: '2024-01-15T10:30:00Z',
        });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          expect(screen.getByText(/Zuletzt aktualisiert/)).toBeInTheDocument();
        });
      });
    });

    describe('Info Display', () => {
      test('zeigt Info-Karte zur Profil-Nutzung', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: '', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          expect(screen.getByText('Wie wird das Profil genutzt?')).toBeInTheDocument();
          expect(screen.getByText('Automatischer Kontext')).toBeInTheDocument();
          expect(screen.getByText('Bessere Antworten')).toBeInTheDocument();
          expect(screen.getByText('Projekt-Prompts')).toBeInTheDocument();
        });
      });
    });

    describe('Error Handling on Load', () => {
      test('zeigt Default-Template bei Fetch-Fehler', async () => {
        const user = userEvent.setup();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch.mockRejectedValue(new Error('Fetch failed'));

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
          expect(textarea.value).toContain('Zusätzlicher Kontext');
        });

        consoleError.mockRestore();
      });
    });

    describe('Profile Fields', () => {
      test('zeigt alle drei Sektionen', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: '', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          expect(screen.getByText('Unternehmensinformationen')).toBeInTheDocument();
          expect(screen.getByText('Zusätzlicher Kontext')).toBeInTheDocument();
          expect(screen.getByText('KI-Präferenzen')).toBeInTheDocument();
        });
      });

      test('zeigt keine Teamgröße', async () => {
        const user = userEvent.setup();
        mockProfileAndContextFetch(null, { content: '', updated_at: null });

        render(
          <ToastProvider>
            <Settings />
          </ToastProvider>
        );
        await user.click(screen.getByText('KI-Profil'));

        await waitFor(() => {
          expect(screen.getByText('Unternehmensinformationen')).toBeInTheDocument();
        });

        expect(screen.queryByText('Teamgröße')).not.toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Accessibility
  // =====================================================
  describe('Accessibility', () => {
    test('Navigation ist per Tastatur bedienbar', async () => {
      mockSystemInfoFetch();

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );

      const navItems = screen.getAllByRole('button');
      expect(navItems.length).toBeGreaterThan(0);

      // Each nav item should be focusable
      navItems.forEach(item => {
        item.focus();
        expect(document.activeElement).toBe(item);
      });
    });

    test('Textarea hat Placeholder', async () => {
      const user = userEvent.setup();
      mockProfileAndContextFetch(null, { content: '', updated_at: null });

      render(
        <ToastProvider>
          <Settings />
        </ToastProvider>
      );
      await user.click(screen.getByText('KI-Profil'));

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten...');
        expect(textarea).toBeInTheDocument();
      });
    });
  });
});
