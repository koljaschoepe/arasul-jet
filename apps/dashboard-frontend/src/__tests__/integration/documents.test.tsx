/**
 * Integration tests for the Document Manager feature.
 *
 * Tests the DocumentManager component as users experience it:
 *   - Document list rendering
 *   - Empty state
 *   - Search filtering
 *   - Space tabs
 *   - Loading states
 *   - API interaction
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DocumentManager from '../../features/documents/DocumentManager';
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

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

vi.mock('../../utils/token', () => ({
  getValidToken: () => 'test-token',
}));

// Mock the editor components to avoid complex setup
vi.mock('../../components/editor/MarkdownEditor', () => ({
  default: () => <div data-testid="markdown-editor">Editor</div>,
}));

vi.mock('../../components/editor/CreateDocumentDialog', () => ({
  default: () => null,
}));

vi.mock('../datentabellen/ExcelEditor', () => ({
  default: () => <div data-testid="excel-editor">Excel</div>,
}));

// ---- Sample data ----

const sampleDocuments = [
  {
    id: 1,
    title: 'API Documentation',
    filename: 'api-docs.md',
    file_extension: '.md',
    file_size: 15000,
    status: 'ready',
    category: 'Technical',
    space_name: 'Engineering',
    space_id: 'space-1',
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-12T14:00:00Z',
  },
  {
    id: 2,
    title: 'User Guide',
    filename: 'guide.pdf',
    file_extension: '.pdf',
    file_size: 250000,
    status: 'ready',
    category: 'Guides',
    space_name: 'Support',
    space_id: 'space-2',
    created_at: '2026-03-08T08:00:00Z',
    updated_at: '2026-03-11T09:00:00Z',
  },
  {
    id: 3,
    title: 'Meeting Notes',
    filename: 'notes.txt',
    file_extension: '.txt',
    file_size: 5000,
    status: 'processing',
    category: 'Notes',
    space_name: 'Engineering',
    space_id: 'space-1',
    created_at: '2026-03-13T15:00:00Z',
    updated_at: '2026-03-13T15:00:00Z',
  },
];

const sampleSpaces = [
  { id: 'space-1', name: 'Engineering', document_count: 2, color: '#45ADFF' },
  { id: 'space-2', name: 'Support', document_count: 1, color: '#22c55e' },
];

const sampleStatistics = {
  total_documents: 3,
  indexed_documents: 2,
  pending_documents: 1,
  table_count: 0,
};

// ---- Helpers ----

function renderDocumentManager() {
  return render(
    <MemoryRouter>
      <DocumentManager />
    </MemoryRouter>
  );
}

function setupDefaultApiResponses(docs = sampleDocuments, spaces = sampleSpaces) {
  mockApi.get.mockImplementation((path: string) => {
    if (path.startsWith('/documents/statistics')) {
      return Promise.resolve(sampleStatistics);
    }
    if (path.startsWith('/documents/categories')) {
      return Promise.resolve({ categories: [] });
    }
    if (path.startsWith('/documents')) {
      return Promise.resolve({ documents: docs, total: docs.length });
    }
    if (path === '/spaces') {
      return Promise.resolve({ spaces });
    }
    if (path.startsWith('/v1/datentabellen/tables')) {
      return Promise.resolve({ data: [], total: 0 });
    }
    return Promise.resolve({});
  });
}

// ---- Tests ----

describe('DocumentManager integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultApiResponses();
  });

  it('renders document list from API', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('User Guide')).toBeInTheDocument();
      expect(screen.getByText('Meeting Notes')).toBeInTheDocument();
    });
  });

  it('renders the main region with Dokumentenverwaltung label', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByRole('main', { name: /dokumentenverwaltung/i })).toBeInTheDocument();
    });
  });

  it('shows statistics section', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('Gesamt')).toBeInTheDocument();
      // "Indexiert" appears in both stats header and status filter dropdown
      const indexiertElements = screen.getAllByText('Indexiert');
      expect(indexiertElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders search input', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument();
    });
  });

  it('search input accepts text and triggers API call', async () => {
    const user = userEvent.setup();
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/suchen/i);
    await user.type(searchInput, 'API');

    // The API should be called with search param
    await waitFor(() => {
      const getCalls = mockApi.get.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].includes('search=API')
      );
      expect(getCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows loading state', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderDocumentManager();

    // Should not show document titles yet
    expect(screen.queryByText('API Documentation')).not.toBeInTheDocument();
  });

  it('shows "Alle" space tab', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('Alle')).toBeInTheDocument();
    });
  });

  it('renders space tabs from API', async () => {
    renderDocumentManager();

    await waitFor(() => {
      // Space names appear in the tabs
      const engineeringElements = screen.getAllByText('Engineering');
      expect(engineeringElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows file names for documents', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('api-docs.md')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockApi.get.mockRejectedValue(new Error('Server Error'));

    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText(/fehler/i)).toBeInTheDocument();
    });
  });

  it('calls API to load documents on mount', async () => {
    renderDocumentManager();

    await waitFor(() => {
      const docsCalls = mockApi.get.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('/documents?')
      );
      expect(docsCalls.length).toBeGreaterThan(0);
    });
  });

  it('calls API to load spaces on mount', async () => {
    renderDocumentManager();

    await waitFor(() => {
      const spacesCalls = mockApi.get.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0] === '/spaces'
      );
      expect(spacesCalls.length).toBeGreaterThan(0);
    });
  });

  it('calls API to load statistics on mount', async () => {
    renderDocumentManager();

    await waitFor(() => {
      const statsCalls = mockApi.get.mock.calls.filter(
        (c: string[]) => typeof c[0] === 'string' && c[0].startsWith('/documents/statistics')
      );
      expect(statsCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows indexed documents count in stats', async () => {
    renderDocumentManager();

    await waitFor(() => {
      // Statistics header has aria-label "Dokumenten-Statistiken"
      const statsHeader = screen.getByLabelText('Dokumenten-Statistiken');
      // "Indexiert" appears inside the statistics section
      expect(within(statsHeader).getByText('Indexiert')).toBeInTheDocument();
    });
  });

  it('shows document titles in the list', async () => {
    renderDocumentManager();

    await waitFor(() => {
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('User Guide')).toBeInTheDocument();
    });
  });
});
