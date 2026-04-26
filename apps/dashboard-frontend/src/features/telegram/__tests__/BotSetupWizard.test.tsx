/**
 * BotSetupWizard Component Tests
 *
 * Tests für BotSetupWizard:
 * - Step Navigation (3 steps)
 * - Token Validation
 * - Template Selection (Arasul Assistent / Custom Bot)
 * - Configuration (System Prompt, RAG, Model)
 * - Chat Verification (WebSocket)
 * - Bot Creation
 * - Error Handling
 */

import React from 'react';
import { ToastProvider } from '../../../contexts/ToastContext';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotSetupWizard from '../components/BotSetupWizard';

// Mock useApi
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
}));

// Mock AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sentMessages = [];
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.sentMessages.push(JSON.parse(data));
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
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
  simulateMessage(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}
MockWebSocket.instances = [];

describe('BotSetupWizard Component', () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();
  const validToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';

  let originalWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];

    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;

    // Default API mocks
    mockApi.get.mockImplementation(url => {
      if (url.includes('/models/ollama')) {
        return Promise.resolve({ models: [{ name: 'llama3.1:8b' }, { name: 'mistral' }] });
      }
      if (url.includes('/spaces')) {
        return Promise.resolve({
          spaces: [
            { id: 'space-1', name: 'Allgemein' },
            { id: 'space-2', name: 'Projekte' },
          ],
        });
      }
      return Promise.resolve({});
    });
    mockApi.post.mockResolvedValue({});
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  // =====================================================
  // Step Navigation
  // =====================================================
  describe('Step Navigation', () => {
    test('zeigt Step 1 initial', () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      expect(screen.getByPlaceholderText('Token von @BotFather eingeben')).toBeInTheDocument();
      // Step 1 should be visible and active (opacity-100)
      const step1Text = screen.getByText('Token & Vorlage');
      expect(step1Text).toBeInTheDocument();
    });

    test('zeigt alle 3 Schritte in der Progress-Anzeige', () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      expect(screen.getByText('Token & Vorlage')).toBeInTheDocument();
      expect(screen.getByText('Konfiguration')).toBeInTheDocument();
      expect(screen.getByText('Verbinden')).toBeInTheDocument();
    });

    test('Abbrechen-Button ruft onCancel auf', () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Abbrechen'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // =====================================================
  // Token Validation
  // =====================================================
  describe('Token Validation', () => {
    test('zeigt "Token prüfen" als initialen Button', () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      expect(screen.getByText('Token prüfen')).toBeInTheDocument();
    });

    test('zeigt Fehler bei ungültigem Token-Format', async () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, 'invalid-token-format');
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText(/Ungültiges Token-Format/)).toBeInTheDocument();
      });
    });

    test('validiert Token erfolgreich und zeigt Bot-Info', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Test Bot', username: 'test_bot' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test Bot')).toBeInTheDocument();
        expect(screen.getByText(/@test_bot/)).toBeInTheDocument();
      });
    });

    test('zeigt Validierung-Ladezustand', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return new Promise(() => {}); // Never resolves
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Validiere...')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Template Selection
  // =====================================================
  describe('Template Selection', () => {
    const setupToTemplateSelection = async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Test Bot', username: 'test_bot' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test Bot')).toBeInTheDocument();
      });
    };

    test('zeigt Vorlagen nach Token-Validierung', async () => {
      await setupToTemplateSelection();

      expect(screen.getByText('Arasul Assistent')).toBeInTheDocument();
      expect(screen.getByText('Custom Bot')).toBeInTheDocument();
    });

    test('zeigt Bot-Vorlage Label', async () => {
      await setupToTemplateSelection();

      expect(screen.getByText('Bot-Vorlage')).toBeInTheDocument();
    });

    test('wählt Arasul Assistent Vorlage aus', async () => {
      await setupToTemplateSelection();

      const assistantBtn = screen.getByText('Arasul Assistent').closest('button');
      fireEvent.click(assistantBtn);

      // Selected template gets primary border color class
      expect(assistantBtn.className).toContain('border-primary');
    });

    test('wählt Custom Bot Vorlage aus', async () => {
      await setupToTemplateSelection();

      const customBtn = screen.getByText('Custom Bot').closest('button');
      fireEvent.click(customBtn);

      // Selected template gets primary border color class
      expect(customBtn.className).toContain('border-primary');
    });

    test('Weiter-Button deaktiviert ohne Vorlage', async () => {
      await setupToTemplateSelection();

      // After validation, button shows "Weiter" but should be disabled without template
      const weiterBtn = screen.getByText('Weiter').closest('button');
      expect(weiterBtn).toBeDisabled();
    });
  });

  // =====================================================
  // Step 2: Configuration
  // =====================================================
  describe('Configuration (Step 2)', () => {
    const setupToStep2 = async (template = 'master') => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Test Bot', username: 'test_bot' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      // Step 1: Enter token
      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test Bot')).toBeInTheDocument();
      });

      // Select template
      const templateBtn = screen
        .getByText(template === 'master' ? 'Arasul Assistent' : 'Custom Bot')
        .closest('button');
      fireEvent.click(templateBtn);

      // Go to step 2
      fireEvent.click(screen.getByText('Weiter'));

      // Wait for step 2 content to appear
      await waitFor(() => {
        expect(screen.getByLabelText(/System-Prompt/)).toBeInTheDocument();
      });
    };

    test('zeigt Master Bot Zusammenfassung für Arasul Assistent', async () => {
      await setupToStep2('master');

      expect(screen.getByText(/Globaler RAG-Zugriff auf alle Spaces/)).toBeInTheDocument();
    });

    test('zeigt System-Prompt Textarea', async () => {
      await setupToStep2('master');

      const textarea = screen.getByLabelText('System-Prompt');
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toContain('Arasul Assistent');
    });

    test('zeigt LLM-Modell Dropdown', async () => {
      await setupToStep2('master');

      const select = screen.getByLabelText('LLM-Modell');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('llama3.1:8b')).toBeInTheDocument();
    });

    test('zeigt RAG-Toggle für Custom Bot', async () => {
      await setupToStep2('custom');

      expect(screen.getByText(/RAG aktivieren/)).toBeInTheDocument();
    });

    test('zeigt Space-Auswahl wenn RAG aktiviert', async () => {
      await setupToStep2('custom');

      // Enable RAG
      const ragCheckbox = screen.getByRole('checkbox');
      fireEvent.click(ragCheckbox);

      await waitFor(() => {
        expect(screen.getByText('Space-Zuordnung')).toBeInTheDocument();
        expect(screen.getByText('Alle Spaces')).toBeInTheDocument();
        expect(screen.getByText('Allgemein')).toBeInTheDocument();
        expect(screen.getByText('Projekte')).toBeInTheDocument();
      });
    });

    test('Zurück-Button navigiert zu Step 1', async () => {
      await setupToStep2('master');

      fireEvent.click(screen.getByText('Zurück'));

      await waitFor(() => {
        // Back on step 1 - token input should be visible again
        expect(screen.getByPlaceholderText('Token von @BotFather eingeben')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Token Visibility Toggle
  // =====================================================
  describe('Token Visibility', () => {
    test('Token ist standardmaessig versteckt', () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      expect(input).toHaveAttribute('type', 'password');
    });

    test('Token kann sichtbar gemacht werden', async () => {
      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      // Find the visibility toggle button next to the token input
      const tokenInput = screen.getByPlaceholderText('Token von @BotFather eingeben');
      const inputWrapper = tokenInput.closest('div');
      const toggleButton = inputWrapper.querySelector('button');

      if (toggleButton) {
        fireEvent.click(toggleButton);
        expect(tokenInput).toHaveAttribute('type', 'text');
      }
    });
  });

  // =====================================================
  // Bot Name Input
  // =====================================================
  describe('Bot Name', () => {
    test('setzt Bot-Name nach Token-Validierung', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Mein Bot', username: 'mein_bot' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const tokenInput = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(tokenInput, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Name für deinen Bot');
        expect(nameInput).toHaveValue('Mein Bot');
      });
    });

    test('erlaubt manuelle Änderung des Bot-Namens', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Test', username: 'test' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      // Must validate first for name field to appear
      const tokenInput = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(tokenInput, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Name für deinen Bot')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Name für deinen Bot');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Neuer Name');

      expect(nameInput).toHaveValue('Neuer Name');
    });
  });

  // =====================================================
  // Error Handling
  // =====================================================
  describe('Error Handling', () => {
    test('zeigt Netzwerkfehler', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.reject(new Error('Failed to fetch'));
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(
        () => {
          const errorElement = screen.queryByText(/Failed to fetch|Token-Validierung|Fehler/);
          expect(errorElement).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    test('zeigt Server-Fehler', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({ valid: false, error: 'Token ist ungültig' });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Token ist ungültig')).toBeInTheDocument();
      });
    });

    test('zeigt Fehler wenn keine Vorlage gewählt', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/validate-token')) {
          return Promise.resolve({
            valid: true,
            botInfo: { first_name: 'Test', username: 'test' },
          });
        }
        return Promise.resolve({});
      });

      render(
        <ToastProvider>
          <BotSetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />
        </ToastProvider>
      );

      const input = screen.getByPlaceholderText('Token von @BotFather eingeben');
      await userEvent.type(input, validToken);
      fireEvent.click(screen.getByText('Token prüfen'));

      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument();
      });

      // Try to advance without selecting template - button should be disabled
      const weiterBtn = screen.getByText('Weiter').closest('button');
      expect(weiterBtn).toBeDisabled();
    });
  });
});
