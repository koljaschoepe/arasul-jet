/**
 * ChatLanding Component Tests
 *
 * Tests für die Chat-Übersichtsseite:
 * - Rendering: Header, Suchfeld, Projekte, Letzte Chats
 * - Skeleton-Loading
 * - Suche: Debounce, Ergebnis-Anzeige, Leere Ergebnisse
 * - Projekt-Filter-Chips
 * - Neues Projekt Button
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatLanding from '../ChatLanding';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi }));

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => mockToast }));

vi.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({ activeJobIds: {} }),
}));

const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock('../../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: mockConfirm,
    ConfirmDialog: null,
  }),
}));

// Mock ProjectModal
vi.mock('../../projects', () => ({
  ProjectModal: function MockProjectModal({ isOpen }) {
    return isOpen ? <div data-testid="project-modal">Modal</div> : null;
  },
}));

// Mock EmptyState
vi.mock('../../../components/ui/EmptyState', () => ({
  default: function MockEmptyState({ title }) {
    return <div data-testid="empty-state">{title}</div>;
  },
}));

describe('ChatLanding Component', () => {
  const mockProjects = [
    {
      id: 1,
      name: 'Allgemein',
      color: '#45ADFF',
      is_default: true,
      conversation_count: 3,
      conversations: [
        { id: 10, title: 'Chat A', updated_at: '2024-01-15T10:00:00Z' },
        { id: 11, title: 'Chat B', updated_at: '2024-01-14T09:00:00Z' },
        { id: 12, title: 'Chat C', updated_at: '2024-01-13T08:00:00Z' },
      ],
    },
    {
      id: 2,
      name: 'Projekt X',
      color: '#22c55e',
      is_default: false,
      conversation_count: 1,
      conversations: [{ id: 20, title: 'Technischer Chat', updated_at: '2024-01-12T07:00:00Z' }],
    },
  ];

  const mockRecentChats = [
    {
      id: 10,
      title: 'Chat A',
      project_name: 'Allgemein',
      project_color: '#45ADFF',
      updated_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 20,
      title: 'Technischer Chat',
      project_name: 'Projekt X',
      project_color: '#22c55e',
      updated_at: '2024-01-12T07:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockApi.get.mockImplementation(url => {
      if (url.includes('/projects')) return Promise.resolve({ projects: mockProjects });
      if (url.includes('/chats/recent')) return Promise.resolve({ chats: mockRecentChats });
      if (url.includes('/chats/search')) return Promise.resolve({ chats: [] });
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =====================================================
  // Rendering
  // =====================================================
  describe('Rendering', () => {
    test('zeigt Header mit Chat-Titel', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chat');
      });
    });

    test('zeigt Neues-Projekt-Button', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByText('Neues Projekt')).toBeInTheDocument();
      });
    });

    test('zeigt Suchfeld', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Chats durchsuchen...')).toBeInTheDocument();
      });
    });

    test('zeigt Projekte nach Laden', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        // "Allgemein" appears in filter chip AND project card, so use getAllByText
        expect(screen.getAllByText('Allgemein').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Projekt X').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('zeigt Letzte Chats nach Laden', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByText('Letzte Chats')).toBeInTheDocument();
        expect(screen.getByText('Chat A')).toBeInTheDocument();
      });
    });

    test('zeigt Projekte-Sektion', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByText('Projekte')).toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Skeleton Loading
  // =====================================================
  describe('Skeleton Loading', () => {
    test('zeigt Skeleton beim initialen Laden', () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      const { container } = render(<ChatLanding />);
      expect(container.querySelector('.chat-landing-skeleton')).toBeInTheDocument();
    });

    test('Skeleton verschwindet nach Laden', async () => {
      const { container } = render(<ChatLanding />);

      await waitFor(() => {
        expect(container.querySelector('.chat-landing-skeleton')).not.toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Suche
  // =====================================================
  describe('Suche', () => {
    test('Suche löst API-Aufruf aus (debounced)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Chats durchsuchen...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Chats durchsuchen...'), 'Test');

      // Debounce (300ms)
      vi.advanceTimersByTime(350);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          expect.stringContaining('/chats/search'),
          expect.any(Object)
        );
      });
    });

    test('zeigt Leere-Suche-Meldung', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockApi.get.mockImplementation(url => {
        if (url.includes('/projects')) return Promise.resolve({ projects: mockProjects });
        if (url.includes('/chats/recent')) return Promise.resolve({ chats: mockRecentChats });
        if (url.includes('/chats/search')) return Promise.resolve({ chats: [] });
        return Promise.resolve({});
      });

      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Chats durchsuchen...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Chats durchsuchen...'), 'xyzunfindbar');
      vi.advanceTimersByTime(350);

      await waitFor(() => {
        expect(screen.getByText(/Keine Chats gefunden/)).toBeInTheDocument();
      });
    });

    test('Suche-Leeren-Button setzt Suche zurück', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Chats durchsuchen...')).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText('Chats durchsuchen...'), 'Test');

      const clearBtn = screen.getByLabelText('Suche leeren');
      await user.click(clearBtn);

      expect(screen.getByPlaceholderText('Chats durchsuchen...')).toHaveValue('');
    });
  });

  // =====================================================
  // Filter-Chips
  // =====================================================
  describe('Filter-Chips', () => {
    test('zeigt Filter-Chips für Projekte', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        const chips = screen.getAllByText(/Allgemein|Projekt X/);
        expect(chips.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // =====================================================
  // Neues Projekt
  // =====================================================
  describe('Neues Projekt', () => {
    test('öffnet Modal bei Klick auf Neues-Projekt', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByText('Neues Projekt')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Neues Projekt'));

      expect(screen.getByTestId('project-modal')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Accessibility
  // =====================================================
  describe('Accessibility', () => {
    test('hat main-Element', async () => {
      const { container } = render(<ChatLanding />);

      await waitFor(() => {
        expect(container.querySelector('main.chat-landing')).toBeInTheDocument();
      });
    });

    test('hat header-Element', async () => {
      render(<ChatLanding />);

      await waitFor(() => {
        expect(screen.getByRole('banner')).toBeInTheDocument();
      });
    });
  });
});
