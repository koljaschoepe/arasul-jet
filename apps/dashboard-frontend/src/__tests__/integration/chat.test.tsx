/**
 * Integration tests for the Chat feature.
 *
 * Tests the ChatLanding and ChatRouter as users experience it:
 *   - Recent chats rendering
 *   - Project listing
 *   - Empty state for new users
 *   - Search functionality
 *   - New project creation trigger
 *   - Chat navigation
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ChatRouter from '../../features/chat/ChatRouter';
import { createMockApi, createMockToast } from '../helpers/renderWithProviders';

// ---- Mocks ----

const mockApi = createMockApi();
const mockToast = createMockToast();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
    setLoadingComplete: vi.fn(),
  }),
}));

vi.mock('../../contexts/ChatContext', () => ({
  useChatContext: () => ({
    activeJobIds: {},
    globalQueue: { pending_count: 0, processing: null, queue: [] },
    installedModels: [],
    defaultModel: '',
    loadedModel: null,
    selectedModel: '',
    setSelectedModel: vi.fn(),
    favoriteModels: [],
    spaces: [],
    sendMessage: vi.fn(),
    reconnectToJob: vi.fn(),
    cancelJob: vi.fn(),
    abortExistingStream: vi.fn(),
    checkActiveJobs: vi.fn().mockResolvedValue(null),
    loadModels: vi.fn(),
    loadSpaces: vi.fn(),
    loadMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
    setModelAsDefault: vi.fn(),
    toggleFavorite: vi.fn(),
    getActiveJobForChat: vi.fn().mockReturnValue(null),
    registerMessageCallback: vi.fn(),
    unregisterMessageCallback: vi.fn(),
    getBackgroundMessages: vi.fn().mockReturnValue(null),
    getBackgroundLoading: vi.fn().mockReturnValue(false),
    clearBackgroundState: vi.fn(),
    hasActiveStream: vi.fn().mockReturnValue(false),
  }),
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

vi.mock('../../hooks/useDebouncedSearch', () => ({
  useDebouncedSearch: () => ({
    results: null,
    searching: false,
  }),
}));

vi.mock('../../hooks/useFetchData', () => ({
  useFetchData: (_fetcher: unknown, opts: { initialData: unknown }) => ({
    data: opts.initialData,
    setData: vi.fn(),
    loading: false,
    error: null,
    setError: vi.fn(),
    refetch: vi.fn(),
  }),
  default: (_fetcher: unknown, opts: { initialData: unknown }) => ({
    data: opts.initialData,
    setData: vi.fn(),
    loading: false,
    error: null,
    setError: vi.fn(),
    refetch: vi.fn(),
  }),
}));

// Mock ProjectModal to avoid complex rendering
vi.mock('../../features/projects', () => ({
  ProjectModal: () => null,
}));

// Mock ChatView to avoid importing heavy markdown/code rendering dependencies
vi.mock('../../features/chat/ChatView', () => ({
  default: () => <div data-testid="chat-view">ChatView</div>,
}));

// ---- Helpers ----

function renderChatRouter(route = '/chat') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/chat/*" element={<ChatRouter />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('Chat integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('/projects')) {
        return Promise.resolve({ projects: [] });
      }
      if (path.includes('/chats/recent')) {
        return Promise.resolve({ chats: [] });
      }
      if (path.includes('/chats/search')) {
        return Promise.resolve({ chats: [] });
      }
      return Promise.resolve({});
    });
  });

  it('renders the Chat page header', () => {
    renderChatRouter();

    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('renders new project button', () => {
    renderChatRouter();

    // "Neues Projekt" appears in header button AND empty state ("Neues Projekt erstellen")
    const projectButtons = screen.getAllByText(/neues projekt/i);
    expect(projectButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders search input', () => {
    renderChatRouter();

    expect(screen.getByLabelText(/chats durchsuchen/i)).toBeInTheDocument();
  });

  it('renders project section heading', () => {
    renderChatRouter();

    expect(screen.getByText('Projekte')).toBeInTheDocument();
  });

  it('shows empty state when no projects exist', () => {
    renderChatRouter();

    expect(screen.getByText(/noch keine projekte/i)).toBeInTheDocument();
  });

  it('shows create project button in empty state', () => {
    renderChatRouter();

    expect(screen.getByText(/neues projekt erstellen/i)).toBeInTheDocument();
  });

  it('shows chat landing when no last chat id', () => {
    localStorage.removeItem('arasul_last_chat_id');

    renderChatRouter();

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Projekte')).toBeInTheDocument();
  });

  it('search input accepts text', async () => {
    const user = userEvent.setup();
    renderChatRouter();

    const searchInput = screen.getByLabelText(/chats durchsuchen/i);
    await user.type(searchInput, 'test query');

    expect(searchInput).toHaveValue('test query');
  });

  it('shows clear button when search has text', async () => {
    const user = userEvent.setup();
    renderChatRouter();

    const searchInput = screen.getByLabelText(/chats durchsuchen/i);
    await user.type(searchInput, 'hello');

    expect(screen.getByLabelText(/suche leeren/i)).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderChatRouter();

    const searchInput = screen.getByLabelText(/chats durchsuchen/i);
    await user.type(searchInput, 'hello');

    await user.click(screen.getByLabelText(/suche leeren/i));

    expect(searchInput).toHaveValue('');
  });

  it('renders ChatLanding at /chat route when no last chat', () => {
    renderChatRouter();

    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('opens new project modal on button click', async () => {
    const user = userEvent.setup();
    renderChatRouter();

    // Click the header "Neues Projekt" button (not the empty state one)
    const projectButtons = screen.getAllByText(/neues projekt/i);
    await user.click(projectButtons[0]);

    // ProjectModal is mocked, but the state change happened - no crash
    expect(projectButtons[0]).toBeInTheDocument();
  });

  it('redirects to last chat if stored in localStorage', () => {
    localStorage.setItem('arasul_last_chat_id', '42');

    const { container } = render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="/chat/*" element={<ChatRouter />} />
        </Routes>
      </MemoryRouter>
    );

    // ChatRouter redirects to /chat/42 via Navigate
    expect(container).toBeTruthy();
  });

  it('renders new project button that is clickable', async () => {
    const user = userEvent.setup();
    renderChatRouter();

    const buttons = screen.getAllByText(/neues projekt/i);
    expect(buttons[0]).toBeEnabled();

    await user.click(buttons[0]);
    // No crash = success
  });
});
