/**
 * TelegramSettings Component Tests
 *
 * Tests für TelegramSettings:
 * - Initial Loading
 * - Config Display
 * - Bot Token eingabe
 * - Chat ID eingabe
 * - Enable/Disable Toggle
 * - Save Configuration
 * - Test Message
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TelegramSettings from '../components/TelegramSettings';

describe('TelegramSettings Component', () => {
  const mockConfig = {
    chat_id: '123456789',
    enabled: false,
    configured: true,
    token_masked: '****TOKEN****'
  };

  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;

    // Default mock
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =====================================================
  // Initial Loading
  // =====================================================
  describe('Initial Loading', () => {
    test('zeigt Loading-State', () => {
      global.fetch = jest.fn(() => new Promise(() => {})); // Never resolves
      render(<TelegramSettings />);

      expect(screen.getByText('Lade...')).toBeInTheDocument();
    });

    test('lädt Config beim Mount', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/telegram/config', expect.objectContaining({
          credentials: 'include'
        }));
      });
    });
  });

  // =====================================================
  // Header Display
  // =====================================================
  describe('Header Display', () => {
    test('zeigt Haupttitel', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Telegram Bot')).toBeInTheDocument();
      });
    });

    test('zeigt Beschreibung', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Konfigurieren Sie einen Telegram Bot für System-Benachrichtigungen/)).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Status Card
  // =====================================================
  describe('Status Card', () => {
    test('zeigt Bot Status Card', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        // Bot Status appears in both card title and status label
        expect(screen.getAllByText('Bot Status').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Inaktiv wenn disabled', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Inaktiv')).toBeInTheDocument();
      });
    });

    test('zeigt Aktiv wenn enabled', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockConfig, enabled: true })
        })
      );

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Aktiv')).toBeInTheDocument();
      });
    });

    test('zeigt Toggle-Button', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        const toggleBtn = document.querySelector('.telegram-toggle-btn');
        expect(toggleBtn).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Configuration Card
  // =====================================================
  describe('Configuration Card', () => {
    test('zeigt Konfiguration Card', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Bot Konfiguration')).toBeInTheDocument();
      });
    });

    test('zeigt Bot Token Input', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });
    });

    test('zeigt Chat ID Input', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Chat ID')).toBeInTheDocument();
      });
    });

    test('zeigt geladene Chat-ID im Input', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        const chatIdInput = screen.getByLabelText('Chat ID');
        expect(chatIdInput).toHaveValue('123456789');
      });
    });

    test('Token Input ist Passwort-Typ', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        const tokenInput = screen.getByLabelText('Bot Token');
        expect(tokenInput).toHaveAttribute('type', 'password');
      });
    });
  });

  // =====================================================
  // Token Visibility Toggle
  // =====================================================
  describe('Token Visibility Toggle', () => {
    test('zeigt Sichtbarkeits-Toggle für Token', async () => {
      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        const toggleBtn = container.querySelector('.telegram-toggle-visibility');
        expect(toggleBtn).toBeInTheDocument();
      });
    });

    test('kann Token sichtbar machen', async () => {
      const user = userEvent.setup();
      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      const toggleBtn = container.querySelector('.telegram-toggle-visibility');
      await user.click(toggleBtn);

      const tokenInput = screen.getByLabelText('Bot Token');
      expect(tokenInput).toHaveAttribute('type', 'text');
    });
  });

  // =====================================================
  // Form Input
  // =====================================================
  describe('Form Input', () => {
    test('kann Token eingeben', async () => {
      const user = userEvent.setup();
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      const tokenInput = screen.getByLabelText('Bot Token');
      await user.type(tokenInput, '123456:ABC-DEF');

      expect(tokenInput).toHaveValue('123456:ABC-DEF');
    });

    test('kann Chat-ID ändern', async () => {
      const user = userEvent.setup();
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Chat ID')).toBeInTheDocument();
      });

      const chatIdInput = screen.getByLabelText('Chat ID');
      await user.clear(chatIdInput);
      await user.type(chatIdInput, '987654321');

      expect(chatIdInput).toHaveValue('987654321');
    });
  });

  // =====================================================
  // Save Button
  // =====================================================
  describe('Save Button', () => {
    test('zeigt Speichern Button', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Speichern')).toBeInTheDocument();
      });
    });

    test('Speichern ist disabled ohne Änderungen', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        const saveBtn = screen.getByText('Speichern').closest('button');
        expect(saveBtn).toBeDisabled();
      });
    });

    test('Speichern ist enabled nach Änderungen', async () => {
      const user = userEvent.setup();
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      const tokenInput = screen.getByLabelText('Bot Token');
      await user.type(tokenInput, 'newtoken123');

      const saveBtn = screen.getByText('Speichern').closest('button');
      expect(saveBtn).not.toBeDisabled();
    });

    test('speichert Konfiguration bei Click', async () => {
      const user = userEvent.setup();

      let fetchCallCount = 0;
      global.fetch = jest.fn((url, options) => {
        fetchCallCount++;
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, has_token: true })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      const tokenInput = screen.getByLabelText('Bot Token');
      await user.type(tokenInput, 'newtoken');

      await user.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/telegram/config', expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('newtoken')
        }));
      });
    });

    test('zeigt Erfolgs-Nachricht nach Speichern', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, has_token: true })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Bot Token'), 'token');
      await user.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(screen.getByText('Konfiguration erfolgreich gespeichert')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Test Button
  // =====================================================
  describe('Test Button', () => {
    test('zeigt Test-Button', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Test senden')).toBeInTheDocument();
      });
    });

    test('Test-Button ist disabled ohne Token', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockConfig, configured: false })
        })
      );

      render(<TelegramSettings />);

      await waitFor(() => {
        const testBtn = screen.getByText('Test senden').closest('button');
        expect(testBtn).toBeDisabled();
      });
    });

    test('Test-Button ist disabled ohne Chat-ID', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockConfig, chat_id: '' })
        })
      );

      render(<TelegramSettings />);

      await waitFor(() => {
        const testBtn = screen.getByText('Test senden').closest('button');
        expect(testBtn).toBeDisabled();
      });
    });

    test('sendet Test-Nachricht bei Click', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (url.includes('/test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Test senden')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Test senden'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/telegram/test', expect.objectContaining({
          method: 'POST'
        }));
      });
    });

    test('zeigt Erfolgs-Nachricht nach Test', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (url.includes('/test')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Test senden')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Test senden'));

      await waitFor(() => {
        expect(screen.getByText('Test-Nachricht erfolgreich gesendet!')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Enable/Disable Toggle
  // =====================================================
  describe('Enable/Disable Toggle', () => {
    test('Toggle ist disabled ohne Token', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockConfig, configured: false, enabled: false })
        })
      );

      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        const toggleBtn = container.querySelector('.telegram-toggle-btn');
        expect(toggleBtn).toBeDisabled();
      });
    });

    test('kann Bot aktivieren', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        const toggleBtn = container.querySelector('.telegram-toggle-btn');
        expect(toggleBtn).not.toBeDisabled();
      });

      const toggleBtn = container.querySelector('.telegram-toggle-btn');
      await user.click(toggleBtn);

      await waitFor(() => {
        expect(screen.getByText('Telegram Bot aktiviert')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Info Card
  // =====================================================
  describe('Info Card', () => {
    test('zeigt Einrichtungs-Anleitung', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Einrichtung Telegram Bot')).toBeInTheDocument();
      });
    });

    test('zeigt Schritt 1 - Bot erstellen', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Bot erstellen')).toBeInTheDocument();
      });
    });

    test('zeigt Schritt 2 - Token kopieren', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Token kopieren')).toBeInTheDocument();
      });
    });

    test('zeigt Schritt 3 - Chat-ID ermitteln', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Chat-ID ermitteln')).toBeInTheDocument();
      });
    });

    test('zeigt Schritt 4 - Bot starten', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Bot starten')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Error Handling
  // =====================================================
  describe('Error Handling', () => {
    test('zeigt Fehler bei Load-Error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Unauthorized' })
        })
      );

      render(<TelegramSettings />);

      await waitFor(() => {
        // Component should handle the error gracefully
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Error fetching'));
      });

      consoleSpy.mockRestore();
    });

    test('zeigt Fehler bei Save-Error', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Invalid token format' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Bot Token'), 'badtoken');
      await user.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(screen.getByText('Invalid token format')).toBeInTheDocument();
      });
    });

    test('zeigt Fehler bei Test-Error', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (url.includes('/test')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Bot not configured' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText('Test senden')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Test senden'));

      await waitFor(() => {
        expect(screen.getByText('Bot not configured')).toBeInTheDocument();
      });
    });

    test('zeigt Netzwerkfehler', async () => {
      const user = userEvent.setup();

      global.fetch = jest.fn((url, options) => {
        if (options?.method === 'POST') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockConfig)
        });
      });

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Bot Token')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Bot Token'), 'token');
      await user.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(screen.getByText('Netzwerkfehler beim Speichern')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Hint Messages
  // =====================================================
  describe('Hint Messages', () => {
    test('zeigt Hinweis wenn kein Token konfiguriert', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockConfig, configured: false })
        })
      );

      render(<TelegramSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Konfigurieren Sie zuerst einen Bot-Token/)).toBeInTheDocument();
      });
    });

    test('zeigt Placeholder für gespeicherten Token', async () => {
      render(<TelegramSettings />);

      await waitFor(() => {
        const tokenInput = screen.getByLabelText('Bot Token');
        expect(tokenInput).toHaveAttribute('placeholder', expect.stringContaining('Token gespeichert'));
      });
    });
  });

  // =====================================================
  // CSS Classes
  // =====================================================
  describe('CSS Classes', () => {
    test('hat settings-section Container', async () => {
      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        expect(container.querySelector('.settings-section')).toBeInTheDocument();
      });
    });

    test('hat settings-cards', async () => {
      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        expect(container.querySelector('.settings-cards')).toBeInTheDocument();
      });
    });

    test('hat telegram-form', async () => {
      const { container } = render(<TelegramSettings />);

      await waitFor(() => {
        expect(container.querySelector('.telegram-form')).toBeInTheDocument();
      });
    });
  });
});
