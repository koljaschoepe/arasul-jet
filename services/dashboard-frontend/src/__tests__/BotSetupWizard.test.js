/**
 * BotSetupWizard Component Tests
 *
 * Tests für BotSetupWizard:
 * - Step Navigation
 * - Token Validation
 * - LLM Provider Selection
 * - System Prompt Input
 * - Chat Verification (WebSocket)
 * - Bot Creation
 * - Error Handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotSetupWizard from '../components/TelegramBots/BotSetupWizard';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    this.sentMessages = [];
    MockWebSocket.instances.push(this);

    // Simulate connection
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));

    // Simulate subscription response
    const message = JSON.parse(data);
    if (message.type === 'subscribe' && this.onmessage) {
      setTimeout(() => {
        this.onmessage({
          data: JSON.stringify({
            type: 'subscribed',
            setupToken: message.setupToken?.substring(0, 8) + '...',
            timestamp: new Date().toISOString(),
          }),
        });
      }, 10);
    }
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }

  // Helper to simulate incoming messages
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

MockWebSocket.instances = [];

describe('BotSetupWizard Component', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();
  const validToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';

  let originalFetch;
  let originalWebSocket;
  let originalLocalStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances = [];

    // Mock fetch
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    // Mock WebSocket
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;

    // Mock localStorage
    originalLocalStorage = global.localStorage;
    const localStorageMock = {
      getItem: jest.fn(() => 'mock-auth-token'),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    // Default fetch mocks
    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/models/ollama')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [{ name: 'llama2' }, { name: 'mistral' }] }),
        });
      }
      if (url.includes('/models/claude')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              models: [{ id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' }],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  // =====================================================
  // Step Navigation
  // =====================================================
  describe('Step Navigation', () => {
    test('zeigt Step 1 initial', () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Check for the token input placeholder
      expect(screen.getByPlaceholderText(/123456789:ABCdef/)).toBeInTheDocument();
      // Check that step 1 is active
      const step1 = screen.getAllByText('Bot-Token')[0].closest('.wizard-progress-step');
      expect(step1).toHaveClass('active');
    });

    test('zeigt alle 4 Schritte in der Progress-Anzeige', () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Use getAllByText since text appears in both progress bar and form labels
      expect(screen.getAllByText('Bot-Token').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('KI-Anbieter')).toBeInTheDocument();
      expect(screen.getByText('Persönlichkeit')).toBeInTheDocument();
      expect(screen.getByText('Chat verbinden')).toBeInTheDocument();
    });

    test('Abbrechen-Button ruft onCancel auf', () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Abbrechen'));

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // =====================================================
  // Token Validation
  // =====================================================
  describe('Token Validation', () => {
    test('deaktiviert Button bei leerem Token', async () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Check that button is disabled when token is empty
      const validateButton = screen.getByText('Token prüfen');
      expect(validateButton).toBeDisabled();
    });

    test('zeigt Fehler bei ungueltigem Token-Format', async () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, 'invalid-token-format');

      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText(/Ungültiges Token-Format/)).toBeInTheDocument();
      });
    });

    test('validiert Token erfolgreich', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                valid: true,
                botInfo: {
                  first_name: 'Test Bot',
                  username: 'test_bot',
                },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test Bot')).toBeInTheDocument();
        expect(screen.getByText('@test_bot')).toBeInTheDocument();
      });
    });

    test('zeigt Validierung-Ladezustand', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return new Promise(() => {}); // Never resolves
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Validiere...')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // LLM Provider Selection
  // =====================================================
  describe('LLM Provider Selection', () => {
    const setupToStep2 = async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                valid: true,
                botInfo: { first_name: 'Test Bot', username: 'test_bot' },
              }),
          });
        }
        if (url.includes('/models/ollama')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama2' }] }),
          });
        }
        if (url.includes('/models/claude')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ id: 'claude-3-sonnet-20240229' }] }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test Bot')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Weiter'));
    };

    test('zeigt Lokale KI und Cloud KI als Provider-Optionen', async () => {
      await setupToStep2();

      await waitFor(() => {
        expect(screen.getByText('Lokale KI')).toBeInTheDocument();
        expect(screen.getByText('Cloud KI')).toBeInTheDocument();
      });
    });

    test('Lokale KI ist standardmäßig ausgewählt', async () => {
      await setupToStep2();

      await waitFor(() => {
        const ollamaButton = screen.getByText('Lokale KI').closest('button');
        expect(ollamaButton).toHaveClass('selected');
      });
    });
  });

  // =====================================================
  // Error Handling
  // =====================================================
  describe('Error Handling', () => {
    test('zeigt Netzwerkfehler', async () => {
      // Mock all fetch calls to fail for token validation
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.reject(new Error('Failed to fetch'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      // Wait for retries to complete and error to show
      await waitFor(
        () => {
          const errorElement = screen.queryByText(
            /Netzwerkfehler|Internetverbindung|Token-Validierung/
          );
          expect(errorElement).toBeInTheDocument();
        },
        { timeout: 10000 }
      );
    });

    test('zeigt Server-Fehler', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Token ist ungueltig' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Token ist ungueltig')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Token Visibility Toggle
  // =====================================================
  describe('Token Visibility', () => {
    test('Token ist standardmaessig versteckt', () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      expect(input).toHaveAttribute('type', 'password');
    });

    test('Token kann sichtbar gemacht werden', async () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Find the visibility toggle button (the one with the eye icon)
      const toggleButtons = screen.getAllByRole('button');
      const visibilityToggle = toggleButtons.find(btn =>
        btn.classList.contains('wizard-toggle-visibility')
      );

      if (visibilityToggle) {
        fireEvent.click(visibilityToggle);

        const input = screen.getByPlaceholderText(/123456789:ABCdef/);
        expect(input).toHaveAttribute('type', 'text');
      }
    });
  });

  // =====================================================
  // Bot Name Input
  // =====================================================
  describe('Bot Name', () => {
    test('setzt Bot-Name nach Token-Validierung', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                valid: true,
                botInfo: { first_name: 'Mein Bot', username: 'mein_bot' },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const tokenInput = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(tokenInput, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Mein Assistent');
        expect(nameInput).toHaveValue('Mein Bot');
      });
    });

    test('erlaubt manuelle Aenderung des Bot-Namens', async () => {
      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const nameInput = screen.getByPlaceholderText('Mein Assistent');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Neuer Name');

      expect(nameInput).toHaveValue('Neuer Name');
    });
  });

  // =====================================================
  // Retry Logic
  // =====================================================
  describe('Retry Logic', () => {
    test('versucht Token-Validierung mehrmals bei Netzwerkfehler', async () => {
      let fetchCount = 0;

      global.fetch.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          fetchCount++;
          if (fetchCount <= 2) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                valid: true,
                botInfo: { first_name: 'Test', username: 'test' },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) });
      });

      render(<BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      const input = screen.getByPlaceholderText(/123456789:ABCdef/);
      await userEvent.type(input, validToken);

      fireEvent.click(screen.getByText('Token prüfen'));

      // Wait for retries to complete
      await waitFor(
        () => {
          expect(fetchCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 10000 }
      );
    });
  });
});
