/**
 * ChatView Component Tests
 *
 * Tests fuer die Chat-Nachrichten-Ansicht:
 * - Skeleton-Loading bei initialem Laden
 * - Empty-State fuer leeren Chat
 * - Nachrichten werden gerendert
 * - Scroll-Button erscheint bei Scroll
 * - Escape-Taste navigiert zurueck
 * - Invalid chatId leitet um
 * - ChatTopBar und ChatInputArea sind eingebunden
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import ChatView from '../ChatView';

const mockNavigate = jest.fn();
let mockChatIdParam = '1';

jest.mock('react-router-dom', () => ({
  useParams: () => ({ chatId: mockChatIdParam }),
  useNavigate: () => mockNavigate,
}));

const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  request: jest.fn(),
};
jest.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => mockToast }));

const mockRegister = jest.fn();
const mockUnregister = jest.fn();
const mockCheckActiveJobs = jest.fn().mockResolvedValue(null);
const mockReconnectToJob = jest.fn();
const mockLoadMessages = jest.fn().mockResolvedValue({ messages: [], hasMore: false });
const mockGetBackgroundMessages = jest.fn().mockReturnValue(null);
const mockGetBackgroundLoading = jest.fn().mockReturnValue(false);
const mockClearBackgroundState = jest.fn();
const mockHasActiveStream = jest.fn().mockReturnValue(false);

jest.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    loadMessages: mockLoadMessages,
    registerMessageCallback: mockRegister,
    unregisterMessageCallback: mockUnregister,
    reconnectToJob: mockReconnectToJob,
    checkActiveJobs: mockCheckActiveJobs,
    activeJobIds: {},
    getBackgroundMessages: mockGetBackgroundMessages,
    getBackgroundLoading: mockGetBackgroundLoading,
    clearBackgroundState: mockClearBackgroundState,
    hasActiveStream: mockHasActiveStream,
  }),
}));

// Mock child components to isolate ChatView logic
jest.mock('../ChatTopBar', () => {
  return function MockChatTopBar({ chatId, title }) {
    return (
      <div data-testid="chat-top-bar" data-chat-id={chatId}>
        {title}
      </div>
    );
  };
});

jest.mock('../ChatInputArea', () => {
  return function MockChatInputArea({ chatId, disabled }) {
    return <div data-testid="chat-input-area" data-disabled={disabled} />;
  };
});

// Mock ChatMessage
jest.mock('../ChatMessage', () => {
  const React = require('react');
  return React.memo(function MockChatMessage({ message }) {
    return <div data-testid="chat-message">{message.content}</div>;
  });
});

describe('ChatView Component', () => {
  const mockChats = [
    { id: 1, title: 'Test Chat', project_id: 1, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, title: 'Anderer Chat', created_at: '2024-01-01T00:00:00Z' },
  ];

  const mockMessages = [
    { role: 'user', content: 'Hallo', status: 'completed' },
    { role: 'assistant', content: 'Wie kann ich helfen?', status: 'completed' },
  ];

  const mockProject = { id: 1, name: 'Projekt A', color: '#45ADFF' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChatIdParam = '1';

    mockApi.get.mockImplementation(url => {
      if (url.match(/\/chats\/\d+$/)) {
        const id = parseInt(url.split('/').pop(), 10);
        const chat = mockChats.find(c => c.id === id);
        if (!chat) return Promise.resolve({ chat: null });
        const project = chat.project_id === 1 ? mockProject : null;
        return Promise.resolve({ chat, project });
      }
      return Promise.resolve({});
    });

    mockLoadMessages.mockResolvedValue({
      messages: mockMessages.map(m => ({
        ...m,
        thinking: '',
        hasThinking: false,
        thinkingCollapsed: true,
        sources: [],
        sourcesCollapsed: true,
      })),
      hasMore: false,
    });
  });

  // =====================================================
  // Rendering
  // =====================================================
  describe('Rendering', () => {
    test('rendert ChatTopBar', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-top-bar')).toBeInTheDocument();
      });
    });

    test('rendert ChatInputArea', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-input-area')).toBeInTheDocument();
      });
    });

    test('hat main-Element mit chat-view Klasse', () => {
      const { container } = render(<ChatView />);
      expect(container.querySelector('main.chat-view')).toBeInTheDocument();
    });

    test('Messages-Bereich hat role=log', () => {
      render(<ChatView />);
      expect(screen.getByRole('log')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Skeleton Loading
  // =====================================================
  describe('Skeleton Loading', () => {
    test('zeigt Skeleton waehrend Nachrichten laden', () => {
      const { container } = render(<ChatView />);
      expect(container.querySelector('.skeleton-messages')).toBeInTheDocument();
    });

    test('zeigt Skeleton-Message-Elemente', () => {
      const { container } = render(<ChatView />);
      const skeletonMessages = container.querySelectorAll('.skeleton-message');
      expect(skeletonMessages.length).toBeGreaterThan(0);
    });

    test('Skeleton verschwindet nach Laden', async () => {
      const { container } = render(<ChatView />);

      await waitFor(() => {
        expect(container.querySelector('.skeleton-messages')).not.toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Nachrichten
  // =====================================================
  describe('Nachrichten', () => {
    test('rendert Nachrichten nach Laden', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByText('Hallo')).toBeInTheDocument();
        expect(screen.getByText('Wie kann ich helfen?')).toBeInTheDocument();
      });
    });

    test('zeigt Titel in ChatTopBar', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-top-bar')).toHaveTextContent('Test Chat');
      });
    });
  });

  // =====================================================
  // Empty State
  // =====================================================
  describe('Empty State', () => {
    test('zeigt Empty-State fuer Chat ohne Nachrichten', async () => {
      mockLoadMessages.mockResolvedValueOnce({ messages: [], hasMore: false });

      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByText('Wie kann ich dir heute helfen?')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Context-Registrierung
  // =====================================================
  describe('Context-Registrierung', () => {
    test('registriert Callbacks bei ChatContext', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            setMessages: expect.any(Function),
            setIsLoading: expect.any(Function),
            setError: expect.any(Function),
          })
        );
      });
    });

    test('unregistriert Callbacks bei Unmount', async () => {
      const { unmount } = render(<ChatView />);

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalled();
      });

      unmount();
      expect(mockUnregister).toHaveBeenCalledWith(1);
    });

    test('prueft auf aktive Jobs beim Laden', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(mockCheckActiveJobs).toHaveBeenCalledWith(1);
      });
    });
  });

  // =====================================================
  // Ungueltige Chat-ID
  // =====================================================
  describe('Ungueltige Chat-ID', () => {
    test('navigiert zu /chat bei ungueltigem chatId', async () => {
      mockChatIdParam = 'ungueltig';
      render(<ChatView />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
      });
    });

    test('navigiert zu /chat wenn Chat nicht gefunden', async () => {
      mockChatIdParam = '999';
      mockApi.get.mockImplementation(url => {
        if (url.match(/\/chats\/\d+$/)) return Promise.resolve({ chat: null });
        return Promise.resolve({});
      });

      render(<ChatView />);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
      });
    });
  });

  // =====================================================
  // Escape-Taste
  // =====================================================
  describe('Escape-Taste', () => {
    test('Escape navigiert zur Landing', async () => {
      render(<ChatView />);

      await waitFor(() => {
        expect(screen.getByTestId('chat-top-bar')).toBeInTheDocument();
      });

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockNavigate).toHaveBeenCalledWith('/chat');
    });
  });

  // =====================================================
  // Job-Reconnection
  // =====================================================
  describe('Job-Reconnection', () => {
    test('reconnected zu aktivem Job', async () => {
      mockCheckActiveJobs.mockResolvedValueOnce({ id: 'job-active', status: 'streaming' });

      render(<ChatView />);

      await waitFor(() => {
        expect(mockReconnectToJob).toHaveBeenCalledWith('job-active', 1);
      });
    });
  });
});
