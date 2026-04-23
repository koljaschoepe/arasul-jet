/**
 * ChatInputArea Component Tests
 *
 * Tests für den Chat-Eingabebereich:
 * - Textarea Rendering und Interaktion
 * - Enter sendet, Shift+Enter neue Zeile
 * - Send-Button deaktiviert bei leerem Input
 * - Think-Toggle (einfacher Toggle)
 * - RAG-Toggle mit Popup-Logik
 * - Model-Popup (nach oben öffnend)
 * - Cancel-Button bei laufendem Stream
 * - Queue-Indikator
 * - Error-Banner
 * - Settings-Persistenz via chatSettings Prop
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatInputArea from '../ChatInputArea';

vi.mock('../../../components/ui/LoadingSpinner', () => ({
  default: function MockLoadingSpinner() {
    return <span data-testid="loading-spinner" />;
  },
}));

// Mock ToastContext
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock useApi
const mockApiPatch = vi.fn().mockResolvedValue({});
vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: mockApiPatch,
    del: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
  }),
}));

// Use a mutable container so the hoisted vi.mock can reference it
const chatCtx = {};

vi.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => chatCtx,
}));

const mockSendMessage = vi.fn();
const mockCancelJob = vi.fn();
const mockSetSelectedModel = vi.fn();
const mockSetModelAsDefault = vi.fn();

describe('ChatInputArea Component', () => {
  const messagesRef = { current: [] };

  const defaultProps = {
    chatId: 1,
    chatSettings: null,
    messagesRef,
    hasMessages: false,
    isLoading: false,
    error: null,
    onClearError: vi.fn(),
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Populate the mutable chatCtx that useChatContext returns
    Object.assign(chatCtx, {
      sendMessage: mockSendMessage,
      cancelJob: mockCancelJob,
      activeJobIds: {},
      globalQueue: { pending_count: 0, processing: null, queue: [] },
      installedModels: [
        {
          id: 'qwen3:7b',
          name: 'Qwen3 7B',
          category: 'Small',
          ram_required_gb: 6,
          install_status: 'available',
          supports_thinking: true,
          rag_optimized: true,
        },
        {
          id: 'llama3:8b',
          name: 'Llama3 8B',
          category: 'Medium',
          ram_required_gb: 8,
          install_status: 'available',
        },
      ],
      defaultModel: 'qwen3:7b',
      loadedModel: null,
      selectedModel: '',
      setSelectedModel: mockSetSelectedModel,
      setModelAsDefault: mockSetModelAsDefault,
      spaces: [
        { id: 'space-1', name: 'Dokumentation', document_count: 10 },
        { id: 'space-2', name: 'FAQ', document_count: 5 },
      ],
    });
  });

  // =====================================================
  // Rendering
  // =====================================================
  describe('Rendering', () => {
    test('rendert Textarea', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    test('Textarea hat Standard-Placeholder', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByPlaceholderText('Nachricht eingeben...')).toBeInTheDocument();
    });

    test('rendert Send-Button', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByTitle('Senden')).toBeInTheDocument();
    });

    test('rendert Think-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByLabelText('Thinking deaktivieren')).toBeInTheDocument();
    });

    test('rendert RAG-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByLabelText('RAG aktivieren')).toBeInTheDocument();
    });

    test('rendert toolbar mit aria-label', () => {
      const { container } = render(<ChatInputArea {...defaultProps} />);
      const toolbar = container.querySelector('.chat-toolbar[role="toolbar"]');
      expect(toolbar).toHaveAttribute('aria-label', 'Chat-Einstellungen');
    });
  });

  // =====================================================
  // Textarea Interaktion
  // =====================================================
  describe('Textarea Interaktion', () => {
    test('Eingabe aendert Textarea-Wert', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hallo Welt');

      expect(textarea).toHaveValue('Hallo Welt');
    });

    test('Send-Button ist deaktiviert bei leerem Input', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByTitle('Senden')).toBeDisabled();
    });

    test('Send-Button ist aktiviert bei nicht-leerem Input', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.type(screen.getByRole('textbox'), 'Test');
      expect(screen.getByTitle('Senden')).not.toBeDisabled();
    });

    test('Enter sendet Nachricht', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.type(screen.getByRole('textbox'), 'Test Nachricht');
      await user.keyboard('{Enter}');

      expect(mockSendMessage).toHaveBeenCalledWith(
        1,
        'Test Nachricht',
        expect.objectContaining({ useRAG: false, useThinking: true })
      );
    });

    test('Input wird nach Senden geleert', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.type(screen.getByRole('textbox'), 'Test');
      await user.keyboard('{Enter}');

      expect(screen.getByRole('textbox')).toHaveValue('');
    });

    test('Textarea ist deaktiviert wenn disabled=true', () => {
      render(<ChatInputArea {...defaultProps} disabled={true} />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  // =====================================================
  // Think-Toggle
  // =====================================================
  describe('Think-Toggle', () => {
    test('Think ist standardmaessig aktiv', () => {
      render(<ChatInputArea {...defaultProps} />);
      const thinkToggle = screen.getByLabelText('Thinking deaktivieren');
      expect(thinkToggle).toHaveAttribute('aria-pressed', 'true');
    });

    test('Klick toggled Thinking und speichert', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('Thinking deaktivieren'));
      expect(screen.getByLabelText('Thinking aktivieren')).toHaveAttribute('aria-pressed', 'false');
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/chats/1/settings',
        { use_thinking: false },
        { showError: false }
      );
    });
  });

  // =====================================================
  // RAG-Toggle
  // =====================================================
  describe('RAG-Toggle', () => {
    test('RAG ist standardmaessig inaktiv', () => {
      render(<ChatInputArea {...defaultProps} />);
      const ragToggle = screen.getByLabelText('RAG aktivieren');
      expect(ragToggle).toHaveAttribute('aria-pressed', 'false');
    });

    test('Klick auf RAG wenn AUS schaltet RAG ein', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('RAG aktivieren'));

      expect(screen.getByLabelText('RAG deaktivieren')).toHaveAttribute('aria-pressed', 'true');
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/chats/1/settings',
        { use_rag: true },
        { showError: false }
      );
    });

    test('Placeholder aendert sich wenn RAG an', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('RAG aktivieren'));

      expect(screen.getByPlaceholderText('Frage zu Dokumenten stellen...')).toBeInTheDocument();
    });

    test('Zweiter Klick auf RAG-Button öffnet Popup', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      // First click: turn on RAG
      await user.click(screen.getByLabelText('RAG aktivieren'));
      // Second click: open popup
      await user.click(screen.getByLabelText('RAG deaktivieren'));

      expect(container.querySelector('.rag-popup')).toBeInTheDocument();
    });

    test('Space-Auswahl im Popup', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      // Turn on RAG
      await user.click(screen.getByLabelText('RAG aktivieren'));
      // Open popup
      await user.click(screen.getByLabelText('RAG deaktivieren'));
      // Select a space
      await user.click(screen.getByText('Dokumentation'));

      expect(mockApiPatch).toHaveBeenCalledWith(
        '/chats/1/settings',
        { preferred_space_id: 'space-1' },
        { showError: false }
      );
    });
  });

  // =====================================================
  // Model-Popup
  // =====================================================
  describe('Model-Popup', () => {
    test('zeigt Model-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByLabelText('Modell auswählen')).toBeInTheDocument();
    });

    test('Klick öffnet Model-Popup', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      const modelToggle = container.querySelector('.model-toggle');
      await user.click(modelToggle);

      expect(container.querySelector('.model-popup')).toBeInTheDocument();
    });

    test('zeigt verfügbare Modelle im Popup', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      await user.click(container.querySelector('.model-toggle'));

      expect(screen.getByText('Qwen3 7B')).toBeInTheDocument();
      expect(screen.getByText('Llama3 8B')).toBeInTheDocument();
    });

    test('Modell-Auswahl speichert Settings', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      await user.click(container.querySelector('.model-toggle'));
      await user.click(screen.getByText('Llama3 8B'));

      expect(mockSetSelectedModel).toHaveBeenCalledWith('llama3:8b');
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/chats/1/settings',
        { preferred_model: 'llama3:8b' },
        { showError: false }
      );
    });
  });

  // =====================================================
  // Settings-Persistenz
  // =====================================================
  describe('Settings-Persistenz', () => {
    test('initialisiert aus chatSettings', () => {
      render(
        <ChatInputArea
          {...defaultProps}
          chatSettings={{
            use_rag: true,
            use_thinking: false,
            preferred_model: 'llama3:8b',
            preferred_space_id: null,
          }}
        />
      );

      // RAG should be active
      expect(screen.getByLabelText('RAG deaktivieren')).toHaveAttribute('aria-pressed', 'true');
      // Think should be inactive
      expect(screen.getByLabelText('Thinking aktivieren')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // =====================================================
  // Cancel-Button
  // =====================================================
  describe('Cancel-Button', () => {
    test('zeigt Cancel-Button bei aktivem Stream', () => {
      chatCtx.activeJobIds = { 1: 'job-123' };
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByTitle('Abbrechen')).toBeInTheDocument();
      chatCtx.activeJobIds = {};
    });

    test('Cancel-Button ruft cancelJob auf', async () => {
      const user = userEvent.setup();
      chatCtx.activeJobIds = { 1: 'job-123' };
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByTitle('Abbrechen'));
      expect(mockCancelJob).toHaveBeenCalledWith(1);
      chatCtx.activeJobIds = {};
    });
  });

  // =====================================================
  // Error-Banner
  // =====================================================
  describe('Error-Banner', () => {
    test('zeigt Fehlermeldung wenn error gesetzt', () => {
      render(<ChatInputArea {...defaultProps} error="Verbindung fehlgeschlagen" />);
      expect(screen.getByText('Verbindung fehlgeschlagen')).toBeInTheDocument();
    });

    test('Error-Banner hat role=alert', () => {
      render(<ChatInputArea {...defaultProps} error="Fehler" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    test('Schliessen-Button ruft onClearError auf', async () => {
      const user = userEvent.setup();
      const onClearError = vi.fn();
      render(<ChatInputArea {...defaultProps} error="Fehler" onClearError={onClearError} />);

      await user.click(screen.getByLabelText('Fehlermeldung schließen'));
      expect(onClearError).toHaveBeenCalled();
    });

    test('zeigt kein Error-Banner wenn error null', () => {
      render(<ChatInputArea {...defaultProps} error={null} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Queue-Indikator
  // =====================================================
  describe('Queue-Indikator', () => {
    test('zeigt Queue-Position wenn Job in Warteschlange', () => {
      chatCtx.activeJobIds = { 1: 'job-q' };
      chatCtx.globalQueue = {
        pending_count: 3,
        processing: { id: 'job-other' },
        queue: [{ id: 'job-q' }],
      };

      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('von 3')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Layout-Klasse
  // =====================================================
  describe('Layout-Klasse', () => {
    test('hat centered-Klasse bei leerer Nachrichtenliste', () => {
      const { container } = render(<ChatInputArea {...defaultProps} hasMessages={false} />);
      expect(container.querySelector('.chat-input-section.centered')).toBeInTheDocument();
    });

    test('hat keine centered-Klasse bei vorhandenen Nachrichten', () => {
      const { container } = render(<ChatInputArea {...defaultProps} hasMessages={true} />);
      expect(container.querySelector('.chat-input-section.centered')).not.toBeInTheDocument();
    });
  });
});
