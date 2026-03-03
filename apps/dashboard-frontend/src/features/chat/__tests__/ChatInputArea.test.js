/**
 * ChatInputArea Component Tests
 *
 * Tests fuer den Chat-Eingabebereich:
 * - Textarea Rendering und Interaktion
 * - Enter sendet, Shift+Enter neue Zeile
 * - Send-Button deaktiviert bei leerem Input
 * - RAG- und Think-Toggles
 * - Model-Dropdown
 * - Space-Selector (RAG-abhaengig)
 * - Cancel-Button bei laufendem Stream
 * - Queue-Indikator
 * - Error-Banner
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatInputArea from '../ChatInputArea';

jest.mock('../../../components/ui/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <span data-testid="loading-spinner" />;
  };
});

// Use a mutable container so the hoisted jest.mock can reference it
const chatCtx = {};

jest.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => chatCtx,
}));

const mockSendMessage = jest.fn();
const mockCancelJob = jest.fn();
const mockSetSelectedModel = jest.fn();
const mockToggleFavorite = jest.fn();
const mockSetModelAsDefault = jest.fn();

describe('ChatInputArea Component', () => {
  const messagesRef = { current: [] };

  const defaultProps = {
    chatId: 1,
    messagesRef,
    hasMessages: false,
    isLoading: false,
    error: null,
    onClearError: jest.fn(),
    disabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
      favoriteModels: [],
      toggleFavorite: mockToggleFavorite,
      setModelAsDefault: mockSetModelAsDefault,
      spaces: [
        { id: 1, name: 'Dokumentation', document_count: 10 },
        { id: 2, name: 'FAQ', document_count: 5 },
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

    test('Textarea hat Placeholder fuer RAG-Modus', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByPlaceholderText('Frage zu Dokumenten stellen...')).toBeInTheDocument();
    });

    test('rendert Send-Button', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByTitle('Senden')).toBeInTheDocument();
    });

    test('rendert RAG-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByLabelText('RAG deaktivieren')).toBeInTheDocument();
    });

    test('rendert Think-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByLabelText('Thinking deaktivieren')).toBeInTheDocument();
    });

    test('rendert toolbar mit aria-label', () => {
      const { container } = render(<ChatInputArea {...defaultProps} />);
      expect(container.querySelector('[role="toolbar"]')).toHaveAttribute(
        'aria-label',
        'Chat-Eingabe'
      );
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
        expect.objectContaining({ useRAG: true, useThinking: true })
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
  // RAG-Toggle
  // =====================================================
  describe('RAG-Toggle', () => {
    test('RAG ist standardmaessig aktiv', () => {
      render(<ChatInputArea {...defaultProps} />);
      const ragToggle = screen.getByLabelText('RAG deaktivieren');
      expect(ragToggle).toHaveAttribute('aria-pressed', 'true');
    });

    test('Klick auf RAG-Toggle deaktiviert RAG', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('RAG deaktivieren'));

      expect(screen.getByLabelText('RAG aktivieren')).toHaveAttribute('aria-pressed', 'false');
    });

    test('Placeholder aendert sich wenn RAG aus', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('RAG deaktivieren'));

      expect(screen.getByPlaceholderText('Nachricht eingeben...')).toBeInTheDocument();
    });

    test('Space-Selector verschwindet wenn RAG aus', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      expect(container.querySelector('.space-selector')).toBeInTheDocument();

      await user.click(screen.getByLabelText('RAG deaktivieren'));

      expect(container.querySelector('.space-selector')).not.toBeInTheDocument();
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

    test('Klick toggled Thinking', async () => {
      const user = userEvent.setup();
      render(<ChatInputArea {...defaultProps} />);

      await user.click(screen.getByLabelText('Thinking deaktivieren'));
      expect(screen.getByLabelText('Thinking aktivieren')).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // =====================================================
  // Model-Dropdown
  // =====================================================
  describe('Model-Dropdown', () => {
    test('zeigt Model-Toggle', () => {
      render(<ChatInputArea {...defaultProps} />);
      expect(screen.getByText('Standard')).toBeInTheDocument();
    });

    test('Klick oeffnet Model-Dropdown', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      const modelToggle = container.querySelector('.model-toggle');
      await user.click(modelToggle);

      expect(container.querySelector('.model-dropdown')).toBeInTheDocument();
    });

    test('zeigt installierte Modelle im Dropdown', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatInputArea {...defaultProps} />);

      await user.click(container.querySelector('.model-toggle'));

      expect(screen.getByText('Qwen3 7B')).toBeInTheDocument();
      expect(screen.getByText('Llama3 8B')).toBeInTheDocument();
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
      const onClearError = jest.fn();
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
      // Queue position is array index + 1 = 1
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
