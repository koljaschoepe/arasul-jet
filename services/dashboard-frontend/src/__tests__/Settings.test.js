/**
 * Settings Component Tests
 *
 * Tests für die Settings-Komponente:
 * - Tab-Navigation
 * - General Settings Anzeige
 * - Company Context (Load, Edit, Save, Dirty-Check)
 * - Error Handling
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../components/Settings';

// Mock child components that are rendered conditionally
jest.mock('../components/UpdatePage', () => () => <div data-testid="update-page">Update Page Content</div>);
jest.mock('../components/SelfHealingEvents', () => () => <div data-testid="selfhealing-events">Self-Healing Events Content</div>);
jest.mock('../components/PasswordManagement', () => () => <div data-testid="password-management">Password Management Content</div>);

describe('Settings Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =====================================================
  // Main Layout and Navigation
  // =====================================================
  describe('Layout and Navigation', () => {
    test('rendert Settings Layout korrekt', () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
      expect(screen.getByText('System-Konfiguration')).toBeInTheDocument();
    });

    test('zeigt alle Navigation-Items', () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      // Use getAllByText since nav items and section titles may share text
      const nav = document.querySelector('.settings-nav');
      expect(nav).toBeInTheDocument();

      // Check nav items by their label class
      const navLabels = document.querySelectorAll('.settings-nav-item-label');
      const labelTexts = Array.from(navLabels).map(el => el.textContent);

      expect(labelTexts).toContain('General');
      expect(labelTexts).toContain('Unternehmenskontext');
      expect(labelTexts).toContain('Updates');
      expect(labelTexts).toContain('Self-Healing');
      expect(labelTexts).toContain('Security');
    });

    test('zeigt Beschreibungen für Navigation-Items', () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      // Check nav item descriptions by their class
      const navDescriptions = document.querySelectorAll('.settings-nav-item-description');
      const descTexts = Array.from(navDescriptions).map(el => el.textContent);

      expect(descTexts).toContain('System information and configuration');
      expect(descTexts).toContain('Globaler Kontext für RAG-Anfragen');
    });

    test('startet mit General Section aktiv', () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      // Should show General settings content
      expect(screen.getByText('System Information')).toBeInTheDocument();
      expect(screen.getByText('Platform Version')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Tab Navigation
  // =====================================================
  describe('Tab Navigation', () => {
    test('wechselt zu Updates Section', async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      await user.click(screen.getByText('Updates'));

      expect(screen.getByTestId('update-page')).toBeInTheDocument();
    });

    test('wechselt zu Self-Healing Section', async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      await user.click(screen.getByText('Self-Healing'));

      expect(screen.getByTestId('selfhealing-events')).toBeInTheDocument();
    });

    test('wechselt zu Security Section', async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      await user.click(screen.getByText('Security'));

      expect(screen.getByTestId('password-management')).toBeInTheDocument();
    });

    test('wechselt zu Unternehmenskontext Section', async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: 'Test content', updated_at: '2024-01-15T10:00:00Z' })
      });

      render(<Settings />);

      await user.click(screen.getByText('Unternehmenskontext'));

      await waitFor(() => {
        expect(screen.getByText('Unternehmensprofil')).toBeInTheDocument();
      });
    });

    test('markiert aktiven Tab mit active Klasse', async () => {
      const user = userEvent.setup();
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      // Initial - General should be active (find within nav)
      const navItems = document.querySelectorAll('.settings-nav-item');
      const generalButton = Array.from(navItems).find(btn =>
        btn.querySelector('.settings-nav-item-label')?.textContent === 'General'
      );
      expect(generalButton).toHaveClass('active');

      // Click Updates (nav item only)
      const updatesButton = Array.from(navItems).find(btn =>
        btn.querySelector('.settings-nav-item-label')?.textContent === 'Updates'
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
    test('zeigt System-Informationen', () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      expect(screen.getByText('System Information')).toBeInTheDocument();
      expect(screen.getByText('Platform Version')).toBeInTheDocument();
      expect(screen.getByText('Hostname')).toBeInTheDocument();
      expect(screen.getByText('JetPack Version')).toBeInTheDocument();
      expect(screen.getByText('Docker Version')).toBeInTheDocument();
      expect(screen.getByText('Docker Compose')).toBeInTheDocument();
    });

    test('zeigt Versions-Werte', () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      expect(screen.getByText('1.0.0')).toBeInTheDocument();
      expect(screen.getByText('arasul-edge')).toBeInTheDocument();
      expect(screen.getByText('6.0')).toBeInTheDocument();
    });

    test('zeigt About Arasul Platform Section', () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      expect(screen.getByText('About Arasul Platform')).toBeInTheDocument();
      expect(screen.getByText('Edge AI platform for NVIDIA Jetson')).toBeInTheDocument();
    });

    test('zeigt Platform Features', () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

      expect(screen.getByText('Offline-First Design')).toBeInTheDocument();
      expect(screen.getByText('Self-Healing System')).toBeInTheDocument();
      expect(screen.getByText('GPU-Accelerated AI')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Company Context Settings (RAG 2.0)
  // =====================================================
  describe('Company Context Settings', () => {
    describe('Loading', () => {
      test('zeigt Loading-State', async () => {
        const user = userEvent.setup();
        // Never resolve fetch
        global.fetch.mockImplementation(() => new Promise(() => {}));

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        expect(screen.getByText('Lade...')).toBeInTheDocument();
      });

      test('lädt Content vom Backend', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            content: '# Mein Unternehmen\n\nBeschreibung hier',
            updated_at: '2024-01-15T10:00:00Z'
          })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue(/Mein Unternehmen/)).toBeInTheDocument();
        });
      });

      test('zeigt Default-Template wenn kein Content', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: null, updated_at: null })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          // Should show default template
          const textarea = document.querySelector('.company-context-textarea');
          expect(textarea.value).toContain('Unternehmensprofil');
        });
      });
    });

    describe('Editing', () => {
      test('erlaubt Content-Bearbeitung', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: 'Initial content', updated_at: null })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial content')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial content');
        await user.clear(textarea);
        await user.type(textarea, 'New content');

        expect(textarea.value).toBe('New content');
      });

      test('zeigt "Ungespeicherte Änderungen" bei Dirty-State', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: 'Initial', updated_at: null })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' modified');

        expect(screen.getByText('Ungespeicherte Änderungen')).toBeInTheDocument();
      });

      test('aktiviert Save-Button nur bei Änderungen', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: 'Initial', updated_at: null })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          const saveButton = screen.getByText('Speichern');
          expect(saveButton).toBeDisabled();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' changed');

        const saveButton = screen.getByText('Speichern');
        expect(saveButton).not.toBeDisabled();
      });
    });

    describe('Saving', () => {
      test('speichert Content erfolgreich', async () => {
        const user = userEvent.setup();
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ updated_at: '2024-01-16T12:00:00Z' })
          });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' updated');

        const saveButton = screen.getByText('Speichern');
        await user.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
        });
      });

      test('zeigt Loading während Save', async () => {
        const user = userEvent.setup();
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null })
          })
          .mockImplementationOnce(() => new Promise(() => {})); // Never resolve

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' changed');

        const saveButton = screen.getByText('Speichern');
        await user.click(saveButton);

        expect(screen.getByText('Speichern...')).toBeInTheDocument();
      });

      test('zeigt Fehler bei Save-Failure', async () => {
        const user = userEvent.setup();
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null })
          })
          .mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ error: 'Server error' })
          });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' changed');

        const saveButton = screen.getByText('Speichern');
        await user.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText('Server error')).toBeInTheDocument();
        });
      });

      test('zeigt Netzwerkfehler', async () => {
        const user = userEvent.setup();
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ content: 'Initial', updated_at: null })
          })
          .mockRejectedValueOnce(new Error('Network error'));

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();
        });

        const textarea = screen.getByDisplayValue('Initial');
        await user.type(textarea, ' changed');

        const saveButton = screen.getByText('Speichern');
        await user.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText('Netzwerkfehler beim Speichern')).toBeInTheDocument();
        });
      });
    });

    describe('Last Updated Display', () => {
      test('zeigt "Zuletzt aktualisiert" wenn vorhanden', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            content: 'Content',
            updated_at: '2024-01-15T10:30:00Z'
          })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByText(/Zuletzt aktualisiert/)).toBeInTheDocument();
        });
      });
    });

    describe('Tips Display', () => {
      test('zeigt Tipps für guten Kontext', async () => {
        const user = userEvent.setup();
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: '', updated_at: null })
        });

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          expect(screen.getByText('Tipps für guten Kontext')).toBeInTheDocument();
          expect(screen.getByText('Seien Sie spezifisch')).toBeInTheDocument();
          expect(screen.getByText('Beschreiben Sie Ihre Zielgruppe')).toBeInTheDocument();
          expect(screen.getByText('Halten Sie es aktuell')).toBeInTheDocument();
        });
      });
    });

    describe('Error Handling on Load', () => {
      test('zeigt Default-Template bei Fetch-Fehler', async () => {
        const user = userEvent.setup();
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch.mockRejectedValueOnce(new Error('Fetch failed'));

        render(<Settings />);
        await user.click(screen.getByText('Unternehmenskontext'));

        await waitFor(() => {
          const textarea = document.querySelector('.company-context-textarea');
          expect(textarea).toBeTruthy();
          expect(textarea.value).toContain('Unternehmensprofil');
        });

        consoleError.mockRestore();
      });
    });
  });

  // =====================================================
  // Accessibility
  // =====================================================
  describe('Accessibility', () => {
    test('Navigation ist per Tastatur bedienbar', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);

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
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', updated_at: null })
      });

      render(<Settings />);
      await user.click(screen.getByText('Unternehmenskontext'));

      await waitFor(() => {
        const textarea = document.querySelector('.company-context-textarea');
        expect(textarea).toHaveAttribute('placeholder');
      });
    });
  });
});
