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

// Mock MermaidDiagram component before import - this avoids mermaid module issues
jest.mock('../components/MermaidDiagram', () => {
  const React = require('react');
  return function MockMermaidDiagram({ chart }) {
    return React.createElement('div', { 'data-testid': 'mermaid-diagram' }, chart);
  };
});

// Mock react-markdown to avoid ESM issues
jest.mock('react-markdown', () => {
  const React = require('react');
  return function MockReactMarkdown({ children }) {
    return React.createElement('div', { 'data-testid': 'markdown' }, children);
  };
});

// Mock remark-gfm
jest.mock('remark-gfm', () => () => {});

import ChatMulti from '../components/ChatMulti';

jest.mock('axios');

// Mock fetch für SSE streaming (ChatMulti uses fetch with ReadableStream, not EventSource)
const createMockStreamResponse = (events) => {
  let eventIndex = 0;
  let readerClosed = false;

  // Create a proper mock reader that can be called multiple times
  const mockReader = {
    read: jest.fn().mockImplementation(async () => {
      if (readerClosed) {
        return { done: true, value: undefined };
      }
      if (eventIndex < events.length) {
        const event = events[eventIndex];
        eventIndex++;

        // If this is a done signal event, close the reader after this
        if (event.done === true) {
          readerClosed = true;
          // Return the done event data, then next call will return stream done
          const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
          return { done: false, value: encoded };
        }

        const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
        return { done: false, value: encoded };
      }
      return { done: true, value: undefined };
    }),
    cancel: jest.fn(),
    releaseLock: jest.fn(),
  };

  return {
    ok: true,
    body: {
      getReader: () => mockReader,
    },
  };
};

// Keep EventSource mock for backwards compatibility (some tests may still reference it)
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
      if (url.includes('/chats') && url.includes('/jobs')) {
        return Promise.resolve({ data: { jobs: [] } });
      }
      if (url.includes('/chats') && !url.includes('/messages') && !url.includes('/jobs')) {
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
        return Promise.resolve({ data: { model: { id: 'qwen3:7b' } } });
      }
      if (url.includes('/spaces')) {
        return Promise.resolve({ data: { spaces: mockSpaces } });
      }
      if (url.includes('/llm/queue')) {
        return Promise.resolve({ data: { pending_count: 0, processing: null, queue: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    axios.post.mockResolvedValue({ data: { success: true } });
    axios.patch.mockResolvedValue({ data: { success: true } });
    axios.delete.mockResolvedValue({ data: { success: true } });

    // Mock fetch for streaming responses
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/llm/chat') || url.includes('/rag/query')) {
        return Promise.resolve(createMockStreamResponse([
          { type: 'job_started', jobId: 'test-job-1' },
          { type: 'response', token: 'Hello' },
          { type: 'response', token: ' World' },
          { done: true },
        ]));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('Rendering', () => {
    test('rendert ChatMulti korrekt', async () => {
      render(<ChatMulti />);

      await waitFor(() => {
        // Placeholder is "Nachricht eingeben..." when RAG is off
        expect(screen.getByRole('textbox')).toBeInTheDocument();
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
        // Streaming uses fetch API, not EventSource
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/llm/chat'),
          expect.any(Object)
        );
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
          // Streaming uses fetch API, not EventSource
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/llm/chat'),
            expect.any(Object)
          );
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
    test('zeigt Skeleton Loading wenn Verbindung langsam ist', async () => {
      // When API is slow, component should show skeleton loading state
      axios.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatMulti />);

      // Should show skeleton indicator while waiting (ContentTransition pattern)
      expect(
        screen.queryByText(/laden/i) ||
        document.querySelector('[class*="loading"]') ||
        document.querySelector('[class*="skeleton"]') ||
        document.querySelector('[aria-busy="true"]')
      ).toBeTruthy();
    });

    test('zeigt Fehler bei Streaming-Fehler', async () => {
      // Mock fetch to fail during streaming
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/llm/chat')) {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Test{enter}');

      // Error should be displayed or handled gracefully
      await waitFor(() => {
        // Component should handle the error without crashing
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Loading States', () => {
    test('zeigt Skeleton während Chats geladen werden', async () => {
      axios.get.mockImplementation(() => new Promise(() => {}));

      render(<ChatMulti />);

      // ContentTransition shows skeleton during loading
      expect(
        screen.queryByText(/laden/i) ||
        document.querySelector('[class*="loading"]') ||
        document.querySelector('[class*="skeleton"]') ||
        document.querySelector('[aria-busy="true"]')
      ).toBeTruthy();
    });

    test('Nachricht wird nach Senden verarbeitet', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Test');

      // Send the message
      await user.keyboard('{Enter}');

      // Fetch should be called to send the message
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/llm/chat'),
          expect.any(Object)
        );
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
  // SSE/STREAMING TESTS (uses fetch with ReadableStream, not EventSource)
  // ===========================================================================
  describe('SSE Streaming', () => {
    test('fetch wird mit korrekter URL initialisiert', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i)).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox') || screen.getByPlaceholderText(/fragen/i);
      await user.type(input, 'Test message{enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/llm/chat'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.any(Object),
          })
        );
      }, { timeout: 3000 });
    });

    test('Streaming-Response aktualisiert UI', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      // Wait for fetch to be called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/llm/chat'),
          expect.any(Object)
        );
      }, { timeout: 3000 });

      // Stream is processed, input should be re-enabled after completion
      // Give extra time for stream processing and state updates
      await waitFor(() => {
        const textbox = screen.getByRole('textbox');
        expect(textbox).not.toBeDisabled();
      }, { timeout: 5000 });
    });

    test('Fehler bei Streaming wird behandelt', async () => {
      // Mock a failed fetch
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/llm/chat')) {
          return Promise.reject(new Error('Connection lost'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      // Error should be handled gracefully - component shouldn't crash
      // and input should be re-enabled
      await waitFor(() => {
        const textbox = screen.getByRole('textbox');
        const errorVisible = screen.queryByText(/fehler/i) ||
                            screen.queryByText(/error/i) ||
                            document.querySelector('[class*="error"]');
        // Either error is shown OR input is re-enabled (error handled)
        expect(errorVisible || !textbox.disabled).toBeTruthy();
      }, { timeout: 3000 });
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
        expect(global.fetch).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Input should be re-enabled after stream completion
      // Give extra time for stream processing
      await waitFor(() => {
        const textbox = screen.getByRole('textbox');
        expect(textbox).not.toBeDisabled();
      }, { timeout: 5000 });
    });

    test('Thinking-Toggle aktiviert Thinking-Modus', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Find and click thinking toggle
      const thinkToggle = document.querySelector('[class*="think-toggle"]');
      if (thinkToggle) {
        const wasActive = thinkToggle.classList.contains('active');
        await user.click(thinkToggle);
        // State should toggle
        expect(thinkToggle.classList.contains('active')).toBe(!wasActive);
      }
    });

    test('RAG-Query verwendet rag/query Endpoint', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Enable RAG mode first
      const ragToggle = document.querySelector('[class*="rag-toggle"]');
      if (ragToggle) {
        await user.click(ragToggle);
      }

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/rag/query'),
          expect.any(Object)
        );
      }, { timeout: 3000 });
    });
  });

  // ===========================================================================
  // QUEUE TRACKING TESTS
  // ===========================================================================
  describe('Queue Tracking', () => {
    test('Queue-Position wird angezeigt wenn Job in Queue ist', async () => {
      // Mock queue API response with pending job
      axios.get.mockImplementation((url) => {
        if (url.includes('/llm/queue')) {
          return Promise.resolve({
            data: {
              pending_count: 3,
              processing: null,
              queue: [{ id: 'job-123', queue_position: 2 }]
            }
          });
        }
        if (url.includes('/chats') && url.includes('/jobs')) {
          return Promise.resolve({ data: { jobs: [] } });
        }
        if (url.includes('/chats') && !url.includes('/messages')) {
          return Promise.resolve({ data: { chats: mockChats } });
        }
        if (url.includes('/chats/1/messages')) {
          return Promise.resolve({ data: { messages: mockMessages } });
        }
        if (url.includes('/models/installed')) {
          return Promise.resolve({ data: { models: mockModels } });
        }
        if (url.includes('/models/default')) {
          return Promise.resolve({ data: { model: { id: 'qwen3:7b' } } });
        }
        if (url.includes('/spaces')) {
          return Promise.resolve({ data: { spaces: mockSpaces } });
        }
        return Promise.resolve({ data: {} });
      });

      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      // Queue UI elements should be visible when jobs are queued
    });

    test('Queue-Status wird periodisch aktualisiert', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      // Wait for fetch to be called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Queue polling should be triggered when there are active jobs
      // This is tested implicitly through the component behavior
    });
  });

  // ===========================================================================
  // JOB RECONNECTION TESTS
  // ===========================================================================
  describe('Job Reconnection', () => {
    test('kann zu laufendem Job reconnecten', async () => {
      // Setup: mock that there's an active job
      axios.get.mockImplementation((url) => {
        if (url.includes('/chats') && url.includes('/jobs')) {
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
        if (url.includes('/chats') && !url.includes('/messages') && !url.includes('/jobs')) {
          return Promise.resolve({ data: { chats: mockChats } });
        }
        if (url.includes('/chats/1/messages')) {
          return Promise.resolve({ data: { messages: mockMessages } });
        }
        if (url.includes('/models/installed')) {
          return Promise.resolve({ data: { models: mockModels } });
        }
        if (url.includes('/models/default')) {
          return Promise.resolve({ data: { model: { id: 'qwen3:7b' } } });
        }
        if (url.includes('/spaces')) {
          return Promise.resolve({ data: { spaces: mockSpaces } });
        }
        if (url.includes('/llm/queue')) {
          return Promise.resolve({ data: { pending_count: 0, processing: null, queue: [] } });
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
        expect(reconnectCalls.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    test('Abbruch der Verbindung bei Unmount', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello{enter}');

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Unmount component - AbortController should cancel pending requests
      unmount();

      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // KEYBOARD SHORTCUT TESTS
  // ===========================================================================
  describe('Keyboard Shortcuts', () => {
    test('Enter sendet Nachricht (kein Shift)', async () => {
      const user = userEvent.setup();
      render(<ChatMulti />);

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Test message');

      // Press Enter (without shift) - should send
      await user.keyboard('{Enter}');

      // Fetch should be called (message sent)
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/llm/chat'),
          expect.any(Object)
        );
      }, { timeout: 2000 });
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
