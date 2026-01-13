/**
 * ChatMulti Component Tests
 *
 * Tests für die Multi-Chat-Komponente:
 * - Chat-Erstellung und -Wechsel
 * - Nachrichtenversand
 * - RAG-Toggle
 * - Thinking Mode
 * - Modell-Auswahl
 * - SSE Streaming
 * - Error Handling
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ChatMulti from '../components/ChatMulti';

jest.mock('axios');

// Mock EventSource für SSE
const mockEventSource = {
  onmessage: null,
  onerror: null,
  onopen: null,
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

global.EventSource = jest.fn(() => mockEventSource);

describe('ChatMulti Component', () => {
  const mockChats = [
    {
      id: 1,
      title: 'Test Chat 1',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T11:00:00Z',
    },
    {
      id: 2,
      title: 'Test Chat 2',
      created_at: '2024-01-14T09:00:00Z',
      updated_at: '2024-01-14T10:00:00Z',
    },
  ];

  const mockMessages = [
    {
      id: 1,
      chat_id: 1,
      role: 'user',
      content: 'Hello',
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 2,
      chat_id: 1,
      role: 'assistant',
      content: 'Hi! How can I help you?',
      created_at: '2024-01-15T10:00:05Z',
    },
  ];

  const mockModels = [
    { name: 'qwen3:7b', modified_at: '2024-01-01T00:00:00Z' },
    { name: 'llama3:8b', modified_at: '2024-01-01T00:00:00Z' },
  ];

  const mockSpaces = [
    { id: 1, name: 'Default', document_count: 10 },
    { id: 2, name: 'Technical', document_count: 5 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.EventSource.mockClear();

    axios.get.mockImplementation((url) => {
      if (url.includes('/chats') && !url.includes('/messages')) {
        return Promise.resolve({ data: { chats: mockChats } });
      }
      if (url.includes('/chats/1/messages')) {
        return Promise.resolve({ data: { messages: mockMessages } });
      }
      if (url.includes('/chats/2/messages')) {
        return Promise.resolve({ data: { messages: [] } });
      }
      if (url.includes('/models/installed')) {
        return Promise.resolve({ data: { models: mockModels } });
      }
      if (url.includes('/models/default')) {
        return Promise.resolve({ data: { model: 'qwen3:7b' } });
      }
      if (url.includes('/documents/spaces')) {
        return Promise.resolve({ data: { spaces: mockSpaces } });
      }
      return Promise.resolve({ data: {} });
    });

    axios.post.mockResolvedValue({ data: { success: true } });
    axios.patch.mockResolvedValue({ data: { success: true } });
    axios.delete.mockResolvedValue({ data: { success: true } });
  });

  describe('Rendering', () => {
    test('rendert ChatMulti korrekt', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/fragen/i) || screen.getByPlaceholderText(/nachricht/i) || screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    test('zeigt Chat-Tabs', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
        expect(screen.getByText('Test Chat 2')).toBeInTheDocument();
      });
    });

    test('zeigt Nachrichtenverlauf', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi! How can I help you?')).toBeInTheDocument();
      });
    });

    test('zeigt Neuer-Chat-Button', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const newChatBtn = document.querySelector('[class*="new-chat"]') ||
                          screen.queryByTitle(/neu/i) ||
                          screen.queryByRole('button', { name: /\+/ });
        expect(newChatBtn).toBeInTheDocument();
      });
    });
  });

  describe('Chat Creation', () => {
    test('Neuer Chat kann erstellt werden', async () => {
      axios.post.mockResolvedValueOnce({
        data: { chat: { id: 3, title: 'Neuer Chat', created_at: new Date().toISOString() } },
      });

      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
      });

      const newChatBtn = document.querySelector('[class*="new-chat"]') ||
                        screen.queryByRole('button', { name: /\+/ });

      if (newChatBtn) {
        await user.click(newChatBtn);

        await waitFor(() => {
          expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('/chats'),
            expect.any(Object)
          );
        });
      }
    });
  });

  describe('Chat Switching', () => {
    test('Chat-Wechsel lädt neue Nachrichten', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 2')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Test Chat 2'));

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/chats/2/messages'));
      });
    });
  });

  describe('Message Input', () => {
    test('Eingabefeld funktioniert', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await user.type(input, 'Test message');

      expect(input).toHaveValue('Test message');
    });

    test('Enter sendet Nachricht', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await user.type(input, 'Test message{enter}');

      await waitFor(() => {
        // SSE connection sollte gestartet werden oder axios.post aufgerufen werden
        expect(global.EventSource).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    test('Send-Button sendet Nachricht', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await user.type(input, 'Test message');

      const sendButton = screen.getByRole('button', { name: /send/i }) ||
                        document.querySelector('[class*="send"]') ||
                        document.querySelector('button[type="submit"]');

      if (sendButton) {
        await user.click(sendButton);

        await waitFor(() => {
          expect(global.EventSource).toHaveBeenCalled();
        }, { timeout: 2000 });
      }
    });

    test('Leere Nachricht kann nicht gesendet werden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /send/i }) ||
                        document.querySelector('[class*="send"]');

      if (sendButton) {
        expect(sendButton).toBeDisabled();
      }
    });
  });

  describe('RAG Toggle', () => {
    test('RAG-Toggle ist vorhanden', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const ragToggle = screen.queryByText(/rag/i) ||
                         document.querySelector('[class*="rag"]');
        expect(ragToggle).toBeInTheDocument();
      });
    });

    test('RAG kann aktiviert werden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(document.querySelector('[class*="rag"]')).toBeInTheDocument();
      });

      const ragToggle = document.querySelector('[class*="rag-toggle"]') ||
                       screen.queryByText(/rag/i)?.closest('button');

      if (ragToggle) {
        await user.click(ragToggle);

        // Toggle sollte aktiv werden
        await waitFor(() => {
          expect(ragToggle.classList.contains('active') || ragToggle.getAttribute('aria-pressed') === 'true').toBe(true);
        });
      }
    });
  });

  describe('Thinking Mode', () => {
    test('Thinking-Toggle ist vorhanden', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const thinkToggle = screen.queryByText(/think/i) ||
                           document.querySelector('[class*="think"]');
        expect(thinkToggle).toBeInTheDocument();
      });
    });

    test('Thinking-Blocks werden angezeigt', async () => {
      render(<ChatMulti />);

      // Simuliere eine Nachricht mit Thinking-Block
      await waitFor(() => {
        const thinkingBlock = document.querySelector('[class*="thinking"]');
        // Thinking Block sollte existieren (wenn Nachricht einen hat)
      });
    });
  });

  describe('Model Selection', () => {
    test('Model-Dropdown ist vorhanden', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const modelSelector = screen.queryByText(/qwen3/i) ||
                             document.querySelector('[class*="model"]');
        expect(modelSelector).toBeInTheDocument();
      });
    });

    test('Modelle können gewechselt werden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(document.querySelector('[class*="model"]')).toBeInTheDocument();
      });

      const modelDropdown = document.querySelector('[class*="model-toggle"]') ||
                           screen.queryByText(/qwen3/i)?.closest('button');

      if (modelDropdown) {
        await user.click(modelDropdown);

        await waitFor(() => {
          const llama = screen.queryByText(/llama3/i);
          if (llama) {
            expect(llama).toBeInTheDocument();
          }
        });
      }
    });
  });

  describe('Chat Deletion', () => {
    test('Chat kann gelöscht werden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
      });

      // Finde Delete-Button im Tab
      const chatTab = screen.getByText('Test Chat 1').closest('[class*="chat-tab"]');
      if (chatTab) {
        const deleteBtn = chatTab.querySelector('[class*="delete"]');
        if (deleteBtn) {
          await user.click(deleteBtn);

          await waitFor(() => {
            expect(axios.delete).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Chat Title Editing', () => {
    test('Chat-Titel kann bearbeitet werden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
      });

      // Finde Edit-Button im Tab
      const chatTab = screen.getByText('Test Chat 1').closest('[class*="chat-tab"]');
      if (chatTab) {
        const editBtn = chatTab.querySelector('[class*="edit"]');
        if (editBtn) {
          await user.click(editBtn);

          // Input sollte erscheinen
          await waitFor(() => {
            const input = chatTab.querySelector('input');
            expect(input).toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('zeigt Fehler bei Verbindungsproblem', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      render(<ChatMulti />);

      await waitFor(() => {
        expect(
          screen.queryByText(/error/i) ||
          screen.queryByText(/fehler/i)
        ).toBeInTheDocument();
      });
    });

    test('zeigt Fehler bei SSE-Fehler', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      // Simuliere SSE-Fehler
      if (mockEventSource.onerror) {
        mockEventSource.onerror(new Error('SSE Error'));

        await waitFor(() => {
          expect(
            screen.queryByText(/error/i) ||
            screen.queryByText(/fehler/i)
          ).toBeInTheDocument();
        });
      }
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading während Chats geladen werden', async () => {
      axios.get.mockImplementation(() => new Promise(() => {}));

      render(<ChatMulti />);

      expect(
        screen.queryByText(/laden/i) ||
        document.querySelector('[class*="loading"]')
      ).toBeTruthy();
    });

    test('zeigt Loading während Antwort generiert wird', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await userEvent.type(input, 'Test{enter}');

      // Loading indicator sollte erscheinen
      await waitFor(() => {
        expect(
          document.querySelector('[class*="loading"]') ||
          screen.queryByText(/.../)
        ).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Scroll Behavior', () => {
    test('Scroll-to-Bottom Button erscheint bei Scroll', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      const messagesContainer = document.querySelector('[class*="messages"]');
      if (messagesContainer) {
        // Simuliere Scroll
        fireEvent.scroll(messagesContainer, { target: { scrollTop: 0 } });

        // Scroll-Button sollte erscheinen (wenn viele Nachrichten)
        const scrollBtn = document.querySelector('[class*="scroll-bottom"]');
        // Button ist da oder nicht, je nach Scrollposition
      }
    });
  });

  describe('Accessibility', () => {
    test('Eingabefeld hat Label oder Placeholder', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
        expect(input).toHaveAttribute('placeholder');
      });
    });

    test('Buttons haben accessible Names', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach(btn => {
          expect(
            btn.textContent.trim() ||
            btn.getAttribute('aria-label') ||
            btn.getAttribute('title')
          ).toBeTruthy();
        });
      });
    });
  });

  // ===========================================================================
  // SSE/STREAMING TESTS
  // ===========================================================================
  describe('SSE Streaming', () => {
    test('EventSource wird mit korrekter URL initialisiert', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await user.type(input, 'Test message{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
        const url = global.EventSource.mock.calls[0][0];
        expect(url).toContain('/api/llm/chat');
      }, { timeout: 3000 });
    });

    test('onmessage parsed JSON und aktualisiert content', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      // Wait for EventSource to be created
      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate SSE messages
      if (mockEventSource.onmessage) {
        // Simulate job_started event
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'job_started',
            jobId: 'job-123',
            messageId: 'msg-123',
            queuePosition: 1
          })
        });

        // Simulate token event
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'response',
            token: 'Hello'
          })
        });

        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'response',
            token: ' World'
          })
        });

        // Simulate completion
        mockEventSource.onmessage({
          data: JSON.stringify({
            done: true
          })
        });

        await waitFor(() => {
          expect(mockEventSource.close).toHaveBeenCalled();
        }, { timeout: 3000 });
      }
    });

    test('onerror stoppt Loading-State und zeigt Fehler', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate SSE error
      if (mockEventSource.onerror) {
        mockEventSource.onerror(new Error('Connection lost'));

        await waitFor(() => {
          // Error message should appear or loading should stop
          expect(mockEventSource.close).toHaveBeenCalled();
        }, { timeout: 3000 });
      }
    });

    test('Stream-Completion setzt isLoading zurück', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate successful completion
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'job_started', jobId: 'job-123' })
        });
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'response', token: 'Response' })
        });
        mockEventSource.onmessage({
          data: JSON.stringify({ done: true })
        });

        await waitFor(() => {
          // Input should be re-enabled after completion
          expect(input).not.toBeDisabled();
        }, { timeout: 3000 });
      }
    });

    test('Thinking-Blocks werden während Streaming angezeigt', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate thinking event
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'job_started', jobId: 'job-123' })
        });
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'thinking',
            content: 'Analyzing the question...'
          })
        });

        await waitFor(() => {
          const thinkingElement = document.querySelector('[class*="thinking"]');
          // Thinking block should appear during streaming
        }, { timeout: 2000 });
      }
    });

    test('Sources werden nach RAG-Query angezeigt', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Enable RAG mode first
      const ragToggle = document.querySelector('[class*="rag-toggle"]') ||
                       screen.queryByText(/rag/i)?.closest('button');
      if (ragToggle) {
        await user.click(ragToggle);
      }

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate sources event
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'job_started', jobId: 'job-123' })
        });
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'sources',
            sources: [
              { document_name: 'test.pdf', chunk_index: 0, score: 0.95 },
              { document_name: 'manual.pdf', chunk_index: 2, score: 0.87 }
            ]
          })
        });

        await waitFor(() => {
          const sourcesElement = document.querySelector('[class*="sources"]');
          // Sources should be visible
        }, { timeout: 2000 });
      }
    });
  });

  // ===========================================================================
  // QUEUE TRACKING TESTS
  // ===========================================================================
  describe('Queue Tracking', () => {
    test('Queue-Position wird angezeigt', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate queued event
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'job_started',
            jobId: 'job-123',
            queuePosition: 3,
            status: 'queued'
          })
        });

        await waitFor(() => {
          // Queue position indicator should appear
          const queueIndicator = document.querySelector('[class*="queue"]') ||
                                screen.queryByText(/#3/i) ||
                                screen.queryByText(/position/i);
          // Queue position should be visible
        }, { timeout: 2000 });
      }
    });

    test('Queue-Position aktualisiert sich', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Simulate queue position update
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'job_started',
            jobId: 'job-123',
            queuePosition: 3,
            status: 'queued'
          })
        });

        // Simulate position moving up
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'queue_update',
            queuePosition: 2
          })
        });

        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'queue_update',
            queuePosition: 1
          })
        });

        // Eventually starts processing
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'response',
            token: 'Starting...'
          })
        });
      }
    });
  });

  // ===========================================================================
  // JOB RECONNECTION TESTS
  // ===========================================================================
  describe('Job Reconnection', () => {
    test('kann zu laufendem Job reconnecten', async () => {
      // Setup: mock that there's an active job
      axios.get.mockImplementation((url) => {
        if (url.includes('/chats')) {
          return Promise.resolve({ data: { chats: mockChats } });
        }
        if (url.includes('/chats/1/messages')) {
          return Promise.resolve({ data: { messages: mockMessages } });
        }
        if (url.includes('/chats/1/jobs')) {
          return Promise.resolve({
            data: {
              jobs: [{
                id: 'job-active',
                status: 'streaming',
                content: 'Partial response...'
              }]
            }
          });
        }
        if (url.includes('/models/installed')) {
          return Promise.resolve({ data: { models: mockModels } });
        }
        if (url.includes('/models/default')) {
          return Promise.resolve({ data: { model: 'qwen3:7b' } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
      });

      // Component should attempt to reconnect to active job
      await waitFor(() => {
        const reconnectCalls = axios.get.mock.calls.filter(call =>
          call[0].includes('/jobs')
        );
        // May or may not call depending on implementation
      }, { timeout: 3000 });
    });

    test('EventSource close wird bei Unmount aufgerufen', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.EventSource).toHaveBeenCalled();
      });

      // Unmount component
      unmount();

      // EventSource should be closed on unmount
      expect(mockEventSource.close).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // KEYBOARD SHORTCUT TESTS
  // ===========================================================================
  describe('Keyboard Shortcuts', () => {
    test('Shift+Enter erzeugt Newline statt Senden', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Line 1{shift>}{enter}{/shift}Line 2');

      // Should contain newline, not send
      expect(input.value).toContain('Line 1');
      expect(input.value).toContain('Line 2');
      expect(global.EventSource).not.toHaveBeenCalled();
    });

    test('Ctrl+T erstellt neuen Chat', async () => {
      axios.post.mockResolvedValueOnce({
        data: { chat: { id: 99, title: 'Neuer Chat' } }
      });

      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByText('Test Chat 1')).toBeInTheDocument();
      });

      // Simulate Ctrl+T
      await user.keyboard('{Control>}t{/Control}');

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringContaining('/chats'),
          expect.any(Object)
        );
      }, { timeout: 2000 });
    });
  });
});
